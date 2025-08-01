-- Row Level Security Policies for Communication System

-- Channels policies
CREATE POLICY "Users can view channels they are members of"
    ON channels FOR SELECT
    USING (
        id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid()
        )
        OR type = 'public'
        OR created_by = auth.uid()
    );

CREATE POLICY "Users can create channels in their league"
    ON channels FOR INSERT
    WITH CHECK (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Channel creators and admins can update channels"
    ON channels FOR UPDATE
    USING (
        created_by = auth.uid()
        OR id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

CREATE POLICY "Channel creators and admins can delete channels"
    ON channels FOR DELETE
    USING (
        created_by = auth.uid()
        OR id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Channel members policies
CREATE POLICY "Users can view channel members for channels they belong to"
    ON channel_members FOR SELECT
    USING (
        channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Channel admins can add members"
    ON channel_members FOR INSERT
    WITH CHECK (
        channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
        OR channel_id IN (
            SELECT id FROM channels 
            WHERE created_by = auth.uid()
        )
    );

CREATE POLICY "Users can update their own membership settings"
    ON channel_members FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Channel admins can remove members"
    ON channel_members FOR DELETE
    USING (
        user_id = auth.uid() -- Users can leave themselves
        OR channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
        OR channel_id IN (
            SELECT id FROM channels 
            WHERE created_by = auth.uid()
        )
    );

-- Messages policies
CREATE POLICY "Users can view messages in channels they belong to or direct messages to them"
    ON messages FOR SELECT
    USING (
        (channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid()
        ))
        OR recipient_id = auth.uid()
        OR sender_id = auth.uid()
    );

CREATE POLICY "Users can send messages to channels they belong to or direct messages"
    ON messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND (
            (channel_id IN (
                SELECT channel_id FROM channel_members 
                WHERE user_id = auth.uid()
            ))
            OR (recipient_id IS NOT NULL AND channel_id IS NULL)
        )
    );

CREATE POLICY "Users can update their own messages"
    ON messages FOR UPDATE
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
    ON messages FOR DELETE
    USING (
        sender_id = auth.uid()
        OR channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
    );

-- Message status policies
CREATE POLICY "Users can view message status for their messages"
    ON message_status FOR SELECT
    USING (
        user_id = auth.uid()
        OR message_id IN (
            SELECT id FROM messages WHERE sender_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own message status"
    ON message_status FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own message status"
    ON message_status FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Message attachments policies
CREATE POLICY "Users can view attachments for messages they can see"
    ON message_attachments FOR SELECT
    USING (
        message_id IN (
            SELECT id FROM messages 
            WHERE (channel_id IN (
                SELECT channel_id FROM channel_members 
                WHERE user_id = auth.uid()
            ))
            OR recipient_id = auth.uid()
            OR sender_id = auth.uid()
        )
    );

CREATE POLICY "Users can add attachments to their messages"
    ON message_attachments FOR INSERT
    WITH CHECK (
        message_id IN (
            SELECT id FROM messages WHERE sender_id = auth.uid()
        )
    );

-- Typing indicators policies
CREATE POLICY "Users can view typing indicators for channels they belong to"
    ON typing_indicators FOR SELECT
    USING (
        channel_id IN (
            SELECT channel_id FROM channel_members 
            WHERE user_id = auth.uid()
        )
        OR recipient_id = auth.uid()
    );

CREATE POLICY "Users can create their own typing indicators"
    ON typing_indicators FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own typing indicators"
    ON typing_indicators FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own typing indicators"
    ON typing_indicators FOR DELETE
    USING (user_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
    ON notifications FOR INSERT
    WITH CHECK (true); -- System service will handle this

CREATE POLICY "Users can update their own notification read status"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Push subscriptions policies
CREATE POLICY "Users can manage their own push subscriptions"
    ON push_subscriptions FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Email templates policies
CREATE POLICY "Users can view templates for their league"
    ON email_templates FOR SELECT
    USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid()
        )
        OR is_system = true
    );

CREATE POLICY "Admins can manage league email templates"
    ON email_templates FOR ALL
    USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
        AND is_system = false
    )
    WITH CHECK (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
        AND is_system = false
    );

-- SMS templates policies
CREATE POLICY "Users can view SMS templates for their league"
    ON sms_templates FOR SELECT
    USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid()
        )
        OR is_system = true
    );

CREATE POLICY "Admins can manage league SMS templates"
    ON sms_templates FOR ALL
    USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
        AND is_system = false
    )
    WITH CHECK (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
        AND is_system = false
    );

-- Notification schedules policies
CREATE POLICY "Admins can manage notification schedules"
    ON notification_schedules FOR ALL
    USING (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    )
    WITH CHECK (
        league_id IN (
            SELECT league_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Message reactions policies
CREATE POLICY "Users can view reactions on messages they can see"
    ON message_reactions FOR SELECT
    USING (
        message_id IN (
            SELECT id FROM messages 
            WHERE (channel_id IN (
                SELECT channel_id FROM channel_members 
                WHERE user_id = auth.uid()
            ))
            OR recipient_id = auth.uid()
            OR sender_id = auth.uid()
        )
    );

CREATE POLICY "Users can add reactions to messages they can see"
    ON message_reactions FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND message_id IN (
            SELECT id FROM messages 
            WHERE (channel_id IN (
                SELECT channel_id FROM channel_members 
                WHERE user_id = auth.uid()
            ))
            OR recipient_id = auth.uid()
            OR sender_id = auth.uid()
        )
    );

CREATE POLICY "Users can remove their own reactions"
    ON message_reactions FOR DELETE
    USING (user_id = auth.uid());

-- Message mentions policies
CREATE POLICY "Users can view their own mentions"
    ON message_mentions FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "System can create mentions"
    ON message_mentions FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update their mention read status"
    ON message_mentions FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Offline message queue policies
CREATE POLICY "Users can manage their own offline message queue"
    ON offline_message_queue FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- User encryption keys policies
CREATE POLICY "Users can manage their own encryption keys"
    ON user_encryption_keys FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Enable real-time subscriptions for communication features
ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_members;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_status;
ALTER PUBLICATION supabase_realtime ADD TABLE typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE message_mentions;