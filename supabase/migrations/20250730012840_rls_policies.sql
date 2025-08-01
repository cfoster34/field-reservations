-- RLS Policies for Simple Field Reservations

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is coach
CREATE OR REPLACE FUNCTION is_coach(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = user_id AND role IN ('admin', 'coach')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user belongs to league
CREATE OR REPLACE FUNCTION user_in_league(user_id UUID, league_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = user_id AND user_profiles.league_id = $2
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Leagues policies
CREATE POLICY "Leagues are viewable by everyone" ON leagues
    FOR SELECT USING (true);

CREATE POLICY "Leagues can be created by authenticated users" ON leagues
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Leagues can be updated by admins" ON leagues
    FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Leagues can be deleted by admins" ON leagues
    FOR DELETE USING (is_admin(auth.uid()));

-- User profiles policies
CREATE POLICY "User profiles are viewable by same league members" ON user_profiles
    FOR SELECT USING (
        auth.uid() = id OR
        league_id IN (
            SELECT league_id FROM user_profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile in their league" ON user_profiles
    FOR UPDATE USING (
        is_admin(auth.uid()) AND
        league_id IN (
            SELECT league_id FROM user_profiles WHERE id = auth.uid()
        )
    );

-- Teams policies
CREATE POLICY "Teams are viewable by league members" ON teams
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM user_profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Teams can be created by coaches and admins" ON teams
    FOR INSERT WITH CHECK (
        is_coach(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Teams can be updated by their coach or admin" ON teams
    FOR UPDATE USING (
        coach_id = auth.uid() OR
        (is_admin(auth.uid()) AND user_in_league(auth.uid(), league_id))
    );

CREATE POLICY "Teams can be deleted by admin" ON teams
    FOR DELETE USING (
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

-- Fields policies
CREATE POLICY "Fields are viewable by everyone" ON fields
    FOR SELECT USING (true);

CREATE POLICY "Fields can be created by admins" ON fields
    FOR INSERT WITH CHECK (
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Fields can be updated by admins" ON fields
    FOR UPDATE USING (
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Fields can be deleted by admins" ON fields
    FOR DELETE USING (
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

-- Time slots policies
CREATE POLICY "Time slots are viewable by everyone" ON time_slots
    FOR SELECT USING (true);

CREATE POLICY "Time slots can be managed by admins" ON time_slots
    FOR ALL USING (
        is_admin(auth.uid()) AND
        EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = time_slots.field_id
            AND user_in_league(auth.uid(), f.league_id)
        )
    );

-- Reservations policies
CREATE POLICY "Reservations are viewable by league members" ON reservations
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = reservations.field_id
            AND user_in_league(auth.uid(), f.league_id)
        )
    );

CREATE POLICY "Reservations can be created by approved league members" ON reservations
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
            AND is_approved = true
            AND league_id IN (
                SELECT league_id FROM fields WHERE id = reservations.field_id
            )
        )
    );

CREATE POLICY "Reservations can be updated by creator or admin" ON reservations
    FOR UPDATE USING (
        user_id = auth.uid() OR
        (is_admin(auth.uid()) AND EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = reservations.field_id
            AND user_in_league(auth.uid(), f.league_id)
        ))
    );

CREATE POLICY "Reservations can be deleted by admin" ON reservations
    FOR DELETE USING (
        is_admin(auth.uid()) AND
        EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = reservations.field_id
            AND user_in_league(auth.uid(), f.league_id)
        )
    );

-- Waitlist policies
CREATE POLICY "Waitlist entries are viewable by owner or admin" ON waitlist
    FOR SELECT USING (
        user_id = auth.uid() OR
        (is_admin(auth.uid()) AND EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = waitlist.field_id
            AND user_in_league(auth.uid(), f.league_id)
        ))
    );

CREATE POLICY "Waitlist entries can be created by approved members" ON waitlist
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
            AND is_approved = true
        )
    );

CREATE POLICY "Waitlist entries can be deleted by owner or admin" ON waitlist
    FOR DELETE USING (
        user_id = auth.uid() OR
        (is_admin(auth.uid()) AND EXISTS (
            SELECT 1 FROM fields f
            WHERE f.id = waitlist.field_id
            AND user_in_league(auth.uid(), f.league_id)
        ))
    );

-- Messages policies
CREATE POLICY "Messages are viewable by sender, recipient, or team members" ON messages
    FOR SELECT USING (
        sender_id = auth.uid() OR
        recipient_id = auth.uid() OR
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid()
            AND user_profiles.team_id = messages.team_id
        ))
    );

CREATE POLICY "Messages can be created by league members" ON messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Messages can be updated by sender" ON messages
    FOR UPDATE USING (sender_id = auth.uid());

CREATE POLICY "Messages can be deleted by sender or admin" ON messages
    FOR DELETE USING (
        sender_id = auth.uid() OR
        (is_admin(auth.uid()) AND user_in_league(auth.uid(), league_id))
    );

-- Notifications policies
CREATE POLICY "Notifications are viewable by recipient" ON notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Notifications can be created by system" ON notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Notifications can be updated by recipient" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- Payments policies
CREATE POLICY "Payments are viewable by payer or admin" ON payments
    FOR SELECT USING (
        user_id = auth.uid() OR
        (is_admin(auth.uid()) AND user_in_league(auth.uid(), league_id))
    );

CREATE POLICY "Payments can be created by authenticated users" ON payments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Payments can be updated by system" ON payments
    FOR UPDATE USING (true);

-- Analytics events policies
CREATE POLICY "Analytics can be inserted by anyone" ON analytics_events
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Analytics are viewable by admins" ON analytics_events
    FOR SELECT USING (
        is_admin(auth.uid()) AND
        (league_id IS NULL OR user_in_league(auth.uid(), league_id))
    );

-- Import/Export logs policies
CREATE POLICY "Import/export logs are viewable by admins" ON import_export_logs
    FOR SELECT USING (
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Import/export logs can be created by admins" ON import_export_logs
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        is_admin(auth.uid()) AND
        user_in_league(auth.uid(), league_id)
    );

CREATE POLICY "Import/export logs can be updated by creator" ON import_export_logs
    FOR UPDATE USING (user_id = auth.uid());

-- Grant necessary permissions to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;