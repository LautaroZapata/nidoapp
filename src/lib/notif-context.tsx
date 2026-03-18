'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type Notif = { id: string; text: string; ts: number; icon: string }

type NotifCtx = {
  notifs: Notif[]
  toasts: Notif[]
  unreadCount: number
  bellOpen: boolean
  setBellOpen: (v: boolean) => void
  addNotif: (text: string, icon: string) => void
  clearNotifs: () => void
  markAllRead: () => void
}

const Ctx = createContext<NotifCtx | null>(null)

export function NotifProvider({ children }: { children: ReactNode }) {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [toasts, setToasts] = useState<Notif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)

  const addNotif = useCallback((text: string, icon: string) => {
    const n: Notif = { id: Math.random().toString(36).slice(2), text, ts: Date.now(), icon }
    setNotifs(prev => [n, ...prev].slice(0, 50))
    setUnreadCount(c => c + 1)
    setToasts(prev => [...prev, n])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== n.id)), 5000)
  }, [])

  const clearNotifs = useCallback(() => setNotifs([]), [])
  const markAllRead = useCallback(() => setUnreadCount(0), [])

  return (
    <Ctx.Provider value={{ notifs, toasts, unreadCount, bellOpen, setBellOpen, addNotif, clearNotifs, markAllRead }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNotif() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotif must be used inside NotifProvider')
  return ctx
}

export function fmtTimeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}
