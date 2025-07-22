import { ThemeProps } from '@/types/theme.interface'
import { FaMoon, FaSun } from 'react-icons/fa6'

// maps theme name to icon
export const themeMap: { [key: string]: { icon: any } } = {
  light: {
    icon: FaSun,
  },
  dark: {
    icon: FaMoon,
  },
}

// theme data
export const themeData: {
  name: ThemeProps
  icon: any
}[] = [
  {
    name: 'light',
    icon: FaSun,
  },
  {
    name: 'dark',
    icon: FaMoon,
  },
]
