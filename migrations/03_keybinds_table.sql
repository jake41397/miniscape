-- Add Keybinds Table for Player Preferences
-- This migration adds a table to store player keybind configurations

-- Create the keybinds table
CREATE TABLE IF NOT EXISTS player_keybinds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  keybinds JSONB NOT NULL DEFAULT '{
    "moveForward": {"primary": "w", "secondary": "ArrowUp", "description": "Move Forward"},
    "moveBackward": {"primary": "s", "secondary": "ArrowDown", "description": "Move Backward"},
    "moveLeft": {"primary": "a", "secondary": "ArrowLeft", "description": "Move Left"},
    "moveRight": {"primary": "d", "secondary": "ArrowRight", "description": "Move Right"},
    "jump": {"primary": " ", "secondary": "", "description": "Jump"}
  }'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Add indexes and constraints
CREATE INDEX idx_player_keybinds_user_id ON player_keybinds(user_id);

-- Add unique constraint on user_id
ALTER TABLE player_keybinds ADD CONSTRAINT unique_user_keybinds UNIQUE (user_id);

-- Add RLS policies to protect the data
ALTER TABLE player_keybinds ENABLE ROW LEVEL SECURITY;

-- Everyone can read keybinds
CREATE POLICY "Public keybinds are viewable by everyone" 
  ON player_keybinds FOR SELECT 
  USING (true);

-- Only the owner can update their keybinds
CREATE POLICY "Users can update their own keybinds" 
  ON player_keybinds FOR UPDATE 
  USING (auth.uid() = user_id);

-- Only the owner can insert their keybinds
CREATE POLICY "Users can insert their own keybinds" 
  ON player_keybinds FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Create trigger to update the updated_at field
CREATE TRIGGER set_player_keybinds_updated_at
  BEFORE UPDATE ON player_keybinds
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Create a trigger function to initialize keybinds for new users
CREATE OR REPLACE FUNCTION initialize_user_keybinds()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert default keybinds for the new user
  INSERT INTO player_keybinds (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to initialize keybinds when a new user is created
-- If auth.users doesn't exist, this trigger won't be created, but that's fine
-- as we also have the service layer fallback
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'auth' 
    AND table_name = 'users'
  ) THEN
    -- Create the trigger only if auth.users exists
    CREATE TRIGGER user_created_initialize_keybinds
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION initialize_user_keybinds();
  END IF;
END $$;

-- We'll now rely on our service layer to create keybinds for users when they save 