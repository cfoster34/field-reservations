'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Calendar,
  Clock,
  Users,
  TrendingUp,
  TrendingDown, 
  AlertTriangle,
  CheckCircle,
  Target,
  Activity,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react'
import { format } from 'date-fns'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts'

interface BookingPatternAnalysisProps {
  leagueId: string
  dateRange: {
    from: Date
    to: Date
  }
}

interface TemporalPattern {
  hourly: Array<{
    hour: number
    time: string
    bookings: number
    cancellationRate: number
    popularity: number
  }>
  daily: Array<{
    day: string
    bookings: number
    cancellationRate: number
    avgAttendees: number
  }>
  weekly: Array<{
    week: string
    bookings: number
    uniqueUsers: number
  }>
  peaks: {
    hour: { hour: number; time: string; bookings: number }
    day: { day: string; bookings: number }
  }
}

interface LeadTimePattern {
  distribution: Array<{
    label: string
    min: number
    max: number
    count: number
  }>
  averageLeadTime: number
  medianLeadTime: number
  patterns: {
    byFieldType: Array<{
      fieldType: string
      averageLeadTime: number
      count: number
    }>
    byDayOfWeek: Array<{
      day: string
      averageLeadTime: number
      count: number
    }>
  }
}

interface DurationPattern {
  distribution: Array<{
    duration: number
    count: number
    percentage: number
  }>
  averageDuration: number
  mostCommonDuration: number
  patterns: {
    byFieldType: Array<{
      fieldType: string
      averageDuration: number
      count: number
    }>
    byTeam: Array<{
      teamName: string
      averageDuration: number
      count: number
    }>
  }
}

interface FrequencyPattern {
  userFrequency: {
    distribution: Array<{
      label: string
      min: number
      max: number
      count: number
    }>
    topUsers: Array<{
      userId: string
      userName: string
      bookings: number
      cancellationRate: number
      avgHoursPerBooking: number
    }>
    totalUniqueUsers: number
  }
  teamFrequency: {
    topTeams: Array<{
      teamId: string
      teamName: string
      bookings: number
      uniqueUsers: number
      cancellationRate: number
      avgBookingsPerUser: number
    }>
    totalActiveTeams: number
  }
}

interface SeasonalPattern {
  monthly: Array<{
    month: string
    bookings: number
    revenue: number
  }>
  quarterly: Array<{
    quarter: string
    bookings: number
  }>
  trends: {
    peakMonth: { month: string; bookings: number }
    peakQuarter: { quarter: string; bookings: number }
    seasonality: string
  }
}

interface CancellationPattern {
  rate: number
  timing: Array<{
    label: string
    min: number
    max: number
    count: number
  }>
  patterns: {
    byFieldType: Array<{
      fieldType: string
      cancellations: number
    }>
    byDayOfWeek: Array<{
      day: string
      cancellations: number
    }>
  }
  averageTimingHours: {
    fromBooking: number
    beforeReservation: number
  }
}

interface OptimizationInsight {
  type: 'optimization' | 'opportunity' | 'action'
  category: string
  title: string
  description: string
  recommendation: string
  impact: 'high' | 'medium' | 'low'
}

