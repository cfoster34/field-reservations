'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Reservation } from '@/types/reservation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users,
  CalendarPlus,
  Share2,
  AlertCircle
} from 'lucide-react'
import { format } from 'date-fns'

export default function SharedBookingPage() {
  const params = useParams()
  const token = params.token as string
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      fetchSharedReservation()
    }
  }, [token])

  const fetchSharedReservation = async () => {
    try {
      const response = await fetch(`/api/reservations/shared/${token}`)
      if (!response.ok) {
        if (response.status === 404) {
          setError('Shared booking not found or no longer available')
        } else {
          setError('Failed to load shared booking')
        }
        return
      }
      
      const data = await response.json()
      setReservation(data)
    } catch (err) {
      console.error('Error fetching shared reservation:', err)
      setError('Failed to load shared booking')
    } finally {
      setLoading(false)
    }
  }

  const handleAddToCalendar = () => {
    if (!reservation) return

    const startDate = new Date(`${reservation.date}T${reservation.startTime}`)
    const endDate = new Date(`${reservation.date}T${reservation.endTime}`)
    
    const event = {
      title: `Field Reservation - ${reservation.field?.name}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      description: `Purpose: ${reservation.purpose}\nAttendees: ${reservation.attendees}${reservation.notes ? `\nNotes: ${reservation.notes}` : ''}`,
      location: reservation.field?.address || reservation.field?.name
    }

    // Google Calendar URL
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${endDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location || '')}`
    
    window.open(googleUrl, '_blank')
  }

  const handleShare = async () => {
    const shareData = {
      title: 'Field Reservation',
      text: `Reservation at ${reservation?.field?.name} on ${reservation ? format(new Date(reservation.date), 'MMMM d, yyyy') : ''}`,
      url: window.location.href
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(window.location.href)
        alert('Link copied to clipboard!')
      }
    } catch (error) {
      console.error('Error sharing:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: { variant: 'secondary', label: 'Pending' },
      confirmed: { variant: 'default', label: 'Confirmed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
      completed: { variant: 'outline', label: 'Completed' }
    }

    const { variant, label } = variants[status] || { variant: 'secondary', label: status }
    return <Badge variant={variant}>{label}</Badge>
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Skeleton className="h-12 w-64 mb-8" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-16" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Alert>
          <AlertDescription>
            This shared booking is no longer available.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Shared Field Reservation</h1>
        <p className="text-muted-foreground">
          View details for this shared booking
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{reservation.field?.name}</CardTitle>
            {getStatusBadge(reservation.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {format(new Date(reservation.date), 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {format(new Date(`2000-01-01T${reservation.startTime}`), 'h:mm a')} - 
                  {format(new Date(`2000-01-01T${reservation.endTime}`), 'h:mm a')}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{reservation.field?.address}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{reservation.attendees} attendees</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">Purpose</h4>
            <p className="text-muted-foreground">{reservation.purpose}</p>
          </div>

          {reservation.notes && (
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Additional Notes</h4>
              <p className="text-muted-foreground">{reservation.notes}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">Organizer</h4>
            <p className="text-muted-foreground">
              {reservation.user?.fullName || 'Anonymous'}
              {reservation.team && (
                <span> • Team: {reservation.team.name}</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4">
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
          onClick={handleShare}
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>Powered by Field Reservations</p>
      </div>
    </div>
  )
}