-- Communication System Migration
-- Comprehensive chat, messaging, and notification system

-- Additional message types and notification categories
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'direct';
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'channel';
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'thread';
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'file';

CREATE TYPE notification_category AS ENUM (
    'reservation', 'message', 'announcement', 'system', 'payment', 'reminder'
);

CREATE TYPE channel_type AS ENUM ('public', 'private', 'team', 'direct');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read');
CREATE TYPE attachment_type AS ENUM ('image', 'document', 'video', 'audio', 'other');

-- Channels table for team messaging and group chats
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type channel_type NOT NULL DEFAULT 'public',
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    avatar_url TEXT,
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ,
    archived_by UUID REFERENCES user_profiles(id),
    settings JSONB DEFAULT '{
        "allow_members_invite": true,
        "allow_file_sharing": true,
        "retention_days": 365,
        "notifications_enabled": true
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT channel_name_unique_per_league UNIQUE(league_id, name)
);

-- Channel members table for managing access
CREATE TABLE channel_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notification_settings JSONB DEFAULT '{
        "mute": false,
        "push": true,
        "email": false
    }'::jsonb,
    is_banned BOOLEAN DEFAULT false,
    banned_at TIMESTAMPTZ,
    banned_by UUID REFERENCES user_profiles(id),
    UNIQUE(channel_id, user_id)
);

-- Enhanced messages table
DROP TABLE IF EXISTS messages CASCADE;
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES messages(id) ON DELETE CASCADE, -- For threading
    thread_id UUID REFERENCES messages(id) ON DELETE CASCADE, -- Root thread message
    type message_type DEFAULT 'direct',
    subject VARCHAR(255),
    content TEXT,
    encrypted_content TEXT, -- For end-to-end encrypted messages
    content_type VARCHAR(50) DEFAULT 'text/plain',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_announcement BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    pinned_at TIMESTAMPTZ,
    pinned_by UUID REFERENCES user_profiles(id),
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT has_destination CHECK (
        channel_id IS NOT NULL OR recipient_id IS NOT NULL
    )
);

-- Message status tracking for delivery receipts
CREATE TABLE message_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    status message_status NOT NULL DEFAULT 'sent',
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

-- Message attachments
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    type attachment_type NOT NULL,
    thumbnail_url TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Typing indicators
CREATE TABLE typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 seconds'),
    CONSTRAINT has_target CHECK (
        channel_id IS NOT NULL OR recipient_id IS NOT NULL
    )
);

-- Enhanced notifications table
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    category notification_category NOT NULL DEFAULT 'system',
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    send_attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    priority INTEGER DEFAULT 0, -- Higher numbers = higher priority
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Push notification subscriptions
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

-- Email templates
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '[]'::jsonb, -- Array of variable names
    is_system BOOLEAN DEFAULT false, -- System templates can't be deleted
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, name)
);

-- SMS templates
CREATE TABLE sms_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, name)
);

-- Notification schedules for recurring notifications
CREATE TABLE notification_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(20) CHECK (template_type IN ('email', 'sms', 'push')),
    template_id UUID, -- References email_templates or sms_templates
    cron_expression VARCHAR(100) NOT NULL,
    target_audience JSONB NOT NULL, -- Who gets the notification
    variables JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Message reactions (like, love, laugh, etc.)
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
);

-- Message mentions
CREATE TABLE message_mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

-- Offline message queue for sync
CREATE TABLE offline_message_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    message_data JSONB NOT NULL,
    sync_attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ
);

-- Message encryption keys (for end-to-end encryption)
CREATE TABLE user_encryption_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    key_type VARCHAR(20) DEFAULT 'RSA' CHECK (key_type IN ('RSA', 'ECDSA')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, key_type)
);

-- Create indexes for performance
CREATE INDEX idx_channels_league_id ON channels(league_id);
CREATE INDEX idx_channels_team_id ON channels(team_id);
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_created_by ON channels(created_by);

CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
CREATE INDEX idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX idx_channel_members_last_read_at ON channel_members(last_read_at);

CREATE INDEX idx_messages_league_id ON messages(league_id);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_parent_id ON messages(parent_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_type ON messages(type);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_is_announcement ON messages(is_announcement);
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted);

CREATE INDEX idx_message_status_message_id ON message_status(message_id);
CREATE INDEX idx_message_status_user_id ON message_status(user_id);
CREATE INDEX idx_message_status_status ON message_status(status);

CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_type ON message_attachments(type);

CREATE INDEX idx_typing_indicators_channel_id ON typing_indicators(channel_id);
CREATE INDEX idx_typing_indicators_user_id ON typing_indicators(user_id);
CREATE INDEX idx_typing_indicators_expires_at ON typing_indicators(expires_at);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_league_id ON notifications(league_id);
CREATE INDEX idx_notifications_category ON notifications(category);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for);
CREATE INDEX idx_notifications_is_sent ON notifications(is_sent);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_priority ON notifications(priority DESC);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_is_active ON push_subscriptions(is_active);

CREATE INDEX idx_email_templates_league_id ON email_templates(league_id);
CREATE INDEX idx_email_templates_name ON email_templates(name);

CREATE INDEX idx_sms_templates_league_id ON sms_templates(league_id);
CREATE INDEX idx_sms_templates_name ON sms_templates(name);

