'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { getSession, setSession } from '@/lib/session'
import type { Miembro, Gasto, ItemCompra, Tarea, Piso, Pago } from '@/lib/types'
import MemberAvatar from '@/components/MemberAvatar'
import { calcularBadges, type Badge } from '@/lib/badges'

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-body' })

const COLORES = [
  '#C05A3B', '#5A8869', '#C8823A', '#7B5EA7', '#2E86AB',
  '#E84855', '#3BB273', '#D4A017', '#6B4226', '#1A535C',
]

const ICONOS = [
  '🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🐝', '🦋', '🐙', '🎸',
  '🎮', '🏀', '🌮', '☕', '🍕', '🎯', '🔥', '💎', '🌊', '🌻',
]

const ALL_BADGE_DEFS = [
  { id: 'fundador', icono: '👑', nombre: 'Fundador', descripcion: 'Primer miembro del nido' },
  { id: 'limpio', icono: '🧹', nombre: 'Limpio', descripcion: 'Más tareas completadas' },
  { id: 'generoso', icono: '💰', nombre: 'Generoso', descripcion: 'Mayor gasto total pagado' },
  { id: 'proveedor', icono: '🛒', nombre: 'Proveedor', descripcion: 'Más items de compra agregados' },
  { id: 'explorador', icono: '🏠', nombre: 'Explorador', descripcion: 'Más pisos agregados' },
  { id: 'puntual', icono: '⚡', nombre: 'Al día', descripcion: 'Sin deudas pendientes' },
]

