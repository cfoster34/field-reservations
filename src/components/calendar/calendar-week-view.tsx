'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  isToday,
  isSameDay,
  addHours,
  startOfDay,
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
  },
  // Add more events as needed
]

interface CalendarWeekViewProps {
  onEventClick?: (event: Event) => void
  onTimeSlotClick?: (date: Date, hour: number) => void
}

export function CalendarWeekView({ onEventClick, onTimeSlotClick }: CalendarWeekViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  
  const weekStart = startOfWeek(currentDate)
  const weekEnd = endOfWeek(currentDate)
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
  
  const hours = Array.from({ length: 24 }, (_, i) => i)
  
  const previousWeek = () => setCurrentDate(subWeeks(currentDate, 1))
  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1))
  
  const getEventsForDayAndHour = (day: Date, hour: number) => {
    return mockEvents.filter((event) => {
      const eventHour = event.startTime.getHours()
      return isSameDay(event.date, day) && eventHour === hour
    })
  }
  
  const getEventHeight = (event: Event) => {
    const duration = (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60 * 60)
    return duration * 60 // 60px per hour
  }

  return (
    <Card className="p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={previousWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={nextWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="relative overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="grid grid-cols-8 gap-px mb-2">
            <div className="w-16" /> {/* Time column */}
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  'text-center p-2',
                  isToday(day) && 'bg-primary/10 rounded-lg'
                )}
              >
                <div className="text-sm font-medium">
                  {format(day, 'EEE')}
                </div>
                <div className={cn(
                  'text-lg font-semibold',
                  isToday(day) && 'text-primary'
                )}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots */}
          <div className="relative">
            <div className="grid grid-cols-8 gap-px bg-muted">
              {/* Time labels */}
              <div>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-[60px] px-2 py-1 text-xs text-muted-foreground bg-background"
                  >
                    {format(new Date().setHours(hour), 'ha')}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="relative">
                  {hours.map((hour) => {
                    const events = getEventsForDayAndHour(day, hour)
                    
                    return (
                      <div
                        key={hour}
                        className="h-[60px] bg-background border-b border-muted hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => onTimeSlotClick?.(day, hour)}
                      >
                        {events.map((event) => (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={cn(
                              'absolute left-0 right-0 mx-1 p-1 rounded text-xs cursor-pointer z-10',
                              event.status === 'confirmed' &&
                                'bg-green-500 text-white',
                              event.status === 'pending' &&
                                'bg-yellow-500 text-white',
                              event.status === 'cancelled' &&
                                'bg-red-500 text-white'
                            )}
                            style={{
                              height: `${getEventHeight(event)}px`,
                              top: 0,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              onEventClick?.(event)
                            }}
                          >
                            <div className="font-medium truncate">
                              {event.title}
                            </div>
                            <div className="truncate opacity-90">
                              {event.fieldName}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}