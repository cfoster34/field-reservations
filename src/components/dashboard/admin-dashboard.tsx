'use client'

import { StatsCard } from '@/components/dashboard/stats-card'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { FieldUtilizationChart } from '@/components/dashboard/field-utilization-chart'
import {
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  Activity,
  MapPin,
} from 'lucide-react'

export function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your field reservations and manage your facilities
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Revenue"
          value="$45,231"
          description="This month"
          icon={DollarSign}
          trend={{ value: 12.5, isPositive: true }}
        />
        <StatsCard
          title="Active Users"
          value="2,350"
          description="Total registered"
          icon={Users}
          trend={{ value: 8.2, isPositive: true }}
        />
        <StatsCard
          title="Total Bookings"
          value="1,234"
          description="This month"
          icon={Calendar}
          trend={{ value: 15.3, isPositive: true }}
        />
        <StatsCard
          title="Field Utilization"
          value="78%"
          description="Average this week"
          icon={Activity}
          trend={{ value: 5.1, isPositive: true }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <RevenueChart />
        <RecentActivity />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <FieldUtilizationChart />
        <div className="col-span-3">
          <StatsCard
            title="Most Popular Fields"
            value="12"
            description="Fields at capacity"
            icon={MapPin}
            className="h-full"
          />
        </div>
      </div>
    </div>
  )
}