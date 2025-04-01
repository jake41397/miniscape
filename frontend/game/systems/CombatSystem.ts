import * as THREE from 'three';
import { Player, Item, ItemType } from '../../types/player';
import { SkillType } from '../../components/ui/SkillsPanel';
import soundManager from '../audio/soundManager';
import { getSocket } from '../network/socket';
import { isPvpEnabled } from '../world/zones';

// Combat modes
export enum CombatMode {
  ATTACK = 'attack',
  STRENGTH = 'strength',
  DEFENSE = 'defense',
}

// Enemy types
export enum EnemyType {
  GOBLIN = 'goblin',
  RAT = 'rat',
  WOLF = 'wolf',
  BARBARIAN = 'barbarian',
  SKELETON = 'skeleton',
}

// Enemy interface
export interface Enemy {
  id: string;
  type: EnemyType;
  name: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  level: number;
  health: number;
  maxHealth: number;
  damage: number;
  attackSpeed: number; // Attacks per second
  aggroRange: number;
  isAggressive: boolean;
  respawnTime: number; // Time in ms to respawn after defeat
  experienceReward: number;
  drops: { itemType: ItemType, chance: number }[];
  lastAttackTime: number;
  isDead: boolean;
}

// Enemy configurations
export const ENEMY_CONFIGS: { [key in EnemyType]: Omit<Enemy, 'id' | 'position' | 'mesh' | 'lastAttackTime' | 'isDead'> } = {
  [EnemyType.GOBLIN]: {
    type: EnemyType.GOBLIN,
    name: 'Goblin',
    level: 2,
    health: 20,
    maxHealth: 20,
    damage: 2,
    attackSpeed: 1.2,
    aggroRange: 5,
    isAggressive: true,
    respawnTime: 15000,
    experienceReward: 25,
    drops: [
      { itemType: ItemType.BRONZE_SWORD, chance: 0.05 },
    ]
  },
  [EnemyType.RAT]: {
    type: EnemyType.RAT,
    name: 'Giant Rat',
    level: 1,
    health: 10,
    maxHealth: 10,
    damage: 1,
    attackSpeed: 1.0,
    aggroRange: 4,
    isAggressive: false,
    respawnTime: 10000,
    experienceReward: 15,
    drops: []
  },
  [EnemyType.WOLF]: {
    type: EnemyType.WOLF,
    name: 'Wolf',
    level: 6,
    health: 40,
    maxHealth: 40,
    damage: 4,
    attackSpeed: 1.5,
    aggroRange: 7,
    isAggressive: true,
    respawnTime: 20000,
    experienceReward: 50,
    drops: []
  },
  [EnemyType.BARBARIAN]: {
    type: EnemyType.BARBARIAN,
    name: 'Barbarian Warrior',
    level: 10,
    health: 70,
    maxHealth: 70,
    damage: 6,
    attackSpeed: 1.3,
    aggroRange: 6,
    isAggressive: false,
    respawnTime: 30000,
    experienceReward: 80,
    drops: [
      { itemType: ItemType.IRON_SWORD, chance: 0.08 },
    ]
  },
  [EnemyType.SKELETON]: {
    type: EnemyType.SKELETON,
    name: 'Skeleton',
    level: 15,
    health: 100,
    maxHealth: 100,
    damage: 8,
    attackSpeed: 1.0,
    aggroRange: 8,
    isAggressive: true,
    respawnTime: 40000,
    experienceReward: 120,
    drops: [
      { itemType: ItemType.IRON_SWORD, chance: 0.1 },
      { itemType: ItemType.STEEL_SWORD, chance: 0.03 },
    ]
  }
};

