'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BarChart3, 
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Target,
  Award,
  AlertTriangle,
  Users,
  DollarSign,
  Activity,
  Clock
} from 'lucide-react'
import { format, subDays, subMonths, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
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
  ReferenceLine
} from 'recharts'

interface ComparativeAnalyticsProps {
  leagueId: string
}

interface ComparisonPeriod {
  label: string
  current: {
    start: Date
    end: Date
    label: string
  }
  previous: {
    start: Date
    end: Date
    label: string
  }
}

interface ComparisonMetric {
  key: string
  label: string
  currentValue: number
  previousValue: number
  change: number
  changePercent: number
  trend: 'up' | 'down' | 'stable'
  benchmark?: number
  format: 'number' | 'currency' | 'percentage'
  icon: React.ElementType
  category: 'revenue' | 'usage' | 'users' | 'performance'
}

interface BenchmarkData {
  metric: string
  yourValue: number
  industryAverage: number
  topPerformer: number
  performance: 'above' | 'below' | 'average'
}

interface TrendData {
  period: string
  current: number
  previous: number
  growth: number
}

export function ComparativeAnalytics({ leagueId }: ComparativeAnalyticsProps) {
  const [comparisonType, setComparisonType] = useState<'mom' | 'yoy' | 'custom'>('mom')
  const [selectedMetric, setSelectedMetric] = useState<string>('all')
  const [comparisonMetrics, setComparisonMetrics] = useState<ComparisonMetric[]>([])
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [loading, setLoading] = useState(true)

  const comparisonPeriods: Record<string, ComparisonPeriod> = {
    mom: {
      label: 'Month over Month',
      current: {
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date()),
        label: format(new Date(), 'MMMM yyyy')
      },
      previous: {
        start: startOfMonth(subMonths(new Date(), 1)),
        end: endOfMonth(subMonths(new Date(), 1)),
        label: format(subMonths(new Date(), 1), 'MMMM yyyy')
      }
    },
    yoy: {
      label: 'Year over Year',
      current: {
        start: startOfYear(new Date()),
        end: endOfYear(new Date()),
        label: format(new Date(), 'yyyy')
      },
      previous: {
        start: startOfYear(subYears(new Date(), 1)),
        end: endOfYear(subYears(new Date(), 1)),
        label: format(subYears(new Date(), 1), 'yyyy')
      }
    },
    custom: {
      label: 'Custom Period',
      current: {
        start: subDays(new Date(), 30),
        end: new Date(),
        label: 'Last 30 days'
      },
      previous: {
        start: subDays(new Date(), 60),
        end: subDays(new Date(), 30),
        label: 'Previous 30 days'
      }
    }
  }

  useEffect(() => {
    fetchComparisonData()
  }, [leagueId, comparisonType])

  const fetchComparisonData = async () => {
    try {
      setLoading(true)
      
      // In a real implementation, this would make API calls
      // For now, we'll generate realistic mock data
      const mockMetrics = generateMockComparisonData()
      const mockBenchmarks = generateMockBenchmarkData()
      const mockTrends = generateMockTrendData()
      
      setComparisonMetrics(mockMetrics)
      setBenchmarkData(mockBenchmarks)
      setTrendData(mockTrends)
    } catch (error) {
      console.error('Error fetching comparison data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateMockComparisonData = (): ComparisonMetric[] => {
    const baseMetrics = [
      {
        key: 'total_revenue',
        label: 'Total Revenue',
        icon: DollarSign,
        category: 'revenue' as const,
        format: 'currency' as const
      },
      {
        key: 'total_bookings',
        label: 'Total Bookings',
        icon: Calendar,
        category: 'usage' as const,
        format: 'number' as const
      },
      {
        key: 'active_users',
        label: 'Active Users',
        icon: Users,
        category: 'users' as const,
        format: 'number' as const
      },
      {
        key: 'avg_utilization',
        label: 'Average Utilization',
        icon: Activity,
        category: 'performance' as const,
        format: 'percentage' as const,
        benchmark: 75
      },
      {
        key: 'conversion_rate',
        label: 'Conversion Rate',
        icon: Target,
        category: 'performance' as const,
        format: 'percentage' as const,
        benchmark: 65
      },
      {
        key: 'avg_session_duration',
        label: 'Avg Session Duration',
        icon: Clock,
        category: 'users' as const,
        format: 'number' as const
      }
    ]

    return baseMetrics.map(metric => {
      const currentValue = Math.random() * 1000 + 500
      const changePercent = (Math.random() - 0.5) * 40 // -20% to +20%
      const previousValue = currentValue / (1 + changePercent / 100)
      const change = currentValue - previousValue

      return {
        ...metric,
        currentValue: metric.format === 'percentage' ? Math.min(100, currentValue / 10) : currentValue,
        previousValue: metric.format === 'percentage' ? Math.min(100, previousValue / 10) : previousValue,
        change: metric.format === 'percentage' ? change / 10 : change,
        changePercent,
        trend: changePercent > 2 ? 'up' : changePercent < -2 ? 'down' : 'stable'
      }
    })
  }

  const generateMockBenchmarkData = (): BenchmarkData[] => {
    return [
      {
        metric: 'Field Utilization Rate',
        yourValue: 72.5,
        industryAverage: 65.0,
        topPerformer: 85.0,
        performance: 'above'
      },
      {
        metric: 'Customer Retention Rate',
        yourValue: 78.3,
        industryAverage: 75.0,
        topPerformer: 90.0,
        performance: 'above'
      },
      {
        metric: 'Average Revenue per User',
        yourValue: 45.20,
        industryAverage: 52.50,
        topPerformer: 78.90,
        performance: 'below'
      },
      {
        metric: 'Booking Conversion Rate',
        yourValue: 68.7,
        industryAverage: 70.0,
        topPerformer: 85.0,
        performance: 'average'
      },
      {
        metric: 'Cancellation Rate',
        yourValue: 8.2,
        industryAverage: 12.0,
        topPerformer: 5.0,
        performance: 'above'
      }
    ]
  }

  const generateMockTrendData = (): TrendData[] => {
    const periods = comparisonType === 'yoy' ? 
      ['2020', '2021', '2022', '2023', '2024'] :
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return periods.map((period, index) => {
      const current = 100 + Math.random() * 200 + index * 10
      const previous = current * (0.8 + Math.random() * 0.4)
      const growth = ((current - previous) / previous) * 100

      return {
        period,
        current,
        previous,
        growth
      }
    })
  }

  const formatValue = (value: number, format: string) => {
    switch (format) {
      case 'currency':
        return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      case 'percentage':
        return `${value.toFixed(1)}%`
      default:
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    }
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'stable', changePercent: number) => {
    if (trend === 'up') {
      return <ArrowUpRight className="h-4 w-4 text-green-500" />
    } else if (trend === 'down') {
      return <ArrowDownRight className="h-4 w-4 text-red-500" />
    }
    return <Minus className="h-4 w-4 text-gray-500" />
  }

  const getPerformanceBadge = (performance: string) => {
    switch (performance) {
      case 'above':
        return <Badge variant="default" className="bg-green-500">Above Average</Badge>
      case 'below':
        return <Badge variant="destructive">Below Average</Badge>
      default:
        return <Badge variant="secondary">Average</Badge>
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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

  const currentPeriod = comparisonPeriods[comparisonType]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Comparative Analytics</h2>
          <p className="text-muted-foreground">
            Compare performance across different time periods and benchmarks
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={comparisonType} onValueChange={(value: any) => setComparisonType(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mom">Month over Month</SelectItem>
              <SelectItem value="yoy">Year over Year</SelectItem>
              <SelectItem value="custom">Custom Period</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Period Comparison Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Current Period</div>
              <div className="font-semibold">{currentPeriod.current.label}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">vs</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Previous Period</div>
              <div className="font-semibold">{currentPeriod.previous.label}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="comparison" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="comparison">Period Comparison</TabsTrigger>
          <TabsTrigger value="trends">Trend Analysis</TabsTrigger>
          <TabsTrigger value="benchmarks">Industry Benchmarks</TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="space-y-6">
          {/* Key Metrics Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comparisonMetrics.map((metric) => {
              const Icon = metric.icon
              return (
                <Card key={metric.key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm font-medium">{metric.label}</span>
                      </div>
                      {getTrendIcon(metric.trend, metric.changePercent)}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold">
                          {formatValue(metric.currentValue, metric.format)}
                        </span>
                        <div className={`text-sm flex items-center gap-1 ${
                          metric.trend === 'up' ? 'text-green-600' : 
                          metric.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {metric.changePercent > 0 ? '+' : ''}{metric.changePercent.toFixed(1)}%
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        Previous: {formatValue(metric.previousValue, metric.format)}
                      </div>
                      
                      {metric.benchmark && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>vs Target ({formatValue(metric.benchmark, metric.format)})</span>
                            <span className={
                              metric.currentValue >= metric.benchmark ? 'text-green-600' : 'text-red-600'
                            }>
                              {metric.currentValue >= metric.benchmark ? 'On target' : 'Below target'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                metric.currentValue >= metric.benchmark ? 'bg-green-500' : 'bg-red-500'
                              }`}
                              style={{ 
                                width: `${Math.min((metric.currentValue / metric.benchmark) * 100, 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Comparative Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Comparison</CardTitle>
              <CardDescription>
                Current vs previous period across key metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="label" 
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        formatValue(value, comparisonMetrics.find(m => m.label === name)?.format || 'number'),
                        name
                      ]}
                    />
                    <Legend />
                    <Bar 
                      dataKey="currentValue" 
                      fill="#3b82f6" 
                      name="Current Period"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      dataKey="previousValue" 
                      fill="#94a3b8" 
                      name="Previous Period"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Growth Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold text-green-600">
                  {comparisonMetrics.filter(m => m.trend === 'up').length}
                </div>
                <div className="text-sm text-muted-foreground">Metrics Improved</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingDown className="h-8 w-8 mx-auto mb-2 text-red-500" />
                <div className="text-2xl font-bold text-red-600">
                  {comparisonMetrics.filter(m => m.trend === 'down').length}
                </div>
                <div className="text-sm text-muted-foreground">Metrics Declined</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <Minus className="h-8 w-8 mx-auto mb-2 text-gray-500" />
                <div className="text-2xl font-bold text-gray-600">
                  {comparisonMetrics.filter(m => m.trend === 'stable').length}
                </div>
                <div className="text-sm text-muted-foreground">Metrics Stable</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold text-blue-600">
                  {comparisonMetrics.filter(m => m.benchmark && m.currentValue >= m.benchmark).length}
                </div>
                <div className="text-sm text-muted-foreground">Targets Met</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historical Trends</CardTitle>
              <CardDescription>
                Performance trends over the selected time period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      yAxisId="left"
                      dataKey="current" 
                      fill="#3b82f6" 
                      name="Current"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar 
                      yAxisId="left"
                      dataKey="previous" 
                      fill="#94a3b8" 
                      name="Previous"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="growth" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      name="Growth %"
                    />
                    <ReferenceLine yAxisId="right" y={0} stroke="#ef4444" strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Growth Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Average Growth Rate</span>
                    <span className="font-semibold text-green-600">
                      +{(trendData.reduce((sum, d) => sum + d.growth, 0) / trendData.length).toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Best Performing Period</span>
                    <span className="font-semibold">
                      {trendData.reduce((max, d) => d.growth > max.growth ? d : max, trendData[0])?.period}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Growth Periods</span>
                    <span className="font-semibold">
                      {trendData.filter(d => d.growth > 0).length} of {trendData.length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="font-semibold text-green-800">Strong Growth</span>
                    </div>
                    <p className="text-sm text-green-700">
                      Overall positive trend with consistent improvement
                    </p>
                  </div>
                  
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                      <span className="font-semibold text-blue-800">Seasonal Pattern</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      Performance shows clear seasonal variations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Industry Benchmarks</CardTitle>
              <CardDescription>
                Compare your performance against industry standards
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {benchmarkData.map((benchmark, index) => (
                  <div key={index} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{benchmark.metric}</span>
                      {getPerformanceBadge(benchmark.performance)}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Your Value</span>
                        <span className="font-semibold">
                          {benchmark.metric.includes('Rate') || benchmark.metric.includes('Revenue') ? 
                            (benchmark.metric.includes('Revenue') ? 
                              `$${benchmark.yourValue.toFixed(2)}` : 
                              `${benchmark.yourValue.toFixed(1)}%`
                            ) : 
                            benchmark.yourValue.toFixed(1)
                          }
                        </span>
                      </div>
                      
                      <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-blue-500 h-3 rounded-full relative"
                            style={{ 
                              width: `${(benchmark.yourValue / benchmark.topPerformer) * 100}%` 
                            }}
                          >
                            <div className="absolute right-0 top-0 h-3 w-1 bg-blue-700 rounded-r-full"></div>
                          </div>
                        </div>
                        
                        {/* Industry Average Marker */}
                        <div
                          className="absolute top-0 h-3 w-0.5 bg-yellow-500"
                          style={{ 
                            left: `${(benchmark.industryAverage / benchmark.topPerformer) * 100}%` 
                          }}
                        ></div>
                      </div>
                      
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0</span>
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          Industry Avg: {benchmark.metric.includes('Revenue') ? 
                            `$${benchmark.industryAverage.toFixed(2)}` : 
                            `${benchmark.industryAverage.toFixed(1)}${benchmark.metric.includes('Rate') ? '%' : ''}`
                          }
                        </span>
                        <span>Top Performer: {benchmark.metric.includes('Revenue') ? 
                          `$${benchmark.topPerformer.toFixed(2)}` : 
                          `${benchmark.topPerformer.toFixed(1)}${benchmark.metric.includes('Rate') ? '%' : ''}`
                        }</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Award className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <div className="text-2xl font-bold text-green-600">
                  {benchmarkData.filter(b => b.performance === 'above').length}
                </div>
                <div className="text-sm text-muted-foreground">Above Industry Average</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <Target className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <div className="text-2xl font-bold text-blue-600">
                  {benchmarkData.filter(b => b.performance === 'average').length}
                </div>
                <div className="text-sm text-muted-foreground">At Industry Average</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                <div className="text-2xl font-bold text-red-600">
                  {benchmarkData.filter(b => b.performance === 'below').length}
                </div>
                <div className="text-sm text-muted-foreground">Below Industry Average</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}