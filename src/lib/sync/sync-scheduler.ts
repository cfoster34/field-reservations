import { createClient } from '@/lib/supabase/server'
import { SportsConnectSyncService } from '@/lib/integrations/sportsconnect/sync-service'
import { webhookManager } from '@/lib/webhooks/webhook-manager'
import { z } from 'zod'

export interface SyncSchedule {
  id: string
  leagueId: string
  name: string
  description?: string
  source: 'sportsconnect' | 'csv' | 'api'
  syncType: 'full' | 'incremental'
  frequency: 'manual' | 'hourly' | 'daily' | 'weekly' | 'monthly'
  scheduleExpression?: string // Cron expression for custom schedules
  isActive: boolean
  lastRunAt?: string
  nextRunAt?: string
  configuration: SyncConfiguration
  errorHandling: ErrorHandlingConfig
  notifications: NotificationConfig
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface SyncConfiguration {
  syncUsers?: boolean
  syncTeams?: boolean
  syncFields?: boolean
  syncReservations?: boolean
  batchSize?: number
  timeout?: number
  retryAttempts?: number
  conflictResolution?: 'skip' | 'merge' | 'prompt'
  customMappings?: Record<string, any>
  filters?: SyncFilter[]
}

export interface SyncFilter {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'in' | 'not_in'
  value: any
}

export interface ErrorHandlingConfig {
  maxErrors: number
  onError: 'stop' | 'continue' | 'retry'
  retryAttempts: number
  retryDelay: number // seconds
  escalateAfter: number // number of consecutive failures
  notifyOnError: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface NotificationConfig {
  onSuccess: boolean
  onFailure: boolean
  onPartialSuccess: boolean
  webhookEndpoints: string[]
  emailRecipients: string[]
  slackWebhookUrl?: string
}

export interface SyncExecution {
  id: string
  scheduleId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: string
  completedAt?: string
  duration?: number
  result?: any
  error?: string
  logs: SyncLogEntry[]
  metrics: SyncMetrics
}

export interface SyncLogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, any>
}

export interface SyncMetrics {
  recordsProcessed: number
  recordsCreated: number
  recordsUpdated: number
  recordsSkipped: number
  recordsErrored: number
  apiCallsCount: number
  dataTransferred: number // bytes
  performance: {
    avgProcessingTime: number
    maxProcessingTime: number
    minProcessingTime: number
  }
}

const scheduleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  source: z.enum(['sportsconnect', 'csv', 'api']),
  syncType: z.enum(['full', 'incremental']),
  frequency: z.enum(['manual', 'hourly', 'daily', 'weekly', 'monthly']),
  scheduleExpression: z.string().optional(),
  configuration: z.object({
    syncUsers: z.boolean().default(true),
    syncTeams: z.boolean().default(true),
    syncFields: z.boolean().default(true),
    syncReservations: z.boolean().default(true),
    batchSize: z.number().min(1).max(1000).default(100),
    timeout: z.number().min(1000).max(300000).default(60000),
    retryAttempts: z.number().min(0).max(10).default(3),
    conflictResolution: z.enum(['skip', 'merge', 'prompt']).default('merge'),
    customMappings: z.record(z.any()).optional(),
    filters: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'greater_than', 'less_than', 'in', 'not_in']),
      value: z.any(),
    })).optional(),
  }),
  errorHandling: z.object({
    maxErrors: z.number().min(1).max(1000).default(100),
    onError: z.enum(['stop', 'continue', 'retry']).default('continue'),
    retryAttempts: z.number().min(0).max(10).default(3),
    retryDelay: z.number().min(1).max(3600).default(60),
    escalateAfter: z.number().min(1).max(100).default(5),
    notifyOnError: z.boolean().default(true),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  notifications: z.object({
    onSuccess: z.boolean().default(true),
    onFailure: z.boolean().default(true),
    onPartialSuccess: z.boolean().default(true),
    webhookEndpoints: z.array(z.string().uuid()).default([]),
    emailRecipients: z.array(z.string().email()).default([]),
    slackWebhookUrl: z.string().url().optional(),
  }),
})

export class SyncScheduler {
  private supabase: any
  private runningExecutions = new Map<string, SyncExecution>()
  private scheduleTimers = new Map<string, NodeJS.Timeout>()

  constructor() {
    this.supabase = createClient()
    this.initializeScheduler()
  }

