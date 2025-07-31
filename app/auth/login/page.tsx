import AuthCard from '@/components/auth/AuthCard'
import AuthWrapper from '@/components/auth/AuthWrapper'
import LoginForm from '@/components/auth/LoginForm'

const LoginPage = () => {
  return (
    <AuthWrapper>
      <AuthCard
        page='Login'
        headerText='Start conversing with your smart AI assistant'
        backText={`Don't have an account`}
        backLink='register'
      >
        <LoginForm />
      </AuthCard>
    </AuthWrapper>
  )
}

export default LoginPage
