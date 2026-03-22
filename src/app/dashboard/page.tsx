'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Nunito } from 'next/font/google'
import { createClient } from '@/lib/supabase'
import { setSession, clearSession } from '@/lib/session'
import { getWeekString, getPreviousWeekString, getNextAssignee, getWeekNumber, getWeekDateRange } from '@/lib/tareas'
import type { Sala, Miembro, Tarea } from '@/lib/types'
import type { PostgrestError } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

type DbResult<T> = { data: T | null; error: PostgrestError | null }
type MiembroConSala = Miembro & { salas: Sala }

const fraunces = Fraunces({ weight: 'variable', subsets: ['latin'], variable: '--font-serif' })
const nunito = Nunito({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-body' })

const COLORES = [
  '#C05A3B', '#5A8869', '#C8823A', '#7B5EA7', '#2E86AB',
  '#E84855', '#3BB273', '#D4A017', '#6B4226', '#1A535C',
]

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [membership, setMembership] = useState<MiembroConSala | null>(null)
  const [loading, setLoading] = useState(true)

  // Members
  const [miembros, setMiembros] = useState<Miembro[]>([])

  // Tareas
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [tareasLoading, setTareasLoading] = useState(false)
  const currentWeek = getWeekString()

  // Add task
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // Reassign dropdown
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null)
  const reassignRef = useRef<HTMLDivElement>(null)

  // Create nido modal
  const [showCreate, setShowCreate] = useState(false)
  const [cNombreNido, setCNombreNido] = useState('')
  const [cCodigo, setCCodigo] = useState('')
  const [cNombre, setCNombre] = useState('')
  const [cLoading, setCLoading] = useState(false)
  const [cError, setCError] = useState('')
  const [cShowCodigo, setCShowCodigo] = useState(false)

  // Leave nido
  const [showLeave, setShowLeave] = useState(false)
  const [leaveLoading, setLeaveLoading] = useState(false)

  const loadTareas = useCallback(async (salaId: string, members: Miembro[]) => {
    setTareasLoading(true)
    const supabase = createClient()
    const week = getWeekString()

    const { data: tareasData } = await supabase
      .from('tareas')
      .select('*')
      .eq('sala_id', salaId)
      .eq('semana', week)
      .order('creado_en')

    if (tareasData && tareasData.length > 0) {
      setTareas(tareasData as Tarea[])
    } else {
      // Auto-rotate from previous week
      const prevWeek = getPreviousWeekString()
      const { data: prevTareas } = await supabase
        .from('tareas')
        .select('*')
        .eq('sala_id', salaId)
        .eq('semana', prevWeek)
        .order('creado_en')

      if (prevTareas && prevTareas.length > 0) {
        const memberIds = members.map(m => m.id)
        const prev = prevTareas as Tarea[]
        const newTasks = prev.map(t => ({
          sala_id: salaId,
          nombre: t.nombre,
          asignada_a: getNextAssignee(t.asignada_a, memberIds),
          semana: week,
          completada: false,
        }))

        const { data: inserted } = await supabase
          .from('tareas')
          .insert(newTasks)
          .select()

        if (inserted) setTareas(inserted as Tarea[])
      }
    }
    setTareasLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.replace('/'); return }
      setUser(u)

      const { data } = await supabase
        .from('miembros')
        .select('*, salas(*)')
        .eq('user_id', u.id)

      const memberships = (data ?? []) as MiembroConSala[]

      if (memberships.length > 0) {
        const m = memberships[0]
        setMembership(m)

        setSession({
          salaId: m.salas.id,
          salaCodigo: m.salas.codigo,
          salaNombre: m.salas.nombre,
          miembroId: m.id,
          miembroNombre: m.nombre,
          miembroColor: m.color,
        })

        // Load active members only (user_id IS NOT NULL)
        const { data: miembrosData } = await supabase
          .from('miembros')
          .select('*')
          .eq('sala_id', m.salas.id)
          .not('user_id', 'is', null)

        const activeMiembros = (miembrosData ?? []) as Miembro[]
        setMiembros(activeMiembros)

        await loadTareas(m.salas.id, activeMiembros)
      }
      setLoading(false)
    })
  }, [router, loadTareas])

  // Realtime for tareas + miembros
  useEffect(() => {
    if (!membership) return
    const supabase = createClient()
    const salaId = membership.salas.id
    const week = getWeekString()

    const chTareas = supabase
      .channel(`tareas_dash_${salaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas', filter: `sala_id=eq.${salaId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const t = payload.new as Tarea
          if (t.semana === week) setTareas(prev => prev.some(x => x.id === t.id) ? prev : [...prev, t])
        } else if (payload.eventType === 'UPDATE') {
          setTareas(prev => prev.map(t => t.id === (payload.new as Tarea).id ? payload.new as Tarea : t))
        } else if (payload.eventType === 'DELETE') {
          setTareas(prev => prev.filter(t => t.id !== (payload.old as Partial<Tarea>).id))
        }
      })
      .subscribe()

    const chMiembros = supabase
      .channel(`miembros_dash_${salaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'miembros', filter: `sala_id=eq.${salaId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const m = payload.new as Miembro
          if (m.user_id) setMiembros(prev => [...prev, m])
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Miembro
          setMiembros(prev => {
            const existing = prev.find(x => x.id === updated.id)
            if (existing && existing.user_id != null && !updated.user_id) {
              return prev.filter(x => x.id !== updated.id)
            }
            if (!existing && updated.user_id) return [...prev, updated]
            return prev.map(x => x.id === updated.id ? updated : x)
          })
        } else if (payload.eventType === 'DELETE') {
          setMiembros(prev => prev.filter(x => x.id !== (payload.old as Partial<Miembro>).id))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(chTareas)
      supabase.removeChannel(chMiembros)
    }
  }, [membership])

  // Close reassign dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (reassignRef.current && !reassignRef.current.contains(e.target as Node)) setReassignTaskId(null)
    }
    if (reassignTaskId) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [reassignTaskId])

  async function handleSignOut() {
    const supabase = createClient()
    clearSession()
    await supabase.auth.signOut()
    router.replace('/')
  }

  function enterSala() {
    if (membership) router.push(`/sala/${membership.salas.codigo}`)
  }

  async function handleCrearNido(e: React.FormEvent) {
    e.preventDefault(); setCError('')
    if (!cNombreNido.trim()) { setCError('Ingresá el nombre del nido'); return }
    if (cCodigo.trim().length < 3) { setCError('La contraseña del nido debe tener mínimo 3 caracteres'); return }
    if (!cNombre.trim()) { setCError('Ingresá tu nombre en el nido'); return }
    setCLoading(true)

    const supabase = createClient()

    const { data: existe } = await supabase.from('salas').select('id').eq('codigo', cCodigo.trim()).single()
    if (existe) { setCError('Esa contraseña ya está en uso. Elegí otra.'); setCLoading(false); return }

    const { data: sala, error: sErr } = await supabase
      .from('salas').insert({ codigo: cCodigo.trim(), nombre: cNombreNido.trim(), owner_user_id: user!.id })
      .select().single() as DbResult<Sala>
    if (sErr || !sala) { setCError('Error al crear el nido'); setCLoading(false); return }

    const { data: miembro, error: mErr } = await supabase
      .from('miembros')
      .insert({ sala_id: sala.id, nombre: cNombre.trim().toLowerCase(), color: COLORES[0], user_id: user!.id })
      .select().single() as DbResult<Miembro>
    if (mErr || !miembro) { setCError('Error al crear tu cuenta'); setCLoading(false); return }

    setSession({
      salaId: sala.id, salaCodigo: sala.codigo, salaNombre: sala.nombre,
      miembroId: miembro.id, miembroNombre: miembro.nombre, miembroColor: miembro.color,
    })
    router.push(`/sala/${sala.codigo}`)
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskName.trim() || !membership) return
    setAddingTask(true)

    const supabase = createClient()
    const assignee = newTaskAssignee || miembros[0]?.id || null

    const { data } = await supabase
      .from('tareas')
      .insert({
        sala_id: membership.salas.id,
        nombre: newTaskName.trim(),
        asignada_a: assignee,
        semana: currentWeek,
        completada: false,
      })
      .select()
      .single() as DbResult<Tarea>

    if (data) {
      setTareas(prev => [...prev, data])
      setNewTaskName('')
      setNewTaskAssignee('')
      setShowAddForm(false)
    }
    setAddingTask(false)
  }

  async function handleToggleTask(taskId: string, completada: boolean) {
    // Optimistic update
    setTareas(prev => prev.map(t => t.id === taskId ? { ...t, completada: !completada } : t))
    const supabase = createClient()
    await supabase.from('tareas').update({ completada: !completada }).eq('id', taskId)
  }

  async function handleDeleteTask(taskId: string) {
    setTareas(prev => prev.filter(t => t.id !== taskId))
    const supabase = createClient()
    await supabase.from('tareas').delete().eq('id', taskId)
  }

  async function handleReassignTask(taskId: string, newAssigneeId: string) {
    setTareas(prev => prev.map(t => t.id === taskId ? { ...t, asignada_a: newAssigneeId } : t))
    setReassignTaskId(null)
    const supabase = createClient()
    await supabase.from('tareas').update({ asignada_a: newAssigneeId }).eq('id', taskId)
  }

  async function handleLeave() {
    if (!membership) return
    setLeaveLoading(true)
    const supabase = createClient()
    await supabase.from('miembros').update({ user_id: null }).eq('id', membership.id)
    clearSession()
    setMembership(null)
    setMiembros([])
    setTareas([])
    setShowLeave(false)
    setLeaveLoading(false)
  }

  const completedCount = tareas.filter(t => t.completada).length

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#FAF5EE' }}>
      <div style={{ width:36, height:36, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div className={`${fraunces.variable} ${nunito.variable}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes d-spin  { to { transform: rotate(360deg); } }
        @keyframes d-up    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes d-in    { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        @keyframes d-modal { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes d-check { from { transform: scale(0); } to { transform: scale(1); } }

        .d-root { min-height: 100vh; background: #FAF5EE; font-family: var(--font-body),'Nunito',system-ui,sans-serif; color: #2A1A0E; }
        .d-bg { position:fixed; inset:0; background-image:radial-gradient(circle at 15% 20%, rgba(192,90,59,0.05) 0%, transparent 40%), radial-gradient(circle at 85% 80%, rgba(200,130,58,0.05) 0%, transparent 40%); pointer-events:none; z-index:0; }
        .d-wrap { position:relative; z-index:1; max-width:520px; margin:0 auto; padding:0 1.25rem 4rem; }

        .d-header { display:flex; align-items:center; justify-content:space-between; padding:1.75rem 0 2rem; animation:d-in 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .d-logo { display:flex; align-items:center; gap:8px; }
        .d-logo-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.5rem; color:#2A1A0E; letter-spacing:-0.02em; font-weight:600; }
        .d-signout { font-size:0.82rem; color:#A07060; background:none; border:none; cursor:pointer; transition:color 0.18s; font-family:var(--font-body),'Nunito',sans-serif; }
        .d-signout:hover { color:#C04040; }

        .d-greeting { margin-bottom:1.5rem; animation:d-up 0.5s 0.05s cubic-bezier(0.22,1,0.36,1) both; }
        .d-greeting-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.75rem; color:#2A1A0E; letter-spacing:-0.02em; font-weight:600; margin-bottom:4px; }
        .d-greeting-sub { font-size:0.87rem; color:#A07060; }

        .d-section-label { font-size:0.7rem; font-weight:700; color:#B09080; text-transform:uppercase; letter-spacing:0.09em; margin-bottom:10px; }

        /* Nido card */
        .d-nido-card {
          background:white; border-radius:18px; border:1.5px solid #EAD8C8;
          padding:1.1rem 1.25rem; margin-bottom:1.25rem;
          display:flex; align-items:center; justify-content:space-between;
          cursor:pointer; transition:all 0.2s;
          box-shadow:0 2px 12px rgba(150,80,40,0.06);
          animation:d-up 0.5s cubic-bezier(0.22,1,0.36,1) both;
          width:100%; text-align:left; border:1.5px solid #EAD8C8;
        }
        .d-nido-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(150,80,40,0.12); border-color:#D4B8A0; }
        .d-nido-info { display:flex; align-items:center; gap:12px; }
        .d-nido-av { width:42px; height:42px; border-radius:12px; background:#C05A3B; display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0; }
        .d-nido-name { font-size:1rem; font-weight:700; color:#2A1A0E; margin-bottom:2px; font-family:var(--font-serif),'Georgia',serif; }
        .d-nido-meta { font-size:0.78rem; color:#A07060; }
        .d-nido-arrow { color:#D4B8A0; flex-shrink:0; }

        /* Quick modules */
        .d-modules { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:1.25rem; animation:d-up 0.5s 0.08s cubic-bezier(0.22,1,0.36,1) both; }
        .d-module { background:white; border-radius:14px; border:1.5px solid #EAD8C8; padding:0.85rem 0.6rem; text-align:center; cursor:pointer; transition:all 0.2s; text-decoration:none; display:block; }
        .d-module:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(150,80,40,0.12); border-color:#D4B8A0; }
        .d-module-icon { font-size:1.3rem; margin-bottom:3px; }
        .d-module-name { font-size:0.78rem; font-weight:600; color:#2A1A0E; }

        /* Members */
        .d-members { background:white; border-radius:18px; border:1.5px solid #EAD8C8; padding:1rem 1.25rem; margin-bottom:1.25rem; box-shadow:0 2px 12px rgba(150,80,40,0.06); animation:d-up 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
        .d-members-list { display:flex; gap:14px; flex-wrap:wrap; }
        .d-member { display:flex; align-items:center; gap:8px; }
        .d-member-av { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.72rem; font-weight:700; color:white; box-shadow:0 2px 6px rgba(0,0,0,0.1); flex-shrink:0; }
        .d-member-name { font-size:0.84rem; font-weight:600; color:#2A1A0E; }
        .d-member-you { font-size:0.7rem; color:#C05A3B; font-weight:500; }

        /* Tareas card */
        .d-tareas { background:white; border-radius:18px; border:1.5px solid #EAD8C8; padding:1.1rem 1.25rem; margin-bottom:1.25rem; box-shadow:0 2px 12px rgba(150,80,40,0.06); animation:d-up 0.5s 0.12s cubic-bezier(0.22,1,0.36,1) both; }
        .d-tareas-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; }
        .d-tareas-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.1rem; font-weight:600; color:#2A1A0E; }
        .d-tareas-week { font-size:0.72rem; color:#A07060; margin-top:2px; }
        .d-tareas-progress { font-size:0.72rem; font-weight:600; color:#5A8869; background:rgba(90,136,105,0.1); padding:3px 9px; border-radius:20px; white-space:nowrap; }

        /* Task item */
        .d-tarea { display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid #F0E8DF; position:relative; }
        .d-tarea:last-of-type { border-bottom:none; }
        .d-tarea-check { width:22px; height:22px; border-radius:6px; border:2px solid #D4B8A0; background:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.18s; flex-shrink:0; padding:0; }
        .d-tarea-check:hover { border-color:#C05A3B; }
        .d-tarea-check.done { background:#5A8869; border-color:#5A8869; }
        .d-tarea-check.done svg { animation:d-check 0.2s cubic-bezier(0.22,1,0.36,1) both; }
        .d-tarea-body { flex:1; min-width:0; }
        .d-tarea-name { font-size:0.88rem; font-weight:600; color:#2A1A0E; }
        .d-tarea-name.done { text-decoration:line-through; color:#B09080; }
        .d-tarea-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

        /* Assignee chip */
        .d-assignee { display:flex; align-items:center; gap:5px; padding:3px 8px 3px 3px; border-radius:20px; background:#F5EDE5; cursor:pointer; transition:all 0.15s; border:1px solid transparent; position:relative; }
        .d-assignee:hover { background:#EAD8C8; border-color:#D4B8A0; }
        .d-assignee-av { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:700; color:white; flex-shrink:0; }
        .d-assignee-name { font-size:0.72rem; font-weight:600; color:#6B4030; white-space:nowrap; }
        .d-assignee-dd { position:absolute; top:calc(100% + 4px); right:0; background:white; border:1.5px solid #EAD8C8; border-radius:12px; box-shadow:0 8px 24px rgba(150,80,40,0.15); min-width:160px; z-index:50; overflow:hidden; animation:d-modal 0.2s cubic-bezier(0.22,1,0.36,1) both; }
        .d-assignee-opt { display:flex; align-items:center; gap:8px; width:100%; padding:9px 12px; background:none; border:none; font-size:0.82rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; cursor:pointer; text-align:left; transition:background 0.12s; }
        .d-assignee-opt:hover { background:#FFF8F5; }
        .d-assignee-opt.active { background:#FFF1EC; font-weight:600; }

        /* Delete btn */
        .d-tarea-del { width:24px; height:24px; border-radius:6px; background:none; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#D0B0A0; transition:all 0.15s; padding:0; }
        .d-tarea-del:hover { color:#C04040; background:rgba(192,64,64,0.08); }

        /* Add task */
        .d-add-btn { display:flex; align-items:center; gap:7px; padding:10px 0; font-size:0.84rem; font-weight:600; color:#C05A3B; background:none; border:none; cursor:pointer; font-family:var(--font-body),'Nunito',sans-serif; transition:color 0.15s; width:100%; }
        .d-add-btn:hover { color:#A04730; }
        .d-add-form { display:flex; gap:8px; padding-top:10px; flex-wrap:wrap; }
        .d-add-input { flex:1; min-width:120px; padding:9px 12px; background:#FAF5EE; border:1.5px solid #E0CAB8; border-radius:10px; font-size:0.84rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; outline:none; transition:border-color 0.18s,box-shadow 0.18s; }
        .d-add-input:focus { border-color:#C05A3B; box-shadow:0 0 0 3px rgba(192,90,59,0.1); }
        .d-add-input::placeholder { color:#C0A898; }
        .d-add-select { padding:9px 10px; background:#FAF5EE; border:1.5px solid #E0CAB8; border-radius:10px; font-size:0.82rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; outline:none; cursor:pointer; min-width:0; }
        .d-add-select:focus { border-color:#C05A3B; }
        .d-add-submit { padding:9px 16px; background:#C05A3B; color:white; border:none; border-radius:10px; font-size:0.82rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .d-add-submit:hover:not(:disabled) { background:#A04730; }
        .d-add-submit:disabled { opacity:0.5; cursor:not-allowed; }
        .d-add-cancel { padding:9px 12px; background:none; color:#A07060; border:none; border-radius:10px; font-size:0.82rem; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; }

        /* Empty tareas */
        .d-tareas-empty { text-align:center; padding:1rem 0; }
        .d-tareas-empty-icon { font-size:2rem; margin-bottom:6px; }
        .d-tareas-empty-text { font-size:0.84rem; color:#A07060; }

        /* Leave */
        .d-leave-btn { width:100%; padding:12px; background:none; border:1.5px solid #E8D4C4; border-radius:12px; font-size:0.84rem; font-weight:500; color:#A07060; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; animation:d-up 0.5s 0.15s cubic-bezier(0.22,1,0.36,1) both; display:flex; align-items:center; justify-content:center; gap:6px; }
        .d-leave-btn:hover { border-color:#C04040; color:#C04040; background:rgba(192,64,64,0.04); }

        /* No nido */
        .d-empty { background:white; border-radius:18px; border:1.5px solid #EAD8C8; padding:2rem 1.5rem; text-align:center; margin-bottom:1.5rem; animation:d-up 0.5s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
        .d-empty-icon { font-size:2.5rem; margin-bottom:10px; }
        .d-empty-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.1rem; color:#2A1A0E; margin-bottom:6px; font-weight:600; }
        .d-empty-sub { font-size:0.84rem; color:#A07060; line-height:1.5; }
        .d-btn-primary { width:100%; padding:14px 20px; background:#C05A3B; color:white; border:none; border-radius:14px; font-size:0.95rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:background 0.18s,transform 0.15s,box-shadow 0.18s; display:flex; align-items:center; justify-content:center; gap:8px; }
        .d-btn-primary:hover:not(:disabled) { background:#A04730; transform:translateY(-1.5px); box-shadow:0 10px 28px rgba(192,90,59,0.35); }
        .d-btn-primary:disabled { opacity:0.55; cursor:not-allowed; }

        /* Modal */
        .d-overlay { position:fixed; inset:0; background:rgba(42,26,14,0.45); backdrop-filter:blur(4px); z-index:500; display:flex; align-items:flex-end; justify-content:center; padding-bottom:env(safe-area-inset-bottom,0px); }
        @media (min-width:480px) { .d-overlay { align-items:center; padding-bottom:0; } }
        .d-modal { background:#FAF5EE; border-radius:24px 24px 0 0; width:100%; max-width:440px; padding:2rem 1.5rem 2.5rem; animation:d-modal 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        @media (min-width:480px) { .d-modal { border-radius:24px; } }
        .d-modal-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.5rem; color:#2A1A0E; margin-bottom:0.25rem; font-weight:600; }
        .d-modal-sub { font-size:0.85rem; color:#A07060; margin-bottom:1.5rem; }
        .d-field { margin-bottom:14px; }
        .d-label { display:block; font-size:0.7rem; font-weight:700; color:#8A5A40; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.08em; }
        .d-input { width:100%; padding:12px 15px; background:white; border:1.5px solid #E0CAB8; border-radius:12px; font-size:0.92rem; font-family:var(--font-body),'Nunito',sans-serif; color:#2A1A0E; outline:none; transition:border-color 0.18s,box-shadow 0.18s; }
        .d-input::placeholder { color:#C0A898; }
        .d-input:focus { border-color:#C05A3B; box-shadow:0 0 0 3.5px rgba(192,90,59,0.12); }
        .d-pwd-wrap { position:relative; }
        .d-pwd-wrap .d-input { padding-right:44px; }
        .d-eye { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#B09080; padding:4px; display:flex; align-items:center; }
        .d-error { display:flex; align-items:flex-start; gap:7px; padding:10px 13px; background:#FFF1EC; border:1px solid #F5C5B0; border-radius:10px; color:#B03A1A; font-size:0.82rem; margin-bottom:14px; line-height:1.45; }
        .d-spinner { width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,0.35); border-top-color:white; animation:d-spin 0.7s linear infinite; flex-shrink:0; }
        .d-cancel { width:100%; padding:12px; background:none; border:none; color:#A07060; font-size:0.88rem; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; margin-top:6px; transition:color 0.18s; }
        .d-cancel:hover { color:#C05A3B; }

        /* Leave modal */
        .d-leave-title { font-family:var(--font-serif),'Georgia',serif; font-size:1.3rem; color:#2A1A0E; margin-bottom:0.3rem; font-weight:600; }
        .d-leave-sub { font-size:0.84rem; color:#A07060; margin-bottom:1.5rem; line-height:1.5; }
        .d-btn-danger { width:100%; padding:13px; background:#C04040; color:white; border:none; border-radius:12px; font-size:0.9rem; font-weight:600; font-family:var(--font-body),'Nunito',sans-serif; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; gap:7px; }
        .d-btn-danger:hover:not(:disabled) { background:#A03030; }
        .d-btn-danger:disabled { opacity:0.55; cursor:not-allowed; }

        /* Desktop */
        @media (min-width: 768px) {
          .d-wrap { max-width: 640px; }
        }
        @media (min-width: 1024px) {
          .d-wrap { max-width: 900px; }
          .d-desktop-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; }
        }
      `}</style>

      <div className="d-root">
        <div className="d-bg"/>
        <div className="d-wrap">

          {/* Header */}
          <div className="d-header">
            <div className="d-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/nido-icon-192.png" alt="nido" width="26" height="26" style={{ display:'block', borderRadius:'6px' }}/>
              <span className="d-logo-title">Nido</span>
            </div>
            <button className="d-signout" onClick={handleSignOut}>Cerrar sesión</button>
          </div>

          {/* Greeting */}
          <div className="d-greeting">
            <div className="d-greeting-title">
              Hola{membership ? `, ${membership.nombre}` : ''} 👋
            </div>
            <div className="d-greeting-sub">{user?.email}</div>
          </div>

          {membership ? (
            <>
              {/* ── HAS NIDO ── */}

              {/* Nido card → enter sala */}
              <button className="d-nido-card" onClick={enterSala}>
                <div className="d-nido-info">
                  <div className="d-nido-av">🏠</div>
                  <div>
                    <div className="d-nido-name">{membership.salas.nombre}</div>
                    <div className="d-nido-meta">
                      {miembros.length} miembro{miembros.length !== 1 ? 's' : ''} · Entrar al nido
                    </div>
                  </div>
                </div>
                <svg className="d-nido-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M6.5 4.5L11.5 9L6.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Quick modules */}
              <div className="d-modules">
                {[
                  { nombre: 'Aptos', icono: '🏠', href: `/sala/${membership.salas.codigo}/pisos` },
                  { nombre: 'Gastos', icono: '💰', href: `/sala/${membership.salas.codigo}/gastos` },
                  { nombre: 'Compras', icono: '🛒', href: `/sala/${membership.salas.codigo}/compras` },
                ].map(mod => (
                  <button key={mod.nombre} className="d-module" onClick={() => router.push(mod.href)}>
                    <div className="d-module-icon">{mod.icono}</div>
                    <div className="d-module-name">{mod.nombre}</div>
                  </button>
                ))}
              </div>

              <div className="d-desktop-cols">
              <div>
              {/* Members */}
              <div className="d-members">
                <div className="d-section-label">Miembros · {miembros.length}</div>
                <div className="d-members-list">
                  {miembros.map(m => (
                    <div key={m.id} className="d-member">
                      <div className="d-member-av" style={{ backgroundColor: m.color }}>
                        {m.nombre[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="d-member-name">{m.nombre}</div>
                        {m.id === membership.id && <div className="d-member-you">tú</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>{/* end left col */}

              <div>
              {/* Tareas */}
              <div className="d-tareas">
                <div className="d-tareas-header">
                  <div>
                    <div className="d-tareas-title">Tareas</div>
                    <div className="d-tareas-week">
                      Semana {getWeekNumber(currentWeek)} · {getWeekDateRange(currentWeek)}
                    </div>
                  </div>
                  {tareas.length > 0 && (
                    <div className="d-tareas-progress">
                      {completedCount}/{tareas.length}
                    </div>
                  )}
                </div>

                {tareasLoading ? (
                  <div style={{ display:'flex', justifyContent:'center', padding:'1.5rem 0' }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', border:'2.5px solid #C05A3B', borderTopColor:'transparent', animation:'d-spin 0.8s linear infinite' }}/>
                  </div>
                ) : tareas.length === 0 && !showAddForm ? (
                  <div className="d-tareas-empty">
                    <div className="d-tareas-empty-icon">📋</div>
                    <div className="d-tareas-empty-text">
                      No hay tareas esta semana.<br/>
                      Agregá una para empezar.
                    </div>
                  </div>
                ) : (
                  <div>
                    {tareas.map(tarea => {
                      const assignee = miembros.find(m => m.id === tarea.asignada_a)
                      return (
                        <div key={tarea.id} className="d-tarea">
                          <button
                            className={`d-tarea-check${tarea.completada ? ' done' : ''}`}
                            onClick={() => handleToggleTask(tarea.id, tarea.completada)}
                          >
                            {tarea.completada && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>

                          <div className="d-tarea-body">
                            <div className={`d-tarea-name${tarea.completada ? ' done' : ''}`}>
                              {tarea.nombre}
                            </div>
                          </div>

                          <div className="d-tarea-right">
                            {assignee && (
                              <div style={{ position:'relative' }} ref={reassignTaskId === tarea.id ? reassignRef : undefined}>
                                <div
                                  className="d-assignee"
                                  onClick={() => setReassignTaskId(reassignTaskId === tarea.id ? null : tarea.id)}
                                >
                                  <div className="d-assignee-av" style={{ backgroundColor: assignee.color }}>
                                    {assignee.nombre[0].toUpperCase()}
                                  </div>
                                  <span className="d-assignee-name">{assignee.nombre}</span>
                                </div>

                                {reassignTaskId === tarea.id && (
                                  <div className="d-assignee-dd">
                                    {miembros.map(m => (
                                      <button
                                        key={m.id}
                                        className={`d-assignee-opt${m.id === tarea.asignada_a ? ' active' : ''}`}
                                        onClick={() => handleReassignTask(tarea.id, m.id)}
                                      >
                                        <div className="d-assignee-av" style={{ backgroundColor: m.color, width:20, height:20, fontSize:'0.55rem' }}>
                                          {m.nombre[0].toUpperCase()}
                                        </div>
                                        {m.nombre}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <button className="d-tarea-del" onClick={() => handleDeleteTask(tarea.id)} title="Eliminar tarea">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add task form */}
                {showAddForm ? (
                  <form className="d-add-form" onSubmit={handleAddTask}>
                    <input
                      className="d-add-input"
                      value={newTaskName}
                      onChange={e => setNewTaskName(e.target.value)}
                      placeholder="Nombre de la tarea"
                      autoFocus
                    />
                    <select
                      className="d-add-select"
                      value={newTaskAssignee}
                      onChange={e => setNewTaskAssignee(e.target.value)}
                    >
                      {miembros.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                    <button type="submit" className="d-add-submit" disabled={addingTask || !newTaskName.trim()}>
                      {addingTask ? '...' : 'Agregar'}
                    </button>
                    <button type="button" className="d-add-cancel" onClick={() => { setShowAddForm(false); setNewTaskName(''); setNewTaskAssignee('') }}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <button className="d-add-btn" onClick={() => { setShowAddForm(true); setNewTaskAssignee(miembros[0]?.id ?? '') }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    Agregar tarea
                  </button>
                )}
              </div>
              </div>{/* end right col */}
              </div>{/* end desktop-cols */}

              {/* Leave nido */}
              <button className="d-leave-btn" onClick={() => setShowLeave(true)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 7h7M9.5 4.5L12 7l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                Salir del nido
              </button>
            </>
          ) : (
            <>
              {/* ── NO NIDO ── */}
              <div className="d-empty">
                <div className="d-empty-icon">🏡</div>
                <div className="d-empty-title">Sin nido por ahora</div>
                <div className="d-empty-sub">
                  Creá uno nuevo o pedile a alguien que te invite con un link.
                </div>
              </div>

              <button className="d-btn-primary" onClick={() => { setShowCreate(true); setCError('') }}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Crear nido nuevo
              </button>
            </>
          )}

        </div>
      </div>

      {/* ── Leave confirmation modal ── */}
      {showLeave && (
        <div className="d-overlay" onClick={e => { if (e.target === e.currentTarget) setShowLeave(false) }}>
          <div className="d-modal">
            <div className="d-leave-title">Salir del nido</div>
            <div className="d-leave-sub">
              Tu historial de gastos se mantiene, pero ya no vas a poder acceder al nido hasta que te vuelvan a invitar.
            </div>
            <button className="d-btn-danger" disabled={leaveLoading} onClick={handleLeave}>
              {leaveLoading
                ? <><span className="d-spinner"/>Saliendo...</>
                : 'Sí, salir del nido'}
            </button>
            <button className="d-cancel" onClick={() => setShowLeave(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Create nido modal ── */}
      {showCreate && (
        <div className="d-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="d-modal">
            <div className="d-modal-title">Crear nido 🏠</div>
            <div className="d-modal-sub">Configurá tu nido y empezá a invitar a tus compañeros</div>
            <form onSubmit={handleCrearNido}>
              <div className="d-field">
                <label className="d-label">Nombre del nido</label>
                <input type="text" value={cNombreNido} onChange={e => setCNombreNido(e.target.value)}
                  placeholder="Ej: Casa Palermo, El Nidito..." className="d-input" autoFocus/>
              </div>
              <div className="d-field">
                <label className="d-label">Contraseña del nido</label>
                <div className="d-pwd-wrap">
                  <input type={cShowCodigo ? 'text' : 'password'} value={cCodigo}
                    onChange={e => setCCodigo(e.target.value)}
                    placeholder="La que usarán como referencia" className="d-input" autoComplete="off"/>
                  <button type="button" className="d-eye" onClick={() => setCShowCodigo(v => !v)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#B09080" strokeWidth="1.4"/>
                      <circle cx="8" cy="8" r="2" stroke="#B09080" strokeWidth="1.4"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="d-field">
                <label className="d-label">Tu nombre en el nido</label>
                <input type="text" value={cNombre} onChange={e => setCNombre(e.target.value)}
                  placeholder="Ej: lauta, caro, pepito..." className="d-input" autoComplete="off"/>
              </div>
              {cError && (
                <div className="d-error">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7 4.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="7" cy="9.5" r="0.6" fill="currentColor"/>
                  </svg>
                  {cError}
                </div>
              )}
              <button type="submit" className="d-btn-primary" disabled={cLoading}>
                {cLoading
                  ? <><span className="d-spinner"/>Creando...</>
                  : '✓ Crear mi nido'}
              </button>
            </form>
            <button className="d-cancel" onClick={() => setShowCreate(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
