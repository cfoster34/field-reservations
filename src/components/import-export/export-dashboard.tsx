'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Download, 
  FileText, 
  Calendar, 
  Users, 
  MapPin, 
  Clock,
  Filter,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ExportConfiguration {
  type: 'users' | 'teams' | 'fields' | 'reservations'
  format: 'csv' | 'json' | 'xlsx' | 'pdf'
  dateRange?: {
    start: string
    end: string
  }
  filters: {
    field: string
    operator: string
    value: any
  }[]
  fields: string[]
  options: {
    includeHeaders: boolean
    includeMetadata: boolean
    includeRelatedData: boolean
    groupBy?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }
}

interface ExportJob {
  id: string
  type: string
  format: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  totalRecords: number
  processedRecords: number
  createdAt: string
  completedAt?: string
  downloadUrl?: string
  error?: string
}

const defaultConfiguration: ExportConfiguration = {
  type: 'users',
  format: 'csv',
  filters: [],
  fields: [],
  options: {
    includeHeaders: true,
    includeMetadata: false,
    includeRelatedData: true,
  },
}

const fieldOptions = {
  users: [
    { value: 'email', label: 'Email' },
    { value: 'fullName', label: 'Full Name' },
    { value: 'phone', label: 'Phone' },
    { value: 'role', label: 'Role' },
    { value: 'teamName', label: 'Team' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'lastLogin', label: 'Last Login' },
    { value: 'status', label: 'Status' },
  ],
  teams: [
    { value: 'name', label: 'Team Name' },
    { value: 'coachName', label: 'Coach' },
    { value: 'ageGroup', label: 'Age Group' },
    { value: 'division', label: 'Division' },
    { value: 'memberCount', label: 'Member Count' },
    { value: 'createdAt', label: 'Created Date' },
    { value: 'season', label: 'Season' },
  ],
  fields: [
    { value: 'name', label: 'Field Name' },
    { value: 'type', label: 'Field Type' },
    { value: 'address', label: 'Address' },
    { value: 'hourlyRate', label: 'Hourly Rate' },
    { value: 'capacity', label: 'Capacity' },
    { value: 'amenities', label: 'Amenities' },
    { value: 'status', label: 'Status' },
  ],
  reservations: [
    { value: 'fieldName', label: 'Field' },
    { value: 'userName', label: 'User' },
    { value: 'teamName', label: 'Team' },
    { value: 'date', label: 'Date' },
    { value: 'startTime', label: 'Start Time' },
    { value: 'endTime', label: 'End Time' },
    { value: 'status', label: 'Status' },
    { value: 'cost', label: 'Cost' },
    { value: 'attendees', label: 'Attendees' },
  ],
}

