-- MiniScape Database Schema and Data
-- This file combines all migrations for direct execution in Supabase SQL Editor

-- PART 1: Initial Schema Setup
-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Profiles table - stores user profile information
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  username VARCHAR(32) NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
);

-- Player data table - stores game state for players
CREATE TABLE IF NOT EXISTS player_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 1,
  z FLOAT NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  experience INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  inventory JSONB NOT NULL DEFAULT '[]'::JSONB,
  stats JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Resource nodes table - stores positions of harvestable resources
CREATE TABLE IF NOT EXISTS resource_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_type VARCHAR(32) NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  z FLOAT NOT NULL,
  respawn_time INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- World items table - stores items dropped in the world
CREATE TABLE IF NOT EXISTS world_items (
  id VARCHAR(64) PRIMARY KEY,
  item_type VARCHAR(32) NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  z FLOAT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- World map table - stores world map data
CREATE TABLE IF NOT EXISTS world_map (
  id SERIAL PRIMARY KEY,
  chunk_x INTEGER NOT NULL,
  chunk_z INTEGER NOT NULL,
  terrain_type VARCHAR(32) NOT NULL,
  terrain_height FLOAT NOT NULL DEFAULT 0,
  walkable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_x, chunk_z)
);

-- Migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Temporary player data table - stores game state for non-authenticated players
CREATE TABLE IF NOT EXISTS temp_player_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(64) NOT NULL UNIQUE,
  username VARCHAR(32) NOT NULL,
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 1,
  z FLOAT NOT NULL DEFAULT 0,
  inventory JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Realtime subscriptions for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Create function to set updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update the updated_at field
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_player_data_updated_at
  BEFORE UPDATE ON player_data
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Add indexes for performance
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_player_data_user_id ON player_data(user_id);
CREATE INDEX idx_resource_nodes_type ON resource_nodes(node_type);
CREATE INDEX idx_world_items_type ON world_items(item_type);
CREATE INDEX idx_world_map_chunk ON world_map(chunk_x, chunk_z);

-- Add index for session_id
CREATE INDEX idx_temp_player_data_session_id ON temp_player_data(session_id);

-- Add RLS policies for temp_player_data
ALTER TABLE temp_player_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert temp player data"
  ON temp_player_data FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read temp player data"
  ON temp_player_data FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update temp player data"
  ON temp_player_data FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete temp player data"
  ON temp_player_data FOR DELETE
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER set_temp_player_data_updated_at
  BEFORE UPDATE ON temp_player_data
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- PART 2: Seed Data

-- Add resource nodes
INSERT INTO resource_nodes (node_type, x, y, z)
VALUES 
  ('tree', 10, 0, 5),
  ('tree', -8, 0, 12),
  ('tree', 15, 0, -10),
  ('tree', -15, 0, -8),
  ('tree', 5, 0, 20),
  ('tree', -20, 0, 5),
  ('rock', 8, 0, -5),
  ('rock', -5, 0, 8),
  ('rock', 20, 0, 15),
  ('rock', -18, 0, -12),
  ('rock', 12, 0, 18),
  ('fish', 25, 0, 25),
  ('fish', -25, 0, -25),
  ('fish', 30, 0, -20),
  ('fish', -30, 0, 20)
ON CONFLICT DO NOTHING;

-- Add a few world map chunks (simplified for demo)
INSERT INTO world_map (chunk_x, chunk_z, terrain_type, terrain_height, walkable)
VALUES
  -- Center area - walkable grass
  (0, 0, 'grass', 0, true),
  (1, 0, 'grass', 0, true),
  (-1, 0, 'grass', 0, true),
  (0, 1, 'grass', 0, true),
  (0, -1, 'grass', 0, true),
  (1, 1, 'grass', 0, true),
  (1, -1, 'grass', 0, true),
  (-1, 1, 'grass', 0, true),
  (-1, -1, 'grass', 0, true),
  
  -- Edge areas - mixed terrain
  (2, 0, 'dirt', 0.2, true),
  (-2, 0, 'dirt', 0.2, true),
  (0, 2, 'dirt', 0.2, true),
  (0, -2, 'dirt', 0.2, true),
  
  -- Rocky areas
  (2, 2, 'rock', 0.5, true),
  (-2, 2, 'rock', 0.5, true),
  (2, -2, 'rock', 0.5, true),
  (-2, -2, 'rock', 0.5, true),
  
  -- Water areas
  (3, 3, 'water', 0, false),
  (-3, 3, 'water', 0, false),
  (3, -3, 'water', 0, false),
  (-3, -3, 'water', 0, false)
ON CONFLICT (chunk_x, chunk_z) DO NOTHING;

-- Create stored procedure for dropping items in the world
CREATE OR REPLACE FUNCTION drop_item_in_world(
  item_id TEXT,
  item_type TEXT,
  pos_x FLOAT,
  pos_y FLOAT,
  pos_z FLOAT
) 
RETURNS VOID AS $$
BEGIN
  INSERT INTO world_items (id, item_type, x, y, z)
  VALUES (item_id, item_type, pos_x, pos_y, pos_z);
END;
$$ LANGUAGE plpgsql;

-- Create function to handle gaining experience and leveling up
CREATE OR REPLACE FUNCTION update_player_experience(
  player_user_id UUID,
  exp_gained INTEGER
)
RETURNS JSON AS $$
DECLARE
  current_exp INTEGER;
  current_level INTEGER;
  exp_to_next_level INTEGER;
  leveled_up BOOLEAN := false;
BEGIN
  -- Get current experience and level
  SELECT experience, level INTO current_exp, current_level
  FROM player_data
  WHERE user_id = player_user_id;
  
  -- Calculate new experience
  current_exp := current_exp + exp_gained;
  
  -- Calculate experience needed for next level (simplified formula)
  exp_to_next_level := current_level * 100;
  
  -- Check if player leveled up
  WHILE current_exp >= exp_to_next_level LOOP
    current_level := current_level + 1;
    leveled_up := true;
    current_exp := current_exp - exp_to_next_level;
    exp_to_next_level := current_level * 100;
  END LOOP;
  
  -- Update player data
  UPDATE player_data
  SET 
    experience = current_exp,
    level = current_level,
    updated_at = NOW()
  WHERE user_id = player_user_id;
  
  -- Return the results
  RETURN json_build_object(
    'new_experience', current_exp, 
    'new_level', current_level, 
    'leveled_up', leveled_up
  );
END;
$$ LANGUAGE plpgsql;

-- Create a SQL execution function for migrations
CREATE OR REPLACE FUNCTION execute_query(query TEXT) 
RETURNS JSONB AS $$
BEGIN
  EXECUTE query;
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 