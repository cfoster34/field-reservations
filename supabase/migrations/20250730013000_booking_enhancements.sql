-- Add recurring booking support
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS recurring_id UUID;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS recurring_pattern JSONB;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rescheduled_from UUID REFERENCES reservations(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS share_token VARCHAR(255) UNIQUE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create index for recurring bookings
CREATE INDEX IF NOT EXISTS idx_reservations_recurring_id ON reservations(recurring_id);
CREATE INDEX IF NOT EXISTS idx_reservations_share_token ON reservations(share_token);

-- Booking sessions table for managing booking flow
CREATE TABLE IF NOT EXISTS booking_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    selected_slots JSONB NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Booking rules table
CREATE TABLE IF NOT EXISTS booking_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    field_id UUID REFERENCES fields(id) ON DELETE CASCADE,
    advance_booking_days INTEGER DEFAULT 14,
    max_bookings_per_week INTEGER DEFAULT 3,
    max_bookings_per_day INTEGER DEFAULT 1,
    min_booking_duration INTEGER DEFAULT 60, -- minutes
    max_booking_duration INTEGER DEFAULT 240, -- minutes
    buffer_time INTEGER DEFAULT 0, -- minutes between bookings
    allow_recurring BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT false,
    cancellation_deadline INTEGER DEFAULT 24, -- hours
    refund_policy JSONB DEFAULT '{
        "fullRefundHours": 48,
        "partialRefundHours": 24,
        "partialRefundPercentage": 50,
        "noRefundHours": 12
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_league_field_rules UNIQUE(league_id, field_id)
);

-- Reservation conflicts table for tracking conflicts
CREATE TABLE IF NOT EXISTS reservation_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    conflicting_reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    conflict_type VARCHAR(20) CHECK (conflict_type IN ('full', 'partial')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_conflict_pair UNIQUE(reservation_id, conflicting_reservation_id)
);

