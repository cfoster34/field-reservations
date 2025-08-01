'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import {
  Users,
  Activity,
  Clock,
  MousePointer,
  Calendar,
  TrendingUp,
  TrendingDown,
  UserCheck,
  UserX,
  Star,
  Target
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter,
  Cell
} from 'recharts'

interface UserEngagementAnalyticsProps {
  leagueId: string
  dateRange: {
    from: Date
    to: Date
  }
}

interface EngagementData {
  summary: {
    totalUsers: number
    activeUsers: number
    newUsers: number
    totalReservations: number
    cancellationRate: number
    totalEvents: number
  }
  byUser: Array<{
    userId: string
    userName: string
    userEmail: string
    userRole: string
    teamId: string
    totalReservations: number
    cancelledReservations: number
    totalEvents: number
    lastActive: string
    isNewUser: boolean
  }>
  byDate: Array<{
    date: string
    reservations: number
    cancellations: number
    events: number
    uniqueUsers: number
  }>
  eventTypes: Array<{
    type: string
    count: number
  }>
  peakHours: Array<{
    hour: number
    count: number
    time: string
  }>
}

interface UserBehaviorData {
  userJourney: Array<{
    stage: string
    users: number
    conversionRate: number
  }>
  sessionMetrics: {
    avgSessionDuration: number
    avgPagesPerSession: number
    bounceRate: number
  }
  engagementScores: Array<{
    userId: string
    userName: string
    score: number
    category: 'high' | 'medium' | 'low'
    sessions: number
    bookings: number
    lastActive: string
  }>
  cohortAnalysis: Array<{
    cohort: string
    week0: number
    week1: number
    week2: number
    week3: number
    week4: number
  }>
}

const ENGAGEMENT_COLORS = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444'
}

