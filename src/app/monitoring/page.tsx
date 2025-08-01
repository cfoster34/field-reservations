'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  AlertCircle, 
  Clock, 
  Database, 
  Globe, 
  MessageSquare, 
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { Line, Bar, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, LineChart, AreaChart } from 'recharts';

interface MetricCard {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export default function MonitoringDashboard() {
  const [period, setPeriod] = useState('24h');
  const [webVitals, setWebVitals] = useState<any>(null);
  const [rumData, setRumData] = useState<any>(null);
  const [dbPerformance, setDbPerformance] = useState<any>(null);
  const [logs, setLogs] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [period]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all monitoring data in parallel
      const [
        webVitalsRes,
        rumRes,
        dbPerfRes,
        logsRes,
        feedbackRes,
      ] = await Promise.all([
        fetch(`/api/monitoring/analytics?period=${period}`),
        fetch(`/api/monitoring/rum?period=${period}`),
        fetch(`/api/monitoring/db-performance?period=${period}`),
        fetch(`/api/monitoring/logs?period=${period}`),
        fetch(`/api/monitoring/feedback?period=${period}`),
      ]);

      const [
        webVitalsData,
        rumData,
        dbPerfData,
        logsData,
        feedbackData,
      ] = await Promise.all([
        webVitalsRes.json(),
        rumRes.json(),
        dbPerfRes.json(),
        logsRes.json(),
        feedbackRes.json(),
      ]);

