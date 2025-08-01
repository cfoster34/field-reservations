'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Download, 
  Save, 
  Play, 
  Calendar as CalendarIcon, 
  Filter, 
  BarChart3, 
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Settings,
  Clock,
  Mail,
  FileText,
  Plus,
  Trash2,
  Edit
} from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
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
  Cell
} from 'recharts'

interface CustomReportBuilderProps {
  leagueId: string
}

interface ReportConfig {
  name: string
  description: string
  dataSource: string
  metrics: string[]
  dimensions: string[]
  filters: FilterConfig[]
  dateRange: {
    from: Date
    to: Date
  }
  visualization: 'table' | 'bar' | 'line' | 'area' | 'pie'
  groupBy: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  limit: number
}

interface FilterConfig {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between'
  value: string | string[]
}

interface SavedReport {
  id: string
  name: string
  description: string
  config: ReportConfig
  isScheduled: boolean
  scheduleConfig?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    time: string
    recipients: string[]
  }
  lastRun?: string
  nextRun?: string
  createdAt: string
  updatedAt: string
}

const AVAILABLE_METRICS = [
  { value: 'total_revenue', label: 'Total Revenue', category: 'financial' },
  { value: 'total_bookings', label: 'Total Bookings', category: 'usage' },
  { value: 'unique_users', label: 'Unique Users', category: 'users' },
  { value: 'avg_utilization', label: 'Average Utilization', category: 'usage' },
  { value: 'cancellation_rate', label: 'Cancellation Rate', category: 'usage' },
  { value: 'avg_session_duration', label: 'Avg Session Duration', category: 'engagement' },
  { value: 'conversion_rate', label: 'Conversion Rate', category: 'users' },
  { value: 'revenue_per_user', label: 'Revenue per User', category: 'financial' },
]

const AVAILABLE_DIMENSIONS = [
  { value: 'date', label: 'Date', category: 'time' },
  { value: 'field_type', label: 'Field Type', category: 'field' },
  { value: 'field_name', label: 'Field Name', category: 'field' },
  { value: 'user_role', label: 'User Role', category: 'user' },
  { value: 'team_name', label: 'Team Name', category: 'team' },
  { value: 'hour', label: 'Hour of Day', category: 'time' },
  { value: 'day_of_week', label: 'Day of Week', category: 'time' },
  { value: 'month', label: 'Month', category: 'time' },
]

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1']

