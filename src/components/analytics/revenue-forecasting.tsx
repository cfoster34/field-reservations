'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

interface RevenueForecastingProps {
  leagueId: string
  dateRange: {
    from: Date
    to: Date
  }
}

interface RevenueData {
  summary: {
    totalRevenue: number
    totalRefunded: number
    netRevenue: number
    fieldReservationRevenue: number
    subscriptionRevenue: number
    totalTransactions: number
    avgTransactionValue: number
  }
  byDate: Array<{
    date: string
    revenue: number
    transactions: number
  }>
  byField: Array<{
    fieldId: string
    fieldName: string
    fieldType: string
    revenue: number
    transactions: number
  }>
  byType: Array<{
    type: string
    revenue: number
    count: number
  }>
  monthlyGrowth: Array<{
    month: string
    revenue: number
    transactions: number
    growth: number
  }>
  topFields: Array<{
    fieldId: string
    fieldName: string
    revenue: number
  }>
}

interface ForecastData {
  forecast: {
    total: Array<{
      date: string
      value: number
      confidence: number
    }>
    field: Array<{
      date: string
      value: number
      confidence: number
    }>
    subscription: Array<{
      date: string
      value: number
      confidence: number
    }>
    projectedTotal: number
    confidence: number
  }
  trends: {
    recent: {
      direction: 'increasing' | 'decreasing' | 'stable'
      magnitude: number
    }
    longTerm: {
      direction: 'increasing' | 'decreasing' | 'stable'
      magnitude: number
    }
    momentum: 'consistent' | 'changing'
  }
  insights: Array<{
    type: 'positive' | 'warning' | 'opportunity'
    message: string
    recommendation: string
  }>
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1']

export function RevenueForecasting({ leagueId, dateRange }: RevenueForecastingProps) {
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null)
  const [forecastData, setForecastData] = useState<ForecastData | null>(null)
  const [forecastDays, setForecastDays] = useState(30)
  const [selectedMetric, setSelectedMetric] = useState<'total' | 'field' | 'subscription'>('total')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchRevenueData(),
      fetchForecastData()
    ])
  }, [leagueId, dateRange, forecastDays])

  const fetchRevenueData = async () => {
    try {
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd')
      })

      const response = await fetch(`/api/analytics/revenue?${params}`)
      if (!response.ok) throw new Error('Failed to fetch revenue data')
      
      const result = await response.json()
      setRevenueData(result.data)
    } catch (error) {
      console.error('Error fetching revenue data:', error)
    }
  }

  const fetchForecastData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        modelType: 'revenue_forecast',
        forecastDays: forecastDays.toString()
      })

      const response = await fetch(`/api/analytics/predictive?${params}`)
      if (!response.ok) throw new Error('Failed to fetch forecast data')
      
      const result = await response.json()
      setForecastData(result.data)
    } catch (error) {
      console.error('Error fetching forecast data:', error)
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

  if (!revenueData || !forecastData) return <div>Failed to load revenue data</div>

  // Combine historical and forecast data for visualization
  const combinedData = [
    ...revenueData.byDate.map(d => ({
      date: d.date,
      actual: d.revenue,
      type: 'historical'
    })),
    ...forecastData.forecast[selectedMetric].map(d => ({
      date: d.date,
      forecast: d.value,
      confidence: d.confidence,
      type: 'forecast' as const
    }))
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Revenue Analytics & Forecasting</h2>
          <p className="text-muted-foreground">
            Revenue insights and future projections based on historical patterns
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={forecastDays.toString()} onValueChange={(value) => setForecastDays(parseInt(value))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Total Revenue</SelectItem>
              <SelectItem value="field">Field Revenue</SelectItem>
              <SelectItem value="subscription">Subscriptions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">${revenueData.summary.totalRevenue.toLocaleString()}</p>
                <div className="flex items-center gap-1 text-xs">
                  {forecastData.trends.recent.direction === 'increasing' ? (
                    <>
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                      <span className="text-green-600">+{forecastData.trends.recent.magnitude.toFixed(1)}%</span>
                    </>
                  ) : forecastData.trends.recent.direction === 'decreasing' ? (
                    <>
                      <ArrowDownRight className="h-3 w-3 text-red-500" />
                      <span className="text-red-600">-{forecastData.trends.recent.magnitude.toFixed(1)}%</span>
                    </>
                  ) : (
                    <span className="text-gray-600">Stable</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Projected Revenue</p>
                <p className="text-2xl font-bold">${forecastData.forecast.projectedTotal.toLocaleString()}</p>
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <span>Next {forecastDays} days</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Transaction</p>
                <p className="text-2xl font-bold">${revenueData.summary.avgTransactionValue.toFixed(2)}</p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <span>{revenueData.summary.totalTransactions} transactions</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Forecast Confidence</p>
                <p className="text-2xl font-bold">{(forecastData.forecast.confidence * 100).toFixed(1)}%</p>
                <div className="flex items-center gap-1 text-xs">
                  <Badge variant={forecastData.forecast.confidence > 0.8 ? 'default' : 'secondary'}>
                    {forecastData.forecast.confidence > 0.8 ? 'High' : 'Medium'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="forecast" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Revenue Forecast
                <Badge variant="outline">{selectedMetric} revenue</Badge>
              </CardTitle>
              <CardDescription>
                Historical data and {forecastDays}-day forecast with confidence intervals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={combinedData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), 'MMM d')}
                      className="text-xs"
                    />
                    <YAxis tickFormatter={(value) => `$${value}`} className="text-xs" />
                    <Tooltip
                      labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                      formatter={(value: number, name: string) => [
                        `$${value?.toLocaleString() || 0}`,
                        name === 'actual' ? 'Actual Revenue' : 'Forecasted Revenue'
                      ]}
                    />
                    <Legend />
                    
                    {/* Historical data */}
                    <Area
                      type="monotone"
                      dataKey="actual"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      name="Historical"
                    />
                    
                    {/* Forecast data */}
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                      name="Forecast"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Forecast Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Short-term Outlook</CardTitle>
                <CardDescription>Next 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {forecastData.forecast[selectedMetric].slice(0, 7).map((day, index) => (
                    <div key={day.date} className="flex items-center justify-between">
                      <span className="text-sm">{format(new Date(day.date), 'EEE, MMM d')}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">${day.value.toFixed(0)}</span>
                        <Badge variant="outline" className="text-xs">
                          {(day.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Trend Analysis</CardTitle>
                <CardDescription>Pattern recognition</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Recent Trend</span>
                  <div className="flex items-center gap-1">
                    {forecastData.trends.recent.direction === 'increasing' ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : forecastData.trends.recent.direction === 'decreasing' ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : (
                      <BarChart3 className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="font-semibold capitalize">{forecastData.trends.recent.direction}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Long-term Trend</span>
                  <div className="flex items-center gap-1">
                    {forecastData.trends.longTerm.direction === 'increasing' ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : forecastData.trends.longTerm.direction === 'decreasing' ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : (
                      <BarChart3 className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="font-semibold capitalize">{forecastData.trends.longTerm.direction}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Momentum</span>
                  <Badge variant={forecastData.trends.momentum === 'consistent' ? 'default' : 'secondary'}>
                    {forecastData.trends.momentum}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Risk Assessment</CardTitle>
                <CardDescription>Forecast reliability</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Overall Confidence</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${forecastData.forecast.confidence * 100}%` }}
                      />
                    </div>
                    <span className="font-semibold text-sm">
                      {(forecastData.forecast.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Factors affecting accuracy:</div>
                  <ul className="text-xs space-y-1">
                    <li>• Historical data quality</li>
                    <li>• Seasonal variations</li>
                    <li>• Market conditions</li>
                    <li>• External factors</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue Trend</CardTitle>
                <CardDescription>Revenue performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData.byDate}>
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

            <Card>
              <CardHeader>
                <CardTitle>Monthly Growth</CardTitle>
                <CardDescription>Month-over-month growth rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={revenueData.monthlyGrowth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis yAxisId="left" tickFormatter={(value) => `$${value}`} className="text-xs" />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} className="text-xs" />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'revenue' ? `$${value.toLocaleString()}` : `${value.toFixed(1)}%`,
                          name === 'revenue' ? 'Revenue' : 'Growth Rate'
                        ]}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="growth" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Source</CardTitle>
                <CardDescription>Distribution of revenue streams</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueData.byType}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="revenue"
                      >
                        {revenueData.byType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Performing Fields</CardTitle>
                <CardDescription>Fields generating the most revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {revenueData.topFields.map((field, index) => (
                    <div key={field.fieldId} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <span className="font-medium">{field.fieldName}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">${field.revenue.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">
                          {((field.revenue / revenueData.summary.totalRevenue) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Field Revenue Comparison</CardTitle>
              <CardDescription>Revenue performance across all fields</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueData.byField}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="fieldName"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      className="text-xs"
                    />
                    <YAxis tickFormatter={(value) => `$${value}`} className="text-xs" />
                    <Tooltip
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {forecastData.insights.map((insight, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {insight.type === 'positive' && <TrendingUp className="h-5 w-5 text-green-500" />}
                    {insight.type === 'warning' && <TrendingDown className="h-5 w-5 text-yellow-500" />}
                    {insight.type === 'opportunity' && <Target className="h-5 w-5 text-blue-500" />}
                    <CardTitle className="text-lg capitalize">{insight.type}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{insight.message}</p>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Recommendation:</p>
                    <p className="text-sm text-muted-foreground">{insight.recommendation}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {forecastData.insights.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Revenue performance looks good!</h3>
                  <p className="text-muted-foreground">No significant insights or concerns identified.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="growth" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Growth Metrics</CardTitle>
              <CardDescription>Key growth indicators and projections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {forecastData.trends.recent.direction === 'increasing' ? '+' : ''}
                    {forecastData.trends.recent.magnitude.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Recent Growth Rate</p>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    ${(forecastData.forecast.projectedTotal / forecastDays).toFixed(0)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Daily Average (Projected)</p>
                  <p className="text-xs text-muted-foreground">Next {forecastDays} days</p>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {(forecastData.forecast.confidence * 100).toFixed(0)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Forecast Accuracy</p>
                  <p className="text-xs text-muted-foreground">Model confidence</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}