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
  // daisyui: {
  //   themes: [
  //     {
  //       dark: {
  //         primary: '#2d2d31',
  //         'primary-content': '#ffffff',
  //         secondary: '#1a1a1d',
  //         'secondary-content': '#ffffff',
  //         'base-100': '#000000',
  //         'base-content': '#e1e0e2',
  //         'base-200': '#1f1d1f',
  //         'base-200-content': '#f0d9f5',
  //         'base-300': '#454045',
  //         'base-300-content': '#cdbad0',
  //         neutral: '#392c40',
  //         'neutral-content': '#cfccd0',
  //         accent: '#40404c',
  //         'accent-content': '#dcdce2',
  //       },
  //     },
  //   ],
  // },
}

export default config