CREATE INDEX idx_notification_schedules_league_id ON notification_schedules(league_id);
CREATE INDEX idx_notification_schedules_is_active ON notification_schedules(is_active);
CREATE INDEX idx_notification_schedules_next_run_at ON notification_schedules(next_run_at);

CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);

CREATE INDEX idx_message_mentions_message_id ON message_mentions(message_id);
CREATE INDEX idx_message_mentions_user_id ON message_mentions(user_id);
CREATE INDEX idx_message_mentions_is_read ON message_mentions(is_read);

CREATE INDEX idx_offline_message_queue_user_id ON offline_message_queue(user_id);
CREATE INDEX idx_offline_message_queue_synced_at ON offline_message_queue(synced_at);

CREATE INDEX idx_user_encryption_keys_user_id ON user_encryption_keys(user_id);
CREATE INDEX idx_user_encryption_keys_is_active ON user_encryption_keys(is_active);

-- Apply updated_at triggers
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON sms_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_schedules_updated_at BEFORE UPDATE ON notification_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired typing indicators
CREATE OR REPLACE FUNCTION cleanup_expired_typing_indicators()
RETURNS void AS $$
BEGIN
    DELETE FROM typing_indicators 
    WHERE expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread message count for a user
CREATE OR REPLACE FUNCTION get_unread_message_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Count unread direct messages
    SELECT COUNT(*) INTO v_count
    FROM messages m
    WHERE m.recipient_id = p_user_id
    AND m.is_deleted = false
    AND NOT EXISTS (
        SELECT 1 FROM message_status ms
        WHERE ms.message_id = m.id
        AND ms.user_id = p_user_id
        AND ms.status = 'read'
    );
    
    -- Add unread channel messages
    v_count := v_count + (
        SELECT COALESCE(SUM(
            CASE WHEN m.created_at > cm.last_read_at THEN 1 ELSE 0 END
        ), 0)
        FROM messages m
        JOIN channel_members cm ON m.channel_id = cm.channel_id
        WHERE cm.user_id = p_user_id
        AND m.is_deleted = false
        AND m.sender_id != p_user_id
    );
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_as_read(
    p_user_id UUID,
    p_message_ids UUID[]
)
RETURNS void AS $$
BEGIN
    INSERT INTO message_status (message_id, user_id, status, timestamp)
    SELECT unnest(p_message_ids), p_user_id, 'read', CURRENT_TIMESTAMP
    ON CONFLICT (message_id, user_id) 
    DO UPDATE SET 
        status = 'read',
        timestamp = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function to update last read position in channel
CREATE OR REPLACE FUNCTION update_channel_last_read(
    p_user_id UUID,
    p_channel_id UUID,
    p_last_read_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS void AS $$
BEGIN
    UPDATE channel_members
    SET last_read_at = p_last_read_at
    WHERE user_id = p_user_id AND channel_id = p_channel_id;
END;
$$ LANGUAGE plpgsql;

-- Function to send notification
CREATE OR REPLACE FUNCTION send_notification(
    p_user_id UUID,
    p_category notification_category,
    p_type notification_type,
    p_title TEXT,
    p_content TEXT,
    p_data JSONB DEFAULT '{}',
    p_schedule_for TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id, category, type, title, content, data, scheduled_for
    ) VALUES (
        p_user_id, p_category, p_type, p_title, p_content, p_data, p_schedule_for
    ) RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on new tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Insert default email templates
INSERT INTO email_templates (name, subject, html_content, text_content, variables, is_system) VALUES
('reservation_confirmation', 'Reservation Confirmed', 
 '<h2>Your reservation has been confirmed!</h2><p>Field: {{field_name}}</p><p>Date: {{date}}</p><p>Time: {{start_time}} - {{end_time}}</p>',
 'Your reservation has been confirmed! Field: {{field_name}}, Date: {{date}}, Time: {{start_time}} - {{end_time}}',
 '["field_name", "date", "start_time", "end_time"]'::jsonb, true),
('reservation_reminder', 'Reservation Reminder', 
 '<h2>Don''t forget your upcoming reservation!</h2><p>Field: {{field_name}}</p><p>Date: {{date}}</p><p>Time: {{start_time}} - {{end_time}}</p>',
 'Don''t forget your upcoming reservation! Field: {{field_name}}, Date: {{date}}, Time: {{start_time}} - {{end_time}}',
 '["field_name", "date", "start_time", "end_time"]'::jsonb, true),
('new_message', 'New Message from {{sender_name}}', 
 '<h2>You have a new message</h2><p>From: {{sender_name}}</p><p>{{message_content}}</p>',
 'You have a new message from {{sender_name}}: {{message_content}}',
 '["sender_name", "message_content"]'::jsonb, true);

-- Insert default SMS templates
INSERT INTO sms_templates (name, content, variables, is_system) VALUES
('reservation_confirmation', 'Your reservation for {{field_name}} on {{date}} at {{start_time}} has been confirmed!', 
 '["field_name", "date", "start_time"]'::jsonb, true),
('reservation_reminder', 'Reminder: You have a reservation for {{field_name}} on {{date}} at {{start_time}}', 
 '["field_name", "date", "start_time"]'::jsonb, true),
('urgent_announcement', 'URGENT: {{message}}', 
 '["message"]'::jsonb, true);