export const ExportDashboard: React.FC = () => {
  const { toast } = useToast()
  
  const [configuration, setConfiguration] = useState<ExportConfiguration>(defaultConfiguration)
  const [recentJobs, setRecentJobs] = useState<ExportJob[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  useEffect(() => {
    loadRecentJobs()
  }, [])

  useEffect(() => {
    // Update selected fields when type changes
    const defaultFields = fieldOptions[configuration.type].slice(0, 5).map(f => f.value)
    setConfiguration(prev => ({ ...prev, fields: defaultFields }))
  }, [configuration.type])

  const loadRecentJobs = async () => {
    try {
      const response = await fetch('/api/export/jobs')
      if (response.ok) {
        const jobs = await response.json()
        setRecentJobs(jobs.data)
      }
    } catch (error) {
      console.error('Failed to load recent jobs:', error)
    }
  }

  const getPreviewCount = async () => {
    try {
      const response = await fetch('/api/export/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: configuration.type,
          filters: configuration.filters,
          dateRange: configuration.dateRange,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setPreviewCount(result.count)
      }
    } catch (error) {
      console.error('Failed to get preview count:', error)
    }
  }

  const startExport = async () => {
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/export/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuration),
      })

      if (!response.ok) {
        throw new Error('Failed to start export')
      }

      const result = await response.json()
      
      toast({
        title: 'Export Started',
        description: `Your ${configuration.type} export has been queued.`,
      })

      // Refresh recent jobs
      loadRecentJobs()
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const downloadExport = async (job: ExportJob) => {
    if (!job.downloadUrl) return

    try {
      const response = await fetch(job.downloadUrl)
      if (!response.ok) throw new Error('Download failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.type}_export_${job.id}.${job.format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      toast({
        title: 'Download Failed',
        description: 'Failed to download the export file.',
        variant: 'destructive',
      })
    }
  }

  const addFilter = () => {
    setConfiguration(prev => ({
      ...prev,
      filters: [...prev.filters, { field: '', operator: 'equals', value: '' }]
    }))
  }

  const updateFilter = (index: number, updates: Partial<typeof configuration.filters[0]>) => {
    setConfiguration(prev => ({
      ...prev,
      filters: prev.filters.map((filter, i) => 
        i === index ? { ...filter, ...updates } : filter
      )
    }))
  }

  const removeFilter = (index: number) => {
    setConfiguration(prev => ({
      ...prev,
      filters: prev.filters.filter((_, i) => i !== index)
    }))
  }

  const toggleField = (fieldValue: string) => {
    setConfiguration(prev => ({
      ...prev,
      fields: prev.fields.includes(fieldValue)
        ? prev.fields.filter(f => f !== fieldValue)
        : [...prev.fields, fieldValue]
    }))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'users':
        return <Users className="h-4 w-4" />
      case 'teams':
        return <Users className="h-4 w-4" />
      case 'fields':
        return <MapPin className="h-4 w-4" />
      case 'reservations':
        return <Calendar className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Export Data</h1>
        <p className="text-gray-600 mt-2">
          Export your data in various formats for backup, analysis, or sharing
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Configuration</CardTitle>
              <CardDescription>Choose what data to export and how to format it</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Type and Format */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data Type</Label>
                  <Select 
                    value={configuration.type} 
                    onValueChange={(value: any) => setConfiguration(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="users">Users</SelectItem>
                      <SelectItem value="teams">Teams</SelectItem>
                      <SelectItem value="fields">Fields</SelectItem>
                      <SelectItem value="reservations">Reservations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Export Format</Label>
                  <Select 
                    value={configuration.format} 
                    onValueChange={(value: any) => setConfiguration(prev => ({ ...prev, format: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date Range (for reservations) */}
              {configuration.type === 'reservations' && (
                <div>
                  <Label>Date Range</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <Label htmlFor="start-date" className="text-sm">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={configuration.dateRange?.start || ''}
                        onChange={(e) => setConfiguration(prev => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, start: e.target.value, end: prev.dateRange?.end || '' }
                        }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="end-date" className="text-sm">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={configuration.dateRange?.end || ''}
                        onChange={(e) => setConfiguration(prev => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, end: e.target.value, start: prev.dateRange?.start || '' }
                        }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Fields Selection */}
              <div>
                <Label>Fields to Include</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {fieldOptions[configuration.type].map((field) => (
                    <div key={field.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={field.value}
                        checked={configuration.fields.includes(field.value)}
                        onCheckedChange={() => toggleField(field.value)}
                      />
                      <Label htmlFor={field.value} className="text-sm">
                        {field.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div>
                <div className="flex items-center justify-between">
                  <Label>Filters</Label>
                  <Button variant="outline" size="sm" onClick={addFilter}>
                    <Filter className="h-4 w-4 mr-2" />
                    Add Filter
                  </Button>
                </div>
                
                {configuration.filters.length > 0 && (
                  <div className="space-y-3 mt-3">
                    {configuration.filters.map((filter, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Select
                          value={filter.field}
                          onValueChange={(value) => updateFilter(index, { field: value })}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldOptions[configuration.type].map((field) => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Select
                          value={filter.operator}
                          onValueChange={(value) => updateFilter(index, { operator: value })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                            <SelectItem value="starts_with">Starts With</SelectItem>
                            <SelectItem value="not_equals">Not Equals</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Input
                          placeholder="Value"
                          value={filter.value}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          className="flex-1"
                        />
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeFilter(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Options */}
              <div>
                <Label>Export Options</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-headers"
                      checked={configuration.options.includeHeaders}
                      onCheckedChange={(checked) => setConfiguration(prev => ({
                        ...prev,
                        options: { ...prev.options, includeHeaders: checked === true }
                      }))}
                    />
                    <Label htmlFor="include-headers" className="text-sm">
                      Include column headers
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-metadata"
                      checked={configuration.options.includeMetadata}
                      onCheckedChange={(checked) => setConfiguration(prev => ({
                        ...prev,
                        options: { ...prev.options, includeMetadata: checked === true }
                      }))}
                    />
                    <Label htmlFor="include-metadata" className="text-sm">
                      Include export metadata
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-related"
                      checked={configuration.options.includeRelatedData}
                      onCheckedChange={(checked) => setConfiguration(prev => ({
                        ...prev,
                        options: { ...prev.options, includeRelatedData: checked === true }
                      }))}
                    />
                    <Label htmlFor="include-related" className="text-sm">
                      Include related data
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Export Summary and Recent Jobs */}
        <div className="space-y-6">
          {/* Export Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Export Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Data Type:</span>
                  <Badge variant="outline" className="capitalize">
                    {configuration.type}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Format:</span>
                  <Badge variant="outline" className="uppercase">
                    {configuration.format}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Fields:</span>
                  <span>{configuration.fields.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Filters:</span>
                  <span>{configuration.filters.length}</span>
                </div>
                {previewCount !== null && (
                  <div className="flex justify-between text-sm">
                    <span>Records:</span>
                    <span className="font-medium">{previewCount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={getPreviewCount}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Preview Count
                </Button>
                
                <Button
                  onClick={startExport}
                  disabled={isLoading || configuration.fields.length === 0}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Start Export
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Export Jobs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent Exports</span>
                <Button variant="outline" size="sm" onClick={loadRecentJobs}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                {recentJobs.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No recent exports
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentJobs.map((job) => (
                      <div
                        key={job.id}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(job.type)}
                            <span className="text-sm font-medium capitalize">
                              {job.type}
                            </span>
                            <Badge variant="secondary" className="text-xs uppercase">
                              {job.format}
                            </Badge>
                          </div>
                          {getStatusIcon(job.status)}
                        </div>
                        
                        {job.status === 'processing' && (
                          <div>
                            <div className="flex justify-between text-xs mb-1">
                              <span>Progress</span>
                              <span>{job.processedRecords} / {job.totalRecords}</span>
                            </div>
                            <Progress value={job.progress} className="h-2" />
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">
                            {new Date(job.createdAt).toLocaleDateString()}
                          </span>
                          
                          {job.status === 'completed' && job.downloadUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadExport(job)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                          )}
                          
                          {job.status === 'failed' && job.error && (
                            <Badge variant="destructive" className="text-xs">
                              Failed
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}