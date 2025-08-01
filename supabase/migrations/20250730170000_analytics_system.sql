-- Enhanced Analytics System Schema
-- This migration adds comprehensive analytics and reporting capabilities

-- Analytics events tracking table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics events
CREATE INDEX idx_analytics_events_league_id ON analytics_events(league_id);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_category ON analytics_events(event_category);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);

-- User engagement metrics table
CREATE TABLE user_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    session_count INTEGER DEFAULT 0,
    session_duration_total INTEGER DEFAULT 0, -- in seconds
    page_views INTEGER DEFAULT 0,
    bookings_made INTEGER DEFAULT 0,
    bookings_cancelled INTEGER DEFAULT 0,
    revenue_generated DECIMAL(10,2) DEFAULT 0,
    last_active_at TIMESTAMPTZ,
    engagement_score DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, league_id, date)
);

-- Indexes for user engagement metrics
CREATE INDEX idx_user_engagement_metrics_user_id ON user_engagement_metrics(user_id);
CREATE INDEX idx_user_engagement_metrics_league_id ON user_engagement_metrics(league_id);
CREATE INDEX idx_user_engagement_metrics_date ON user_engagement_metrics(date);

-- Field utilization analytics table
CREATE TABLE field_utilization_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    utilization_rate DECIMAL(5,2) DEFAULT 0,
    bookings_count INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    average_duration DECIMAL(5,2) DEFAULT 0,
    peak_capacity DECIMAL(5,2) DEFAULT 0,
    weather_condition VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(field_id, date, hour)
);

-- Indexes for field utilization analytics
CREATE INDEX idx_field_utilization_analytics_field_id ON field_utilization_analytics(field_id);
CREATE INDEX idx_field_utilization_analytics_league_id ON field_utilization_analytics(league_id);
CREATE INDEX idx_field_utilization_analytics_date ON field_utilization_analytics(date);

-- Revenue analytics table
CREATE TABLE revenue_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    field_revenue DECIMAL(12,2) DEFAULT 0,
    subscription_revenue DECIMAL(12,2) DEFAULT 0,
    refunded_amount DECIMAL(12,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    avg_transaction_value DECIMAL(10,2) DEFAULT 0,
    new_customer_revenue DECIMAL(12,2) DEFAULT 0,
    recurring_customer_revenue DECIMAL(12,2) DEFAULT 0,
    mrr DECIMAL(12,2) DEFAULT 0, -- Monthly Recurring Revenue
    arr DECIMAL(12,2) DEFAULT 0, -- Annual Recurring Revenue
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, date)
);

-- Indexes for revenue analytics
CREATE INDEX idx_revenue_analytics_league_id ON revenue_analytics(league_id);
CREATE INDEX idx_revenue_analytics_date ON revenue_analytics(date);

-- Booking pattern analytics table
CREATE TABLE booking_pattern_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
    pattern_key VARCHAR(100) NOT NULL, -- '14' for hour, 'monday' for day, etc.
    booking_count INTEGER DEFAULT 0,
    cancellation_count INTEGER DEFAULT 0,
    average_lead_time INTEGER DEFAULT 0, -- hours
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, pattern_type, pattern_key)
);

-- Indexes for booking pattern analytics
CREATE INDEX idx_booking_pattern_analytics_league_id ON booking_pattern_analytics(league_id);
CREATE INDEX idx_booking_pattern_analytics_pattern_type ON booking_pattern_analytics(pattern_type);

-- Predictive analytics models table
CREATE TABLE predictive_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    model_type VARCHAR(100) NOT NULL, -- 'demand_forecast', 'churn_prediction', etc.
    model_version VARCHAR(50) NOT NULL,
    model_data JSONB NOT NULL,
    training_data_period DATERANGE,
    accuracy_score DECIMAL(5,4),
    last_trained_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for predictive models
CREATE INDEX idx_predictive_models_league_id ON predictive_models(league_id);
CREATE INDEX idx_predictive_models_type ON predictive_models(model_type);

-- Demand forecasts table
CREATE TABLE demand_forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    field_id UUID REFERENCES fields(id) ON DELETE CASCADE,
    forecast_date DATE NOT NULL,
    forecast_hour INTEGER CHECK (forecast_hour >= 0 AND forecast_hour <= 23),
    predicted_demand DECIMAL(5,2) NOT NULL, -- 0-100 scale
    confidence_interval DECIMAL(5,2), -- 0-100 scale
    model_id UUID REFERENCES predictive_models(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, field_id, forecast_date, forecast_hour)
);

