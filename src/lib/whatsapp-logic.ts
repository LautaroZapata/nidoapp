import type { CategoriaGasto } from './whatsapp-ai'

export type SplitInfo =
  | { split: 'igual' }
  | { split: 'personal' }
  | { split: 'parcial'; split_con: string[] }

// ── Categoría ──────────────────────────────────────────────────────────────

export function detectarCategoria(desc: string): CategoriaGasto {
  const d = desc.toLowerCase()
  if (/alquiler|renta|rent/.test(d))                                    return 'alquiler'
  if (/luz|gas|agua|electricidad|suministro|factura/.test(d))           return 'suministros'
  if (/internet|wifi|fibra/.test(d))                                    return 'internet'
  if (/comida|super|mercado|pizza|resto|delivery|sushi|feria/.test(d))  return 'comida'
  if (/limpieza|detergente|escoba|trapo|lavandina/.test(d))             return 'limpieza'
  return 'otro'
}

// ── Split parcial ──────────────────────────────────────────────────────────

export function detectarSplitParcial(texto: string, nombresMiembros: string[]): SplitInfo {
  const conMatch = texto.match(/\b(?:solo\s+)?con\s+([\w\s]+?)(?=\s+(?:por|de|a)\s+\$?\d|\s+divid|\s*$)/i)
  if (!conMatch) return { split: 'igual' }
  const mencionados = conMatch[1].toLowerCase().trim().split(/\s+y\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean)
  const splitCon = nombresMiembros.filter(n => {
    const nLow = n.toLowerCase()
    return mencionados.some(m => nLow === m || nLow.startsWith(m) || m.startsWith(nLow) || nLow.includes(m) || m.includes(nLow))
  })
  return splitCon.length > 0 ? { split: 'parcial', split_con: splitCon } : { split: 'igual' }
}

// ── Regex de pre-parsers ───────────────────────────────────────────────────

