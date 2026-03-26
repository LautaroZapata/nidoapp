const STORAGE_KEY = 'nidoapp_session'

export type Session = {
  salaId: string
  salaCodigo: string
  salaNombre: string
  miembroId: string
  miembroNombre: string
  miembroColor: string
  miembroGradiente?: string | null
  miembroIcono?: string | null
  miembroFotoUrl?: string | null
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}
