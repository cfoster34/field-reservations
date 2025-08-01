'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { format, addDays } from 'date-fns'

interface TimeSlot {
  startTime: string
  endTime: string
  available: boolean
  price?: number
}

export default function TimeSlotPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fieldId = searchParams.get('field')
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [loading, setLoading] = useState(false)

  // Demo time slots
  const timeSlots: TimeSlot[] = [
    { startTime: '08:00', endTime: '09:00', available: true, price: 80 },
    { startTime: '09:00', endTime: '10:00', available: true, price: 80 },
    { startTime: '10:00', endTime: '11:00', available: false, price: 100 },
    { startTime: '11:00', endTime: '12:00', available: true, price: 100 },
    { startTime: '14:00', endTime: '15:00', available: true, price: 120 },
    { startTime: '15:00', endTime: '16:00', available: true, price: 120 },
    { startTime: '16:00', endTime: '17:00', available: false, price: 120 },
    { startTime: '17:00', endTime: '18:00', available: true, price: 100 },
    { startTime: '18:00', endTime: '19:00', available: true, price: 100 },
    { startTime: '19:00', endTime: '20:00', available: true, price: 80 },
  ]

  const handleContinue = () => {
    if (!selectedSlot || !selectedDate) return

    // Store booking data in session storage
    const bookingData = {
      fieldId,
      date: format(selectedDate, 'yyyy-MM-dd'),
      timeSlot: selectedSlot,
      totalPrice: selectedSlot.price
    }
    
    sessionStorage.setItem('pendingBooking', JSON.stringify(bookingData))
    router.push('/booking/confirm')
  }

  const disabledDates = (date: Date) => {
    // Disable past dates
    return date < new Date(new Date().setHours(0, 0, 0, 0))
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
          <h1 className="text-3xl font-bold mb-2">Select Date & Time</h1>
          <p className="text-gray-600">Choose when you want to book the field</p>
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
          <div className="flex items-center text-blue-600">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
              2
            </div>
            <span className="ml-2 font-semibold">Choose Time</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>
          <div className="flex items-center text-gray-400">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center font-semibold">
              3
            </div>
            <span className="ml-2">Confirm & Pay</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>Select Date</CardTitle>
              <CardDescription>Choose your preferred date</CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={disabledDates}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          {/* Time Slots */}
          <Card>
            <CardHeader>
              <CardTitle>Available Time Slots</CardTitle>
              <CardDescription>
                {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Select a date'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDate ? (
                <div className="grid grid-cols-2 gap-3">
                  {timeSlots.map((slot, index) => (
                    <button
                      key={index}
                      onClick={() => slot.available && setSelectedSlot(slot)}
                      disabled={!slot.available}
                      className={`p-3 rounded-lg border text-sm transition-all ${
                        selectedSlot === slot
                          ? 'bg-blue-600 text-white border-blue-600'
                          : slot.available
                          ? 'hover:bg-gray-50 border-gray-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <div className="font-medium">
                        {slot.startTime} - {slot.endTime}
                      </div>
                      <div className="mt-1">
                        {slot.available ? (
                          <span className="text-green-600 font-semibold">${slot.price}</span>
                        ) : (
                          <span className="text-red-500">Booked</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">
                  Please select a date to view available time slots
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Selected slot summary */}
        {selectedSlot && selectedDate && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Booking Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date:</span>
                  <span className="font-medium">{format(selectedDate, 'MMMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Time:</span>
                  <span className="font-medium">{selectedSlot.startTime} - {selectedSlot.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-medium">1 hour</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Total Price:</span>
                  <span className="font-bold text-xl">${selectedSlot.price}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 flex justify-between">
          <Link href="/booking">
            <Button variant="outline" size="lg">
              Back to Fields
            </Button>
          </Link>
          <Button 
            size="lg"
            onClick={handleContinue}
            disabled={!selectedSlot || !selectedDate}
          >
            Continue to Checkout
          </Button>
        </div>
      </main>
    </div>
  )
}