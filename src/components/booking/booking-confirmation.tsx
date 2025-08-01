'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  DollarSign,
  Copy,
  Share2,
  Download,
  Mail
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface BookingDetails {
  id: string
  field: {
    id: string
    name: string
    address: string
    image: string
  }
  date: Date
  startTime: string
  endTime: string
  duration: number
  price: number
  deposit: number
  total: number
  purpose: string
  attendees: number
  status: 'confirmed' | 'pending'
}

interface BookingConfirmationProps {
  booking: BookingDetails
  onShare?: () => void
  onDownload?: () => void
}

export function BookingConfirmation({ booking, onShare, onDownload }: BookingConfirmationProps) {
  const copyBookingId = () => {
    navigator.clipboard.writeText(booking.id)
    toast.success('Booking ID copied to clipboard!')
  }

  const shareBooking = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Field Reservation Confirmation',
        text: `Booking confirmed for ${booking.field.name} on ${format(booking.date, 'MMM d, yyyy')}`,
        url: window.location.href,
      })
    } else {
      onShare?.()
    }
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="inline-flex"
        >
          <CheckCircle className="h-16 w-16 text-green-500" />
        </motion.div>
        <h1 className="mt-4 text-3xl font-bold">Booking Confirmed!</h1>
        <p className="mt-2 text-muted-foreground">
          Your field reservation has been successfully booked
        </p>
      </motion.div>

      {/* Booking Details Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Booking Details</CardTitle>
                <CardDescription>
                  Booking ID: {booking.id}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-4 w-4"
                    onClick={copyBookingId}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </CardDescription>
              </div>
              <Badge 
                variant={booking.status === 'confirmed' ? 'success' : 'warning'}
                className="text-sm"
              >
                {booking.status}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Field Info */}
            <div className="flex gap-4">
              <img
                src={booking.field.image}
                alt={booking.field.name}
                className="h-24 w-24 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{booking.field.name}</h3>
                <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {booking.field.address}
                </div>
              </div>
            </div>

            <Separator />

            {/* Booking Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{format(booking.date, 'EEEE, MMMM d, yyyy')}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium">
                    {booking.startTime} - {booking.endTime} ({booking.duration} hours)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Attendees</p>
                  <p className="font-medium">{booking.attendees} people</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="font-medium text-lg">${booking.total}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Payment Summary */}
            <div className="space-y-2">
              <h4 className="font-semibold">Payment Summary</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Field rental ({booking.duration} hours)</span>
                  <span>${booking.price}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Deposit</span>
                  <span>${booking.deposit}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>${booking.total}</span>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap gap-2">
            <Button onClick={shareBooking}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Email Confirmation
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      {/* Next Steps */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                1
              </div>
              <div>
                <p className="font-medium">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  We've sent a confirmation email with all the details
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                2
              </div>
              <div>
                <p className="font-medium">Add to calendar</p>
                <p className="text-sm text-muted-foreground">
                  Download the calendar invite to never miss your booking
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                3
              </div>
              <div>
                <p className="font-medium">Arrive on time</p>
                <p className="text-sm text-muted-foreground">
                  Please arrive 10 minutes early to set up
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Link href="/dashboard">
          <Button size="lg">Go to Dashboard</Button>
        </Link>
        <Link href="/fields">
          <Button size="lg" variant="outline">Book Another Field</Button>
        </Link>
      </div>
    </div>
  )
}