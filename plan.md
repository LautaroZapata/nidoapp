# Plan: Personalización avanzada de perfil

## 1. Avatar Generado (estilo Boring Avatars)
Generar SVGs únicos automáticamente basados en nombre + color del miembro. Sin dependencias externas — implementar un generador simple inline.

### Variantes de avatar:
- **Beam**: Cara abstracta con formas geométricas (el más popular)
- Se genera determinísticamente desde el nombre (mismo nombre = mismo avatar siempre)
- El color del miembro se usa como color primario, se derivan 2-3 colores secundarios

### Componente `<MemberAvatar />`
- Props: `nombre`, `color`, `size` (sm/md/lg), `icono` (opcional, del tema expandido)
- Reemplaza todos los ~15 lugares donde hoy se usa el círculo con inicial
- Fallback: si el miembro no tiene avatar configurado, muestra el SVG generado

### DB: No requiere cambios (el avatar se genera desde datos existentes)

---

## 2. Insignias/Badges automáticos
Badges que se calculan en tiempo real basado en la actividad del miembro en la sala.

### Badges propuestos:
| Badge | Condición | Icono |
|-------|-----------|-------|
| 🧹 Limpio | Más tareas completadas del grupo | 🧹 |
| 💰 Generoso | Mayor gasto total pagado | 💰 |
| 🛒 Proveedor | Más items de compra agregados | 🛒 |
| 🏠 Explorador | Más pisos agregados | 🏠 |
| ⚡ Puntual | Pagó todas sus deudas | ⚡ |
| 👑 Fundador | Primer miembro de la sala | 👑 |

### Implementación:
- Función `calcularBadges(miembroId, salaId)` que consulta gastos, tareas, compras, pisos
- Se calcula client-side al cargar la página de perfil/sala (no se guarda en DB)
- Se muestra debajo del nombre en la lista de miembros y en el perfil

### DB: No requiere cambios (se calcula desde datos existentes)

---

## 3. Tema/Color expandido
Expandir el sistema de colores: el miembro elige color + gradiente + icono personal.

### Nuevos campos en `miembros`:
- `gradiente` (text, nullable): segundo color para gradiente (ej: '#FFD700')
- `icono` (text, nullable): emoji elegido como icono personal (ej: '🎸')

### UI de personalización (en la página sala):
- Selector de color primario (ya existe, se mantiene)
- Nuevo: selector de color secundario (para gradiente)
- Nuevo: picker de emoji/icono personal
- Preview en tiempo real del avatar con gradiente + icono

### Dónde se aplica el gradiente:
- Avatar del miembro: `background: linear-gradient(135deg, color1, color2)`
- Si no elige gradiente, se usa solo el color sólido (comportamiento actual)

### DB: Migración para agregar `gradiente` e `icono` a la tabla `miembros`

---

## Archivos a modificar:

### Nuevos:
- `src/components/MemberAvatar.tsx` — componente reutilizable de avatar
- `src/lib/badges.ts` — lógica de cálculo de badges
- `supabase/migrations/007_perfil_expandido.sql` — migración DB

### Modificar:
- `src/lib/types.ts` — agregar campos gradiente/icono a Miembro
- `src/app/sala/[codigo]/page.tsx` — UI de personalización expandida + badges en lista de miembros
- `src/app/sala/[codigo]/layout.tsx` — avatar en sidebar
- `src/app/sala/[codigo]/gastos/page.tsx` — avatares en deudas/pagos
- `src/app/sala/[codigo]/tareas/page.tsx` — avatares en tareas
- `src/app/sala/[codigo]/compras/page.tsx` — avatar en header
- `src/lib/session.ts` — agregar gradiente/icono a la session

## Orden de implementación:
1. Migración DB + tipos
2. Componente MemberAvatar (con generador de SVG)
3. Integrar MemberAvatar en todos los lugares
4. UI de personalización (color secundario + icono)
5. Sistema de badges
6. Tests + build
