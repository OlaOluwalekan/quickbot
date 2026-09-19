'use server'

import { db } from '../db'
import ActionResponse from '../response'
import { PasswordResetSchema } from '../schema/auth.shema'
import { generateVerificationToken, getVerificationTokenByToken } from './token'
import { getUserByEmail } from './user'
import bcrypt from 'bcryptjs'

export const preparePasswordResetEmailAndToken = async (formData: FormData) => {
  const email = formData.get('email')

  if (!email) {
    return ActionResponse.error('email is required', null)
  }

  // check for existing user
  const existingUser = await getUserByEmail(email as string)

  // checks if user uses OAuth login instead of credentials
  if (!existingUser) {
    return ActionResponse.error('Email not found!', null)
  }

  // GENERATE VERIFICATION TOKEN
  const verificationToken = await generateVerificationToken(email as string)

  return ActionResponse.success(
    'Email sent. Check your mail',
    verificationToken
  )
}

export const verifyToken = async (token: string) => {
  const existingToken = await getVerificationTokenByToken(token)
  const nowDate = new Date()

  if (!existingToken || existingToken.expires < nowDate) {
    return ActionResponse.error('Invalid or expired link')
  }

  return ActionResponse.success('Link verified and valid', existingToken)
}

export const updatePassword = async (formData: FormData, token: string) => {
  const email = formData.get('email')
  const password = formData.get('password')
  const confirmPassword = formData.get('confirmPassword')

  if (!email) {
    return ActionResponse.error('email is required', null)
  }
  if (!password) {
    return ActionResponse.error('password is required', null)
  }
  if (!confirmPassword) {
    return ActionResponse.error('password is needs to match', null)
  }

  const existingTokenResponse = await verifyToken(token)
  const existingToken = existingTokenResponse.data
  const nowDate = new Date()

  if (
    !existingToken ||
    existingToken.expires < nowDate ||
    existingToken.email !== email
  ) {
    return ActionResponse.error('Invalid or expired link', null)
  }

  try {
    PasswordResetSchema.parse({ email, password, confirmPassword })

    // HASH THE PASSWORD
    const hashedPassword = await bcrypt.hash(password as string, 10)

    await db.user.update({
      where: { email: email as string },
      data: {
        password: hashedPassword,
      },
    })

    return ActionResponse.success('Password updated successfully', null)
  } catch (error: any) {
    return ActionResponse.error(JSON.parse(error?.message)[0].message, null)
  }
}
