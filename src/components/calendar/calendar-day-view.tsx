'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  format,
  addDays,
  subDays,
  isToday,
  addHours,
  startOfDay,
  isSameDay,
} from 'date-fns'
import { cn } from '@/utils/cn'

interface Event {
  id: string
  title: string
  date: Date
  startTime: Date
  endTime: Date
  fieldId: string
  fieldName: string
  status: 'confirmed' | 'pending' | 'cancelled'
  color?: string
}

// Mock events - replace with actual data
const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Team Practice',
    date: new Date(),
    startTime: addHours(startOfDay(new Date()), 10),
    endTime: addHours(startOfDay(new Date()), 12),
    fieldId: '1',
    fieldName: 'Soccer Field A',
    status: 'confirmed',
    color: 'bg-green-500',
  },
  {
    id: '2',
    title: 'League Game',
    date: new Date(),
    startTime: addHours(startOfDay(new Date()), 14),
    endTime: addHours(startOfDay(new Date()), 16),
    fieldId: '2',
    fieldName: 'Soccer Field B',
    status: 'pending',
    color: 'bg-yellow-500',
  },
]

interface CalendarDayViewProps {
  date?: Date
  onEventClick?: (event: Event) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
  enableDragDrop?: boolean
}

export function CalendarDayView({
  date: initialDate,
  onEventClick,
  onTimeSlotClick,
  enableDragDrop = false,
}: CalendarDayViewProps) {
  const [currentDate, setCurrentDate] = useState(initialDate || new Date())
  const [draggedEvent, setDraggedEvent] = useState<Event | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const hours = Array.from({ length: 24 }, (_, i) => i)
  
  const previousDay = () => setCurrentDate(subDays(currentDate, 1))
  const nextDay = () => setCurrentDate(addDays(currentDate, 1))
  const goToToday = () => setCurrentDate(new Date())

  const getEventsForHour = (hour: number) => {
    return mockEvents.filter((event) => {
      const eventHour = event.startTime.getHours()
      return isSameDay(event.date, currentDate) && eventHour === hour
    })
  }

  const getEventPosition = (event: Event) => {
    const startMinutes = event.startTime.getMinutes()
    const duration = (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60)
    return {
      top: `${startMinutes}px`,
      height: `${duration}px`,
    }
  }

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current && isToday(currentDate)) {
      const currentHour = new Date().getHours()
      const scrollPosition = currentHour * 60 - 200 // 60px per hour, offset by 200px
      scrollContainerRef.current.scrollTop = Math.max(0, scrollPosition)
    }
  }, [currentDate])

  const handleDragStart = (event: Event) => {
    if (enableDragDrop) {
      setDraggedEvent(event)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, hour: number) => {
    e.preventDefault()
    if (draggedEvent && enableDragDrop) {
      // Handle event drop logic here
      console.log(`Dropped ${draggedEvent.title} at ${hour}:00`)
      setDraggedEvent(null)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-semibold">
              {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </h2>
            {isToday(currentDate) && (
              <Badge variant="secondary">Today</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={previousDay}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={nextDay}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Time grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="relative">
          {/* Current time indicator */}
          {isToday(currentDate) && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{
                top: `${new Date().getHours() * 60 + new Date().getMinutes()}px`,
              }}
            >
              <div className="flex items-center">
                <div className="w-16 pr-2 text-right">
                  <span className="text-xs font-medium text-primary">
                    {format(new Date(), 'h:mm a')}
                  </span>
                </div>
                <div className="flex-1 h-0.5 bg-primary" />
              </div>
            </div>
          )}

          {/* Hours */}
          {hours.map((hour) => {
            const events = getEventsForHour(hour)

            return (
              <div
                key={hour}
                className="relative flex"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, hour)}
              >
                {/* Time label */}
                <div className="w-16 pr-2 py-2 text-right flex-shrink-0">
                  <span className="text-sm text-muted-foreground">
                    {format(new Date().setHours(hour), 'ha')}
                  </span>
                </div>

                {/* Hour slot */}
                <div
                  className="flex-1 relative h-[60px] border-t border-muted hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => onTimeSlotClick?.(currentDate, hour)}
                >
                  {/* Events */}
                  {events.map((event, index) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={cn(
                        'absolute left-0 right-4 mx-1 p-2 rounded-md cursor-pointer shadow-sm',
                        event.color || 'bg-primary',
                        'text-white hover:shadow-md transition-shadow'
                      )}
                      style={getEventPosition(event)}
                      draggable={enableDragDrop}
                      onDragStart={() => handleDragStart(event)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick?.(event)
                      }}
                    >
                      <div className="text-sm font-medium truncate">
                        {event.title}
                      </div>
                      <div className="text-xs opacity-90 truncate">
                        {format(event.startTime, 'h:mm a')} - {format(event.endTime, 'h:mm a')}
                      </div>
                      <div className="text-xs opacity-80 truncate">
                        {event.fieldName}
                      </div>
                    </motion.div>
                  ))}

                  {/* Add event button */}
                  {events.length === 0 && (
                    <button
                      className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTimeSlotClick?.(currentDate, hour)
                      }}
                    >
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}