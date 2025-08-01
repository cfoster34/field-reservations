import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MdError } from 'react-icons/md'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
      <Card className="p-8 max-w-md w-full shadow-xl bg-white/95 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <MdError className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Authentication Error</h1>
          <p className="text-gray-600 mb-6">
            There was an error during authentication. This could be due to an expired link or an invalid request.
          </p>
          <div className="space-y-3">
            <Link href="/login">
              <Button className="w-full">
                Back to Login
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full">
                Go to Home
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-500">
            If you continue to experience issues, please contact support at support@fieldreservations.com
          </p>
        </div>
      </Card>
    </div>
  )
}