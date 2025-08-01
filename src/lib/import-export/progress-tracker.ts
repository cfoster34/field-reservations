import { EventEmitter } from 'events'

export interface ImportProgress {
  id: string
  stage: 'parsing' | 'validating' | 'processing' | 'complete' | 'error'
  processed: number
  total: number
  errors: number
  warnings: number
  currentItem?: string
  startTime: number
  estimatedTimeRemaining?: number
  bytesProcessed?: number
  totalBytes?: number
}

export interface ImportError {
  row: number
  field?: string
  message: string
  data?: any
  severity: 'error' | 'warning'
}

export interface ImportResult {
  id: string
  success: boolean
  processed: number
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
  warnings: ImportError[]
  duration: number
  summary: string
}

export class ImportProgressTracker extends EventEmitter {
  private progress: ImportProgress
  private errors: ImportError[] = []
  private warnings: ImportError[] = []
  private created = 0
  private updated = 0
  private skipped = 0

  constructor(id: string, total: number, totalBytes?: number) {
    super()
    
    this.progress = {
      id,
      stage: 'parsing',
      processed: 0,
      total,
      errors: 0,
      warnings: 0,
      startTime: Date.now(),
      totalBytes,
      bytesProcessed: 0,
    }
  }

  updateStage(stage: ImportProgress['stage'], currentItem?: string): void {
    this.progress.stage = stage
    this.progress.currentItem = currentItem
    this.calculateEstimatedTime()
    this.emit('progress', { ...this.progress })
  }

  updateProgress(processed: number, currentItem?: string, bytesProcessed?: number): void {
    this.progress.processed = processed
    this.progress.currentItem = currentItem
    
    if (bytesProcessed !== undefined) {
      this.progress.bytesProcessed = bytesProcessed
    }
    
    this.calculateEstimatedTime()
    this.emit('progress', { ...this.progress })
  }

  incrementProgress(currentItem?: string, bytesProcessed?: number): void {
    this.updateProgress(this.progress.processed + 1, currentItem, bytesProcessed)
  }

  addError(error: ImportError): void {
    if (error.severity === 'error') {
      this.errors.push(error)
      this.progress.errors = this.errors.length
    } else {
      this.warnings.push(error)
      this.progress.warnings = this.warnings.length
    }
    
    this.emit('error', error)
  }

  addErrors(errors: ImportError[]): void {
    errors.forEach(error => this.addError(error))
  }

  incrementCreated(): void {
    this.created++
  }

  incrementUpdated(): void {
    this.updated++
  }

  incrementSkipped(): void {
    this.skipped++
  }

  complete(success = true): ImportResult {
    this.progress.stage = success ? 'complete' : 'error'
    this.emit('progress', { ...this.progress })

    const duration = Date.now() - this.progress.startTime
    const result: ImportResult = {
      id: this.progress.id,
      success,
      processed: this.progress.processed,
      created: this.created,
      updated: this.updated,
      skipped: this.skipped,
      errors: this.errors,
      warnings: this.warnings,
      duration,
      summary: this.generateSummary(duration),
    }

    this.emit('complete', result)
    return result
  }

  getProgress(): ImportProgress {
    return { ...this.progress }
  }

  getErrors(): ImportError[] {
    return [...this.errors]
  }

  getWarnings(): ImportError[] {
    return [...this.warnings]
  }

  private calculateEstimatedTime(): void {
    if (this.progress.processed === 0) {
      this.progress.estimatedTimeRemaining = undefined
      return
    }

    const elapsed = Date.now() - this.progress.startTime
    const rate = this.progress.processed / elapsed
    const remaining = this.progress.total - this.progress.processed
    
    this.progress.estimatedTimeRemaining = remaining / rate
  }

  private generateSummary(duration: number): string {
    const minutes = Math.floor(duration / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    let summary = `Processed ${this.progress.processed} of ${this.progress.total} items in ${timeStr}. `
    
    if (this.created > 0) summary += `Created: ${this.created}. `
    if (this.updated > 0) summary += `Updated: ${this.updated}. `
    if (this.skipped > 0) summary += `Skipped: ${this.skipped}. `
    if (this.errors.length > 0) summary += `Errors: ${this.errors.length}. `
    if (this.warnings.length > 0) summary += `Warnings: ${this.warnings.length}.`

    return summary.trim()
  }
}

// Global tracker registry for managing multiple import processes
class ImportTrackerRegistry {
  private trackers = new Map<string, ImportProgressTracker>()

  register(tracker: ImportProgressTracker): void {
    this.trackers.set(tracker.getProgress().id, tracker)
    
    // Auto-cleanup after completion
    tracker.on('complete', () => {
      setTimeout(() => {
        this.trackers.delete(tracker.getProgress().id)
      }, 300000) // Keep for 5 minutes after completion
    })
  }

  get(id: string): ImportProgressTracker | undefined {
    return this.trackers.get(id)
  }

  getAll(): ImportProgressTracker[] {
    return Array.from(this.trackers.values())
  }

  remove(id: string): boolean {
    return this.trackers.delete(id)
  }

  clear(): void {
    this.trackers.clear()
  }
}

export const importTrackerRegistry = new ImportTrackerRegistry()

// Server-Sent Events (SSE) handler for real-time progress updates
export class ImportProgressSSE {
  private connections = new Map<string, Response>()

  addConnection(importId: string, response: Response): void {
    this.connections.set(importId, response)
    
    const tracker = importTrackerRegistry.get(importId)
    if (tracker) {
      // Send current progress immediately
      this.sendProgress(importId, tracker.getProgress())
      
      // Listen for updates
      tracker.on('progress', (progress) => {
        this.sendProgress(importId, progress)
      })
      
      tracker.on('error', (error) => {
        this.sendError(importId, error)
      })
      
      tracker.on('complete', (result) => {
        this.sendComplete(importId, result)
        this.removeConnection(importId)
      })
    }
  }

  removeConnection(importId: string): void {
    const response = this.connections.get(importId)
    if (response) {
      // Close the SSE connection
      try {
        response.body?.cancel()
      } catch (error) {
        // Ignore errors when closing
      }
      this.connections.delete(importId)
    }
  }

  private sendProgress(importId: string, progress: ImportProgress): void {
    this.sendSSEMessage(importId, 'progress', progress)
  }

  private sendError(importId: string, error: ImportError): void {
    this.sendSSEMessage(importId, 'error', error)
  }

  private sendComplete(importId: string, result: ImportResult): void {
    this.sendSSEMessage(importId, 'complete', result)
  }

  private sendSSEMessage(importId: string, type: string, data: any): void {
    const response = this.connections.get(importId)
    if (!response) return

    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    
    try {
      // Note: In a real implementation, you'd need to use a proper SSE response writer
      // This is a simplified version for demonstration
      console.log(`SSE Message for ${importId}:`, message)
    } catch (error) {
      console.error('Failed to send SSE message:', error)
      this.removeConnection(importId)
    }
  }
}

export const importProgressSSE = new ImportProgressSSE()

// Utility functions for common import operations
export function createProgressTracker(
  type: string,
  total: number,
  totalBytes?: number
): ImportProgressTracker {
  const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const tracker = new ImportProgressTracker(id, total, totalBytes)
  importTrackerRegistry.register(tracker)
  return tracker
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`
  
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

export function calculateProcessingRate(
  processed: number,
  duration: number
): { itemsPerSecond: number; itemsPerMinute: number } {
  const seconds = duration / 1000
  const itemsPerSecond = processed / seconds
  const itemsPerMinute = itemsPerSecond * 60
  
  return { itemsPerSecond, itemsPerMinute }
}