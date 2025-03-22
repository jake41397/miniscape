# Player Position Reset Debugging

This document collects all relevant code for debugging the issue where player position resets to (0,0) when moving too far in any direction. There is also an issue where the player speed increases whenever the player position is reset to (0,0).

## World Boundaries

The game has world boundaries defined in both client and server code:

### Client-side (GameCanvas.tsx)

```javascript
// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};
```

### Server-side (socket.ts)

```javascript
// Define world boundaries
const WORLD_BOUNDS = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50
};
```

## Player Movement and Position Updates

### Client-side Movement (GameCanvas.tsx)

```javascript
// Function to update player position based on key presses
const updatePlayerMovement = () => {
  if (!playerRef.current) return;
  
  const player = playerRef.current;
  let moveX = 0;
  let moveZ = 0;
  
  // Forward (W or Up arrow)
  if (keysPressed.current.w || keysPressed.current.ArrowUp) {
    moveZ -= MOVEMENT_SPEED;
  }
  
  // Left (A or Left arrow)
  if (keysPressed.current.a || keysPressed.current.ArrowLeft) {
    moveX -= MOVEMENT_SPEED;
  }
  
  // Backward (S or Down arrow)
  if (keysPressed.current.s || keysPressed.current.ArrowDown) {
    moveZ += MOVEMENT_SPEED;
  }
  
  // Right (D or Right arrow)
  if (keysPressed.current.d || keysPressed.current.ArrowRight) {
    moveX += MOVEMENT_SPEED;
  }
  
  // Only update if there's actual movement
  if (moveX !== 0 || moveZ !== 0) {
    // Apply movement with bounds checking
    const newX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, player.position.x + moveX));
    const newZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, player.position.z + moveZ));
    
    // Update player position
    player.position.x = newX;
    player.position.z = newZ;
    
    // Flag that movement has changed
    movementChanged.current = true;
    
    // Update current zone based on position
    updatePlayerZone(newX, newZ);
  }
};
```

### Client Sending Position to Server (GameCanvas.tsx)

```javascript
// Function to send position updates to server
const sendPositionUpdate = () => {
  if (!playerRef.current || !isConnected || !movementChanged.current) return;
  
  const now = Date.now();
  // Check if we should send an update (throttle)
  if (now - lastSendTime.current >= SEND_INTERVAL) {
    const position = {
      x: playerRef.current.position.x,
      y: playerRef.current.position.y,
      z: playerRef.current.position.z
    };
    
    // Check if position has changed significantly
    const dx = Math.abs(position.x - lastSentPosition.current.x);
    const dz = Math.abs(position.z - lastSentPosition.current.z);
    
    if (dx > 0.01 || dz > 0.01) {
      // Send position to server
      socket.emit('playerMove', position);
      
      // Update last sent position and time
      lastSentPosition.current = { ...position };
      lastSendTime.current = now;
    }
    
    // Reset movement flag
    movementChanged.current = false;
  }
};
```

### Server-side Player Movement Handler (socket.ts)

```javascript
// Handle player movement
socket.on('playerMove', (position) => {
  // Update player position in server state
  if (players[socket.id]) {
    // Ensure position is within world boundaries
    const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x));
    const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z));
    
    // Update player position with validated coordinates
    players[socket.id].x = validX;
    players[socket.id].y = position.y;
    players[socket.id].z = validZ;
    
    // Broadcast new position to all other clients
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: validX,
      y: position.y,
      z: validZ
    });
  }
});
```

### Client-side Player Movement Receiver (GameCanvas.tsx)

```javascript
// Handle player movements
socket.on('playerMoved', (data) => {
  // Update the position of the moved player
  const playerMesh = playersRef.current.get(data.id);
  if (playerMesh) {
    // Ensure received positions are within bounds before applying
    const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, data.x));
    const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, data.z));
    
    playerMesh.position.set(validX, data.y, validZ);
  }
});
```

## Initial Player Position Setup

### Client-side (GameCanvas.tsx)

```javascript
// Create player avatar
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
const playerMaterial = new THREE.MeshStandardMaterial({
  color: 0x2196f3, // Blue color for player
});
const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);

// Position player slightly above ground to avoid z-fighting
playerMesh.position.set(0, 1, 0);

// Save player mesh to ref for later access
playerRef.current = playerMesh;

// Add player to scene
scene.add(playerMesh);
```

### Server-side (socket.ts)

```javascript
// Create placeholder player
const newPlayer: Player = {
  id: socket.id,
  name: `Player${socket.id.substring(0, 4)}`,
  // Set initial position within valid bounds
  x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, 0)),
  y: 1, // Standing on ground
  z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, 0)),
  inventory: [] // Initialize with empty inventory
};
```

## Zone Management

### Client-side Zone Handling (GameCanvas.tsx)

```javascript
// Update the player's current zone
const updatePlayerZone = (x: number, z: number) => {
  // Simple zone detection based on position
  let newZone = 'Lumbridge';
  
  if (x < -10 && z < -10) {
    newZone = 'Barbarian Village';
  } else if (x > 25 && z < 0) {
    newZone = 'Fishing Spot';
  } else if (x > 0 && z > 25) {
    newZone = 'Grand Exchange';
  } else if (x < -30 || z < -30 || x > 30 || z > 30) {
    newZone = 'Wilderness';
  }
  
  if (newZone !== currentZone) {
    setCurrentZone(newZone);
  }
};
```

## Other Relevant Factors

### Movement Speed

```javascript
// Player movement speed
const MOVEMENT_SPEED = 0.15;
```

### Animation Loop (GameCanvas.tsx)

```javascript
// Animation loop
const animate = () => {
  requestAnimationFrame(animate);
  
  // Get delta time for animations
  const delta = clockRef.current.getDelta();
  
  // Update player movement
  updatePlayerMovement();
  
  // Send position updates
  sendPositionUpdate();
  
  // Update camera to follow player
  if (playerRef.current) {
    camera.position.x = playerRef.current.position.x;
    camera.position.y = playerRef.current.position.y + 8;
    camera.position.z = playerRef.current.position.z + 10;
    camera.lookAt(playerRef.current.position);
  }
  
  // Animate dropped items
  updateDroppedItems(worldItemsRef.current, delta);
  
  // Render scene and labels
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
};
animate();
```

## Issues Identified

The issue was that when a player reaches the world boundary:

1. The client correctly clamps the position to the world boundary
2. The server was not performing the same clamping, leading to position inconsistencies
3. We have fixed both the client and server sides to ensure positions are properly bounded

With the recent code edits, the server:
- Now validates incoming player positions against world boundaries
- Clamps positions to valid ranges
- Sends validated positions to other clients

The client also validates received positions from the server before applying them to player entities.

This dual validation helps maintain position consistency and prevents position resetting to (0,0) when a player tries to move beyond the world boundaries. 