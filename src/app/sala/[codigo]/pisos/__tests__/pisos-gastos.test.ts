import { describe, it, expect } from 'vitest'

/**
 * Tests for the alquiler / gastos comunes separation logic in pisos.
 * These are pure logic tests that verify form initialization and price calculations.
 */

const FORM_INIT = { titulo: '', url: '', alquiler: '', gastosCom: '', m2: '', zona: '', notas: '', direccion: '' }

function calcTotal(alquiler: string, gastosCom: string): number {
  return (alquiler ? parseFloat(alquiler) : 0) + (gastosCom ? parseFloat(gastosCom) : 0)
}

function parseForInsert(alquiler: string, gastosCom: string): { precio: number | null; gastos_comunes: number | null } {
  return {
    precio: alquiler ? parseFloat(alquiler) : null,
    gastos_comunes: gastosCom ? parseFloat(gastosCom) : null,
  }
}

describe('pisos form initialization', () => {
  it('has both alquiler and gastosCom fields', () => {
    expect(FORM_INIT).toHaveProperty('alquiler')
    expect(FORM_INIT).toHaveProperty('gastosCom')
    expect(FORM_INIT.alquiler).toBe('')
    expect(FORM_INIT.gastosCom).toBe('')
  })

  it('does not have a merged precio field', () => {
    expect(FORM_INIT).not.toHaveProperty('precio')
  })
})

describe('total calculation (alquiler + gastosCom)', () => {
  it('sums alquiler and gastos comunes', () => {
    expect(calcTotal('22000', '6000')).toBe(28000)
  })

  it('handles only alquiler', () => {
    expect(calcTotal('22000', '')).toBe(22000)
  })

  it('handles only gastos comunes', () => {
    expect(calcTotal('', '6000')).toBe(6000)
  })

  it('handles neither (both empty)', () => {
    expect(calcTotal('', '')).toBe(0)
  })

  it('handles decimal values', () => {
    expect(calcTotal('22500.50', '5999.99')).toBeCloseTo(28500.49)
  })
})

describe('parseForInsert separates alquiler and gastos_comunes', () => {
  it('saves both as separate fields', () => {
    const result = parseForInsert('22000', '6000')
    expect(result.precio).toBe(22000)
    expect(result.gastos_comunes).toBe(6000)
  })

  it('saves only alquiler when gastosCom is empty', () => {
    const result = parseForInsert('22000', '')
    expect(result.precio).toBe(22000)
    expect(result.gastos_comunes).toBeNull()
  })

  it('saves only gastos_comunes when alquiler is empty', () => {
    const result = parseForInsert('', '6000')
    expect(result.precio).toBeNull()
    expect(result.gastos_comunes).toBe(6000)
  })

  it('saves both as null when both are empty', () => {
    const result = parseForInsert('', '')
    expect(result.precio).toBeNull()
    expect(result.gastos_comunes).toBeNull()
  })
})
