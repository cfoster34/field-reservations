-- Calendar integrations table for third-party calendar connections
CREATE TABLE IF NOT EXISTS calendar_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'outlook', 'exchange')),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    calendar_id VARCHAR(255), -- External calendar ID to sync to
    sync_enabled BOOLEAN DEFAULT true,
    sync_direction VARCHAR(20) DEFAULT 'outbound' CHECK (sync_direction IN ('outbound', 'inbound', 'bidirectional')),
    last_sync_at TIMESTAMPTZ,
    sync_settings JSONB DEFAULT '{
        "syncPastEvents": false,
        "syncFutureMonths": 6,
        "syncStatuses": ["confirmed", "pending"],
        "defaultReminders": [
            {"method": "popup", "minutes": 60},
            {"method": "email", "minutes": 1440}
        ]
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

-- Calendar webhooks table for subscription management
CREATE TABLE IF NOT EXISTS calendar_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES calendar_integrations(id) ON DELETE CASCADE,
    webhook_id VARCHAR(255) NOT NULL, -- External webhook/subscription ID
    resource_uri VARCHAR(500) NOT NULL,
    expiration_time TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Calendar sync log for tracking sync operations
CREATE TABLE IF NOT EXISTS calendar_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES calendar_integrations(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'sync')),
    external_event_id VARCHAR(255),
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    error_message TEXT,
    sync_direction VARCHAR(20) CHECK (sync_direction IN ('outbound', 'inbound')),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Shared calendar feeds table for public access
CREATE TABLE IF NOT EXISTS shared_calendar_feeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    field_id UUID REFERENCES fields(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    feed_type VARCHAR(20) NOT NULL CHECK (feed_type IN ('league', 'field', 'team', 'public')),
    token VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    require_auth BOOLEAN DEFAULT false,
    access_password VARCHAR(255), -- Optional password protection
    filter_settings JSONB DEFAULT '{
        "includeStatuses": ["confirmed", "pending"],
        "includePastEvents": false,
        "maxFutureMonths": 6
    }'::jsonb,
    is_active BOOLEAN DEFAULT true,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_feed_scope CHECK (
        (feed_type = 'league' AND league_id IS NOT NULL) OR
        (feed_type = 'field' AND field_id IS NOT NULL) OR
        (feed_type = 'team' AND team_id IS NOT NULL) OR
        (feed_type = 'public')
    )
);

