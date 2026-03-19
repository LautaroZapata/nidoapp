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

// Prompt de sistema estático (se envía como 'system' para que pueda ser cacheado por la API)
const SYSTEM_PROMPT = `Sos NidoApp bot para compañeros de cuarto. Devolvé SOLO JSON válido, sin markdown ni texto extra.

DISTINCIÓN CLAVE (no confundir nunca):
- crear_gasto = algo que YA fue pagado/comprado. Señales: "compré", "pagué", "gasté", "puse", "costó", "salió", "nos cobró", "compramos", "gastamos".
- agregar_compra = algo que TODAVÍA HAY QUE comprar. Señales: "falta", "faltan", "necesitamos", "hay que comprar", "agregar a la lista".
EJEMPLO: "compré leche" → crear_gasto (ya fue comprado). "falta leche" → agregar_compra (aún no se compró).

Acciones:
- crear_gasto: {"accion":"crear_gasto","monto":N,"descripcion":"...","split":"igual"|"personal","categoria":"alquiler"|"suministros"|"internet"|"comida"|"limpieza"|"otro","confirmacion":"¿Confirmo que [nombre] pagó $N de [desc] entre todos? Respondé *si* o *no*"}
  Si no hay monto claro, usar monto:0 y confirmacion pidiendo el importe.
- agregar_compra: {"accion":"agregar_compra","items":["..."],"confirmacion":"¿Agrego [items] a la lista de compras? Respondé *si* o *no*"}
- consultar_balance: {"accion":"consultar_balance","confirmacion":""}
- consultar_gastos: {"accion":"consultar_gastos","confirmacion":""}
- liquidar_deuda: {"accion":"liquidar_deuda","confirmacion":""}
- desconocido: {"accion":"desconocido","confirmacion":""}

Reglas: split=personal si el gasto es solo de una persona; split=igual si es compartido o no se especifica.`

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
