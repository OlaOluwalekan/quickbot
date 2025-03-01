import AuthCard from '@/components/auth/AuthCard'
import AuthWrapper from '@/components/auth/AuthWrapper'
import LoginForm from '@/components/auth/LoginForm'

const LoginPage = () => {
  return (
    <AuthWrapper>
      <AuthCard
        page='Login'
        headerText='Welcome back. Provide your login details'
        backText='No Account'
        backLink='register'
      >
        <LoginForm />
      </AuthCard>
    </AuthWrapper>
  )
}

export default LoginPage
