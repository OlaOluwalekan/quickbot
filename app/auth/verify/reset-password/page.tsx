import AuthWrapper from '@/components/auth/AuthWrapper'
import PasswordResetForm from '@/components/auth/PasswordResetForm'
import { Suspense } from 'react'

const ResetPasswordPage = () => {
  return (
    <Suspense fallback={<div>Loading from suspense...</div>}>
      <AuthWrapper>
        <PasswordResetForm />
      </AuthWrapper>
    </Suspense>
  )
}

export default ResetPasswordPage
