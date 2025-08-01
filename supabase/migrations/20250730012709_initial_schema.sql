-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Custom types
CREATE TYPE user_role AS ENUM ('admin', 'coach', 'member');
CREATE TYPE field_status AS ENUM ('available', 'maintenance', 'inactive');
CREATE TYPE field_type AS ENUM ('soccer', 'baseball', 'football', 'basketball', 'tennis', 'multipurpose');
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'premium', 'enterprise');
CREATE TYPE message_type AS ENUM ('chat', 'announcement', 'system');
CREATE TYPE notification_type AS ENUM ('email', 'sms', 'push');

-- Leagues table
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#0284c7',
    secondary_color VARCHAR(7) DEFAULT '#075985',
    accent_color VARCHAR(7) DEFAULT '#38bdf8',
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20),
    address TEXT,
    description TEXT,
    subscription_tier subscription_tier DEFAULT 'free',
    subscription_expires_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{
        "booking_window_days": 14,
        "max_fields_per_week": 3,
        "require_approval": false,
        "allow_waitlist": true,
        "auto_approve_coaches": true,
        "enable_messaging": true,
        "enable_notifications": true
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users table (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(20),
    role user_role DEFAULT 'member',
    league_id UUID REFERENCES leagues(id) ON DELETE SET NULL,
    team_id UUID,
    is_active BOOLEAN DEFAULT true,
    is_approved BOOLEAN DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    notification_preferences JSONB DEFAULT '{
        "email": true,
        "sms": false,
        "push": true,
        "reminder_hours": 24
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    coach_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    assistant_coach_ids UUID[] DEFAULT '{}',
    logo_url TEXT,
    primary_color VARCHAR(7),
    age_group VARCHAR(50),
    division VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, name)
);

-- Add foreign key for team_id in user_profiles
ALTER TABLE user_profiles 
ADD CONSTRAINT fk_user_team 
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Fields table
CREATE TABLE fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type field_type NOT NULL,
    status field_status DEFAULT 'available',
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    description TEXT,
    amenities TEXT[],
    images TEXT[],
    capacity INTEGER,
    hourly_rate DECIMAL(10, 2),
    rules TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, name)
);

-- Time slots table (defines available booking slots)
CREATE TABLE time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_recurring BOOLEAN DEFAULT true,
    specific_date DATE,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_time_range CHECK (end_time > start_time),
    CONSTRAINT recurring_or_specific CHECK (
        (is_recurring = true AND day_of_week IS NOT NULL AND specific_date IS NULL) OR
        (is_recurring = false AND day_of_week IS NULL AND specific_date IS NOT NULL)
    )
);

-- Reservations table
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status reservation_status DEFAULT 'pending',
    purpose TEXT,
    attendees INTEGER,
    notes TEXT,
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES user_profiles(id),
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_reservation_time CHECK (end_time > start_time),
    CONSTRAINT no_past_reservations CHECK (date >= CURRENT_DATE)
);

-- Waitlist table
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    desired_date DATE NOT NULL,
    desired_start_time TIME NOT NULL,
    desired_end_time TIME NOT NULL,
    priority INTEGER DEFAULT 0,
    notified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_waitlist_time CHECK (desired_end_time > desired_start_time)
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    type message_type DEFAULT 'chat',
    subject VARCHAR(255),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    parent_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT has_recipient CHECK (recipient_id IS NOT NULL OR team_id IS NOT NULL)
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    data JSONB,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status payment_status DEFAULT 'pending',
    description TEXT,
    metadata JSONB,
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Analytics events table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Import/Export logs table
CREATE TABLE import_export_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('import', 'export')),
    source VARCHAR(50),
    file_name VARCHAR(255),
    file_url TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_log JSONB,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_user_profiles_league_id ON user_profiles(league_id);
