'use server'

import sendMail from './send-email'

/**
 * Sends a verification email to the specified email address.
 *
 * @param email - The recipient's email address.
 * @param token - The verification token to be included in the email.
 * @returns A promise that resolves when the email has been sent.
 */
export const sendPasswordResetEmail = async (email: string, token: string) => {
  await sendMail(
    email,
    'Reset Your Password',
    `
    <p>Click the link below to reset Your password</p>
    <a href="${process.env.DOMAIN}/auth/verify/reset-password?token=${token}" style="padding: 5px 15px; background: blue; color: white">Reset Your Password</a>
    `
  )
}
