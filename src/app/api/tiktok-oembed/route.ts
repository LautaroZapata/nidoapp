import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NidoApp/1.0)' } }
    )
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const data = await res.json()

    // El campo "html" contiene cite="https://www.tiktok.com/@user/video/1234567890"
    const match = data.html?.match(/\/video\/(\d+)/)
    if (!match) return NextResponse.json({ error: 'no video id' }, { status: 404 })

    const videoId = match[1]
    return NextResponse.json({
      videoId,
      embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
      author: data.author_name ?? '',
      title: data.title ?? '',
      thumbnail: data.thumbnail_url ?? '',
    })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
