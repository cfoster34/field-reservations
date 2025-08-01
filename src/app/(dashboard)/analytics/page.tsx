'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Zap, 
  FileText, 
  Target, 
  CalendarIcon,
  Download,
  Settings
} from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

// Import our analytics components
import { ExecutiveDashboard } from '@/components/analytics/executive-dashboard'
import { FieldUtilizationHeatmap } from '@/components/analytics/field-utilization-heatmap'
import { RevenueForecasting } from '@/components/analytics/revenue-forecasting'
import { UserEngagementAnalytics } from '@/components/analytics/user-engagement-analytics'
import { BookingPatternAnalysis } from '@/components/analytics/booking-pattern-analysis'
import { RealTimeAnalytics } from '@/components/analytics/real-time-analytics'
import { CustomReportBuilder } from '@/components/analytics/custom-report-builder'
import { ComparativeAnalytics } from '@/components/analytics/comparative-analytics'

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  })
  const [activeTab, setActiveTab] = useState('executive')

  // In a real app, this would come from authentication context
  const leagueId = "league-123"

  const tabConfig = [
    {
      value: 'executive',
      label: 'Executive',
      icon: TrendingUp,
      description: 'High-level KPIs and insights'
    },
    {
      value: 'utilization',
      label: 'Utilization',
      icon: BarChart3,
      description: 'Field usage patterns and heatmaps'
    },
    {
      value: 'revenue',
      label: 'Revenue',
      icon: TrendingUp,
      description: 'Revenue analytics and forecasting'
    },
    {
      value: 'engagement',
      label: 'Engagement',
      icon: Users,
      description: 'User behavior and engagement metrics'
    },
    {
      value: 'patterns',
      label: 'Patterns',
      icon: Target,
      description: 'Booking patterns and optimization'
    },
    {
      value: 'realtime',
      label: 'Real-time',
      icon: Zap,
      description: 'Live analytics and monitoring'
    },
    {
      value: 'reports',
      label: 'Reports',
      icon: FileText,
      description: 'Custom report builder'
    },
    {
      value: 'comparative',
      label: 'Comparative',
      icon: BarChart3,
      description: 'Period comparisons and benchmarks'
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Reporting</h1>
          <p className="text-muted-foreground">
            Comprehensive insights into your field reservation system performance
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
          
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">1,247</p>
                <p className="text-xs text-green-600">+12.3% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Bookings</p>
                <p className="text-2xl font-bold">3,456</p>
                <p className="text-xs text-green-600">+8.7% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">$89,420</p>
                <p className="text-xs text-green-600">+15.2% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Utilization</p>
                <p className="text-2xl font-bold">78.5%</p>
                <p className="text-xs text-red-600">-2.1% from last month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto">
          <TabsList className="grid w-full grid-cols-8">
            {tabConfig.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        {/* Tab Descriptions */}
        <div className="mb-4">
          {tabConfig.map((tab) => (
            <div key={tab.value} className={activeTab === tab.value ? 'block' : 'hidden'}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <tab.icon className="h-6 w-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">{tab.label} Analytics</h3>
                      <p className="text-sm text-muted-foreground">{tab.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        <TabsContent value="executive">
          <ExecutiveDashboard leagueId={leagueId} />
        </TabsContent>

        <TabsContent value="utilization">
          <FieldUtilizationHeatmap leagueId={leagueId} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="revenue">
          <RevenueForecasting leagueId={leagueId} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="engagement">
          <UserEngagementAnalytics leagueId={leagueId} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="patterns">
          <BookingPatternAnalysis leagueId={leagueId} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="realtime">
          <RealTimeAnalytics leagueId={leagueId} />
        </TabsContent>

        <TabsContent value="reports">
          <CustomReportBuilder leagueId={leagueId} />
        </TabsContent>

        <TabsContent value="comparative">
          <ComparativeAnalytics leagueId={leagueId} />
        </TabsContent>
      </Tabs>

      {/* Quick Actions Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>
            Common analytics tasks and shortcuts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export Monthly Report
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Schedule Weekly Summary
            </Button>
            <Button variant="outline" size="sm">
              <TrendingUp className="w-4 h-4 mr-2" />
              View Revenue Forecast
            </Button>
            <Button variant="outline" size="sm">
              <Target className="w-4 h-4 mr-2" />
              Check Performance Goals
            </Button>
            <Button variant="outline" size="sm">
              <Users className="w-4 h-4 mr-2" />
              Analyze User Behavior
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}