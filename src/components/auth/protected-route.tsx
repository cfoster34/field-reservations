'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { UserRole } from '@/types/user'
import { BiLoaderAlt } from 'react-icons/bi'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  requireVerified?: boolean
  redirectTo?: string
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireVerified = true,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      // Check if user is authenticated
      if (!user) {
        router.push(redirectTo)
        return
      }

      // Check if email verification is required
      if (requireVerified && !user.email_confirmed_at) {
        router.push('/auth/verify-email')
        return
      }

      // Check role-based access
      if (allowedRoles && user.user_metadata?.role) {
        if (!allowedRoles.includes(user.user_metadata.role as UserRole)) {
          router.push('/unauthorized')
          return
        }
      }
    }
  }, [user, loading, allowedRoles, requireVerified, redirectTo, router])

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BiLoaderAlt className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Don't render children until we've confirmed access
  if (!user || (requireVerified && !user.email_confirmed_at)) {
    return null
  }

  return <>{children}</>
}