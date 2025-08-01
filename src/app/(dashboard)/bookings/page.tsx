'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Reservation, ReservationStatus } from '@/types/reservation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users,
  Search,
  Filter,
  MoreVertical,
  Edit,
  X,
  Share2,
  Download,
  RefreshCw,
  Plus
} from 'lucide-react'
import { format, isBefore, isAfter, parseISO } from 'date-fns'
import { DraggableCalendar } from '@/components/calendar/draggable-calendar'

export default function BookingsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [fieldFilter, setFieldFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined
    to: Date | undefined
  }>({ from: undefined, to: undefined })

  useEffect(() => {
    fetchReservations()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [reservations, statusFilter, fieldFilter, searchQuery, dateRange])

  const fetchReservations = async () => {
    try {
      const response = await fetch('/api/reservations?limit=100')
      if (!response.ok) throw new Error('Failed to fetch reservations')
      const data = await response.json()
      setReservations(data.data || [])
    } catch (error) {
      console.error('Error fetching reservations:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...reservations]

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    // Field filter
    if (fieldFilter !== 'all') {
      filtered = filtered.filter(r => r.fieldId === fieldFilter)
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(r => 
        r.field?.name.toLowerCase().includes(query) ||
        r.purpose.toLowerCase().includes(query) ||
        r.notes?.toLowerCase().includes(query) ||
        r.id.toLowerCase().includes(query)
      )
    }

    // Date range filter
    if (dateRange.from) {
      filtered = filtered.filter(r => 
        isAfter(parseISO(r.date), dateRange.from!) || 
        format(parseISO(r.date), 'yyyy-MM-dd') === format(dateRange.from!, 'yyyy-MM-dd')
      )
    }
    if (dateRange.to) {
      filtered = filtered.filter(r => 
        isBefore(parseISO(r.date), dateRange.to!) || 
        format(parseISO(r.date), 'yyyy-MM-dd') === format(dateRange.to!, 'yyyy-MM-dd')
      )
    }

    // Sort by date
    filtered.sort((a, b) => {
      const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
      if (dateCompare !== 0) return dateCompare
      return b.startTime.localeCompare(a.startTime)
    })

    setFilteredReservations(filtered)
  }

  const handleCancelReservation = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) return

    try {
      const response = await fetch(`/api/reservations/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User requested cancellation' })
      })

      if (!response.ok) throw new Error('Failed to cancel reservation')
      
      // Update local state
      setReservations(prev => 
        prev.map(r => r.id === id ? { ...r, status: ReservationStatus.CANCELLED } : r)
      )
    } catch (error) {
      console.error('Error cancelling reservation:', error)
      alert('Failed to cancel reservation')
    }
  }

  const handleReschedule = (id: string) => {
    router.push(`/booking/reschedule/${id}`)
  }

  const handleShare = async (reservation: Reservation) => {
    if (!reservation.shareToken) return

    const shareUrl = `${window.location.origin}/booking/view/${reservation.shareToken}`
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Field Reservation',
          text: `Reservation at ${reservation.field?.name} on ${format(parseISO(reservation.date), 'MMMM d, yyyy')}`,
          url: shareUrl
        })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        alert('Share link copied to clipboard!')
      }
    } catch (error) {
      console.error('Error sharing:', error)
    }
  }

  const handleExportCalendar = () => {
    router.push('/settings/calendar-export')
  }

  const getStatusBadge = (status: ReservationStatus) => {
    const variants: Record<ReservationStatus, any> = {
      [ReservationStatus.PENDING]: { variant: 'secondary', label: 'Pending' },
      [ReservationStatus.CONFIRMED]: { variant: 'default', label: 'Confirmed' },
      [ReservationStatus.CANCELLED]: { variant: 'destructive', label: 'Cancelled' },
      [ReservationStatus.COMPLETED]: { variant: 'outline', label: 'Completed' },
      [ReservationStatus.NO_SHOW]: { variant: 'destructive', label: 'No Show' }
    }

    const { variant, label } = variants[status]
    return <Badge variant={variant}>{label}</Badge>
  }

  // Get unique fields for filter
  const uniqueFields = Array.from(
    new Map(reservations.map(r => [r.field?.id, r.field])).values()
  ).filter(Boolean)

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-12 w-48 mb-8" />
        <div className="grid gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Bookings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your field reservations
          </p>
        </div>
        <Button onClick={() => router.push('/booking')}>
          <Plus className="w-4 h-4 mr-2" />
          New Booking
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search bookings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value={ReservationStatus.PENDING}>Pending</SelectItem>
                <SelectItem value={ReservationStatus.CONFIRMED}>Confirmed</SelectItem>
                <SelectItem value={ReservationStatus.CANCELLED}>Cancelled</SelectItem>
                <SelectItem value={ReservationStatus.COMPLETED}>Completed</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={fieldFilter} onValueChange={setFieldFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Fields" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fields</SelectItem>
                {uniqueFields.map(field => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              variant="outline"
              onClick={handleExportCalendar}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* View Tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')}>
        <TabsList className="mb-4">
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {filteredReservations.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">No bookings found</p>
                <Button 
                  variant="link" 
                  onClick={() => router.push('/booking')}
                  className="mt-2"
                >
                  Make your first booking
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredReservations.map((reservation) => (
                <Card key={reservation.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">
                            {reservation.field?.name}
                          </h3>
                          {getStatusBadge(reservation.status)}
                          {reservation.recurringId && (
                            <Badge variant="outline">
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Recurring
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="w-4 h-4" />
                            {format(parseISO(reservation.date), 'EEEE, MMMM d, yyyy')}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {format(new Date(`2000-01-01T${reservation.startTime}`), 'h:mm a')} - 
                            {format(new Date(`2000-01-01T${reservation.endTime}`), 'h:mm a')}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {reservation.field?.address?.split(',')[0]}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {reservation.attendees} attendees
                          </div>
                        </div>
                        
                        <p className="text-sm">{reservation.purpose}</p>
                        
                        {reservation.notes && (
                          <p className="text-sm text-muted-foreground italic">
                            Note: {reservation.notes}
                          </p>
                        )}
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/bookings/${reservation.id}`)}>
                            View Details
                          </DropdownMenuItem>
                          {reservation.status === ReservationStatus.CONFIRMED && (
                            <>
                              <DropdownMenuItem onClick={() => handleReschedule(reservation.id)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Reschedule
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCancelReservation(reservation.id)}>
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleShare(reservation)}>
                            <Share2 className="w-4 h-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Drag & Drop to Reschedule</CardTitle>
            </CardHeader>
            <CardContent>
              <DraggableCalendar 
                userId={user?.id}
                onReservationUpdate={(reservation) => {
                  setReservations(prev => 
                    prev.map(r => r.id === reservation.id ? reservation : r)
                  )
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}