type ProfileData = {
  nombre: string
  color: string
  gradiente: string | null
  icono: string | null
  foto_url: string | null
  bio: string | null
  rol_casa: string | null
  cumpleanos: string | null
  contacto_emergencia: { nombre: string; telefono: string } | null
  metodo_pago: string | null
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

  // Edit states
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [bioValue, setBioValue] = useState('')
  const [rolValue, setRolValue] = useState('')
  const [cumpleValue, setCumpleValue] = useState('')
  const [metodoPagoValue, setMetodoPagoValue] = useState('')
  const [emergNombre, setEmergNombre] = useState('')
  const [emergTelefono, setEmergTelefono] = useState('')

  // Avatar customization
  const [selectedColor, setSelectedColor] = useState('#C05A3B')
  const [selectedGradiente, setSelectedGradiente] = useState<string | null>(null)
  const [selectedIcono, setSelectedIcono] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show save feedback
  const flashSave = useCallback((msg = 'Guardado') => {
    setSaveStatus(msg)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaveStatus(null), 1500)
  }, [])

  // Auto-save a field to DB
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

  // Load profile data
  useEffect(() => {
    if (!session) {
      router.push(`/sala/${codigo}`)
      return
    }

    async function loadData() {
      const { data: miembro } = await supabase
        .from('miembros')
        .select('*')
        .eq('id', session!.miembroId)
        .single() as { data: Miembro | null }

      if (!miembro) {
        setLoading(false)
        return
      }

      const p: ProfileData = {
        nombre: miembro.nombre,
        color: miembro.color,
        gradiente: miembro.gradiente,
        icono: miembro.icono,
        foto_url: miembro.foto_url,
        bio: miembro.bio,
        rol_casa: miembro.rol_casa,
        cumpleanos: miembro.cumpleanos,
        contacto_emergencia: miembro.contacto_emergencia as ProfileData['contacto_emergencia'],
        metodo_pago: miembro.metodo_pago,
      }
      setProfile(p)
      setNameValue(p.nombre)
      setBioValue(p.bio ?? '')
      setRolValue(p.rol_casa ?? '')
      setCumpleValue(p.cumpleanos ?? '')
      setMetodoPagoValue(p.metodo_pago ?? '')
      setEmergNombre(p.contacto_emergencia?.nombre ?? '')
      setEmergTelefono(p.contacto_emergencia?.telefono ?? '')
      setSelectedColor(p.color)
      setSelectedGradiente(p.gradiente)
      setSelectedIcono(p.icono)

      // Load badge data
      const salaId = session!.salaId
      const [
        { data: miembros },
        { data: gastos },
        { data: items },
        { data: tareas },
        { data: pisos },
        { data: pagos },
      ] = await Promise.all([
        supabase.from('miembros').select('*').eq('sala_id', salaId),
        supabase.from('gastos').select('*').eq('sala_id', salaId),
        supabase.from('items_compra').select('*').eq('sala_id', salaId),
        supabase.from('tareas').select('*').eq('sala_id', salaId),
        supabase.from('pisos').select('*').eq('sala_id', salaId),
        supabase.from('pagos').select('*').eq('sala_id', salaId),
      ])

      // Calculate deudores (members with net < -0.5)
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
        miembros: allMiembros,
        gastos: allGastos,
        items: (items ?? []) as ItemCompra[],
        tareas: (tareas ?? []) as Tarea[],
        pisos: (pisos ?? []) as Piso[],
        deudores,
      })

      setMyBadges(badgeMap.get(session!.miembroId) ?? [])
      setLoading(false)
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update session helper
  function updateSession(updates: Partial<{
    miembroNombre: string
    miembroColor: string
    miembroGradiente: string | null
    miembroIcono: string | null
    miembroFotoUrl: string | null
  }>) {
    if (!session) return
    const updated = { ...session, ...updates }
    setSession(updated)
    setLocalSession(updated)
  }

  // --- Handlers ---

  async function handleSaveName() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === profile?.nombre) {
      setEditingName(false)
      setNameValue(profile?.nombre ?? '')
      return
    }
    await saveField('nombre', trimmed)
    setProfile(prev => prev ? { ...prev, nombre: trimmed } : prev)
    updateSession({ miembroNombre: trimmed })
    setEditingName(false)
  }

  async function handleBioChange(val: string) {
    if (val.length > 200) return
    setBioValue(val)
  }

  async function handleBioBlur() {
    const trimmed = bioValue.trim()
    const dbVal = trimmed || null
    if (dbVal !== (profile?.bio ?? null)) {
      await saveField('bio', dbVal)
      setProfile(prev => prev ? { ...prev, bio: dbVal } : prev)
    }
  }

  async function handleRolBlur() {
    const trimmed = rolValue.trim()
    const dbVal = trimmed || null
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
    const trimmed = metodoPagoValue.trim()
    const dbVal = trimmed || null
    if (dbVal !== (profile?.metodo_pago ?? null)) {
      await saveField('metodo_pago', dbVal)
      setProfile(prev => prev ? { ...prev, metodo_pago: dbVal } : prev)
    }
  }

  async function handleEmergenciaBlur() {
    const nombre = emergNombre.trim()
    const telefono = emergTelefono.trim()
    const dbVal = (nombre && telefono) ? { nombre, telefono } : null
    const prev = profile?.contacto_emergencia
    if (JSON.stringify(dbVal) !== JSON.stringify(prev ?? null)) {
      await saveField('contacto_emergencia', dbVal)
      setProfile(p => p ? { ...p, contacto_emergencia: dbVal } : p)
    }
  }

  async function handleColorChange(color: string) {
    setSelectedColor(color)
    await saveField('color', color)
    setProfile(prev => prev ? { ...prev, color } : prev)
    updateSession({ miembroColor: color })
  }

  async function handleGradienteChange(gradiente: string | null) {
    setSelectedGradiente(gradiente)
    await saveField('gradiente', gradiente)
    setProfile(prev => prev ? { ...prev, gradiente } : prev)
    updateSession({ miembroGradiente: gradiente })
  }

  async function handleIconoChange(icono: string | null) {
    setSelectedIcono(icono)
    await saveField('icono', icono)
    setProfile(prev => prev ? { ...prev, icono } : prev)
    updateSession({ miembroIcono: icono })
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
      await supabase.from('miembros').update({ foto_url: url }).eq('id', session.miembroId)
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

  if (loading) {
    return (
      <div className={`${fraunces.variable} ${nunito.variable}`}>
        <style>{styles}</style>
        <div className="perfil-loading">
          <div className="perfil-spinner" />
          <p>Cargando perfil...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={`${fraunces.variable} ${nunito.variable}`}>
        <style>{styles}</style>
        <div className="perfil-loading">
          <p>No se pudo cargar el perfil.</p>
          <button className="perfil-btn-back" onClick={() => router.push(`/sala/${codigo}`)}>
            Volver al Nido
          </button>
        </div>
      </div>
    )
  }

  const myBadgeIds = new Set(myBadges.map(b => b.id))

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{styles}</style>

      <div className="perfil-page">
        {/* Save toast */}
        {saveStatus && (
          <div className="perfil-toast">{saveStatus}</div>
        )}

        {/* Header */}
        <header className="perfil-header">
          <button
            className="perfil-back-btn"
            onClick={() => router.push(`/sala/${codigo}`)}
            aria-label="Volver"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="perfil-header-text">
            <h1 className="perfil-title">Mi Perfil</h1>
            <p className="perfil-subtitle">{profile.nombre}</p>
          </div>
        </header>

        {/* Section 1: Avatar & Identity */}
        <section className="perfil-card perfil-card-identity">
          <div className="perfil-avatar-wrapper">
            <div className="perfil-avatar-container">
              {profile.foto_url ? (
                <div className="perfil-avatar-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={profile.foto_url} alt={profile.nombre} />
                </div>
              ) : (
                <MemberAvatar
                  nombre={profile.nombre}
                  color={selectedColor}
                  gradiente={selectedGradiente}
                  icono={selectedIcono}
                  size="lg"
                  style={{ width: 96, height: 96, fontSize: 40 }}
                />
              )}
              <button
                className="perfil-avatar-camera"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Cambiar foto"
              >
                {uploadingPhoto ? (
                  <div className="perfil-spinner-small" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M6.5 3L7.5 1.5h3L11.5 3H15a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1h3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoUpload}
              />
            </div>
          </div>

          {/* Name */}
          <div className="perfil-field">
            <label className="perfil-label">Nombre</label>
            {editingName ? (
              <div className="perfil-input-row">
                <input
                  className="perfil-input"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  autoFocus
                  maxLength={40}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') { setEditingName(false); setNameValue(profile.nombre) }
                  }}
                />
                <button className="perfil-input-action save" onClick={handleSaveName}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button className="perfil-input-action cancel" onClick={() => { setEditingName(false); setNameValue(profile.nombre) }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="perfil-value-row" onClick={() => { setNameValue(profile.nombre); setEditingName(true) }}>
                <span className="perfil-value">{profile.nombre}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="perfil-edit-icon">
                  <path d="M9 2.5l2.5 2.5L5 11.5H2.5V9L9 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>

          {/* Bio */}
          <div className="perfil-field">
            <label className="perfil-label">
              Estado
              <span className="perfil-char-count">{bioValue.length}/200</span>
            </label>
            <textarea
              className="perfil-textarea"
              value={bioValue}
              onChange={e => handleBioChange(e.target.value)}
              onBlur={handleBioBlur}
              placeholder="¿Qué estás haciendo?"
              maxLength={200}
              rows={3}
            />
          </div>

          {/* Rol */}
          <div className="perfil-field">
            <label className="perfil-label">Rol en la casa</label>
            <input
              className="perfil-input"
              value={rolValue}
              onChange={e => setRolValue(e.target.value)}
              onBlur={handleRolBlur}
              placeholder='Ej: "El cocinero", "La del WiFi"'
              maxLength={60}
            />
          </div>
        </section>

        {/* Section 2: Avatar Customization */}
        <section className="perfil-card">
          <h2 className="perfil-section-title">Personalizar Avatar</h2>

          {/* Color picker */}
          <div className="perfil-field">
            <label className="perfil-label">Color</label>
            <div className="perfil-color-grid">
              {COLORES.map(c => (
                <button
                  key={c}
                  className={`perfil-color-dot${c === selectedColor ? ' active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => handleColorChange(c)}
                  title={c}
                >
                  {c === selectedColor && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Gradient picker */}
          <div className="perfil-field">
            <label className="perfil-label">
              Gradiente
              {selectedGradiente && (
                <button className="perfil-remove-btn" onClick={() => handleGradienteChange(null)}>
                  quitar
                </button>
              )}
            </label>
            <div className="perfil-color-grid">
              {COLORES.filter(c => c !== selectedColor).map(c => (
                <button
                  key={c}
                  className={`perfil-color-dot${c === selectedGradiente ? ' active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => handleGradienteChange(c)}
                  title={c}
                >
                  {c === selectedGradiente && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div className="perfil-field">
            <label className="perfil-label">
              Icono
              {selectedIcono && (
                <button className="perfil-remove-btn" onClick={() => handleIconoChange(null)}>
                  quitar
                </button>
              )}
            </label>
            <div className="perfil-icon-grid">
              {ICONOS.map(ic => (
                <button
                  key={ic}
                  className={`perfil-icon-btn${ic === selectedIcono ? ' active' : ''}`}
                  onClick={() => handleIconoChange(ic)}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="perfil-preview-row">
            <span className="perfil-preview-label">Vista previa</span>
            <MemberAvatar
              nombre={profile.nombre}
              color={selectedColor}
              gradiente={selectedGradiente}
              icono={selectedIcono}
              size="lg"
              style={{ width: 56, height: 56 }}
            />
          </div>
        </section>

        {/* Section 3: Info Personal */}
        <section className="perfil-card">
          <h2 className="perfil-section-title">Info Personal</h2>

          {/* Birthday */}
          <div className="perfil-field">
            <label className="perfil-label">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                <path d="M7 1v2M3 6h8v6a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM5 3.5a2 2 0 014 0V6H5V3.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
              {' '}Cumpleaños
            </label>
            <input
              className="perfil-input"
              type="date"
              value={cumpleValue}
              onChange={e => setCumpleValue(e.target.value)}
              onBlur={handleCumpleBlur}
            />
          </div>

          {/* Payment method */}
          <div className="perfil-field">
            <label className="perfil-label">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
                <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.1" />
              </svg>
              {' '}Método de pago
            </label>
            <input
              className="perfil-input"
              value={metodoPagoValue}
              onChange={e => setMetodoPagoValue(e.target.value)}
              onBlur={handleMetodoPagoBlur}
              placeholder='Ej: "MercadoPago: @usuario"'
              maxLength={100}
            />
          </div>

          {/* Emergency contact */}
          <div className="perfil-field">
            <label className="perfil-label">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: -2 }}>
                <path d="M7 1L1 5v7a1 1 0 001 1h10a1 1 0 001-1V5L7 1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                <path d="M7 7v3M7 5.5v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {' '}Contacto de emergencia
            </label>
            <div className="perfil-emergency-row">
              <input
                className="perfil-input"
                value={emergNombre}
                onChange={e => setEmergNombre(e.target.value)}
                onBlur={handleEmergenciaBlur}
                placeholder="Nombre"
                maxLength={60}
              />
              <input
                className="perfil-input"
                value={emergTelefono}
                onChange={e => setEmergTelefono(e.target.value)}
                onBlur={handleEmergenciaBlur}
                placeholder="Teléfono"
                maxLength={30}
                type="tel"
              />
            </div>
          </div>
        </section>

        {/* Section 4: Badges */}
        <section className="perfil-card">
          <h2 className="perfil-section-title">Mis Badges</h2>
          <div className="perfil-badge-grid">
            {ALL_BADGE_DEFS.map(def => {
              const earned = myBadgeIds.has(def.id)
              return (
                <div key={def.id} className={`perfil-badge${earned ? ' earned' : ''}`}>
                  <span className="perfil-badge-icon">{def.icono}</span>
                  <span className="perfil-badge-name">{def.nombre}</span>
                  <span className="perfil-badge-desc">{def.descripcion}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Bottom back button */}
        <button
          className="perfil-btn-back"
          onClick={() => router.push(`/sala/${codigo}`)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 6 }}>
            <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver al Nido
        </button>
      </div>
    </div>
  )
}

const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  @keyframes perfil-fadeup {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes perfil-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes perfil-toast-in {
    from { opacity: 0; transform: translate(-50%, -8px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }

  .perfil-page {
    font-family: var(--font-body), 'Nunito', sans-serif;
    background: #FFFCF8;
    min-height: 100dvh;
    padding: 0 16px 40px;
    max-width: 480px;
    margin: 0 auto;
    position: relative;
  }

  .perfil-loading {
    font-family: var(--font-body), 'Nunito', sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    gap: 16px;
    color: #7A5540;
    font-size: 0.95rem;
  }

  .perfil-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #EAD8C8;
    border-top-color: #C05A3B;
    border-radius: 50%;
    animation: perfil-spin 0.7s linear infinite;
  }

  .perfil-spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: perfil-spin 0.7s linear infinite;
  }

  /* Toast */
  .perfil-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #2A1A0E;
    color: white;
    padding: 8px 20px;
    border-radius: 24px;
    font-size: 0.82rem;
    font-weight: 600;
    font-family: var(--font-body), 'Nunito', sans-serif;
    z-index: 100;
    animation: perfil-toast-in 0.25s ease-out;
    box-shadow: 0 4px 20px rgba(42,26,14,0.2);
  }

  /* Header */
  .perfil-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0 16px;
    animation: perfil-fadeup 0.4s ease-out both;
  }

  .perfil-back-btn {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    border: 1.5px solid #EAD8C8;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #7A5540;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .perfil-back-btn:hover {
    background: #FDF5EE;
    border-color: #C05A3B;
    color: #C05A3B;
  }
  .perfil-back-btn:active {
    transform: scale(0.95);
  }

  .perfil-header-text {
    flex: 1;
    min-width: 0;
  }

  .perfil-title {
    font-family: var(--font-serif), 'Fraunces', serif;
    font-size: 1.5rem;
    font-weight: 600;
    color: #2A1A0E;
    line-height: 1.2;
  }

  .perfil-subtitle {
    font-size: 0.85rem;
    color: #A07060;
    margin-top: 2px;
  }

  /* Cards */
  .perfil-card {
    background: white;
    border-radius: 20px;
    padding: 24px 20px;
    margin-bottom: 16px;
    border: 1px solid #EAD8C8;
    box-shadow: 0 2px 12px rgba(42,26,14,0.04);
    animation: perfil-fadeup 0.4s ease-out both;
  }
  .perfil-card:nth-child(3) { animation-delay: 0.06s; }
  .perfil-card:nth-child(4) { animation-delay: 0.12s; }
  .perfil-card:nth-child(5) { animation-delay: 0.18s; }
  .perfil-card:nth-child(6) { animation-delay: 0.24s; }

  .perfil-card-identity {
    text-align: center;
  }

  .perfil-section-title {
    font-family: var(--font-serif), 'Fraunces', serif;
    font-size: 1.05rem;
    font-weight: 600;
    color: #2A1A0E;
    margin-bottom: 16px;
  }

  /* Avatar */
  .perfil-avatar-wrapper {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
  }

  .perfil-avatar-container {
    position: relative;
    width: 96px;
    height: 96px;
  }

  .perfil-avatar-photo {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid #EAD8C8;
  }
  .perfil-avatar-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .perfil-avatar-camera {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #C05A3B;
    color: white;
    border: 3px solid white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(192,90,59,0.3);
  }
  .perfil-avatar-camera:hover {
    background: #A8442A;
    transform: scale(1.05);
  }
  .perfil-avatar-camera:active {
    transform: scale(0.95);
  }
  .perfil-avatar-camera:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  /* Fields */
  .perfil-field {
    margin-bottom: 16px;
    text-align: left;
  }
  .perfil-field:last-child {
    margin-bottom: 0;
  }

  .perfil-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #A07060;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .perfil-char-count {
    font-weight: 400;
    font-size: 0.72rem;
    color: #B09080;
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
  }

  .perfil-input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #EAD8C8;
    border-radius: 12px;
    background: #FFFCF8;
    font-family: var(--font-body), 'Nunito', sans-serif;
    font-size: 0.9rem;
    color: #2A1A0E;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .perfil-input:focus {
    border-color: #C05A3B;
    box-shadow: 0 0 0 3px rgba(192,90,59,0.1);
  }
  .perfil-input::placeholder {
    color: #B09080;
  }

  .perfil-textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid #EAD8C8;
    border-radius: 12px;
    background: #FFFCF8;
    font-family: var(--font-body), 'Nunito', sans-serif;
    font-size: 0.9rem;
    color: #2A1A0E;
    outline: none;
    resize: vertical;
    min-height: 72px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .perfil-textarea:focus {
    border-color: #C05A3B;
    box-shadow: 0 0 0 3px rgba(192,90,59,0.1);
  }
  .perfil-textarea::placeholder {
    color: #B09080;
  }

  .perfil-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .perfil-input-row .perfil-input {
    flex: 1;
  }

  .perfil-input-action {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .perfil-input-action.save {
    background: #5A8869;
    color: white;
  }
  .perfil-input-action.save:hover {
    background: #4A7559;
  }
  .perfil-input-action.cancel {
    background: #F5EBE5;
    color: #A07060;
  }
  .perfil-input-action.cancel:hover {
    background: #EAD8C8;
  }
  .perfil-input-action:active {
    transform: scale(0.92);
  }

  .perfil-value-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1.5px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
  }
  .perfil-value-row:hover {
    background: #FDF5EE;
    border-color: #EAD8C8;
  }

  .perfil-value {
    flex: 1;
    font-size: 0.95rem;
    color: #2A1A0E;
    font-weight: 500;
  }

  .perfil-edit-icon {
    color: #B09080;
    flex-shrink: 0;
    transition: color 0.2s;
  }
  .perfil-value-row:hover .perfil-edit-icon {
    color: #C05A3B;
  }

  /* Color grid */
  .perfil-color-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .perfil-color-dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 3px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    position: relative;
  }
  .perfil-color-dot:hover {
    transform: scale(1.12);
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
  }
  .perfil-color-dot:active {
    transform: scale(0.95);
  }
  .perfil-color-dot.active {
    border-color: #2A1A0E;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #2A1A0E;
  }

  /* Icon grid */
  .perfil-icon-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .perfil-icon-btn {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1.5px solid #EAD8C8;
    background: #FFFCF8;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .perfil-icon-btn:hover {
    transform: scale(1.1);
    border-color: #C05A3B;
    background: white;
  }
  .perfil-icon-btn:active {
    transform: scale(0.95);
  }
  .perfil-icon-btn.active {
    border-color: #C05A3B;
    background: rgba(192,90,59,0.08);
    box-shadow: 0 0 0 2px rgba(192,90,59,0.2);
  }

  .perfil-remove-btn {
    font-size: 0.7rem;
    color: #C05A3B;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    font-family: var(--font-body), 'Nunito', sans-serif;
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .perfil-remove-btn:hover {
    color: #A8442A;
  }

  /* Preview row */
  .perfil-preview-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #F0E6DC;
  }

  .perfil-preview-label {
    font-size: 0.82rem;
    color: #A07060;
    font-weight: 500;
  }

  /* Emergency row */
  .perfil-emergency-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  @media (min-width: 400px) {
    .perfil-emergency-row {
      flex-direction: row;
    }
    .perfil-emergency-row .perfil-input {
      flex: 1;
    }
  }

  /* Badges */
  .perfil-badge-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  @media (min-width: 420px) {
    .perfil-badge-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .perfil-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    border-radius: 16px;
    border: 1.5px solid #EAD8C8;
    background: #FFFCF8;
    text-align: center;
    transition: all 0.2s;
    opacity: 0.35;
    filter: grayscale(0.8);
  }
  .perfil-badge.earned {
    opacity: 1;
    filter: none;
    background: white;
    border-color: #D4B896;
    box-shadow: 0 2px 8px rgba(42,26,14,0.06);
  }

  .perfil-badge-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .perfil-badge-name {
    font-size: 0.78rem;
    font-weight: 700;
    color: #2A1A0E;
  }

  .perfil-badge-desc {
    font-size: 0.68rem;
    color: #A07060;
    line-height: 1.3;
  }

  /* Back button */
  .perfil-btn-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 14px;
    margin-top: 8px;
    margin-bottom: 16px;
    border: 1.5px solid #EAD8C8;
    border-radius: 16px;
    background: white;
    font-family: var(--font-body), 'Nunito', sans-serif;
    font-size: 0.92rem;
    font-weight: 600;
    color: #7A5540;
    cursor: pointer;
    transition: all 0.2s;
    animation: perfil-fadeup 0.4s ease-out both;
    animation-delay: 0.3s;
  }
  .perfil-btn-back:hover {
    background: #FDF5EE;
    border-color: #C05A3B;
    color: #C05A3B;
  }
  .perfil-btn-back:active {
    transform: scale(0.98);
  }
`
