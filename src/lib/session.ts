/**
 * SECURITY NOTE: Session data is stored in localStorage and can be tampered with.
 * All API endpoints MUST validate the session server-side using Supabase auth tokens.
 * Never trust miembroId or salaId from this session without server verification.
 */

const STORAGE_KEY = 'nidoapp_session'

export type Session = {
  salaId: string
  salaCodigo: string
  salaNombre: string
  miembroId: string
  miembroNombre: string
  miembroColor: string
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
