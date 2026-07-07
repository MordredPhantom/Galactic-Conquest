export type PlayerColor = 
  | '#EF4444' // Red
  | '#3B82F6' // Blue
  | '#10B981' // Green
  | '#F59E0B' // Orange
  | '#8B5CF6' // Purple
  | '#EC4899' // Pink
  | '#06B6D4' // Cyan
  | '#84CC16' // Laser Lime
  | '#6366F1' // Cosmic Indigo
  | '#D946EF' // Nebula Fuchsia
  | '#EAB308' // Solar Yellow
  | '#0EA5E9' // Sky Blue
  | '#14B8A6' // Mint Teal
  | '#F43F5E' // Crimson Rose
  | '#64748B'; // Spectator Slate

export const PLAYER_COLORS: PlayerColor[] = [
  '#EF4444', // Red
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Orange
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Laser Lime
  '#6366F1', // Cosmic Indigo
  '#D946EF', // Nebula Fuchsia
  '#EAB308', // Solar Yellow
  '#0EA5E9', // Sky Blue
  '#14B8A6', // Mint Teal
  '#F43F5E', // Crimson Rose
];

export interface PlayerUpgrades {
  speed: number;       // Level 0-10
  production: number;  // Level 0-10
  defense: number;     // Level 0-10
  sensors: number;     // Level 0-10 (exploration range/node multiplier)
  capacity: number;    // Level 0-10 (increases maximum planet capacity and global cap)
  weapons: number;     // Level 0-10 (increases ship combat strength/damage, counters shields)
}

export interface PlayerResearch {
  category: 'speed' | 'production' | 'defense' | 'sensors' | 'capacity' | 'weapons';
  targetLevel: number;
  startTime: number;
  duration: number; // in milliseconds
}

export interface Player {
  id: string;
  name: string;
  emoji?: string;      // Emojis representing alien species / emblem
  empireName?: string; // Player custom empire name
  alienEyes?: string;  // Alien visual features (e.g. Mandibles, Glow Eyes)
  alienSkin?: string;  // Alien skin/hull coloration
  empireTrait?: string; // Selected starting stat upgrade/trait
  color: PlayerColor;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  isMinorFaction?: boolean; // True for slow expanding independent AI factions
  isSpectator?: boolean;   // True for spectators
  botDifficulty?: 'easy' | 'medium' | 'hard';
  isOffline?: boolean;
  credits: number;     // Used to buy upgrades
  upgradePoints: number; // Accrued through planets/nodes
  upgrades: PlayerUpgrades;
  research?: PlayerResearch | null;
  lastActive: number;
}

export type PlanetType = 
  | 'standard' 
  | 'shipyard' 
  | 'fortress' 
  | 'tech_lab'
  | 'cosmic_forge' 
  | 'oracle_temple' 
  | 'shield_generator' 
  | 'hyperdrive_station' 
  | 'aether_siphon';

export interface PlanetBuildings {
  city: { level: number };
  starport: { level: number };
  spaceWeapon: { level: number; lastFired?: number; targetPlanetId?: string };
  shield: { level: number };
}

export interface PlanetConstruction {
  buildingType: 'city' | 'starport' | 'spaceWeapon' | 'shield';
  targetLevel: number;
  startTime: number;
  duration: number; // in milliseconds
  cost: number;
}

export interface Planet {
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;        // Radius/capacity multiplier
  type: PlanetType;
  ownerId: string | null; // null for neutral
  ships: number;
  maxShips: number;
  growthRate: number;  // Ships gained per second
  defenseBonus: number; // Defense multiplier (e.g., 1.5x)
  resourceType: 'credits' | 'energy' | 'alloy' | null;
  resourceValue: number; // Production per second
  strengthGrowthRate?: number; // Neutral system growth rate
  cooldownUntil?: number; // timestamp until fleet launches are cool-down restricted
  buildings?: PlanetBuildings;
  construction?: PlanetConstruction;
  hasLaser?: boolean;
  laserLevel?: number; // 1, 2, 3
  laserLastFired?: number;
  planetBreakerUses?: number;
  laserLevel3At?: number;
  hasShield?: boolean;
  shieldActive?: boolean; // false if in cooldown after blocking
  shieldCooldownUntil?: number;
  isDestroyed?: boolean;
  lastLootedAmount?: number;
  lastLootedTime?: number;
  lastLootedIsSteal?: boolean;
}

