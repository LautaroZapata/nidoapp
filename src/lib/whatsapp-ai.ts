import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export type CategoriaGasto = 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'

export type AccionNido =
  | { accion: 'crear_gasto';      monto: number; descripcion: string; split: 'igual' | 'personal' | 'parcial'; split_con?: string[]; categoria: CategoriaGasto; confirmacion?: string }
  | { accion: 'agregar_compra';   items: string[];                                                              confirmacion?: string }
  | { accion: 'consultar_balance';                                                                              confirmacion?: string }
  | { accion: 'consultar_gastos';                                                                               confirmacion?: string }
  | { accion: 'liquidar_deuda';                                                                                 confirmacion?: string }
  | { accion: 'desconocido';                                                                                    confirmacion?: string }

const SYSTEM_PROMPT = `Sos NidoApp bot. Devolvé SOLO JSON, sin markdown ni texto extra.

CLAVE: crear_gasto=YA pagado (compré,pagué,gasté,puse,costó,salió). agregar_compra=FALTA comprar (falta,necesitamos,hay que comprar).

Formatos JSON:
crear_gasto: {"accion":"crear_gasto","monto":N,"descripcion":"...","split":"igual|personal|parcial","split_con":["nombre"],"categoria":"alquiler|suministros|internet|comida|limpieza|otro"}
agregar_compra: {"accion":"agregar_compra","items":["..."]}
consultar_balance: {"accion":"consultar_balance"}
consultar_gastos: {"accion":"consultar_gastos"}
liquidar_deuda: {"accion":"liquidar_deuda"}
desconocido: {"accion":"desconocido"}

Split: igual=todos, personal=solo pagador, parcial=algunos→split_con=nombres de los OTROS.
Descripcion: sustantivo corto, max 3 palabras, sin artículos. Sin monto claro→monto:0.`

export async function parsearMensaje(
  mensaje: string,
  remitente: string,
  miembros: string[]
): Promise<AccionNido> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `[${miembros.join(',')}] ${remitente}: ${mensaje}` },
      ],
      temperature: 0.1,
      max_tokens: 80,
    })

    const raw   = completion.choices[0]?.message?.content?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    console.log('[Groq] tokens_input:', completion.usage?.prompt_tokens, '| tokens_output:', completion.usage?.completion_tokens)
    return JSON.parse(clean) as AccionNido

  } catch (err: unknown) {
    console.error('[Groq] Error:', err instanceof Error ? err.message : String(err))
    return { accion: 'desconocido' }
  }
}
