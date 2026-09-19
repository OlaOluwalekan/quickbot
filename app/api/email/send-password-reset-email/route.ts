import { sendPasswordResetEmail } from '@/utils/emails/send-password-reset-email'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // get request body
  const data = await request.json()

  try {
    // send password reset email to user
    await sendPasswordResetEmail(data.email, data.token)
    return NextResponse.json({ message: 'Email sent' })
  } catch (error) {
    return NextResponse.json({ error: 'something went wrong' })
  }
}
