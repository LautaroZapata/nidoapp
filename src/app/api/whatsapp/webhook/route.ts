import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { parsearMensaje, type CategoriaGasto } from '@/lib/whatsapp-ai'

/** Verifica la firma HMAC-SHA256 que Meta envía en cada webhook POST */
async function verificarFirmaMeta(req: NextRequest, rawBody: string): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET no configurado — omitiendo verificación de firma')
    return true // permitir en dev sin la variable
  }
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  if (!signature.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

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

// Cliente admin (service role)
const supabase = createAdminClient()

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await supabase
    .from('whatsapp_link_codes')
    .select('miembro_id, sala_id, miembros(nombre)')
    .eq('code', code)
    .gt('expires_at', ahora)   // que no haya expirado
    .single() as { data: any }

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
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: gastos }, { data: pagos }, { data: miembros }] = await Promise.all([
    supabase.from('gastos').select('*').eq('sala_id', salaId) as any,
    supabase.from('pagos').select('*').eq('sala_id', salaId) as any,
    supabase.from('miembros').select('id, nombre').eq('sala_id', salaId).not('user_id', 'is', null),
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
  const sep = '─────────────────'
  const lines: string[] = [`📊 *Balance del Nido*\n${sep}`]

  miembros.forEach((m: { id: string; nombre: string }) => {
    const val = net[m.id] ?? 0
    if (Math.abs(val) < EPS) {
      lines.push(`• ${m.nombre} ✅ Al día`)
    } else if (val > 0) {
      lines.push(`• ${m.nombre} 💰 Le deben $${Math.round(val).toLocaleString('es-UY')}`)
    } else {
      lines.push(`• ${m.nombre} 📉 Debe $${Math.round(-val).toLocaleString('es-UY')}`)
    }
  })

  lines.push(sep)
  if (Math.abs(miBalance) < EPS) {
    lines.push(`Tu posición: ✅ Al día`)
  } else if (miBalance > 0) {
    lines.push(`Tu posición: Te deben $${Math.round(miBalance).toLocaleString('es-UY')}`)
  } else {
    lines.push(`Tu posición: Debés $${Math.round(-miBalance).toLocaleString('es-UY')}`)
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
  const { error } = await supabase.from('whatsapp_pending_confirmations').insert({ miembro_id: miembroId, accion, expires_at })
  if (error) console.error('[WhatsApp] Error guardando pendiente:', error)
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
    supabase.from('gastos').select('tipo, pagado_por, importe, splits, creado_en').eq('sala_id', salaId),
    supabase.from('pagos').select('de_id, a_id, importe').eq('sala_id', salaId),
    supabase.from('miembros').select('id, creado_en').eq('sala_id', salaId).not('user_id', 'is', null),
  ])
  const net: Record<string, number> = {}
  ;(miembros ?? []).forEach((m: { id: string }) => { net[m.id] = 0 })
  ;(gastos ?? []).forEach((g: { tipo: string; pagado_por: string | null; importe: number; splits: Record<string, number> | null; creado_en: string }) => {
    if (g.tipo === 'fijo' || !g.pagado_por) return
    if (!g.splits) {
      // Solo incluir miembros que existían cuando se creó el gasto
      const participantes = (miembros ?? []).filter((m: { id: string; creado_en: string }) => m.creado_en <= g.creado_en)
      const share = g.importe / (participantes.length || 1)
      net[g.pagado_por] = (net[g.pagado_por] ?? 0) + g.importe - share
      participantes.forEach((m: { id: string }) => {
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
const MAX_MSG_LENGTH = 500

export async function POST(req: NextRequest) {
  // ── Verificar firma de Meta ──
  const rawBody = await req.text()
  const esValido = await verificarFirmaMeta(req, rawBody)
  if (!esValido) {
    console.warn('[WhatsApp] Firma inválida — request rechazado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ status: 'ok' })
  }

  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
  if (!messages || messages.length === 0) return NextResponse.json({ status: 'ok' })

  const mensaje = messages[0]
  const deFono  = String(mensaje?.from ?? '').replace(/\D/g, '') // solo dígitos
  const textoRaw = String(mensaje?.text?.body ?? '').trim()

  // Validar que el número tenga formato válido (7-15 dígitos)
  if (!deFono || !/^\d{7,15}$/.test(deFono)) return NextResponse.json({ status: 'ok' })

  // Limitar longitud del mensaje para evitar prompt injection masivo y DoS
  const texto = textoRaw.slice(0, MAX_MSG_LENGTH)
  if (!texto) return NextResponse.json({ status: 'ok' })

  console.log(`[WhatsApp] mensaje recibido de +${deFono.slice(0, 2)}***`)

  // ── 1. ¿Es un código de vinculación? ──
  const esCodigoLink = /^[A-Z0-9]{6}$/.test(texto.toUpperCase())
  if (esCodigoLink) {
    const nombre = await vincularConCodigo(deFono, texto.toUpperCase())
    if (nombre) {
      await enviarMensaje(deFono, `¡Hola, ${nombre}! 🎉\n\nTu número quedó vinculado exitosamente a *NidoApp*.\n\nDesde acá podés:\n• Registrar gastos: _"pagué 500 en pizza"_\n• Consultar el balance: _"¿cuánto debo?"_\n• Agregar compras: _"falta leche y pan"_\n• Ver gastos recientes: _"ver gastos"_`)
    } else {
      await enviarMensaje(deFono, `⚠️ *Código inválido o expirado*\n\nLos códigos tienen una vigencia de 15 minutos. Para obtener uno nuevo:\n\n1. Abrí la app NidoApp\n2. Ingresá a tu sala\n3. Tocá *"Conectar WhatsApp"*`)
    }
    return NextResponse.json({ status: 'ok' })
  }

  // ── 2. ¿Conocemos a este número? ──
  const miembro = await buscarMiembro(deFono)
  if (!miembro) {
    await enviarMensaje(deFono, `👋 *Hola*\n\nTu número aún no está vinculado a ninguna sala de *NidoApp*.\n\nPara conectarte:\n1. Abrí la app NidoApp\n2. Ingresá a tu sala\n3. Tocá *"Conectar WhatsApp"* e ingresá aquí el código que aparece`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 3. Verificar que la sala tiene plan Pro ──
  const { data: sala } = await supabase
    .from('salas')
    .select('plan_type, subscription_status, subscription_end')
    .eq('id', miembro.sala_id)
    .single()

  const ahora = new Date()
  const esPro = sala?.plan_type === 'pro' &&
    (sala?.subscription_status === 'active' || sala?.subscription_status === 'on_trial') &&
    (!sala?.subscription_end || new Date(sala.subscription_end) > ahora)

  if (!esPro) {
    await enviarMensaje(deFono, `⚠️ *Función exclusiva del plan Pro*\n\nEl bot de WhatsApp no está disponible para tu nido, que se encuentra en el plan gratuito.\n\nPara activarlo, el administrador del nido debe upgradear a *Plan Nido* o *Plan Casa* desde la app NidoApp.`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 4. ¿Hay una confirmación pendiente? ──
  const pendiente = await obtenerPendiente(miembro.id)
  const respuesta = texto.toLowerCase().trim()
  const esConfirmacion = ['si', 'sí', 'yes', 's', 'dale', 'ok', 'confirmo', 'correcto'].includes(respuesta)
  const esCancelacion  = ['no', 'cancelar', 'cancel', 'nope', 'nel'].includes(respuesta)

  if (pendiente) {
    if (esCancelacion) {
      await eliminarPendiente(miembro.id)
      await enviarMensaje(deFono, `✋ *Acción cancelada*\n\nNo se registró ningún cambio. Podés enviarme un nuevo mensaje cuando quieras.`)
      return NextResponse.json({ status: 'ok' })
    }

    if (esConfirmacion) {
      await eliminarPendiente(miembro.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accion = pendiente.accion as any

      if (accion.accion === 'crear_gasto') {
        // Calcular splits según tipo
        let splits: Record<string, number> | null = null
        if (accion.split === 'personal') {
          splits = { [miembro.id]: accion.monto }
        } else if (accion.split === 'parcial' && accion.split_con && accion.split_con.length > 0) {
          const { data: miembrosData } = await supabase
            .from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id).not('user_id', 'is', null)
          if (miembrosData) {
            const splitNombres = (accion.split_con as string[]).map(n => n.toLowerCase().trim())
            const grupo = miembrosData.filter(m => {
              if (m.id === miembro.id) return true
              const mNombre = m.nombre.toLowerCase()
              return splitNombres.some(n =>
                mNombre === n ||
                mNombre.startsWith(n) ||
                n.startsWith(mNombre) ||
                mNombre.includes(n) ||
                n.includes(mNombre)
              )
            })
            if (grupo.length > 1) {
              const porcion = accion.monto / grupo.length
              splits = {}
              grupo.forEach(m => { if (m.id !== miembro.id) splits![m.id] = Math.round(porcion * 100) / 100 })
            }
          }
        }
        // split === 'igual': splits = null (balance calculation uses all members)

        const { error } = await supabase.from('gastos').insert({
          sala_id:     miembro.sala_id,
          descripcion: accion.descripcion,
          importe:     accion.monto,
          categoria:   accion.categoria ?? 'otro',
          pagado_por:  miembro.id,
          tipo:        'variable',
          fecha:       fechaLocalDesdeTelefono(deFono),
          splits,
        })
        if (error) { await enviarMensaje(deFono, `❌ *Error al registrar el gasto*\n\nNo se pudo guardar en este momento. Por favor, intentá nuevamente en unos segundos.`); return NextResponse.json({ status: 'ok' }) }
        const netPost = await calcularNetMiembro(miembro.sala_id, miembro.id)
        const netTxt = Math.abs(netPost) < 0.5 ? '✅ Estás al día con el nido.' : netPost > 0 ? `💰 Tu balance actual: te deben $${Math.round(netPost).toLocaleString('es-UY')}` : `📊 Tu balance actual: debés $${Math.round(-netPost).toLocaleString('es-UY')}`
        await enviarMensaje(deFono, `✅ *Gasto registrado*\n\n📌 ${accion.descripcion}\n💵 $${Math.round(accion.monto).toLocaleString('es-UY')}\n👤 Pagado por: ${miembro.nombre}\n\n${netTxt}`)
      }

      if (accion.accion === 'agregar_compra') {
        const items = accion.items.map((nombre: string) => ({ sala_id: miembro.sala_id, nombre, completado: false }))
        const { error } = await supabase.from('items_compra').insert(items)
        if (error) { await enviarMensaje(deFono, `❌ *Error al actualizar la lista*\n\nNo se pudieron agregar los ítems en este momento. Por favor, intentá nuevamente.`); return NextResponse.json({ status: 'ok' }) }
        await enviarMensaje(deFono, `🛒 *Lista de compras actualizada*\n\nSe agregaron los siguientes ítems:\n${accion.items.map((it: string) => `• ${it}`).join('\n')}`)
      }

      if (accion.accion === 'liquidar_deuda') {
        await supabase.from('pagos').insert({
          sala_id:  miembro.sala_id,
          de_id:    miembro.id,
          a_id:     accion.acreedor_id,
          importe:  Math.round(Math.abs(accion.monto)),
          fecha:    fechaLocalDesdeTelefono(deFono),
        })
        await enviarMensaje(deFono, `💸 *Pago registrado*\n\nTu deuda quedó saldada exitosamente. 🎉\n\nSi el importe no era exacto, podés ajustarlo desde la app NidoApp.`)
      }

      return NextResponse.json({ status: 'ok' })
    }

    // Respondió otra cosa mientras hay pendiente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accionPendiente = pendiente.accion as any

    // Si es un gasto con división pendiente, interpretar la respuesta como elección de split
    if (accionPendiente.accion === 'crear_gasto' && accionPendiente.split_pendiente) {
      await eliminarPendiente(miembro.id)
      const r = respuesta

      const esMio = ['mío', 'mio', 'mía', 'mia', 'solo yo', 'solo mío', 'solo mio', 'personal', 'para mí', 'para mi'].some(k => r.includes(k))

      let splits: Record<string, number> | null = null
      let divisionLabel = 'entre todos'

      if (esMio) {
        splits = { [miembro.id]: accionPendiente.monto }
        divisionLabel = 'gasto personal'
      } else {
        // Intentar matchear nombres de miembros en la respuesta
        const { data: miembrosData } = await supabase.from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id).not('user_id', 'is', null)
        if (miembrosData) {
          const palabras = r.split(/\s+y\s+|\s*,\s*|\s+/).map((s: string) => s.trim()).filter((s: string) => s.length > 1)
          const splitCon = miembrosData.filter((m: { id: string; nombre: string }) => {
            if (m.id === miembro.id) return false
            const mNom = m.nombre.toLowerCase()
            return palabras.some((p: string) => mNom === p || mNom.startsWith(p) || p.startsWith(mNom) || mNom.includes(p) || p.includes(mNom))
          })
          if (splitCon.length > 0) {
            const porcion = accionPendiente.monto / (splitCon.length + 1)
            splits = {}
            splitCon.forEach((m: { id: string; nombre: string }) => { splits![m.id] = Math.round(porcion * 100) / 100 })
            divisionLabel = `con ${splitCon.map((m: { nombre: string }) => m.nombre).join(' y ')}`
          }
        }
      }

      const { error } = await supabase.from('gastos').insert({
        sala_id:     miembro.sala_id,
        descripcion: accionPendiente.descripcion,
        importe:     accionPendiente.monto,
        categoria:   accionPendiente.categoria ?? 'otro',
        pagado_por:  miembro.id,
        tipo:        'variable',
        fecha:       fechaLocalDesdeTelefono(deFono),
        splits,
      })
      if (error) { await enviarMensaje(deFono, `❌ *Error al registrar el gasto*\n\nNo se pudo guardar. Intentá de nuevo.`); return NextResponse.json({ status: 'ok' }) }
      const netPost = await calcularNetMiembro(miembro.sala_id, miembro.id)
      const netTxt = Math.abs(netPost) < 0.5 ? '✅ Estás al día con el nido.' : netPost > 0 ? `💰 Tu balance actual: te deben $${Math.round(netPost).toLocaleString('es-UY')}` : `📊 Tu balance actual: debés $${Math.round(-netPost).toLocaleString('es-UY')}`
      await enviarMensaje(deFono, `✅ *Gasto registrado*\n\n📌 ${accionPendiente.descripcion}\n💵 $${Math.round(accionPendiente.monto).toLocaleString('es-UY')}\n👤 Pagado por: ${miembro.nombre}\n👥 División: ${divisionLabel}\n\n${netTxt}`)
      return NextResponse.json({ status: 'ok' })
    }

    await enviarMensaje(deFono, `⏳ *Acción pendiente de confirmación*\n\nTenés una acción sin confirmar. Por favor respondé:\n• *si* — para confirmar ✅\n• *no* — para cancelar ❌`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 4. Procesar mensaje ──
  const { data: compañeros } = await supabase.from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id).not('user_id', 'is', null)
  const nombresMiembros = (compañeros ?? []).map((m: { nombre: string }) => m.nombre)
  const textoLower = texto.toLowerCase()

  // ── Pre-parsers regex (evitan llamada a IA para los casos más frecuentes) ──

  // 1a. Gasto: "pagué/gasté/puse/costó/compré 500 en/de/por pizza"
  const gastoMatch = textoLower.match(
    /(?:pagu[eé]|gast[eé]|puse|cost[oó]|sali[oó]|compr[eé]|compramos|gastamos)\s+\$?(\d+(?:[.,]\d+)?)\s+(?:en|de|por|a)\s+(.+)/
  )

  // 1b. Gasto orden invertido: "pagué pizza por/de 500"
  const gastoMatchInv = !gastoMatch ? textoLower.match(
    /(?:pagu[eé]|gast[eé]|puse|cost[oó]|sali[oó]|compr[eé]|compramos|gastamos)\s+(.+?)\s+(?:por|de|a)\s+\$?(\d+(?:[.,]\d+)?)$/
  ) : null

  // 2. Compra futura: "falta/faltan/necesitamos X" o "agregar/añadir X a la lista"
  const compraMatch = textoLower.match(
    /^(?:falta[n]?|necesitamos|hay que comprar|agreg[ao]r?|a[ñn]adir?)\s+(.+?)(?:\s+a\s+la\s+lista)?$/
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

  // Detecta "con [nombre(s)]" en el mensaje para aplicar split parcial en pre-parsers
  function detectarSplitParcial(texto: string): { split: 'igual' | 'parcial'; split_con?: string[] } {
    const conMatch = texto.match(/\bcon\s+([\w\s]+?)(?=\s+(?:por|de|a)\s+\$?\d|\s*$)/i)
    if (!conMatch) return { split: 'igual' }
    const mencionados = conMatch[1].toLowerCase().trim().split(/\s+y\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean)
    const splitCon = nombresMiembros.filter(n => {
      const nLow = n.toLowerCase()
      return mencionados.some(m => nLow === m || nLow.startsWith(m) || m.startsWith(nLow) || nLow.includes(m) || m.includes(nLow))
    })
    return splitCon.length > 0 ? { split: 'parcial', split_con: splitCon } : { split: 'igual' }
  }

  let accion: Awaited<ReturnType<typeof parsearMensaje>>

  if (gastoMatch) {
    const monto = parseFloat(gastoMatch[1].replace(',', '.'))
    const desc  = gastoMatch[2].trim()
      .replace(/^(?:una?|el|la|los|las|unos|unas)\s+/i, '')  // quitar artículos al inicio
      .replace(/\s+(?:para|por|de|del|en)\s+.*$/i, '')       // quitar "para/por/de..." al final
      .trim()
    const splitInfo = detectarSplitParcial(textoLower)
    const divTxt = splitInfo.split === 'parcial' ? splitInfo.split_con!.join(' y ') : 'entre todos'
    accion = {
      accion:       'crear_gasto',
      monto,
      descripcion:  desc,
      ...splitInfo,
      categoria:    detectarCategoria(desc),
      confirmacion: `¿Confirmás este gasto?\n\n📌 *${desc}*\n💵 $${Math.round(monto).toLocaleString('es-UY')}\n👤 Pagado por: ${miembro.nombre}\n👥 División: ${divTxt}\n\nRespondé *si* o *no*`,
    }
  } else if (gastoMatchInv) {
    const desc  = gastoMatchInv[1].trim()
    const monto = parseFloat(gastoMatchInv[2].replace(',', '.'))
    const splitInfo = detectarSplitParcial(textoLower)
    const divTxt = splitInfo.split === 'parcial' ? splitInfo.split_con!.join(' y ') : 'entre todos'
    accion = {
      accion:       'crear_gasto',
      monto,
      descripcion:  desc,
      ...splitInfo,
      categoria:    detectarCategoria(desc),
      confirmacion: `¿Confirmás este gasto?\n\n📌 *${desc}*\n💵 $${Math.round(monto).toLocaleString('es-UY')}\n👤 Pagado por: ${miembro.nombre}\n👥 División: ${divTxt}\n\nRespondé *si* o *no*`,
    }
  } else if (compraMatch) {
    const items = compraMatch[1].split(/,\s*|\s+y\s+/).map((i: string) => i.trim()).filter(Boolean)
    accion = {
      accion:       'agregar_compra',
      items,
      confirmacion: `¿Agregamos a la lista de compras?\n\n${items.map((i: string) => `• ${i}`).join('\n')}\n\nRespondé *si* o *no*`,
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
        const msg = miNet > 0.5
          ? `✅ No tenés deudas pendientes.\n\nAl contrario, te deben $${Math.round(miNet).toLocaleString('es-UY')} en total.`
          : `✅ Estás al día, no tenés deudas pendientes.`
        await enviarMensaje(deFono, msg)
      } else {
        await enviarMensaje(deFono, `📊 Tenés una deuda de $${Math.round(Math.abs(miNet)).toLocaleString('es-UY')} en total.\n\nSi ya lo abonaste, escribí _"ya pagué"_ para registrarlo.`)
      }
      return NextResponse.json({ status: 'ok' })
    }
    const respuestaBalance = await consultarBalance(miembro.sala_id, miembro.id)
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
      await enviarMensaje(deFono, `📭 *Sin gastos registrados*\n\nTodavía no hay gastos en el nido. Podés registrar el primero escribiendo, por ejemplo:\n_"pagué 500 en pizza"_`)
      return NextResponse.json({ status: 'ok' })
    }

    const categoriaEmoji: Record<string, string> = {
      alquiler: '🏠', suministros: '💡', internet: '🌐',
      comida: '🍕', limpieza: '🧹', otro: '📦',
    }

    const lines = ['🧾 *Últimos gastos del nido*\n─────────────────']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gastos.forEach((g: any) => {
      const emoji = categoriaEmoji[g.categoria] ?? '📦'
      const quien = Array.isArray(g.miembros) ? (g.miembros[0]?.nombre ?? '?') : (g.miembros?.nombre ?? '?')
      const tipo  = g.splits && Object.keys(g.splits).length === 1 ? 'personal' : 'compartido'
      lines.push(`${emoji} *${g.descripcion}* — $${Math.round(g.importe).toLocaleString('es-UY')}\n   👤 ${quien} · ${tipo}`)
    })

    await enviarMensaje(deFono, lines.join('\n'))
    return NextResponse.json({ status: 'ok' })
  }

  // ── 7. Liquidar deuda (verificar que realmente debe algo) ──
  if (accion.accion === 'liquidar_deuda') {
    const miNet = await calcularNetMiembro(miembro.sala_id, miembro.id)
    if (miNet >= -0.5) {
      await enviarMensaje(deFono, `✅ *Sin deudas pendientes*\n\nEstás al día con todos los miembros del nido.`)
      return NextResponse.json({ status: 'ok' })
    }
    // Encontrar el acreedor principal (quien más le debe)
    const { data: todosNet } = await supabase.from('miembros').select('id, nombre').eq('sala_id', miembro.sala_id)
    // Encontrar el acreedor real: el miembro al que más le debe el usuario
    let acreedorId = ''
    let maxPositivo = 0
    for (const m of (todosNet ?? [])) {
      if (m.id === miembro.id) continue
      const netM = await calcularNetMiembro(miembro.sala_id, m.id)
      if (netM > maxPositivo) {
        maxPositivo = netM
        acreedorId = m.id
      }
    }
    await guardarPendiente(miembro.id, {
      accion: 'liquidar_deuda',
      monto: Math.abs(miNet),
      acreedor_id: acreedorId,
    })
    await enviarMensaje(deFono, `💸 *Confirmar liquidación de deuda*\n\n💵 Monto a saldar: $${Math.round(Math.abs(miNet)).toLocaleString('es-UY')}\n\n¿Confirmás que ya realizaste el pago?\nRespondé *si* o *no*`)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 8. Acciones que requieren confirmación (gasto, compra) ──
  if (accion.accion === 'crear_gasto') {
    // Si el monto es 0 o inválido, pedir aclaración en vez de guardar
    if (!accion.monto || accion.monto <= 0) {
      await enviarMensaje(deFono, `¿Cuánto fue el gasto de "${accion.descripcion}"? 💸\nEjemplo: *pagué 350 de ${accion.descripcion}*`)
      return NextResponse.json({ status: 'ok' })
    }

    // Si el split es "igual" y no fue explícitamente especificado (sin "con X" ni "personal")
    // y hay 3 o más miembros → preguntar antes de guardar para evitar splits incorrectos
    const nMiembros = (compañeros ?? []).length
    const splitAmbiguo = accion.split === 'igual' && nMiembros >= 3

    if (splitAmbiguo) {
      const otrosNombres = (compañeros ?? [])
        .filter(m => m.nombre !== miembro.nombre)
        .map(m => `*${m.nombre}*`)
        .join(', ')
      const ejemploNombre = (compañeros ?? []).find(m => m.nombre !== miembro.nombre)?.nombre ?? 'compañero'
      await guardarPendiente(miembro.id, { ...accion, split_pendiente: true })
      await enviarMensaje(deFono,
        `¿Confirmás este gasto?\n\n📌 *${accion.descripcion}*\n💵 $${Math.round(accion.monto).toLocaleString('es-UY')}\n👤 Pagado por: ${miembro.nombre}\n\n` +
        `👥 *¿Entre quiénes lo dividimos?*\n` +
        `• *si* → entre todos (${otrosNombres} y vos)\n` +
        `• nombre(s) → solo con esos (ej: _${ejemploNombre}_)\n` +
        `• *mío* → solo mi gasto personal\n` +
        `• *no* → cancelar`
      )
    } else {
      await guardarPendiente(miembro.id, accion)
      await enviarMensaje(deFono, accion.confirmacion)
    }
    return NextResponse.json({ status: 'ok' })
  }

  if (accion.accion === 'agregar_compra') {
    await guardarPendiente(miembro.id, accion)
    await enviarMensaje(deFono, accion.confirmacion)
    return NextResponse.json({ status: 'ok' })
  }

  // ── 9. Desconocido ──
  await enviarMensaje(deFono,
    `No entendí bien 🤔\n\n` +
    `Podés decirme:\n` +
    `• *pagué 300 de pizza* → registra un gasto\n` +
    `• *falta leche* → agrega a la lista de compras\n` +
    `• *balance* → ver quién debe qué`
  )
  return NextResponse.json({ status: 'ok' })
}
