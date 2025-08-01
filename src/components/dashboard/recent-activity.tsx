'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

const activities = [
  {
    id: 1,
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      avatar: '/api/placeholder/32/32',
    },
    action: 'booked',
    field: 'Soccer Field A',
    date: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    status: 'confirmed',
  },
  {
    id: 2,
    user: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      avatar: '/api/placeholder/32/32',
    },
    action: 'cancelled',
    field: 'Baseball Diamond 1',
    date: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    status: 'cancelled',
  },
  {
    id: 3,
    user: {
      name: 'Mike Johnson',
      email: 'mike@example.com',
      avatar: '/api/placeholder/32/32',
    },
    action: 'booked',
    field: 'Tennis Court 3',
    date: new Date(Date.now() - 1000 * 60 * 120), // 2 hours ago
    status: 'confirmed',
  },
  {
    id: 4,
    user: {
      name: 'Sarah Wilson',
      email: 'sarah@example.com',
      avatar: '/api/placeholder/32/32',
    },
    action: 'modified',
    field: 'Basketball Court 2',
    date: new Date(Date.now() - 1000 * 60 * 180), // 3 hours ago
    status: 'confirmed',
  },
  {
    id: 5,
    user: {
      name: 'Tom Brown',
      email: 'tom@example.com',
      avatar: '/api/placeholder/32/32',
    },
    action: 'booked',
    field: 'Football Field 1',
    date: new Date(Date.now() - 1000 * 60 * 240), // 4 hours ago
    status: 'pending',
  },
]

export function RecentActivity() {
  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Latest bookings and updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center space-x-4">
              <Avatar>
                <AvatarImage src={activity.user.avatar} alt={activity.user.name} />
                <AvatarFallback>
                  {activity.user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">
                  {activity.user.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {activity.action} {activity.field}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant={
                    activity.status === 'confirmed'
                      ? 'success'
                      : activity.status === 'cancelled'
                      ? 'destructive'
                      : 'warning'
                  }
                >
                  {activity.status}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {format(activity.date, 'h:mm a')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}