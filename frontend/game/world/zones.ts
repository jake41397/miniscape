import * as THREE from 'three';

// Interface for zone boundaries
export interface ZoneBoundary {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Interface for a game zone
export interface GameZone {
  id: string;
  name: string;
  boundaries: ZoneBoundary;
  safeZone: boolean;
  pvpEnabled: boolean;
  description: string;
  requiredLevel?: number;
  groundColor?: string;
  fogColor?: string;
  fogDensity?: number;
}

// Game zones
export const ZONES: { [key: string]: GameZone } = {
  LUMBRIDGE: {
    id: 'lumbridge',
    name: 'Lumbridge',
    boundaries: {
      minX: -100,
      maxX: 100,
      minZ: -100,
      maxZ: 100
    },
    safeZone: true,
    pvpEnabled: false,
    description: 'A peaceful starter town with basic resources.',
    groundColor: '#7CFC00', // Bright green
    fogColor: '#E6FFE6', // Light green fog
    fogDensity: 0.005
  },
  
  WILDERNESS: {
    id: 'wilderness',
    name: 'Wilderness',
    boundaries: {
      minX: 300,
      maxX: 500,
      minZ: 300,
      maxZ: 500
    },
    safeZone: false,
    pvpEnabled: true,
    description: 'A dangerous area where players can attack each other.',
    requiredLevel: 10,
    groundColor: '#8B4513', // Dark brown
    fogColor: '#614126', // Brown fog
    fogDensity: 0.02
  },
  
  BARBARIAN_VILLAGE: {
    id: 'barbarianVillage',
    name: 'Barbarian Village',
    boundaries: {
      minX: -100,
      maxX: -200,
      minZ: 100,
      maxZ: 200
    },
    safeZone: true,
    pvpEnabled: false,
    description: 'A village known for its mining resources.',
    requiredLevel: 5,
    groundColor: '#C2B280', // Sandy color
    fogColor: '#E0D8B0', // Light sand fog
    fogDensity: 0.01
  },
  
  GRAND_EXCHANGE: {
    id: 'grandExchange',
    name: 'Grand Exchange',
    boundaries: {
      minX: 100,
      maxX: 200,
      minZ: -100,
      maxZ: -200
    },
    safeZone: true,
    pvpEnabled: false,
    description: 'The main trading hub for all players.',
    groundColor: '#CCCCCC', // Gray
    fogColor: '#E6E6E6', // White fog
    fogDensity: 0.0025
  }
};

// Check which zone a position is in
export const getZoneAtPosition = (position: THREE.Vector3): GameZone | null => {
  for (const zoneKey in ZONES) {
    const zone = ZONES[zoneKey];
    const bounds = zone.boundaries;
    
    if (
      position.x >= bounds.minX && 
      position.x <= bounds.maxX && 
      position.z >= bounds.minZ && 
      position.z <= bounds.maxZ
    ) {
      return zone;
    }
  }
  
  return null; // Not in any defined zone
};

// Check if a position is in a specific zone
export const isInZone = (position: THREE.Vector3, zoneId: string): boolean => {
  const zone = ZONES[zoneId.toUpperCase()];
  if (!zone) return false;
  
  const bounds = zone.boundaries;
  return (
    position.x >= bounds.minX && 
    position.x <= bounds.maxX && 
    position.z >= bounds.minZ && 
    position.z <= bounds.maxZ
  );
};

// Check if PvP is enabled at a position
export const isPvpEnabled = (position: THREE.Vector3): boolean => {
  const zone = getZoneAtPosition(position);
  return zone ? zone.pvpEnabled : false;
};

// Check if position is in a safe zone
export const isInSafeZone = (position: THREE.Vector3): boolean => {
  const zone = getZoneAtPosition(position);
  return zone ? zone.safeZone : false;
};

// Get zone boundary as THREE.Box3 for visualization
export const getZoneBoundaryBox = (zoneId: string): THREE.Box3 | null => {
  const zone = ZONES[zoneId.toUpperCase()];
  if (!zone) return null;
  
  const bounds = zone.boundaries;
  const min = new THREE.Vector3(bounds.minX, 0, bounds.minZ);
  const max = new THREE.Vector3(bounds.maxX, 10, bounds.maxZ); // Height of 10 units
  
  return new THREE.Box3(min, max);
}; 