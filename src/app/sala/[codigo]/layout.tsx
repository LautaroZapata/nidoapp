'use client'

import { useParams, usePathname, useRouter } from 'next/navigation'

function IconNido() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 10.5L12 3L21 10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 9.5V19C5 19.55 5.45 20 6 20H10V14H14V20H18C18.55 20 19 19.55 19 19V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconGastos() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.67 10.67 8 12 8s2.5.67 2.5 1.5S13.33 11 12 11s-2.5.67-2.5 1.5S10.67 16 12 16s2.5-.67 2.5-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
}

function IconCompras() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  )
}

function IconPisos() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M2 13h20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M8 13v8M16 13v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export default function SalaLayout({ children }: { children: React.ReactNode }) {
  const params   = useParams()
  const pathname = usePathname()
  const router   = useRouter()
  const codigo   = params.codigo as string

  const tabs = [
    { label: 'Nido',    href: `/sala/${codigo}`,         icon: IconNido    },
    { label: 'Gastos',  href: `/sala/${codigo}/gastos`,  icon: IconGastos  },
    { label: 'Compras', href: `/sala/${codigo}/compras`, icon: IconCompras },
    { label: 'Pisos',   href: `/sala/${codigo}/pisos`,   icon: IconPisos   },
  ]

  // No mostrar nav en páginas de detalle (ej: pisos/[id])
  const isDetail = pathname.split('/').length > 4

  return (
    <>
      <style>{`
        .sala-content {
          padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
        }

        /* Bottom Nav */
        .bnav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 200;
          background: rgba(255, 252, 248, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid rgba(192, 90, 59, 0.1);
          display: flex;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          box-shadow: 0 -4px 24px rgba(42, 26, 14, 0.07);
        }

        .bnav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 10px 4px 11px;
          background: none;
          border: none;
          cursor: pointer;
          color: #B09080;
          transition: color 0.15s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
          font-family: var(--font-nunito), 'Nunito', sans-serif;
        }

        .bnav-item:active {
          transform: scale(0.92);
        }

        .bnav-item.active {
          color: #C05A3B;
        }

        .bnav-label {
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
        }

        .bnav-dot {
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #C05A3B;
          margin-top: 1px;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .bnav-item.active .bnav-dot {
          opacity: 1;
        }

        /* Solo en desktop ocultar el bottom nav */
        @media (min-width: 768px) {
          .bnav { display: none; }
          .sala-content { padding-bottom: 0; }
        }
      `}</style>

      <div className="sala-content">
        {children}
      </div>

      {!isDetail && (
        <nav className="bnav">
          {tabs.map(tab => {
            const isActive = pathname === tab.href
            const Icon = tab.icon
            return (
              <button
                key={tab.href}
                className={`bnav-item${isActive ? ' active' : ''}`}
                onClick={() => router.push(tab.href)}
                aria-label={tab.label}
              >
                <Icon />
                <span className="bnav-label">{tab.label}</span>
                <div className="bnav-dot" />
              </button>
            )
          })}
        </nav>
      )}
    </>
  )
}