export function CustomReportBuilder({ leagueId }: CustomReportBuilderProps) {
  const [activeTab, setActiveTab] = useState('builder')
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    name: '',
    description: '',
    dataSource: 'bookings',
    metrics: ['total_bookings'],
    dimensions: ['date'],
    filters: [],
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date()
    },
    visualization: 'bar',
    groupBy: 'date',
    sortBy: 'date',
    sortOrder: 'asc',
    limit: 100
  })
  const [reportData, setReportData] = useState<any[]>([])
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null)

  useEffect(() => {
    fetchSavedReports()
  }, [leagueId])

  const fetchSavedReports = async () => {
    try {
      const response = await fetch(`/api/analytics/custom-reports`)
      if (!response.ok) return
      
      const result = await response.json()
      setSavedReports(result.data || [])
    } catch (error) {
      console.error('Error fetching saved reports:', error)
    }
  }

  const runReport = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/analytics/custom-reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: reportConfig })
      })
      
      if (!response.ok) {
        // Generate mock data for demonstration
        setReportData(generateMockReportData())
        return
      }
      
      const result = await response.json()
      setReportData(result.data)
    } catch (error) {
      console.error('Error running report:', error)
      setReportData(generateMockReportData())
    } finally {
      setLoading(false)
    }
  }

  const generateMockReportData = () => {
    const data = []
    const days = 30
    
    for (let i = 0; i < days; i++) {
      const date = format(addDays(reportConfig.dateRange.from, i), 'yyyy-MM-dd')
      data.push({
        date,
        total_bookings: Math.floor(Math.random() * 50) + 10,
        total_revenue: Math.floor(Math.random() * 2000) + 500,
        unique_users: Math.floor(Math.random() * 30) + 5,
        avg_utilization: Math.random() * 40 + 40,
        cancellation_rate: Math.random() * 15 + 2,
        conversion_rate: Math.random() * 20 + 60
      })
    }
    
    return data
  }

  const saveReport = async (scheduleConfig?: any) => {
    try {
      const reportToSave = {
        name: reportConfig.name,
        description: reportConfig.description,
        config: reportConfig,
        isScheduled: !!scheduleConfig,
        scheduleConfig
      }

      const response = await fetch('/api/analytics/custom-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportToSave)
      })

      if (response.ok) {
        await fetchSavedReports()
        setShowSaveDialog(false)
        setShowScheduleDialog(false)
      }
    } catch (error) {
      console.error('Error saving report:', error)
    }
  }

  const exportReport = (format: 'csv' | 'pdf' | 'excel') => {
    // Implementation would depend on backend export capabilities
    console.log(`Exporting report as ${format}`)
  }

  const addFilter = () => {
    setReportConfig(prev => ({
      ...prev,
      filters: [...prev.filters, { field: 'field_type', operator: 'equals', value: '' }]
    }))
  }

  const removeFilter = (index: number) => {
    setReportConfig(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index)
    }))
  }

  const updateFilter = (index: number, updates: Partial<FilterConfig>) => {
    setReportConfig(prev => ({
      ...prev,
      filters: prev.filters.map((filter, i) => 
        i === index ? { ...filter, ...updates } : filter
      )
    }))
  }

  const loadSavedReport = (report: SavedReport) => {
    setReportConfig(report.config)
    setSelectedReport(report)
    setActiveTab('builder')
  }

  const renderChart = () => {
    if (!reportData.length) return null

    const chartData = reportData

    switch (reportConfig.visualization) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={reportConfig.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {reportConfig.metrics.map((metric, index) => (
                <Bar 
                  key={metric} 
                  dataKey={metric} 
                  fill={COLORS[index % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={reportConfig.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {reportConfig.metrics.map((metric, index) => (
                <Line 
                  key={metric} 
                  type="monotone" 
                  dataKey={metric} 
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={reportConfig.dimensions[0]} />
              <YAxis />
              <Tooltip />
              <Legend />
              {reportConfig.metrics.map((metric, index) => (
                <Area 
                  key={metric} 
                  type="monotone" 
                  dataKey={metric} 
                  stackId="1"
                  stroke={COLORS[index % COLORS.length]}
                  fill={COLORS[index % COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        const pieData = chartData.slice(0, 6).map((item, index) => ({
          name: item[reportConfig.dimensions[0]],
          value: item[reportConfig.metrics[0]] || 0
        }))
        
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'table':
      default:
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {[...reportConfig.dimensions, ...reportConfig.metrics].map(column => (
                    <th key={column} className="text-left py-2 px-4 capitalize">
                      {AVAILABLE_METRICS.find(m => m.value === column)?.label || 
                       AVAILABLE_DIMENSIONS.find(d => d.value === column)?.label || 
                       column.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, reportConfig.limit).map((row, index) => (
                  <tr key={index} className="border-b">
                    {[...reportConfig.dimensions, ...reportConfig.metrics].map(column => (
                      <td key={column} className="py-2 px-4">
                        {typeof row[column] === 'number' ? 
                          (column.includes('rate') || column.includes('utilization') ? 
                            `${row[column].toFixed(1)}%` : 
                            column.includes('revenue') || column.includes('_per_') ? 
                              `$${row[column].toLocaleString()}` :
                              row[column].toLocaleString()
                          ) : 
                          row[column]
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Custom Report Builder</h2>
          <p className="text-muted-foreground">
            Create, customize, and schedule detailed analytics reports
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportReport('csv')}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => exportReport('pdf')}>
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="builder">Report Builder</TabsTrigger>
          <TabsTrigger value="saved">Saved Reports</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Configuration Panel */}
            <div className="lg:col-span-1 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Report Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reportName">Report Name</Label>
                    <Input
                      id="reportName"
                      placeholder="My Custom Report"
                      value={reportConfig.name}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reportDescription">Description</Label>
                    <Textarea
                      id="reportDescription"
                      placeholder="Report description..."
                      value={reportConfig.description}
                      onChange={(e) => setReportConfig(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Data Source</Label>
                    <Select
                      value={reportConfig.dataSource}
                      onValueChange={(value) => setReportConfig(prev => ({ ...prev, dataSource: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bookings">Bookings</SelectItem>
                        <SelectItem value="users">Users</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="utilization">Field Utilization</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Metrics</Label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {AVAILABLE_METRICS.map(metric => (
                        <div key={metric.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={metric.value}
                            checked={reportConfig.metrics.includes(metric.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setReportConfig(prev => ({
                                  ...prev,
                                  metrics: [...prev.metrics, metric.value]
                                }))
                              } else {
                                setReportConfig(prev => ({
                                  ...prev,
                                  metrics: prev.metrics.filter(m => m !== metric.value)
                                }))
                              }
                            }}
                          />
                          <Label htmlFor={metric.value} className="text-sm">
                            {metric.label}
                          </Label>
                          <Badge variant="outline" className="text-xs">
                            {metric.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Dimensions</Label>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {AVAILABLE_DIMENSIONS.map(dimension => (
                        <div key={dimension.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={dimension.value}
                            checked={reportConfig.dimensions.includes(dimension.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setReportConfig(prev => ({
                                  ...prev,
                                  dimensions: [...prev.dimensions, dimension.value]
                                }))
                              } else {
                                setReportConfig(prev => ({
                                  ...prev,
                                  dimensions: prev.dimensions.filter(d => d !== dimension.value)
                                }))
                              }
                            }}
                          />
                          <Label htmlFor={dimension.value} className="text-sm">
                            {dimension.label}
                          </Label>
                          <Badge variant="outline" className="text-xs">
                            {dimension.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Visualization</Label>
                    <Select
                      value={reportConfig.visualization}
                      onValueChange={(value: any) => setReportConfig(prev => ({ ...prev, visualization: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Table</SelectItem>
                        <SelectItem value="bar">Bar Chart</SelectItem>
                        <SelectItem value="line">Line Chart</SelectItem>
                        <SelectItem value="area">Area Chart</SelectItem>
                        <SelectItem value="pie">Pie Chart</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {reportConfig.filters.map((filter, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Filter {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFilter(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <Select
                        value={filter.field}
                        onValueChange={(value) => updateFilter(index, { field: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_DIMENSIONS.map(dim => (
                            <SelectItem key={dim.value} value={dim.value}>
                              {dim.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={filter.operator}
                        onValueChange={(value: any) => updateFilter(index, { operator: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">Equals</SelectItem>
                          <SelectItem value="not_equals">Not Equals</SelectItem>
                          <SelectItem value="contains">Contains</SelectItem>
                          <SelectItem value="greater_than">Greater Than</SelectItem>
                          <SelectItem value="less_than">Less Than</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        placeholder="Filter value"
                        value={filter.value as string}
                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                      />
                    </div>
                  ))}
                  
                  <Button variant="outline" onClick={addFilter} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Filter
                  </Button>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button onClick={runReport} disabled={loading} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  {loading ? 'Running...' : 'Run Report'}
                </Button>
                
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Save Report</DialogTitle>
                      <DialogDescription>
                        Save this report configuration for future use
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="saveName">Report Name</Label>
                        <Input
                          id="saveName"
                          value={reportConfig.name}
                          onChange={(e) => setReportConfig(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="saveDescription">Description</Label>
                        <Textarea
                          id="saveDescription"
                          value={reportConfig.description}
                          onChange={(e) => setReportConfig(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => saveReport()}>
                        Save Report
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Report Results</CardTitle>
                  {reportData.length > 0 && (
                    <CardDescription>
                      Showing {reportData.length} records
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Running report...</p>
                      </div>
                    </div>
                  ) : reportData.length > 0 ? (
                    renderChart()
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">Click "Run Report" to see results</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Saved Reports</CardTitle>
              <CardDescription>
                Your saved report configurations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {savedReports.filter(r => !r.isScheduled).map(report => (
                  <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{report.name}</h4>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Created: {format(new Date(report.createdAt), 'MMM d, yyyy')}</span>
                        {report.lastRun && (
                          <span>Last run: {format(new Date(report.lastRun), 'MMM d, yyyy')}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadSavedReport(report)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Load
                      </Button>
                      <Button variant="outline" size="sm">
                        <Play className="h-4 w-4 mr-2" />
                        Run
                      </Button>
                    </div>
                  </div>
                ))}
                
                {savedReports.filter(r => !r.isScheduled).length === 0 && (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No saved reports</h3>
                    <p className="text-muted-foreground">Create and save your first custom report to see it here.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>
                Automatically generated and delivered reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {savedReports.filter(r => r.isScheduled).map(report => (
                  <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{report.name}</h4>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {report.scheduleConfig?.frequency} at {report.scheduleConfig?.time}
                        </span>
                        {report.nextRun && (
                          <span>Next: {format(new Date(report.nextRun), 'MMM d, yyyy')}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {report.scheduleConfig?.recipients.length} recipients
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {report.scheduleConfig?.frequency}
                      </Badge>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                  </div>
                ))}
                
                {savedReports.filter(r => r.isScheduled).length === 0 && (
                  <div className="text-center py-12">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No scheduled reports</h3>
                    <p className="text-muted-foreground">Set up automated report delivery to stay informed.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}