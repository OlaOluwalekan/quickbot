'use client'

import { updatePassword, verifyToken } from '@/utils/actions/passwordReset'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChangeEvent, useEffect, useState, useTransition } from 'react'
import InputWithIcon from '../ui/inputs/InputWithIcon'
import { LuUserRound } from 'react-icons/lu'
import Alert from '../alert/Alert'
import BasicButton from '../ui/button/BasicButton'
import LinkButton from '../ui/button/LinkButton'
import { CiLock } from 'react-icons/ci'

const PasswordResetForm = () => {
  const params = useSearchParams()
  const token = params.get('token')
  const [isPending, startTransition] = useTransition()
  const [updating, startUpdating] = useTransition()
  const [response, setResponse] = useState({
    message: '',
    success: false,
    data: null,
  })
  const [validatingResponse, setValidatingResponse] = useState({
    message: '',
    success: false,
    data: null,
  })
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  })
  const router = useRouter()

  // handles input change events
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  //   used to clear the response passed to the alert toast after 3s (3000ms)
  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: '', success: true, data: null })
    }, 3000)

    return () => clearTimeout(interval)
  }, [response])

  useEffect(() => {
    if (validatingResponse.success) {
      let interval = setTimeout(() => {
        setValidatingResponse({ message: '', success: true, data: null })
      }, 3000)

      return () => clearTimeout(interval)
    }
  }, [validatingResponse])

  useEffect(() => {
    startTransition(() => {
      // verify user email
      verifyToken(token as string).then((res) => {
        // console.log(res);
        if (res.success) {
          //   console.log('user email =>', res.data.email)

          setFormData({ ...formData, email: res.data.email })
        }
        setValidatingResponse(res)
      })
    })
  }, [])

  const handleSubmit = (formData: FormData) => {
    setResponse({ message: '', success: false, data: null })

    startUpdating(() => {
      updatePassword(formData, token as string).then((res) => {
        setResponse({
          message: res.message,
          success: res.success,
          data: res.data,
        })

        if (res.success) {
          setTimeout(() => {
            router.replace('/auth/login')
          }, 2000)
        }
      })
    })
  }

  return (
    <div>
      {isPending ? (
        <div>Loading..., Wait Please!</div>
      ) : !token ? (
        <div className='flex flex-col gap-3'>
          <p className='text-center'>
            Invalid Link. Please check the link and try again
          </p>
          <div className='flex flex-col'>
            <LinkButton href='/' text='Home' className='bg-lemon' />
            <LinkButton href='/auth/login' text='Login' className='underline' />
          </div>
        </div>
      ) : (
        <form action={handleSubmit} noValidate className='flex flex-col gap-3'>
          {validatingResponse.success && (
            <>
              <InputWithIcon
                type='email'
                placeholder='Email'
                icons={<LuUserRound />}
                name='email'
                id='email'
                value={formData.email}
                readonly
                onChange={handleChange}
              />

              {/* password input */}
              <InputWithIcon
                type='password'
                placeholder='New Password'
                icons={<CiLock />}
                name='password'
                id='password'
                value={formData.password}
                onChange={handleChange}
              />

              {/* password confirmation input */}
              <InputWithIcon
                type='password'
                placeholder='Confirm Password'
                icons={<CiLock />}
                name='confirmPassword'
                id='confirmPassword'
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </>
          )}

          {/* alert toast message - disappears after 3s */}
          {response.message && (
            <Alert message={response.message} success={response.success} />
          )}
          {validatingResponse.message && (
            <Alert
              message={validatingResponse.message}
              success={validatingResponse.success}
            />
          )}

          {/* submit button */}
          {validatingResponse.success ? (
            <>
              <BasicButton
                type='submit'
                size='full'
                text={updating ? 'Loading...' : 'Change Password'}
                disabled={updating}
                className='bg-lemon'
              />
              <div className='flex justify-center text-lemon text-sm underline'>
                <LinkButton text='Back to Login' href='/auth/login' />
              </div>
            </>
          ) : (
            <div className='flex flex-col'>
              <LinkButton href='/' text='Home' className='bg-lemon' />
              <LinkButton
                href='/auth/login'
                text='Login'
                className='underline'
              />
            </div>
          )}
        </form>
      )}
    </div>
  )
}

export default PasswordResetForm
