'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { MdEmail, MdCheckCircle } from 'react-icons/md'
import { BiLoaderAlt } from 'react-icons/bi'

export default function VerifyEmailPage() {
  const [isResending, setIsResending] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const { user } = useAuth()
  const { showToast } = useToast()

  const handleResendEmail = async () => {
    setIsResending(true)
    try {
      // In a real implementation, you would call a function to resend the verification email
      // For now, we'll simulate this
      await new Promise(resolve => setTimeout(resolve, 2000))
      showToast('Success', 'Verification email resent!', 'success')
    } catch (error: any) {
      showToast('Error', 'Failed to resend verification email', 'error')
    } finally {
      setIsResending(false)
    }
  }

  // Check if email is verified (this would typically be done via a callback URL)
  // For demo purposes, we'll show both states
  if (isVerified) {
    return (
      <Card className="p-8 shadow-xl bg-white/95 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <MdCheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
          <p className="text-gray-600 mb-6">
            Your email has been successfully verified.
          </p>
          <Link href="/onboarding">
            <Button className="w-full">
              Continue to Setup
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-8 shadow-xl bg-white/95 backdrop-blur">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <MdEmail className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify your email</h1>
        <p className="text-gray-600 mb-2">
          We've sent a verification email to:
        </p>
        <p className="font-semibold text-gray-900 mb-6">
          {user?.email || 'your email address'}
        </p>
        
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            Click the link in the email to verify your account. 
            If you don't see it, check your spam folder.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleResendEmail}
            variant="outline"
            disabled={isResending}
            className="w-full"
          >
            {isResending ? (
              <>
                <BiLoaderAlt className="animate-spin mr-2" />
                Resending...
              </>
            ) : (
              'Resend verification email'
            )}
          </Button>
          
          <Link href="/login" className="block">
            <Button variant="ghost" className="w-full">
              Back to login
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Having trouble? Contact support at support@fieldreservations.com
        </p>
      </div>
    </Card>
  )
}