-- Indexes for demand forecasts
CREATE INDEX idx_demand_forecasts_league_id ON demand_forecasts(league_id);
CREATE INDEX idx_demand_forecasts_field_id ON demand_forecasts(field_id);
CREATE INDEX idx_demand_forecasts_date ON demand_forecasts(forecast_date);

-- Custom reports table
CREATE TABLE custom_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    report_config JSONB NOT NULL,
    schedule_config JSONB, -- for scheduled reports
    is_scheduled BOOLEAN DEFAULT false,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for custom reports
CREATE INDEX idx_custom_reports_league_id ON custom_reports(league_id);
CREATE INDEX idx_custom_reports_created_by ON custom_reports(created_by);
CREATE INDEX idx_custom_reports_scheduled ON custom_reports(is_scheduled) WHERE is_scheduled = true;

-- Report executions table
CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
    executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    execution_type VARCHAR(50) NOT NULL, -- 'manual', 'scheduled'
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    result_data JSONB,
    error_message TEXT,
    execution_time_ms INTEGER,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Indexes for report executions
CREATE INDEX idx_report_executions_report_id ON report_executions(report_id);
CREATE INDEX idx_report_executions_status ON report_executions(status);

-- Functions for analytics calculations
CREATE OR REPLACE FUNCTION calculate_engagement_score(
    p_user_id UUID,
    p_league_id UUID,
    p_date DATE
) RETURNS DECIMAL(5,2) AS $$
DECLARE
    v_score DECIMAL(5,2) := 0;
    v_session_count INTEGER;
    v_session_duration INTEGER;
    v_bookings_made INTEGER;
    v_page_views INTEGER;
BEGIN
    SELECT 
        session_count,
        session_duration_total,
        bookings_made,
        page_views
    INTO 
        v_session_count,
        v_session_duration,
        v_bookings_made,
        v_page_views
    FROM user_engagement_metrics
    WHERE user_id = p_user_id 
      AND league_id = p_league_id 
      AND date = p_date;

    -- Calculate engagement score based on various factors
    v_score := v_score + COALESCE(v_session_count * 10, 0); -- Sessions worth 10 points each
    v_score := v_score + COALESCE(v_session_duration / 60.0, 0); -- 1 point per minute
    v_score := v_score + COALESCE(v_bookings_made * 50, 0); -- Bookings worth 50 points each
    v_score := v_score + COALESCE(v_page_views * 2, 0); -- Page views worth 2 points each

    -- Cap the score at 100
    v_score := LEAST(v_score, 100);

    RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Function to update field utilization analytics
CREATE OR REPLACE FUNCTION update_field_utilization_analytics(
    p_field_id UUID,
    p_date DATE
) RETURNS VOID AS $$
DECLARE
    v_league_id UUID;
    v_hour INTEGER;
    v_utilization_data RECORD;
BEGIN
    -- Get league_id for the field
    SELECT league_id INTO v_league_id FROM fields WHERE id = p_field_id;
    
    -- Update utilization for each hour of the day
    FOR v_hour IN 0..23 LOOP
        -- Calculate utilization metrics for this hour
        SELECT 
            COUNT(*) as bookings_count,
            COALESCE(SUM(EXTRACT(EPOCH FROM (end_time::time - start_time::time)) / 3600), 0) as total_hours,
            COALESCE(SUM(p.amount), 0) as revenue,
            COALESCE(AVG(EXTRACT(EPOCH FROM (r.end_time::time - r.start_time::time)) / 3600), 0) as avg_duration
        INTO v_utilization_data
        FROM reservations r
        LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'completed'
        WHERE r.field_id = p_field_id
          AND r.date = p_date
          AND EXTRACT(HOUR FROM r.start_time::time) = v_hour
          AND r.status IN ('confirmed', 'completed');

        -- Insert or update utilization data
        INSERT INTO field_utilization_analytics (
            field_id,
            league_id,
            date,
            hour,
            utilization_rate,
            bookings_count,
            revenue,
            average_duration
        ) VALUES (
            p_field_id,
            v_league_id,
            p_date,
            v_hour,
            LEAST(v_utilization_data.total_hours * 100, 100), -- Cap at 100%
            v_utilization_data.bookings_count,
            v_utilization_data.revenue,
            v_utilization_data.avg_duration
        )
        ON CONFLICT (field_id, date, hour)
        DO UPDATE SET
            utilization_rate = EXCLUDED.utilization_rate,
            bookings_count = EXCLUDED.bookings_count,
            revenue = EXCLUDED.revenue,
            average_duration = EXCLUDED.average_duration;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to update revenue analytics
CREATE OR REPLACE FUNCTION update_revenue_analytics(
    p_league_id UUID,
    p_date DATE
) RETURNS VOID AS $$
DECLARE
    v_revenue_data RECORD;
