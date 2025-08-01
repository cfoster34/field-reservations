'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, TrendingUp, TrendingDown, Users, DollarSign, Activity, Target, AlertTriangle, CheckCircle } from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

interface ExecutiveDashboardProps {
  leagueId: string
}

interface KPIData {
  totalUsers: number
  activeUsers: number
  totalReservations: number
  totalRevenue: number
  totalFields: number
  avgUtilization: number
  conversionRate: number
  avgRevenuePerUser: number
  cancellationRate: number
  customerSatisfaction: number
}

interface ChangeData {
  userGrowth: number
  activeUserGrowth: number
  reservationGrowth: number
  revenueGrowth: number
  utilizationGrowth: number
}

interface TrendData {
  daily: Array<{
    date: string
    revenue: number
    transactions: number
    avgTransactionValue: number
    utilization: number
    bookings: number
  }>
}

interface Insight {
  type: 'positive' | 'warning' | 'opportunity'
  category: string
  message: string
  impact: 'high' | 'medium' | 'low'
}

export function ExecutiveDashboard({ leagueId }: ExecutiveDashboardProps) {
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  })
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: KPIData
    changes: ChangeData
    trends: TrendData
    insights: Insight[]
  } | null>(null)

  useEffect(() => {
    fetchExecutiveData()
  }, [dateRange, period, leagueId])

  const fetchExecutiveData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        period
      })

      const response = await fetch(`/api/analytics/executive?${params}`)
      if (!response.ok) throw new Error('Failed to fetch executive data')
      
      const result = await response.json()
      setData(result.data)
    } catch (error) {
      console.error('Error fetching executive data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return <div>Failed to load dashboard data</div>

  return (
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Executive Dashboard</h1>
          <p className="text-muted-foreground">
            Key performance metrics and insights for {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="flex">
                <Calendar
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to })
                    }
                  }}
                  numberOfMonths={2}
                />
              </div>
            </PopoverContent>
          </Popover>
          
          <div className="flex gap-1">
            {['week', 'month', 'quarter'].map((p) => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPeriod(p)
                  const now = new Date()
                  if (p === 'week') {
                    setDateRange({ from: subDays(now, 7), to: now })
                  } else if (p === 'month') {
                    setDateRange({ from: startOfMonth(now), to: endOfMonth(now) })
                  } else {
                    setDateRange({ from: subDays(now, 90), to: now })
                  }
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Users"
          value={data.summary.totalUsers}
          change={data.changes.userGrowth}
          icon={Users}
          format="number"
        />
        <KPICard
          title="Active Users"
          value={data.summary.activeUsers}
          change={data.changes.activeUserGrowth}
          icon={Activity}
          format="number"
        />
        <KPICard
          title="Total Revenue"
          value={data.summary.totalRevenue}
          change={data.changes.revenueGrowth}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          title="Reservations"
          value={data.summary.totalReservations}
          change={data.changes.reservationGrowth}
          icon={Target}
          format="number"
        />
        <KPICard
          title="Avg Utilization"
          value={data.summary.avgUtilization}
          change={data.changes.utilizationGrowth}
          icon={TrendingUp}
          format="percentage"
        />
        <KPICard
          title="Conversion Rate"
          value={data.summary.conversionRate}
          change={0}
          icon={Target}
          format="percentage"
        />
        <KPICard
          title="Revenue per User"
          value={data.summary.avgRevenuePerUser}
          change={0}
          icon={DollarSign}
          format="currency"
        />
        <KPICard
          title="Customer Satisfaction"
          value={data.summary.customerSatisfaction}
          change={0}
          icon={CheckCircle}
          format="percentage"
        />
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Daily revenue performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trends.daily}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis tickFormatter={(value) => `$${value}`} className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Booking Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Booking Activity</CardTitle>
                <CardDescription>Daily booking volume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trends.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number) => [value, 'Bookings']}
                      />
                      <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Usage Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Fields</span>
                  <span className="font-semibold">{data.summary.totalFields}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Avg Utilization</span>
                  <span className="font-semibold">{data.summary.avgUtilization.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Cancellation Rate</span>
                  <span className="font-semibold">{data.summary.cancellationRate.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Revenue</span>
                  <span className="font-semibold">${data.summary.totalRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Revenue per User</span>
                  <span className="font-semibold">${data.summary.avgRevenuePerUser.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  <span className="font-semibold">{data.summary.conversionRate.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">User Engagement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Users</span>
                  <span className="font-semibold">{data.summary.activeUsers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Users</span>
                  <span className="font-semibold">{data.summary.totalUsers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Satisfaction</span>
                  <span className="font-semibold">{data.summary.customerSatisfaction}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Utilization Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Utilization Trend</CardTitle>
                <CardDescription>Field utilization over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trends.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis tickFormatter={(value) => `${value}%`} className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Utilization']}
                      />
                      <Line
                        type="monotone"
                        dataKey="utilization"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Transaction Value Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction Value</CardTitle>
                <CardDescription>Average transaction value over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trends.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis tickFormatter={(value) => `$${value}`} className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Avg Value']}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgTransactionValue"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.insights.map((insight, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {insight.type === 'positive' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {insight.type === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                    {insight.type === 'opportunity' && <TrendingUp className="h-5 w-5 text-blue-500" />}
                    <CardTitle className="text-lg capitalize">{insight.type}</CardTitle>
                    <Badge variant={insight.impact === 'high' ? 'destructive' : insight.impact === 'medium' ? 'default' : 'secondary'}>
                      {insight.impact} impact
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">Category: {insight.category}</p>
                  <p>{insight.message}</p>
                </CardContent>
              </Card>
            ))}
            
            {data.insights.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All metrics look good!</h3>
                  <p className="text-muted-foreground">No significant insights or issues to report for this period.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance overview will be implemented with additional metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>Detailed performance metrics and comparisons</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Performance Analytics</h3>
                <p className="text-muted-foreground">Advanced performance metrics coming soon...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface KPICardProps {
  title: string
  value: number
  change: number
  icon: React.ElementType
  format: 'number' | 'currency' | 'percentage'
}

function KPICard({ title, value, change, icon: Icon, format }: KPICardProps) {
  const formatValue = (val: number) => {
    switch (format) {
      case 'currency':
        return `$${val.toLocaleString()}`
      case 'percentage':
        return `${val.toFixed(1)}%`
      default:
        return val.toLocaleString()
    }
  }

  const isPositive = change > 0
  const isNegative = change < 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {change !== 0 && (
          <div className={`flex items-center text-xs ${
            isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'
          }`}>
            {isPositive ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : isNegative ? (
              <TrendingDown className="mr-1 h-3 w-3" />
            ) : null}
            {Math.abs(change).toFixed(1)}% from previous period
          </div>
        )}
      </CardContent>
    </Card>
  )
}