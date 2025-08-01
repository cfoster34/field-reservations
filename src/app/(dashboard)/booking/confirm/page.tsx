'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  DollarSign,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Share2,
  Download
} from 'lucide-react'
import { format } from 'date-fns'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface BookingData {
  fieldId: string
  fieldName: string
  slots: Array<{
    date: string
    startTime: string
    endTime: string
    price?: number
  }>
  recurringMode: boolean
  recurringPattern?: {
    type: 'daily' | 'weekly' | 'monthly'
    interval: number
    endDate: Date
  }
  totalPrice: number
}

export default function BookingConfirmationPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [bookingData, setBookingData] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    purpose: '',
    attendees: 1,
    notes: '',
    teamId: ''
  })
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'full' | 'deposit'>('full')
  const [teams, setTeams] = useState<any[]>([])

  useEffect(() => {
    // Retrieve booking data from session storage
    const storedData = sessionStorage.getItem('bookingData')
    if (!storedData) {
      router.push('/booking')
      return
    }
    
    const data = JSON.parse(storedData)
    setBookingData(data)
    
    // Fetch user's teams
    fetchUserTeams()
  }, [])

  const fetchUserTeams = async () => {
    try {
      const response = await fetch('/api/users/team')
      if (response.ok) {
        const data = await response.json()
        setTeams(data)
      }
    } catch (error) {
      console.error('Error fetching teams:', error)
    }
  }

  const handleSubmit = async () => {
    if (!bookingData || !agreeToTerms) return

    setLoading(true)
    try {
      // Create booking session
      const sessionResponse = await fetch('/api/reservations/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId: bookingData.fieldId,
          slots: bookingData.slots,
          recurringMode: bookingData.recurringMode,
          recurringPattern: bookingData.recurringPattern,
          ...formData
        })
      })

      if (!sessionResponse.ok) {
        throw new Error('Failed to create booking session')
      }

      const { sessionId } = await sessionResponse.json()

      // Create payment intent
      const paymentResponse = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          amount: paymentMethod === 'deposit' 
            ? Math.round(bookingData.totalPrice * 0.25) // 25% deposit
            : bookingData.totalPrice,
          paymentMethod
        })
      })

      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment')
      }

      const { clientSecret } = await paymentResponse.json()

      // Redirect to Stripe Checkout
      const stripe = await stripePromise
      if (!stripe) throw new Error('Stripe not loaded')

      const { error } = await stripe.confirmPayment({
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/booking/success?session=${sessionId}`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Booking error:', error)
      alert('Failed to create booking. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const calculateRecurringBookings = () => {
    if (!bookingData?.recurringMode || !bookingData.recurringPattern) return 1

    const { type, interval, endDate } = bookingData.recurringPattern
    const startDate = new Date(bookingData.slots[0].date)
    const end = new Date(endDate)
    
    let count = 0
    let currentDate = new Date(startDate)
    
    while (currentDate <= end && count < 52) { // Max 52 occurrences
      count++
      
      switch (type) {
        case 'daily':
          currentDate.setDate(currentDate.getDate() + interval)
          break
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + (interval * 7))
          break
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + interval)
          break
      }
    }
    
    return count
  }

  if (!bookingData) {
    return null
  }

  const recurringCount = calculateRecurringBookings()
  const totalWithRecurring = bookingData.totalPrice * recurringCount

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Confirm Your Booking</h1>
        <p className="text-muted-foreground">
          Review your booking details and complete the reservation
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="ml-2">Select Field</span>
          </div>
          <div className="w-16 h-0.5 bg-gray-300" />
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="ml-2">Choose Time</span>
          </div>
          <div className="w-16 h-0.5 bg-gray-300" />
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
              3
            </div>
            <span className="ml-2 font-medium">Confirm Booking</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Booking Details */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Booking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{bookingData.fieldName}</span>
              </div>
              
              {bookingData.recurringMode ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">
                      Recurring {bookingData.recurringPattern?.type} booking
                    </span>
                  </div>
                  <div className="pl-7 text-sm text-muted-foreground">
                    <p>Starting: {format(new Date(bookingData.slots[0].date), 'MMMM d, yyyy')}</p>
                    <p>Time: {format(new Date(`2000-01-01T${bookingData.slots[0].startTime}`), 'h:mm a')} - 
                      {format(new Date(`2000-01-01T${bookingData.slots[0].endTime}`), 'h:mm a')}</p>
                    <p>Occurrences: {recurringCount}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {bookingData.slots.map((slot, index) => (
                    <div key={index} className="flex items-center gap-4 p-2 bg-muted rounded">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{format(new Date(slot.date), 'EEEE, MMMM d, yyyy')}</span>
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>
                        {format(new Date(`2000-01-01T${slot.startTime}`), 'h:mm a')} - 
                        {format(new Date(`2000-01-01T${slot.endTime}`), 'h:mm a')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Booking Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="purpose">Purpose of Booking *</Label>
                <Input
                  id="purpose"
                  value={formData.purpose}
                  onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                  placeholder="e.g., Team practice, Tournament, Training session"
                  required
                />
              </div>

              <div>
                <Label htmlFor="attendees">Expected Attendees *</Label>
                <Input
                  id="attendees"
                  type="number"
                  min="1"
                  value={formData.attendees}
                  onChange={(e) => setFormData({...formData, attendees: parseInt(e.target.value) || 1})}
                  required
                />
              </div>

              {teams.length > 0 && (
                <div>
                  <Label htmlFor="team">Team (Optional)</Label>
                  <select
                    id="team"
                    className="w-full p-2 border rounded-md"
                    value={formData.teamId}
                    onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                  >
                    <option value="">Select a team</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Any special requirements or notes..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground mb-4">
                <p>• Bookings are subject to our cancellation policy</p>
                <p>• You must arrive on time for your booking</p>
                <p>• Field must be left in good condition</p>
                <p>• Weather-related cancellations will be refunded</p>
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
            </CardContent>
          </Card>
        </div>

        {/* Payment Summary */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {bookingData.slots.map((slot, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span>{format(new Date(slot.date), 'MMM d')}</span>
                    <span>${slot.price || bookingData.totalPrice}</span>
                  </div>
                ))}
                {bookingData.recurringMode && recurringCount > 1 && (
                  <div className="text-sm text-muted-foreground">
                    × {recurringCount} occurrences
                  </div>
                )}
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between font-medium">
                  <span>Subtotal</span>
                  <span>${totalWithRecurring.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Processing Fee</span>
                  <span>${(totalWithRecurring * 0.029 + 0.30).toFixed(2)}</span>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Payment Option</Label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        value="full"
                        checked={paymentMethod === 'full'}
                        onChange={(e) => setPaymentMethod(e.target.value as 'full' | 'deposit')}
                      />
                      <span className="text-sm">Pay in full</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        value="deposit"
                        checked={paymentMethod === 'deposit'}
                        onChange={(e) => setPaymentMethod(e.target.value as 'full' | 'deposit')}
                      />
                      <span className="text-sm">Pay 25% deposit</span>
                    </label>
                  </div>
                </div>
                
                <div className="flex justify-between text-lg font-bold">
                  <span>Total Due Now</span>
                  <span>
                    ${paymentMethod === 'deposit' 
                      ? (totalWithRecurring * 0.25).toFixed(2)
                      : totalWithRecurring.toFixed(2)
                    }
                  </span>
                </div>
              </div>
              
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={loading || !formData.purpose || !agreeToTerms}
              >
                {loading ? 'Processing...' : 'Proceed to Payment'}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                Secure payment powered by Stripe
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}