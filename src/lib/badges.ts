import type { Miembro, Gasto, ItemCompra, Tarea, Piso } from './types'

export interface Badge {
  id: string
  icono: string
  nombre: string
  descripcion: string
}

const BADGE_DEFS = {
  fundador:   { icono: '👑', nombre: 'Fundador', descripcion: 'Primer miembro del nido' },
  limpio:     { icono: '🧹', nombre: 'Limpio', descripcion: 'Más tareas completadas' },
  generoso:   { icono: '💰', nombre: 'Generoso', descripcion: 'Mayor gasto total pagado' },
  proveedor:  { icono: '🛒', nombre: 'Proveedor', descripcion: 'Más items de compra agregados' },
  explorador: { icono: '🏠', nombre: 'Explorador', descripcion: 'Más pisos agregados' },
  puntual:    { icono: '⚡', nombre: 'Al día', descripcion: 'Sin deudas pendientes' },
} as const

export type BadgeId = keyof typeof BADGE_DEFS

export const ALL_BADGE_DEFS: Badge[] = Object.entries(BADGE_DEFS).map(
  ([id, def]) => ({ id, ...def })
)

interface BadgeInput {
  miembros: Miembro[]
  gastos: Gasto[]
  items: ItemCompra[]
  tareas: Tarea[]
  pisos: Piso[]
  deudores: string[]  // IDs de miembros que tienen deuda
}

/** Calcula los badges de cada miembro. Retorna un Map<miembroId, Badge[]>. */
export function calcularBadges(input: BadgeInput): Map<string, Badge[]> {
  const { miembros, gastos, items, tareas, pisos, deudores } = input
  const result = new Map<string, Badge[]>()

  for (const m of miembros) {
    result.set(m.id, [])
  }

  if (miembros.length === 0) return result

  function addBadge(miembroId: string, badgeId: BadgeId) {
    const badges = result.get(miembroId)
    if (badges) badges.push({ id: badgeId, ...BADGE_DEFS[badgeId] })
  }

  // 👑 Fundador: miembro con creado_en más antiguo
  const sorted = [...miembros].sort((a, b) => a.creado_en.localeCompare(b.creado_en))
  if (sorted.length > 0) addBadge(sorted[0].id, 'fundador')

  // 🧹 Limpio: más tareas completadas (mínimo 3)
  if (tareas.length > 0) {
    const completadas = tareas.filter(t => t.completada && t.asignada_a)
    const counts = new Map<string, number>()
    for (const t of completadas) counts.set(t.asignada_a!, (counts.get(t.asignada_a!) ?? 0) + 1)
    if (counts.size > 0) {
      const maxCount = Math.max(...counts.values())
      if (maxCount >= 3) {
        for (const [id, count] of counts) if (count === maxCount) addBadge(id, 'limpio')
      }
    }
  }

  // 💰 Generoso: mayor total pagado en gastos variables (mínimo 1 gasto)
  const gastosVar = gastos.filter(g => g.tipo === 'variable' && g.pagado_por)
  if (gastosVar.length > 0) {
    const totales = new Map<string, number>()
    for (const g of gastosVar) totales.set(g.pagado_por!, (totales.get(g.pagado_por!) ?? 0) + g.importe)
    if (totales.size > 0) {
      const maxTotal = Math.max(...totales.values())
      for (const [id, total] of totales) if (total === maxTotal) addBadge(id, 'generoso')
    }
  }

  // 🛒 Proveedor: más items de compra agregados (mínimo 5)
  if (items.length > 0) {
    const counts = new Map<string, number>()
    for (const i of items) if (i.añadido_por) counts.set(i.añadido_por, (counts.get(i.añadido_por) ?? 0) + 1)
    if (counts.size > 0) {
      const maxCount = Math.max(...counts.values())
      if (maxCount >= 5) {
        for (const [id, count] of counts) if (count === maxCount) addBadge(id, 'proveedor')
      }
    }
  }

  // 🏠 Explorador: más pisos agregados — pisos no tienen campo "agregado_por",
  // así que este badge se omite por ahora (no hay forma de saber quién lo agregó)

  // ⚡ Al día: miembros que no aparecen en la lista de deudores
  const deudorSet = new Set(deudores)
  for (const m of miembros) {
    if (!deudorSet.has(m.id)) addBadge(m.id, 'puntual')
  }

  return result
}