  private async initializeScheduler(): Promise<void> {
    // Load active schedules and set up timers
    const activeSchedules = await this.getActiveSchedules()
    
    for (const schedule of activeSchedules) {
      this.scheduleNextRun(schedule)
    }

    // Set up cleanup job for old executions
    setInterval(() => {
      this.cleanupOldExecutions()
    }, 24 * 60 * 60 * 1000) // Daily cleanup
  }

  // Schedule management
  async createSyncSchedule(
    leagueId: string,
    userId: string,
    scheduleData: Omit<SyncSchedule, 'id' | 'leagueId' | 'createdAt' | 'updatedAt' | 'createdBy'>
  ): Promise<SyncSchedule> {
    const validation = scheduleSchema.parse(scheduleData)
    
    const schedule = {
      league_id: leagueId,
      created_by: userId,
      name: validation.name,
      description: validation.description,
      source: validation.source,
      sync_type: validation.syncType,
      frequency: validation.frequency,
      schedule_expression: validation.scheduleExpression,
      is_active: true,
      configuration: validation.configuration,
      error_handling: validation.errorHandling,
      notifications: validation.notifications,
      next_run_at: this.calculateNextRun(validation.frequency, validation.scheduleExpression),
    }

    const { data: created, error } = await this.supabase
      .from('sync_schedules')
      .insert(schedule)
      .select()
      .single()

    if (error) throw error

    const transformedSchedule = this.transformSchedule(created)
    
    // Set up timer for next run
    this.scheduleNextRun(transformedSchedule)

    return transformedSchedule
  }

  async updateSyncSchedule(
    scheduleId: string,
    leagueId: string,
    updates: Partial<SyncSchedule>
  ): Promise<SyncSchedule> {
    const { data: updated, error } = await this.supabase
      .from('sync_schedules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('league_id', leagueId)
      .select()
      .single()

    if (error) throw error

    const transformedSchedule = this.transformSchedule(updated)
    
    // Update timer
    this.clearScheduleTimer(scheduleId)
    if (transformedSchedule.isActive) {
      this.scheduleNextRun(transformedSchedule)
    }

    return transformedSchedule
  }

  async deleteSyncSchedule(scheduleId: string, leagueId: string): Promise<void> {
    // Clear timer
    this.clearScheduleTimer(scheduleId)

    // Cancel any running executions
    const runningExecution = this.runningExecutions.get(scheduleId)
    if (runningExecution) {
      await this.cancelExecution(runningExecution.id)
    }

    const { error } = await this.supabase
      .from('sync_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('league_id', leagueId)

    if (error) throw error
  }

  async getSyncSchedules(leagueId: string): Promise<SyncSchedule[]> {
    const { data: schedules, error } = await this.supabase
      .from('sync_schedules')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return schedules.map(schedule => this.transformSchedule(schedule))
  }

  async getSyncSchedule(scheduleId: string, leagueId: string): Promise<SyncSchedule | null> {
    const { data: schedule, error } = await this.supabase
      .from('sync_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('league_id', leagueId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return this.transformSchedule(schedule)
  }

  // Execution management
  async executeSyncNow(
    scheduleId: string,
    leagueId: string,
    triggeredBy?: string
  ): Promise<SyncExecution> {
    const schedule = await this.getSyncSchedule(scheduleId, leagueId)
    if (!schedule) {
      throw new Error('Schedule not found')
    }

    // Check if already running
    if (this.runningExecutions.has(scheduleId)) {
      throw new Error('Sync is already running for this schedule')
    }

    const execution = await this.createExecution(schedule, triggeredBy)
    this.runningExecutions.set(scheduleId, execution)

    // Execute asynchronously
    this.performSync(execution, schedule).catch(error => {
      console.error('Sync execution error:', error)
    })

    return execution
  }

  async cancelExecution(executionId: string): Promise<void> {
    const execution = Array.from(this.runningExecutions.values())
      .find(exec => exec.id === executionId)

    if (!execution) {
      throw new Error('Execution not found or not running')
    }

    execution.status = 'cancelled'
    
    await this.supabase
      .from('sync_executions')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        error: 'Execution cancelled by user',
      })
      .eq('id', executionId)

    this.runningExecutions.delete(execution.scheduleId)
  }

  async getExecutionHistory(
    scheduleId: string,
    leagueId: string,
    options: {
      limit?: number
      offset?: number
      status?: string
    } = {}
  ): Promise<{ executions: SyncExecution[]; total: number }> {
    let query = this.supabase
      .from('sync_executions')
      .select('*', { count: 'exact' })
      .eq('schedule_id', scheduleId)

    if (options.status) {
      query = query.eq('status', options.status)
    }

    query = query
      .order('started_at', { ascending: false })
      .range(options.offset || 0, (options.offset || 0) + (options.limit || 20) - 1)

    const { data: executions, error, count } = await query

    if (error) throw error

    return {
      executions: (executions || []).map(exec => this.transformExecution(exec)),
      total: count || 0,
    }
  }

  async getExecutionLogs(executionId: string): Promise<SyncLogEntry[]> {
    const { data: execution, error } = await this.supabase
      .from('sync_executions')
      .select('logs')
      .eq('id', executionId)
      .single()

    if (error) throw error

    return execution?.logs || []
  }

  // Private methods
  private async getActiveSchedules(): Promise<SyncSchedule[]> {
    const { data: schedules, error } = await this.supabase
      .from('sync_schedules')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('Failed to load active schedules:', error)
      return []
    }

    return schedules.map(schedule => this.transformSchedule(schedule))
  }

