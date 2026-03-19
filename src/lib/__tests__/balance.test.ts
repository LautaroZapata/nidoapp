import { describe, it, expect } from 'vitest'
import { calcularBalance, desglosarDeuda, EPS } from '../balance'
import type { Gasto, Miembro, Pago } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkMiembro(id: string): Miembro {
  return { id, sala_id: 's1', nombre: id, color: '#000', password_hash: null, salt: null, user_id: null, telefono: null, whatsapp_phone: null, creado_en: '2024-01-01' }
}

function mkGasto(overrides: Partial<Gasto> & { id: string; importe: number; pagado_por: string }): Gasto {
  return {
    sala_id: 's1', descripcion: 'test', tipo: 'variable',
    categoria: 'otro', fecha: '2024-01-01', splits: null, creado_en: '2024-01-01',
    ...overrides,
  }
}

function mkPago(de: string, a: string, importe: number): Pago {
  return { id: `p-${de}-${a}`, sala_id: 's1', de_id: de, a_id: a, importe, nota: null, fecha: '2024-01-01', creado_en: '2024-01-01' }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calcularBalance', () => {
  it('sin gastos ni pagos → net cero para todos', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const { debts, net } = calcularBalance([], m, [])
    expect(debts).toHaveLength(0)
    expect(net.A).toBe(0)
    expect(net.B).toBe(0)
  })

  it('gasto igual entre 2: A paga $1000, B debe $500', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const g = [mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A' })]
    const { debts, net } = calcularBalance(g, m, [])
    expect(net.A).toBeCloseTo(500)
    expect(net.B).toBeCloseTo(-500)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ from: 'B', to: 'A', amount: 500 })
  })

  it('gasto fijo no genera deuda', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const g = [mkGasto({ id: 'g1', importe: 5000, pagado_por: 'A', tipo: 'fijo' })]
    const { debts } = calcularBalance(g, m, [])
    expect(debts).toHaveLength(0)
  })

  it('splits personalizados respetan montos exactos', () => {
    const m = [mkMiembro('A'), mkMiembro('B'), mkMiembro('C')]
    const g = [mkGasto({ id: 'g1', importe: 900, pagado_por: 'A', splits: { A: 200, B: 400, C: 300 } })]
    const { net } = calcularBalance(g, m, [])
    // A pagó 900 pero le corresponde 200 → crédito neto = 700
    expect(net.A).toBeCloseTo(700)
    expect(net.B).toBeCloseTo(-400)
    expect(net.C).toBeCloseTo(-300)
  })

  it('pago directo reduce la deuda', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const g = [mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A' })]
    const p = [mkPago('B', 'A', 500)]
    const { debts } = calcularBalance(g, m, p)
    expect(debts).toHaveLength(0) // B pagó todo lo que debía
  })

  it('EPS absorbe residuo de redondeo: pago $500 contra deuda $499.67 no genera deuda fantasma', () => {
    const m = [mkMiembro('A'), mkMiembro('B'), mkMiembro('C')]
    // Gasto de $1499 dividido entre 3 = $499.67 cada uno
    const g = [mkGasto({ id: 'g1', importe: 1499, pagado_por: 'A' })]
    // B paga exactamente $500 (redondeado)
    const p = [mkPago('B', 'A', 500)]
    const { debts } = calcularBalance(g, m, p)
    // B no debería aparecer como deudor (el residuo es < EPS)
    const deudaB = debts.find(d => d.from === 'B')
    expect(deudaB).toBeUndefined()
  })

  it('3 miembros con múltiples gastos derivan deudas mínimas', () => {
    const m = [mkMiembro('A'), mkMiembro('B'), mkMiembro('C')]
    const gastos = [
      mkGasto({ id: 'g1', importe: 300, pagado_por: 'A' }), // A: +200, B: -100, C: -100
      mkGasto({ id: 'g2', importe: 600, pagado_por: 'B' }), // A: -200, B: +400, C: -200
    ]
    const { net, debts } = calcularBalance(gastos, m, [])
    // A: 200-200=0, B: -100+400=300, C: -100-200=-300
    expect(net.A).toBeCloseTo(0)
    expect(net.B).toBeCloseTo(300)
    expect(net.C).toBeCloseTo(-300)
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ from: 'C', to: 'B', amount: 300 })
  })

  it('todos los gastos de un miembro sin splits cuando splits es 0', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    // splits con A=0 significa que A no participa (gasto solo de B)
    const g = [mkGasto({ id: 'g1', importe: 200, pagado_por: 'A', splits: { A: 0, B: 200 } })]
    const { net, debts } = calcularBalance(g, m, [])
    expect(net.A).toBeCloseTo(200)  // A pagó pero no le corresponde nada
    expect(net.B).toBeCloseTo(-200) // B debe todo
    expect(debts[0]).toMatchObject({ from: 'B', to: 'A', amount: 200 })
  })
})

