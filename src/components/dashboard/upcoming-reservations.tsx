'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, MapPin, MoreVertical } from 'lucide-react'
import { format } from 'date-fns'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Reservation {
  id: string
  field: string
  date: Date
  startTime: string
  endTime: string
  location: string
  status: 'confirmed' | 'pending' | 'cancelled'
  type: 'practice' | 'game' | 'tournament'
}

const mockReservations: Reservation[] = [
  {
    id: '1',
    field: 'Soccer Field A',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24),
    startTime: '10:00 AM',
    endTime: '12:00 PM',
    location: 'Central Park Complex',
    status: 'confirmed',
    type: 'practice',
  },
  {
    id: '2',
    field: 'Soccer Field B',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
    startTime: '2:00 PM',
    endTime: '4:00 PM',
    location: 'Riverside Sports Center',
    status: 'confirmed',
    type: 'game',
  },
  {
    id: '3',
    field: 'Baseball Diamond 1',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
    startTime: '6:00 PM',
    endTime: '8:00 PM',
    location: 'East Side Fields',
    status: 'pending',
    type: 'practice',
  },
]

interface UpcomingReservationsProps {
  userRole?: 'admin' | 'coach' | 'user'
}

export function UpcomingReservations({ userRole = 'user' }: UpcomingReservationsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Reservations</CardTitle>
        <CardDescription>
          Your scheduled field bookings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockReservations.map((reservation) => (
            <div
              key={reservation.id}
              className="flex flex-col space-y-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h4 className="font-semibold">{reservation.field}</h4>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(reservation.date, 'MMM d, yyyy')}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {reservation.startTime} - {reservation.endTime}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {reservation.location}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>Edit Reservation</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Cancel Reservation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    reservation.status === 'confirmed'
                      ? 'success'
                      : reservation.status === 'pending'
                      ? 'warning'
                      : 'destructive'
                  }
                >
                  {reservation.status}
                </Badge>
                <Badge variant="outline">
                  {reservation.type}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}