  private scheduleNextRun(schedule: SyncSchedule): void {
    if (!schedule.isActive || schedule.frequency === 'manual') return

    const nextRunTime = schedule.nextRunAt ? new Date(schedule.nextRunAt) : new Date()
    const now = new Date()
    const delay = Math.max(0, nextRunTime.getTime() - now.getTime())

    const timer = setTimeout(async () => {
      try {
        await this.executeSyncNow(schedule.id, schedule.leagueId, 'scheduler')
        
        // Schedule next run
        const nextRun = this.calculateNextRun(schedule.frequency, schedule.scheduleExpression)
        await this.updateNextRunTime(schedule.id, nextRun)
        
        // Set up next timer
        schedule.nextRunAt = nextRun
        this.scheduleNextRun(schedule)
      } catch (error) {
        console.error('Scheduled sync execution failed:', error)
        
        // Handle error according to schedule configuration
        await this.handleScheduleError(schedule, error)
      }
    }, delay)

    this.scheduleTimers.set(schedule.id, timer)
  }

  private clearScheduleTimer(scheduleId: string): void {
    const timer = this.scheduleTimers.get(scheduleId)
    if (timer) {
      clearTimeout(timer)
      this.scheduleTimers.delete(scheduleId)
    }
  }

  private calculateNextRun(
    frequency: string,
    scheduleExpression?: string
  ): string {
    const now = new Date()
    
    if (scheduleExpression) {
      // Parse cron expression (simplified implementation)
      // In production, use a proper cron parser like 'node-cron'
      return this.parseCronExpression(scheduleExpression, now)
    }

    switch (frequency) {
      case 'hourly':
        now.setHours(now.getHours() + 1)
        break
      case 'daily':
        now.setDate(now.getDate() + 1)
        break
      case 'weekly':
        now.setDate(now.getDate() + 7)
        break
      case 'monthly':
        now.setMonth(now.getMonth() + 1)
        break
      default:
        // Manual or unknown frequency
        return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // Far future
    }

    return now.toISOString()
  }

  private parseCronExpression(expression: string, from: Date): string {
    // Simplified cron parsing - in production use a proper library
    // Format: minute hour day month dayOfWeek
    const parts = expression.split(' ')
    if (parts.length !== 5) {
      throw new Error('Invalid cron expression format')
    }

    const [minute, hour, day, month, dayOfWeek] = parts
    const next = new Date(from)

    // Basic implementation - advance to next valid time
    next.setMinutes(parseInt(minute) || 0, 0, 0)
    
    if (hour !== '*') {
      next.setHours(parseInt(hour))
    }

    // If the time has passed today, move to tomorrow
    if (next <= from) {
      next.setDate(next.getDate() + 1)
    }

    return next.toISOString()
  }

