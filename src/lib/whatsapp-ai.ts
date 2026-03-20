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

const SYSTEM_PROMPT = `Sos NidoApp bot para compañeros de cuarto. Devolvé SOLO JSON válido, sin markdown, sin texto extra.

DISTINCIÓN CLAVE (no confundir nunca):
- crear_gasto = algo que YA fue pagado/comprado. Señales: "compré", "pagué", "gasté", "puse", "costó", "salió", "nos cobró", "compramos", "gastamos".
- agregar_compra = algo que TODAVÍA HAY QUE comprar. Señales: "falta", "faltan", "necesitamos", "hay que comprar", "agregar a la lista".
EJEMPLO: "compré leche" → crear_gasto (ya fue comprado). "falta leche" → agregar_compra (aún no se compró).

Acciones disponibles:
- crear_gasto: {"accion":"crear_gasto","monto":N,"descripcion":"...","split":"igual"|"personal"|"parcial","split_con":["nombre"],"categoria":"alquiler"|"suministros"|"internet"|"comida"|"limpieza"|"otro","confirmacion":"..."}
  Si no hay monto claro, usar monto:0 y pedir el importe en confirmacion.
- agregar_compra: {"accion":"agregar_compra","items":["..."],"confirmacion":"..."}
- consultar_balance: {"accion":"consultar_balance","confirmacion":"..."}
- consultar_gastos: {"accion":"consultar_gastos","confirmacion":"..."}
- liquidar_deuda: {"accion":"liquidar_deuda","confirmacion":"..."}
- desconocido: {"accion":"desconocido","confirmacion":"..."}

Reglas de split:
- split=igual: dividir entre TODOS (cuando no especifica con quién).
- split=personal: solo para quien pagó, sin repartir.
- split=parcial: dividir solo con algunos (ej: "con kmii", "entre lauta y yo"). split_con = array con nombres de los OTROS miembros a incluir.

Reglas generales:
- descripcion: sustantivo corto, máximo 3 palabras, sin artículos.
- confirmacion para crear_gasto: "¿Confirmás este gasto?\n\n📌 *{descripcion}*\n💵 $N\n{emoji_categoria} Categoría: {categoria}\n👤 Pagás vos: {remitente}\n👥 División: {con quién y cuántos}\n   → $XX cada uno\n\nRespondé *si* para confirmar o *no* para cancelar"
- confirmacion para agregar_compra: "¿Agregamos a la lista de compras?\n\n{• item1\n• item2}\n\nRespondé *si* o *no*"
- confirmacion para desconocido: explicá qué podés hacer con ejemplos concretos.`

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