-- Calendar exports table
CREATE TABLE IF NOT EXISTS calendar_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    include_fields UUID[] DEFAULT '{}',
    include_teams UUID[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_sessions_user_id ON booking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_field_id ON booking_sessions(field_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_expires_at ON booking_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_booking_rules_league_id ON booking_rules(league_id);
CREATE INDEX IF NOT EXISTS idx_booking_rules_field_id ON booking_rules(field_id);
CREATE INDEX IF NOT EXISTS idx_reservation_conflicts_reservation_id ON reservation_conflicts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_calendar_exports_user_id ON calendar_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_exports_token ON calendar_exports(token);

-- Apply updated_at triggers
CREATE TRIGGER update_booking_sessions_updated_at BEFORE UPDATE ON booking_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_rules_updated_at BEFORE UPDATE ON booking_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_exports_updated_at BEFORE UPDATE ON calendar_exports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check booking rules
CREATE OR REPLACE FUNCTION check_booking_rules(
    p_user_id UUID,
    p_field_id UUID,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME
)
RETURNS TABLE(
    rule_type VARCHAR,
    passed BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_rules booking_rules;
    v_league_id UUID;
    v_booking_count INTEGER;
    v_duration_minutes INTEGER;
BEGIN
    -- Get league ID
    SELECT league_id INTO v_league_id
    FROM fields WHERE id = p_field_id;
    
    -- Get applicable rules
    SELECT * INTO v_rules
    FROM booking_rules
    WHERE league_id = v_league_id
    AND (field_id = p_field_id OR field_id IS NULL)
    ORDER BY field_id DESC NULLS LAST
    LIMIT 1;
    
    -- If no rules found, allow booking
    IF v_rules IS NULL THEN
        RETURN QUERY SELECT 'no_rules'::VARCHAR, true, 'No booking rules defined'::TEXT;
        RETURN;
    END IF;
    
    -- Check advance booking
    IF p_date > CURRENT_DATE + v_rules.advance_booking_days * INTERVAL '1 day' THEN
        RETURN QUERY SELECT 'advance_booking'::VARCHAR, false, 
            format('Cannot book more than %s days in advance', v_rules.advance_booking_days)::TEXT;
    ELSE
        RETURN QUERY SELECT 'advance_booking'::VARCHAR, true, 'Advance booking check passed'::TEXT;
    END IF;
    
    -- Check booking duration
    v_duration_minutes := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 60;
    
    IF v_duration_minutes < v_rules.min_booking_duration THEN
        RETURN QUERY SELECT 'min_duration'::VARCHAR, false,
            format('Minimum booking duration is %s minutes', v_rules.min_booking_duration)::TEXT;
    ELSIF v_duration_minutes > v_rules.max_booking_duration THEN
        RETURN QUERY SELECT 'max_duration'::VARCHAR, false,
            format('Maximum booking duration is %s minutes', v_rules.max_booking_duration)::TEXT;
    ELSE
        RETURN QUERY SELECT 'duration'::VARCHAR, true, 'Duration check passed'::TEXT;
    END IF;
    
    -- Check weekly limit
    SELECT COUNT(*) INTO v_booking_count
    FROM reservations
    WHERE user_id = p_user_id
    AND field_id = p_field_id
    AND status IN ('confirmed', 'pending')
    AND date >= date_trunc('week', p_date)
    AND date < date_trunc('week', p_date) + INTERVAL '1 week';
    
    IF v_booking_count >= v_rules.max_bookings_per_week THEN
        RETURN QUERY SELECT 'weekly_limit'::VARCHAR, false,
            format('Maximum %s bookings per week allowed', v_rules.max_bookings_per_week)::TEXT;
    ELSE
        RETURN QUERY SELECT 'weekly_limit'::VARCHAR, true, 'Weekly limit check passed'::TEXT;
    END IF;
    
    -- Check daily limit
    SELECT COUNT(*) INTO v_booking_count
    FROM reservations
    WHERE user_id = p_user_id
    AND field_id = p_field_id
    AND status IN ('confirmed', 'pending')
    AND date = p_date;
    
    IF v_booking_count >= v_rules.max_bookings_per_day THEN
        RETURN QUERY SELECT 'daily_limit'::VARCHAR, false,
            format('Maximum %s bookings per day allowed', v_rules.max_bookings_per_day)::TEXT;
    ELSE
        RETURN QUERY SELECT 'daily_limit'::VARCHAR, true, 'Daily limit check passed'::TEXT;
    END IF;
    
    -- Check buffer time
    IF v_rules.buffer_time > 0 THEN
        IF EXISTS (
            SELECT 1 FROM reservations
            WHERE field_id = p_field_id
            AND date = p_date
            AND status IN ('confirmed', 'pending')
            AND (
                (end_time + v_rules.buffer_time * INTERVAL '1 minute' > p_start_time AND end_time <= p_start_time) OR
                (start_time - v_rules.buffer_time * INTERVAL '1 minute' < p_end_time AND start_time >= p_end_time)
            )
        ) THEN
            RETURN QUERY SELECT 'buffer_time'::VARCHAR, false,
                format('Must have %s minutes buffer between bookings', v_rules.buffer_time)::TEXT;
        ELSE
            RETURN QUERY SELECT 'buffer_time'::VARCHAR, true, 'Buffer time check passed'::TEXT;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to create recurring reservations
CREATE OR REPLACE FUNCTION create_recurring_reservations(
    p_user_id UUID,
    p_field_id UUID,
    p_team_id UUID,
    p_start_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_pattern JSONB,
    p_purpose TEXT,
    p_attendees INTEGER,
    p_notes TEXT
)
RETURNS TABLE(reservation_id UUID, date DATE, success BOOLEAN, message TEXT) AS $$
DECLARE
    v_recurring_id UUID;
    v_current_date DATE;
    v_end_date DATE;
    v_occurrences INTEGER;
    v_created_count INTEGER := 0;
    v_new_reservation_id UUID;
    v_conflict_exists BOOLEAN;
BEGIN
    -- Generate recurring ID
    v_recurring_id := uuid_generate_v4();
    
    -- Parse pattern
    v_end_date := COALESCE((p_pattern->>'endDate')::DATE, p_start_date + INTERVAL '1 year');
    v_occurrences := COALESCE((p_pattern->>'occurrences')::INTEGER, 52);
    
    v_current_date := p_start_date;
    
    WHILE v_current_date <= v_end_date AND v_created_count < v_occurrences LOOP
        -- Check for conflicts
        v_conflict_exists := check_reservation_conflict(
            p_field_id,
            v_current_date,
            p_start_time,
            p_end_time
        );
        
        IF NOT v_conflict_exists THEN
            -- Create reservation
            INSERT INTO reservations (
                field_id, user_id, team_id, date, start_time, end_time,
                status, purpose, attendees, notes, recurring_id, recurring_pattern
            ) VALUES (
                p_field_id, p_user_id, p_team_id, v_current_date, p_start_time, p_end_time,
                'pending', p_purpose, p_attendees, p_notes, v_recurring_id, p_pattern
            ) RETURNING id INTO v_new_reservation_id;
            
            RETURN QUERY SELECT v_new_reservation_id, v_current_date, true, 'Created successfully'::TEXT;
            v_created_count := v_created_count + 1;
        ELSE
            RETURN QUERY SELECT NULL::UUID, v_current_date, false, 'Conflict detected'::TEXT;
        END IF;
        
        -- Calculate next date based on pattern
        CASE p_pattern->>'type'
            WHEN 'daily' THEN
                v_current_date := v_current_date + ((p_pattern->>'interval')::INTEGER * INTERVAL '1 day');
            WHEN 'weekly' THEN
                v_current_date := v_current_date + ((p_pattern->>'interval')::INTEGER * INTERVAL '1 week');
            WHEN 'monthly' THEN
                v_current_date := v_current_date + ((p_pattern->>'interval')::INTEGER * INTERVAL '1 month');
        END CASE;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS for new tables
ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_exports ENABLE ROW LEVEL SECURITY;

-- RLS policies for booking_sessions
CREATE POLICY "Users can view their own booking sessions"
    ON booking_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own booking sessions"
    ON booking_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own booking sessions"
    ON booking_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS policies for booking_rules
CREATE POLICY "Anyone can view booking rules"
    ON booking_rules FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage booking rules"
    ON booking_rules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- RLS policies for calendar_exports
CREATE POLICY "Users can manage their own calendar exports"
    ON calendar_exports FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);