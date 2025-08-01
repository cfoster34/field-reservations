'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  MapPin, 
  Clock, 
  Calendar,
  Zap,
  Star,
  TrendingUp,
  AlertCircle
} from 'lucide-react'
import { format, addMinutes, isToday, isTomorrow } from 'date-fns'
import { Field } from '@/types/field'
import { TimeSlot } from '@/types/reservation'

interface QuickBookingSlot {
  field: Field
  slot: TimeSlot
  availability: 'High' | 'Medium' | 'Low'
}

export function QuickBooking() {
  const router = useRouter()
  const [quickSlots, setQuickSlots] = useState<QuickBookingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingInProgress, setBookingInProgress] = useState<string | null>(null)

  useEffect(() => {
    fetchQuickBookingSlots()
  }, [])

  const fetchQuickBookingSlots = async () => {
    try {
      // Get user's frequently booked fields
      const fieldsResponse = await fetch('/api/fields?limit=5&sort=popular')
      if (!fieldsResponse.ok) throw new Error('Failed to fetch fields')
      const fields: Field[] = await fieldsResponse.json()

      // Get next available slot for each field
      const quickSlotsPromises = fields.map(async (field) => {
        const today = new Date()
        const tomorrow = addMinutes(today, 24 * 60)
        
        // Check today's availability
        const todayResponse = await fetch(
          `/api/fields/${field.id}/availability?date=${format(today, 'yyyy-MM-dd')}`
        )
        
        if (todayResponse.ok) {
          const todayData = await todayResponse.json()
          const availableSlots = todayData.slots?.filter((s: TimeSlot) => s.available) || []
          
          if (availableSlots.length > 0) {
            const nextSlot = availableSlots[0]
            const totalSlots = todayData.slots?.length || 0
            const availableCount = availableSlots.length
            
            return {
              field,
              slot: nextSlot,
              availability: availableCount / totalSlots > 0.7 ? 'High' : 
                           availableCount / totalSlots > 0.3 ? 'Medium' : 'Low'
            } as QuickBookingSlot
          }
        }
        
        // Check tomorrow if no slots today
        const tomorrowResponse = await fetch(
          `/api/fields/${field.id}/availability?date=${format(tomorrow, 'yyyy-MM-dd')}`
        )
        
        if (tomorrowResponse.ok) {
          const tomorrowData = await tomorrowResponse.json()
          const availableSlots = tomorrowData.slots?.filter((s: TimeSlot) => s.available) || []
          
          if (availableSlots.length > 0) {
            return {
              field,
              slot: availableSlots[0],
              availability: 'High'
            } as QuickBookingSlot
          }
        }
        
        return null
      })

      const slots = (await Promise.all(quickSlotsPromises)).filter(Boolean) as QuickBookingSlot[]
      setQuickSlots(slots.slice(0, 3)) // Show top 3
    } catch (error) {
      console.error('Error fetching quick booking slots:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickBook = async (quickSlot: QuickBookingSlot) => {
    setBookingInProgress(quickSlot.field.id)
    
    try {
      // Create booking session for quick booking
      const sessionResponse = await fetch('/api/reservations/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId: quickSlot.field.id,
          slots: [{
            date: quickSlot.slot.date,
            startTime: quickSlot.slot.startTime,
            endTime: quickSlot.slot.endTime,
            price: quickSlot.slot.price
          }],
          recurringMode: false,
          purpose: 'Quick Booking',
          attendees: 1,
          notes: 'Booked via Quick Booking widget'
        })
      })

      if (!sessionResponse.ok) throw new Error('Failed to create booking session')
      
      const { sessionId } = await sessionResponse.json()
      
      // Redirect to confirmation page
      router.push(`/booking/confirm?session=${sessionId}&quick=true`)
    } catch (error) {
      console.error('Quick booking error:', error)
      alert('Failed to create quick booking. Please try the regular booking flow.')
    } finally {
      setBookingInProgress(null)
    }
  }

  const formatSlotTime = (slot: TimeSlot) => {
    const slotDate = new Date(slot.date)
    const timeStr = format(new Date(`2000-01-01T${slot.startTime}`), 'h:mm a')
    
    if (isToday(slotDate)) {
      return `${timeStr} Today`
    } else if (isTomorrow(slotDate)) {
      return `${timeStr} Tomorrow`
    } else {
      return `${timeStr} ${format(slotDate, 'MMM d')}`
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Quick Booking
          </CardTitle>
          <CardDescription>
            Book your favorite fields instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Quick Booking
        </CardTitle>
        <CardDescription>
          Book your favorite fields instantly
        </CardDescription>
      </CardHeader>
      <CardContent>
        {quickSlots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p>No quick booking slots available</p>
            <Button 
              variant="link" 
              onClick={() => router.push('/booking')}
              className="mt-2"
            >
              Browse all fields
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {quickSlots.map((quickSlot) => (
              <div
                key={quickSlot.field.id}
                className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{quickSlot.field.name}</p>
                    {quickSlot.field.type === 'soccer' && (
                      <Star className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {quickSlot.field.address?.split(',')[0]}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatSlotTime(quickSlot.slot)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium">
                      ${quickSlot.slot.price || quickSlot.field.hourlyRate}
                    </span>
                    {quickSlot.availability === 'Low' && (
                      <Badge variant="destructive" className="text-xs">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Filling Fast
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      quickSlot.availability === 'High'
                        ? 'default'
                        : quickSlot.availability === 'Medium'
                        ? 'secondary'
                        : 'destructive'
                    }
                    className="text-xs"
                  >
                    {quickSlot.availability}
                  </Badge>
                  <Button 
                    size="sm"
                    onClick={() => handleQuickBook(quickSlot)}
                    disabled={bookingInProgress === quickSlot.field.id}
                  >
                    {bookingInProgress === quickSlot.field.id ? (
                      <span className="flex items-center gap-1">
                        <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                        Booking...
                      </span>
                    ) : (
                      'Book Now'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-4 text-center">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => router.push('/booking')}
          >
            <Calendar className="w-4 h-4 mr-2" />
            View All Available Slots
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}