export interface Fleet {
  id: string;
  ownerId: string;
  ownerColor: PlayerColor;
  fromPlanetId: string;
  toPlanetId: string;
  targetFleetId?: string;
  ships: number;
  speed: number;
  progress: number; // 0 to 1
  x: number;
  y: number;
  inCombat?: boolean;
  isSieging?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: PlayerColor | '#9CA3AF'; // neutral grey for system
  text: string;
  timestamp: number;
}

export interface ActiveLaserEffect {
  id: string;
  fromPlanetId: string;
  toPlanetId: string;
  firedAt: number;
  duration: number;
  type: 'standard' | 'breaker';
  color: string;
  isShieldBlocked?: boolean;
  impactDelay?: number;
  damage?: number;
  impactProcessed?: boolean;
  firingPlayerId?: string;
  fromX?: number;
  fromY?: number;
  fromSize?: number;
  toX?: number;
  toY?: number;
  toSize?: number;
}

export interface Lobby {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  players: Player[];
  planets: Planet[];
  fleets: Fleet[];
  chat: ChatMessage[];
  winnerId: string | null;
  victoryStats?: {
    winnerName: string;
    winnerColor: PlayerColor;
    duration: number;
    totalFleetsSent: number;
  };
  createdAt: number;
  mapSizeSetting: 'small' | 'medium' | 'large' | 'giant' | 'cosmic';
  mapWidth: number;
  mapHeight: number;
  minorFactionsCount?: number;
  activeLasers?: ActiveLaserEffect[];
  hazardsCount?: number;
  hazards?: SpaceHazard[];
  hyperGrowthEnabled?: boolean;
  superweaponsEnabled?: boolean;
  highYieldResources?: boolean;
}

export interface SpaceHazard {
  id: string;
  type: 'black_hole' | 'ion_storm' | 'asteroid_belt' | 'nebula';
  name: string;
  x: number;
  y: number;
  radius: number;
  effect: string;
}

// Simple structures for leaderboard persistence
export interface LeaderboardEntry {
  playerName: string;
  score: number;       // Planets captured, wins, etc.
  gamesPlayed: number;
  wins: number;
  date: string;
}

export type ClientMessage =
  | { type: 'join_lobby'; payload: { name: string; code: string; emoji?: string; empireName?: string; alienEyes?: string; alienSkin?: string; empireTrait?: string; isSpectator?: boolean } }
  | { type: 'add_bot'; payload: { difficulty: 'easy' | 'medium' | 'hard' } }
  | { type: 'remove_player'; payload: { playerId: string } }
  | { type: 'toggle_ready' }
  | { type: 'start_game' }
  | { type: 'send_chat'; payload: { text: string } }
  | { type: 'launch_fleet'; payload: { fromPlanetId: string; toPlanetId?: string; targetFleetId?: string; percent: number } }
  | { type: 'purchase_upgrade'; payload: { category: keyof PlayerUpgrades } }
  | { type: 'reconnect_lobby'; payload: { playerId: string; lobbyCode: string } }
  | { type: 'leave_lobby' }
  | { type: 'update_map_size'; payload: { size: 'small' | 'medium' | 'large' | 'giant' | 'cosmic' } }
  | { type: 'update_minor_factions'; payload: { count: number } }
  | { type: 'update_lobby_setting'; payload: { setting: 'hazardsCount' | 'hyperGrowthEnabled' | 'superweaponsEnabled' | 'highYieldResources'; value: any } }
  | { type: 'build_building'; payload: { planetId: string; buildingType: 'city' | 'starport' | 'spaceWeapon' | 'shield' } }
  | { type: 'fire_space_weapon'; payload: { fromPlanetId: string; toPlanetId: string } }
  | { type: 'build_laser'; payload: { planetId: string } }
  | { type: 'upgrade_laser'; payload: { planetId: string } }
  | { type: 'build_shield'; payload: { planetId: string } }
  | { type: 'fire_laser'; payload: { fromPlanetId: string; toPlanetId: string; laserType?: 'standard' | 'breaker' } };

export type ServerMessage =
  | { type: 'lobby_update'; payload: { lobby: Lobby } }
  | { type: 'join_success'; payload: { playerId: string; lobbyCode: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'chat_history'; payload: { chat: ChatMessage[] } }
  | { type: 'leaderboard_update'; payload: { leaderboard: LeaderboardEntry[] } }
  | { type: 'public_lobbies'; payload: { lobbies: { code: string; hostName: string; playerCount: number; status: string }[] } }
  | { type: 'reconnect_fail' };
