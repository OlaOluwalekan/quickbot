import { z } from 'zod'

export const RegisterSchema = z
  .object({
    email: z
      .string()
      .email()
      .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
        message: 'Invalid email format',
      }), // check email format if valid
    name: z
      .string()
      .min(2, { message: 'Name must be between 2 and 50 characters' })
      .max(50, { message: 'Name must be between 2 and 50 characters' }), // check if Name is between 2 and 50 characters
    password: z
      .string()
      .min(8, {
        message: 'Password must be at least 8 characters',
      })
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{};:,<.>]).{8,}$/,
        {
          message:
            'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
        }
      ), // checks if password is of at least 8 characters and contains the appropriate mix
    confirmPassword: z.string(),
  })
  .required()

export const LoginSchema = z.object({
  email: z
    .string()
    .email()
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
      message: 'invalid email address',
    }), // checks that email is valid
  password: z.string(), // checks that password is a string
})

export const PasswordResetSchema = z
  .object({
    email: z
      .string()
      .email()
      .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
        message: 'Invalid email format',
      }), // check email format if valid
    password: z
      .string()
      .min(8, {
        message: 'Password must be at least 8 characters',
      })
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{};:,<.>]).{8,}$/,
        {
          message:
            'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
        }
      ), // checks if password is of at least 8 characters and contains the appropriate mix
    confirmPassword: z.string(),
  })
  .required()
