'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  AlertTriangle, 
  Users, 
  Calendar, 
  MapPin, 
  CheckCircle, 
  XCircle,
  Eye,
  FileText,
  ArrowRight,
  Info
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface DataConflict {
  id: string
  type: 'duplicate' | 'field_mismatch' | 'constraint_violation' | 'business_rule_violation'
  severity: 'high' | 'medium' | 'low'
  existing: any
  incoming: any
  conflictingFields: string[]
  suggestedResolution: {
    strategy: string
    action: 'skip' | 'update' | 'merge' | 'create_new' | 'manual_review'
    reason: string
    autoResolvable: boolean
  }
  metadata: {
    detectedAt: string
    rowIndex: number
    confidence: number
  }
}

interface ConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  conflicts: DataConflict[]
  dataType: 'users' | 'teams' | 'fields' | 'reservations'
  onResolve: (resolutions: ConflictResolution[]) => Promise<void>
}

interface ConflictResolution {
  conflictId: string
  action: 'skip' | 'update' | 'merge' | 'create_new' | 'manual_review'
  strategy?: string
  customData?: any
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  dataType,
  onResolve,
}) => {
  const { toast } = useToast()
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set())
  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(new Map())
  const [batchAction, setBatchAction] = useState<string>('')
  const [isResolving, setIsResolving] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    // Initialize resolutions with suggested actions
    const initialResolutions = new Map<string, ConflictResolution>()
    conflicts.forEach(conflict => {
      initialResolutions.set(conflict.id, {
        conflictId: conflict.id,
        action: conflict.suggestedResolution.action,
        strategy: conflict.suggestedResolution.strategy,
      })
    })
    setResolutions(initialResolutions)
  }, [conflicts])

  const handleConflictSelect = (conflictId: string, selected: boolean) => {
    const newSelected = new Set(selectedConflicts)
    if (selected) {
      newSelected.add(conflictId)
    } else {
      newSelected.delete(conflictId)
    }
    setSelectedConflicts(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedConflicts.size === conflicts.length) {
      setSelectedConflicts(new Set())
    } else {
      setSelectedConflicts(new Set(conflicts.map(c => c.id)))
    }
  }

  const handleResolutionChange = (conflictId: string, action: string) => {
    const newResolutions = new Map(resolutions)
    const existing = newResolutions.get(conflictId)
    newResolutions.set(conflictId, {
      ...existing!,
      action: action as any,
    })
    setResolutions(newResolutions)
  }

  const handleBatchAction = () => {
    if (!batchAction || selectedConflicts.size === 0) return

    const newResolutions = new Map(resolutions)
    selectedConflicts.forEach(conflictId => {
      const existing = newResolutions.get(conflictId)
      newResolutions.set(conflictId, {
        ...existing!,
        action: batchAction as any,
      })
    })
    setResolutions(newResolutions)
    
    toast({
      title: 'Batch Action Applied',
      description: `Applied "${batchAction}" to ${selectedConflicts.size} conflicts.`,
    })
  }

  const handleResolveConflicts = async () => {
    setIsResolving(true)
    
    try {
      const resolutionArray = Array.from(resolutions.values())
      await onResolve(resolutionArray)
      
      toast({
        title: 'Conflicts Resolved',
        description: `Successfully resolved ${resolutionArray.length} conflicts.`,
      })
      
      onClose()
    } catch (error) {
      toast({
        title: 'Resolution Failed',
        description: 'Failed to resolve conflicts. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsResolving(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200'
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'duplicate': return <Users className="h-4 w-4" />
      case 'field_mismatch': return <FileText className="h-4 w-4" />
      case 'constraint_violation': return <XCircle className="h-4 w-4" />
      case 'business_rule_violation': return <AlertTriangle className="h-4 w-4" />
      default: return <Info className="h-4 w-4" />
    }
  }

  const renderConflictComparison = (conflict: DataConflict) => {
    const { existing, incoming, conflictingFields } = conflict
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Existing Data */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Existing Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(existing || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className={`font-medium ${conflictingFields.includes(key) ? 'text-red-600' : 'text-gray-600'}`}>
                    {key}:
                  </span>
                  <span className={conflictingFields.includes(key) ? 'text-red-600 font-medium' : 'text-gray-900'}>
                    {String(value || '—')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-gray-400" />
          </div>

          {/* Incoming Data */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Incoming Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(incoming || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className={`font-medium ${conflictingFields.includes(key) ? 'text-green-600' : 'text-gray-600'}`}>
                    {key}:
                  </span>
                  <span className={conflictingFields.includes(key) ? 'text-green-600 font-medium' : 'text-gray-900'}>
                    {String(value || '—')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Conflicting Fields Highlight */}
        {conflictingFields.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm font-medium text-yellow-800 mb-2">Conflicting Fields:</p>
            <div className="flex flex-wrap gap-2">
              {conflictingFields.map(field => (
                <Badge key={field} variant="outline" className="text-yellow-700 border-yellow-300">
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderOverview = () => {
    const stats = {
      total: conflicts.length,
      high: conflicts.filter(c => c.severity === 'high').length,
      medium: conflicts.filter(c => c.severity === 'medium').length,
      low: conflicts.filter(c => c.severity === 'low').length,
      autoResolvable: conflicts.filter(c => c.suggestedResolution.autoResolvable).length,
    }

    return (
      <div className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-gray-600">Total Conflicts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.high}</p>
              <p className="text-sm text-gray-600">High Severity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.medium}</p>
              <p className="text-sm text-gray-600">Medium Severity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.low}</p>
              <p className="text-sm text-gray-600">Low Severity</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.autoResolvable}</p>
              <p className="text-sm text-gray-600">Auto-Resolvable</p>
            </CardContent>
          </Card>
        </div>

        {/* Batch Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Batch Actions</CardTitle>
            <CardDescription>Apply the same resolution to multiple conflicts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={selectedConflicts.size === conflicts.length}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm">
                Select All ({selectedConflicts.size} of {conflicts.length} selected)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Select value={batchAction} onValueChange={setBatchAction}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Choose action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip All</SelectItem>
                  <SelectItem value="merge">Merge All</SelectItem>
                  <SelectItem value="update">Update All</SelectItem>
                  <SelectItem value="create_new">Create New All</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                onClick={handleBatchAction}
                disabled={!batchAction || selectedConflicts.size === 0}
                variant="outline"
              >
                Apply to Selected
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {stats.high > 0 && (
                <p className="text-red-600">
                  • {stats.high} high-severity conflicts require careful review
                </p>
              )}
              {stats.autoResolvable > 0 && (
                <p className="text-green-600">
                  • {stats.autoResolvable} conflicts can be auto-resolved safely
                </p>
              )}
              {stats.total > 10 && (
                <p className="text-blue-600">
                  • Consider using batch actions for efficiency with large conflict sets
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderConflictList = () => (
    <ScrollArea className="h-96">
      <div className="space-y-4">
        {conflicts.map((conflict) => (
          <Card key={conflict.id} className="border-l-4 border-l-yellow-400">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={selectedConflicts.has(conflict.id)}
                    onCheckedChange={(checked) => handleConflictSelect(conflict.id, checked === true)}
                  />
                  {getTypeIcon(conflict.type)}
                  <div>
                    <p className="font-medium capitalize">
                      {conflict.type.replace('_', ' ')}
                    </p>
                    <p className="text-sm text-gray-500">
                      Row {conflict.metadata.rowIndex + 1}
                    </p>
                  </div>
                </div>
                <Badge className={getSeverityColor(conflict.severity)}>
                  {conflict.severity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                {conflict.suggestedResolution.reason}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Resolution:</span>
                  <Select
                    value={resolutions.get(conflict.id)?.action || conflict.suggestedResolution.action}
                    onValueChange={(value) => handleResolutionChange(conflict.id, value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip</SelectItem>
                      <SelectItem value="merge">Merge</SelectItem>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="create_new">Create New</SelectItem>
                      <SelectItem value="manual_review">Manual Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab(conflict.id)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span>Resolve Data Conflicts</span>
          </DialogTitle>
          <DialogDescription>
            {conflicts.length} conflicts found in your {dataType} data. 
            Review and choose how to resolve each conflict.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts ({conflicts.length})</TabsTrigger>
            {conflicts.map(conflict => (
              <TabsTrigger key={conflict.id} value={conflict.id} className="max-w-32 truncate">
                Row {conflict.metadata.rowIndex + 1}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            {renderOverview()}
          </TabsContent>

          <TabsContent value="conflicts" className="mt-4">
            {renderConflictList()}
          </TabsContent>

          {conflicts.map(conflict => (
            <TabsContent key={conflict.id} value={conflict.id} className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    Conflict Details - Row {conflict.metadata.rowIndex + 1}
                  </h3>
                  <Badge className={getSeverityColor(conflict.severity)}>
                    {conflict.severity} severity
                  </Badge>
                </div>
                
                {renderConflictComparison(conflict)}
                
                <Card>
                  <CardHeader>
                    <CardTitle>Resolution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Suggested Action:</p>
                        <p className="text-sm text-gray-600 mb-3">
                          {conflict.suggestedResolution.reason}
                        </p>
                        <Select
                          value={resolutions.get(conflict.id)?.action || conflict.suggestedResolution.action}
                          onValueChange={(value) => handleResolutionChange(conflict.id, value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip this record</SelectItem>
                            <SelectItem value="merge">Merge with existing</SelectItem>
                            <SelectItem value="update">Update existing</SelectItem>
                            <SelectItem value="create_new">Create as new record</SelectItem>
                            <SelectItem value="manual_review">Require manual review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                // Apply suggested resolutions
                const newResolutions = new Map<string, ConflictResolution>()
                conflicts.forEach(conflict => {
                  newResolutions.set(conflict.id, {
                    conflictId: conflict.id,
                    action: conflict.suggestedResolution.action,
                    strategy: conflict.suggestedResolution.strategy,
                  })
                })
                setResolutions(newResolutions)
                toast({
                  title: 'Applied Suggestions',
                  description: 'Applied all suggested resolutions.',
                })
              }}
            >
              Apply Suggestions
            </Button>
            <Button
              onClick={handleResolveConflicts}
              disabled={isResolving}
            >
              {isResolving ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Resolve Conflicts
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}