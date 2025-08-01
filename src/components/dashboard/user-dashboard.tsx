'use client'

import { StatsCard } from '@/components/dashboard/stats-card'
import { UpcomingReservations } from '@/components/dashboard/upcoming-reservations'
import { QuickBooking } from '@/components/dashboard/quick-booking'
import { RecentPayments } from '@/components/dashboard/recent-payments'
import { Calendar, CreditCard, Clock, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function UserDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome Back!</h1>
          <p className="text-muted-foreground">
            Manage your field reservations and activities
          </p>
        </div>
        <Link href="/booking">
          <Button>Book New Field</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Bookings"
          value="3"
          description="This month"
          icon={Calendar}
        />
        <StatsCard
          title="Total Spent"
          value="$245"
          description="Last 30 days"
          icon={CreditCard}
        />
        <StatsCard
          title="Hours Played"
          value="12"
          description="This month"
          icon={Clock}
        />
        <StatsCard
          title="Loyalty Points"
          value="450"
          description="Available"
          icon={Star}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4">
          <UpcomingReservations userRole="user" />
        </div>
        <div className="col-span-3 space-y-4">
          <QuickBooking />
          <RecentPayments />
        </div>
      </div>
    </div>
  )
}