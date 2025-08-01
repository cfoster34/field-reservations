-- Seed data for development/demo purposes

-- Create demo league
INSERT INTO leagues (id, name, slug, contact_email, contact_phone, address, description, subscription_tier)
VALUES (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'Springfield Youth Sports League',
    'springfield-youth-sports',
    'admin@springfieldysl.com',
    '555-0123',
    '123 Main St, Springfield, IL 62701',
    'Premier youth sports league serving Springfield and surrounding areas',
    'premium'
);

-- Note: In production, user creation would happen through Supabase Auth
-- This is just for demonstration of the schema structure

-- Seed fields
INSERT INTO fields (id, league_id, name, type, status, address, latitude, longitude, description, amenities, capacity, hourly_rate, display_order)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'North Soccer Field', 'soccer', 'available', '100 Park Ave, Springfield, IL', 39.781721, -89.650148, 'Full-size soccer field with artificial turf', ARRAY['lights', 'bleachers', 'parking'], 22, 75.00, 1),
    ('550e8400-e29b-41d4-a716-446655440002', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'South Soccer Field', 'soccer', 'available', '100 Park Ave, Springfield, IL', 39.780721, -89.649148, 'Full-size soccer field with natural grass', ARRAY['lights', 'bleachers'], 22, 60.00, 2),
    ('550e8400-e29b-41d4-a716-446655440003', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'East Baseball Diamond', 'baseball', 'available', '200 Oak St, Springfield, IL', 39.783721, -89.648148, 'Regulation baseball diamond', ARRAY['lights', 'dugouts', 'scoreboard'], 18, 80.00, 3),
    ('550e8400-e29b-41d4-a716-446655440004', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'West Baseball Diamond', 'baseball', 'maintenance', '200 Oak St, Springfield, IL', 39.782721, -89.647148, 'Youth baseball field', ARRAY['dugouts'], 18, 50.00, 4),
    ('550e8400-e29b-41d4-a716-446655440005', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Indoor Basketball Court', 'basketball', 'available', '300 Elm St, Springfield, IL', 39.784721, -89.646148, 'Indoor basketball court', ARRAY['ac', 'bleachers', 'lockers'], 10, 100.00, 5);

-- Seed time slots for each field (weekday evenings and weekends)
-- North Soccer Field - Weekday evenings
INSERT INTO time_slots (field_id, day_of_week, start_time, end_time, is_recurring)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 1, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 1, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 2, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 2, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 3, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 3, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 4, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 4, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 5, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 5, '18:00', '20:00', true);

-- North Soccer Field - Weekends
INSERT INTO time_slots (field_id, day_of_week, start_time, end_time, is_recurring)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', 6, '08:00', '10:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 6, '10:00', '12:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 6, '12:00', '14:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 6, '14:00', '16:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 6, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 0, '12:00', '14:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 0, '14:00', '16:00', true),
    ('550e8400-e29b-41d4-a716-446655440001', 0, '16:00', '18:00', true);

-- South Soccer Field - Similar schedule
INSERT INTO time_slots (field_id, day_of_week, start_time, end_time, is_recurring)
SELECT 
    '550e8400-e29b-41d4-a716-446655440002',
    day_of_week,
    start_time,
    end_time,
    is_recurring
FROM time_slots 
WHERE field_id = '550e8400-e29b-41d4-a716-446655440001';

-- East Baseball Diamond - Different schedule
INSERT INTO time_slots (field_id, day_of_week, start_time, end_time, is_recurring)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440003', 1, '17:00', '19:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 2, '17:00', '19:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 3, '17:00', '19:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 4, '17:00', '19:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 5, '17:00', '19:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 6, '09:00', '11:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 6, '11:00', '13:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 6, '13:00', '15:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 6, '15:00', '17:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 0, '13:00', '15:00', true),
    ('550e8400-e29b-41d4-a716-446655440003', 0, '15:00', '17:00', true);

-- Indoor Basketball Court - Year-round availability
INSERT INTO time_slots (field_id, day_of_week, start_time, end_time, is_recurring)
VALUES 
    -- Weekdays
    ('550e8400-e29b-41d4-a716-446655440005', 1, '06:00', '08:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 1, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 1, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 1, '20:00', '22:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 2, '06:00', '08:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 2, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 2, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 2, '20:00', '22:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 3, '06:00', '08:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 3, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 3, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 3, '20:00', '22:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 4, '06:00', '08:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 4, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 4, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 4, '20:00', '22:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 5, '06:00', '08:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 5, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 5, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 5, '20:00', '22:00', true),
    -- Weekends
    ('550e8400-e29b-41d4-a716-446655440005', 6, '08:00', '10:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 6, '10:00', '12:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 6, '12:00', '14:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 6, '14:00', '16:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 6, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 6, '18:00', '20:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 0, '10:00', '12:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 0, '12:00', '14:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 0, '14:00', '16:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 0, '16:00', '18:00', true),
    ('550e8400-e29b-41d4-a716-446655440005', 0, '18:00', '20:00', true);

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS trigger AS $$
BEGIN
    INSERT INTO user_profiles (id, email, full_name, role, is_approved)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.email),
        'member',
        false
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE handle_new_user();