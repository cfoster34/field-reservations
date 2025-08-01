'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Clock, Calendar as CalendarIcon, AlertCircle } from 'lucide-react'
import { format, addDays, setHours, setMinutes } from 'date-fns'
import { cn } from '@/utils/cn'

interface TimeSlot {
  id: string
  startTime: string
  endTime: string
  available: boolean
  price: number
}

interface TimeSlotPickerProps {
  fieldId: string
  onSelectTimeSlot: (date: Date, slot: TimeSlot) => void
  selectedDate?: Date
  selectedSlotId?: string
}

// Mock time slots - replace with actual API call
const generateTimeSlots = (date: Date): TimeSlot[] => {
  const slots: TimeSlot[] = []
  for (let hour = 6; hour < 22; hour++) {
    const available = Math.random() > 0.3 // 70% availability
    const isPeakHour = hour >= 18 && hour <= 21
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    
    let price = 120 // Base price
    if (isPeakHour) price *= 1.5
    if (isWeekend) price *= 1.25
    
    slots.push({
      id: `${hour}:00`,
      startTime: `${hour}:00`,
      endTime: `${hour + 1}:00`,
      available,
      price: Math.round(price),
    })
  }
  return slots
}

export function TimeSlotPicker({
  fieldId,
  onSelectTimeSlot,
  selectedDate: initialDate,
  selectedSlotId,
}: TimeSlotPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [duration, setDuration] = useState(1) // hours

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    if (date) {
      // Fetch time slots for selected date
      const slots = generateTimeSlots(date)
      setTimeSlots(slots)
    }
  }

  const handleSlotSelect = (slotId: string) => {
    const slot = timeSlots.find((s) => s.id === slotId)
    if (slot && selectedDate) {
      onSelectTimeSlot(selectedDate, slot)
    }
  }

  const getSlotsByPeriod = () => {
    const morning = timeSlots.filter((slot) => {
      const hour = parseInt(slot.startTime.split(':')[0])
      return hour >= 6 && hour < 12
    })
    
    const afternoon = timeSlots.filter((slot) => {
      const hour = parseInt(slot.startTime.split(':')[0])
      return hour >= 12 && hour < 18
    })
    
    const evening = timeSlots.filter((slot) => {
      const hour = parseInt(slot.startTime.split(':')[0])
      return hour >= 18 && hour < 22
    })
    
    return { morning, afternoon, evening }
  }

  const { morning, afternoon, evening } = getSlotsByPeriod()

  return (
    <div className="space-y-6">
      {/* Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Select Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            disabled={(date) => date < new Date() || date > addDays(new Date(), 30)}
            className="rounded-md"
          />
        </CardContent>
      </Card>

      {/* Duration Selection */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle>Booking Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((hours) => (
                <Button
                  key={hours}
                  variant={duration === hours ? 'default' : 'outline'}
                  onClick={() => setDuration(hours)}
                  className="flex-1"
                >
                  {hours} {hours === 1 ? 'hour' : 'hours'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Time Slots */}
      {selectedDate && timeSlots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Available Time Slots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={selectedSlotId} onValueChange={handleSlotSelect}>
              {/* Morning Slots */}
              {morning.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground">
                    Morning (6 AM - 12 PM)
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {morning.map((slot, index) => (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Label
                          htmlFor={slot.id}
                          className={cn(
                            'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-3 transition-all',
                            slot.available
                              ? selectedSlotId === slot.id
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                              : 'cursor-not-allowed border-muted bg-muted/50 opacity-60'
                          )}
                        >
                          <RadioGroupItem
                            value={slot.id}
                            id={slot.id}
                            disabled={!slot.available}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">
                            {slot.startTime}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ${slot.price}
                          </span>
                          {!slot.available && (
                            <Badge
                              variant="destructive"
                              className="absolute -top-1 -right-1 h-5 px-1 text-xs"
                            >
                              Booked
                            </Badge>
                          )}
                        </Label>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Afternoon Slots */}
              {afternoon.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-sm text-muted-foreground">
                    Afternoon (12 PM - 6 PM)
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {afternoon.map((slot, index) => (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Label
                          htmlFor={slot.id}
                          className={cn(
                            'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-3 transition-all',
                            slot.available
                              ? selectedSlotId === slot.id
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                              : 'cursor-not-allowed border-muted bg-muted/50 opacity-60'
                          )}
                        >
                          <RadioGroupItem
                            value={slot.id}
                            id={slot.id}
                            disabled={!slot.available}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">
                            {slot.startTime}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ${slot.price}
                          </span>
                          {!slot.available && (
                            <Badge
                              variant="destructive"
                              className="absolute -top-1 -right-1 h-5 px-1 text-xs"
                            >
                              Booked
                            </Badge>
                          )}
                        </Label>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evening Slots */}
              {evening.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm text-muted-foreground">
                      Evening (6 PM - 10 PM)
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      Peak Hours
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {evening.map((slot, index) => (
                      <motion.div
                        key={slot.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Label
                          htmlFor={slot.id}
                          className={cn(
                            'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-3 transition-all',
                            slot.available
                              ? selectedSlotId === slot.id
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                              : 'cursor-not-allowed border-muted bg-muted/50 opacity-60'
                          )}
                        >
                          <RadioGroupItem
                            value={slot.id}
                            id={slot.id}
                            disabled={!slot.available}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">
                            {slot.startTime}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ${slot.price}
                          </span>
                          {!slot.available && (
                            <Badge
                              variant="destructive"
                              className="absolute -top-1 -right-1 h-5 px-1 text-xs"
                            >
                              Booked
                            </Badge>
                          )}
                        </Label>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </RadioGroup>

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p>Peak hours (6 PM - 10 PM) have a 50% surcharge.</p>
                <p>Weekend bookings have an additional 25% surcharge.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}