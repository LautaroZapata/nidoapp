# NidoApp — Plan de Negocio y Especificación Técnica

> Documento de referencia para agentes de implementación. Todo cambio al sistema de planes, features, límites o billing **debe ser consistente con este archivo**. Si este archivo y el código difieren, este archivo es la fuente de verdad.

---

## 1. Descripción del Producto

**NidoApp** es una app web de convivencia para compañeros de piso. Permite a grupos de personas viviendo juntas gestionar:

- **Gastos compartidos**: registro, splits, balance entre miembros, liquidación de deudas
- **Lista de compras**: ítems pendientes y completados por miembro
- **Búsqueda de aptos**: listado de apartamentos con fotos, precios, y links de interés
- **Bot de WhatsApp**: registro de gastos y consultas de balance desde WhatsApp
- **Notificaciones push**: alertas en tiempo real de gastos y compras nuevas

**Stack técnico:**
- Frontend: Next.js 16.1.6 App Router, React 19, TypeScript, Tailwind CSS v4
- Backend: Supabase (Auth + PostgreSQL + Realtime)
- Pagos: Lemon Squeezy (no Stripe)
- AI/NLP: Groq SDK (llama-3.1-8b-instant) para parsing de mensajes WhatsApp
- Notificaciones: Web Push API
- Exportación: xlsx-js-style (Excel .xlsx)
- Deployment: Vercel

---

## 2. Modelo de Negocio

### Ruta A: Freemium con planes Pro por sala

Cada **sala** (nido) tiene su propio plan. El dueño (`owner_user_id`) paga por su sala.
Una sala en plan Free puede upgradear a Nido o Casa.

```
Free → Nido ($290 UYU/mes) → Casa ($590 UYU/mes)
```

Los planes son **por sala**, no por usuario. Un usuario podría tener múltiples salas (una por plan).

---

## 3. Planes y Límites

### Plan Free — $0/mes

| Límite/Feature         | Valor        |
|------------------------|--------------|
| Miembros máximos       | 3            |
| Historial de gastos    | 2 meses      |
| Bot de WhatsApp        | ❌ No incluido |
| Estadísticas avanzadas | ❌ No incluido |
| Gastos / Compras       | ✅ Sin límite |
| Búsqueda de aptos      | ✅ Sin límite |
| Notificaciones push    | ✅ Incluido   |

**Restricciones técnicas implementadas:**
- `FREE_LIMITS.maxMiembros = 3` — validado en `/invitar/[token]/page.tsx` antes de crear el miembro
- `FREE_LIMITS.historialMeses = 2` — filtro en la query de gastos: `gte('fecha', fechaLimite)`
- Bot de WhatsApp: el webhook verifica `plan_type === 'pro'` antes de procesar mensajes
- UI muestra banner de historial limitado y opción de upgrade

### Plan Nido — $290 UYU/mes

| Feature                     | Valor              |
|-----------------------------|-------------------|
| Miembros máximos            | 8                 |
| Historial de gastos         | Ilimitado         |
| Bot de WhatsApp             | ✅ Incluido        |
| Estadísticas avanzadas      | ❌ No incluido     |
| Gastos / Compras / Aptos    | ✅ Sin límite      |
| Notificaciones push         | ✅ Incluido        |
| Soporte                     | Estándar          |

**Lemon Squeezy Variant ID:** `LEMONSQUEEZY_VARIANT_NIDO=1418832`

### Plan Casa — $590 UYU/mes

| Feature                     | Valor              |
|-----------------------------|-------------------|
| Miembros máximos            | Ilimitados         |
| Historial de gastos         | Ilimitado          |
| Bot de WhatsApp             | ✅ Incluido        |
| Estadísticas avanzadas      | ✅ Incluido (tab en Gastos) |
| Exportar datos              | ✅ Incluido (CSV de gastos y liquidaciones) |
| Gastos / Compras / Aptos    | ✅ Sin límite       |
| Notificaciones push         | ✅ Incluido         |
| Soporte                     | Prioritario        |

