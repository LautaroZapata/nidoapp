import type { Gasto, Miembro, Pago } from '@/lib/types'

export type Debt = { from: string; to: string; amount: number }

// Epsilon de 0.5 peso: absorbe residuos de redondeo al entero más cercano.
// Sin esto, un pago de $500 contra una deuda de $499.67 deja un residuo de
// -$0.33 que vuelve a aparecer como deuda fantasma.
export const EPS = 0.5

export function calcularBalance(
  gastos: Gasto[],
  miembros: Miembro[],
  pagos: Pago[],
): { debts: Debt[]; net: Record<string, number> } {
  const net: Record<string, number> = {}
  miembros.forEach(m => { net[m.id] = 0 })

  gastos.forEach(g => {
    if (g.tipo === 'fijo') return
    if (!g.pagado_por) return

    const payer = g.pagado_por

    if (!g.splits) {
      const participantes = miembros.filter(m => m.creado_en <= g.creado_en)
      const share = g.importe / (participantes.length || 1)
      net[payer] = (net[payer] ?? 0) + g.importe - share
      participantes.forEach(m => {
        if (m.id !== payer) net[m.id] = (net[m.id] ?? 0) - share
      })
    } else {
      const splits = g.splits as Record<string, number>
      miembros.forEach(m => {
        if (m.id === payer) return
        const owes = splits[m.id] ?? 0
        if (owes <= 0) return
        net[m.id]  = (net[m.id]  ?? 0) - owes
        net[payer] = (net[payer] ?? 0) + owes
      })
    }
  })

  pagos.forEach(p => {
    net[p.de_id] = (net[p.de_id] ?? 0) + p.importe
    net[p.a_id]  = (net[p.a_id]  ?? 0) - p.importe
  })

  const debts: Debt[] = []
  const debtors   = miembros.filter(m => net[m.id] < -EPS).map(m => ({ id: m.id, amt: net[m.id] }))
  const creditors = miembros.filter(m => net[m.id] >  EPS).map(m => ({ id: m.id, amt: net[m.id] }))

  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    const transfer = Math.min(-d.amt, c.amt)
    if (transfer > EPS) {
      debts.push({ from: d.id, to: c.id, amount: Math.round(transfer) })
    }
    d.amt += transfer
    c.amt -= transfer
    if (Math.abs(d.amt) < EPS) i++
    if (Math.abs(c.amt) < EPS) j++
  }

  return { debts, net }
}

export function desglosarDeuda(
  fromId: string,
  toId: string,
  gastos: Gasto[],
  miembros: Miembro[],
): Array<{ gasto: Gasto; monto: number }> {
  const result: Array<{ gasto: Gasto; monto: number }> = []
  for (const g of gastos) {
    if (g.tipo === 'fijo') continue
    if (g.pagado_por !== toId) continue
    let monto: number
    if (!g.splits) {
      const participantes = miembros.filter(m => m.creado_en <= g.creado_en)
      if (!participantes.some(m => m.id === fromId)) continue
      monto = g.importe / (participantes.length || 1)
    } else {
      monto = (g.splits as Record<string, number>)[fromId] ?? 0
      if (monto <= 0) continue
    }
    result.push({ gasto: g, monto })
  }
  return result.sort((a, b) => b.gasto.fecha.localeCompare(a.gasto.fecha))
}

