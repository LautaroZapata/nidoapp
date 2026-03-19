import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export type CategoriaGasto = 'alquiler' | 'suministros' | 'internet' | 'comida' | 'limpieza' | 'otro'

export type AccionNido =
  | { accion: 'crear_gasto';      monto: number; descripcion: string; split: 'igual' | 'personal'; categoria: CategoriaGasto; confirmacion: string }
  | { accion: 'agregar_compra';   items: string[];                                                  confirmacion: string }
  | { accion: 'consultar_balance';                                                                  confirmacion: string }
  | { accion: 'consultar_gastos';                                                                   confirmacion: string }
  | { accion: 'liquidar_deuda';                                                                     confirmacion: string }
  | { accion: 'desconocido';                                                                        confirmacion: string }

const SYSTEM_PROMPT = `Sos NidoApp bot. Devolvé SOLO JSON válido, sin markdown.
Acciones disponibles:
- crear_gasto (hay monto numérico): {"accion":"crear_gasto","monto":N,"descripcion":"...","split":"igual"|"personal","categoria":"alquiler"|"suministros"|"internet"|"comida"|"limpieza"|"otro","confirmacion":"..."}
- agregar_compra (productos sin monto): {"accion":"agregar_compra","items":["..."],"confirmacion":"..."}
- consultar_balance (deudas/balances): {"accion":"consultar_balance","confirmacion":"..."}
- consultar_gastos (historial/lista de gastos): {"accion":"consultar_gastos","confirmacion":"..."}
- liquidar_deuda (pagó una deuda): {"accion":"liquidar_deuda","confirmacion":"..."}
- desconocido: {"accion":"desconocido","confirmacion":"..."}
Reglas:
- split=personal si es solo para una persona; split=igual si es compartido o sin especificar.
- descripcion: sustantivo corto, máximo 3 palabras, sin artículos ni preposiciones. Ejemplos: "pizza", "luz", "super", "delivery sushi", "alquiler". NUNCA pongas frases como "compré una pizza" o "gasté en comida".
- confirmacion: español, con emojis relevantes, amigable y descriptiva. Para gasto: incluí el monto formateado y descripción. Para desconocido: sugerí cómo reformular con ejemplos concretos.`

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
