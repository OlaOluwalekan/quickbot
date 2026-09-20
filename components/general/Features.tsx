import { FaBrain, FaBolt, FaLock } from 'react-icons/fa6'
import { BsChatSquareTextFill } from 'react-icons/bs'
import Feature from './Feature'

const features = [
  {
    id: '1',
    icon: <BsChatSquareTextFill />,
    title: 'Natural Conversations',
    text: 'Engage in fluid, human-like dialogue with contextual understanding that remembers previous interactions for a seamless chat experience.',
  },
  {
    id: '2',
    icon: <FaBrain />,
    title: 'Advanced Reasoning',
    text: 'Solve complex problems, write code, and analyze data with cutting-edge AI models trained on vast amounts of specialized knowledge.',
  },
  {
    id: '3',
    icon: <FaBolt />,
    title: 'Lightning Fast',
    text: 'Get instant responses with our optimized infrastructure, ensuring zero lag even during peak usage hours.',
  },
  {
    id: '4',
    icon: <FaLock />,
    title: 'Secure & Private',
    text: 'Your data is encrypted end-to-end. We never use your personal conversations to train our models without explicit consent.',
  }
]

const Features = () => {
  return (
    <div id="features" className='w-full max-w-[1200px] mx-auto py-20 px-6'>
      <div className='text-center mb-16'>
        <h2 className='text-3xl md:text-4xl font-bold text-base-content dark:text-dark-base-content mb-4'>
          Powerful Features
        </h2>
        <p className='text-base-content/70 dark:text-dark-base-content/70 max-w-[600px] mx-auto text-lg'>
          Everything you need to boost your productivity and simplify your workflow with state-of-the-art AI.
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8'>
        {features.map((feature) => (
          <Feature key={feature.id} {...feature} />
        ))}
      </div>
    </div>
  )
}

export default Features
