import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  threshold: number;
  window: number; // in minutes
  severity: AlertSeverity;
  channels: AlertChannel[];
  conditions: AlertCondition[];
  enabled: boolean;
}

export enum AlertType {
  ERROR_RATE = 'error_rate',
  RESPONSE_TIME = 'response_time',
  DOWNTIME = 'downtime',
  SLOW_QUERIES = 'slow_queries',
  MEMORY_USAGE = 'memory_usage',
  FAILED_PAYMENTS = 'failed_payments',
  USER_COMPLAINTS = 'user_complaints',
  SECURITY_THREAT = 'security_threat',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertChannel {
  EMAIL = 'email',
  SMS = 'sms',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  PAGERDUTY = 'pagerduty',
}

export interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains';
  value: any;
}

export interface Alert {
  ruleId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  resolved?: boolean;
}

class AlertManager {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadDefaultRules();
    this.startMonitoring();
  }

  private loadDefaultRules() {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        type: AlertType.ERROR_RATE,
        threshold: 0.05, // 5% error rate
        window: 5,
        severity: AlertSeverity.HIGH,
        channels: [AlertChannel.EMAIL, AlertChannel.SLACK],
        conditions: [],
        enabled: true,
      },
      {
        id: 'slow-response-time',
        name: 'Slow Response Time',
        type: AlertType.RESPONSE_TIME,
        threshold: 3000, // 3 seconds
        window: 10,
        severity: AlertSeverity.MEDIUM,
        channels: [AlertChannel.SLACK],
        conditions: [],
        enabled: true,
      },
      {
        id: 'database-performance',
        name: 'Database Performance Issues',
        type: AlertType.SLOW_QUERIES,
        threshold: 10, // 10 slow queries
        window: 15,
        severity: AlertSeverity.MEDIUM,
        channels: [AlertChannel.EMAIL],
        conditions: [],
        enabled: true,
      },
      {
        id: 'payment-failures',
        name: 'Payment Processing Failures',
        type: AlertType.FAILED_PAYMENTS,
        threshold: 5, // 5 failed payments
        window: 30,
        severity: AlertSeverity.CRITICAL,
        channels: [AlertChannel.EMAIL, AlertChannel.SMS, AlertChannel.PAGERDUTY],
        conditions: [],
        enabled: true,
      },
      {
        id: 'security-threat',
        name: 'Potential Security Threat',
        type: AlertType.SECURITY_THREAT,
        threshold: 1, // Any security threat
        window: 1,
        severity: AlertSeverity.CRITICAL,
        channels: [AlertChannel.EMAIL, AlertChannel.SMS, AlertChannel.PAGERDUTY],
        conditions: [],
        enabled: true,
      },
    ];

    defaultRules.forEach(rule => this.rules.set(rule.id, rule));
  }

  private startMonitoring() {
    // Check alerts every minute
    this.checkInterval = setInterval(() => {
      this.checkAlerts();
    }, 60000);

    // Initial check
    this.checkAlerts();
  }

  private async checkAlerts() {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const triggered = await this.evaluateRule(rule);
        
        if (triggered) {
          await this.triggerAlert(rule);
        } else {
          // Check if we should resolve an existing alert
          const alertKey = this.getAlertKey(rule);
          if (this.activeAlerts.has(alertKey)) {
            await this.resolveAlert(alertKey);
          }
        }
      } catch (error) {
        logger.error('Error checking alert rule', { ruleId: rule.id, error });
      }
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<boolean> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - rule.window * 60 * 1000);

    switch (rule.type) {
      case AlertType.ERROR_RATE:
        return await this.checkErrorRate(rule, startTime, endTime);
      
      case AlertType.RESPONSE_TIME:
        return await this.checkResponseTime(rule, startTime, endTime);
      
      case AlertType.SLOW_QUERIES:
        return await this.checkSlowQueries(rule, startTime, endTime);
      
      case AlertType.FAILED_PAYMENTS:
        return await this.checkFailedPayments(rule, startTime, endTime);
      
      case AlertType.SECURITY_THREAT:
        return await this.checkSecurityThreats(rule, startTime, endTime);
      
      default:
        return false;
    }
  }

  private async checkErrorRate(rule: AlertRule, startTime: Date, endTime: Date): Promise<boolean> {
    try {
      const response = await fetch(`/api/monitoring/logs?period=custom&start=${startTime.toISOString()}&end=${endTime.toISOString()}`);
      const data = await response.json();
      
      const errorRate = data.stats.errorRate || 0;
      return errorRate > rule.threshold;
    } catch (error) {
      logger.error('Failed to check error rate', { error });
      return false;
    }
  }

  private async checkResponseTime(rule: AlertRule, startTime: Date, endTime: Date): Promise<boolean> {
    try {
      const response = await fetch(`/api/monitoring/analytics?period=custom&start=${startTime.toISOString()}&end=${endTime.toISOString()}`);
      const data = await response.json();
      
      const avgResponseTime = data.metrics.find((m: any) => m.metric === 'TTFB')?.average || 0;
      return avgResponseTime > rule.threshold;
    } catch (error) {
      logger.error('Failed to check response time', { error });
      return false;
    }
  }

  private async checkSlowQueries(rule: AlertRule, startTime: Date, endTime: Date): Promise<boolean> {
    try {
      const response = await fetch(`/api/monitoring/db-performance?period=custom&start=${startTime.toISOString()}&end=${endTime.toISOString()}`);
      const data = await response.json();
      
      const slowQueryCount = data.aggregated.slowQueryCount || 0;
      return slowQueryCount > rule.threshold;
    } catch (error) {
      logger.error('Failed to check slow queries', { error });
      return false;
    }
  }

  private async checkFailedPayments(rule: AlertRule, startTime: Date, endTime: Date): Promise<boolean> {
    // This would check payment failure logs
    // For now, returning false as a placeholder
    return false;
  }

  private async checkSecurityThreats(rule: AlertRule, startTime: Date, endTime: Date): Promise<boolean> {
    // This would check for security-related logs
    // For now, returning false as a placeholder
    return false;
  }

  private getAlertKey(rule: AlertRule): string {
    return `${rule.type}-${rule.id}`;
  }

  private async triggerAlert(rule: AlertRule) {
    const alertKey = this.getAlertKey(rule);
    
    // Don't re-trigger if already active
    if (this.activeAlerts.has(alertKey)) return;

    const alert: Alert = {
      ruleId: rule.id,
      type: rule.type,
      severity: rule.severity,
      message: `Alert: ${rule.name} - Threshold exceeded`,
      details: {
        threshold: rule.threshold,
        window: rule.window,
      },
      timestamp: new Date(),
    };

    this.activeAlerts.set(alertKey, alert);

    // Send notifications
    await this.sendNotifications(alert, rule);

    // Log alert
    logger.warn('Alert triggered', {
      alertId: alertKey,
      rule: rule.name,
      severity: rule.severity,
    });

    // Send to Sentry
    Sentry.captureMessage(`Alert: ${rule.name}`, {
      level: this.mapSeverityToSentryLevel(rule.severity),
      tags: {
        alert_type: rule.type,
        alert_severity: rule.severity,
      },
      extra: alert.details,
    });
  }

  private async resolveAlert(alertKey: string) {
    const alert = this.activeAlerts.get(alertKey);
    if (!alert) return;

    alert.resolved = true;
    this.activeAlerts.delete(alertKey);

    logger.info('Alert resolved', {
      alertId: alertKey,
      duration: Date.now() - alert.timestamp.getTime(),
    });

    // Send resolution notification
    const rule = this.rules.get(alert.ruleId);
    if (rule) {
      await this.sendNotifications(
        { ...alert, message: `Resolved: ${rule.name}` },
        rule
      );
    }
  }

  private async sendNotifications(alert: Alert, rule: AlertRule) {
    for (const channel of rule.channels) {
      try {
        await this.sendToChannel(alert, channel);
      } catch (error) {
        logger.error('Failed to send alert notification', {
          channel,
          alertId: alert.ruleId,
          error,
        });
      }
    }
  }

  private async sendToChannel(alert: Alert, channel: AlertChannel) {
    const payload = {
      alert,
      channel,
      timestamp: new Date().toISOString(),
    };

    await fetch('/api/monitoring/alerts/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  private mapSeverityToSentryLevel(severity: AlertSeverity): Sentry.SeverityLevel {
    switch (severity) {
      case AlertSeverity.LOW:
        return 'info';
      case AlertSeverity.MEDIUM:
        return 'warning';
      case AlertSeverity.HIGH:
        return 'error';
      case AlertSeverity.CRITICAL:
        return 'fatal';
    }
  }

  // Public methods for managing rules
  addRule(rule: AlertRule) {
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string) {
    this.rules.delete(ruleId);
  }

  updateRule(ruleId: string, updates: Partial<AlertRule>) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.set(ruleId, { ...rule, ...updates });
    }
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Create singleton instance
export const alertManager = new AlertManager();

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => alertManager.destroy());
  process.on('SIGINT', () => alertManager.destroy());
  process.on('SIGTERM', () => alertManager.destroy());
}