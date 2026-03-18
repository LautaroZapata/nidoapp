import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parsearMensaje, type CategoriaGasto } from '@/lib/whatsapp-ai'

// Mapeo de prefijos telefónicos → timezone
// Cubre los países más comunes de habla hispana + otros frecuentes
const PREFIJO_TIMEZONE: Record<string, string> = {
  '54':  'America/Argentina/Buenos_Aires', // Argentina
  '598': 'America/Montevideo',             // Uruguay
  '56':  'America/Santiago',               // Chile
  '591': 'America/La_Paz',                 // Bolivia
  '595': 'America/Asuncion',               // Paraguay
  '51':  'America/Lima',                   // Perú
  '593': 'America/Guayaquil',              // Ecuador
  '57':  'America/Bogota',                 // Colombia
  '58':  'America/Caracas',                // Venezuela
  '507': 'America/Panama',                 // Panamá
  '506': 'America/Costa_Rica',             // Costa Rica
  '502': 'America/Guatemala',              // Guatemala
  '503': 'America/El_Salvador',            // El Salvador
  '504': 'America/Tegucigalpa',            // Honduras
  '505': 'America/Managua',               // Nicaragua
  '52':  'America/Mexico_City',            // México
  '1':   'America/New_York',              // USA / Canadá
  '34':  'Europe/Madrid',                  // España
  '351': 'Europe/Lisbon',                  // Portugal
  '55':  'America/Sao_Paulo',              // Brasil
}

/** Devuelve la fecha local (YYYY-MM-DD) según el prefijo del número de teléfono */
function fechaLocalDesdeTelefono(telefono: string): string {
  // Probamos prefijos de 3, 2 y 1 dígito en ese orden
  const tz =
    PREFIJO_TIMEZONE[telefono.slice(0, 3)] ??
    PREFIJO_TIMEZONE[telefono.slice(0, 2)] ??
    PREFIJO_TIMEZONE[telefono.slice(0, 1)] ??
    'UTC'

  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Envía un mensaje de texto a un número via Meta Cloud API */
async function enviarMensaje(para: string, texto: string) {
  const token         = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'text',
        text: { body: texto },
      }),
    }
  )

  if (!res.ok) {
    const error = await res.json()
    console.error('[WhatsApp] Error al enviar:', error)
  }
}

/**
 * Busca el miembro y sala asociados a un número de teléfono.
 * Devuelve null si el número no está vinculado.
 */
async function buscarMiembro(telefono: string) {
  const { data } = await supabase
    .from('miembros')
    .select('id, nombre, sala_id')
    .eq('whatsapp_phone', telefono)
    .single()

  return data ?? null
}

/**
 * Intenta vincular un número de teléfono usando un código temporal.
 * Devuelve el nombre del miembro si tuvo éxito, null si el código es inválido/expirado.
 */
async function vincularConCodigo(telefono: string, code: string): Promise<string | null> {
  const ahora = new Date().toISOString()

  const { data: link } = await supabase
    .from('whatsapp_link_codes')
    .select('miembro_id, sala_id, miembros(nombre)')
    .eq('code', code)
    .gt('expires_at', ahora)   // que no haya expirado
    .single()

  if (!link) return null

  // Guardamos el teléfono en el miembro
  await supabase
    .from('miembros')
    .update({ whatsapp_phone: telefono })
    .eq('id', link.miembro_id)

  // Eliminamos el código ya usado
  await supabase
    .from('whatsapp_link_codes')
    .delete()
    .eq('code', code)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nombre = (link.miembros as any)?.nombre ?? 'desconocido'
  return nombre
}

