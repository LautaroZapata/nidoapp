import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const BUCKET = 'avatars'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const miembroId = formData.get('miembroId') as string | null

    // ── Validations ──
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }
    if (!miembroId) {
      return NextResponse.json({ error: 'miembroId requerido' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'El archivo supera el límite de 5MB' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── Ensure bucket exists ──
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.find(b => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true })
    }

    // ── Get old foto_url to delete later ──
    const { data: member } = await supabase
      .from('miembros')
      .select('foto_url')
      .eq('id', miembroId)
      .single()

    const oldFotoUrl = member?.foto_url

    // ── Upload new file ──
    const ext = file.name.split('.').pop() || 'jpg'
    const timestamp = Date.now()
    const path = `${miembroId}/${timestamp}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Error al subir archivo' }, { status: 500 })
    }

    // ── Get public URL ──
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    const url = publicUrlData.publicUrl

    // ── Update miembros.foto_url ──
    const { error: updateError } = await supabase
      .from('miembros')
      .update({ foto_url: url })
      .eq('id', miembroId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 })
    }

    // ── Delete old avatar file if exists ──
    if (oldFotoUrl) {
      try {
        // Extract path from the old URL: .../storage/v1/object/public/avatars/{path}
        const marker = `/storage/v1/object/public/${BUCKET}/`
        const idx = oldFotoUrl.indexOf(marker)
        if (idx !== -1) {
          const oldPath = oldFotoUrl.substring(idx + marker.length)
          await supabase.storage.from(BUCKET).remove([oldPath])
        }
      } catch {
        // Non-critical: old file deletion failure shouldn't break the response
        console.warn('No se pudo eliminar el avatar anterior')
      }
    }

    return NextResponse.json({ url })
  } catch (err) {
    console.error('upload-avatar error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
