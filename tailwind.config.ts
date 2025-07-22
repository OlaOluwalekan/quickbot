import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        error: '#f5365c',
        success: '#21ba45',
        warning: '#f1c40f',
        info: '#3182ce',
        light: '#ffffff',
        dark: '#212121',
      },
      screens: {
        small: { raw: '(max-width: 400px)' },
      },
    },
  },
  plugins: [require('daisyui'), require('tailwind-scrollbar')],
}

export default config
