import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame } from '../../contexts/GameContext';
import { CombatSystem, Enemy, EnemyType, ENEMY_CONFIGS } from '../../game/systems/CombatSystem';
import { isInZone } from '../../game/world/zones';

interface EnemyManagerProps {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
}

// Enemy spawn data
interface EnemySpawnData {
  type: EnemyType;
  zoneId: string;
  count: number;
  positions?: THREE.Vector3[]; // Optional specific positions
}

// Enemy spawn configuration
const ENEMY_SPAWNS: EnemySpawnData[] = [
  // Lumbridge
  {
    type: EnemyType.RAT,
    zoneId: 'LUMBRIDGE',
    count: 5,
  },
  // Barbarian Village
  {
    type: EnemyType.BARBARIAN,
    zoneId: 'BARBARIAN_VILLAGE',
    count: 3,
  },
  // Wilderness
  {
    type: EnemyType.GOBLIN,
    zoneId: 'WILDERNESS',
    count: 8,
  },
  {
    type: EnemyType.WOLF,
    zoneId: 'WILDERNESS',
    count: 5,
  },
  {
    type: EnemyType.SKELETON,
    zoneId: 'WILDERNESS',
    count: 3,
  }
];

const EnemyManager: React.FC<EnemyManagerProps> = ({ scene, playerRef }) => {
  const { gameState } = useGame();
  const combatSystemRef = useRef<CombatSystem | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  // Initialize combat system and enemies
  useEffect(() => {
    if (initialized) return;
    
    // Create combat system
    const combatSystem = new CombatSystem(playerRef);
    combatSystemRef.current = combatSystem;
    
    // Spawn enemies
    const spawnedEnemies: Enemy[] = [];
    
    ENEMY_SPAWNS.forEach(spawnConfig => {
      const { type, zoneId, count, positions } = spawnConfig;
      
      // If specific positions are provided, use those
      if (positions && positions.length > 0) {
        positions.forEach(position => {
          const enemy = combatSystem.createEnemy(type, position, scene);
          spawnedEnemies.push(enemy);
        });
      } else {
        // Otherwise, generate random positions within the zone
        for (let i = 0; i < count; i++) {
          const position = getRandomPositionInZone(zoneId);
          if (position) {
            const enemy = combatSystem.createEnemy(type, position, scene);
            spawnedEnemies.push(enemy);
          }
        }
      }
    });
    
    setEnemies(spawnedEnemies);
    setInitialized(true);
    
  }, [scene, playerRef, initialized]);
  
  // Update combat system
  useEffect(() => {
    if (!combatSystemRef.current || !playerRef.current || !gameState.player) return;
    
    const updateCombat = (delta: number) => {
      if (!combatSystemRef.current || !playerRef.current || !gameState.player) return;
      
      const playerPosition = new THREE.Vector3(
        gameState.player.x,
        gameState.player.y,
        gameState.player.z
      );
      
      combatSystemRef.current.update(
        delta,
        playerPosition,
        gameState.player.health || 100,
        gameState.player.skills || {}
      );
      
      // Update enemy health bars
      updateEnemyHealthBars();
    };
    
    // Animation loop
    let lastTime = 0;
    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000; // Convert to seconds
      lastTime = time;
      
      updateCombat(delta);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    let animationFrameId = requestAnimationFrame(animate);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState.player, playerRef]);
  
  // Update enemy health bars
  const updateEnemyHealthBars = () => {
    enemies.forEach(enemy => {
      // Find the health bar in the enemy mesh
      enemy.mesh.traverse(child => {
        if (child instanceof THREE.Mesh && child.userData.isHealthBar) {
          // Update health bar scale based on current health
          const healthPercent = enemy.health / enemy.maxHealth;
          child.scale.x = healthPercent;
          
          // Change color based on health
          if (healthPercent < 0.3) {
            (child.material as THREE.MeshBasicMaterial).color.set(0xFF0000); // Red
          } else if (healthPercent < 0.6) {
            (child.material as THREE.MeshBasicMaterial).color.set(0xFFAA00); // Orange
          } else {
            (child.material as THREE.MeshBasicMaterial).color.set(0x00FF00); // Green
          }
        }
      });
    });
  };
  
  // Handle player clicks to target enemies
  useEffect(() => {
    if (!combatSystemRef.current) return;
    
    const handleClick = (event: MouseEvent) => {
      if (!combatSystemRef.current) return;
      
      // Raycasting for enemy selection
      // This would ideally be handled by a dedicated interaction system
      // For now, we're simulating enemy targeting
      
      console.log('Clicked on enemy');
      
      // For testing, target the first visible enemy
      const visibleEnemy = enemies.find(enemy => !enemy.isDead);
      if (visibleEnemy) {
        combatSystemRef.current.setTarget(visibleEnemy);
      }
    };
    
    // Add click listener (this would be replaced by a proper interaction system)
    document.addEventListener('click', handleClick);
    
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [enemies]);
  
  return null; // This is a controller component with no UI
};

// Utility function to get a random position within a zone
const getRandomPositionInZone = (zoneId: string): THREE.Vector3 | null => {
  // This is a simplified implementation that should be improved
  // to properly respect the zone boundaries from zones.ts
  
  // Placeholder implementation
  switch (zoneId) {
    case 'LUMBRIDGE':
      return new THREE.Vector3(
        Math.random() * 50 - 25, // -25 to 25
        0,
        Math.random() * 50 - 25 // -25 to 25
      );
    case 'BARBARIAN_VILLAGE':
      return new THREE.Vector3(
        -150 + Math.random() * 50, // -150 to -100
        0,
        150 + Math.random() * 50 // 150 to 200
      );
    case 'WILDERNESS':
      return new THREE.Vector3(
        350 + Math.random() * 100, // 350 to 450
        0,
        350 + Math.random() * 100 // 350 to 450
      );
    default:
      return null;
  }
};

export default EnemyManager; 