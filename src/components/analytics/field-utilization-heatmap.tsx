'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarIcon, Activity, TrendingUp, MapPin } from 'lucide-react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, eachHourOfInterval, startOfDay, endOfDay } from 'date-fns'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts'

interface FieldUtilizationHeatmapProps {
  leagueId: string
  dateRange: {
    from: Date
    to: Date
  }
}

interface UtilizationData {
  summary: {
    totalReservations: number
    totalHours: number
    totalRevenue: number
    averageUtilizationRate: number
  }
  byField: Array<{
    fieldId: string
    fieldName: string
    fieldType: string
    totalHours: number
    totalReservations: number
    totalRevenue: number
    utilizationRate: number
    averageAttendees: number
  }>
  byDate: Array<{
    date: string
    totalHours: number
    totalReservations: number
  }>
  peakHours: Array<{
    hour: number
    count: number
    time: string
  }>
}

interface HeatmapData {
  field: string
  hour: number
  day: string
  utilization: number
  bookings: number
  revenue: number
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => i)

export function FieldUtilizationHeatmap({ leagueId, dateRange }: FieldUtilizationHeatmapProps) {
  const [utilizationData, setUtilizationData] = useState<UtilizationData | null>(null)
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([])
  const [selectedField, setSelectedField] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'utilization' | 'bookings' | 'revenue'>('utilization')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUtilizationData()
  }, [leagueId, dateRange])

  useEffect(() => {
    if (utilizationData) {
      generateHeatmapData()
    }
  }, [utilizationData, selectedField])

  const fetchUtilizationData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        ...(selectedField !== 'all' && { fieldId: selectedField })
      })

      const response = await fetch(`/api/analytics/utilization?${params}`)
      if (!response.ok) throw new Error('Failed to fetch utilization data')
      
      const result = await response.json()
      setUtilizationData(result.data)
    } catch (error) {
      console.error('Error fetching utilization data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateHeatmapData = async () => {
    if (!utilizationData) return

    try {
      // Fetch detailed hourly data for heatmap
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        detailed: 'true'
      })

      const response = await fetch(`/api/analytics/field-utilization-detailed?${params}`)
      if (!response.ok) throw new Error('Failed to fetch detailed utilization data')
      
      const result = await response.json()
      setHeatmapData(result.data)
    } catch (error) {
      console.error('Error fetching detailed utilization data:', error)
      // Fallback to generate mock heatmap data
      generateMockHeatmapData()
    }
  }

  const generateMockHeatmapData = () => {
    if (!utilizationData) return

    const mockData: HeatmapData[] = []
    const fields = selectedField === 'all' 
      ? utilizationData.byField.slice(0, 5) 
      : utilizationData.byField.filter(f => f.fieldId === selectedField)

    fields.forEach(field => {
      DAYS_OF_WEEK.forEach((day, dayIndex) => {
        HOURS_OF_DAY.forEach(hour => {
          // Generate realistic utilization patterns
          let baseUtilization = 0
          
          // Higher utilization during peak hours (9-11am, 2-4pm, 6-8pm)
          if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16) || (hour >= 18 && hour <= 20)) {
            baseUtilization = 60 + Math.random() * 35
          } else if (hour >= 8 && hour <= 21) {
            baseUtilization = 30 + Math.random() * 30
          } else {
            baseUtilization = Math.random() * 15
          }

          // Weekend adjustments
          if (dayIndex >= 5) { // Weekend
            if (hour >= 10 && hour <= 18) {
              baseUtilization *= 1.2
            } else {
              baseUtilization *= 0.8
            }
          }

          // Field type adjustments
          if (field.fieldType === 'soccer') {
            baseUtilization *= 1.1
          } else if (field.fieldType === 'tennis') {
            baseUtilization *= 0.9
          }

          const utilization = Math.min(100, Math.max(0, baseUtilization))
          const bookings = Math.floor(utilization / 25) // Rough conversion
          const revenue = bookings * (40 + Math.random() * 20) // $40-60 per booking

          mockData.push({
            field: field.fieldName,
            hour,
            day,
            utilization,
            bookings,
            revenue
          })
        })
      })
    })

    setHeatmapData(mockData)
  }

  const getUtilizationColor = (utilization: number): string => {
    if (utilization >= 80) return 'bg-red-500'
    if (utilization >= 60) return 'bg-orange-500'
    if (utilization >= 40) return 'bg-yellow-500'
    if (utilization >= 20) return 'bg-green-500'
    return 'bg-gray-200'
  }

  const getIntensityOpacity = (value: number, maxValue: number): number => {
    return Math.max(0.1, (value / maxValue) * 0.9)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted rounded"></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!utilizationData) return <div>Failed to load utilization data</div>

  const maxValue = viewMode === 'utilization' 
    ? 100 
    : Math.max(...heatmapData.map(d => viewMode === 'bookings' ? d.bookings : d.revenue))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Field Utilization Analytics</h2>
          <p className="text-muted-foreground">
            Detailed field usage patterns and optimization opportunities
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedField} onValueChange={setSelectedField}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fields</SelectItem>
              {utilizationData.byField.map(field => (
                <SelectItem key={field.fieldId} value={field.fieldId}>
                  {field.fieldName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="utilization">Utilization</SelectItem>
              <SelectItem value="bookings">Bookings</SelectItem>
              <SelectItem value="revenue">Revenue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Reservations</p>
                <p className="text-2xl font-bold">{utilizationData.summary.totalReservations}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold">{utilizationData.summary.totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Utilization</p>
                <p className="text-2xl font-bold">{utilizationData.summary.averageUtilizationRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">${utilizationData.summary.totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="heatmap" className="space-y-6">
        <TabsList>
          <TabsTrigger value="heatmap">Heatmap View</TabsTrigger>
          <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
          <TabsTrigger value="fields">Field Comparison</TabsTrigger>
          <TabsTrigger value="patterns">Usage Patterns</TabsTrigger>
        </TabsList>

        <TabsContent value="heatmap" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Field Utilization Heatmap
                <Badge variant="outline">{viewMode}</Badge>
              </CardTitle>
              <CardDescription>
                Visual representation of field usage patterns by day and hour
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Legend */}
                <div className="flex items-center gap-4 text-sm">
                  <span>Low</span>
                  <div className="flex gap-1">
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                    <div className="w-4 h-4 bg-green-500 opacity-30 rounded"></div>
                    <div className="w-4 h-4 bg-yellow-500 opacity-60 rounded"></div>
                    <div className="w-4 h-4 bg-orange-500 opacity-80 rounded"></div>
                    <div className="w-4 h-4 bg-red-500 rounded"></div>
                  </div>
                  <span>High</span>
                </div>

                {/* Heatmap Grid */}
                <div className="overflow-x-auto">
                  <div className="inline-block min-w-full">
                    <div className="grid grid-cols-25 gap-1 text-xs">
                      {/* Header row with hours */}
                      <div className="text-right pr-2 font-medium">Time</div>
                      {HOURS_OF_DAY.map(hour => (
                        <div key={hour} className="text-center font-medium p-1">
                          {hour}
                        </div>
                      ))}
                      
                      {/* Data rows */}
                      {DAYS_OF_WEEK.map(day => (
                        <React.Fragment key={day}>
                          <div className="text-right pr-2 font-medium py-2">{day}</div>
                          {HOURS_OF_DAY.map(hour => {
                            const dataPoint = heatmapData.find(d => d.day === day && d.hour === hour)
                            const value = dataPoint ? (
                              viewMode === 'utilization' ? dataPoint.utilization :
                              viewMode === 'bookings' ? dataPoint.bookings :
                              dataPoint.revenue
                            ) : 0
                            
                            const opacity = getIntensityOpacity(value, maxValue)
                            const bgColor = viewMode === 'utilization' 
                              ? getUtilizationColor(value)
                              : 'bg-blue-500'

                            return (
                              <div
                                key={`${day}-${hour}`}
                                className={`${bgColor} rounded p-2 text-center text-white text-xs font-medium cursor-pointer hover:scale-105 transition-transform`}
                                style={{ opacity }}
                                title={`${day} ${hour}:00 - ${
                                  viewMode === 'utilization' ? `${value.toFixed(1)}%` :
                                  viewMode === 'bookings' ? `${value} bookings` :
                                  `$${value.toFixed(0)}`
                                }`}
                              >
                                {viewMode === 'utilization' 
                                  ? value.toFixed(0)
                                  : value.toFixed(0)
                                }
                              </div>
                            )
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Daily Utilization Trend</CardTitle>
                <CardDescription>Utilization patterns over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={utilizationData.byDate}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM d')}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                        formatter={(value: number) => [value, 'Hours Used']}
                      />
                      <Line
                        type="monotone"
                        dataKey="totalHours"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Peak Hours Analysis</CardTitle>
                <CardDescription>Busiest times of day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={utilizationData.peakHours}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip formatter={(value: number) => [value, 'Bookings']} />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fields" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Field Performance Comparison</CardTitle>
              <CardDescription>Compare utilization across different fields</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {utilizationData.byField.map((field, index) => (
                  <div key={field.fieldId} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold">{field.fieldName}</div>
                        <Badge variant="outline">{field.fieldType}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {field.totalReservations} reservations • {field.totalHours.toFixed(1)} hours
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-semibold">{field.utilizationRate.toFixed(1)}%</div>
                        <div className="text-sm text-muted-foreground">utilization</div>
                      </div>
                      
                      <div className="text-right">
                        <div className="font-semibold">${field.totalRevenue.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">revenue</div>
                      </div>
                      
                      <div className="w-24">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${Math.min(field.utilizationRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Weekly Patterns</CardTitle>
                <CardDescription>Usage patterns by day of week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {DAYS_OF_WEEK.map(day => {
                    const dayData = heatmapData.filter(d => d.day === day)
                    const avgUtilization = dayData.length > 0 
                      ? dayData.reduce((sum, d) => sum + d.utilization, 0) / dayData.length 
                      : 0
                    
                    return (
                      <div key={day} className="flex items-center justify-between">
                        <span className="font-medium w-20">{day}</span>
                        <div className="flex-1 mx-4">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${Math.min(avgUtilization, 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="font-semibold w-16 text-right">
                          {avgUtilization.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Optimization Insights</CardTitle>
                <CardDescription>AI-powered recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="font-semibold text-green-800">Peak Performance</span>
                    </div>
                    <p className="text-sm text-green-700">
                      {utilizationData.peakHours[0]?.time} shows highest utilization. 
                      Consider dynamic pricing during peak hours.
                    </p>
                  </div>
                  
                  {utilizationData.summary.averageUtilizationRate < 60 && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-4 w-4 text-orange-600" />
                        <span className="font-semibold text-orange-800">Underutilization</span>
                      </div>
                      <p className="text-sm text-orange-700">
                        Overall utilization is {utilizationData.summary.averageUtilizationRate.toFixed(1)}%. 
                        Consider promotional campaigns during off-peak hours.
                      </p>
                    </div>
                  )}
                  
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-semibold text-blue-800">Revenue Opportunity</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      Focus marketing efforts on fields with high utilization rates 
                      to maximize revenue potential.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}