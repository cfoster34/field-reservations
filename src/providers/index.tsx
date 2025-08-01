"use client"

import { ThemeProvider } from './theme-provider'
import { ToasterProvider } from './toaster-provider'
import { PWAProvider } from './pwa-provider'
import { AuthProvider } from '@/contexts/auth-context'
import { MonitoringProvider } from './monitoring-provider'

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="field-reservations-theme">
      <AuthProvider>
        <MonitoringProvider>
          <PWAProvider>
            <ToasterProvider />
            {children}
          </PWAProvider>
        </MonitoringProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}