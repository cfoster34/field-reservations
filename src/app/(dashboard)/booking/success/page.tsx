'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle, 
  Calendar, 
  Clock, 
  MapPin, 
  Share2, 
  Download,
  Mail,
  CalendarPlus
} from 'lucide-react'
import { format } from 'date-fns'
import confetti from 'canvas-confetti'

export default function BookingSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) {
      router.push('/booking')
      return
    }

    fetchBookingDetails()
    
    // Trigger confetti animation
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    })
  }, [sessionId])

  const fetchBookingDetails = async () => {
    try {
      const response = await fetch(`/api/reservations/session/${sessionId}`)
      if (!response.ok) throw new Error('Failed to fetch booking details')
      const data = await response.json()
      setBooking(data)
    } catch (error) {
      console.error('Error fetching booking:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShare = async () => {
    if (!booking) return

    const shareData = {
      title: 'Field Reservation',
      text: `I've booked ${booking.field.name} on ${format(new Date(booking.date), 'MMMM d, yyyy')}`,
      url: `${window.location.origin}/booking/view/${booking.shareToken}`
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        // Fallback to copying link
        await navigator.clipboard.writeText(shareData.url)
        alert('Link copied to clipboard!')
      }
    } catch (error) {
      console.error('Error sharing:', error)
    }
  }

  const handleAddToCalendar = () => {
    if (!booking) return

    const startDate = new Date(`${booking.date}T${booking.startTime}`)
    const endDate = new Date(`${booking.date}T${booking.endTime}`)
    
    const event = {
      title: `Field Reservation - ${booking.field.name}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      description: `Purpose: ${booking.purpose}\nAttendees: ${booking.attendees}`,
      location: booking.field.address
    }

    // Google Calendar URL
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}`
    
    window.open(googleUrl, '_blank')
  }

  const handleDownloadReceipt = async () => {
    if (!booking) return

    try {
      const response = await fetch(`/api/reservations/${booking.id}/receipt`)
      if (!response.ok) throw new Error('Failed to download receipt')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reservation-${booking.id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading receipt:', error)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Processing your booking...</p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Alert>
          <AlertDescription>
            Booking not found. Please check your email for confirmation.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Booking Confirmed!</h1>
        <p className="text-muted-foreground">
          Your reservation has been successfully created
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Booking Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Booking ID: {booking.id}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">{booking.field.name}</p>
              <p className="text-sm text-muted-foreground">{booking.field.address}</p>
            </div>
          </div>

          {booking.recurringId ? (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Recurring Booking</p>
                <p className="text-sm text-muted-foreground">
                  {booking.recurringPattern.type} starting {format(new Date(booking.date), 'MMMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {booking.recurringBookings?.length || 0} occurrences created
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{format(new Date(booking.date), 'EEEE, MMMM d, yyyy')}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    {format(new Date(`2000-01-01T${booking.startTime}`), 'h:mm a')} - 
                    {format(new Date(`2000-01-01T${booking.endTime}`), 'h:mm a')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Purpose</p>
              <p className="font-medium">{booking.purpose}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Attendees</p>
              <p className="font-medium">{booking.attendees}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Paid</p>
              <p className="font-medium">${booking.totalPrice}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium capitalize">{booking.status}</p>
            </div>
          </div>

          {booking.notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{booking.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Alert className="mb-6">
        <Mail className="w-4 h-4" />
        <AlertDescription>
          A confirmation email has been sent to {booking.user.email} with all the booking details.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleShare}
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share Booking
        </Button>
        
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleAddToCalendar}
        >
          <CalendarPlus className="w-4 h-4 mr-2" />
          Add to Calendar
        </Button>
        
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleDownloadReceipt}
        >
          <Download className="w-4 h-4 mr-2" />
          Download Receipt
        </Button>
      </div>

      <div className="mt-8 text-center">
        <Button
          size="lg"
          onClick={() => router.push('/dashboard')}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  )
}