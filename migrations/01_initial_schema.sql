-- Create public schema tables with RLS enabled

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret-here';

-- Create tables for MiniScape game database

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

-- Add RLS policies
-- Profiles: Anyone can read, only the owner can update
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Player data: Anyone can read, only the owner can update
ALTER TABLE player_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public player data is viewable by everyone"
  ON player_data FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own player data"
  ON player_data FOR UPDATE
  USING (auth.uid() = user_id);

-- World items: Everyone can read, authenticated users can insert/delete
ALTER TABLE world_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public world items are viewable by everyone"
  ON world_items FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create world items"
  ON world_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Resource nodes: Everyone can read, only admins should update (handled in backend)
ALTER TABLE resource_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public resource nodes are viewable by everyone"
  ON resource_nodes FOR SELECT
  USING (true);

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