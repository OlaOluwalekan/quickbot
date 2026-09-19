'use server'

import { db } from '../db'
import ActionResponse from '../response'
import { RegisterSchema } from '../schema/auth.shema'
import { generateVerificationToken, getVerificationTokenByToken } from './token'
import { getUserByEmail } from './user'
import bcrypt from 'bcryptjs'

/**
 * Registers a new user with the provided form data.
 *
 * @param {FormData} formData - The form data containing user registration details.
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating the result of the registration attempt.
 */
export const register = async (
  formData: FormData
): Promise<ActionResponse<any>> => {
  const email = formData.get('email')
  const name = formData.get('name')
  const password = formData.get('password')
  const confirmPassword = formData.get('confirmPassword')

  if (!email) {
    return ActionResponse.error('Email is required', null)
  }
  if (!name) {
    return ActionResponse.error('Name is required', null)
  }
  if (!password) {
    return ActionResponse.error('Password is required', null)
  }
  if (!confirmPassword) {
    return ActionResponse.error('You need to confirm your password', null)
  }

  try {
    // VALIDATE INPUTS
    RegisterSchema.parse({ email, name, password, confirmPassword })

    if (password !== confirmPassword) {
      return ActionResponse.error('Passwords do not match', null)
    }

    // CHECK FOR EXISTING EMAIL ADDRESS
    const existingUser = await getUserByEmail(email as string)
    if (existingUser) {
      return ActionResponse.error('Email already exists', null)
    }

    // HASH THE PASSWORD
    const hashedPassword = await bcrypt.hash(password as string, 10)

    // CREATE NEW USER
    const newUser = await db.user.create({
      data: {
        email: email as string,
        name: name as string,
        password: hashedPassword,
      },
    })

    // GENERATE VERIFICATION TOKEN
    const verificationToken = await generateVerificationToken(email as string)

    return ActionResponse.success('Registration successful', {
      ...newUser,
      token: verificationToken?.token,
    })
  } catch (error: any) {
    return ActionResponse.error(JSON.parse(error?.message)[0].message, null)
  }
}

/**
 * Resends a verification email to the user with the provided email address.
 *
 * @param {formData} formData - The form data containing the user's email address.
 * @returns A promise that resolves to an ActionResponse indicating the success or failure of the operation.
 */
export const resendVerificationEmail = async (formData: FormData) => {
  const email = formData.get('email')

  if (!email) {
    return ActionResponse.error('Email is required', null)
  }

  try {
    const verificationToken = await generateVerificationToken(email as string)

    return ActionResponse.success('Verification email sent', verificationToken)
  } catch (error: any) {
    console.log(error)
    return ActionResponse.error('Error Occurred', null)
  }
}

/**
 * Verifies an email using a provided token.
 * @param token - The verification token to be validated.
 * @returns A promise that resolves to an ActionResponse indicating the result of the verification process.
 */
export const verifyEmail = async (token: string) => {
  try {
    const existingToken = await getVerificationTokenByToken(token)
    if (!existingToken) {
      return ActionResponse.error('Invalid token', null)
    }

    const existingUser = await getUserByEmail(existingToken.email)

    // checks token expiry
    const hasExpired = new Date(existingToken.expires) < new Date()
    if (hasExpired) {
      return ActionResponse.error('Token has expired', existingUser)
    }

    if (!existingUser) {
      return ActionResponse.error('User not found', null)
    }

    const updatedUser = await db.user.update({
      where: {
        id: existingUser.id,
      },
      data: {
        emailVerified: new Date(),
        email: existingToken.email,
      },
    })

    return ActionResponse.success('Email verified successfully', updatedUser)
  } catch (error) {
    return ActionResponse.error('Something went wrong. Try again later', null)
  }
}
