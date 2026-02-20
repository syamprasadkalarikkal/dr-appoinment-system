// app/api/send-email/route.js
// Uses Gmail via Nodemailer — credentials read from .env.local

import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password (not your normal password)
  },
})

export async function POST(req) {
  try {
    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
      return Response.json(
        { error: 'Missing required fields: to, subject, html' },
        { status: 400 }
      )
    }

    await transporter.sendMail({
      from: `"AMRT Healthcare" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    })

    return Response.json({ success: true }, { status: 200 })

  } catch (err) {
    console.error('Mail error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