**Lemon Squeezy Variant ID:** `LEMONSQUEEZY_VARIANT_CASA=1418833`

---

## 4. Constantes de Código (`src/lib/features.ts`)

```ts
FREE_LIMITS = {
  historialMeses: 2,   // meses de historial visible en plan Free
  maxMiembros: 3,      // máximo de miembros en plan Free
}

TIERS = {
  nido: { maxMiembros: 8, precio: 290, variantKey: 'LEMONSQUEEZY_VARIANT_NIDO' },
  casa: { maxMiembros: Infinity, precio: 590, variantKey: 'LEMONSQUEEZY_VARIANT_CASA' },
}
```

**Regla:** Cualquier límite en el código debe leer de `FREE_LIMITS` o `TIERS`, nunca hardcodear números.

---

## 5. Flujo de Billing

### Checkout (upgrade Free → Pro)

1. Usuario (owner) toca "Ver planes Pro →" en la sala
2. Elige tier: Nido o Casa
3. `POST /api/billing/checkout` con `{ salaId, tier: 'nido' | 'casa' }`
4. Se crea checkout en Lemon Squeezy con `customData: { sala_id, user_id, tier }`
5. Usuario paga → LemonSqueezy redirige a `/sala/[codigo]/gastos?upgraded=1`
6. Webhook `POST /api/webhooks/lemon` recibe `subscription_created`
7. Webhook actualiza la sala: `plan_type='pro'`, `plan_tier='nido'|'casa'`

### Webhook Events Manejados

| Evento                          | Acción                                      |
|---------------------------------|---------------------------------------------|
| `subscription_created`          | `plan_type='pro'`, `plan_tier=tier`         |
| `subscription_updated`          | Actualiza status, tier, subscription_end    |
| `subscription_payment_recovered`| Reactiva si estaba past_due                 |
| `subscription_cancelled`        | `plan_type='free'`, `plan_tier=null`        |
| `subscription_expired`          | `plan_type='free'`, `plan_tier=null`        |
| `subscription_payment_failed`   | `subscription_status='past_due'`            |

### Validación de Tier en Webhook

```ts
// CORRECTO — aceptar solo los tiers actuales
const tier = (tierRaw === 'nido' || tierRaw === 'casa') ? tierRaw : null

// INCORRECTO — no usar nombres legacy
// const tier = (tierRaw === 'starter' || tierRaw === 'hogar' || ...) ? ...
```

### Campos DB relevantes (`salas`)

| Campo                    | Tipo    | Descripción                              |
|--------------------------|---------|------------------------------------------|
| `plan_type`              | text    | `'free'` \| `'pro'`                     |
| `plan_tier`              | text    | `'nido'` \| `'casa'` \| null            |
| `subscription_status`    | text    | `'active'` \| `'on_trial'` \| `'past_due'` \| `'cancelled'` \| `'expired'` |
| `subscription_end`       | timestamp | Fecha de vencimiento                   |
| `stripe_subscription_id` | text    | ID de suscripción LS (nombre legacy, no cambiar sin migración) |
| `stripe_customer_id`     | text    | ID de customer LS (nombre legacy)       |
| `owner_user_id`          | uuid    | Auth user_id del dueño de la sala       |

---

## 6. Modelo de Usuarios y Membresías

### Auth y Sesión

- Auth: Supabase Auth (email/password + Google OAuth)
- Sesión local: `localStorage` con clave `nidoapp_session`
- Campos de sesión: `{ salaId, salaCodigo, salaNombre, miembroId, miembroNombre, miembroColor }`

### Tabla `miembros`

| Campo           | Descripción                                              |
|-----------------|----------------------------------------------------------|
| `user_id`       | Auth user ID. `null` = usuario que se fue del nido       |
| `sala_id`       | ID de la sala a la que pertenece                         |
| `nombre`        | Nombre lowercase dentro del nido (único por sala)        |
| `color`         | Color hex del avatar                                     |
| `whatsapp_phone`| Número vinculado al bot (puede ser null)                 |

