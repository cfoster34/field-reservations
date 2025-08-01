'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { format } from 'date-fns'

interface BookingData {
  fieldId: string
  date: string
  timeSlot: {
    startTime: string
    endTime: string
    price: number
  }
  totalPrice: number
}

export default function BookingConfirmPage() {
  const router = useRouter()
  const [bookingData, setBookingData] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    teamName: '',
    notes: ''
  })
  const [agreeToTerms, setAgreeToTerms] = useState(false)

  useEffect(() => {
    // Retrieve booking data from session storage
    const storedData = sessionStorage.getItem('pendingBooking')
    if (!storedData) {
      router.push('/booking')
      return
    }
    
    const data = JSON.parse(storedData)
    setBookingData(data)
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!agreeToTerms) {
      alert('Please agree to the terms and conditions')
      return
    }

    setLoading(true)
    
    // Simulate booking process
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Clear booking data
    sessionStorage.removeItem('pendingBooking')
    
    // Store success data
    sessionStorage.setItem('bookingSuccess', JSON.stringify({
      ...bookingData,
      ...formData,
      bookingId: `BK${Date.now()}`
    }))
    
    // Redirect to success page
    router.push('/booking/success')
  }

  if (!bookingData) {
    return null
  }

  // Demo field names
  const fieldNames: { [key: string]: string } = {
    'demo1': 'Soccer Field A',
    'demo2': 'Basketball Court 1',
    'demo3': 'Tennis Court A'
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
              <Button variant="ghost">Book a Field</Button>
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

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Confirm Your Booking</h1>
          <p className="text-gray-600">Please review your booking details and provide your information</p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center mb-8">
          <div className="flex items-center text-green-600">
            <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold">
              ✓
            </div>
            <span className="ml-2">Select Field</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>
          <div className="flex items-center text-green-600">
            <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold">
              ✓
            </div>
            <span className="ml-2">Choose Time</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>
          <div className="flex items-center text-blue-600">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
              3
            </div>
            <span className="ml-2 font-semibold">Confirm & Pay</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>We'll use this information to confirm your booking</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>
                    <div>
                      <Label htmlFor="teamName">Team/Group Name</Label>
                      <Input
                        id="teamName"
                        type="text"
                        value={formData.teamName}
                        onChange={(e) => setFormData({...formData, teamName: e.target.value})}
                        placeholder="Eagles FC"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      placeholder="Any special requirements or notes..."
                      rows={4}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Terms & Conditions</h3>
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <p>• Bookings must be cancelled at least 24 hours in advance for a full refund</p>
                      <p>• You are responsible for any damages to the field during your booking</p>
                      <p>• Weather-related cancellations will be fully refunded</p>
                      <p>• Maximum group size and other field-specific rules apply</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terms"
                        checked={agreeToTerms}
                        onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
                      />
                      <Label htmlFor="terms" className="text-sm cursor-pointer">
                        I agree to the terms and conditions
                      </Label>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Link href="/booking/time-slots" className="flex-1">
                      <Button type="button" variant="outline" className="w-full">
                        Back
                      </Button>
                    </Link>
                    <Button type="submit" className="flex-1" disabled={loading || !agreeToTerms}>
                      {loading ? 'Processing...' : 'Proceed to Payment'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Booking Summary */}
          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Booking Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Field</h4>
                  <p className="text-gray-600">{fieldNames[bookingData.fieldId || ''] || 'Field'}</p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Date & Time</h4>
                  <p className="text-gray-600">
                    {format(new Date(bookingData.date), 'EEEE, MMMM d, yyyy')}
                  </p>
                  <p className="text-gray-600">
                    {bookingData.timeSlot.startTime} - {bookingData.timeSlot.endTime}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Duration</h4>
                  <p className="text-gray-600">1 hour</p>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Field Rental</span>
                    <span>${bookingData.timeSlot.price}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-gray-600">Processing Fee</span>
                    <span>$5.00</span>
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-4 border-t">
                    <span className="font-semibold text-lg">Total</span>
                    <span className="font-bold text-xl">${bookingData.timeSlot.price + 5}</span>
                  </div>
                </div>

                <div className="text-sm text-gray-500 text-center pt-4">
                  <p>Secure payment processing</p>
                  <p>No payment info stored</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}