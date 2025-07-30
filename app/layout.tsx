import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import StoreProvider from '@/providers/StoreProvider'
import ThemeProvider from '@/providers/ThemeProvider'
import Theme from '@/components/theme/Theme'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Quickbot | Your daily companion',
  description:
    'Get real time responses to your questions, needs, and concerns.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body
        suppressHydrationWarning
        className={`main bg-base-light text-black-main dark:bg-base-dark dark:text-white-main ${inter.className}`}
      >
        <StoreProvider>
          <ThemeProvider>
            {children}
            <Theme />
            <Toaster />
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