**Reglas:**
- Miembro activo: `user_id IS NOT NULL`
- Miembro que se fue: `user_id = null` (soft delete, se conserva para historial)
- Al mostrar la lista de miembros activos: filtrar `.not('user_id', 'is', null)`
- Al unirse via invite: si hay un registro con `user_id=null` y mismo nombre → re-linkear en vez de insertar

### Flujo de Invite

1. Owner genera link: `POST /api/invitaciones` → crea token en tabla `invitaciones`
2. Invitado abre `/invitar/[token]`
3. Si no está autenticado → formulario de login/signup
4. Si está autenticado → formulario de nombre
5. Antes de insertar nuevo miembro: verificar si existe registro con mismo nombre y `user_id=null` → re-linkear
6. Validar límite de miembros según plan
7. Marcar invitación como usada: `usado_en = now()`

### Flujo de Leave (Salir del Nido)

1. Usuario toca "Salir del nido"
2. `UPDATE miembros SET user_id = null WHERE id = miembroId`
3. `clearSession()` + redirect a `/dashboard`
4. Realtime: otros usuarios reciben UPDATE → detectan `user_id` que pasa a null → eliminan de la lista

---

## 7. Features por Módulo

### 7.1 Gastos

**Implementado:**
- CRUD de gastos (descripción, importe, categoría, tipo fijo/variable, fecha, splits)
- Split automático (igual entre todos) o manual (porcentajes)
- Cálculo de balance neto por miembro
- Liquidación de deudas con historial de pagos
- Filtro de historial por plan (2 meses Free, ilimitado Pro)
- Realtime: nuevos gastos aparecen sin recargar
- Push notifications al agregar gasto
- Tab "Estadísticas" exclusivo plan Casa
- Exportar datos en CSV exclusivo plan Casa

**Tab Estadísticas (solo Casa):**
- KPIs: total gastado, promedio por persona, cantidad de gastos
- Gráfico de barras por mes (últimos 6 meses)
- Breakdown por categoría con barras de progreso
- Ranking de miembros por monto pagado

**Exportar Excel (solo Casa):**
- Botón en la sección de gastos, solo visible si `planSala === 'pro' && planTier === 'casa'`
- Descarga client-side (sin servidor), datos ya cargados en memoria
- Formato: `.xlsx` con estilos (librería `xlsx-js-style`)
- Archivo: `nido-gastos-[fecha].xlsx`
- Contenido: 3 hojas — Gastos, Liquidaciones, Resumen/Balance por miembro

### 7.2 Compras

**Implementado:**
- Lista de ítems pendientes con cantidad y quién lo agregó
- Marcar como completado con quién lo compró
- Limpiar completados (con confirmación modal)
- Realtime
- Push notifications

### 7.3 Pisos / Aptos

**Implementado:**
- CRUD de apartamentos (precio, habitaciones, baños, m², zona, dirección, notas, links, fotos/videos)
- Filtros: precio min/max, habitaciones, ordenamiento
- Paginación
- Realtime

### 7.4 Bot de WhatsApp

**Implementado:**
- Vinculación por código temporal (15 min) desde la app
- Registro de gastos por mensaje de texto natural (parseado por IA)
- Consulta de balance ("¿cuánto debo?")
- Confirmación de acciones con respuesta Sí/No
- **Solo disponible para salas Pro (Nido y Casa)**
- Verificación en webhook: rechaza mensajes si `plan_type !== 'pro'`

### 7.5 Notificaciones Push

**Implementado:**
- Onboarding modal para pedir permiso de notificaciones
- Suscripción guardada en DB
- Notificaciones al agregar gasto o compra
- Disponible en todos los planes

---

## 8. UI/UX — Reglas de Diseño

**Paleta de colores:**
```
Fondo:      #FAF5EE
Primario:   #C05A3B (terracota)
Texto:      #2A1A0E
Verde:      #5A8869
Borde:      #EAD8C8
Texto suave:#A07060
```

