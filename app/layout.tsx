import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'
import StoreProvider from '@/providers/StoreProvider'
import ThemeProvider from '@/providers/ThemeProvider'
import { Toaster } from 'react-hot-toast'
import Loader from '@/components/general/Loader'

const montserrat = Montserrat({ subsets: ['latin'] })

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
        className={`main bg-base-light text-black-main dark:bg-base-dark dark:text-white-main scroll-smooth ${montserrat.className}`}
      >
        <StoreProvider>
          <ThemeProvider>
            <Loader>{children}</Loader>
            <Toaster />
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
