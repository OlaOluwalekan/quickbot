import VerificationForm from '@/components/auth/VerificationForm'
import { Suspense } from 'react'

const VerificationPage = () => {
  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <VerificationForm />
      </Suspense>
    </div>
  )
}

export default VerificationPage
