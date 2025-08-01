'use client'

import { StatsCard } from '@/components/dashboard/stats-card'
import { UpcomingReservations } from '@/components/dashboard/upcoming-reservations'
import { TeamRoster } from '@/components/dashboard/team-roster'
import { Calendar, Users, Clock, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function CoachDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coach Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your team and field reservations
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/booking">
            <Button>Book Field</Button>
          </Link>
          <Link href="/team">
            <Button variant="outline">Manage Team</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Upcoming Games"
          value="8"
          description="Next 30 days"
          icon={Calendar}
        />
        <StatsCard
          title="Team Members"
          value="24"
          description="Active players"
          icon={Users}
        />
        <StatsCard
          title="Practice Hours"
          value="36"
          description="This month"
          icon={Clock}
        />
        <StatsCard
          title="Win Rate"
          value="75%"
          description="This season"
          icon={TrendingUp}
          trend={{ value: 5.2, isPositive: true }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4">
          <UpcomingReservations userRole="coach" />
        </div>
        <div className="col-span-3">
          <TeamRoster />
        </div>
      </div>
    </div>
  )
}