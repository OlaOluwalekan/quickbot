import AuthCard from '@/components/auth/AuthCard'
import AuthWrapper from '@/components/auth/AuthWrapper'
import RegisterForm from '@/components/auth/RegisterForm'
import React from 'react'

const RegisterPage = () => {
  return (
    <AuthWrapper>
      <AuthCard
        page='Register'
        headerText='Create your account and start chatting with your AI assistant'
        backText='Already have an account'
        backLink='login'
      >
        <RegisterForm />
      </AuthCard>
    </AuthWrapper>
  )
}

export default RegisterPage