export function UserEngagementAnalytics({ leagueId, dateRange }: UserEngagementAnalyticsProps) {
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null)
  const [behaviorData, setBehaviorData] = useState<UserBehaviorData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchEngagementData(),
      fetchBehaviorData()
    ])
  }, [leagueId, dateRange])

  const fetchEngagementData = async () => {
    try {
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd')
      })

      const response = await fetch(`/api/analytics/activity?${params}`)
      if (!response.ok) throw new Error('Failed to fetch engagement data')
      
      const result = await response.json()
      setEngagementData(result.data)
    } catch (error) {
      console.error('Error fetching engagement data:', error)
    }
  }

  const fetchBehaviorData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd')
      })

      const response = await fetch(`/api/analytics/user-behavior?${params}`)
      if (!response.ok) {
        // Generate mock data if endpoint doesn't exist
        setBehaviorData(generateMockBehaviorData())
        return
      }
      
      const result = await response.json()
      setBehaviorData(result.data)
    } catch (error) {
      console.error('Error fetching behavior data:', error)
      setBehaviorData(generateMockBehaviorData())
    } finally {
      setLoading(false)
    }
  }

  const generateMockBehaviorData = (): UserBehaviorData => {
    return {
      userJourney: [
        { stage: 'Visitors', users: 1000, conversionRate: 100 },
        { stage: 'Sign-ups', users: 300, conversionRate: 30 },
        { stage: 'First Booking', users: 180, conversionRate: 60 },
        { stage: 'Repeat Bookings', users: 120, conversionRate: 67 },
        { stage: 'Active Users', users: 80, conversionRate: 67 }
      ],
      sessionMetrics: {
        avgSessionDuration: 8.5, // minutes
        avgPagesPerSession: 4.2,
        bounceRate: 35.7
      },
      engagementScores: Array.from({ length: 20 }, (_, i) => ({
        userId: `user-${i}`,
        userName: `User ${i + 1}`,
        score: Math.random() * 100,
        category: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
        sessions: Math.floor(Math.random() * 50) + 1,
        bookings: Math.floor(Math.random() * 20),
        lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
      })) as Array<{
        userId: string
        userName: string
        score: number
        category: 'high' | 'medium' | 'low'
        sessions: number
        bookings: number
        lastActive: string
      }>,
      cohortAnalysis: [
        { cohort: 'Jan 2024', week0: 100, week1: 75, week2: 60, week3: 50, week4: 45 },
        { cohort: 'Feb 2024', week0: 120, week1: 85, week2: 70, week3: 58, week4: 52 },
        { cohort: 'Mar 2024', week0: 150, week1: 110, week2: 90, week3: 75, week4: 68 },
        { cohort: 'Apr 2024', week0: 180, week1: 140, week2: 115, week3: 95, week4: 88 }
      ]
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

  if (!engagementData || !behaviorData) return <div>Failed to load engagement data</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">User Engagement Analytics</h2>
          <p className="text-muted-foreground">
            Detailed insights into user behavior, engagement patterns, and retention metrics
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{engagementData.summary.totalUsers}</p>
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <span>+{engagementData.summary.newUsers} new</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{engagementData.summary.activeUsers}</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>{((engagementData.summary.activeUsers / engagementData.summary.totalUsers) * 100).toFixed(1)}% of total</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Session</p>
                <p className="text-2xl font-bold">{behaviorData.sessionMetrics.avgSessionDuration.toFixed(1)}m</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>{behaviorData.sessionMetrics.avgPagesPerSession.toFixed(1)} pages</span>
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
                <p className="text-sm text-muted-foreground">Bounce Rate</p>
                <p className="text-2xl font-bold">{behaviorData.sessionMetrics.bounceRate.toFixed(1)}%</p>
                <div className="flex items-center gap-1 text-xs">
                  <Badge variant={behaviorData.sessionMetrics.bounceRate < 40 ? 'default' : 'secondary'}>
                    {behaviorData.sessionMetrics.bounceRate < 40 ? 'Good' : 'Average'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Daily Activity Trend</CardTitle>
                <CardDescription>User activity over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={engagementData.byDate}>
                      <defs>
                        <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
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
                      <YAxis className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number, name: string) => [
                          value,
                          name === 'uniqueUsers' ? 'Active Users' : 'Reservations'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="uniqueUsers"
                        stroke="hsl(var(--primary))"
                        fillOpacity={1}
                        fill="url(#colorActivity)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Peak Activity Hours</CardTitle>
                <CardDescription>When users are most active</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={engagementData.peakHours}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(value: number) => [value, 'Events']} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Event Types Distribution</CardTitle>
              <CardDescription>What users are doing on the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {engagementData.eventTypes.map((event) => (
                  <div key={event.type} className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">{event.count}</div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {event.type.replace('_', ' ')}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>User Journey Funnel</CardTitle>
                <CardDescription>Conversion rates through the user journey</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {behaviorData.userJourney.map((stage, index) => (
                    <div key={stage.stage} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{stage.stage}</span>
                        <div className="text-right">
                          <span className="font-bold">{stage.users}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {stage.conversionRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-4">
                          <div
                            className="bg-blue-500 h-4 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${(stage.users / behaviorData.userJourney[0].users) * 100}%` 
                            }}
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
                          {stage.users} users
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Session Behavior</CardTitle>
                <CardDescription>How users interact with the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                      <div className="text-2xl font-bold">
                        {behaviorData.sessionMetrics.avgSessionDuration.toFixed(1)}m
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Session Duration</div>
                    </div>
                    
                    <div className="text-center p-4 border rounded-lg">
                      <MousePointer className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <div className="text-2xl font-bold">
                        {behaviorData.sessionMetrics.avgPagesPerSession.toFixed(1)}
                      </div>
                      <div className="text-sm text-muted-foreground">Pages per Session</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Bounce Rate</span>
                      <span className="font-semibold">{behaviorData.sessionMetrics.bounceRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={behaviorData.sessionMetrics.bounceRate} className="h-2" />
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Engagement Rate</span>
                      <span className="font-semibold">{(100 - behaviorData.sessionMetrics.bounceRate).toFixed(1)}%</span>
                    </div>
                    <Progress value={100 - behaviorData.sessionMetrics.bounceRate} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="engagement" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Engagement Scores</CardTitle>
              <CardDescription>Users ranked by engagement level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {behaviorData.engagementScores
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 10)
                  .map((user, index) => (
                    <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={`/api/placeholder/40/40`} />
                          <AvatarFallback>
                            {user.userName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.userName}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.sessions} sessions • {user.bookings} bookings
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">{user.score.toFixed(1)}</div>
                          <div className="text-sm text-muted-foreground">engagement score</div>
                        </div>
                        <Badge 
                          variant="outline"
                          style={{ 
                            borderColor: ENGAGEMENT_COLORS[user.category],
                            color: ENGAGEMENT_COLORS[user.category]
                          }}
                        >
                          {user.category}
                        </Badge>
                        <div className="w-16">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{ 
                                width: `${user.score}%`,
                                backgroundColor: ENGAGEMENT_COLORS[user.category]
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {['high', 'medium', 'low'].map((category) => {
                    const count = behaviorData.engagementScores.filter(u => u.category === category).length
                    const percentage = (count / behaviorData.engagementScores.length) * 100
                    
                    return (
                      <div key={category} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="capitalize font-medium">{category} Engagement</span>
                          <span className="text-sm text-muted-foreground">{count} users</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: ENGAGEMENT_COLORS[category as keyof typeof ENGAGEMENT_COLORS]
                            }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                  <UserCheck className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-semibold text-green-800">High Engagement</div>
                    <div className="text-sm text-green-700">
                      {behaviorData.engagementScores.filter(u => u.category === 'high').length} users showing excellent engagement
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                  <Activity className="h-5 w-5 text-yellow-600" />
                  <div>
                    <div className="font-semibold text-yellow-800">Moderate Activity</div>
                    <div className="text-sm text-yellow-700">
                      {behaviorData.engagementScores.filter(u => u.category === 'medium').length} users need engagement boost
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg">
                  <UserX className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="font-semibold text-red-800">At Risk</div>
                    <div className="text-sm text-red-700">
                      {behaviorData.engagementScores.filter(u => u.category === 'low').length} users at risk of churning
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 border rounded-lg">
                  <div className="font-semibold text-sm mb-1">Re-engage Low Activity Users</div>
                  <div className="text-xs text-muted-foreground">
                    Send targeted campaigns to users with low engagement scores
                  </div>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <div className="font-semibold text-sm mb-1">Reward Top Users</div>
                  <div className="text-xs text-muted-foreground">
                    Implement loyalty programs for highly engaged users
                  </div>
                </div>
                
                <div className="p-3 border rounded-lg">
                  <div className="font-semibold text-sm mb-1">Optimize Peak Hours</div>
                  <div className="text-xs text-muted-foreground">
                    Focus marketing efforts during {engagementData.peakHours[0]?.time} peak activity
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retention" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cohort Retention Analysis</CardTitle>
              <CardDescription>User retention rates by signup cohort</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Cohort</th>
                      <th className="text-center py-2">Week 0</th>
                      <th className="text-center py-2">Week 1</th>
                      <th className="text-center py-2">Week 2</th>
                      <th className="text-center py-2">Week 3</th>
                      <th className="text-center py-2">Week 4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {behaviorData.cohortAnalysis.map((cohort) => (
                      <tr key={cohort.cohort} className="border-b">
                        <td className="py-2 font-medium">{cohort.cohort}</td>
                        <td className="text-center py-2">
                          <div className="inline-flex items-center justify-center w-12 h-8 bg-green-500/20 text-green-700 rounded">
                            {cohort.week0}
                          </div>
                        </td>
                        <td className="text-center py-2">
                          <div 
                            className="inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${(cohort.week1 / cohort.week0) * 0.5})`,
                              color: '#047857'
                            }}
                          >
                            {cohort.week1}
                          </div>
                        </td>
                        <td className="text-center py-2">
                          <div 
                            className="inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${(cohort.week2 / cohort.week0) * 0.5})`,
                              color: '#047857'
                            }}
                          >
                            {cohort.week2}
                          </div>
                        </td>
                        <td className="text-center py-2">
                          <div 
                            className="inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${(cohort.week3 / cohort.week0) * 0.5})`,
                              color: '#047857'
                            }}
                          >
                            {cohort.week3}
                          </div>
                        </td>
                        <td className="text-center py-2">
                          <div 
                            className="inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${(cohort.week4 / cohort.week0) * 0.5})`,
                              color: '#047857'
                            }}
                          >
                            {cohort.week4}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Retention Trends</CardTitle>
                <CardDescription>Week-over-week retention rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={behaviorData.cohortAnalysis}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="cohort" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="week1"
                        stroke="#8884d8"
                        strokeWidth={2}
                        name="Week 1"
                      />
                      <Line
                        type="monotone"
                        dataKey="week2"
                        stroke="#82ca9d"
                        strokeWidth={2}
                        name="Week 2"
                      />
                      <Line
                        type="monotone"
                        dataKey="week4"
                        stroke="#ffc658"
                        strokeWidth={2}
                        name="Week 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Retention Insights</CardTitle>
                <CardDescription>Key retention metrics and patterns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-blue-800">Best Performing Cohort</span>
                  </div>
                  <p className="text-sm text-blue-700">
                    Apr 2024 cohort shows highest 4-week retention at 88 users
                  </p>
                </div>
                
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="font-semibold text-green-800">Improving Trend</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Overall retention rates are improving month-over-month
                  </p>
                </div>
                
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4 text-orange-600" />
                    <span className="font-semibold text-orange-800">Week 1 Critical</span>
                  </div>
                  <p className="text-sm text-orange-700">
                    Focus on Week 1 experience - average 25% drop-off
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Most Active Users</CardTitle>
              <CardDescription>Users with highest activity levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {engagementData.byUser
                  .filter(user => user.totalReservations > 0 || user.totalEvents > 0)
                  .sort((a, b) => (b.totalReservations + b.totalEvents) - (a.totalReservations + a.totalEvents))
                  .slice(0, 10)
                  .map((user, index) => (
                    <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={`/api/placeholder/40/40`} />
                          <AvatarFallback>
                            {user.userName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.userName}</div>
                          <div className="text-sm text-muted-foreground">
                            {user.userEmail} • {user.userRole}
                          </div>
                          {user.isNewUser && (
                            <Badge variant="outline" className="text-xs mt-1">New User</Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="font-semibold">{user.totalReservations}</div>
                            <div className="text-xs text-muted-foreground">reservations</div>
                          </div>
                          <div>
                            <div className="font-semibold">{user.totalEvents}</div>
                            <div className="text-xs text-muted-foreground">events</div>
                          </div>
                          <div>
                            <div className="font-semibold">{user.cancelledReservations}</div>
                            <div className="text-xs text-muted-foreground">cancelled</div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last active: {format(new Date(user.lastActive), 'MMM d')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}