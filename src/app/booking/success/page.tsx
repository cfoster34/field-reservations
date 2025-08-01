'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { format } from 'date-fns'
import { CheckCircle, Calendar, Clock, MapPin, Download, Share2 } from 'lucide-react'

interface BookingDetails {
  bookingId: string
  fieldId: string
  date: string
  timeSlot: {
    startTime: string
    endTime: string
    price: number
  }
  name: string
  email: string
  phone: string
  teamName?: string
  notes?: string
}

export default function BookingSuccessPage() {
  const router = useRouter()
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null)

  useEffect(() => {
    // Retrieve booking success data from session storage
    const successData = sessionStorage.getItem('bookingSuccess')
    if (!successData) {
      router.push('/booking')
      return
    }
    
    const data = JSON.parse(successData)
    setBookingDetails(data)
    
    // Clear the success data
    sessionStorage.removeItem('bookingSuccess')
  }, [router])

  if (!bookingDetails) {
    return null
  }

  // Demo field names
  const fieldNames: { [key: string]: string } = {
    'demo1': 'Soccer Field A',
    'demo2': 'Basketball Court 1',
    'demo3': 'Tennis Court A'
  }

  const handleDownloadReceipt = () => {
    // In a real app, this would generate a PDF receipt
    alert('Receipt download functionality would be implemented here')
  }

  const handleShare = () => {
    // In a real app, this would share the booking details
    if (navigator.share) {
      navigator.share({
        title: 'Field Reservation Confirmed',
        text: `My field reservation is confirmed for ${format(new Date(bookingDetails.date), 'MMMM d, yyyy')} at ${bookingDetails.timeSlot.startTime}`,
        url: window.location.href
      })
    } else {
      alert('Share functionality would be implemented here')
    }
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold">
            Field Reservations
          </Link>
          <nav className="flex gap-4">
            <Link href="/booking">
              <Button variant="ghost">Book Another Field</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>Sign Up</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600">Your field reservation has been successfully booked</p>
        </div>

        {/* Booking Details Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
            <CardDescription>Booking ID: {bookingDetails.bookingId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Field Information */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-gray-500" />
                Field Information
              </h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{fieldNames[bookingDetails.fieldId || ''] || 'Field'}</p>
                <p className="text-sm text-gray-600">123 Sports Complex Drive</p>
                <p className="text-sm text-gray-600">Anytown, ST 12345</p>
              </div>
            </div>

            {/* Date & Time */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                Date & Time
              </h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{format(new Date(bookingDetails.date), 'EEEE, MMMM d, yyyy')}</p>
                <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                  <Clock className="w-4 h-4" />
                  {bookingDetails.timeSlot.startTime} - {bookingDetails.timeSlot.endTime} (1 hour)
                </p>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="font-semibold mb-3">Contact Information</h3>
              <div className="bg-gray-50 p-4 rounded-lg space-y-1">
                <p><span className="text-gray-600">Name:</span> {bookingDetails.name}</p>
                <p><span className="text-gray-600">Email:</span> {bookingDetails.email}</p>
                <p><span className="text-gray-600">Phone:</span> {bookingDetails.phone}</p>
                {bookingDetails.teamName && (
                  <p><span className="text-gray-600">Team:</span> {bookingDetails.teamName}</p>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div>
              <h3 className="font-semibold mb-3">Payment Summary</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Field Rental</span>
                  <span>${bookingDetails.timeSlot.price}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Processing Fee</span>
                  <span>$5.00</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="font-semibold">Total Paid</span>
                  <span className="font-bold">${bookingDetails.timeSlot.price + 5}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Important Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Important Information</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>A confirmation email has been sent to {bookingDetails.email}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>Please arrive 10 minutes before your scheduled time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>Bring your booking ID or confirmation email for check-in</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>Cancellations must be made at least 24 hours in advance</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            variant="outline" 
            className="flex-1" 
            onClick={handleDownloadReceipt}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Receipt
          </Button>
          <Button 
            variant="outline" 
            className="flex-1" 
            onClick={handleShare}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Booking
          </Button>
          <Link href="/booking" className="flex-1">
            <Button className="w-full">Book Another Field</Button>
          </Link>
        </div>

        {/* Create Account CTA */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2">Create an Account</h3>
            <p className="text-sm text-gray-600 mb-4">
              Sign up to manage your bookings, join teams, and get exclusive discounts!
            </p>
            <Link href="/signup">
              <Button>Create Free Account</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}