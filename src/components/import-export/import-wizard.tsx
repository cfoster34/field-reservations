'use client'

import React, { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Download,
  Eye,
  Settings,
  Zap
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ImportStep {
  id: string
  title: string
  description: string
  completed: boolean
  error?: string
}

interface ImportConfiguration {
  type: 'users' | 'teams' | 'fields' | 'reservations'
  source: 'csv' | 'sportsconnect' | 'api'
  options: {
    delimiter?: string
    skipEmptyLines?: boolean
    validateData?: boolean
    allowPartialImport?: boolean
    conflictResolution?: 'skip' | 'merge' | 'prompt'
    dryRun?: boolean
  }
  mappings?: Record<string, string>
  filters?: Array<{
    field: string
    operator: string
    value: any
  }>
}

interface ImportProgress {
  stage: 'parsing' | 'validating' | 'processing' | 'complete' | 'error'
  processed: number
  total: number
  errors: number
  warnings: number
  currentItem?: string
  estimatedTimeRemaining?: number
}

interface ImportError {
  row: number
  field?: string
  message: string
  severity: 'error' | 'warning'
  data?: any
}

export const ImportWizard: React.FC = () => {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [currentStep, setCurrentStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [configuration, setConfiguration] = useState<ImportConfiguration>({
    type: 'users',
    source: 'csv',
    options: {
      delimiter: ',',
      skipEmptyLines: true,
      validateData: true,
      allowPartialImport: false,
      conflictResolution: 'merge',
      dryRun: false,
    },
  })
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [errors, setErrors] = useState<ImportError[]>([])
  const [warnings, setWarnings] = useState<ImportError[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [importResult, setImportResult] = useState<any>(null)

  const steps: ImportStep[] = [
    {
      id: 'source',
      title: 'Select Source',
      description: 'Choose your data source and upload file',
      completed: !!file && configuration.source === 'csv',
    },
    {
      id: 'configure',
      title: 'Configure Import',
      description: 'Set import options and field mappings',
      completed: false,
    },
    {
      id: 'preview',
      title: 'Preview Data',
      description: 'Review and validate your data before import',
      completed: false,
    },
    {
      id: 'import',
      title: 'Import Data',
      description: 'Process and import your data',
      completed: !!importResult?.success,
    },
    {
      id: 'complete',
      title: 'Complete',
      description: 'Review import results and next steps',
      completed: false,
    },
  ]

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['text/csv', 'application/csv', 'text/plain']
      if (!allowedTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a CSV file.',
          variant: 'destructive',
        })
        return
      }

      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: 'Please select a file smaller than 10MB.',
          variant: 'destructive',
        })
        return
      }

      setFile(selectedFile)
      toast({
        title: 'File Selected',
        description: `${selectedFile.name} is ready for import.`,
      })
    }
  }, [toast])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files[0]
    if (droppedFile) {
      // Create a synthetic event to reuse handleFileSelect logic
      const syntheticEvent = {
        target: {
          files: [droppedFile],
        },
      } as React.ChangeEvent<HTMLInputElement>
      handleFileSelect(syntheticEvent)
    }
  }, [handleFileSelect])

  const generatePreview = async () => {
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', configuration.type)
      formData.append('options', JSON.stringify(configuration.options))

      const response = await fetch('/api/import-export/preview', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to generate preview')
      }

      const result = await response.json()
      setPreviewData(result.data.slice(0, 10)) // Show first 10 rows
      setErrors(result.errors || [])
      setWarnings(result.warnings || [])
      
      toast({
        title: 'Preview Generated',
        description: `Found ${result.totalRows} rows with ${result.errors?.length || 0} errors.`,
      })
    } catch (error) {
      toast({
        title: 'Preview Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred.',
        variant: 'destructive',
      })
    }
  }

  const startImport = async () => {
    if (!file) return

    setIsImporting(true)
    setProgress({
      stage: 'parsing',
      processed: 0,
      total: 0,
      errors: 0,
      warnings: 0,
    })

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', configuration.type)
      formData.append('options', JSON.stringify(configuration.options))
      formData.append('mappings', JSON.stringify(configuration.mappings || {}))

      // Start server-sent events connection for progress updates
      const eventSource = new EventSource(`/api/import-export/import/progress?importId=${Date.now()}`)
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        
        if (data.type === 'progress') {
          setProgress(data.progress)
        } else if (data.type === 'error') {
          setErrors(prev => [...prev, data.error])
        } else if (data.type === 'complete') {
          setImportResult(data.result)
          setProgress(null)
          setIsImporting(false)
          eventSource.close()
          
          toast({
            title: 'Import Complete',
            description: `Successfully imported ${data.result.processed} records.`,
          })
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
        setIsImporting(false)
        setProgress(null)
        
        toast({
          title: 'Import Failed',
          description: 'Connection to server lost during import.',
          variant: 'destructive',
        })
      }

      // Start the import
      const response = await fetch('/api/import-export/import', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to start import')
      }
    } catch (error) {
      setIsImporting(false)
      setProgress(null)
      
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred.',
        variant: 'destructive',
      })
    }
  }

  const renderSourceStep = () => (
    <div className="space-y-6">
      <div>
        <Label htmlFor="data-type">Data Type</Label>
        <Select 
          value={configuration.type} 
          onValueChange={(value: any) => setConfiguration(prev => ({ ...prev, type: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select data type" />
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
        <Label htmlFor="source-type">Source Type</Label>
        <Select 
          value={configuration.source} 
          onValueChange={(value: any) => setConfiguration(prev => ({ ...prev, source: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv">CSV File</SelectItem>
            <SelectItem value="sportsconnect">SportsConnect API</SelectItem>
            <SelectItem value="api">External API</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {configuration.source === 'csv' && (
        <div>
          <Label>CSV File</Label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,application/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="space-y-2">
                <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <p className="font-medium">Drop your CSV file here or click to browse</p>
                <p className="text-sm text-gray-500">Supports files up to 10MB</p>
              </div>
            )}
          </div>
        </div>
      )}

      {configuration.source === 'sportsconnect' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>SportsConnect Integration</span>
            </CardTitle>
            <CardDescription>
              Import data directly from your SportsConnect account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              This will sync data from your connected SportsConnect account. 
              Make sure your API credentials are configured in the integration settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )

  const renderConfigureStep = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Options</CardTitle>
          <CardDescription>Configure how your data should be processed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configuration.source === 'csv' && (
            <>
              <div>
                <Label htmlFor="delimiter">CSV Delimiter</Label>
                <Select 
                  value={configuration.options.delimiter || ','} 
                  onValueChange={(value) => setConfiguration(prev => ({
                    ...prev,
                    options: { ...prev.options, delimiter: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value="|">Pipe (|)</SelectItem>
                    <SelectItem value="\t">Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-empty"
                  checked={configuration.options.skipEmptyLines}
                  onCheckedChange={(checked) => setConfiguration(prev => ({
                    ...prev,
                    options: { ...prev.options, skipEmptyLines: checked === true }
                  }))}
                />
                <Label htmlFor="skip-empty">Skip empty lines</Label>
              </div>
            </>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="validate-data"
              checked={configuration.options.validateData}
              onCheckedChange={(checked) => setConfiguration(prev => ({
                ...prev,
                options: { ...prev.options, validateData: checked === true }
              }))}
            />
            <Label htmlFor="validate-data">Validate data before import</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="allow-partial"
              checked={configuration.options.allowPartialImport}
              onCheckedChange={(checked) => setConfiguration(prev => ({
                ...prev,
                options: { ...prev.options, allowPartialImport: checked === true }
              }))}
            />
            <Label htmlFor="allow-partial">Allow partial import (skip invalid records)</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="dry-run"
              checked={configuration.options.dryRun}
              onCheckedChange={(checked) => setConfiguration(prev => ({
                ...prev,
                options: { ...prev.options, dryRun: checked === true }
              }))}
            />
            <Label htmlFor="dry-run">Dry run (validate only, don't import)</Label>
          </div>

          <div>
            <Label htmlFor="conflict-resolution">Conflict Resolution</Label>
            <Select 
              value={configuration.options.conflictResolution || 'merge'} 
              onValueChange={(value: any) => setConfiguration(prev => ({
                ...prev,
                options: { ...prev.options, conflictResolution: value }
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip conflicting records</SelectItem>
                <SelectItem value="merge">Merge with existing data</SelectItem>
                <SelectItem value="prompt">Prompt for each conflict</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Data Preview</h3>
          <p className="text-sm text-gray-500">
            {previewData.length > 0 ? `Showing first ${previewData.length} rows` : 'No data to preview'}
          </p>
        </div>
        <Button onClick={generatePreview} disabled={!file}>
          <Eye className="h-4 w-4 mr-2" />
          Generate Preview
        </Button>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {errors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span>{errors.length} Errors</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {errors.slice(0, 5).map((error, index) => (
                      <div key={index} className="text-sm">
                        <p className="font-medium">Row {error.row}</p>
                        <p className="text-gray-600">{error.message}</p>
                      </div>
                    ))}
                    {errors.length > 5 && (
                      <p className="text-sm text-gray-500">
                        ... and {errors.length - 5} more errors
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {warnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  <span>{warnings.length} Warnings</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40">
                  <div className="space-y-2">
                    {warnings.slice(0, 5).map((warning, index) => (
                      <div key={index} className="text-sm">
                        <p className="font-medium">Row {warning.row}</p>
                        <p className="text-gray-600">{warning.message}</p>
                      </div>
                    ))}
                    {warnings.length > 5 && (
                      <p className="text-sm text-gray-500">
                        ... and {warnings.length - 5} more warnings
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {previewData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Row</th>
                    {Object.keys(previewData[0] || {}).map((key) => (
                      <th key={key} className="text-left p-2 font-medium">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-2 text-gray-500">{index + 1}</td>
                      {Object.values(row).map((value: any, cellIndex) => (
                        <td key={cellIndex} className="p-2">
                          {String(value || '').substring(0, 50)}
                          {String(value || '').length > 50 && '...'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )

  const renderImportStep = () => (
    <div className="space-y-6">
      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Importing {configuration.type}</span>
            </CardTitle>
            <CardDescription>
              {progress.currentItem || `Processing ${progress.stage}...`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{progress.processed} / {progress.total}</span>
              </div>
              <Progress 
                value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} 
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-medium">Stage</p>
                <Badge variant="outline" className="capitalize">
                  {progress.stage}
                </Badge>
              </div>
              <div>
                <p className="font-medium">Errors</p>
                <p className="text-red-600">{progress.errors}</p>
              </div>
              <div>
                <p className="font-medium">Warnings</p>
                <p className="text-yellow-600">{progress.warnings}</p>
              </div>
              <div>
                <p className="font-medium">ETA</p>
                <p className="text-gray-600">
                  {progress.estimatedTimeRemaining 
                    ? `${Math.ceil(progress.estimatedTimeRemaining / 1000)}s`
                    : 'Calculating...'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!progress && !importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Import</CardTitle>
            <CardDescription>
              Click the button below to start importing your {configuration.type} data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Import Summary</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Data Type: {configuration.type}</li>
                  <li>• Source: {configuration.source}</li>
                  <li>• File: {file?.name}</li>
                  <li>• Validation: {configuration.options.validateData ? 'Enabled' : 'Disabled'}</li>
                  <li>• Conflict Resolution: {configuration.options.conflictResolution}</li>
                  {configuration.options.dryRun && <li>• Mode: Dry Run (validation only)</li>}
                </ul>
              </div>

              <Button onClick={startImport} disabled={isImporting || !file} className="w-full">
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Start Import
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )

  const renderCompleteStep = () => (
    <div className="space-y-6">
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <span>Import Complete</span>
            </CardTitle>
            <CardDescription>
              Your {configuration.type} data has been successfully imported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.processed}</p>
                <p className="text-sm text-gray-600">Processed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{importResult.created}</p>
                <p className="text-sm text-gray-600">Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{importResult.updated}</p>
                <p className="text-sm text-gray-600">Updated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600">{importResult.skipped}</p>
                <p className="text-sm text-gray-600">Skipped</p>
              </div>
            </div>

            {importResult.summary && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">{importResult.summary}</p>
              </div>
            )}

            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => {
                // Reset wizard
                setCurrentStep(0)
                setFile(null)
                setImportResult(null)
                setErrors([])
                setWarnings([])
                setPreviewData([])
              }}>
                Import More Data
              </Button>
              <Button onClick={() => {
                // Navigate to the imported data view
                window.location.href = `/${configuration.type}`
              }}>
                View Imported {configuration.type}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Data</h1>
        <p className="text-gray-600 mt-2">
          Import users, teams, fields, or reservations from various sources
        </p>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 
                    ${index <= currentStep 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : 'border-gray-300 text-gray-400'
                    }
                    ${step.completed ? 'bg-green-600 border-green-600' : ''}
                  `}
                >
                  {step.completed ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div 
                    className={`w-20 h-0.5 ml-4 
                      ${index < currentStep ? 'bg-blue-600' : 'bg-gray-300'}
                    `} 
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4">
            {steps.map((step, index) => (
              <div key={step.id} className="text-center" style={{ width: '120px' }}>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {currentStep === 0 && renderSourceStep()}
          {currentStep === 1 && renderConfigureStep()}
          {currentStep === 2 && renderPreviewStep()}
          {currentStep === 3 && renderImportStep()}
          {currentStep === 4 && renderCompleteStep()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0 || isImporting}
        >
          Previous
        </Button>
        <Button
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={
            currentStep === steps.length - 1 || 
            isImporting ||
            (currentStep === 0 && !file && configuration.source === 'csv') ||
            (currentStep === 2 && previewData.length === 0) ||
            (currentStep === 3 && !importResult)
          }
        >
          {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  )
}