// File location: app/api/send-email/route.js
// Reads from .env.local automatically in Next.js (no extra setup needed)

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL     = process.env.FROM_EMAIL ?? 'AMRT Healthcare <noreply@resend.dev>'

export async function OPTIONS() {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  })
}

export async function POST(req) {
  try {
    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
      return Response.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      )
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to:   [to],
        subject,
        html,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend API error:', data)
      return Response.json({ error: data }, { status: res.status })
    }

    return Response.json({ success: true, id: data.id }, { status: 200 })

  } catch (err) {
    console.error('API route error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}