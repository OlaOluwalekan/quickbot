'use client'

import { ChangeEvent, useEffect, useState, useTransition } from 'react'
import InputWithIcon from '../ui/inputs/InputWithIcon'
import { LuUserRound } from 'react-icons/lu'
import BasicButton from '../ui/button/BasicButton'
import { preparePasswordResetEmailAndToken } from '@/utils/actions/passwordReset'
import { useRouter } from 'next/navigation'
import Alert from '../alert/Alert'
import axios from 'axios'
import toast from 'react-hot-toast'
import LinkButton from '../ui/button/LinkButton'

const ForgotPasswordForm = () => {
  const [formData, setFormData] = useState({
    email: '',
  })
  const [isPending, startTransition] = useTransition()
  const [response, setResponse] = useState({
    message: '',
    success: false,
    data: null,
  })

  // handles input change events
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // used to clear the response passed to the alert toast after 3s (3000ms)
  useEffect(() => {
    if (!response.success) {
      let interval = setTimeout(() => {
        setResponse({ message: '', success: false, data: null })
      }, 3000)
      return () => clearTimeout(interval)
    }
  }, [response])

  // handle form submission event - server action is used to send password reset email to user if email exist
  const handleSubmit = async (formData: FormData) => {
    setResponse({ message: '', success: false, data: null })

    // handle state updates
    startTransition(() => {
      preparePasswordResetEmailAndToken(formData).then((res) => {
        setResponse(res)
        if (res.success) {
          setFormData({ email: '' })
          axios
            .post('/api/email/send-password-reset-email', {
              email: res.data.email,
              token: res.data.token,
            })
            .then(({ data }) => {
              toast.success(data.message || 'Message sent')
            })
        }
      })
    })
  }

  return (
    <form action={handleSubmit} noValidate className='flex flex-col gap-3'>
      <InputWithIcon
        type='email'
        placeholder='Email'
        icons={<LuUserRound />}
        name='email'
        id='email'
        value={formData.email}
        onChange={handleChange}
      />

      {/* alert toast message - disappears after 3s */}
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      {/* submit button */}
      <BasicButton
        type='submit'
        size='full'
        text={isPending ? 'Loading...' : 'Send Email'}
        disabled={isPending}
        className='bg-lemon'
      />

      <div className='flex justify-center text-lemon text-sm underline'>
        <LinkButton text='Back to Login' href='/auth/login' />
      </div>
    </form>
  )
}

export default ForgotPasswordForm