/** Limpia cláusulas de split del texto para que el regex de gasto matchee */
export function limpiarTextoParaGasto(textoLower: string): string {
  return textoLower
    .replace(/(?:,\s*)?(?:que\s+)?(?:lo\s+)?divid\w*\s+(?:solo\s+)?(?:con|entre)\s+(?:[a-záéíóúüñ]+(?:\s*[,y]\s*[a-záéíóúüñ]+)*)/i, '')
    .replace(/(?:,\s*)?solo\s+con\s+(?:[a-záéíóúüñ]+(?:\s*[,y]\s*[a-záéíóúüñ]+)*)(?:\s+divid\w*)?/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const REGEX_GASTO =
  /(?:pagu[eé]|gast[eé]|puse|cost[oó]|sali[oó]|compr[eé]|compramos|gastamos)\s+\$?(\d+(?:[.,]\d+)?)(?:\s*(?:pesos?|pe|mangos?|lucas?))?\s+(?:en|de|por|a)\s+(.+)/

export const REGEX_GASTO_INV =
  /(?:pagu[eé]|gast[eé]|puse|cost[oó]|sali[oó]|compr[eé]|compramos|gastamos)\s+(.+?)\s+(?:por|de|a)\s+\$?(\d+(?:[.,]\d+)?)(?:\s*(?:pesos?|pe|mangos?|lucas?))?$/

export const REGEX_COMPRA =
  /^(?:falta[n]?|necesitamos|hay que comprar|agreg[ao]r?|a[ñn]adir?)\s+(.+?)(?:\s+a\s+la\s+lista)?$/

// ── Cálculo de splits para DB ──────────────────────────────────────────────

export function calcularSplitsDB(
  splitInfo: SplitInfo,
  miembroId: string,
  monto: number,
  miembrosData: { id: string; nombre: string }[],
  splitNombres?: string[]
): Record<string, number> | null {
  if (splitInfo.split === 'personal') {
    return { [miembroId]: monto }
  }

  if (splitInfo.split === 'parcial') {
    const nombresLower = (splitNombres ?? splitInfo.split_con).map(n => n.toLowerCase().trim())
    const grupo = miembrosData.filter(m => {
      if (m.id === miembroId) return true
      const mNombre = m.nombre.toLowerCase()
      return nombresLower.some(n =>
        mNombre === n || mNombre.startsWith(n) || n.startsWith(mNombre) ||
        mNombre.includes(n) || n.includes(mNombre)
      )
    })
    if (grupo.length > 1) {
      const porcion = monto / grupo.length
      const splits: Record<string, number> = {}
      grupo.forEach(m => { splits[m.id] = Math.round(porcion * 100) / 100 })
      return splits
    }
    return null
  }

  // 'igual' → splits = null (se reparte entre todos)
  return null
}

// ── Keywords ───────────────────────────────────────────────────────────────

export function esComandoAyuda(texto: string): boolean {
  const t = texto.toLowerCase().trim()
  const exactos = ['ayuda', '/ayuda', 'help', '/help', 'comandos', '/comandos', 'menú', 'menu']
  if (exactos.includes(t)) return true
  return ['qué podés hacer', 'que podes hacer', 'qué hacés', 'que haces',
    'qué funciones', 'que funciones', 'para qué servís', 'para que servis'].some(k => t.includes(k))
}

export function esKeywordBalance(texto: string): boolean {
  return [
    'cuánto debo', 'cuanto debo', 'le debo algo', 'debo algo', 'debo plata',
    'cuánto me deben', 'cuanto me deben', 'me deben algo',
    'cómo estamos', 'como estamos', 'quién debe', 'quien debe',
    'balance', 'resumen', 'hay deudas', 'estamos al día', 'estamos al dia',
  ].some(k => texto.includes(k))
}

export function esKeywordGastos(texto: string): boolean {
  return [
    'mis gastos', 'gastos registrados', 'gastos que tengo', 'ver gastos',
    'listar gastos', 'gastos del nido', 'gastos recientes', 'qué gastos',
    'que gastos', 'mostrar gastos', 'gastos del mes', 'historial de gastos',
    'cuáles son los gastos', 'cuales son los gastos', 'gastos hay',
    'decirme mis gastos', 'decime los gastos',
  ].some(k => texto.includes(k))
}

export function esKeywordLiquidacion(texto: string): boolean {
  return [
    'liquidé', 'liquide', 'ya pagué', 'ya pague', 'saldé', 'salde',
    'pagué la deuda', 'pague la deuda', 'ya está todo pago', 'ya esta todo pago',
    'pagamos todo', 'estamos al día', 'saldar',
  ].some(k => texto.includes(k))
}

export function esRespuestaConfirmacion(texto: string): boolean {
  return ['si', 'sí', 'yes', 's', 'dale', 'ok', 'confirmo', 'correcto'].includes(texto.toLowerCase().trim())
}

export function esRespuestaCancelacion(texto: string): boolean {
  return ['no', 'cancelar', 'cancel', 'nope', 'nel'].includes(texto.toLowerCase().trim())
}

// ── Mensaje de confirmación ────────────────────────────────────────────────

export const CAT_EMOJIS: Record<string, string> = {
  alquiler: '🏠', suministros: '💡', internet: '🌐',
  comida: '🍕', limpieza: '🧹', otro: '📦',
}

export function buildGastoConfirmacion(
  desc: string,
  monto: number,
  splitInfo: SplitInfo,
  pagadorNombre: string,
  totalMiembros: number
): string {
  const cat   = detectarCategoria(desc)
  const emoji = CAT_EMOJIS[cat] ?? '📦'
  let divLine: string
  let montoLine: string

  if (splitInfo.split === 'personal') {
    divLine   = 'solo vos (gasto personal)'
    montoLine = `→ $${Math.round(monto).toLocaleString('es-UY')} a tu cargo`
  } else if (splitInfo.split === 'parcial') {
    const n     = splitInfo.split_con.length + 1
    const porc  = Math.round(monto / n)
    divLine   = `vos + ${splitInfo.split_con.join(' y ')} (${n} personas)`
    montoLine = `→ $${porc.toLocaleString('es-UY')} cada uno`
  } else {
    const porc  = Math.round(monto / totalMiembros)
    divLine   = `entre todos (${totalMiembros} personas)`
    montoLine = `→ $${porc.toLocaleString('es-UY')} cada uno`
  }

  return (
    `¿Confirmás este gasto?\n\n` +
    `📌 *${desc}*\n` +
    `💵 $${Math.round(monto).toLocaleString('es-UY')}\n` +
    `${emoji} Categoría: ${cat}\n` +
    `👤 Pagás vos: ${pagadorNombre}\n` +
    `👥 División: ${divLine}\n` +
    `   ${montoLine}\n\n` +
    `Respondé *si* para confirmar o *no* para cancelar`
  )
}
