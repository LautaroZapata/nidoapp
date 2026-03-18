import { NextResponse } from 'next/server'

// Migrado a Lemon Squeezy → /api/webhooks/lemon
export async function POST() {
  return NextResponse.json({ error: 'Endpoint movido a /api/webhooks/lemon' }, { status: 410 })
}