      setWebVitals(webVitalsData);
      setRumData(rumData);
      setDbPerformance(dbPerfData);
      setLogs(logsData);
      setFeedback(feedbackData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getMetricCards = (): MetricCard[] => {
    if (!webVitals || !rumData || !dbPerformance || !logs) return [];

    return [
      {
        title: 'Active Users',
        value: rumData.stats?.uniqueUsers || 0,
        change: 12.5,
        icon: <Users className="h-4 w-4" />,
        trend: 'up',
      },
      {
        title: 'Avg Response Time',
        value: `${webVitals.metrics?.find((m: any) => m.metric === 'TTFB')?.average || 0}ms`,
        change: -8.3,
        icon: <Clock className="h-4 w-4" />,
        trend: 'down',
      },
      {
        title: 'Error Rate',
        value: `${(logs.stats?.errorRate * 100 || 0).toFixed(2)}%`,
        change: logs.stats?.errorRate > 0.05 ? 15.2 : -5.1,
        icon: <AlertCircle className="h-4 w-4" />,
        trend: logs.stats?.errorRate > 0.05 ? 'up' : 'down',
      },
      {
        title: 'Database Performance',
        value: `${Math.round(dbPerformance.aggregated?.avgDuration || 0)}ms`,
        change: -12.1,
        icon: <Database className="h-4 w-4" />,
        trend: 'down',
      },
    ];
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
          <p className="text-gray-600">Real-time application performance and health metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {getMetricCards().map((metric, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {metric.title}
              </CardTitle>
              {metric.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              {metric.change && (
                <p className={`text-xs flex items-center mt-1 ${
                  metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {metric.trend === 'up' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(metric.change)}% from last period
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors & Logs</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="users">User Activity</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <WebVitalsChart data={webVitals} />
          <ResponseTimeChart data={webVitals} />
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <ErrorRateChart logs={logs} />
          <RecentErrors logs={logs} />
          <ActiveAlerts alerts={alerts} />
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database" className="space-y-4">
          <DatabasePerformanceChart data={dbPerformance} />
          <SlowQueries data={dbPerformance} />
        </TabsContent>

        {/* User Activity Tab */}
        <TabsContent value="users" className="space-y-4">
          <UserActivityChart data={rumData} />
          <UserSessions data={rumData} />
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          <FeedbackOverview data={feedback} />
          <RecentFeedback data={feedback} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Component implementations...
function DashboardSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function WebVitalsChart({ data }: { data: any }) {
  if (!data?.metrics) return null;

  const chartData = data.metrics.map((metric: any) => ({
    name: metric.metric,
    good: metric.distribution.good,
    needsImprovement: metric.distribution.needsImprovement,
    poor: metric.distribution.poor,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Core Web Vitals
        </CardTitle>
        <CardDescription>
          Distribution of performance metrics across all page loads
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
            <Legend />
            <Bar dataKey="good" stackId="a" fill="#10B981" name="Good" />
            <Bar dataKey="needsImprovement" stackId="a" fill="#F59E0B" name="Needs Improvement" />
            <Bar dataKey="poor" stackId="a" fill="#EF4444" name="Poor" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ResponseTimeChart({ data }: { data: any }) {
  if (!data?.metrics) return null;

  const chartData = data.metrics.map((metric: any) => ({
    name: metric.metric,
    p75: metric.p75,
    p90: metric.p90,
    p99: metric.p99,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Response Time Percentiles</CardTitle>
        <CardDescription>
          75th, 90th, and 99th percentile response times
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value: any) => `${value}ms`} />
            <Legend />
            <Line type="monotone" dataKey="p75" stroke="#10B981" name="P75" />
            <Line type="monotone" dataKey="p90" stroke="#F59E0B" name="P90" />
            <Line type="monotone" dataKey="p99" stroke="#EF4444" name="P99" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ErrorRateChart({ logs }: { logs: any }) {
  // Implementation for error rate chart
  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Rate Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-center justify-center text-gray-500">
          Error rate chart visualization
        </div>
      </CardContent>
    </Card>
  );
}

function RecentErrors({ logs }: { logs: any }) {
  if (!logs?.logs) return null;

  const errors = logs.logs.filter((log: any) => ['error', 'fatal'].includes(log.level));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Errors</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {errors.slice(0, 5).map((error: any, index: number) => (
            <div key={index} className="flex items-start space-x-3 p-3 bg-red-50 rounded-md">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error.message}</p>
                <p className="text-xs text-red-600 mt-1">
                  {format(new Date(error.timestamp), 'MMM d, HH:mm:ss')} • {error.route || 'Unknown route'}
                </p>
              </div>
              <Badge variant="destructive">{error.level}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveAlerts({ alerts }: { alerts: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No active alerts</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-gray-600">{alert.details}</p>
                  </div>
                </div>
                <Badge>{alert.severity}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DatabasePerformanceChart({ data }: { data: any }) {
  if (!data?.aggregated) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Query Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{data.aggregated.totalQueries}</p>
            <p className="text-sm text-gray-600">Total Queries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{Math.round(data.aggregated.avgDuration)}ms</p>
            <p className="text-sm text-gray-600">Avg Duration</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">{data.aggregated.slowQueryCount}</p>
            <p className="text-sm text-gray-600">Slow Queries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{data.aggregated.errorQueryCount}</p>
            <p className="text-sm text-gray-600">Failed Queries</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SlowQueries({ data }: { data: any }) {
  if (!data?.slowQueries) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slowest Queries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.slowQueries.slice(0, 5).map((query: any, index: number) => (
            <div key={index} className="border-b pb-3 last:border-b-0">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                  {query.query.substring(0, 50)}...
                </code>
                <Badge variant="outline">{query.duration}ms</Badge>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Table: {query.table_name} • {format(new Date(query.timestamp), 'MMM d, HH:mm:ss')}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UserActivityChart({ data }: { data: any }) {
  if (!data?.stats) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          User Activity Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.totalSessions}</p>
            <p className="text-sm text-gray-600">Total Sessions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.uniqueUsers}</p>
            <p className="text-sm text-gray-600">Unique Users</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.avgPageViews.toFixed(1)}</p>
            <p className="text-sm text-gray-600">Avg Page Views</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserSessions({ data }: { data: any }) {
  if (!data?.sessions) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent User Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.sessions.slice(0, 5).map((session: any, index: number) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-md">
              <div>
                <p className="font-medium">Session {session.id.substring(0, 8)}</p>
                <p className="text-sm text-gray-600">
                  {session.device_type} • {session.page_views} pages • {format(new Date(session.updated_at), 'MMM d, HH:mm')}
                </p>
              </div>
              {session.error_count > 0 && (
                <Badge variant="destructive">{session.error_count} errors</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedbackOverview({ data }: { data: any }) {
  if (!data?.stats) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          User Feedback Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.total}</p>
            <p className="text-sm text-gray-600">Total Feedback</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.withErrors}</p>
            <p className="text-sm text-gray-600">With Errors</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.responseRate}%</p>
            <p className="text-sm text-gray-600">Response Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.stats.byStatus?.new || 0}</p>
            <p className="text-sm text-gray-600">Pending</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentFeedback({ data }: { data: any }) {
  if (!data?.feedback) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Feedback</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.feedback.slice(0, 5).map((item: any, index: number) => (
            <div key={index} className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge>{item.type}</Badge>
                <span className="text-xs text-gray-600">
                  {format(new Date(item.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
              <p className="text-sm">{item.message}</p>
              {item.attached_error && (
                <p className="text-xs text-red-600 mt-1">Has attached error</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}