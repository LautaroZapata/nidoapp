'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession, setSession } from '@/lib/session'
import type { Miembro, Gasto, ItemCompra, Tarea, Piso, Pago } from '@/lib/types'
import MemberAvatar from '@/components/MemberAvatar'
import { calcularBadges, ALL_BADGE_DEFS, type Badge } from '@/lib/badges'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-nunito' })

const ICONOS = [
  '🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🐝', '🦋', '🐙', '🎸',
  '🎮', '🏀', '🌮', '☕', '🍕', '🎯', '🔥', '💎', '🌊', '🌻',
]

const STATUS_PRESETS = [
  '🏠 En casa', '🏖️ De viaje', '📚 Estudiando', '🛒 De compras',
  '💤 Durmiendo', '💻 Trabajando', '🍽️ Cocinando', '🎉 De fiesta',
]

type ProfileData = {
  nombre: string
  color: string
  icono: string | null
  foto_url: string | null
  bio: string | null
  rol_casa: string | null
  cumpleanos: string | null
  metodo_pago: string | null
  estado: string | null
  badge_destacado: string | null
}

export default function PerfilPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string
  const supabase = createClient()

  const [session, setLocalSession] = useState(getSession())
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [myBadges, setMyBadges] = useState<Badge[]>([])
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [bioValue, setBioValue] = useState('')
  const [rolValue, setRolValue] = useState('')
  const [cumpleValue, setCumpleValue] = useState('')
  const [metodoPagoValue, setMetodoPagoValue] = useState('')
  const [selectedColor, setSelectedColor] = useState('#C05A3B')
  const [selectedIcono, setSelectedIcono] = useState<string | null>(null)
  const [estadoValue, setEstadoValue] = useState<string | null>(null)
  const [pinnedBadge, setPinnedBadge] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashSave = useCallback((msg = 'Guardado') => {
    setSaveStatus(msg)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaveStatus(null), 1500)
  }, [])

  const saveField = useCallback(async (field: string, value: unknown) => {
    if (!session) return
    const { error } = await supabase
      .from('miembros')
      .update({ [field]: value })
      .eq('id', session.miembroId)
    if (!error) {
      flashSave()
    } else {
      setSaveStatus('Error al guardar')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
    }
  }, [session, supabase, flashSave])

  useEffect(() => {
    if (!session) { router.push(`/sala/${codigo}`); return }

    async function loadData() {
      const { data: miembro } = await supabase
        .from('miembros')
        .select('*')
        .eq('id', session!.miembroId)
        .single() as { data: Miembro | null }

      if (!miembro) { setLoading(false); return }

      const p: ProfileData = {
        nombre: miembro.nombre, color: miembro.color,
        icono: miembro.icono, foto_url: miembro.foto_url,
        bio: miembro.bio, rol_casa: miembro.rol_casa,
        cumpleanos: miembro.cumpleanos, metodo_pago: miembro.metodo_pago,
        estado: miembro.estado, badge_destacado: miembro.badge_destacado,
      }
      setProfile(p)
      setNameValue(p.nombre)
      setBioValue(p.bio ?? '')
      setRolValue(p.rol_casa ?? '')
      setCumpleValue(p.cumpleanos ?? '')
      setMetodoPagoValue(p.metodo_pago ?? '')
      setSelectedColor(p.color)
      setSelectedIcono(p.icono)
      setEstadoValue(p.estado)
      setPinnedBadge(p.badge_destacado)

      const salaId = session!.salaId
      const [
        { data: miembros }, { data: gastos }, { data: items },
        { data: tareas }, { data: pisos }, { data: pagos },
      ] = await Promise.all([
        supabase.from('miembros').select('*').eq('sala_id', salaId),
        supabase.from('gastos').select('*').eq('sala_id', salaId),
        supabase.from('items_compra').select('*').eq('sala_id', salaId),
        supabase.from('tareas').select('*').eq('sala_id', salaId),
        supabase.from('pisos').select('*').eq('sala_id', salaId),
        supabase.from('pagos').select('*').eq('sala_id', salaId),
      ])

      const allMiembros = (miembros ?? []) as Miembro[]
      const allGastos = (gastos ?? []) as Gasto[]
      const allPagos = (pagos ?? []) as Pago[]

      const net: Record<string, number> = {}
      allMiembros.forEach(m => { net[m.id] = 0 })
      allGastos.forEach(g => {
        if (g.tipo === 'fijo' || !g.pagado_por) return
        if (!g.splits) {
          const participantes = allMiembros.filter(m => m.creado_en <= g.creado_en)
          const share = g.importe / (participantes.length || 1)
          net[g.pagado_por] = (net[g.pagado_por] ?? 0) + g.importe - share
          participantes.forEach(m => {
            if (m.id !== g.pagado_por) net[m.id] = (net[m.id] ?? 0) - share
          })
        } else {
          const splits = g.splits as Record<string, number>
          allMiembros.forEach(m => {
            if (m.id === g.pagado_por) return
            const owes = splits[m.id] ?? 0
            if (owes <= 0) return
            net[m.id] = (net[m.id] ?? 0) - owes
            net[g.pagado_por!] = (net[g.pagado_por!] ?? 0) + owes
          })
        }
      })
      allPagos.forEach(p => {
        net[p.de_id] = (net[p.de_id] ?? 0) + p.importe
        net[p.a_id] = (net[p.a_id] ?? 0) - p.importe
      })

      const deudores = allMiembros.filter(m => net[m.id] < -0.5).map(m => m.id)
      const badgeMap = calcularBadges({
        miembros: allMiembros, gastos: allGastos,
        items: (items ?? []) as ItemCompra[],
        tareas: (tareas ?? []) as Tarea[],
        pisos: (pisos ?? []) as Piso[], deudores,
      })

      setMyBadges(badgeMap.get(session!.miembroId) ?? [])
      setLoading(false)
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateSession(updates: Partial<{
    miembroNombre: string; miembroColor: string
    miembroIcono: string | null; miembroFotoUrl: string | null
  }>) {
    if (!session) return
    const updated = { ...session, ...updates }
    setSession(updated)
    setLocalSession(updated)
  }

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === profile?.nombre) {
      setEditingName(false); setNameValue(profile?.nombre ?? ''); return
    }
    await saveField('nombre', trimmed)
    setProfile(prev => prev ? { ...prev, nombre: trimmed } : prev)
    updateSession({ miembroNombre: trimmed })
    setEditingName(false)
  }

  async function handleBioBlur() {
    const dbVal = bioValue.trim() || null
    if (dbVal !== (profile?.bio ?? null)) {
      await saveField('bio', dbVal)
      setProfile(prev => prev ? { ...prev, bio: dbVal } : prev)
    }
  }

  async function handleRolBlur() {
    const dbVal = rolValue.trim() || null
    if (dbVal !== (profile?.rol_casa ?? null)) {
      await saveField('rol_casa', dbVal)
      setProfile(prev => prev ? { ...prev, rol_casa: dbVal } : prev)
    }
  }

  async function handleCumpleBlur() {
    const dbVal = cumpleValue || null
    if (dbVal !== (profile?.cumpleanos ?? null)) {
      await saveField('cumpleanos', dbVal)
      setProfile(prev => prev ? { ...prev, cumpleanos: dbVal } : prev)
    }
  }

  async function handleMetodoPagoBlur() {
    const dbVal = metodoPagoValue.trim() || null
    if (dbVal !== (profile?.metodo_pago ?? null)) {
      await saveField('metodo_pago', dbVal)
      setProfile(prev => prev ? { ...prev, metodo_pago: dbVal } : prev)
    }
  }

  async function handleColorChange(color: string) {
    setSelectedColor(color)
    await saveField('color', color)
    setProfile(prev => prev ? { ...prev, color } : prev)
    updateSession({ miembroColor: color })
  }

  async function handleIconoChange(icono: string | null) {
    setSelectedIcono(icono)
    await saveField('icono', icono)
    setProfile(prev => prev ? { ...prev, icono } : prev)
    updateSession({ miembroIcono: icono })
  }

  async function handleEstadoChange(estado: string | null) {
    setEstadoValue(estado)
    await saveField('estado', estado)
    setProfile(prev => prev ? { ...prev, estado } : prev)
  }

  async function handlePinBadge(badgeId: string | null) {
    setPinnedBadge(badgeId)
    await saveField('badge_destacado', badgeId)
    setProfile(prev => prev ? { ...prev, badge_destacado: badgeId } : prev)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('miembroId', session.miembroId)
      const res = await fetch('/api/upload-avatar', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json()
      setProfile(prev => prev ? { ...prev, foto_url: url } : prev)
      updateSession({ miembroFotoUrl: url })
      flashSave('Foto actualizada')
    } catch {
      setSaveStatus('Error al subir foto')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!session) return null

  if (loading || !profile) {
    return (
      <div className={nunito.variable}>
        <style>{styles}</style>
        <div className="p-loading">
          <div className="p-spinner" />
          <p>{loading ? 'Cargando perfil...' : 'No se pudo cargar el perfil.'}</p>
          {!loading && (
            <button className="p-back-bottom" onClick={() => router.push(`/sala/${codigo}`)}>
              Volver al Nido
            </button>
          )}
        </div>
      </div>
    )
  }

  const myBadgeIds = new Set(myBadges.map(b => b.id))

  return (
    <div className={nunito.variable}>
      <style>{styles}</style>

      {saveStatus && <div className="p-toast">{saveStatus}</div>}

      <div className="p-page">
        {/* ── Header ── */}
        <header className="p-header">
          <button className="p-back" onClick={() => router.push(`/sala/${codigo}`)} aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11.5 3.5l-5 5.5 5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="p-page-title">Mi Perfil</h1>
          <div style={{ width: 36 }} />
        </header>

        {/* ── Hero: Avatar + Name + Bio ── */}
        <section className="p-hero">
          <div className="p-hero-bg" style={{
            background: `linear-gradient(135deg, ${selectedColor}25, ${selectedColor}08)`,
          }} />
          <div className="p-avatar-wrap">
            <div className="p-avatar-ring" style={{ background: selectedColor }}>
              {profile.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.foto_url} alt={profile.nombre} className="p-avatar-img" />
              ) : (
                <MemberAvatar
                  nombre={profile.nombre}
                  color={selectedColor}
                  icono={selectedIcono}
                  size="lg"
                  style={{ width: 88, height: 88 }}
                />
              )}
            </div>
            <button
              className="p-avatar-cam"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <div className="p-spinner-xs" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path d="M6.5 3L7.5 1.5h3L11.5 3H15a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1h3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
          </div>

          {editingName ? (
            <div className="p-name-edit">
              <input
                className="p-name-input"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                autoFocus
                maxLength={40}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') { setEditingName(false); setNameValue(profile.nombre) }
                }}
              />
              <button className="p-name-ok" onClick={handleSaveName}>Guardar</button>
            </div>
          ) : (
            <button className="p-name-display" onClick={() => { setNameValue(profile.nombre); setEditingName(true) }}>
              <span>{profile.nombre}</span>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.4 }}>
                <path d="M9 2.5l2.5 2.5L5 11.5H2.5V9L9 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {profile.rol_casa && <span className="p-rol-tag">{profile.rol_casa}</span>}

          <div className="p-bio-wrap">
            <textarea
              className="p-bio"
              value={bioValue}
              onChange={e => { if (e.target.value.length <= 200) setBioValue(e.target.value) }}
              onBlur={handleBioBlur}
              placeholder="¿Qué estás haciendo?"
              maxLength={200}
              rows={2}
            />
            <span className="p-bio-count">{bioValue.length}/200</span>
          </div>
        </section>

        {/* ── Grid: 2 columns on desktop ── */}
        <div className="p-grid">

          {/* Left column */}
          <div className="p-col">
            {/* Avatar Customization */}
            <section className="p-card" style={{ animationDelay: '0.05s' }}>
              <h2 className="p-card-title">
                <span className="p-card-icon">🎨</span>
                Personalizar Avatar
              </h2>

              <div className="p-field">
                <label className="p-label">Color</label>
                <div className="p-color-row">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={e => handleColorChange(e.target.value)}
                    className="p-color-native"
                    title="Elegir color personalizado"
                  />
                  <div className="p-color-preview" style={{ background: selectedColor }} />
                </div>
              </div>

              <div className="p-field">
                <label className="p-label">
                  Icono
                  {selectedIcono && (
                    <button className="p-remove-btn" onClick={() => handleIconoChange(null)}>quitar</button>
                  )}
                </label>
                <div className="p-icon-grid">
                  {ICONOS.map(ic => (
                    <button
                      key={ic}
                      className={`p-icon-btn${ic === selectedIcono ? ' active' : ''}`}
                      onClick={() => handleIconoChange(ic)}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-preview">
                <MemberAvatar
                  nombre={profile.nombre}
                  color={selectedColor}
                  icono={selectedIcono}
                  size="lg"
                  style={{ width: 52, height: 52 }}
                />
                <span className="p-preview-text">Así te ven</span>
              </div>
            </section>

            {/* Badges */}
            <section className="p-card" style={{ animationDelay: '0.15s' }}>
              <h2 className="p-card-title">
                <span className="p-card-icon">🏆</span>
                Mis Badges
              </h2>
              <div className="p-badges">
                {ALL_BADGE_DEFS.map(def => {
                  const earned = myBadgeIds.has(def.id)
                  return (
                    <div key={def.id} className={`p-badge${earned ? ' earned' : ''}${pinnedBadge === def.id ? ' pinned' : ''}`}>
                      <span className="p-badge-emoji">{def.icono}</span>
                      <div className="p-badge-info">
                        <span className="p-badge-name">{def.nombre}</span>
                        <span className="p-badge-desc">{def.descripcion}</span>
                      </div>
                      {earned && (
                        <button
                          className={`p-badge-pin${pinnedBadge === def.id ? ' active' : ''}`}
                          onClick={() => handlePinBadge(pinnedBadge === def.id ? null : def.id)}
                          title={pinnedBadge === def.id ? 'Quitar pin' : 'Destacar badge'}
                        >
                          📌
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="p-col">
            {/* Sobre mí */}
            <section className="p-card" style={{ animationDelay: '0.1s' }}>
              <h2 className="p-card-title">
                <span className="p-card-icon">📝</span>
                Sobre mí
              </h2>

              <div className="p-field">
                <label className="p-label">Estado actual</label>
                <div className="p-status-grid">
                  {STATUS_PRESETS.map(s => (
                    <button
                      key={s}
                      className={`p-status-chip${estadoValue === s ? ' active' : ''}`}
                      onClick={() => handleEstadoChange(estadoValue === s ? null : s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-field">
                <label className="p-label">Rol en la casa</label>
                <input
                  className="p-input"
                  value={rolValue}
                  onChange={e => setRolValue(e.target.value)}
                  onBlur={handleRolBlur}
                  placeholder='Ej: "El cocinero", "La del WiFi"'
                  maxLength={60}
                />
              </div>

              <div className="p-field">
                <label className="p-label">Cumpleaños</label>
                <input
                  className="p-input"
                  type="date"
                  value={cumpleValue}
                  onChange={e => setCumpleValue(e.target.value)}
                  onBlur={handleCumpleBlur}
                />
              </div>

              <div className="p-field">
                <label className="p-label">Método de pago</label>
                <input
                  className="p-input"
                  value={metodoPagoValue}
                  onChange={e => setMetodoPagoValue(e.target.value)}
                  onBlur={handleMetodoPagoBlur}
                  placeholder='Ej: "MercadoPago: @usuario"'
                  maxLength={100}
                />
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}

const styles = `
  @keyframes p-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes p-spin { to { transform: rotate(360deg); } }
  @keyframes p-toast-slide {
    from { opacity: 0; transform: translate(-50%, -12px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }

  .p-page {
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    background: #FFFCF8;
    min-height: 100dvh;
    max-width: 900px;
    margin: 0 auto;
    padding: 0 16px 48px;
  }

  .p-loading {
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100dvh; gap: 16px;
    color: #7A5540; font-size: 0.95rem;
  }
  .p-spinner {
    width: 28px; height: 28px; border: 3px solid #EAD8C8;
    border-top-color: #C05A3B; border-radius: 50%;
    animation: p-spin 0.7s linear infinite;
  }
  .p-spinner-xs {
    width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white; border-radius: 50%;
    animation: p-spin 0.7s linear infinite;
  }

  .p-toast {
    position: fixed; top: calc(env(safe-area-inset-top, 0px) + 16px);
    left: 50%; transform: translateX(-50%); z-index: 500;
    background: rgba(42,26,14,0.92); color: white; padding: 8px 22px;
    border-radius: 100px; font-size: 0.82rem; font-weight: 600;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    animation: p-toast-slide 0.25s ease-out;
    box-shadow: 0 6px 24px rgba(42,26,14,0.25);
    backdrop-filter: blur(8px);
  }

  /* ── Header ── */
  .p-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 0 12px;
    animation: p-up 0.35s ease-out both;
  }
  .p-back {
    width: 36px; height: 36px; border-radius: 12px;
    border: 1.5px solid #EAD8C8; background: white;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #7A5540; transition: all 0.15s; flex-shrink: 0;
  }
  .p-back:hover { border-color: #C05A3B; color: #C05A3B; }
  .p-back:active { transform: scale(0.93); }
  .p-page-title {
    font-size: 1.05rem; font-weight: 800; color: #2A1A0E;
    letter-spacing: -0.02em;
  }

  /* ── Hero ── */
  .p-hero {
    position: relative; display: flex; flex-direction: column;
    align-items: center; padding: 32px 20px 24px;
    border-radius: 24px; margin-bottom: 16px; overflow: hidden;
    background: white; border: 1px solid #EAD8C8;
    box-shadow: 0 2px 16px rgba(42,26,14,0.04);
    animation: p-up 0.4s ease-out both;
  }
  .p-hero-bg {
    position: absolute; inset: 0; opacity: 0.6;
    transition: background 0.4s ease;
  }

  .p-avatar-wrap {
    position: relative; z-index: 1; margin-bottom: 16px;
  }
  .p-avatar-ring {
    width: 96px; height: 96px; border-radius: 50%; padding: 3px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.4s ease;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  }
  .p-avatar-img {
    width: 88px; height: 88px; border-radius: 50%;
    object-fit: cover; border: 3px solid white;
  }
  .p-avatar-cam {
    position: absolute; bottom: -2px; right: -2px;
    width: 32px; height: 32px; border-radius: 50%;
    background: #2A1A0E; color: white; border: 2.5px solid white;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .p-avatar-cam:hover { background: #C05A3B; transform: scale(1.08); }
  .p-avatar-cam:active { transform: scale(0.93); }
  .p-avatar-cam:disabled { opacity: 0.6; cursor: not-allowed; }

  .p-name-display {
    position: relative; z-index: 1;
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; cursor: pointer;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 1.35rem; font-weight: 800; color: #2A1A0E;
    letter-spacing: -0.02em; transition: opacity 0.15s;
  }
  .p-name-display:hover { opacity: 0.7; }

  .p-name-edit {
    position: relative; z-index: 1;
    display: flex; gap: 8px; align-items: center; width: 100%; max-width: 280px;
  }
  .p-name-input {
    flex: 1; padding: 8px 14px; border-radius: 12px;
    border: 1.5px solid #C05A3B; background: white;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 1rem; font-weight: 700; color: #2A1A0E;
    text-align: center; outline: none;
    box-shadow: 0 0 0 3px rgba(192,90,59,0.12);
  }
  .p-name-ok {
    padding: 8px 16px; border-radius: 12px; border: none;
    background: #2A1A0E; color: white; cursor: pointer;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 0.82rem; font-weight: 700; transition: all 0.15s;
  }
  .p-name-ok:hover { background: #C05A3B; }
  .p-name-ok:active { transform: scale(0.95); }

  .p-rol-tag {
    position: relative; z-index: 1;
    display: inline-block; margin-top: 6px; padding: 3px 14px;
    border-radius: 100px; font-size: 0.75rem; font-weight: 600;
    color: #7A5540; background: rgba(192,90,59,0.08);
    border: 1px solid rgba(192,90,59,0.12);
  }

  .p-bio-wrap {
    position: relative; z-index: 1; width: 100%; max-width: 360px; margin-top: 14px;
  }
  .p-bio {
    width: 100%; padding: 10px 14px; border-radius: 14px;
    border: 1.5px solid transparent; background: rgba(255,252,248,0.8);
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 0.88rem; color: #2A1A0E; outline: none;
    resize: none; text-align: center; transition: all 0.2s;
    min-height: 56px;
  }
  .p-bio:focus {
    border-color: #EAD8C8; background: white;
    box-shadow: 0 0 0 3px rgba(192,90,59,0.06);
  }
  .p-bio::placeholder { color: #B09080; }
  .p-bio-count {
    position: absolute; bottom: 6px; right: 12px;
    font-size: 0.65rem; color: #B09080; pointer-events: none;
  }

  /* ── Grid ── */
  .p-grid {
    display: grid; gap: 16px;
    grid-template-columns: 1fr;
  }
  @media (min-width: 640px) {
    .p-grid { grid-template-columns: 1fr 1fr; }
  }
  .p-col { display: flex; flex-direction: column; gap: 16px; }

  /* ── Cards ── */
  .p-card {
    background: white; border-radius: 20px; padding: 20px;
    border: 1px solid #EAD8C8;
    box-shadow: 0 1px 8px rgba(42,26,14,0.03);
    animation: p-up 0.4s ease-out both;
  }
  .p-card-title {
    font-size: 0.88rem; font-weight: 800; color: #2A1A0E;
    margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    letter-spacing: -0.01em;
  }
  .p-card-icon { font-size: 1rem; }

  /* ── Fields ── */
  .p-field { margin-bottom: 14px; }
  .p-field:last-child { margin-bottom: 0; }

  .p-label {
    font-size: 0.72rem; font-weight: 700; color: #A07060;
    text-transform: uppercase; letter-spacing: 0.5px;
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  }

  .p-input {
    width: 100%; padding: 10px 13px; border-radius: 12px;
    border: 1.5px solid #EAD8C8; background: #FFFCF8;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 0.88rem; color: #2A1A0E; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .p-input:focus {
    border-color: #C05A3B;
    box-shadow: 0 0 0 3px rgba(192,90,59,0.08);
  }
  .p-input::placeholder { color: #B09080; }

  /* ── Color picker ── */
  .p-color-row {
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  }
  .p-color-native {
    width: 40px; height: 40px; border: none; padding: 0;
    border-radius: 12px; cursor: pointer; background: none;
    outline: 2px solid #EAD8C8; outline-offset: 1px;
    transition: outline-color 0.15s, transform 0.15s;
  }
  .p-color-native:hover { outline-color: #C05A3B; transform: scale(1.05); }
  .p-color-native::-webkit-color-swatch-wrapper { padding: 2px; }
  .p-color-native::-webkit-color-swatch { border: none; border-radius: 9px; }
  .p-color-native::-moz-color-swatch { border: none; border-radius: 9px; }

  .p-color-preview {
    width: 40px; height: 40px; border-radius: 12px;
    border: 2px solid rgba(42,26,14,0.1);
    transition: background 0.3s ease;
    box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  }

  /* ── Icon grid ── */
  .p-icon-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .p-icon-btn {
    width: 38px; height: 38px; border-radius: 11px;
    border: 1.5px solid #EAD8C8; background: #FFFCF8;
    font-size: 1.15rem; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .p-icon-btn:hover {
    transform: scale(1.1); border-color: #C05A3B; background: white;
  }
  .p-icon-btn:active { transform: scale(0.93); }
  .p-icon-btn.active {
    border-color: #C05A3B; background: rgba(192,90,59,0.08);
    box-shadow: 0 0 0 2px rgba(192,90,59,0.15);
  }

  .p-remove-btn {
    font-size: 0.68rem; color: #C05A3B; background: none; border: none;
    cursor: pointer; text-decoration: underline; font-weight: 500;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    margin-left: auto; text-transform: none; letter-spacing: 0;
  }
  .p-remove-btn:hover { color: #A8442A; }

  /* ── Preview ── */
  .p-preview {
    display: flex; align-items: center; gap: 12px;
    margin-top: 14px; padding-top: 14px;
    border-top: 1px solid #F0E8E0;
  }
  .p-preview-text { font-size: 0.8rem; color: #A07060; font-weight: 500; }

  /* ── Badges ── */
  .p-badges { display: flex; flex-direction: column; gap: 8px; }
  .p-badge {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; border-radius: 14px;
    border: 1.5px solid #EAD8C8; background: #FFFCF8;
    transition: all 0.2s; opacity: 0.35; filter: grayscale(0.7);
  }
  .p-badge.earned {
    opacity: 1; filter: none; background: white;
    border-color: #D8C4A8;
    box-shadow: 0 1px 6px rgba(42,26,14,0.05);
  }
  .p-badge-emoji { font-size: 1.3rem; flex-shrink: 0; }
  .p-badge-info { min-width: 0; }
  .p-badge-name {
    font-size: 0.82rem; font-weight: 700; color: #2A1A0E;
    display: block;
  }
  .p-badge-desc {
    font-size: 0.7rem; color: #A07060; line-height: 1.3;
  }

  /* ── Bottom back ── */
  .p-back-bottom {
    display: flex; align-items: center; justify-content: center;
    width: 100%; padding: 13px; margin-top: 8px;
    border: 1.5px solid #EAD8C8; border-radius: 14px; background: white;
    font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-size: 0.88rem; font-weight: 600; color: #7A5540;
    cursor: pointer; transition: all 0.15s;
  }
  .p-back-bottom:hover { border-color: #C05A3B; color: #C05A3B; }
  .p-back-bottom:active { transform: scale(0.98); }

  /* Status presets */
  .p-status-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .p-status-chip {
    font-size: 0.78rem; padding: 6px 12px; border-radius: 12px;
    border: 1.5px solid #EAD8C8; background: #FFFCF8;
    cursor: pointer; font-family: var(--font-nunito), 'Nunito', sans-serif;
    font-weight: 600; color: #5A3E30; transition: all 0.15s; white-space: nowrap;
  }
  .p-status-chip:hover { border-color: #C05A3B; background: rgba(192,90,59,0.06); transform: scale(1.03); }
  .p-status-chip:active { transform: scale(0.97); }
  .p-status-chip.active { border-color: #C05A3B; background: rgba(192,90,59,0.1); color: #C05A3B; }

  /* Badge pin */
  .p-badge { position: relative; }
  .p-badge-pin {
    position: absolute; top: 50%; right: 10px; transform: translateY(-50%);
    background: none; border: 1.5px solid transparent; border-radius: 8px;
    font-size: 0.85rem; cursor: pointer; padding: 4px;
    opacity: 0.3; transition: all 0.15s;
  }
  .p-badge:hover .p-badge-pin { opacity: 0.7; }
  .p-badge-pin:hover { opacity: 1 !important; border-color: #C8823A; background: rgba(200,130,58,0.08); }
  .p-badge-pin.active { opacity: 1; border-color: #C8823A; background: rgba(200,130,58,0.12); }
  .p-badge.pinned { border-color: #C8823A; background: rgba(200,130,58,0.05); }
`