// Combat System class
export class CombatSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private enemies: Enemy[] = [];
  private currentTarget: Enemy | null = null;
  private attackCooldown: number = 0;
  private attackCooldownMax: number = 1000; // 1 second between attacks
  private combatMode: CombatMode = CombatMode.ATTACK;
  private isInCombat: boolean = false;
  private lastDamageTime: number = 0;
  
  constructor(playerRef: React.MutableRefObject<THREE.Mesh | null>) {
    this.playerRef = playerRef;
  }
  
  // Create an enemy mesh
  public static createEnemyMesh(enemyType: EnemyType, position: THREE.Vector3): THREE.Object3D {
    // Create a group to hold the enemy and its health bar
    const group = new THREE.Group();
    group.position.copy(position);
    
    let enemyMesh: THREE.Mesh;
    
    // Create different meshes based on enemy type
    switch (enemyType) {
      case EnemyType.GOBLIN:
        // Goblin - green color, shorter and wider
        const goblinGeometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
        const goblinMaterial = new THREE.MeshStandardMaterial({ color: 0x4CAF50 });
        enemyMesh = new THREE.Mesh(goblinGeometry, goblinMaterial);
        break;
        
      case EnemyType.RAT:
        // Rat - brown color, small
        const ratGeometry = new THREE.CapsuleGeometry(0.2, 0.4, 4, 8);
        const ratMaterial = new THREE.MeshStandardMaterial({ color: 0x795548 });
        enemyMesh = new THREE.Mesh(ratGeometry, ratMaterial);
        break;
        
      case EnemyType.WOLF:
        // Wolf - grey color, medium size
        const wolfGeometry = new THREE.CapsuleGeometry(0.3, 0.7, 4, 8);
        const wolfMaterial = new THREE.MeshStandardMaterial({ color: 0x9E9E9E });
        enemyMesh = new THREE.Mesh(wolfGeometry, wolfMaterial);
        break;
        
      case EnemyType.BARBARIAN:
        // Barbarian - tan color, taller
        const barbarianGeometry = new THREE.CapsuleGeometry(0.3, 1.0, 4, 8);
        const barbarianMaterial = new THREE.MeshStandardMaterial({ color: 0xD7CCC8 });
        enemyMesh = new THREE.Mesh(barbarianGeometry, barbarianMaterial);
        break;
        
      case EnemyType.SKELETON:
        // Skeleton - white color
        const skeletonGeometry = new THREE.CapsuleGeometry(0.25, 1.0, 4, 8);
        const skeletonMaterial = new THREE.MeshStandardMaterial({ color: 0xF5F5F5 });
        enemyMesh = new THREE.Mesh(skeletonGeometry, skeletonMaterial);
        break;
        
      default:
        // Generic enemy - red capsule
        const defaultGeometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
        const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xFF5252 });
        enemyMesh = new THREE.Mesh(defaultGeometry, defaultMaterial);
    }
    
    // Position the mesh properly
    enemyMesh.position.y = 0.5; // Lift it off the ground
    group.add(enemyMesh);
    
    // Add health bar above enemy
    const healthBarWidth = 0.6;
    const healthBarGeometry = new THREE.PlaneGeometry(healthBarWidth, 0.1);
    const healthBarMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      side: THREE.DoubleSide
    });
    const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    healthBar.position.set(0, 1.5, 0); // Position above the enemy
    healthBar.rotation.x = -Math.PI / 2; // Face the health bar toward the camera
    healthBar.rotation.z = Math.PI; // Flip it correctly
    healthBar.userData.isHealthBar = true;
    group.add(healthBar);
    
    // Add enemy label with name and level
    const config = ENEMY_CONFIGS[enemyType];
    
    // Add enemy data to userData for easy access
    group.userData.type = enemyType;
    group.userData.level = config.level;
    group.userData.name = config.name;
    group.userData.isEnemy = true;
    
    return group;
  }
  
  // Create a new enemy instance
  public createEnemy(type: EnemyType, position: THREE.Vector3, scene: THREE.Scene): Enemy {
    const enemyId = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const config = ENEMY_CONFIGS[type];
    
    // Create the enemy mesh
    const enemyMesh = CombatSystem.createEnemyMesh(type, position);
    scene.add(enemyMesh);
    
    // Create the enemy instance
    const enemy: Enemy = {
      id: enemyId,
      ...config,
      position: position.clone(),
      mesh: enemyMesh,
      lastAttackTime: 0,
      isDead: false
    };
    
    // Add to list of enemies
    this.addEnemy(enemy);
    
    return enemy;
  }
  
  // Add enemy to the system
  public addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }
  
  // Remove enemy from the system
  public removeEnemy(enemyId: string): void {
    this.enemies = this.enemies.filter(enemy => enemy.id !== enemyId);
    
    // Reset target if it was the removed enemy
    if (this.currentTarget && this.currentTarget.id === enemyId) {
      this.currentTarget = null;
      this.isInCombat = false;
    }
  }
  
  // Set target for player
  public setTarget(enemy: Enemy | null): void {
    this.currentTarget = enemy;
    this.isInCombat = enemy !== null;
    
    // Reset cooldown when switching targets
    this.attackCooldown = 0;
  }
  
  // Get player's current target
  public getTarget(): Enemy | null {
    return this.currentTarget;
  }
  
  // Set combat mode (attack, strength, defense)
  public setCombatMode(mode: CombatMode): void {
    this.combatMode = mode;
  }
  
  // Get current combat mode
  public getCombatMode(): CombatMode {
    return this.combatMode;
  }
  
  // Check if player is in combat
  public getIsInCombat(): boolean {
    return this.isInCombat;
  }
  
  // Update combat logic
  public update(delta: number, playerPosition: THREE.Vector3, playerHealth: number, playerSkills: any): void {
    // Update cooldown
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    
    // Check if player has a target and is in range
    if (this.currentTarget && !this.currentTarget.isDead) {
      const distanceToTarget = playerPosition.distanceTo(this.currentTarget.position);
      
      // If target is in range and cooldown is ready, attack
      if (distanceToTarget < 2 && this.attackCooldown === 0) {
        this.attackTarget(playerSkills);
      }
    }
    
    // Check for aggressive enemies
    this.checkAggressiveEnemies(playerPosition, playerHealth, playerSkills);
    
    // Update enemy behavior
    this.updateEnemies(delta, playerPosition);
  }
  
  // Attack current target
  private attackTarget(playerSkills: any): void {
    if (!this.currentTarget || this.currentTarget.isDead || !this.playerRef.current || this.attackCooldown > 0) {
      return;
    }

    // Play attack sound
    soundManager.play('attack_swing');
    
    // Set attack cooldown (Frontend cooldown to prevent spamming events)
    this.attackCooldown = this.attackCooldownMax; 
    this.isInCombat = true;
    this.lastDamageTime = Date.now(); // Reset combat timer on attack

    // Emit attack event to server
    getSocket().then(socket => {
      if (socket && this.currentTarget) {
        console.log(`[COMBAT] Emitting attackEnemy event for target: ${this.currentTarget.id}`);
        // @ts-ignore - TODO: Add 'attackEnemy' to socket event types
        socket.emit('attackEnemy', { 
          targetId: this.currentTarget.id, 
          combatMode: this.combatMode // Send combat mode for XP distribution
        });
      } else {
        console.error('[COMBAT] Socket not available or no target to attack');
      }
    }).catch(error => {
      console.error('[COMBAT] Error getting socket:', error);
    });
  }
  
  // Check for aggressive enemies nearby
  private checkAggressiveEnemies(playerPosition: THREE.Vector3, playerHealth: number, playerSkills: any): void {
    // Only check if not already in combat
    if (this.isInCombat) return;
    
    // Check each enemy
    for (const enemy of this.enemies) {
      // Skip dead enemies or non-aggressive ones
      if (enemy.isDead || !enemy.isAggressive) continue;
      
      // Check if player is in aggro range
      const distanceToEnemy = playerPosition.distanceTo(enemy.position);
      if (distanceToEnemy <= enemy.aggroRange) {
        // Set as current target
        this.setTarget(enemy);
        break;
      }
    }
  }
  
  // Update enemy behavior
  private updateEnemies(delta: number, playerPosition: THREE.Vector3): void {
    const currentTime = Date.now();
    
    this.enemies.forEach(enemy => {
      // Skip dead enemies
      if (enemy.isDead) return;
      
      // If this enemy is the current target, it should attack the player
      if (this.currentTarget === enemy) {
        const distanceToPlayer = playerPosition.distanceTo(enemy.position);
        
        // If in attack range and attack cooldown passed
        if (distanceToPlayer < 2 && currentTime - enemy.lastAttackTime > (1000 / enemy.attackSpeed)) {
          // Update last attack time
          enemy.lastAttackTime = currentTime;
          
          // Emit player damage event - using updateHealth instead of takeDamage
          const socket = getSocket();
          if (socket) {
            socket.then(socket => {
              if (socket) {
                socket.emit('updateHealth', {
                  amount: -enemy.damage // Negative for damage
                });
              }
            });
          }
          
          // Play enemy attack sound
          soundManager.play('player_hit');
        }
      }
    });
  }
  
  // Check if PvP combat is allowed at this position
  public isPvpAllowed(position: THREE.Vector3): boolean {
    return isPvpEnabled(position);
  }
  
  // Attack another player (PvP)
  public attackPlayer(targetPlayerId: string, playerSkills: any): void {
    const player = this.playerRef.current;
    if (!player) return;
    
    // Check if PvP is allowed at this position
    if (!this.isPvpAllowed(player.position)) {
      console.log("PvP is not enabled in this area");
      return;
    }
    
    // Calculate damage based on combat mode and skill levels
    const attackLevel = playerSkills[SkillType.ATTACK]?.level || 1;
    const strengthLevel = playerSkills[SkillType.STRENGTH]?.level || 1;
    
    // Base damage calculation
    let baseDamage = 1;
    
    // Add bonus damage based on combat mode
    switch (this.combatMode) {
      case CombatMode.ATTACK:
        baseDamage = Math.max(1, Math.floor(strengthLevel / 4));
        break;
      case CombatMode.STRENGTH:
        baseDamage = Math.max(1, Math.floor(strengthLevel / 2));
        break;
      case CombatMode.DEFENSE:
        baseDamage = Math.max(1, Math.floor(strengthLevel / 3));
        break;
    }
    
    // Add small random variation
    const damage = Math.max(1, Math.floor(baseDamage * (0.8 + Math.random() * 0.4)));
    
    // Emit PvP attack event - using playerAction instead of pvpAttack
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('playerAction', {
            type: 'attack',
            targetId: targetPlayerId,
            damage: damage,
            combatMode: this.combatMode
          });
          
          // Play attack sound
          soundManager.play('player_hit');
        }
      });
    }
  }
} 