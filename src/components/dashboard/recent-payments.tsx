'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

const payments = [
  {
    id: '1',
    description: 'Soccer Field A - 2 hours',
    amount: 80,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    status: 'completed',
  },
  {
    id: '2',
    description: 'Tennis Court 3 - 1 hour',
    amount: 45,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    status: 'completed',
  },
  {
    id: '3',
    description: 'Basketball Court 1 - 3 hours',
    amount: 120,
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    status: 'completed',
  },
]

export function RecentPayments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Payments</CardTitle>
        <CardDescription>
          Your transaction history
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {payment.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(payment.date, 'MMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  ${payment.amount}
                </span>
                <Badge variant="success" className="text-xs">
                  {payment.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}