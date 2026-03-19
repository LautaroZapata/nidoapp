import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export type CategoriaGasto = 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'

export type AccionNido =
  | { accion: 'crear_gasto';      monto: number; descripcion: string; split: 'igual' | 'personal' | 'parcial'; split_con?: string[]; categoria: CategoriaGasto; confirmacion: string }
  | { accion: 'agregar_compra';   items: string[];                                                              confirmacion: string }
  | { accion: 'consultar_balance';                                                                              confirmacion: string }
  | { accion: 'consultar_gastos';                                                                               confirmacion: string }
  | { accion: 'liquidar_deuda';                                                                                 confirmacion: string }
  | { accion: 'desconocido';                                                                                    confirmacion: string }

const SYSTEM_PROMPT = `Sos NidoApp bot. Devolvé SOLO JSON válido, sin markdown, sin texto extra.
Acciones disponibles:
- crear_gasto: {"accion":"crear_gasto","monto":N,"descripcion":"...","split":"igual"|"personal"|"parcial","split_con":["nombre"],"categoria":"alquiler"|"suministros"|"internet"|"comida"|"limpieza"|"otro","confirmacion":"..."}
- agregar_compra: {"accion":"agregar_compra","items":["..."],"confirmacion":"..."}
- consultar_balance: {"accion":"consultar_balance","confirmacion":"..."}
- consultar_gastos: {"accion":"consultar_gastos","confirmacion":"..."}
- liquidar_deuda: {"accion":"liquidar_deuda","confirmacion":"..."}
- desconocido: {"accion":"desconocido","confirmacion":"..."}

Reglas de split:
- split=igual: dividir entre TODOS los miembros del nido (cuando no especifica con quién).
- split=personal: solo para quien pagó, sin repartir con nadie (ej: "es mío solo", "gasto personal").
- split=parcial: cuando se menciona dividir solo con algunos miembros (ej: "con kmii", "entre lauta y yo"). split_con debe ser array con los NOMBRES de los otros miembros a incluir (NO el remitente). Si split no es parcial, omitir split_con.

Reglas generales:
- descripcion: sustantivo corto, máximo 3 palabras, sin artículos. Ej: "super", "pizza", "luz", "delivery sushi".
- confirmacion para crear_gasto: usar este formato exacto: "¿Confirmás este gasto?\n\n📌 *{descripcion}*\n💵 ${monto}\n👤 Pagado por: {remitente}\n👥 División: {con quién}\n\nRespondé *si* o *no*"
- confirmacion para agregar_compra: usar este formato: "¿Agregamos a la lista de compras?\n\n{• item1\n• item2}\n\nRespondé *si* o *no*"
- confirmacion para liquidar_deuda: usar este formato: "¿Confirmás que ya pagaste la deuda?\n\nRespondé *si* o *no*"
- confirmacion para desconocido: explicá qué podés hacer con ejemplos concretos. No usar formato de pregunta si no corresponde.
- Nunca hagas una afirmación como respuesta final en confirmacion.`

export async function parsearMensaje(
  mensaje: string,
  remitente: string,
  miembros: string[]
): Promise<AccionNido> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Nido: ${miembros.join(', ')} | Remite: ${remitente}\n"${mensaje}"` },
      ],
      temperature: 0.1,
      max_tokens: 120,
    })

    const raw   = completion.choices[0]?.message?.content?.trim() ?? ''
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    console.log('[Groq] tokens_input:', completion.usage?.prompt_tokens, '| tokens_output:', completion.usage?.completion_tokens)
    return JSON.parse(clean) as AccionNido

  } catch (err: unknown) {
    console.error('[Groq] Error:', err instanceof Error ? err.message : String(err))
    return { accion: 'desconocido', confirmacion: 'Hubo un error procesando tu mensaje. Intentá de nuevo 🙏' }
  }
}
