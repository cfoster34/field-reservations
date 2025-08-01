'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'

const SESSION_REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes

export default function SessionRefresh() {
  const { refreshSession, session } = useAuth()

  useEffect(() => {
    if (!session) return

    // Set up automatic session refresh
    const refreshInterval = setInterval(async () => {
      try {
        await refreshSession()
        console.log('Session refreshed successfully')
      } catch (error) {
        console.error('Failed to refresh session:', error)
      }
    }, SESSION_REFRESH_INTERVAL)

    // Clean up interval on unmount
    return () => clearInterval(refreshInterval)
  }, [session, refreshSession])

  // Also refresh on window focus
  useEffect(() => {
    const handleFocus = async () => {
      if (!session) return
      
      // Check if session needs refresh (if it's been more than 30 minutes)
      const sessionAge = Date.now() - new Date(session.expires_at || 0).getTime()
      if (sessionAge > SESSION_REFRESH_INTERVAL) {
        try {
          await refreshSession()
          console.log('Session refreshed on focus')
        } catch (error) {
          console.error('Failed to refresh session on focus:', error)
        }
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [session, refreshSession])

  return null
}