-- Calendar reminders table
CREATE TABLE IF NOT EXISTS calendar_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('email', 'sms', 'push', 'webhook')),
    trigger_minutes INTEGER NOT NULL, -- Minutes before event
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enhance reservations table with calendar sync metadata
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_calendar_events JSONB DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user_id ON calendar_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_provider ON calendar_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_calendar_integrations_expires_at ON calendar_integrations(expires_at);
CREATE INDEX IF NOT EXISTS idx_calendar_webhooks_integration_id ON calendar_webhooks(integration_id);
CREATE INDEX IF NOT EXISTS idx_calendar_webhooks_webhook_id ON calendar_webhooks(webhook_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_integration_id ON calendar_sync_log(integration_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_reservation_id ON calendar_sync_log(reservation_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_created_at ON calendar_sync_log(created_at);
CREATE INDEX IF NOT EXISTS idx_shared_calendar_feeds_token ON shared_calendar_feeds(token);
CREATE INDEX IF NOT EXISTS idx_shared_calendar_feeds_league_id ON shared_calendar_feeds(league_id);
CREATE INDEX IF NOT EXISTS idx_shared_calendar_feeds_field_id ON shared_calendar_feeds(field_id);
CREATE INDEX IF NOT EXISTS idx_shared_calendar_feeds_team_id ON shared_calendar_feeds(team_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_reservation_id ON calendar_reminders(reservation_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_id ON calendar_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_scheduled_for ON calendar_reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_status ON calendar_reminders(status);

-- Apply updated_at triggers
CREATE TRIGGER update_calendar_integrations_updated_at BEFORE UPDATE ON calendar_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_webhooks_updated_at BEFORE UPDATE ON calendar_webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_calendar_feeds_updated_at BEFORE UPDATE ON shared_calendar_feeds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_reminders_updated_at BEFORE UPDATE ON calendar_reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS for all new tables
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_calendar_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for calendar_integrations
CREATE POLICY "Users can manage their own calendar integrations"
    ON calendar_integrations FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS policies for calendar_webhooks
CREATE POLICY "Users can view webhooks for their integrations"
    ON calendar_webhooks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM calendar_integrations
            WHERE id = calendar_webhooks.integration_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage webhooks"
    ON calendar_webhooks FOR ALL
    USING (true)
    WITH CHECK (true);

-- RLS policies for calendar_sync_log
CREATE POLICY "Users can view their sync logs"
    ON calendar_sync_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM calendar_integrations
            WHERE id = calendar_sync_log.integration_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "System can manage sync logs"
    ON calendar_sync_log FOR ALL
    USING (true)
    WITH CHECK (true);

-- RLS policies for shared_calendar_feeds
CREATE POLICY "Anyone can view public shared feeds"
    ON shared_calendar_feeds FOR SELECT
    USING (is_public = true AND is_active = true);

CREATE POLICY "Authenticated users can view non-public feeds"
    ON shared_calendar_feeds FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND is_active = true 
        AND (
            is_public = true OR
            created_by = auth.uid() OR
            -- Users can view feeds for their league/team/field
            (league_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE id = auth.uid() AND league_id = shared_calendar_feeds.league_id
            )) OR
            (team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM team_members 
                WHERE team_id = shared_calendar_feeds.team_id AND user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "League/field managers can create shared feeds"
    ON shared_calendar_feeds FOR INSERT
    WITH CHECK (
        auth.uid() = created_by AND
        (
            -- League feeds: user must be admin or league manager
            (feed_type = 'league' AND EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE id = auth.uid() 
                AND (role = 'admin' OR (role = 'manager' AND league_id = shared_calendar_feeds.league_id))
            )) OR
            -- Field feeds: user must be admin or field manager
            (feed_type = 'field' AND EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE id = auth.uid() 
                AND role IN ('admin', 'manager')
            )) OR
            -- Team feeds: user must be team manager/coach
            (feed_type = 'team' AND EXISTS (
                SELECT 1 FROM team_members 
                WHERE team_id = shared_calendar_feeds.team_id 
                AND user_id = auth.uid() 
                AND role IN ('manager', 'coach')
            )) OR
            -- Public feeds: admins only
            (feed_type = 'public' AND EXISTS (
                SELECT 1 FROM user_profiles 
                WHERE id = auth.uid() AND role = 'admin'
            ))
        )
    );

CREATE POLICY "Feed creators can manage their feeds"
    ON shared_calendar_feeds FOR UPDATE
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Feed creators can delete their feeds"
    ON shared_calendar_feeds FOR DELETE
    USING (auth.uid() = created_by);

-- RLS policies for calendar_reminders
CREATE POLICY "Users can manage their own reminders"
    ON calendar_reminders FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Function to generate calendar feed token
CREATE OR REPLACE FUNCTION generate_calendar_feed_token()
RETURNS VARCHAR(255) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired calendar integrations
CREATE OR REPLACE FUNCTION cleanup_expired_calendar_integrations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    -- Mark integrations as inactive if tokens expired and refresh failed
    UPDATE calendar_integrations 
    SET sync_enabled = false
    WHERE expires_at < NOW() - INTERVAL '7 days'
    AND sync_enabled = true;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log cleanup
    INSERT INTO calendar_sync_log (
        integration_id,
        operation,
        status,
        error_message,
        metadata
    )
    SELECT 
        id,
        'sync',
        'failed',
        'Integration expired and disabled',
        jsonb_build_object('cleanup_date', NOW())
    FROM calendar_integrations
    WHERE expires_at < NOW() - INTERVAL '7 days'
    AND sync_enabled = false;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to process calendar reminders
CREATE OR REPLACE FUNCTION process_calendar_reminders()
RETURNS INTEGER AS $$
DECLARE
    processed_count INTEGER := 0;
    reminder_record calendar_reminders%ROWTYPE;
BEGIN
    -- Get pending reminders that should be sent now
    FOR reminder_record IN
        SELECT * FROM calendar_reminders
        WHERE status = 'pending'
        AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT 100 -- Process in batches
    LOOP
        -- Update status to sent (actual sending handled by application layer)
        UPDATE calendar_reminders
        SET status = 'sent', sent_at = NOW()
        WHERE id = reminder_record.id;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;