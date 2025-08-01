'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  Activity, 
  Users, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  Eye,
  Clock,
  MapPin
} from 'lucide-react'
import { format } from 'date-fns'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'

interface RealTimeAnalyticsProps {
  leagueId: string
}

interface LiveMetric {
  key: string
  label: string
  value: number
  previousValue: number
  trend: 'up' | 'down' | 'stable'
  change: number
  changePercent: number
  icon: React.ElementType
  color: string
  format: 'number' | 'currency' | 'percentage'
}

interface LiveEvent {
  id: string
  type: 'booking_created' | 'booking_cancelled' | 'user_joined' | 'payment_completed' | 'field_updated'
  description: string
  timestamp: Date
  data: Record<string, any>
  severity: 'info' | 'warning' | 'success' | 'error'
}

interface RealtimeData {
  timestamp: Date
  activeUsers: number
  bookingsToday: number
  revenueToday: number
  utilizationRate: number
  conversionRate: number
}

export function RealTimeAnalytics({ leagueId }: RealTimeAnalyticsProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [liveMetrics, setLiveMetrics] = useState<LiveMetric[]>([])
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [timeSeriesData, setTimeSeriesData] = useState<RealtimeData[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isAutoRefresh) {
      connectWebSocket()
      startPolling()
    } else {
      disconnectWebSocket()
      stopPolling()
    }

    return () => {
      disconnectWebSocket()
      stopPolling()
    }
  }, [leagueId, isAutoRefresh])

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setConnectionStatus('connecting')
    
    try {
      // In a real implementation, this would connect to your WebSocket server
      // For now, we'll simulate the connection
      setTimeout(() => {
        setConnectionStatus('connected')
        setIsConnected(true)
        
        // Simulate receiving initial data
        initializeLiveData()
        
        // Simulate periodic updates
        const mockWsInterval = setInterval(() => {
          updateLiveData()
        }, 3000)

        // Store the interval reference for cleanup
        wsRef.current = { close: () => clearInterval(mockWsInterval) } as any
      }, 1000)
      
    } catch (error) {
      console.error('WebSocket connection failed:', error)
      setConnectionStatus('disconnected')
      setIsConnected(false)
    }
  }

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionStatus('disconnected')
    setIsConnected(false)
  }

  const startPolling = () => {
    if (intervalRef.current) return
    
    // Fallback polling every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchLiveData()
    }, 30000)
  }

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const initializeLiveData = () => {
    const initialMetrics: LiveMetric[] = [
      {
        key: 'active_users',
        label: 'Active Users',
        value: 24,
        previousValue: 18,
        trend: 'up',
        change: 6,
        changePercent: 33.3,
        icon: Users,
        color: 'text-blue-500',
        format: 'number'
      },
      {
        key: 'bookings_today',
        label: 'Bookings Today',
        value: 47,
        previousValue: 52,
        trend: 'down',
        change: -5,
        changePercent: -9.6,
        icon: Calendar,
        color: 'text-green-500',
        format: 'number'
      },
      {
        key: 'revenue_today',
        label: 'Revenue Today',
        value: 2340,
        previousValue: 2100,
        trend: 'up',
        change: 240,
        changePercent: 11.4,
        icon: DollarSign,
        color: 'text-emerald-500',
        format: 'currency'
      },
      {
        key: 'utilization_rate',
        label: 'Current Utilization',
        value: 68.5,
        previousValue: 72.3,
        trend: 'down',
        change: -3.8,
        changePercent: -5.3,
        icon: Activity,
        color: 'text-orange-500',
        format: 'percentage'
      }
    ]

    setLiveMetrics(initialMetrics)

    // Initialize time series data with last 20 data points
    const initialTimeSeriesData: RealtimeData[] = []
    const now = new Date()
    
    for (let i = 19; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60000) // Every minute
      initialTimeSeriesData.push({
        timestamp,
        activeUsers: 15 + Math.floor(Math.random() * 20),
        bookingsToday: Math.floor(Math.random() * 10),
        revenueToday: Math.floor(Math.random() * 500) + 100,
        utilizationRate: 50 + Math.random() * 30,
        conversionRate: 60 + Math.random() * 20
      })
    }
    
    setTimeSeriesData(initialTimeSeriesData)
    setLastUpdate(new Date())
  }

  const updateLiveData = () => {
    // Simulate metric updates
    setLiveMetrics(prev => prev.map(metric => {
      const change = (Math.random() - 0.5) * 10 // Random change between -5 and +5
      const newValue = Math.max(0, metric.value + change)
      const changePercent = metric.value > 0 ? (change / metric.value) * 100 : 0
      
      return {
        ...metric,
        previousValue: metric.value,
        value: newValue,
        change,
        changePercent,
        trend: change > 1 ? 'up' : change < -1 ? 'down' : 'stable'
      }
    }))

    // Add new time series data point
    setTimeSeriesData(prev => {
      const newDataPoint: RealtimeData = {
        timestamp: new Date(),
        activeUsers: 15 + Math.floor(Math.random() * 20),
        bookingsToday: Math.floor(Math.random() * 10),
        revenueToday: Math.floor(Math.random() * 500) + 100,
        utilizationRate: 50 + Math.random() * 30,
        conversionRate: 60 + Math.random() * 20
      }
      
      // Keep only last 20 data points
      const newData = [...prev.slice(-19), newDataPoint]
      return newData
    })

    // Simulate live events
    const eventTypes = ['booking_created', 'booking_cancelled', 'user_joined', 'payment_completed', 'field_updated'] as const
    const eventDescriptions = {
      booking_created: 'New booking created for Soccer Field A',
      booking_cancelled: 'Booking cancelled for Tennis Court 1',
      user_joined: 'New user registered: John Doe',
      payment_completed: 'Payment of $120 completed',
      field_updated: 'Field maintenance scheduled for Basketball Court'
    }

    if (Math.random() > 0.7) { // 30% chance of new event
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)]
      const newEvent: LiveEvent = {
        id: Date.now().toString(),
        type: eventType,
        description: eventDescriptions[eventType],
        timestamp: new Date(),
        data: {},
        severity: eventType === 'booking_cancelled' ? 'warning' : 
                 eventType === 'payment_completed' ? 'success' : 'info'
      }

      setLiveEvents(prev => [newEvent, ...prev.slice(0, 19)]) // Keep last 20 events
    }

    setLastUpdate(new Date())
  }

  const fetchLiveData = async () => {
    try {
      // In a real implementation, this would fetch from your API
      updateLiveData()
    } catch (error) {
      console.error('Error fetching live data:', error)
    }
  }

  const formatMetricValue = (value: number, format: string) => {
    switch (format) {
      case 'currency':
        return `$${value.toLocaleString()}`
      case 'percentage':
        return `${value.toFixed(1)}%`
      default:
        return value.toLocaleString()
    }
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            Real-Time Analytics
          </h2>
          <p className="text-muted-foreground">
            Live data updates and real-time insights
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : connectionStatus === 'connecting' ? (
              <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {connectionStatus}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={isAutoRefresh}
              onCheckedChange={setIsAutoRefresh}
            />
            <Label htmlFor="auto-refresh">Auto-refresh</Label>
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchLiveData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {lastUpdate && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Last updated: {format(lastUpdate, 'HH:mm:ss')}
        </div>
      )}

      {/* Live Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {liveMetrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.key} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${metric.color}`} />
                    <span className="text-sm font-medium">{metric.label}</span>
                  </div>
                  {getTrendIcon(metric.trend)}
                </div>
                
                <div className="mt-2">
                  <div className="text-2xl font-bold">
                    {formatMetricValue(metric.value, metric.format)}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${
                    metric.trend === 'up' ? 'text-green-600' : 
                    metric.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {metric.changePercent > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}% 
                    from previous
                  </div>
                </div>
                
                {/* Live indicator */}
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Charts */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Live Activity Stream
              </CardTitle>
              <CardDescription>Real-time user activity and engagement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="colorActiveUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => format(new Date(value), 'HH:mm')}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip
                      labelFormatter={(value) => format(new Date(value), 'HH:mm:ss')}
                      formatter={(value: number) => [value, 'Active Users']}
                    />
                    <Area
                      type="monotone"
                      dataKey="activeUsers"
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#colorActiveUsers)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>Key performance indicators over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => format(new Date(value), 'HH:mm')}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip
                      labelFormatter={(value) => format(new Date(value), 'HH:mm:ss')}
                    />
                    <Line
                      type="monotone"
                      dataKey="utilizationRate"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Utilization %"
                    />
                    <Line
                      type="monotone"
                      dataKey="conversionRate"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Conversion %"
                    />
                    {/* Reference lines for targets */}
                    <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="5 5" label="Target" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Events Feed */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Live Events
              </CardTitle>
              <CardDescription>Real-time system activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {liveEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      event.severity === 'success' ? 'border-l-green-500 bg-green-50' :
                      event.severity === 'warning' ? 'border-l-yellow-500 bg-yellow-50' :
                      event.severity === 'error' ? 'border-l-red-500 bg-red-50' :
                      'border-l-blue-500 bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {event.type.replace('_', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(event.timestamp, 'HH:mm:ss')}
                          </span>
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        event.severity === 'success' ? 'bg-green-500' :
                        event.severity === 'warning' ? 'bg-yellow-500' :
                        event.severity === 'error' ? 'bg-red-500' :
                        'bg-blue-500'
                      }`}></div>
                    </div>
                  </div>
                ))}
                
                {liveEvents.length === 0 && (
                  <div className="text-center py-8">
                    <Eye className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Waiting for live events...
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Current Activity Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Online Now</p>
                <p className="text-2xl font-bold">
                  {liveMetrics.find(m => m.key === 'active_users')?.value || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Fields in Use</p>
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Bookings/Hour</p>
                <p className="text-2xl font-bold">8</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Revenue/Hour</p>
                <p className="text-2xl font-bold">$180</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}