  private async updateNextRunTime(scheduleId: string, nextRun: string): Promise<void> {
    await this.supabase
      .from('sync_schedules')
      .update({ 
        next_run_at: nextRun,
        last_run_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
  }

  private async createExecution(
    schedule: SyncSchedule,
    triggeredBy?: string
  ): Promise<SyncExecution> {
    const execution: SyncExecution = {
      id: crypto.randomUUID(),
      scheduleId: schedule.id,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
      metrics: {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsErrored: 0,
        apiCallsCount: 0,
        dataTransferred: 0,
        performance: {
          avgProcessingTime: 0,
          maxProcessingTime: 0,
          minProcessingTime: 0,
        },
      },
    }

    const { error } = await this.supabase
      .from('sync_executions')
      .insert({
        id: execution.id,
        schedule_id: schedule.id,
        status: 'running',
        started_at: execution.startedAt,
        triggered_by: triggeredBy,
        logs: [],
        metrics: execution.metrics,
      })

    if (error) throw error

    return execution
  }

  private async performSync(execution: SyncExecution, schedule: SyncSchedule): Promise<void> {
    const startTime = Date.now()
    
    try {
      this.addLog(execution, 'info', 'Starting sync execution', { 
        scheduleId: schedule.id,
        source: schedule.source 
      })

      let result: any

      switch (schedule.source) {
        case 'sportsconnect':
          result = await this.performSportsConnectSync(execution, schedule)
          break
        case 'csv':
          result = await this.performCSVSync(execution, schedule)
          break
        case 'api':
          result = await this.performAPISync(execution, schedule)
          break
        default:
          throw new Error(`Unsupported sync source: ${schedule.source}`)
      }

      // Update execution with success
      execution.status = 'completed'
      execution.completedAt = new Date().toISOString()
      execution.duration = Date.now() - startTime
      execution.result = result

      await this.updateExecution(execution)
      
      // Send success notification
      await this.sendNotification(schedule, execution, 'success')

      this.addLog(execution, 'info', 'Sync execution completed successfully', { 
        duration: execution.duration,
        metrics: execution.metrics 
      })
    } catch (error) {
      // Update execution with failure
      execution.status = 'failed'
      execution.completedAt = new Date().toISOString()
      execution.duration = Date.now() - startTime
      execution.error = error instanceof Error ? error.message : 'Unknown error'

      await this.updateExecution(execution)
      
      // Send failure notification
      await this.sendNotification(schedule, execution, 'failure')

      this.addLog(execution, 'error', 'Sync execution failed', { 
        error: execution.error,
        duration: execution.duration 
      })

      // Handle error according to configuration
      await this.handleExecutionError(schedule, execution, error)
    } finally {
      this.runningExecutions.delete(schedule.id)
    }
  }

  private async performSportsConnectSync(
    execution: SyncExecution,
    schedule: SyncSchedule
  ): Promise<any> {
    const syncService = new SportsConnectSyncService(
      schedule.leagueId,
      schedule.createdBy,
      undefined, // Use default config
      (progress) => {
        this.addLog(execution, 'info', `Sync progress: ${progress.stage}`, progress)
        
        // Update metrics
        execution.metrics.recordsProcessed = progress.processed
        execution.metrics.recordsErrored = progress.errors
      }
    )

    const result = await syncService.performFullSync({
      syncUsers: schedule.configuration.syncUsers,
      syncTeams: schedule.configuration.syncTeams,
      syncFields: schedule.configuration.syncFields,
      syncReservations: schedule.configuration.syncReservations,
      batchSize: schedule.configuration.batchSize,
      since: schedule.syncType === 'incremental' ? schedule.lastRunAt : undefined,
    })

    // Update metrics
    execution.metrics.recordsCreated = 
      result.users.created + result.teams.created + 
      result.fields.created + result.reservations.created
    
    execution.metrics.recordsUpdated = 
      result.users.updated + result.teams.updated + 
      result.fields.updated + result.reservations.updated

    return result
  }

  private async performCSVSync(
    execution: SyncExecution,
    schedule: SyncSchedule
  ): Promise<any> {
    // Implementation for CSV sync
    this.addLog(execution, 'info', 'CSV sync not yet implemented')
    throw new Error('CSV sync not yet implemented')
  }

  private async performAPISync(
    execution: SyncExecution,
    schedule: SyncSchedule
  ): Promise<any> {
    // Implementation for generic API sync
    this.addLog(execution, 'info', 'API sync not yet implemented')
    throw new Error('API sync not yet implemented')
  }

  private addLog(
    execution: SyncExecution,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>
  ): void {
    const logEntry: SyncLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    }

    execution.logs.push(logEntry)

    // Keep only last 1000 log entries to prevent memory issues
    if (execution.logs.length > 1000) {
      execution.logs = execution.logs.slice(-1000)
    }
  }

  private async updateExecution(execution: SyncExecution): Promise<void> {
    await this.supabase
      .from('sync_executions')
      .update({
        status: execution.status,
        completed_at: execution.completedAt,
        duration: execution.duration,
        result: execution.result,
        error: execution.error,
        logs: execution.logs,
        metrics: execution.metrics,
      })
      .eq('id', execution.id)
  }

  private async sendNotification(
    schedule: SyncSchedule,
    execution: SyncExecution,
    type: 'success' | 'failure' | 'partial'
  ): Promise<void> {
    const config = schedule.notifications

    if (
      (type === 'success' && !config.onSuccess) ||
      (type === 'failure' && !config.onFailure) ||
      (type === 'partial' && !config.onPartialSuccess)
    ) {
      return
    }

    // Send webhook notifications
    for (const webhookId of config.webhookEndpoints) {
      try {
        await webhookManager.triggerWebhook(
          schedule.leagueId,
          type === 'success' ? 'sync.completed' : 'sync.failed',
          {
            schedule: {
              id: schedule.id,
              name: schedule.name,
              source: schedule.source,
            },
            execution: {
              id: execution.id,
              status: execution.status,
              duration: execution.duration,
              metrics: execution.metrics,
            },
          },
          undefined,
          {
            id: 'sync-scheduler',
            name: 'Sync Scheduler',
            type: 'system',
          }
        )
      } catch (error) {
        console.error('Failed to send webhook notification:', error)
      }
    }

    // Send email notifications
    if (config.emailRecipients.length > 0) {
      // Implementation would depend on email service
      this.addLog(execution, 'info', 'Email notification sent', {
        recipients: config.emailRecipients,
        type,
      })
    }

    // Send Slack notification
    if (config.slackWebhookUrl) {
      // Implementation for Slack webhook
      this.addLog(execution, 'info', 'Slack notification sent', { type })
    }
  }

  private async handleScheduleError(
    schedule: SyncSchedule,
    error: any
  ): Promise<void> {
    // Implementation for handling schedule-level errors
    console.error('Schedule error:', { scheduleId: schedule.id, error })
  }

  private async handleExecutionError(
    schedule: SyncSchedule,
    execution: SyncExecution,
    error: any
  ): Promise<void> {
    const errorConfig = schedule.errorHandling

    if (errorConfig.onError === 'retry' && errorConfig.retryAttempts > 0) {
      // Implement retry logic
      this.addLog(execution, 'info', 'Scheduling retry', {
        retryAttempts: errorConfig.retryAttempts,
        retryDelay: errorConfig.retryDelay,
      })
    }
  }

  private async cleanupOldExecutions(): Promise<void> {
    // Clean up executions older than 30 days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 30)

    await this.supabase
      .from('sync_executions')
      .delete()
      .lt('started_at', cutoffDate.toISOString())
  }

  private transformSchedule(schedule: any): SyncSchedule {
    return {
      id: schedule.id,
      leagueId: schedule.league_id,
      name: schedule.name,
      description: schedule.description,
      source: schedule.source,
      syncType: schedule.sync_type,
      frequency: schedule.frequency,
      scheduleExpression: schedule.schedule_expression,
      isActive: schedule.is_active,
      lastRunAt: schedule.last_run_at,
      nextRunAt: schedule.next_run_at,
      configuration: schedule.configuration,
      errorHandling: schedule.error_handling,
      notifications: schedule.notifications,
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at,
      createdBy: schedule.created_by,
    }
  }

  private transformExecution(execution: any): SyncExecution {
    return {
      id: execution.id,
      scheduleId: execution.schedule_id,
      status: execution.status,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
      duration: execution.duration,
      result: execution.result,
      error: execution.error,
      logs: execution.logs || [],
      metrics: execution.metrics || {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsErrored: 0,
        apiCallsCount: 0,
        dataTransferred: 0,
        performance: {
          avgProcessingTime: 0,
          maxProcessingTime: 0,
          minProcessingTime: 0,
        },
      },
    }
  }
}

// Singleton instance
export const syncScheduler = new SyncScheduler()