**Tipografías:**
- Serif (títulos): `Fraunces`
- Sans (cuerpo): `Nunito`

**Principios:**
- Mobile first — el diseño base es para móvil
- Desktop: sidebar fijo de 224px, el contenido ocupa el resto
- No usar `confirm()` nativo — siempre usar `ConfirmModal`
- Formularios en modal: no deben requerir scroll en móvil (usar toggle "Más opciones" para campos opcionales)
- Notificaciones del sistema: panel que cae desde arriba (no bottom sheet)
- z-index del overlay de modales: mínimo 400 en dashboard, 200+ en sala

---

## 9. Reglas para el Agente de Implementación

1. **Nunca hardcodear valores de plan** — usar siempre `FREE_LIMITS`, `TIERS` de `features.ts`
2. **Tiers válidos en DB:** solo `'nido'` y `'casa'`. No usar nombres legacy (`starter`, `hogar`, `casa_grande`)
3. **Mostrar miembros activos:** siempre filtrar `.not('user_id', 'is', null)` en el fetch inicial
4. **WhatsApp bot:** verificar plan antes de procesar en el webhook
5. **Estadísticas y Exportar:** solo renderizar si `planSala === 'pro' && planTier === 'casa'`
6. **Historial de gastos:** usar `FREE_LIMITS.historialMeses`, nunca escribir el número directamente
7. **Checkout:** el `customData` debe incluir `tier: 'nido' | 'casa'` para que el webhook lo procese
8. **Webhook:** validar tier con `tierRaw === 'nido' || tierRaw === 'casa'`
9. **Confirmaciones destructivas:** usar `ConfirmModal` (`src/components/ConfirmModal.tsx`), nunca `window.confirm()`
10. **Billing:** pagos exclusivamente con Lemon Squeezy — no hay integración Stripe activa
11. **Columnas DB `stripe_*`:** son nombres legacy que apuntan a datos de LS, no renombrar sin migración completa

---

## 10. Variables de Entorno Requeridas

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Lemon Squeezy
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_NIDO=1418832
LEMONSQUEEZY_VARIANT_CASA=1418833
LEMONSQUEEZY_WEBHOOK_SECRET=

# WhatsApp (Meta Business API)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 11. Estado Actual de Implementación

| Feature                          | Estado       | Notas                                      |
|----------------------------------|--------------|--------------------------------------------|
| Auth (email + Google)            | ✅ Completo  |                                            |
| Crear / entrar a sala            | ✅ Completo  |                                            |
| Invite link                      | ✅ Completo  | Incluye re-linkear miembros que se fueron  |
| Salir del nido                   | ✅ Completo  |                                            |
| Gastos CRUD + balance            | ✅ Completo  |                                            |
| Liquidar deudas                  | ✅ Completo  |                                            |
| Lista de compras                 | ✅ Completo  |                                            |
| Búsqueda de aptos                | ✅ Completo  |                                            |
| Realtime (gastos, miembros, etc) | ✅ Completo  |                                            |
| Push notifications               | ✅ Completo  |                                            |
| Bot WhatsApp                     | ✅ Completo  | Solo Pro                                   |
| Billing con Lemon Squeezy        | ✅ Completo  |                                            |
| Límite de miembros Free (3)      | ✅ Completo  |                                            |
| Límite historial Free (2 meses)  | ✅ Completo  |                                            |
| Límite miembros Nido (8)         | ✅ Completo  |                                            |
| Tab Estadísticas Casa            | ✅ Completo  | KPIs, barras, categorías, ranking          |
| Estadísticas avanzadas Casa      | ⚠️ Básico   | Implementado pero puede expandirse         |
| Exportar datos Excel Casa        | ✅ Completo  | .xlsx con 3 hojas (gastos, liquid., resumen)|
| Soporte prioritario Casa         | ❌ UI only   | No hay sistema de tickets implementado     |
| Panel de admin                   | ❌ Pendiente | No existe                                  |
| Multi-sala por usuario           | ⚠️ Parcial  | Un usuario puede tener 1 sala Free         |
