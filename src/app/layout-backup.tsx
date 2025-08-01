import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/providers'
import SessionRefresh from '@/components/auth/session-refresh'
import { GlobalErrorBoundary } from '@/components/error-boundary'
import { FeedbackWidget } from '@/components/monitoring/feedback-widget'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Field Reservations',
  description: 'Book sports fields quickly and easily for your league games and practices',
  keywords: ['field reservation', 'sports booking', 'league management', 'field scheduling'],
  authors: [{ name: 'Field Reservations' }],
  creator: 'Field Reservations',
  publisher: 'Field Reservations',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Field Reservations',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={inter.className}>
        <GlobalErrorBoundary>
          <Providers>
            <SessionRefresh />
            {children}
            <FeedbackWidget />
          </Providers>
        </GlobalErrorBoundary>
      </body>
    </html>
  )
}