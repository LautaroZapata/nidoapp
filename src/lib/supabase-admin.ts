import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

/**
 * Cliente Supabase con service role key — SOLO usar en server-side (API routes).
 * Bypassa RLS, nunca exponer al cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada')

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