describe('desglosarDeuda', () => {
  it('devuelve gastos que generaron la deuda de B hacia A', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const gastos = [
      mkGasto({ id: 'g1', importe: 200, pagado_por: 'A' }),
      mkGasto({ id: 'g2', importe: 400, pagado_por: 'A' }),
      mkGasto({ id: 'g3', importe: 300, pagado_por: 'B' }), // B pagó → no genera deuda de B hacia A
    ]
    const result = desglosarDeuda('B', 'A', gastos, m)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.gasto.id)).toContain('g1')
    expect(result.map(r => r.gasto.id)).toContain('g2')
  })

  it('ignora gastos fijos', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const gastos = [
      mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A', tipo: 'fijo' }),
    ]
    const result = desglosarDeuda('B', 'A', gastos, m)
    expect(result).toHaveLength(0)
  })

  it('con splits: solo incluye gastos donde B tiene participación > 0', () => {
    const m = [mkMiembro('A'), mkMiembro('B')]
    const gastos = [
      mkGasto({ id: 'g1', importe: 500, pagado_por: 'A', splits: { A: 250, B: 250 } }),
      mkGasto({ id: 'g2', importe: 300, pagado_por: 'A', splits: { A: 300, B: 0 } }), // B no participa
    ]
    const result = desglosarDeuda('B', 'A', gastos, m)
    expect(result).toHaveLength(1)
    expect(result[0].gasto.id).toBe('g1')
    expect(result[0].monto).toBe(250)
  })
})

describe('EPS', () => {
  it('es 0.5', () => {
    expect(EPS).toBe(0.5)
  })
})

describe('miembro nuevo no hereda gastos anteriores', () => {
  it('miembro que se unió después del gasto no participa en reparto igualitario', () => {
    const mAntiguo = { ...mkMiembro('A'), creado_en: '2024-01-01T10:00:00Z' }
    const mNuevo   = { ...mkMiembro('B'), creado_en: '2024-03-01T10:00:00Z' }
    const g = mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A', creado_en: '2024-01-15T10:00:00Z' })
    const { net, debts } = calcularBalance([g], [mAntiguo, mNuevo], [])
    // B se unió el 1-mar, el gasto se creó el 15-ene → B no debe nada
    expect(net.B).toBe(0)
    expect(debts.find(d => d.from === 'B')).toBeUndefined()
    // A pagó todo y es el único participante → su net es 0
    expect(net.A).toBeCloseTo(0)
  })

  it('miembro que se unió antes del gasto sí participa', () => {
    const mA = { ...mkMiembro('A'), creado_en: '2024-01-01T08:00:00Z' }
    const mB = { ...mkMiembro('B'), creado_en: '2024-01-15T08:00:00Z' }
    const g = mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A', creado_en: '2024-01-15T10:00:00Z' })
    const { net } = calcularBalance([g], [mA, mB], [])
    expect(net.B).toBeCloseTo(-500)
    expect(net.A).toBeCloseTo(500)
  })

  it('miembro que se unió el mismo minuto del gasto queda excluido (joined after expense created)', () => {
    const mA = { ...mkMiembro('A'), creado_en: '2024-01-15T08:00:00Z' }
    const mB = { ...mkMiembro('B'), creado_en: '2024-01-15T10:01:00Z' } // se unió 1 min después del gasto
    const g = mkGasto({ id: 'g1', importe: 1000, pagado_por: 'A', creado_en: '2024-01-15T10:00:00Z' })
    const { net } = calcularBalance([g], [mA, mB], [])
    expect(net.B).toBe(0)
    expect(net.A).toBeCloseTo(0)
  })

  it('desglosarDeuda excluye gastos anteriores al ingreso del deudor', () => {
    const mA = { ...mkMiembro('A'), creado_en: '2024-01-01T10:00:00Z' }
    const mB = { ...mkMiembro('B'), creado_en: '2024-03-01T10:00:00Z' }
    const gastos = [
      mkGasto({ id: 'g1', importe: 200, pagado_por: 'A', creado_en: '2024-01-15T10:00:00Z' }), // antes de que entre B
      mkGasto({ id: 'g2', importe: 400, pagado_por: 'A', creado_en: '2024-03-10T10:00:00Z' }), // después de que entre B
    ]
    const result = desglosarDeuda('B', 'A', gastos, [mA, mB])
    expect(result).toHaveLength(1)
    expect(result[0].gasto.id).toBe('g2')
  })
})
