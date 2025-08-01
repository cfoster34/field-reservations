'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Field } from '@/types/field'
import { TimeSlot, BookingRules } from '@/types/reservation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react'
import { format, addDays, isSameDay, isAfter, isBefore } from 'date-fns'
import { createClient } from '@/lib/supabase/client'

export default function TimeSlotSelectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fieldId = searchParams.get('fieldId')
  
  const [field, setField] = useState<Field | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [selectedSlots, setSelectedSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingRules, setBookingRules] = useState<BookingRules | null>(null)
  const [recurringMode, setRecurringMode] = useState(false)
  const [recurringPattern, setRecurringPattern] = useState({
    type: 'weekly' as 'daily' | 'weekly' | 'monthly',
    interval: 1,
    endDate: addDays(new Date(), 30)
  })

  const supabase = createClient()

  useEffect(() => {
    if (!fieldId) {
      router.push('/booking')
      return
    }
    
    fetchFieldAndRules()
    // Set up real-time subscription
    const channel = supabase
      .channel(`field_${fieldId}_availability`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `field_id=eq.${fieldId}`
        },
        () => {
          // Refresh time slots when reservations change
          fetchTimeSlots(selectedDate)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fieldId])

  useEffect(() => {
    if (field) {
      fetchTimeSlots(selectedDate)
    }
  }, [selectedDate, field])

  const fetchFieldAndRules = async () => {
    try {
      // Fetch field details
      const fieldResponse = await fetch(`/api/fields/${fieldId}`)
      if (!fieldResponse.ok) throw new Error('Failed to fetch field')
      const fieldData = await fieldResponse.json()
      setField(fieldData)

      // Fetch booking rules
      const rulesResponse = await fetch(`/api/fields/${fieldId}/rules`)
      if (rulesResponse.ok) {
        const rulesData = await rulesResponse.json()
        setBookingRules(rulesData)
      }
    } catch (error) {
      console.error('Error fetching field:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTimeSlots = async (date: Date) => {
    if (!field) return

    setLoading(true)
    try {
      const response = await fetch(
        `/api/fields/${fieldId}/availability?date=${format(date, 'yyyy-MM-dd')}`
      )
      if (!response.ok) throw new Error('Failed to fetch availability')
      const data = await response.json()
      setTimeSlots(data.slots)
    } catch (error) {
      console.error('Error fetching time slots:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkBookingRules = useCallback(async (slot: TimeSlot) => {
    if (!bookingRules) return { allowed: true, reasons: [] }

    const response = await fetch('/api/reservations/check-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldId,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime
      })
    })

    if (!response.ok) return { allowed: false, reasons: ['Failed to check rules'] }
    return await response.json()
  }, [fieldId, bookingRules])

  const handleSlotSelection = async (slot: TimeSlot) => {
    if (!slot.available) return

    // Check booking rules
    const rulesCheck = await checkBookingRules(slot)
    if (!rulesCheck.allowed) {
      alert(rulesCheck.reasons.join('\n'))
      return
    }

    if (recurringMode) {
      // In recurring mode, only allow one slot selection
      setSelectedSlots([slot])
    } else {
      // Toggle slot selection
      const isSelected = selectedSlots.some(s => 
        s.date === slot.date && 
        s.startTime === slot.startTime &&
        s.endTime === slot.endTime
      )

      if (isSelected) {
        setSelectedSlots(selectedSlots.filter(s => 
          !(s.date === slot.date && 
            s.startTime === slot.startTime &&
            s.endTime === slot.endTime)
        ))
      } else {
        setSelectedSlots([...selectedSlots, slot])
      }
    }
  }

  const handleContinue = () => {
    if (selectedSlots.length === 0) return

    // Store selection in session storage
    const bookingData = {
      fieldId,
      fieldName: field?.name,
      slots: selectedSlots,
      recurringMode,
      recurringPattern: recurringMode ? recurringPattern : null,
      totalPrice: selectedSlots.reduce((sum, slot) => sum + (slot.price || field?.hourlyRate || 0), 0)
    }

    sessionStorage.setItem('bookingData', JSON.stringify(bookingData))
    router.push('/booking/confirm')
  }

  const disabledDates = (date: Date) => {
    if (!bookingRules) return false
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Can't book in the past
    if (isBefore(date, today)) return true
    
    // Check advance booking limit
    const maxDate = addDays(today, bookingRules.advanceBookingDays)
    if (isAfter(date, maxDate)) return true
    
    return false
  }

  if (loading && !field) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  if (!field) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Field not found. Please go back and select a field.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Select Time Slot</h1>
        <p className="text-muted-foreground">
          Choose when you want to book {field.name}
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
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-semibold">
              2
            </div>
            <span className="ml-2 font-medium">Choose Time</span>
          </div>
          <div className="w-16 h-0.5 bg-gray-300" />
          <div className="flex items-center opacity-50">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center font-semibold">
              3
            </div>
            <span className="ml-2">Confirm Booking</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Select Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              disabled={disabledDates}
              className="rounded-md border"
            />
            
            {bookingRules?.allowRecurring && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="recurring"
                    checked={recurringMode}
                    onCheckedChange={setRecurringMode}
                  />
                  <Label htmlFor="recurring" className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Recurring Booking
                  </Label>
                </div>
                
                {recurringMode && (
                  <div className="space-y-2 p-4 bg-muted rounded-lg">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={recurringPattern.type === 'daily' ? 'default' : 'outline'}
                        onClick={() => setRecurringPattern({...recurringPattern, type: 'daily'})}
                      >
                        Daily
                      </Button>
                      <Button
                        size="sm"
                        variant={recurringPattern.type === 'weekly' ? 'default' : 'outline'}
                        onClick={() => setRecurringPattern({...recurringPattern, type: 'weekly'})}
                      >
                        Weekly
                      </Button>
                      <Button
                        size="sm"
                        variant={recurringPattern.type === 'monthly' ? 'default' : 'outline'}
                        onClick={() => setRecurringPattern({...recurringPattern, type: 'monthly'})}
                      >
                        Monthly
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Repeats {recurringPattern.type} until {format(recurringPattern.endDate, 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time Slots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Available Time Slots
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : timeSlots.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No time slots available for this date.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {timeSlots.map((slot, index) => {
                  const isSelected = selectedSlots.some(s => 
                    s.date === slot.date && 
                    s.startTime === slot.startTime &&
                    s.endTime === slot.endTime
                  )
                  
                  return (
                    <button
                      key={index}
                      onClick={() => handleSlotSelection(slot)}
                      disabled={!slot.available}
                      className={`w-full p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : slot.available
                          ? 'hover:bg-muted border-border'
                          : 'opacity-50 cursor-not-allowed bg-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">
                            {format(new Date(`2000-01-01T${slot.startTime}`), 'h:mm a')} - 
                            {format(new Date(`2000-01-01T${slot.endTime}`), 'h:mm a')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {slot.price && (
                            <Badge variant="secondary">
                              ${slot.price}
                            </Badge>
                          )}
                          {slot.conflicts && slot.conflicts.length > 0 && (
                            <Badge variant="destructive">
                              Conflict
                            </Badge>
                          )}
                          {!slot.available && (
                            <Badge variant="outline">
                              Unavailable
                            </Badge>
                          )}
                        </div>
                      </div>
                      {slot.conflicts && slot.conflicts.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Booked by {slot.conflicts[0].userName || 'Another user'}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Selected Slots Summary */}
      {selectedSlots.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Selected Time Slots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedSlots.map((slot, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span>
                    {format(new Date(slot.date), 'MMM d')} • 
                    {format(new Date(`2000-01-01T${slot.startTime}`), 'h:mm a')} - 
                    {format(new Date(`2000-01-01T${slot.endTime}`), 'h:mm a')}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSlotSelection(slot)}
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Price:</span>
                <span className="text-xl font-bold">
                  ${selectedSlots.reduce((sum, slot) => sum + (slot.price || field.hourlyRate || 0), 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex justify-between">
        <Button
          variant="outline"
          onClick={() => router.push('/booking')}
        >
          Back to Field Selection
        </Button>
        <Button
          size="lg"
          onClick={handleContinue}
          disabled={selectedSlots.length === 0}
        >
          Continue to Confirmation
        </Button>
      </div>
    </div>
  )
}