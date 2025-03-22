-- Seed resource nodes (similar to the ones we had in-memory)
INSERT INTO public.resource_nodes (id, node_type, x, y, z, respawn_time)
VALUES 
  -- Trees in Lumbridge area
  (uuid_generate_v4(), 'tree', 10, 1, 10, 30),
  (uuid_generate_v4(), 'tree', 15, 1, 15, 30),
  (uuid_generate_v4(), 'tree', 20, 1, 10, 30),
  
  -- Rocks in Barbarian Village
  (uuid_generate_v4(), 'rock', -20, 1, -20, 60),
  (uuid_generate_v4(), 'rock', -25, 1, -15, 60),
  
  -- Fishing spots
  (uuid_generate_v4(), 'fish', 30, 1, -30, 45)
ON CONFLICT DO NOTHING;

-- Add any other seed data here as needed 

-- Seed data for MiniScape game

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