/** Calcula y formatea el balance real de la sala para responder por WhatsApp */
async function consultarBalance(
  salaId: string,
  miembroId: string,
  nombresMiembros: string[],
  miembrosData: { nombre: string }[]
): Promise<string> {
  const [{ data: gastos }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from('gastos').select('*').eq('sala_id', salaId),
    supabase.from('pagos').select('*').eq('sala_id', salaId),
    supabase.from('miembros').select('id, nombre').eq('sala_id', salaId),
  ])

  if (!miembros || miembros.length === 0) return 'No hay miembros en la sala.'

  const EPS = 0.5
  const net: Record<string, number> = {}
  miembros.forEach((m: { id: string }) => { net[m.id] = 0 })

  ;(gastos ?? []).forEach((g: { tipo: string; pagado_por: string | null; importe: number; splits: Record<string, number> | null }) => {
    if (g.tipo === 'fijo' || !g.pagado_por) return
    if (!g.splits) {
      const share = g.importe / miembros.length
      net[g.pagado_por] = (net[g.pagado_por] ?? 0) + g.importe - share
      miembros.forEach((m: { id: string }) => {
        if (m.id !== g.pagado_por) net[m.id] = (net[m.id] ?? 0) - share
      })
    } else {
      miembros.forEach((m: { id: string }) => {
        if (m.id === g.pagado_por) return
        const owes = (g.splits as Record<string, number>)[m.id] ?? 0
        if (owes <= 0) return
        net[m.id] = (net[m.id] ?? 0) - owes
        net[g.pagado_por!] = (net[g.pagado_por!] ?? 0) + owes
      })
    }
  })

  ;(pagos ?? []).forEach((p: { de_id: string; a_id: string; importe: number }) => {
    net[p.de_id] = (net[p.de_id] ?? 0) + p.importe
    net[p.a_id]  = (net[p.a_id]  ?? 0) - p.importe
  })

  const nombrePor = (id: string) => miembros.find((m: { id: string; nombre: string }) => m.id === id)?.nombre ?? id

  const miBalance = net[miembroId] ?? 0
  const lines: string[] = ['📊 *Balance del nido*\n']

  miembros.forEach((m: { id: string; nombre: string }) => {
    const val = net[m.id] ?? 0
    if (Math.abs(val) < EPS) {
      lines.push(`${m.nombre}: ✅ al día`)
    } else if (val > 0) {
      lines.push(`${m.nombre}: le deben $${Math.round(val).toLocaleString('es-UY')}`)
    } else {
      lines.push(`${m.nombre}: debe $${Math.round(-val).toLocaleString('es-UY')}`)
    }
  })

  if (Math.abs(miBalance) >= EPS) {
    lines.push('')
    if (miBalance > 0) {
      lines.push(`🤑 Te deben $${Math.round(miBalance).toLocaleString('es-UY')} en total`)
    } else {
      lines.push(`😬 Debés $${Math.round(-miBalance).toLocaleString('es-UY')} en total`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GET — Verificación del webhook (Meta lo llama una sola vez al registrar)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado')
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// Helpers de confirmaciones pendientes
// ---------------------------------------------------------------------------

async function guardarPendiente(miembroId: string, accion: object) {
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min
  await supabase.from('whatsapp_pending_confirmations').delete().eq('miembro_id', miembroId)
  await supabase.from('whatsapp_pending_confirmations').insert({ miembro_id: miembroId, accion, expires_at })
}

async function obtenerPendiente(miembroId: string) {
  const { data } = await supabase
    .from('whatsapp_pending_confirmations')
    .select('id, accion')
    .eq('miembro_id', miembroId)
    .gt('expires_at', new Date().toISOString())
    .single()
  return data ?? null
}

async function eliminarPendiente(miembroId: string) {
  await supabase.from('whatsapp_pending_confirmations').delete().eq('miembro_id', miembroId)
}

async function calcularNetMiembro(salaId: string, miembroId: string): Promise<number> {
  const [{ data: gastos }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from('gastos').select('tipo, pagado_por, importe, splits').eq('sala_id', salaId),
    supabase.from('pagos').select('de_id, a_id, importe').eq('sala_id', salaId),
    supabase.from('miembros').select('id').eq('sala_id', salaId),
  ])
  const n = miembros?.length ?? 1
  const net: Record<string, number> = {}
  ;(miembros ?? []).forEach((m: { id: string }) => { net[m.id] = 0 })
  ;(gastos ?? []).forEach((g: { tipo: string; pagado_por: string | null; importe: number; splits: Record<string, number> | null }) => {
    if (g.tipo === 'fijo' || !g.pagado_por) return
    if (!g.splits) {
      const share = g.importe / n
      net[g.pagado_por] = (net[g.pagado_por] ?? 0) + g.importe - share
      ;(miembros ?? []).forEach((m: { id: string }) => {
        if (m.id !== g.pagado_por) net[m.id] = (net[m.id] ?? 0) - share
      })
    } else {
      ;(miembros ?? []).forEach((m: { id: string }) => {
        if (m.id === g.pagado_por) return
        const owes = (g.splits as Record<string, number>)[m.id] ?? 0
        if (owes <= 0) return
        net[m.id] = (net[m.id] ?? 0) - owes
        net[g.pagado_por!] = (net[g.pagado_por!] ?? 0) + owes
      })
    }
  })
  ;(pagos ?? []).forEach((p: { de_id: string; a_id: string; importe: number }) => {
    net[p.de_id] = (net[p.de_id] ?? 0) + p.importe
    net[p.a_id]  = (net[p.a_id]  ?? 0) - p.importe
  })
  return net[miembroId] ?? 0
}

// ---------------------------------------------------------------------------
// POST — Recepción de mensajes
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json()

  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
  if (!messages || messages.length === 0) return NextResponse.json({ status: 'ok' })

  const mensaje = messages[0]
  const texto   = mensaje?.text?.body?.trim() ?? ''
  const deFono  = mensaje?.from ?? ''

  if (!texto) return NextResponse.json({ status: 'ok' })

  console.log(`[WhatsApp] De: ${deFono} | Texto: "${texto}"`)

  // ── 1. ¿Es un código de vinculación? ──
  const esCodigoLink = /^[A-Z0-9]{6}$/.test(texto.toUpperCase())
  if (esCodigoLink) {
    const nombre = await vincularConCodigo(deFono, texto.toUpperCase())
    if (nombre) {
      await enviarMensaje(deFono, `¡Hola ${nombre}! 🎉 Tu WhatsApp quedó vinculado a Nido. Ya podés enviarme gastos, compras y consultas directamente desde acá.`)
    } else {
      await enviarMensaje(deFono, `Ese código no es válido o ya expiró. Generá uno nuevo desde la app de Nido. ⏱️`)
    }
    return NextResponse.json({ status: 'ok' })
  }

  // ── 2. ¿Conocemos a este número? ──
  const miembro = await buscarMiembro(deFono)
  if (!miembro) {
    await enviarMensaje(deFono, `Hola! Todavía no vinculé tu número con Nido. 👋\n\nAbrí la app, andá a tu sala y tocá "Conectar WhatsApp" para obtener tu código.`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 3. ¿Hay una confirmación pendiente? ──
  const pendiente = await obtenerPendiente(miembro.id)
  const respuesta = texto.toLowerCase().trim()
  const esConfirmacion = ['si', 'sí', 'yes', 's', 'dale', 'ok', 'confirmo', 'correcto'].includes(respuesta)
  const esCancelacion  = ['no', 'cancelar', 'cancel', 'nope', 'nel'].includes(respuesta)

  if (pendiente) {
    if (esCancelacion) {
      await eliminarPendiente(miembro.id)
      await enviarMensaje(deFono, `Cancelado ✋ No se registró nada.`)
      return NextResponse.json({ status: 'ok' })
    }

    if (esConfirmacion) {
      await eliminarPendiente(miembro.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accion = pendiente.accion as any

      if (accion.accion === 'crear_gasto') {
        const { error } = await supabase.from('gastos').insert({
          sala_id:     miembro.sala_id,
          descripcion: accion.descripcion,
          importe:     accion.monto,
          categoria:   accion.categoria ?? 'otro',
          pagado_por:  miembro.id,
          tipo:        'variable',
          fecha:       fechaLocalDesdeTelefono(deFono),
          splits:      accion.split === 'personal' ? { [miembro.id]: accion.monto } : null,
        })
        if (error) { await enviarMensaje(deFono, `Hubo un error al guardar el gasto 😓`); return NextResponse.json({ status: 'ok' }) }
        await enviarMensaje(deFono, `✅ Gasto guardado correctamente.`)
      }

      if (accion.accion === 'agregar_compra') {
        const items = accion.items.map((nombre: string) => ({ sala_id: miembro.sala_id, nombre, completado: false }))
        const { error } = await supabase.from('items_compra').insert(items)
        if (error) { await enviarMensaje(deFono, `Hubo un error al guardar la compra 😓`); return NextResponse.json({ status: 'ok' }) }
        await enviarMensaje(deFono, `✅ Items agregados a la lista de compras.`)
      }

      if (accion.accion === 'liquidar_deuda') {
        await supabase.from('pagos').insert({
          sala_id:  miembro.sala_id,
          de_id:    miembro.id,
          a_id:     accion.acreedor_id,
          importe:  Math.round(Math.abs(accion.monto)),
          fecha:    fechaLocalDesdeTelefono(deFono),
        })
        await enviarMensaje(deFono, `✅ Liquidación registrada. ¡Estás al día! 🎉`)
      }

      return NextResponse.json({ status: 'ok' })
    }

    // Respondió otra cosa mientras hay pendiente
    await enviarMensaje(deFono, `Tenés una acción pendiente de confirmar. Respondé *si* para confirmar o *no* para cancelar.`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 4. Procesar mensaje ──
  const { data: compañeros } = await supabase.from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id)
  const nombresMiembros = (compañeros ?? []).map((m: { nombre: string }) => m.nombre)
  const textoLower = texto.toLowerCase()

  // ── Pre-parsers regex (evitan llamada a IA para los casos más frecuentes) ──

  // 1. Gasto simple: "pagué/gasté/puse/costó 500 en/de/por pizza"
  const gastoMatch = textoLower.match(
    /(?:pagu[eé]|gast[eé]|puse|cost[oó]|salió|salio)\s+\$?(\d+(?:[.,]\d+)?)\s+(?:en|de|por)\s+(.+)/
  )

  // 2. Compra simple: "falta/faltan/necesitamos X" o "agregar/añadir X a la lista"
  const compraMatch = textoLower.match(
    /^(?:falta|faltan|necesitamos|hay que comprar|agreg[ao]r?|a[ñn]adir?)\s+(.+?)(?:\s+a\s+la\s+lista)?$/
  )

  // 3. Keywords de balance
  const esBalance = [
    'cuánto debo', 'cuanto debo', 'le debo algo', 'debo algo', 'debo plata',
    'cuánto me deben', 'cuanto me deben', 'me deben algo',
    'cómo estamos', 'como estamos', 'quién debe', 'quien debe',
    'balance', 'resumen', 'hay deudas', 'estamos al día', 'estamos al dia',
  ].some(k => textoLower.includes(k))

  const preguntaSiDebe = [
    'cuánto debo', 'cuanto debo', 'debo algo', 'le debo algo', 'debo plata',
  ].some(k => textoLower.includes(k))

  // 4. Keywords de gastos
  const esGastos = [
    'mis gastos', 'gastos registrados', 'gastos que tengo', 'ver gastos',
    'listar gastos', 'gastos del nido', 'gastos recientes', 'qué gastos',
    'que gastos', 'mostrar gastos', 'gastos del mes', 'historial de gastos',
    'cuáles son los gastos', 'cuales son los gastos', 'gastos hay',
    'decirme mis gastos', 'decime los gastos',
  ].some(k => textoLower.includes(k))

  // 5. Keywords de liquidación
  const esLiquidacion = [
    'liquidé', 'liquide', 'ya pagué', 'ya pague', 'saldé', 'salde',
    'pagué la deuda', 'pague la deuda', 'ya está todo pago', 'ya esta todo pago',
    'pagamos todo', 'estamos al día', 'saldar',
  ].some(k => textoLower.includes(k))

  // ── Resolver acción sin IA cuando es posible ──
  function detectarCategoria(desc: string): CategoriaGasto {
    const d = desc.toLowerCase()
    if (/alquiler|renta|rent/.test(d))                                    return 'alquiler'
    if (/luz|gas|agua|electricidad|suministro|factura/.test(d))           return 'suministros'
    if (/internet|wifi|fibra/.test(d))                                    return 'internet'
    if (/comida|super|mercado|pizza|resto|delivery|sushi|feria/.test(d))  return 'comida'
    if (/limpieza|detergente|escoba|trapo|lavandina/.test(d))             return 'limpieza'
    return 'otro'
  }

  let accion: Awaited<ReturnType<typeof parsearMensaje>>

  if (gastoMatch) {
    const monto = parseFloat(gastoMatch[1].replace(',', '.'))
    const desc  = gastoMatch[2].trim()
    accion = {
      accion:       'crear_gasto',
      monto,
      descripcion:  desc,
      split:        'igual',
      categoria:    detectarCategoria(desc),
      confirmacion: `¿Confirmo que ${miembro.nombre} pagó $${Math.round(monto).toLocaleString('es-UY')} de ${desc} entre todos? Respondé *si* o *no*`,
    }
  } else if (compraMatch) {
    const items = compraMatch[1].split(/,\s*|\s+y\s+/).map((i: string) => i.trim()).filter(Boolean)
    accion = {
      accion:       'agregar_compra',
      items,
      confirmacion: `¿Agrego ${items.join(', ')} a la lista de compras? Respondé *si* o *no*`,
    }
  } else if (esBalance) {
    accion = { accion: 'consultar_balance', confirmacion: 'Consultando...' }
  } else if (esGastos) {
    accion = { accion: 'consultar_gastos', confirmacion: 'Buscando gastos...' }
  } else if (esLiquidacion) {
    accion = { accion: 'liquidar_deuda', confirmacion: 'Revisando deudas...' }
  } else {
    // Solo llega acá si ningún pre-parser lo capturó
    accion = await parsearMensaje(texto, miembro.nombre, nombresMiembros)
  }

  console.log('[Nido] Acción:', accion.accion)

  // ── 5. Consulta de balance (no necesita confirmación) ──
  if (accion.accion === 'consultar_balance') {
    // Si preguntó específicamente si debe algo, responder directo
    if (preguntaSiDebe) {
      const miNet = await calcularNetMiembro(miembro.sala_id, miembro.id)
      if (miNet >= -0.5) {
        await enviarMensaje(deFono, `No debés nada 😊 Al contrario, te deben $${Math.round(Math.abs(miNet)).toLocaleString('es-UY')}.`)
      } else {
        await enviarMensaje(deFono, `Debés $${Math.round(Math.abs(miNet)).toLocaleString('es-UY')} en total 😬\n\nSi ya lo pagaste, escribí "liquidé mis deudas".`)
      }
      return NextResponse.json({ status: 'ok' })
    }
    const respuestaBalance = await consultarBalance(miembro.sala_id, miembro.id, nombresMiembros, compañeros ?? [])
    await enviarMensaje(deFono, respuestaBalance)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 6. Consultar gastos recientes ──
  if (accion.accion === 'consultar_gastos') {
    const { data: gastos } = await supabase
      .from('gastos')
      .select('descripcion, importe, categoria, fecha, splits, pagado_por, miembros(nombre)')
      .eq('sala_id', miembro.sala_id)
      .eq('tipo', 'variable')
      .order('fecha', { ascending: false })
      .limit(8)

    if (!gastos || gastos.length === 0) {
      await enviarMensaje(deFono, `No hay gastos registrados todavía en el nido. 📭`)
      return NextResponse.json({ status: 'ok' })
    }

    const categoriaEmoji: Record<string, string> = {
      alquiler: '🏠', suministros: '💡', internet: '🌐',
      comida: '🍕', limpieza: '🧹', otro: '📦',
    }

    const lines = ['🧾 *Últimos gastos del nido*\n']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gastos.forEach((g: any) => {
      const emoji = categoriaEmoji[g.categoria] ?? '📦'
      const quien = Array.isArray(g.miembros) ? (g.miembros[0]?.nombre ?? '?') : (g.miembros?.nombre ?? '?')
      const tipo  = g.splits && Object.keys(g.splits).length === 1 ? '(personal)' : '(compartido)'
      lines.push(`${emoji} *${g.descripcion}* — $${Math.round(g.importe).toLocaleString('es-UY')} — ${quien} ${tipo}`)
    })

    await enviarMensaje(deFono, lines.join('\n'))
    return NextResponse.json({ status: 'ok' })
  }

  // ── 7. Liquidar deuda (verificar que realmente debe algo) ──
  if (accion.accion === 'liquidar_deuda') {
    const miNet = await calcularNetMiembro(miembro.sala_id, miembro.id)
    if (miNet >= -0.5) {
      await enviarMensaje(deFono, `No tenés deudas pendientes para liquidar. 😊 Estás al día con todos.`)
      return NextResponse.json({ status: 'ok' })
    }
    // Encontrar el acreedor principal (quien más le debe)
    const { data: todosNet } = await supabase.from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id)
    // Guardamos la liquidación pendiente con el monto y el acreedor
    // Por simplicidad liquidamos la deuda total (el acreedor se resuelve en la app)
    await guardarPendiente(miembro.id, {
      accion: 'liquidar_deuda',
      monto: Math.abs(miNet),
      acreedor_id: (todosNet ?? []).find((m: { id: string }) => m.id !== miembro.id)?.id ?? '',
    })
    await enviarMensaje(deFono, `Tenés una deuda de $${Math.round(Math.abs(miNet)).toLocaleString('es-UY')}. ¿Confirmás que ya la pagaste? Respondé *si* o *no*`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 8. Acciones que requieren confirmación (gasto, compra) ──
  if (accion.accion === 'crear_gasto' || accion.accion === 'agregar_compra') {
    await guardarPendiente(miembro.id, accion)
    await enviarMensaje(deFono, accion.confirmacion)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 9. Desconocido ──
  await enviarMensaje(deFono, accion.confirmacion)
  return NextResponse.json({ status: 'ok' })
}
