'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Bell,
  Check,
  Calendar,
  MapPin,
  Users,
  AlertCircle,
  X,
  CheckCheck,
  Archive,
  DollarSign,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/utils/cn'

interface Notification {
  id: string
  type: 'booking' | 'payment' | 'reminder' | 'team' | 'system'
  title: string
  message: string
  timestamp: Date
  read: boolean
  avatar?: string
  actionUrl?: string
  actionLabel?: string
}

// Mock notifications - replace with actual data
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'booking',
    title: 'Booking Confirmed',
    message: 'Your booking for Soccer Field A on March 15 at 2:00 PM has been confirmed.',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    read: false,
    actionUrl: '/bookings/1',
    actionLabel: 'View Booking',
  },
  {
    id: '2',
    type: 'reminder',
    title: 'Upcoming Reservation',
    message: 'Don't forget! You have a reservation tomorrow at 10:00 AM.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    read: false,
  },
  {
    id: '3',
    type: 'team',
    title: 'New Team Member',
    message: 'Sarah Chen has joined your team.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    read: true,
    avatar: '/api/placeholder/32/32',
  },
  {
    id: '4',
    type: 'payment',
    title: 'Payment Received',
    message: 'We've received your payment of $120 for your recent booking.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    read: true,
  },
]

export function NotificationCenter() {
  const [notifications, setNotifications] = useState(mockNotifications)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const unreadCount = notifications.filter((n) => !n.read).length
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter((n) => !n.read)
    : notifications

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'booking':
        return Calendar
      case 'payment':
        return DollarSign
      case 'reminder':
        return Bell
      case 'team':
        return Users
      case 'system':
        return AlertCircle
    }
  }

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'booking':
        return 'text-blue-600 bg-blue-100'
      case 'payment':
        return 'text-green-600 bg-green-100'
      case 'reminder':
        return 'text-orange-600 bg-orange-100'
      case 'team':
        return 'text-purple-600 bg-purple-100'
      case 'system':
        return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Notifications</CardTitle>
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount}</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all as read
              </Button>
            )}
            <Button variant="ghost" size="sm">
              <Archive className="h-4 w-4 mr-1" />
              Archive all
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full rounded-none border-b">
            <TabsTrigger value="all" className="flex-1" onClick={() => setFilter('all')}>
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="flex-1" onClick={() => setFilter('unread')}>
              Unread ({unreadCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-0">
            <ScrollArea className="h-[500px]">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      {filter === 'unread' 
                        ? 'No unread notifications' 
                        : 'No notifications yet'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredNotifications.map((notification, index) => {
                      const Icon = getNotificationIcon(notification.type)
                      const colorClass = getNotificationColor(notification.type)

                      return (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -100 }}
                          transition={{ delay: index * 0.05 }}
                          className={cn(
                            'p-4 hover:bg-muted/50 transition-colors',
                            !notification.read && 'bg-muted/20'
                          )}
                        >
                          <div className="flex gap-3">
                            {notification.avatar ? (
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={notification.avatar} />
                                <AvatarFallback>
                                  <Icon className="h-5 w-5" />
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className={cn(
                                'h-10 w-10 rounded-full flex items-center justify-center',
                                colorClass
                              )}>
                                <Icon className="h-5 w-5" />
                              </div>
                            )}

                            <div className="flex-1 space-y-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-sm">
                                    {notification.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {notification.message}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 -mt-1"
                                  onClick={() => deleteNotification(notification.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(notification.timestamp, {
                                    addSuffix: true,
                                  })}
                                </span>
                                <div className="flex items-center gap-2">
                                  {notification.actionUrl && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs"
                                    >
                                      {notification.actionLabel || 'View'}
                                    </Button>
                                  )}
                                  {!notification.read && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-auto p-1"
                                      onClick={() => markAsRead(notification.id)}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}