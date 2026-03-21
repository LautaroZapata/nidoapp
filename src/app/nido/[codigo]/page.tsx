import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase-admin'
import type { Miembro, Gasto } from '@/lib/types'
import Link from 'next/link'

const CAT_EMOJIS: Record<string, string> = {
  alquiler: '🏠',
  suministros: '💡',
  internet: '🌐',
  comida: '🍕',
  limpieza: '🧹',
  otro: '📦',
}

type Props = {
  params: Promise<{ codigo: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params
  const supabase = createAdminClient()
  const { data: sala } = await supabase
    .from('salas')
    .select('nombre')
    .eq('codigo', codigo)
    .single() as { data: { nombre: string } | null; error: unknown }

  if (!sala) {
    return { title: 'Nido no encontrado · NidoApp' }
  }

  return {
    title: `${sala.nombre} · NidoApp`,
    description: `El nido de ${sala.nombre} en NidoApp`,
  }
}

export default async function NidoPublicoPage({ params }: Props) {
  const { codigo } = await params
  const supabase = createAdminClient()

  const { data: salaRaw } = await supabase
    .from('salas')
    .select('id, codigo, nombre')
    .eq('codigo', codigo)
    .single()

  if (!salaRaw) {
    return <NidoNoEncontrado />
  }

  const sala = salaRaw as { id: string; codigo: string; nombre: string }

  const [{ data: miembros }, { data: gastos }] = await Promise.all([
    supabase.from('miembros').select('id, sala_id, nombre, color, password_hash, salt, user_id, telefono, whatsapp_phone, creado_en').eq('sala_id', sala.id),
    supabase
      .from('gastos')
      .select('id, sala_id, descripcion, importe, categoria, pagado_por, tipo, fecha, splits, creado_en')
      .eq('sala_id', sala.id)
      .order('fecha', { ascending: false })
      .limit(5),
  ])

  const { count: totalGastos } = await supabase
    .from('gastos')
    .select('*', { count: 'exact', head: true })
    .eq('sala_id', sala.id)

  const miembrosList: Miembro[] = (miembros ?? []) as Miembro[]
  const gastosList: Gasto[] = (gastos ?? []) as Gasto[]

  const miembrosMap: Record<string, Miembro> = {}
  for (const m of miembrosList) {
    miembrosMap[m.id] = m
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .np-root {
          min-height: 100vh;
          background: #FFF8F2;
          font-family: var(--font-nunito), Nunito, sans-serif;
          color: #2A1A0E;
        }

        .np-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          background: rgba(255,248,242,0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #EAD8C8;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .np-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: #2A1A0E;
        }

        .np-logo-text {
          font-family: Georgia, serif;
          font-size: 1.2rem;
          font-weight: 700;
          color: #2A1A0E;
        }

        .np-crear-link {
          font-size: 0.8rem;
          font-weight: 700;
          color: #C05A3B;
          text-decoration: none;
          padding: 7px 14px;
          border: 1.5px solid rgba(192,90,59,0.3);
          border-radius: 999px;
          transition: all 0.18s;
          white-space: nowrap;
        }

        .np-crear-link:hover {
          background: #C05A3B;
          color: white;
          border-color: #C05A3B;
        }

        .np-main {
          max-width: 480px;
          margin: 0 auto;
          padding: 32px 20px 60px;
        }

        /* Hero */
        .np-hero {
          text-align: center;
          padding: 32px 0 28px;
        }

        .np-house-icon {
          font-size: 3rem;
          margin-bottom: 12px;
          display: block;
        }

        .np-badge {
          display: inline-block;
          background: rgba(192,90,59,0.1);
          border: 1px solid rgba(192,90,59,0.25);
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 0.72rem;
          font-weight: 700;
          color: #C05A3B;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .np-sala-nombre {
          font-family: Georgia, serif;
          font-size: 2rem;
          font-weight: 700;
          color: #2A1A0E;
          line-height: 1.2;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }

        .np-sala-subtitulo {
          font-size: 0.9rem;
          color: #B09080;
          margin-bottom: 0;
        }

        /* Stats */
        .np-stats {
          display: flex;
          gap: 12px;
          margin: 24px 0;
        }

        .np-stat-card {
          flex: 1;
          background: white;
          border: 1.5px solid #EAD8C8;
          border-radius: 16px;
          padding: 16px 12px;
          text-align: center;
        }

        .np-stat-val {
          font-family: Georgia, serif;
          font-size: 1.8rem;
          font-weight: 700;
          color: #C05A3B;
          line-height: 1;
          margin-bottom: 4px;
        }

        .np-stat-label {
          font-size: 0.72rem;
          color: #B09080;
          font-weight: 600;
        }

        /* Section */
        .np-section {
          background: white;
          border: 1.5px solid #EAD8C8;
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .np-section-title {
          font-family: Georgia, serif;
          font-size: 1rem;
          font-weight: 700;
          color: #2A1A0E;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Members */
        .np-members {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .np-member {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .np-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          font-weight: 800;
          color: white;
          flex-shrink: 0;
        }

        .np-member-name {
          font-size: 0.72rem;
          font-weight: 600;
          color: #6B4030;
          text-align: center;
          max-width: 52px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Gastos */
        .np-gasto-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid #EAD8C8;
        }

        .np-gasto-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .np-gasto-item:first-child {
          padding-top: 0;
        }

        .np-gasto-emoji {
          font-size: 1.3rem;
          width: 36px;
          height: 36px;
          background: #FFF8F2;
          border: 1px solid #EAD8C8;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .np-gasto-info {
          flex: 1;
          min-width: 0;
        }

        .np-gasto-desc {
          font-size: 0.87rem;
          font-weight: 600;
          color: #2A1A0E;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .np-gasto-meta {
          font-size: 0.72rem;
          color: #B09080;
          margin-top: 2px;
        }

        .np-gasto-importe {
          font-family: Georgia, serif;
          font-size: 0.95rem;
          font-weight: 700;
          color: #2A1A0E;
          flex-shrink: 0;
        }

        /* CTA */
        .np-cta {
          background: linear-gradient(135deg, #C05A3B 0%, #A04730 100%);
          border-radius: 20px;
          padding: 28px 24px;
          text-align: center;
          margin-bottom: 16px;
        }

        .np-cta-emoji {
          font-size: 2.5rem;
          margin-bottom: 12px;
          display: block;
        }

        .np-cta-title {
          font-family: Georgia, serif;
          font-size: 1.3rem;
          font-weight: 700;
          color: white;
          margin-bottom: 8px;
          line-height: 1.3;
        }

        .np-cta-sub {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.75);
          margin-bottom: 20px;
          line-height: 1.55;
        }

        .np-cta-btn {
          display: inline-block;
          background: white;
          color: #C05A3B;
          font-weight: 800;
          font-size: 0.95rem;
          padding: 14px 28px;
          border-radius: 999px;
          text-decoration: none;
          font-family: var(--font-nunito), Nunito, sans-serif;
          transition: all 0.18s;
        }

        .np-cta-btn:hover {
          background: #FFF8F2;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        /* Footer */
        .np-footer {
          text-align: center;
          padding: 24px 0 0;
          font-size: 0.75rem;
          color: #B09080;
        }

        .np-footer a {
          color: #C05A3B;
          text-decoration: none;
          font-weight: 700;
        }

        /* Not found */
        .np-notfound {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px;
          background: #FFF8F2;
          font-family: var(--font-nunito), Nunito, sans-serif;
        }

        .np-notfound-emoji {
          font-size: 4rem;
          margin-bottom: 20px;
        }

        .np-notfound-title {
          font-family: Georgia, serif;
          font-size: 1.6rem;
          font-weight: 700;
          color: #2A1A0E;
          margin-bottom: 10px;
        }

        .np-notfound-sub {
          font-size: 0.9rem;
          color: #B09080;
          margin-bottom: 28px;
          max-width: 320px;
          line-height: 1.6;
        }

        .np-notfound-btn {
          display: inline-block;
          background: #C05A3B;
          color: white;
          font-weight: 700;
          font-size: 0.9rem;
          padding: 12px 24px;
          border-radius: 999px;
          text-decoration: none;
          font-family: var(--font-nunito), Nunito, sans-serif;
        }
      `}</style>

      <div className="np-root">
        {/* Top bar */}
        <header className="np-topbar">
          <Link href="/" className="np-logo">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <rect x="5" y="15" width="22" height="15" rx="2" fill="#FFF5EE" stroke="#DFC5B0" strokeWidth="1.5"/>
              <path d="M3 16.5L16 4.5L29 16.5" stroke="#C8823A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="13" y="22" width="6" height="8" rx="1.5" fill="#FDEBD8" stroke="#D4A880" strokeWidth="1.3"/>
            </svg>
            <span className="np-logo-text">NidoApp</span>
          </Link>
          <Link href="/" className="np-crear-link">
            Crear mi nido gratis →
          </Link>
        </header>

        <main className="np-main">
          {/* Hero */}
          <div className="np-hero">
            <span className="np-house-icon">🐣</span>
            <div className="np-badge">Nido compartido</div>
            <h1 className="np-sala-nombre">El nido de {sala.nombre}</h1>
            <p className="np-sala-subtitulo">Organizado con NidoApp</p>
          </div>

          {/* Stats */}
          <div className="np-stats">
            <div className="np-stat-card">
              <div className="np-stat-val">{miembrosList.length}</div>
              <div className="np-stat-label">Compañeros</div>
            </div>
            <div className="np-stat-card">
              <div className="np-stat-val">{totalGastos ?? 0}</div>
              <div className="np-stat-label">Gastos registrados</div>
            </div>
          </div>

          {/* Members */}
          {miembrosList.length > 0 && (
            <div className="np-section">
              <div className="np-section-title">
                <span>👥</span>
                <span>Los compañeros</span>
              </div>
              <div className="np-members">
                {miembrosList.map((m) => (
                  <div key={m.id} className="np-member">
                    <div
                      className="np-avatar"
                      style={{ background: m.color || '#C05A3B' }}
                    >
                      {m.nombre.charAt(0).toUpperCase()}
                    </div>
                    <span className="np-member-name">{m.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent expenses */}
          {gastosList.length > 0 && (
            <div className="np-section">
              <div className="np-section-title">
                <span>💸</span>
                <span>Gastos recientes</span>
              </div>
              {gastosList.map((g) => {
                const pagador = g.pagado_por ? miembrosMap[g.pagado_por] : null
                return (
                  <div key={g.id} className="np-gasto-item">
                    <div className="np-gasto-emoji">
                      {CAT_EMOJIS[g.categoria] ?? '📦'}
                    </div>
                    <div className="np-gasto-info">
                      <div className="np-gasto-desc">{g.descripcion}</div>
                      <div className="np-gasto-meta">
                        {pagador ? `Pagó ${pagador.nombre}` : 'Sin pagador'} · {new Date(g.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div className="np-gasto-importe">
                      ${g.importe.toLocaleString('es-AR')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CTA */}
          <div className="np-cta">
            <span className="np-cta-emoji">🏠</span>
            <h2 className="np-cta-title">¿Querés unirte a {sala.nombre}?</h2>
            <p className="np-cta-sub">
              Pedile a un integrante del nido que te comparta el link de invitación. O creá tu propio nido gratis.
            </p>
            <Link href={`/unirse?codigo=${sala.codigo}`} className="np-cta-btn">
              Unirme al nido
            </Link>
          </div>

          {/* Footer */}
          <footer className="np-footer">
            <p>Powered by <Link href="/">NidoApp</Link> · La app de los compañeros de cuarto</p>
          </footer>
        </main>
      </div>
    </>
  )
}

function NidoNoEncontrado() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .np-notfound {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 24px;
          background: #FFF8F2;
          font-family: var(--font-nunito), Nunito, sans-serif;
          color: #2A1A0E;
        }
        .np-notfound-emoji { font-size: 4rem; margin-bottom: 20px; }
        .np-notfound-title { font-family: Georgia, serif; font-size: 1.6rem; font-weight: 700; color: #2A1A0E; margin-bottom: 10px; }
        .np-notfound-sub { font-size: 0.9rem; color: #B09080; margin-bottom: 28px; max-width: 320px; line-height: 1.6; }
        .np-notfound-btn { display: inline-block; background: #C05A3B; color: white; font-weight: 700; font-size: 0.9rem; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-family: var(--font-nunito), Nunito, sans-serif; }
      `}</style>
      <div className="np-notfound">
        <div className="np-notfound-emoji">🪹</div>
        <h1 className="np-notfound-title">Nido no encontrado</h1>
        <p className="np-notfound-sub">
          El nido que buscás no existe o el código es incorrecto. Revisá el link con quien te lo compartió.
        </p>
        <Link href="/" className="np-notfound-btn">
          Crear mi nido gratis →
        </Link>
      </div>
    </>
  )
}