CREATE INDEX idx_user_profiles_team_id ON user_profiles(team_id);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_teams_league_id ON teams(league_id);
CREATE INDEX idx_teams_coach_id ON teams(coach_id);
CREATE INDEX idx_fields_league_id ON fields(league_id);
CREATE INDEX idx_fields_status ON fields(status);
CREATE INDEX idx_time_slots_field_id ON time_slots(field_id);
CREATE INDEX idx_time_slots_day_of_week ON time_slots(day_of_week);
CREATE INDEX idx_time_slots_specific_date ON time_slots(specific_date);
CREATE INDEX idx_reservations_field_id ON reservations(field_id);
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_reservations_team_id ON reservations(team_id);
CREATE INDEX idx_reservations_date ON reservations(date);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_waitlist_field_id ON waitlist(field_id);
CREATE INDEX idx_waitlist_user_id ON waitlist(user_id);
CREATE INDEX idx_waitlist_desired_date ON waitlist(desired_date);
CREATE INDEX idx_messages_league_id ON messages(league_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_team_id ON messages(team_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for);
CREATE INDEX idx_notifications_is_sent ON notifications(is_sent);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_league_id ON payments(league_id);
CREATE INDEX idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
CREATE INDEX idx_analytics_events_league_id ON analytics_events(league_id);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_leagues_updated_at BEFORE UPDATE ON leagues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fields_updated_at BEFORE UPDATE ON fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to check for reservation conflicts
CREATE OR REPLACE FUNCTION check_reservation_conflict(
    p_field_id UUID,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM reservations
        WHERE field_id = p_field_id
        AND date = p_date
        AND status IN ('confirmed', 'pending')
        AND (p_exclude_id IS NULL OR id != p_exclude_id)
        AND (
            (start_time <= p_start_time AND end_time > p_start_time) OR
            (start_time < p_end_time AND end_time >= p_end_time) OR
            (start_time >= p_start_time AND end_time <= p_end_time)
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to process waitlist
CREATE OR REPLACE FUNCTION process_waitlist_for_slot(
    p_field_id UUID,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME
)
RETURNS UUID AS $$
DECLARE
    v_waitlist_entry RECORD;
    v_notification_id UUID;
BEGIN
    -- Find the highest priority waitlist entry that matches
    SELECT * INTO v_waitlist_entry
    FROM waitlist
    WHERE field_id = p_field_id
    AND desired_date = p_date
    AND desired_start_time = p_start_time
    AND desired_end_time = p_end_time
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY priority DESC, created_at ASC
    LIMIT 1;
    
    IF v_waitlist_entry.id IS NOT NULL THEN
        -- Create notification
        INSERT INTO notifications (
            user_id, type, title, content, data
        ) VALUES (
            v_waitlist_entry.user_id,
            'email',
            'Field Available!',
            'The field you were waiting for is now available.',
            jsonb_build_object(
                'field_id', p_field_id,
                'date', p_date,
                'start_time', p_start_time,
                'end_time', p_end_time
            )
        ) RETURNING id INTO v_notification_id;
        
        -- Update waitlist entry
        UPDATE waitlist
        SET notified_at = CURRENT_TIMESTAMP
        WHERE id = v_waitlist_entry.id;
        
        RETURN v_waitlist_entry.user_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create view for field availability
CREATE VIEW field_availability AS
SELECT 
    f.id as field_id,
    f.name as field_name,
    f.type as field_type,
    ts.day_of_week,
    ts.specific_date,
    ts.start_time,
    ts.end_time,
    CASE 
        WHEN ts.is_available = false THEN 'unavailable'
        WHEN EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.field_id = f.id
            AND (
                (ts.specific_date IS NOT NULL AND r.date = ts.specific_date) OR
                (ts.day_of_week IS NOT NULL AND EXTRACT(DOW FROM r.date) = ts.day_of_week)
            )
            AND r.status IN ('confirmed', 'pending')
            AND r.start_time < ts.end_time
            AND r.end_time > ts.start_time
        ) THEN 'reserved'
        ELSE 'available'
    END as status
FROM fields f
JOIN time_slots ts ON f.id = ts.field_id
WHERE f.status = 'available';

-- Create view for user reservation history
CREATE VIEW user_reservation_history AS
SELECT 
    r.id,
    r.user_id,
    u.full_name as user_name,
    r.field_id,
    f.name as field_name,
    f.type as field_type,
    r.date,
    r.start_time,
    r.end_time,
    r.status,
    r.purpose,
    r.attendees,
    r.created_at,
    r.confirmed_at,
    r.cancelled_at,
    t.name as team_name
FROM reservations r
JOIN user_profiles u ON r.user_id = u.id
JOIN fields f ON r.field_id = f.id
LEFT JOIN teams t ON r.team_id = t.id;

-- Create materialized view for analytics
CREATE MATERIALIZED VIEW field_utilization_stats AS
SELECT 
    f.id as field_id,
    f.name as field_name,
    f.type as field_type,
    DATE_TRUNC('month', r.date) as month,
    COUNT(r.id) as total_reservations,
    COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_reservations,
    COUNT(CASE WHEN r.status = 'cancelled' THEN 1 END) as cancelled_reservations,
    AVG(EXTRACT(EPOCH FROM (r.end_time - r.start_time))/3600) as avg_duration_hours,
    COUNT(DISTINCT r.user_id) as unique_users,
    COUNT(DISTINCT r.team_id) as unique_teams
FROM fields f
LEFT JOIN reservations r ON f.id = r.field_id
GROUP BY f.id, f.name, f.type, DATE_TRUNC('month', r.date);

-- Create index on materialized view
CREATE INDEX idx_field_utilization_stats_field_id ON field_utilization_stats(field_id);
CREATE INDEX idx_field_utilization_stats_month ON field_utilization_stats(month);

-- Enable Row Level Security
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_export_logs ENABLE ROW LEVEL SECURITY;