interface BookingPatternData {
  temporal: TemporalPattern
  lead_time: LeadTimePattern
  duration: DurationPattern
  frequency: FrequencyPattern
  seasonal: SeasonalPattern
  cancellation: CancellationPattern
  optimization: OptimizationInsight[]
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0']

export function BookingPatternAnalysis({ leagueId, dateRange }: BookingPatternAnalysisProps) {
  const [patternData, setPatternData] = useState<BookingPatternData | null>(null)
  const [selectedField, setSelectedField] = useState<string>('all')
  const [selectedTeam, setSelectedTeam] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPatternData()
  }, [leagueId, dateRange, selectedField, selectedTeam])

  const fetchPatternData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        ...(selectedField !== 'all' && { fieldId: selectedField }),
        ...(selectedTeam !== 'all' && { teamId: selectedTeam })
      })

      const response = await fetch(`/api/analytics/booking-patterns?${params}`)
      if (!response.ok) throw new Error('Failed to fetch pattern data')
      
      const result = await response.json()
      setPatternData(result.data)
    } catch (error) {
      console.error('Error fetching pattern data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!patternData) return <div>Failed to load booking pattern data</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Booking Pattern Analysis</h2>
          <p className="text-muted-foreground">
            Deep insights into booking behavior, patterns, and optimization opportunities
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedField} onValueChange={setSelectedField}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Fields" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fields</SelectItem>
              {/* Field options would be populated from API */}
            </SelectContent>
          </Select>
          
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {/* Team options would be populated from API */}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Peak Hour</p>
                <p className="text-2xl font-bold">{patternData.temporal.peaks.hour.time}</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>{patternData.temporal.peaks.hour.bookings} bookings</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Peak Day</p>
                <p className="text-2xl font-bold">{patternData.temporal.peaks.day.day}</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>{patternData.temporal.peaks.day.bookings} bookings</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Lead Time</p>
                <p className="text-2xl font-bold">{patternData.lead_time.averageLeadTime.toFixed(1)}h</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>Median: {patternData.lead_time.medianLeadTime.toFixed(1)}h</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Cancellation Rate</p>
                <p className="text-2xl font-bold">{patternData.cancellation.rate.toFixed(1)}%</p>
                <div className="flex items-center gap-1 text-xs">
                  <Badge variant={patternData.cancellation.rate < 10 ? 'default' : 'destructive'}>
                    {patternData.cancellation.rate < 10 ? 'Good' : 'High'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="temporal" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="temporal">Temporal</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="frequency">Frequency</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
          <TabsTrigger value="cancellation">Cancellation</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="temporal" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Hourly Booking Patterns</CardTitle>
                <CardDescription>Booking volume throughout the day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={patternData.temporal.hourly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis yAxisId="left" className="text-xs" />
                      <YAxis yAxisId="right" orientation="right" className="text-xs" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="cancellationRate" 
                        stroke="hsl(var(--destructive))" 
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Booking Patterns</CardTitle>
                <CardDescription>Booking volume by day of week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.temporal.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="day" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Weekly Trends</CardTitle>
              <CardDescription>Booking trends over time with unique user count</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={patternData.temporal.weekly}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      tickFormatter={(value) => format(new Date(value), 'MMM d')}
                      className="text-xs" 
                    />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip 
                      labelFormatter={(value) => `Week of ${format(new Date(value), 'MMM d, yyyy')}`}
                    />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="bookings"
                      stackId="1"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="uniqueUsers"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timing" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Lead Time Distribution</CardTitle>
                <CardDescription>How far in advance users book</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.lead_time.distribution}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Duration Patterns</CardTitle>
                <CardDescription>Most common booking durations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={patternData.duration.distribution.slice(0, 6)}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ duration, percentage }) => `${duration}h (${percentage.toFixed(1)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {patternData.duration.distribution.slice(0, 6).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Lead Time by Field Type</CardTitle>
                <CardDescription>Planning behavior varies by activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patternData.lead_time.patterns.byFieldType.map((field) => (
                    <div key={field.fieldType} className="flex items-center justify-between">
                      <span className="font-medium capitalize">{field.fieldType}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${Math.min((field.averageLeadTime / 168) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold w-16 text-right">
                          {field.averageLeadTime.toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Duration by Field Type</CardTitle>
                <CardDescription>Average session length per activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patternData.duration.patterns.byFieldType.map((field) => (
                    <div key={field.fieldType} className="flex items-center justify-between">
                      <span className="font-medium capitalize">{field.fieldType}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${Math.min((field.averageDuration / 4) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold w-16 text-right">
                          {field.averageDuration.toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frequency" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Booking Frequency</CardTitle>
                <CardDescription>Distribution of how often users book</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.frequency.userFrequency.distribution}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Active Users</CardTitle>
                <CardDescription>Users with most bookings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patternData.frequency.userFrequency.topUsers.slice(0, 8).map((user, index) => (
                    <div key={user.userId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-semibold">{index + 1}</span>
                        </div>
                        <span className="font-medium">{user.userName}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-semibold">{user.bookings} bookings</span>
                        <span className="text-muted-foreground">
                          {user.cancellationRate.toFixed(1)}% cancel rate
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Team Activity Comparison</CardTitle>
              <CardDescription>Most active teams and their booking patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {patternData.frequency.teamFrequency.topTeams.slice(0, 6).map((team, index) => (
                  <div key={team.teamId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold">{index + 1}</span>
                      </div>
                      <div>
                        <div className="font-medium">{team.teamName}</div>
                        <div className="text-sm text-muted-foreground">
                          {team.uniqueUsers} members
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="font-semibold">{team.bookings}</div>
                        <div className="text-muted-foreground">bookings</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{team.avgBookingsPerUser.toFixed(1)}</div>
                        <div className="text-muted-foreground">avg/user</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold">{team.cancellationRate.toFixed(1)}%</div>
                        <div className="text-muted-foreground">cancel rate</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seasonal" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Booking Trends</CardTitle>
                <CardDescription>Seasonal patterns throughout the year</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={patternData.seasonal.monthly}>
                      <defs>
                        <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="bookings"
                        stroke="hsl(var(--primary))"
                        fillOpacity={1}
                        fill="url(#colorBookings)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quarterly Performance</CardTitle>
                <CardDescription>Booking volume by quarter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.seasonal.quarterly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="quarter" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Peak Season</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {patternData.seasonal.trends.peakMonth.month}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {patternData.seasonal.trends.peakMonth.bookings} bookings
                  </p>
                  <Badge variant="outline" className="mt-2">Peak Month</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Best Quarter</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {patternData.seasonal.trends.peakQuarter.quarter}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {patternData.seasonal.trends.peakQuarter.bookings} bookings
                  </p>
                  <Badge variant="outline" className="mt-2">Top Quarter</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Seasonality</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 capitalize">
                    {patternData.seasonal.trends.seasonality}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pattern type
                  </p>
                  <Badge variant="outline" className="mt-2">Trend Analysis</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cancellation" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Cancellation Timing</CardTitle>
                <CardDescription>When users typically cancel their bookings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.cancellation.timing}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" className="text-xs" angle={-45} textAnchor="end" height={80} />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cancellation by Field Type</CardTitle>
                <CardDescription>Which activities have higher cancellation rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patternData.cancellation.patterns.byFieldType.map((field) => (
                    <div key={field.fieldType} className="flex items-center justify-between">
                      <span className="font-medium capitalize">{field.fieldType}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full"
                            style={{ width: `${Math.min((field.cancellations / 50) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold w-16 text-right">
                          {field.cancellations}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Cancellation Insights</CardTitle>
                <CardDescription>Key metrics about cancellation behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Overall Cancellation Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{patternData.cancellation.rate.toFixed(1)}%</span>
                    <Badge variant={patternData.cancellation.rate < 10 ? 'default' : 'destructive'}>
                      {patternData.cancellation.rate < 10 ? 'Good' : 'High'}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">Avg Time from Booking</span>
                  <span className="font-semibold">
                    {patternData.cancellation.averageTimingHours.fromBooking.toFixed(1)} hours
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">Avg Time Before Event</span>
                  <span className="font-semibold">
                    {patternData.cancellation.averageTimingHours.beforeReservation.toFixed(1)} hours
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weekly Cancellation Pattern</CardTitle>
                <CardDescription>Cancellations by day of week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patternData.cancellation.patterns.byDayOfWeek}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="day" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="cancellations" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {patternData.optimization.map((insight, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {insight.type === 'optimization' && <Target className="h-5 w-5 text-blue-500" />}
                    {insight.type === 'opportunity' && <TrendingUp className="h-5 w-5 text-green-500" />}
                    {insight.type === 'action' && <AlertTriangle className="h-5 w-5 text-orange-500" />}
                    <CardTitle className="text-lg">{insight.title}</CardTitle>
                    <Badge variant={
                      insight.impact === 'high' ? 'destructive' : 
                      insight.impact === 'medium' ? 'default' : 'secondary'
                    }>
                      {insight.impact} impact
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Category: {insight.category}</p>
                  <p>{insight.description}</p>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Recommendation:</p>
                    <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {patternData.optimization.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All patterns look healthy!</h3>
                  <p className="text-muted-foreground">No significant optimization opportunities identified.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}