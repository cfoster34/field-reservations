'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
} from 'date-fns'
import { cn } from '@/utils/cn'

interface Event {
  id: string
  title: string
  date: Date
  startTime: string
  endTime: string
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
    startTime: '10:00',
    endTime: '12:00',
    fieldId: '1',
    fieldName: 'Soccer Field A',
    status: 'confirmed',
  },
  // Add more events as needed
]

interface CalendarMonthViewProps {
  onDateSelect?: (date: Date) => void
  onEventClick?: (event: Event) => void
}

export function CalendarMonthView({ onDateSelect, onEventClick }: CalendarMonthViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const previousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))

  const getEventsForDay = (date: Date) => {
    return mockEvents.filter((event) => isSameDay(event.date, date))
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    onDateSelect?.(date)
  }

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={previousMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={nextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 gap-px mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-muted-foreground p-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
        {days.map((day, index) => {
          const events = getEventsForDay(day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const isCurrentDay = isToday(day)

          return (
            <motion.div
              key={day.toISOString()}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
              className={cn(
                'min-h-[100px] bg-background p-2 cursor-pointer transition-colors hover:bg-muted/50',
                !isCurrentMonth && 'text-muted-foreground bg-muted/20',
                isSelected && 'ring-2 ring-primary',
                isCurrentDay && 'bg-primary/5'
              )}
              onClick={() => handleDateClick(day)}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isCurrentDay &&
                      'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {events.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {events.length}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                {events.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick?.(event)
                    }}
                    className={cn(
                      'text-xs p-1 rounded truncate cursor-pointer transition-colors',
                      event.status === 'confirmed' &&
                        'bg-green-100 text-green-800 hover:bg-green-200',
                      event.status === 'pending' &&
                        'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
                      event.status === 'cancelled' &&
                        'bg-red-100 text-red-800 hover:bg-red-200'
                    )}
                  >
                    {event.startTime} - {event.title}
                  </div>
                ))}
                {events.length > 2 && (
                  <div className="text-xs text-muted-foreground pl-1">
                    +{events.length - 2} more
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}