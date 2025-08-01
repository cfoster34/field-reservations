'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Calendar,
  Clock,
  Users,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react'
import { format, addDays, startOfWeek, endOfWeek, isSameDay } from 'date-fns'
import { Reservation, TimeSlot } from '@/types/reservation'
import { createClient } from '@/lib/supabase/client'
import { ConflictIndicator } from '@/components/booking/conflict-indicator'

interface DraggableReservationProps {
  reservation: Reservation
  onUpdate: (id: string, updates: Partial<Reservation>) => void
}

function DraggableReservation({ reservation, onUpdate }: DraggableReservationProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: reservation.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isDragging ? 'z-50' : ''}`}
    >
      <Card className="cursor-move hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div
              {...attributes}
              {...listeners}
              className="mt-1 cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium text-sm truncate">
                  {reservation.field?.name}
                </h4>
                <Badge 
                  variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {reservation.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>
                    {format(new Date(`2000-01-01T${reservation.startTime}`), 'h:mm a')} - 
                    {format(new Date(`2000-01-01T${reservation.endTime}`), 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{reservation.attendees}</span>
                </div>
              </div>
              <p className="text-xs mt-1 truncate">{reservation.purpose}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface CalendarDayProps {
  date: Date
  reservations: Reservation[]
  availableSlots: TimeSlot[]
  onDropReservation: (reservationId: string, date: Date) => void
  isDropTarget: boolean
}

function CalendarDay({ 
  date, 
  reservations, 
  availableSlots,
  onDropReservation,
  isDropTarget 
}: CalendarDayProps) {
  const {
    setNodeRef,
    isOver,
  } = useSortable({ 
    id: format(date, 'yyyy-MM-dd'),
    data: { type: 'day', date }
  })

  const isToday = isSameDay(date, new Date())
  const dayReservations = reservations.filter(r => 
    isSameDay(new Date(r.date), date)
  )

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[200px] border rounded-lg p-3 transition-colors
        ${isToday ? 'bg-primary/5 border-primary' : 'bg-background'}
        ${isOver && isDropTarget ? 'bg-primary/10 border-primary' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium">{format(date, 'd')}</p>
          <p className="text-xs text-muted-foreground">{format(date, 'EEE')}</p>
        </div>
        {availableSlots.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {availableSlots.length} slots
          </Badge>
        )}
      </div>
      
      <div className="space-y-2">
        <SortableContext
          items={dayReservations.map(r => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {dayReservations.map((reservation) => (
            <DraggableReservation
              key={reservation.id}
              reservation={reservation}
              onUpdate={() => {}}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

interface DraggableCalendarProps {
  fieldId?: string
  userId?: string
  onReservationUpdate?: (reservation: Reservation) => void
}

export function DraggableCalendar({ 
  fieldId, 
  userId,
  onReservationUpdate 
}: DraggableCalendarProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [availability, setAvailability] = useState<Record<string, TimeSlot[]>>({})
  const [loading, setLoading] = useState(true)
  const [draggedReservation, setDraggedReservation] = useState<Reservation | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const weekStart = startOfWeek(currentWeek)
  const weekEnd = endOfWeek(currentWeek)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    fetchData()
    
    // Set up real-time subscription
    const channel = supabase
      .channel('calendar_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: fieldId ? `field_id=eq.${fieldId}` : `user_id=eq.${userId}`
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentWeek, fieldId, userId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch reservations
      let query = supabase
        .from('reservations')
        .select(`
          *,
          field:fields(id, name, type),
          user:user_profiles(id, full_name),
          team:teams(id, name)
        `)
        .gte('date', format(weekStart, 'yyyy-MM-dd'))
        .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        .in('status', ['pending', 'confirmed'])
      
      if (fieldId) {
        query = query.eq('field_id', fieldId)
      } else if (userId) {
        query = query.eq('user_id', userId)
      }
      
      const { data: reservationData, error: resError } = await query
      
      if (resError) throw resError
      setReservations(reservationData || [])
      
      // Fetch availability for each day
      if (fieldId) {
        const availabilityPromises = weekDays.map(async (day) => {
          const response = await fetch(
            `/api/fields/${fieldId}/availability?date=${format(day, 'yyyy-MM-dd')}`
          )
          if (response.ok) {
            const data = await response.json()
            return { date: format(day, 'yyyy-MM-dd'), slots: data.slots }
          }
          return { date: format(day, 'yyyy-MM-dd'), slots: [] }
        })
        
        const availabilityData = await Promise.all(availabilityPromises)
        const availabilityMap = availabilityData.reduce((acc, { date, slots }) => {
          acc[date] = slots
          return acc
        }, {} as Record<string, TimeSlot[]>)
        
        setAvailability(availabilityMap)
      }
    } catch (err) {
      console.error('Error fetching calendar data:', err)
      setError('Failed to load calendar data')
    } finally {
      setLoading(false)
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const reservation = reservations.find(r => r.id === event.active.id)
    setDraggedReservation(reservation || null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setDraggedReservation(null)
    
    if (!over || !active.id) return
    
    const reservation = reservations.find(r => r.id === active.id)
    if (!reservation) return
    
    // Check if dropped on a day
    const overData = over.data.current
    if (overData?.type === 'day') {
      const newDate = overData.date
      const newDateStr = format(newDate, 'yyyy-MM-dd')
      
      // Check if the date actually changed
      if (reservation.date === newDateStr) return
      
      try {
        // Check availability for the new date
        const response = await fetch('/api/fields/' + reservation.fieldId + '/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fieldId: reservation.fieldId,
            date: newDateStr,
            startTime: reservation.startTime,
            endTime: reservation.endTime
          })
        })
        
        const availabilityResult = await response.json()
        
        if (!availabilityResult.available) {
          setError(availabilityResult.reason || 'Time slot not available')
          return
        }
        
        // Update the reservation
        const updateResponse = await fetch(`/api/reservations/${reservation.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: newDateStr,
            rescheduledFrom: reservation.id
          })
        })
        
        if (!updateResponse.ok) {
          throw new Error('Failed to reschedule reservation')
        }
        
        // Update local state optimistically
        setReservations(prev => 
          prev.map(r => 
            r.id === reservation.id 
              ? { ...r, date: newDateStr }
              : r
          )
        )
        
        if (onReservationUpdate) {
          onReservationUpdate({ ...reservation, date: newDateStr })
        }
      } catch (err) {
        console.error('Error rescheduling:', err)
        setError('Failed to reschedule reservation')
      }
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="font-medium">
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => setCurrentWeek(new Date())}
        >
          Today
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            return (
              <CalendarDay
                key={dateStr}
                date={day}
                reservations={reservations}
                availableSlots={availability[dateStr] || []}
                onDropReservation={() => {}}
                isDropTarget={!!draggedReservation}
              />
            )
          })}
        </div>
        
        <DragOverlay>
          {draggedReservation && (
            <Card className="cursor-move shadow-lg">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {draggedReservation.field?.name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(`2000-01-01T${draggedReservation.startTime}`), 'h:mm a')} - 
                  {format(new Date(`2000-01-01T${draggedReservation.endTime}`), 'h:mm a')}
                </p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}