import { FaClock, FaUserPlus } from 'react-icons/fa6'
import { LuMessageSquare } from 'react-icons/lu'
import Feature from './Feature'

const features = [
  {
    id: '1',
    icon: <FaUserPlus />,
    title: 'User Friendly Interface',
    text: 'Our AI chatbot is designed to provide seamless interaction, making it easy for users to communicate and access information.',
  },
  {
    id: '2',
    icon: <FaClock />,
    title: '24/7 Availability',
    text: 'Our chatbot is available around the clock, ensuring that your customers receive assistance whenever they need it.',
  },
  {
    id: '3',
    icon: <LuMessageSquare />,
    title: 'Personalized Response',
    text: 'The AI learns from interactions, providing tailored responses to meet the unique needs of each user.',
  },
]

const Features = () => {
  return (
    <div className='flex flex-col gap-4 justify-center items-center md:flex-row py-2 text-base-content dark:text-dark-base-content'>
      {features.map((feature) => (
        <Feature key={feature.id} {...feature} />
      ))}
    </div>
  )
}

export default Features
