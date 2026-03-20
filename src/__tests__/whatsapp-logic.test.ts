import { describe, it, expect } from 'vitest'
import {
  detectarCategoria,
  detectarSplitParcial,
  limpiarTextoParaGasto,
  calcularSplitsDB,
  buildGastoConfirmacion,
  esComandoAyuda,
  esKeywordBalance,
  esKeywordGastos,
  esKeywordLiquidacion,
  esRespuestaConfirmacion,
  esRespuestaCancelacion,
  REGEX_GASTO,
  REGEX_GASTO_INV,
  REGEX_COMPRA,
} from '@/lib/whatsapp-logic'

// ─────────────────────────────────────────────────────────────────────────────
// detectarCategoria
// ─────────────────────────────────────────────────────────────────────────────
describe('detectarCategoria', () => {
  it('detecta alquiler', () => {
    expect(detectarCategoria('alquiler')).toBe('alquiler')
    expect(detectarCategoria('renta del depto')).toBe('alquiler')
  })

  it('detecta suministros', () => {
    expect(detectarCategoria('luz')).toBe('suministros')
    expect(detectarCategoria('factura de gas')).toBe('suministros')
    expect(detectarCategoria('agua corriente')).toBe('suministros')
  })

  it('detecta internet', () => {
    expect(detectarCategoria('internet')).toBe('internet')
    expect(detectarCategoria('wifi mensual')).toBe('internet')
  })

  it('detecta comida', () => {
    expect(detectarCategoria('pizza')).toBe('comida')
    expect(detectarCategoria('super mercado')).toBe('comida')
    expect(detectarCategoria('delivery sushi')).toBe('comida')
    expect(detectarCategoria('comida china')).toBe('comida')
  })

  it('detecta limpieza', () => {
    expect(detectarCategoria('detergente')).toBe('limpieza')
    expect(detectarCategoria('escoba y trapo')).toBe('limpieza')
    expect(detectarCategoria('lavandina')).toBe('limpieza')
  })

  it('devuelve otro por defecto', () => {
    expect(detectarCategoria('taxi')).toBe('otro')
    expect(detectarCategoria('shampoo')).toBe('otro')
    expect(detectarCategoria('')).toBe('otro')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectarSplitParcial
// ─────────────────────────────────────────────────────────────────────────────
describe('detectarSplitParcial', () => {
  const miembros = ['Lauta', 'Cami', 'Sofi']

  it('retorna igual cuando no hay "con"', () => {
    expect(detectarSplitParcial('compré pizza por 80', miembros)).toEqual({ split: 'igual' })
    expect(detectarSplitParcial('pagué 500 en super', miembros)).toEqual({ split: 'igual' })
  })

  it('detecta split parcial con un miembro', () => {
    const r = detectarSplitParcial('compré un pure con cami por 80', miembros)
    expect(r.split).toBe('parcial')
    expect((r as any).split_con).toContain('Cami')
  })

  it('detecta split parcial por nombre abreviado / parcial', () => {
    const r = detectarSplitParcial('pizzas con sofi por 200', miembros)
    expect(r.split).toBe('parcial')
    expect((r as any).split_con).toContain('Sofi')
  })

  it('retorna igual cuando el nombre mencionado no está en el nido', () => {
    const r = detectarSplitParcial('compré con rodrigo por 100', miembros)
    expect(r.split).toBe('igual')
  })

  it('detecta split con varios miembros', () => {
    const r = detectarSplitParcial('compré con cami y sofi por 300', miembros)
    expect(r.split).toBe('parcial')
    const splitCon = (r as any).split_con as string[]
    expect(splitCon).toContain('Cami')
    expect(splitCon).toContain('Sofi')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// limpiarTextoParaGasto
// ─────────────────────────────────────────────────────────────────────────────
describe('limpiarTextoParaGasto', () => {
  it('elimina cláusula "que divido con"', () => {
    const r = limpiarTextoParaGasto('compré un pure que divido solo con cami por 80')
    expect(r).not.toContain('divido')
    expect(r).not.toContain('con cami')
    expect(r).toContain('pure')
    expect(r).toContain('80')
  })

  it('elimina cláusula "solo con"', () => {
    const r = limpiarTextoParaGasto('gasté 200 en pizza solo con sofi')
    expect(r).not.toContain('solo con')
    expect(r).toContain('pizza')
  })

  it('no modifica texto sin cláusula de split', () => {
    const r = limpiarTextoParaGasto('pagué 500 en super')
    expect(r).toBe('pagué 500 en super')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGEX_GASTO
// ─────────────────────────────────────────────────────────────────────────────
describe('REGEX_GASTO', () => {
  const casos: [string, number, string][] = [
    ['pagué 500 en pizza',           500,  'pizza'],
    ['gasté 80 en pure',              80,  'pure'],
    ['compré 300 de detergente',     300,  'detergente'],
    ['puse 1500 en alquiler',       1500,  'alquiler'],
    ['costó 250 en delivery',        250,  'delivery'],
    ['salió 100 por sushi',          100,  'sushi'],
    ['compramos 600 en super',       600,  'super'],
    ['gastamos 400 a la feria',      400,  'feria'],
    ['pagué $200 en comida',         200,  'comida'],
    // Nota: "1.500" se parsea como 1.5 (no como 1500) — el bot no soporta separador de miles con punto
    ['compré 80,50 en pan',         80.5,  'pan'],
  ]

  casos.forEach(([msg, monto, desc]) => {
    it(`parsea "${msg}"`, () => {
      const m = msg.match(REGEX_GASTO)
      expect(m).not.toBeNull()
      expect(parseFloat(m![1].replace(',', '.'))).toBeCloseTo(monto, 1)
      expect(m![2]).toContain(desc)
    })
  })

  it('no hace match en frases que no son gastos', () => {
    expect('falta leche'.match(REGEX_GASTO)).toBeNull()
    expect('cuánto debo'.match(REGEX_GASTO)).toBeNull()
    expect('pizza por favor'.match(REGEX_GASTO)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGEX_GASTO_INV (orden invertido)
// ─────────────────────────────────────────────────────────────────────────────
describe('REGEX_GASTO_INV', () => {
  const casos: [string, string, number][] = [
    ['pagué pizza por 500',       'pizza',      500],
    ['compré detergente de 300',  'detergente', 300],
    ['gasté sushi a 800',         'sushi',      800],
  ]

  casos.forEach(([msg, desc, monto]) => {
    it(`parsea "${msg}"`, () => {
      const m = msg.match(REGEX_GASTO_INV)
      expect(m).not.toBeNull()
      expect(m![1].trim()).toContain(desc)
      expect(parseFloat(m![2].replace(',', '.'))).toBeCloseTo(monto, 1)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGEX_COMPRA
// ─────────────────────────────────────────────────────────────────────────────
describe('REGEX_COMPRA', () => {
  it('detecta "falta X"', () => {
    expect('falta leche'.match(REGEX_COMPRA)).not.toBeNull()
    expect('faltan huevos'.match(REGEX_COMPRA)).not.toBeNull()
  })

  it('detecta "necesitamos X"', () => {
    expect('necesitamos pan y jabón'.match(REGEX_COMPRA)).not.toBeNull()
  })

  it('detecta "agregar X a la lista"', () => {
    expect('agregar papel a la lista'.match(REGEX_COMPRA)).not.toBeNull()
    expect('agregar azúcar'.match(REGEX_COMPRA)).not.toBeNull()
  })

  it('no hace match en frases de gastos', () => {
    expect('pagué 500 en pizza'.match(REGEX_COMPRA)).toBeNull()
    expect('balance'.match(REGEX_COMPRA)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calcularSplitsDB
// ─────────────────────────────────────────────────────────────────────────────
describe('calcularSplitsDB', () => {
  const SENDER = 'sender-id'
  const CAMI   = 'cami-id'
  const SOFI   = 'sofi-id'
  const miembros = [
    { id: SENDER, nombre: 'Lauta' },
    { id: CAMI,   nombre: 'Cami'  },
    { id: SOFI,   nombre: 'Sofi'  },
  ]

  it('split igual → retorna null', () => {
    expect(calcularSplitsDB({ split: 'igual' }, SENDER, 300, miembros)).toBeNull()
  })

  it('split personal → solo el sender', () => {
    const splits = calcularSplitsDB({ split: 'personal' }, SENDER, 200, miembros)
    expect(splits).toEqual({ [SENDER]: 200 })
  })

  it('split parcial → incluye al sender Y al otro miembro', () => {
    const splits = calcularSplitsDB(
      { split: 'parcial', split_con: ['Cami'] },
      SENDER, 80, miembros
    )
    expect(splits).not.toBeNull()
    expect(splits![SENDER]).toBeCloseTo(40, 1)
    expect(splits![CAMI]).toBeCloseTo(40, 1)
    expect(splits![SOFI]).toBeUndefined()  // sofi no está en este gasto
  })

  it('split parcial con 3 personas → divide en tercios', () => {
    const splits = calcularSplitsDB(
      { split: 'parcial', split_con: ['Cami', 'Sofi'] },
      SENDER, 90, miembros
    )
    expect(splits![SENDER]).toBeCloseTo(30, 1)
    expect(splits![CAMI]).toBeCloseTo(30, 1)
    expect(splits![SOFI]).toBeCloseTo(30, 1)
  })

  it('split parcial → hace fuzzy matching por nombre', () => {
    const splits = calcularSplitsDB(
      { split: 'parcial', split_con: ['cam'] },   // abreviatura
      SENDER, 100, miembros
    )
    expect(splits).not.toBeNull()
    expect(splits![CAMI]).toBeCloseTo(50, 1)
    expect(splits![SENDER]).toBeCloseTo(50, 1)
  })

  it('split parcial sin match → retorna null', () => {
    const splits = calcularSplitsDB(
      { split: 'parcial', split_con: ['Rodrigo'] },  // no existe
      SENDER, 100, miembros
    )
    // grupo solo tendría al sender → length < 2 → null
    expect(splits).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Keywords
// ─────────────────────────────────────────────────────────────────────────────
describe('esComandoAyuda', () => {
  it('detecta exactos', () => {
    expect(esComandoAyuda('ayuda')).toBe(true)
    expect(esComandoAyuda('/ayuda')).toBe(true)
    expect(esComandoAyuda('help')).toBe(true)
    expect(esComandoAyuda('menu')).toBe(true)
    expect(esComandoAyuda('comandos')).toBe(true)
  })

  it('detecta frases', () => {
    expect(esComandoAyuda('que podes hacer')).toBe(true)
    expect(esComandoAyuda('qué funciones tenés')).toBe(true)
  })

  it('no hace match en mensajes normales', () => {
    expect(esComandoAyuda('pagué 500 en pizza')).toBe(false)
    expect(esComandoAyuda('balance')).toBe(false)
    expect(esComandoAyuda('me ayudas con el gasto')).toBe(false)
  })
})

describe('esKeywordBalance', () => {
  it('detecta keywords de balance', () => {
    expect(esKeywordBalance('cuanto debo')).toBe(true)
    expect(esKeywordBalance('balance')).toBe(true)
    expect(esKeywordBalance('cuánto me deben')).toBe(true)
    expect(esKeywordBalance('como estamos')).toBe(true)
  })

  it('no hace match en otros mensajes', () => {
    expect(esKeywordBalance('pagué pizza')).toBe(false)
    expect(esKeywordBalance('falta leche')).toBe(false)
  })
})

describe('esKeywordGastos', () => {
  it('detecta keywords de gastos', () => {
    expect(esKeywordGastos('ver gastos')).toBe(true)
    expect(esKeywordGastos('gastos del mes')).toBe(true)
    expect(esKeywordGastos('gastos recientes')).toBe(true)
    expect(esKeywordGastos('historial de gastos')).toBe(true)
  })

  it('no hace match en otros mensajes', () => {
    expect(esKeywordGastos('pagué 500 en pizza')).toBe(false)
  })
})

describe('esKeywordLiquidacion', () => {
  it('detecta keywords de liquidación', () => {
    expect(esKeywordLiquidacion('ya pagué')).toBe(true)
    expect(esKeywordLiquidacion('liquidé la deuda')).toBe(true)
    expect(esKeywordLiquidacion('saldar')).toBe(true)
    expect(esKeywordLiquidacion('saldé todo')).toBe(true)
  })

  it('no hace match en otros mensajes', () => {
    expect(esKeywordLiquidacion('pagué pizza')).toBe(false)
    expect(esKeywordLiquidacion('balance')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Respuestas de confirmación / cancelación
// ─────────────────────────────────────────────────────────────────────────────
describe('esRespuestaConfirmacion', () => {
  it('reconoce afirmaciones', () => {
    expect(esRespuestaConfirmacion('si')).toBe(true)
    expect(esRespuestaConfirmacion('sí')).toBe(true)
    expect(esRespuestaConfirmacion('dale')).toBe(true)
    expect(esRespuestaConfirmacion('ok')).toBe(true)
    expect(esRespuestaConfirmacion('confirmo')).toBe(true)
    expect(esRespuestaConfirmacion('SI')).toBe(true)   // case insensitive
  })

  it('no confunde con otros mensajes', () => {
    expect(esRespuestaConfirmacion('no')).toBe(false)
    expect(esRespuestaConfirmacion('tal vez')).toBe(false)
    expect(esRespuestaConfirmacion('pagué 500')).toBe(false)
  })
})

describe('esRespuestaCancelacion', () => {
  it('reconoce negaciones', () => {
    expect(esRespuestaCancelacion('no')).toBe(true)
    expect(esRespuestaCancelacion('cancelar')).toBe(true)
    expect(esRespuestaCancelacion('nope')).toBe(true)
    expect(esRespuestaCancelacion('NO')).toBe(true)   // case insensitive
  })

  it('no confunde con otros mensajes', () => {
    expect(esRespuestaCancelacion('si')).toBe(false)
    expect(esRespuestaCancelacion('pagué pizza')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildGastoConfirmacion
// ─────────────────────────────────────────────────────────────────────────────
describe('buildGastoConfirmacion', () => {
  it('split igual → muestra "entre todos" con monto por persona', () => {
    const msg = buildGastoConfirmacion('pizza', 300, { split: 'igual' }, 'Lauta', 3)
    expect(msg).toContain('pizza')
    expect(msg).toContain('300')
    expect(msg).toContain('entre todos (3 personas)')
    expect(msg).toContain('100')  // 300/3
    expect(msg).toContain('Lauta')
    expect(msg).toContain('🍕')
    expect(msg).toContain('Respondé *si*')
  })

  it('split parcial → muestra "vos + nombre" con monto por persona', () => {
    const msg = buildGastoConfirmacion('pure', 80, { split: 'parcial', split_con: ['Cami'] }, 'Lauta', 3)
    expect(msg).toContain('vos + Cami (2 personas)')
    expect(msg).toContain('40')  // 80/2
    expect(msg).toContain('Lauta')
  })

  it('split personal → muestra "solo vos"', () => {
    const msg = buildGastoConfirmacion('taxi', 500, { split: 'personal' }, 'Lauta', 3)
    expect(msg).toContain('solo vos')
    expect(msg).toContain('500')
    expect(msg).not.toContain('entre todos')
  })

  it('incluye emoji de categoría correcto', () => {
    expect(buildGastoConfirmacion('alquiler', 1000, { split: 'igual' }, 'X', 2)).toContain('🏠')
    expect(buildGastoConfirmacion('luz', 200, { split: 'igual' }, 'X', 2)).toContain('💡')
    expect(buildGastoConfirmacion('wifi', 300, { split: 'igual' }, 'X', 2)).toContain('🌐')
    expect(buildGastoConfirmacion('detergente', 80, { split: 'igual' }, 'X', 2)).toContain('🧹')
  })

  it('redondea correctamente montos no exactos', () => {
    const msg = buildGastoConfirmacion('pizza', 100, { split: 'parcial', split_con: ['Cami', 'Sofi'] }, 'Lauta', 3)
    // 100 / 3 = 33 redondeado
    expect(msg).toContain('33')
  })
})
