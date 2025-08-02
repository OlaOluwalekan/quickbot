'use server'

import { signIn } from '@/auth'
import ActionResponse from '../response'
import { LoginSchema } from '../schema/auth.shema'
import { getUserByEmail } from './user'
import { AuthError } from 'next-auth'

/**
 * Handles user login by validating the provided form data and authenticating the user.
 *
 * @param {FormData} formData - The form data containing user credentials.
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating the result of the login attempt.
 */
export const login = async (
  formData: FormData
): Promise<ActionResponse<any>> => {
  const email = formData.get('email')
  const password = formData.get('password')

  if (!email) {
    return ActionResponse.error('email is required', null)
  }

  if (!password) {
    return ActionResponse.error('password is required', null)
  }

  // check for existing user
  const existingUser = await getUserByEmail(email as string)

  if (!existingUser || !existingUser.email) {
    return ActionResponse.error('User does not exist', null)
  }

  // checks if user uses OAuth login instead of credentials
  if (!existingUser.password) {
    return ActionResponse.error(
      'This account uses a different login method',
      existingUser
    )
  }

  // checks if email is verified on login
  if (!existingUser?.emailVerified) {
    return ActionResponse.error('Email is not verified', existingUser)
  }

  // tries logging the user in
  try {
    // checks validity of email and password
    LoginSchema.safeParse({ email, password })

    // logs user in
    await signIn('credentials', { email, password, redirect: false })

    return ActionResponse.success('Login successful', existingUser)
  } catch (error: any) {
    // check for validation error
    if (error.name === 'ZodError') {
      return ActionResponse.error(JSON.parse(error?.message)[0].message, null)
    }

    // checks for sign in error
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return ActionResponse.error('Invalid credentials', null)
        default:
          return ActionResponse.error('An error occurred', null)
      }
    }

    // throw error
    throw error
  }
}
