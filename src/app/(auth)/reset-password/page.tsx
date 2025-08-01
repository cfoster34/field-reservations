'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { BiLoaderAlt } from 'react-icons/bi'
import { MdLock } from 'react-icons/md'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const { updatePassword, session } = useAuth()
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    // Check if user has a valid session (came from email link)
    if (!session) {
      showToast('Error', 'Invalid or expired reset link', 'error')
      router.push('/forgot-password')
    }
  }, [session, router, showToast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      showToast('Error', 'Passwords do not match', 'error')
      return
    }

    if (password.length < 6) {
      showToast('Error', 'Password must be at least 6 characters', 'error')
      return
    }

    setIsLoading(true)

    try {
      await updatePassword(password)
      setIsSuccess(true)
      showToast('Success', 'Password updated successfully!', 'success')
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (error: any) {
      showToast('Error', error.message || 'Failed to update password', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <Card className="p-8 shadow-xl bg-white/95 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <MdLock className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Updated!</h1>
          <p className="text-gray-600 mb-6">
            Your password has been successfully updated.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to login...
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-8 shadow-xl bg-white/95 backdrop-blur">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h1>
        <p className="text-gray-600">
          Enter your new password below
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="password" className="text-gray-700">
            New Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            className="mt-1"
          />
          <p className="mt-2 text-sm text-gray-500">
            Must be at least 6 characters
          </p>
        </div>

        <div>
          <Label htmlFor="confirmPassword" className="text-gray-700">
            Confirm New Password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading}
            className="mt-1"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <BiLoaderAlt className="animate-spin mr-2" />
              Updating password...
            </>
          ) : (
            'Update Password'
          )}
        </Button>
      </form>
    </Card>
  )
}