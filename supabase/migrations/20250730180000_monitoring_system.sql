-- Create tables for monitoring system

-- Web Vitals table
CREATE TABLE IF NOT EXISTS web_vitals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  metric_name VARCHAR(50) NOT NULL,
  metric_value DECIMAL(10, 2) NOT NULL,
  rating VARCHAR(20) NOT NULL,
  delta DECIMAL(10, 2),
  navigation_type VARCHAR(50),
  url TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RUM Sessions table
CREATE TABLE IF NOT EXISTS rum_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_type VARCHAR(50),
  viewport VARCHAR(50),
  screen_resolution VARCHAR(50),
  user_agent TEXT,
  page_views INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RUM Actions table
CREATE TABLE IF NOT EXISTS rum_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(255) REFERENCES rum_sessions(id),
  user_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  target TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RUM Page Metrics table
CREATE TABLE IF NOT EXISTS rum_page_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id VARCHAR(255) REFERENCES rum_sessions(id),
  user_id UUID REFERENCES users(id),
  url TEXT NOT NULL,
  load_time INTEGER,
  render_time INTEGER,
  interactive_time INTEGER,
  resource_count INTEGER,
  resource_size BIGINT,
  error_count INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Database Performance Stats table
CREATE TABLE IF NOT EXISTS db_performance_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  total_queries INTEGER NOT NULL,
  total_duration DECIMAL(10, 2) NOT NULL,
  avg_duration DECIMAL(10, 2) NOT NULL,
  slow_queries INTEGER DEFAULT 0,
  error_queries INTEGER DEFAULT 0,
  query_by_table JSONB,
  query_by_operation JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Database Query Logs table
CREATE TABLE IF NOT EXISTS db_query_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  table_name VARCHAR(255),
  operation VARCHAR(50),
  duration DECIMAL(10, 2) NOT NULL,
  row_count INTEGER,
  is_error BOOLEAN DEFAULT FALSE,
  is_slow BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Application Logs table
CREATE TABLE IF NOT EXISTS application_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  user_id UUID REFERENCES users(id),
  session_id VARCHAR(255),
  request_id VARCHAR(255),
  route VARCHAR(255),
  method VARCHAR(20),
  context JSONB,
  error_stack TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitoring Alerts table
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  channel VARCHAR(50) NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  message TEXT NOT NULL,
  attached_error TEXT,
  event_id VARCHAR(255),
  url TEXT,
  user_agent TEXT,
  viewport VARCHAR(50),
  status VARCHAR(50) DEFAULT 'new',
  response TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_web_vitals_timestamp ON web_vitals(timestamp DESC);
CREATE INDEX idx_web_vitals_user_id ON web_vitals(user_id);
CREATE INDEX idx_web_vitals_metric_name ON web_vitals(metric_name);

CREATE INDEX idx_rum_sessions_user_id ON rum_sessions(user_id);
CREATE INDEX idx_rum_sessions_updated_at ON rum_sessions(updated_at DESC);

CREATE INDEX idx_rum_actions_session_id ON rum_actions(session_id);
CREATE INDEX idx_rum_actions_timestamp ON rum_actions(timestamp DESC);
CREATE INDEX idx_rum_actions_type ON rum_actions(action_type);

CREATE INDEX idx_db_performance_timestamp ON db_performance_stats(timestamp DESC);

CREATE INDEX idx_db_query_logs_timestamp ON db_query_logs(timestamp DESC);
CREATE INDEX idx_db_query_logs_table ON db_query_logs(table_name);
CREATE INDEX idx_db_query_logs_slow ON db_query_logs(is_slow) WHERE is_slow = TRUE;

CREATE INDEX idx_application_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX idx_application_logs_level ON application_logs(level);
CREATE INDEX idx_application_logs_user_id ON application_logs(user_id);
CREATE INDEX idx_application_logs_route ON application_logs(route);

CREATE INDEX idx_monitoring_alerts_timestamp ON monitoring_alerts(timestamp DESC);
CREATE INDEX idx_monitoring_alerts_resolved ON monitoring_alerts(resolved);
CREATE INDEX idx_monitoring_alerts_type ON monitoring_alerts(type);

CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX idx_user_feedback_status ON user_feedback(status);
CREATE INDEX idx_user_feedback_type ON user_feedback(type);

-- Enable Row Level Security
ALTER TABLE web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rum_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rum_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rum_page_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_performance_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for monitoring data (admin only)
CREATE POLICY "Admin users can view all monitoring data" ON web_vitals
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all RUM sessions" ON rum_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all RUM actions" ON rum_actions
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all page metrics" ON rum_page_metrics
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all DB performance stats" ON db_performance_stats
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all query logs" ON db_query_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can view all application logs" ON application_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can manage alerts" ON monitoring_alerts
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- RLS Policies for user feedback
CREATE POLICY "Users can create their own feedback" ON user_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own feedback" ON user_feedback
  FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admin users can manage all feedback" ON user_feedback
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Function to clean up old monitoring data
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete web vitals older than 30 days
  DELETE FROM web_vitals WHERE timestamp < NOW() - INTERVAL '30 days';
  
  -- Delete RUM data older than 30 days
  DELETE FROM rum_actions WHERE timestamp < NOW() - INTERVAL '30 days';
  DELETE FROM rum_page_metrics WHERE timestamp < NOW() - INTERVAL '30 days';
  DELETE FROM rum_sessions WHERE updated_at < NOW() - INTERVAL '30 days';
  
  -- Delete DB logs older than 7 days
  DELETE FROM db_query_logs WHERE timestamp < NOW() - INTERVAL '7 days';
  DELETE FROM db_performance_stats WHERE timestamp < NOW() - INTERVAL '7 days';
  
  -- Delete application logs older than 14 days
  DELETE FROM application_logs WHERE timestamp < NOW() - INTERVAL '14 days';
  
  -- Delete resolved alerts older than 30 days
  DELETE FROM monitoring_alerts WHERE resolved = TRUE AND timestamp < NOW() - INTERVAL '30 days';
END;
$$;

-- Create a scheduled job to clean up old data (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-monitoring-data', '0 2 * * *', 'SELECT cleanup_old_monitoring_data();');