BEGIN
    -- Calculate revenue metrics for the date
    SELECT 
        COALESCE(SUM(CASE WHEN p.stripe_subscription_id IS NULL THEN p.amount ELSE 0 END), 0) as field_revenue,
        COALESCE(SUM(CASE WHEN p.stripe_subscription_id IS NOT NULL THEN p.amount ELSE 0 END), 0) as subscription_revenue,
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN p.refunded_at IS NOT NULL THEN COALESCE((p.metadata->>'refund_amount')::decimal, p.amount) ELSE 0 END), 0) as refunded_amount,
        COUNT(*) as transaction_count,
        COALESCE(AVG(p.amount), 0) as avg_transaction_value,
        COALESCE(SUM(CASE WHEN up.created_at::date = p_date THEN p.amount ELSE 0 END), 0) as new_customer_revenue
    INTO v_revenue_data
    FROM payments p
    LEFT JOIN user_profiles up ON up.id = p.user_id
    WHERE p.league_id = p_league_id
      AND p.created_at::date = p_date
      AND p.status = 'completed';

    -- Insert or update revenue analytics
    INSERT INTO revenue_analytics (
        league_id,
        date,
        total_revenue,
        field_revenue,
        subscription_revenue,
        refunded_amount,
        transaction_count,
        avg_transaction_value,
        new_customer_revenue,
        recurring_customer_revenue
    ) VALUES (
        p_league_id,
        p_date,
        v_revenue_data.total_revenue,
        v_revenue_data.field_revenue,
        v_revenue_data.subscription_revenue,
        v_revenue_data.refunded_amount,
        v_revenue_data.transaction_count,
        v_revenue_data.avg_transaction_value,
        v_revenue_data.new_customer_revenue,
        v_revenue_data.total_revenue - v_revenue_data.new_customer_revenue
    )
    ON CONFLICT (league_id, date)
    DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        field_revenue = EXCLUDED.field_revenue,
        subscription_revenue = EXCLUDED.subscription_revenue,
        refunded_amount = EXCLUDED.refunded_amount,
        transaction_count = EXCLUDED.transaction_count,
        avg_transaction_value = EXCLUDED.avg_transaction_value,
        new_customer_revenue = EXCLUDED.new_customer_revenue,
        recurring_customer_revenue = EXCLUDED.recurring_customer_revenue,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track analytics events on reservations
CREATE OR REPLACE FUNCTION track_reservation_analytics()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO analytics_events (
            league_id,
            user_id,
            event_type,
            event_category,
            event_data
        ) VALUES (
            (SELECT league_id FROM fields WHERE id = NEW.field_id),
            NEW.user_id,
            'reservation_created',
            'booking',
            jsonb_build_object(
                'reservation_id', NEW.id,
                'field_id', NEW.field_id,
                'date', NEW.date,
                'start_time', NEW.start_time,
                'end_time', NEW.end_time
            )
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            INSERT INTO analytics_events (
                league_id,
                user_id,
                event_type,
                event_category,
                event_data
            ) VALUES (
                (SELECT league_id FROM fields WHERE id = NEW.field_id),
                NEW.user_id,
                'reservation_status_changed',
                'booking',
                jsonb_build_object(
                    'reservation_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'field_id', NEW.field_id
                )
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservation_analytics_trigger
    AFTER INSERT OR UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION track_reservation_analytics();

-- RLS Policies for analytics tables
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_utilization_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_pattern_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictive_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE demand_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view analytics for their league" ON analytics_events
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'coach')
        )
    );

CREATE POLICY "Users can insert analytics events" ON analytics_events
    FOR INSERT WITH CHECK (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid()
        )
    );

CREATE POLICY "Admins and coaches can view engagement metrics" ON user_engagement_metrics
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'coach')
        )
    );

CREATE POLICY "Admins and coaches can view utilization analytics" ON field_utilization_analytics
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'coach')
        )
    );

CREATE POLICY "Admins can view revenue analytics" ON revenue_analytics
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins and coaches can view booking patterns" ON booking_pattern_analytics
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'coach')
        )
    );

CREATE POLICY "Admins and coaches can manage custom reports" ON custom_reports
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'coach')
        )
    );

-- Create indexes for better performance
CREATE INDEX idx_analytics_events_league_created_at ON analytics_events(league_id, created_at);
CREATE INDEX idx_user_engagement_metrics_league_date ON user_engagement_metrics(league_id, date);
CREATE INDEX idx_field_utilization_analytics_league_date ON field_utilization_analytics(league_id, date);
CREATE INDEX idx_revenue_analytics_league_date ON revenue_analytics(league_id, date);