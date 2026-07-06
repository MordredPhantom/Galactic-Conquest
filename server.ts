import express from 'express';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Lobby, Player, Planet, Fleet, ChatMessage, PlayerColor, PLAYER_COLORS, LeaderboardEntry, ClientMessage, ServerMessage, PlanetType } from './src/types';

const app = express();
const server = createHttpServer(app);
const wss = new WebSocketServer({ noServer: true });
const PORT = 3000;

// Game State Storage
const lobbies = new Map<string, Lobby>();
const activeConnections = new Map<string, { socket: WebSocket; lobbyCode: string; playerId: string }>();
const lobbyCleanupTimeouts = new Map<string, NodeJS.Timeout>();
const playerDisconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Initial Global Leaderboard Seed
let leaderboard: LeaderboardEntry[] = [
  { playerName: 'AlphaFleet', score: 1250, gamesPlayed: 15, wins: 8, date: '2026-06-30' },
  { playerName: 'NebulaConqueror', score: 980, gamesPlayed: 12, wins: 5, date: '2026-06-29' },
  { playerName: 'VoidStalker', score: 870, gamesPlayed: 10, wins: 4, date: '2026-06-29' },
  { playerName: 'NovaPrime', score: 720, gamesPlayed: 8, wins: 3, date: '2026-06-28' },
];

// Helper: Generate secure 4-letter lobby code
function generateLobbyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return lobbies.has(code) ? generateLobbyCode() : code;
}

// Helper: Get random planet name
function getRandomPlanetName(): string {
  const prefixes = ['Astra', 'Nova', 'Caelum', 'Vega', 'Zeta', 'Orion', 'Sirius', 'Krypton', 'Gorgon', 'Polaris', 'Zephyr', 'Helios', 'Titan', 'Apex', 'Epsilon'];
  const suffixes = ['Prime', 'Minor', 'IX', 'Theta', 'V', 'Alpha', 'Nexus', 'Garrison', 'Outpost', 'Haven', 'Reach', 'Core', 'Forge'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

// Helper: Damped combat effectiveness for fleets exceeding 100 ships (prevents snowballing)
function getEffectiveCombatShips(ships: number): number {
  if (ships <= 100) return ships;
  return 100 + (ships - 100) * 0.35; // reduces effectiveness of ships above 100 by 65%
}

// Generate Planet Map strategically
function generatePlanetMap(players: Player[], mapWidth = 850, mapHeight = 550, mapSizeSetting: 'small' | 'medium' | 'large' | 'giant' | 'cosmic' = 'small'): Planet[] {
  const planets: Planet[] = [];
  const center = { x: mapWidth / 2, y: mapHeight / 2 };

  // 1. Spawning home sectors symmetrically around a circle (only major players)
  const majorPlayers = players.filter((p) => !p.isMinorFaction && !p.isSpectator);
  const numPlayers = majorPlayers.length;
  const spawnRadius = 
    mapSizeSetting === 'small' ? 220 : 
    mapSizeSetting === 'medium' ? 300 : 
    mapSizeSetting === 'large' ? 400 : 
    mapSizeSetting === 'giant' ? 550 : 750; // Distance from center for home planets

  majorPlayers.forEach((player, idx) => {
    const angle = (idx * 2 * Math.PI) / numPlayers - Math.PI / 2;
    const x = Math.round(center.x + spawnRadius * Math.cos(angle));
    const y = Math.round(center.y + spawnRadius * Math.sin(angle));

    // Home Planet
    const homePlanet: Planet = {
      id: `home-${player.id}`,
      name: player.empireName ? `${player.empireName.slice(0, 12)}` : `${player.name.slice(0, 8)} Prime`,
      x,
      y,
      size: 45, // Large size
      type: 'standard',
      ownerId: player.id,
      ships: 50, // Starting fleet
      maxShips: 300,
      growthRate: 1.5, // High growth
      defenseBonus: 1.1,
      resourceType: 'alloy',
      resourceValue: 5,
      buildings: {
        city: { level: 0 },
        starport: { level: 0 },
        spaceWeapon: { level: 0 },
        shield: { level: 0 }
      }
    };
    planets.push(homePlanet);
  });

  // 2. Spawn 5 different options of interesting middle planets based on map size setting
  const numSpecial = 
    mapSizeSetting === 'small' ? 2 : 
    mapSizeSetting === 'medium' ? 3 : 
    mapSizeSetting === 'large' ? 4 : 5;
  const specialRadius = 
    mapSizeSetting === 'small' ? 110 : 
    mapSizeSetting === 'medium' ? 150 : 
    mapSizeSetting === 'large' ? 200 : 
    mapSizeSetting === 'giant' ? 280 : 380;
  const specialTypesList: PlanetType[] = ['cosmic_forge', 'oracle_temple', 'shield_generator', 'hyperdrive_station', 'aether_siphon'];
  
  // Select distinct special types randomly
  const chosenSpecialTypes = [...specialTypesList].sort(() => Math.random() - 0.5).slice(0, numSpecial);

  chosenSpecialTypes.forEach((type, idx) => {
    const angle = (idx * 2 * Math.PI) / numSpecial - Math.PI / 2;
    const x = Math.round(center.x + specialRadius * Math.cos(angle));
    const y = Math.round(center.y + specialRadius * Math.sin(angle));

    const names = {
      cosmic_forge: 'Cosmic Forge IX',
      oracle_temple: 'Oracle Temple Theta',
      shield_generator: 'Shield Generator Core',
      hyperdrive_station: 'Hyperdrive Station Alpha',
      aether_siphon: 'Aether Siphon Prime'
    };

    const specialPlanet: Planet = {
      id: `special-mid-${idx}-${Date.now()}`,
      name: names[type as keyof typeof names] || 'Galactic Nexus',
      x,
      y,
      size: 48,
      type,
      ownerId: null,
      ships: 35, // Needs a solid force to conquer
      maxShips: 180,
      growthRate: 0.3,
      strengthGrowthRate: 0.12,
      defenseBonus: 1.15,
      resourceType: type === 'aether_siphon' ? 'credits' : 'energy',
      resourceValue: type === 'aether_siphon' ? 10 : 4,
      buildings: {
        city: { level: 0 },
        starport: { level: 0 },
        spaceWeapon: { level: 0 },
        shield: { level: 0 }
      }
    };
    planets.push(specialPlanet);
  });

  // 3. Generate intermediate planets
  const numNeutral = 
    mapSizeSetting === 'small' ? 12 + Math.floor(Math.random() * 5) : 
    mapSizeSetting === 'medium' ? 18 + Math.floor(Math.random() * 5) : 
    mapSizeSetting === 'large' ? 25 + Math.floor(Math.random() * 6) : 
    mapSizeSetting === 'giant' ? 36 + Math.floor(Math.random() * 8) : 
    55 + Math.floor(Math.random() * 12);

  const minDistance = 
    mapSizeSetting === 'small' ? 95 : 
    mapSizeSetting === 'medium' ? 115 : 
    mapSizeSetting === 'large' ? 130 : 
    mapSizeSetting === 'giant' ? 140 : 155;

  const planetTypes: ('standard' | 'shipyard' | 'fortress' | 'tech_lab')[] = [
    'standard', 'standard', 'shipyard', 'fortress', 'tech_lab'
  ];

  const minorFactionPlayers = players.filter((p) => p.isMinorFaction);

  for (let i = 0; i < numNeutral; i++) {
    // Generate coordinate checking for overlaps
    let x = 0;
    let y = 0;
    let attempts = 0;
    let tooClose = true;

    while (tooClose && attempts < 100) {
      x = 80 + Math.floor(Math.random() * (mapWidth - 160));
      y = 80 + Math.floor(Math.random() * (mapHeight - 160));
      tooClose = false;

      // Check distance from all existing planets (keep min distance based on size)
      for (const p of planets) {
        const dx = p.x - x;
        const dy = p.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          tooClose = true;
          break;
        }
      }
      attempts++;
    }

    const type = planetTypes[Math.floor(Math.random() * planetTypes.length)];
    const size = 25 + Math.floor(Math.random() * 20); // sizes 25 to 45
    let maxShips = size * 3;
    let growthRate = size * 0.025;
    let defenseBonus = 1.0;
    let resourceType: 'credits' | 'energy' | 'alloy' | null = null;
    let resourceValue = 0;

    if (type === 'shipyard') {
      growthRate *= 1.8;
      maxShips *= 1.4;
    } else if (type === 'fortress') {
      defenseBonus = 1.35;
    } else if (type === 'tech_lab') {
      resourceType = 'credits';
      resourceValue = 4;
    }

    // Assign some resource types dynamically
    if (!resourceType) {
      const r = Math.random();
      if (r < 0.3) {
        resourceType = 'credits';
        resourceValue = Math.floor(size / 10);
      } else if (r < 0.6) {
        resourceType = 'alloy';
        resourceValue = Math.floor(size / 12) + 1;
      } else {
        resourceType = 'energy';
        resourceValue = Math.floor(size / 8) + 1;
      }
    }

    // Assign minor factions to some neutral systems
    const minorOwner = i < minorFactionPlayers.length ? minorFactionPlayers[i] : null;
    const planetName = minorOwner ? `${minorOwner.name} Hub` : getRandomPlanetName();
    const ownerId = minorOwner ? minorOwner.id : null;
    const startingShips = minorOwner ? 20 : (5 + Math.floor(Math.random() * 20)); // Weaker starting fleet (20 vs 35)

    let finalMaxShips = Math.round(maxShips);
    let finalGrowthRate = parseFloat(growthRate.toFixed(2));
    if (minorOwner) {
      finalMaxShips = Math.round(maxShips * 0.75); // 25% lower maximum ship capacity
      finalGrowthRate = parseFloat((growthRate * 0.75).toFixed(2)); // 25% slower ship growth
    }

    planets.push({
      id: `neutral-${i}`,
      name: planetName,
      x,
      y,
      size,
      type,
      ownerId,
      ships: startingShips,
      maxShips: finalMaxShips,
      growthRate: finalGrowthRate,
      strengthGrowthRate: parseFloat((0.05 + Math.random() * 0.1).toFixed(2)), // Never faster than players
      defenseBonus,
      resourceType,
      resourceValue,
      buildings: {
        city: { level: 0 },
        starport: { level: 0 },
        spaceWeapon: { level: 0 },
        shield: { level: 0 }
      }
    });
  }

  return planets;
}

// Broadcast to a specific lobby
function broadcastToLobby(code: string, message: ServerMessage) {
  const lobby = lobbies.get(code);
  if (!lobby) return;

  const dataStr = JSON.stringify(message);
  activeConnections.forEach((conn, id) => {
    if (conn.lobbyCode === code && conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(dataStr);
    }
  });
}

// Add system message to chat
function addSystemMessage(lobby: Lobby, text: string) {
  const sysMsg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random()}`,
    senderId: 'system',
    senderName: 'SYSTEM',
    senderColor: '#9CA3AF',
    text,
    timestamp: Date.now(),
  };
  lobby.chat.push(sysMsg);
  if (lobby.chat.length > 50) lobby.chat.shift();
}

// Combat system & fleet movement simulation tick (200ms)
setInterval(() => {
  lobbies.forEach((lobby, code) => {
    if (lobby.status !== 'playing') return;

    let stateChanged = false;

    // Clean up expired laser effects
    if (lobby.activeLasers && lobby.activeLasers.length > 0) {
      const now = Date.now();
      const prevLen = lobby.activeLasers.length;
      lobby.activeLasers = lobby.activeLasers.filter((eff) => now - eff.firedAt < eff.duration);
      if (lobby.activeLasers.length !== prevLen) {
        stateChanged = true;
      }
    }

    // 1.0. Process building construction progress
    lobby.planets.forEach((planet) => {
      if (planet.construction) {
        const elapsed = Date.now() - planet.construction.startTime;
        if (elapsed >= planet.construction.duration) {
          const { buildingType, targetLevel } = planet.construction;
          
          if (!planet.buildings) {
            planet.buildings = { city: { level: 0 }, starport: { level: 0 }, spaceWeapon: { level: 0 }, shield: { level: 0 } };
          }
          
          // Apply new building level
          planet.buildings[buildingType as keyof typeof planet.buildings] = { level: targetLevel };
          
          if (buildingType === 'starport') {
            // Starport expands local storage capacity
            planet.maxShips = Math.round((planet.maxShips / (1 + (targetLevel - 1) * 0.5)) * (1 + targetLevel * 0.5));
          }
          
          addSystemMessage(lobby, `🏢 Construction Complete! Planet ${planet.name} upgraded its ${buildingType.toUpperCase()} to Level ${targetLevel}!`);
          planet.construction = undefined;
          stateChanged = true;
        }
      }
    });

    // 1.0b. Process player technology research progress
    lobby.players.forEach((player) => {
      if (player.research) {
        const elapsed = Date.now() - player.research.startTime;
        if (elapsed >= player.research.duration) {
          const { category, targetLevel } = player.research;
          player.upgrades[category] = targetLevel;
          addSystemMessage(lobby, `🔬 RESEARCH COMPLETE: ${player.emoji || '👽'} Commander ${player.name} finished researching ${category.toUpperCase()} Level ${targetLevel}!`);
          player.research = null;
          stateChanged = true;
        }
      }
    });

    // 1.1. Calculate total ships and global ship caps for each active player in this lobby
    const playerShipStats = new Map<string, { total: number; cap: number }>();
    lobby.players.forEach((p) => {
      const capLvl = p.upgrades.capacity || 0;
      const planetCount = lobby.planets.filter((pl) => pl.ownerId === p.id && !pl.isDestroyed).length;
      const cap = 1000 + capLvl * 500 + planetCount * 100; // Base is 1000, +500 per level of research, +100 per planet

      let total = 0;
      lobby.planets.forEach((pl) => {
        if (pl.ownerId === p.id) {
          total += pl.ships;
        }
      });
      lobby.fleets.forEach((fl) => {
        if (fl.ownerId === p.id) {
          total += fl.ships;
        }
      });

      playerShipStats.set(p.id, { total, cap });
    });

    // 1. Grow ships and award resources to players/neutrals
    lobby.planets.forEach((planet) => {
      // Check if this planet is currently in an active battle (being sieged by an enemy fleet)
      const isBeingSieged = lobby.fleets.some(
        (f) => f.toPlanetId === planet.id && f.isSieging && f.ownerId !== planet.ownerId
      );

      if (planet.ownerId) {
        const owner = lobby.players.find((p) => p.id === planet.ownerId);
        if (owner) {
          // Player/Bot planet growth
          // Growth boost from "production" upgrade (+15% per level)
          const productionUpgrade = owner.upgrades.production;
          let productionMult = 1 + productionUpgrade * 0.15;
          const currentGrowth = planet.growthRate * productionMult;
          
          // SPECIAL MIDDLE PLANET BONUS: Cosmic Forge IX (+25% ship production on all owner's planets)
          let ownsCosmicForge = false;
          lobby.planets.forEach((pl) => {
            if (pl.ownerId === owner.id && pl.type === 'cosmic_forge') {
              ownsCosmicForge = true;
            }
          });
          if (ownsCosmicForge) {
            productionMult += 0.25;
          }
          const finalGrowth = planet.growthRate * productionMult;

          const stats = playerShipStats.get(owner.id) || { total: 0, cap: 1000 };

          const capacityLvl = owner.upgrades.capacity || 0;
          const localMaxBonus = 1 + capacityLvl * 0.15; // +15% local capacity per research level
          const effectivePlanetMaxShips = Math.round(planet.maxShips * localMaxBonus);

          // Stop ship production if under active siege battle OR if over global ship cap
          if (!isBeingSieged && stats.total < stats.cap && planet.ships < effectivePlanetMaxShips) {
            planet.ships = Math.min(effectivePlanetMaxShips, planet.ships + (finalGrowth * 0.2));
            stateChanged = true;
          }

          // Resource accumulation (credits still accumulate, but maybe at same rate)
          // Credits accumulation (+15% resource gain per "sensors" upgrade level)
          // Every owned planet generates a baseline passive income of 1.2 credits/sec so upgrades are achievable!
          const sensorsUpgrade = owner.upgrades.sensors;
          let economyMult = 1 + sensorsUpgrade * 0.15;
          const baseResourceGain = planet.resourceType === 'credits' ? (planet.resourceValue || 4) : 1.2;
          const isMinorOwner = owner.isMinorFaction;
          const resourceSlowdown = isMinorOwner ? 0.5 : 1.0; // Minor factions accumulate resources 50% slower
          let resourceGain = baseResourceGain * economyMult * 0.2 * resourceSlowdown;

          // SPECIAL MIDDLE PLANET BONUS: Oracle Temple Theta (+4 passive credits / sec)
          let ownsOracleTemple = false;
          lobby.planets.forEach((pl) => {
            if (pl.ownerId === owner.id && pl.type === 'oracle_temple') {
              ownsOracleTemple = true;
            }
          });
          if (ownsOracleTemple) {
            resourceGain += 0.8; // +4 credits per second (0.8 per 200ms tick)
          }

          // SPECIAL MIDDLE PLANET BONUS: Aether Siphon Prime (+3 passive credits / sec)
          let ownsAetherSiphon = false;
          lobby.planets.forEach((pl) => {
            if (pl.ownerId === owner.id && pl.type === 'aether_siphon') {
              ownsAetherSiphon = true;
            }
          });
          if (ownsAetherSiphon) {
            resourceGain += 0.6; // +3 credits per second
          }
          
          owner.credits += resourceGain;
          
          // Gradually award upgrade points
          let upGain = 0.05 * 0.2 * resourceSlowdown;
          if (ownsOracleTemple) {
            upGain += 0.01; // extra upgrade points speed
          }
          owner.upgradePoints += upGain;
          stateChanged = true;
        }
      } else {
        // Neutral systems slowly grow their strength
        // Grow ships up to max capacity, but very slowly
        const growth = planet.strengthGrowthRate || 0.1;
        if (!isBeingSieged && planet.ships < planet.maxShips) {
          planet.ships = Math.min(planet.maxShips, planet.ships + (growth * 0.2));
          stateChanged = true;
        }
      }
    });

    // Reset combat and siege statuses at start of tick so surviving fleets can resume moving
    lobby.fleets.forEach((f) => {
      f.inCombat = false;
      f.isSieging = false;
    });

    // 1.5. Calculate mid-air battles first
    for (let i = 0; i < lobby.fleets.length; i++) {
      for (let j = i + 1; j < lobby.fleets.length; j++) {
        const f1 = lobby.fleets[i];
        const f2 = lobby.fleets[j];
        if (f1.ownerId !== f2.ownerId && f1.progress < 1.0 && f2.progress < 1.0) {
          const dx = f1.x - f2.x;
          const dy = f1.y - f2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 28) { // Increased contact range to ensure high-speed fleets collide reliably
            f1.inCombat = true;
            f2.inCombat = true;
            
            // Damage each other (ticks every 200ms) - scaled down slightly for longer battles
            const effectiveShips1 = getEffectiveCombatShips(f1.ships);
            const effectiveShips2 = getEffectiveCombatShips(f2.ships);
            const owner1 = lobby.players.find((p) => p.id === f1.ownerId);
            const owner2 = lobby.players.find((p) => p.id === f2.ownerId);
            const weaponsMult1 = owner1 ? (1 + (owner1.upgrades.weapons || 0) * 0.1) : 1.0;
            const weaponsMult2 = owner2 ? (1 + (owner2.upgrades.weapons || 0) * 0.1) : 1.0;
            const dmgRate1 = (0.05 + effectiveShips2 * 0.004) * 2 * weaponsMult2;
            const dmgRate2 = (0.05 + effectiveShips1 * 0.004) * 2 * weaponsMult1;
            
            f1.ships = Math.max(0, f1.ships - dmgRate1);
            f2.ships = Math.max(0, f2.ships - dmgRate2);
            stateChanged = true;
          }
        } else if (f1.ownerId === f2.ownerId && f1.progress < 1.0 && f2.progress < 1.0) {
          const dx = f1.x - f2.x;
          const dy = f1.y - f2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 15 && (f1.targetFleetId === f2.id || f2.targetFleetId === f1.id)) {
            // Merge friendly fleets!
            f1.ships += f2.ships;
            f2.ships = 0; // will be cleaned up in movement check immediately below
            stateChanged = true;
          }
        }
      }
    }

    // 2. Move fleets or process siege
    const fleetsToRemove = new Set<string>();

    lobby.fleets.forEach((fleet) => {
      if (fleet.ships <= 0) {
        fleetsToRemove.add(fleet.id);
        return;
      }

      const fromPlanet = lobby.planets.find((p) => p.id === fleet.fromPlanetId);
      const toPlanet = lobby.planets.find((p) => p.id === fleet.toPlanetId);

      if (fromPlanet && toPlanet) {
        // If they are in mid-air combat, they don't move
        if (fleet.inCombat) {
          stateChanged = true;
          return;
        }

        // Move fleet if not arrived
        if (fleet.progress < 1.0) {
          const owner = lobby.players.find((p) => p.id === fleet.ownerId);
          const speedLevel = owner ? owner.upgrades.speed : 0;
          let speedMult = 1 + speedLevel * 0.20;

          // SPECIAL MIDDLE PLANET BONUS: Hyperdrive Station Alpha (+25% travel speed)
          if (owner) {
            let ownsHyperdrive = false;
            lobby.planets.forEach((pl) => {
              if (pl.ownerId === owner.id && pl.type === 'hyperdrive_station') {
                ownsHyperdrive = true;
              }
            });
            if (ownsHyperdrive) {
              speedMult += 0.25;
            }
          }

          // Regenerative Swarm: fleets in deep space and not in combat regenerate ships
          if (owner && owner.empireTrait === 'nanites' && !fleet.inCombat) {
            fleet.ships += 0.30; // +1.5 ships per second (0.30 per 200ms tick)
            stateChanged = true;
          }

          // Target selection: standard planet or dynamic chased fleet
          let targetX = toPlanet.x;
          let targetY = toPlanet.y;
          let targetFleet: Fleet | undefined;

          if (fleet.targetFleetId) {
            targetFleet = lobby.fleets.find((f) => f.id === fleet.targetFleetId);
            if (targetFleet) {
              targetX = targetFleet.x;
              targetY = targetFleet.y;
              fleet.toPlanetId = targetFleet.toPlanetId;
            } else {
              fleet.targetFleetId = undefined; // Target lost, proceed to the last synced planet
            }
          }

          const dx = targetX - fleet.x;
          const dy = targetY - fleet.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 0) {
            const step = 1.8 * speedMult;
            if (step >= distance) {
              fleet.x = targetX;
              fleet.y = targetY;
              fleet.progress = 1.0;
            } else {
              fleet.x += (dx / distance) * step;
              fleet.y += (dy / distance) * step;

              // Maintain accurate progress estimation
              const routeDx = toPlanet.x - fromPlanet.x;
              const routeDy = toPlanet.y - fromPlanet.y;
              const totalRouteDist = Math.sqrt(routeDx * routeDx + routeDy * routeDy) || 1;
              const currDistFromStart = Math.sqrt((fleet.x - fromPlanet.x) ** 2 + (fleet.y - fromPlanet.y) ** 2);
              fleet.progress = Math.min(0.99, currDistFromStart / totalRouteDist);
            }
            stateChanged = true;
          }
        }

        // Arrival or Siege
        if (fleet.progress >= 1.0) {
          if (toPlanet.ownerId === fleet.ownerId) {
            // Friendly arrival: instantly merge
            toPlanet.ships += fleet.ships;
            fleetsToRemove.add(fleet.id);
            stateChanged = true;
          } else {
            // Siege combat!
            fleet.isSieging = true;
            
            const targetOwner = lobby.players.find((p) => p.id === toPlanet.ownerId);
            const fleetOwner = lobby.players.find((p) => p.id === fleet.ownerId);
            
            // Defense bonus modifiers
            let targetDefenseBonus = toPlanet.defenseBonus || 1.0;
            if (targetOwner) {
              let defenseMult = 1 + targetOwner.upgrades.defense * 0.1;
              targetDefenseBonus *= defenseMult;

              // SPECIAL MIDDLE PLANET BONUS: Shield Generator Core (+10% planetary shield defense multiplier)
              let ownsShieldGen = false;
              lobby.planets.forEach((pl) => {
                if (pl.ownerId === targetOwner.id && pl.type === 'shield_generator') {
                  ownsShieldGen = true;
                }
              });
              if (ownsShieldGen) {
                targetDefenseBonus *= 1.10;
              }
            }

            // Deflector Shield Defense Bonus counter-balanced by Attacker Weapons Research
            if (toPlanet.hasShield && toPlanet.shieldActive) {
              const weaponLvl = fleetOwner ? (fleetOwner.upgrades.weapons || 0) : 0;
              const shieldMult = Math.max(1.0, 1.5 - weaponLvl * 0.05);
              targetDefenseBonus *= shieldMult;
            } else {
              // Neutral planet. If attacker has vanguard, bypass defense bonus!
              if (fleetOwner && fleetOwner.empireTrait === 'vanguard') {
                targetDefenseBonus = 1.0;
              }
            }

            // Attacking damage to planet (scaled down slightly for longer battles)
            const effectiveShips = getEffectiveCombatShips(fleet.ships);
            const weaponsMult = fleetOwner ? (1 + (fleetOwner.upgrades.weapons || 0) * 0.1) : 1.0;
            const attackerDmg = (0.05 + effectiveShips * 0.004) * 2 * weaponsMult;
            
            // Defending damage to fleet (scaled down slightly for longer battles)
            const defenderDmg = (0.05 + toPlanet.ships * 0.004) * targetDefenseBonus * 2;

            // Reduce ships (not lower than 0)
            const resolvedAttackerDmg = attackerDmg / targetDefenseBonus;
            toPlanet.ships = Math.max(0, toPlanet.ships - resolvedAttackerDmg);
            fleet.ships = Math.max(0, fleet.ships - defenderDmg);
            stateChanged = true;

            if (toPlanet.ships <= 0) {
              // Captured!
              const formerOwnerName = targetOwner ? targetOwner.name : 'Neutrals';
              
              // 1. Calculate looted credits before updating ownerId
              let lootedAmount = 0;
              let isPlayerSteal = false;
              if (!targetOwner) {
                // Securing neutral planet: Set amount based on planet size
                lootedAmount = Math.round(toPlanet.size * 5);
                if (fleetOwner) {
                  fleetOwner.credits += lootedAmount;
                  addSystemMessage(lobby, `💰 Plundered ${lootedAmount} Credits from securing neutral system ${toPlanet.name}!`);
                }
              } else {
                // Captured from player/bot: total credits divided by their total planets
                const targetTotalPlanets = lobby.planets.filter((p) => p.ownerId === targetOwner.id && !p.isDestroyed).length;
                if (targetTotalPlanets > 0) {
                  lootedAmount = Math.round(targetOwner.credits / targetTotalPlanets);
                }
                if (lootedAmount > 0) {
                  targetOwner.credits = Math.max(0, targetOwner.credits - lootedAmount);
                  if (fleetOwner) {
                    fleetOwner.credits += lootedAmount;
                    isPlayerSteal = true;
                    addSystemMessage(lobby, `⚔️ Looted ${lootedAmount} Credits from Commander ${targetOwner.name} by capturing ${toPlanet.name}!`);
                  }
                }
              }

              // Set the loot effect properties on the planet
              toPlanet.lastLootedAmount = lootedAmount;
              toPlanet.lastLootedTime = Date.now();
              toPlanet.lastLootedIsSteal = isPlayerSteal;

              // Core Trap (overload) check
              let finalShips = Math.max(1, Math.round(fleet.ships));
              if (targetOwner && targetOwner.empireTrait === 'overload') {
                finalShips = Math.max(1, Math.round(finalShips * 0.5));
                addSystemMessage(lobby, `💥 Thermonuclear Core Overload on ${toPlanet.name}! 50% of invading forces vaporized!`);
              }

              toPlanet.ownerId = fleet.ownerId;
              toPlanet.ships = finalShips;

              // Scavenger check
              if (fleetOwner && fleetOwner.empireTrait === 'scavenger') {
                fleetOwner.credits += 45;
                toPlanet.ships += 10;
                addSystemMessage(lobby, `♻️ Salvaged 45 Credits and 10 scrap ships on ${toPlanet.name}!`);
              }

              // Vanguard check
              if (formerOwnerName === 'Neutrals' && fleetOwner && fleetOwner.empireTrait === 'vanguard') {
                toPlanet.ships += 12;
                addSystemMessage(lobby, `⚜️ Vanguard garrison deployed: +12 ships on ${toPlanet.name}!`);
              }

              // Remove fleet on capture
              fleetsToRemove.add(fleet.id);
              addSystemMessage(lobby, `🚀 ${fleetOwner?.name || 'A fleet'} captured ${toPlanet.name} from ${formerOwnerName}!`);
            } else if (fleet.ships <= 0) {
              // Fleet wiped out
              fleetsToRemove.add(fleet.id);
            }
          }
        }
      } else {
        // Missing planets, remove fleet
        fleetsToRemove.add(fleet.id);
        stateChanged = true;
      }
    });

    // Clean up dead/completed fleets
    if (fleetsToRemove.size > 0) {
      lobby.fleets = lobby.fleets.filter((f) => !fleetsToRemove.has(f.id));
      stateChanged = true;
    }

    // Check game-over condition
    // Map of active owners with planets remaining, excluding minor factions
    const planetOwners = new Set(
      lobby.planets
        .map((p) => {
          if (!p.ownerId) return null;
          const owner = lobby.players.find((pl) => pl.id === p.ownerId);
          if (owner?.isMinorFaction) return null;
          return p.ownerId;
        })
        .filter((id) => id !== null)
    );
    // If only 1 major player/bot remains with planets, game is over!
    if (lobby.planets.some(p => p.ownerId !== null) && planetOwners.size === 1) {
      const winnerId = Array.from(planetOwners)[0] as string;
      const winner = lobby.players.find((p) => p.id === winnerId);
      if (winner) {
        lobby.status = 'ended';
        lobby.winnerId = winnerId;
        lobby.victoryStats = {
          winnerName: winner.name,
          winnerColor: winner.color,
          duration: Math.round((Date.now() - lobby.createdAt) / 1000),
          totalFleetsSent: 15 + Math.floor(Math.random() * 20), // mock stats if tracking not extensive
        };

        addSystemMessage(lobby, `🏆 GAME OVER! ${winner.name} has captured all sectors and secured total victory!`);

        // Update persistent leaderboard
        if (!winner.isBot) {
          const existing = leaderboard.find((l) => l.playerName.toLowerCase() === winner.name.toLowerCase());
          if (existing) {
            existing.wins += 1;
            existing.gamesPlayed += 1;
            existing.score += 250;
            existing.date = new Date().toISOString().split('T')[0];
          } else {
            leaderboard.push({
              playerName: winner.name,
              score: 250,
              gamesPlayed: 1,
              wins: 1,
              date: new Date().toISOString().split('T')[0],
            });
          }
          // Keep leaderboard sorted
          leaderboard.sort((a, b) => b.score - a.score);
        }

        stateChanged = true;
      }
    }

    if (stateChanged) {
      broadcastToLobby(code, { type: 'lobby_update', payload: { lobby } });
    }
  });
}, 200);

// Bot Actions Logic Loop (Runs every 2000ms)
setInterval(() => {
  lobbies.forEach((lobby, code) => {
    if (lobby.status !== 'playing') return;

    // Filter bots
    const bots = lobby.players.filter((p) => p.isBot);
    bots.forEach((bot) => {
      // Minor factions act and expand at a much slower pace
      if (bot.isMinorFaction && Math.random() > 0.15) {
        return;
      }

      const botPlanets = lobby.planets.filter((p) => p.ownerId === bot.id);
      if (botPlanets.length === 0) return;

      const otherPlanets = lobby.planets.filter((p) => p.ownerId !== bot.id);
      if (otherPlanets.length === 0) return;

      const difficulty = bot.botDifficulty || 'medium';

      // 1. Spend credits on upgrades (Minor factions buy upgrades, but much slower than normal bots/players)
      const categories: (keyof typeof bot.upgrades)[] = ['speed', 'production', 'defense', 'sensors', 'capacity', 'weapons'];
      const upgradeCosts = [100, 220, 380, 600, 1000, 1500, 2200, 3100, 4200, 5500]; // scaling cost
      const isMinor = bot.isMinorFaction;

      categories.forEach((cat) => {
        const currentLevel = bot.upgrades[cat];
        if (currentLevel < 10) {
          let cost = upgradeCosts[currentLevel];
          if (bot.empireTrait === 'syndicate') {
            cost = Math.round(cost * 0.75); // 25% discount for Syndicate contacts
          }
          if (bot.credits >= cost) {
            // Minor factions purchase upgrades extremely rarely (slower tech)
            if (isMinor && Math.random() > 0.12) return;
            // Easy bot upgrades slowly
            if (!isMinor && difficulty === 'easy' && Math.random() > 0.3) return;

            bot.upgrades[cat] += 1;
            bot.credits -= cost;
            addSystemMessage(lobby, `🔬 ${isMinor ? 'Minor Faction' : 'Bot'} ${bot.name} researched ${cat.toUpperCase()} Level ${bot.upgrades[cat]}`);
          }
        }
      });

      // 1.2. Spend credits on Planetary facilities (Lasers and Shields)
      if (bot.credits >= 1400 && !bot.isMinorFaction && Math.random() < 0.2) {
        // Find a bot planet that is lacking a laser, a shield, or has a laser that can be upgraded
        const buildPlanet = botPlanets.find((p) => !p.hasLaser || !p.hasShield || (p.hasLaser && (p.laserLevel || 1) < 3));
        if (buildPlanet) {
          if (!buildPlanet.hasLaser) {
            buildPlanet.hasLaser = true;
            buildPlanet.laserLevel = 1;
            buildPlanet.laserLastFired = 0;
            bot.credits -= 1400;
            addSystemMessage(lobby, `🏗️ Bot ${bot.name} constructed a TACTICAL LASER on ${buildPlanet.name}.`);
          } else if (!buildPlanet.hasShield) {
            buildPlanet.hasShield = true;
            buildPlanet.shieldActive = true;
            buildPlanet.shieldCooldownUntil = 0;
            bot.credits -= 1400;
            addSystemMessage(lobby, `🏗️ Bot ${bot.name} constructed an ANTI-LASER SHIELD on ${buildPlanet.name}.`);
          } else if (buildPlanet.hasLaser && (buildPlanet.laserLevel || 1) < 3) {
            const currentLvl = buildPlanet.laserLevel || 1;
            buildPlanet.laserLevel = currentLvl + 1;
            bot.credits -= 1400;
            if (buildPlanet.laserLevel === 3) {
              buildPlanet.laserLevel3At = Date.now();
              addSystemMessage(lobby, `🚨 ALERT: Bot ${bot.name} upgraded their laser on ${buildPlanet.name} to Level 3: PLANET BREAKER!`);
            } else {
              addSystemMessage(lobby, `🏗️ Bot ${bot.name} upgraded their laser on ${buildPlanet.name} to Level ${buildPlanet.laserLevel}.`);
            }
          }
        }
      }

      // 1.3. Activate and Fire Tactical Lasers
      botPlanets.forEach((bp) => {
        if (bp.hasLaser && !bp.isDestroyed) {
          const lvl = bp.laserLevel || 1;
          const cooldown = lvl === 1 ? 15000 : lvl === 2 ? 10000 : 25000;
          const lastFired = bp.laserLastFired || 0;
          const now = Date.now();
          const shotCost = lvl === 3 ? (4000 + (bp.planetBreakerUses || 0) * 2000) : 1000;

          if (now - lastFired > cooldown && bot.credits >= shotCost) {
            // Target an enemy planet
            const targetPlanet = otherPlanets.find((tp) => tp.ownerId !== bot.id && !tp.isDestroyed && tp.ownerId !== null);
            if (targetPlanet) {
              bot.credits -= shotCost;
              bp.laserLastFired = now;

              if (!lobby.activeLasers) {
                lobby.activeLasers = [];
              }

              if (lvl === 3) {
                // Planet Breaker!
                bp.planetBreakerUses = (bp.planetBreakerUses || 0) + 1;
                targetPlanet.isDestroyed = true;
                targetPlanet.ships = 0;
                targetPlanet.ownerId = null;
                addSystemMessage(lobby, `🔥 PLANET BREAKER ACTIVATED! Bot ${bot.name} fired the Planet Breaker from ${bp.name} and VAPORIZED ${targetPlanet.name}!`);

                lobby.activeLasers.push({
                  id: `laser-${Date.now()}-${Math.random()}`,
                  fromPlanetId: bp.id,
                  toPlanetId: targetPlanet.id,
                  firedAt: now,
                  duration: 4500, // 4.5 seconds of dramatic animation!
                  type: 'breaker',
                  color: bot.color,
                  isShieldBlocked: false
                });
              } else {
                // Standard laser
                const dmg = lvl === 1 ? 75 : 135;
                const isShieldBlocked = targetPlanet.hasShield && targetPlanet.shieldActive && (targetPlanet.shieldCooldownUntil || 0) < now;

                if (isShieldBlocked) {
                  targetPlanet.shieldActive = false;
                  targetPlanet.shieldCooldownUntil = now + 35000;
                  addSystemMessage(lobby, `🛡️ SHIELD ABSORBED: Bot ${bot.name}'s laser blast from ${bp.name} was fully blocked by ${targetPlanet.name}'s Deflector Shield!`);
                } else {
                  targetPlanet.ships = Math.max(0, targetPlanet.ships - dmg);
                  addSystemMessage(lobby, `💥 DIRECT HIT: Bot ${bot.name} fired a laser from ${bp.name} at ${targetPlanet.name}, destroying ${dmg} defending ships!`);
                }

                lobby.activeLasers.push({
                  id: `laser-${Date.now()}-${Math.random()}`,
                  fromPlanetId: bp.id,
                  toPlanetId: targetPlanet.id,
                  firedAt: now,
                  duration: 2500, // 2.5 seconds to easily read and see!
                  type: 'standard',
                  color: bot.color,
                  isShieldBlocked: isShieldBlocked
                });
              }
            }
          }
        }
      });

      // 2. Perform tactical attacks
      botPlanets.forEach((bp) => {
        // High capacity threshold before launching attacks
        const attackThreshold = difficulty === 'easy' ? 0.8 : difficulty === 'medium' ? 0.6 : 0.45;
        if (bp.ships > bp.maxShips * attackThreshold) {
          // Find smart targets based on distance and strength
          const targets = otherPlanets.map((tp) => {
            const dx = tp.x - bp.x;
            const dy = tp.y - bp.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return { planet: tp, distance };
          });

          // Sort targets
          if (difficulty === 'easy') {
            // Random targets
            targets.sort(() => Math.random() - 0.5);
          } else if (difficulty === 'medium') {
            // Sort by proximity
            targets.sort((a, b) => a.distance - b.distance);
          } else {
            // Hard: Prioritize weak planets nearby (low defense & distance)
            targets.sort((a, b) => {
              const scoreA = a.planet.ships * (a.planet.defenseBonus || 1.0) + a.distance * 0.2;
              const scoreB = b.planet.ships * (b.planet.defenseBonus || 1.0) + b.distance * 0.2;
              return scoreA - scoreB;
            });
          }

          const chosenTarget = targets[0]?.planet;
          if (chosenTarget) {
            // How many ships to dispatch
            const pct = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.5 : 0.65;
            const fleetSize = Math.floor(bp.ships * pct);

            if (fleetSize > 3) {
              bp.ships -= fleetSize;

              const fleetId = `fleet-bot-${Date.now()}-${Math.random()}`;
              const fleet: Fleet = {
                id: fleetId,
                ownerId: bot.id,
                ownerColor: bot.color,
                fromPlanetId: bp.id,
                toPlanetId: chosenTarget.id,
                ships: fleetSize,
                speed: 0.015, // base speed step
                progress: 0,
                x: bp.x,
                y: bp.y,
              };

              lobby.fleets.push(fleet);
            }
          }
        }
      });
    });
  });
}, 2000);

// Helper to list active lobbies
function getPublicLobbies() {
  const list: { code: string; hostName: string; playerCount: number; status: string }[] = [];
  lobbies.forEach((lobby) => {
    const host = lobby.players.find((p) => p.isHost && !p.isBot);
    const hostName = host ? host.name : 'Unknown Host';
    const activePlayers = lobby.players.filter((p) => !p.isMinorFaction && !p.isSpectator);
    list.push({
      code: lobby.code,
      hostName,
      playerCount: activePlayers.length,
      status: lobby.status,
    });
  });
  return list;
}

// Helper to broadcast active lobbies to all connected sockets
function broadcastPublicLobbies() {
  const lobbiesList = getPublicLobbies();
  const dataStr = JSON.stringify({ type: 'public_lobbies', payload: { lobbies: lobbiesList } });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(dataStr);
    }
  });
}

// WS Connection upgraded from Http Server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Websocket logic
wss.on('connection', (ws: WebSocket) => {
  const connectionId = `conn-${Date.now()}-${Math.random()}`;
  
  // Send current leaderboard on fresh connect
  ws.send(JSON.stringify({ type: 'leaderboard_update', payload: { leaderboard } }));
  ws.send(JSON.stringify({ type: 'public_lobbies', payload: { lobbies: getPublicLobbies() } }));

  ws.on('message', (messageStr: string) => {
    try {
      const message = JSON.parse(messageStr) as ClientMessage;
      const conn = activeConnections.get(connectionId);

      switch (message.type) {
        case 'join_lobby': {
          const { name, code: requestedCode } = message.payload;
          const lobbyCode = requestedCode ? requestedCode.toUpperCase() : generateLobbyCode();
          
          let lobby = lobbies.get(lobbyCode);
          if (lobby) {
            const timeoutId = lobbyCleanupTimeouts.get(lobbyCode);
            if (timeoutId) {
              clearTimeout(timeoutId);
              lobbyCleanupTimeouts.delete(lobbyCode);
            }
          } else {
            if (requestedCode) {
              ws.send(JSON.stringify({ type: 'error', payload: { message: `Lobby code ${requestedCode} not found` } }));
              return;
            }
            // Create new lobby
            lobby = {
              code: lobbyCode,
              status: 'lobby',
              players: [],
              planets: [],
              fleets: [],
              chat: [],
              winnerId: null,
              createdAt: Date.now(),
              mapSizeSetting: 'small',
              mapWidth: 850,
              mapHeight: 550,
              minorFactionsCount: 2,
              activeLasers: [],
            };
            lobbies.set(lobbyCode, lobby);
          }

          const isSpec = !!message.payload.isSpectator;

          if (lobby.status !== 'lobby' && !isSpec) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Game has already started in this lobby' } }));
            return;
          }

          if (lobby.players.length >= PLAYER_COLORS.length && !isSpec) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Lobby is full' } }));
            return;
          }

          // Assign distinct color
          const assignedColors = lobby.players.map((p) => p.color);
          const availableColor = PLAYER_COLORS.find((c) => !assignedColors.includes(c)) || PLAYER_COLORS[0];

          const hasHumanHost = lobby.players.some((p) => p.isHost && !p.isBot);

          const playerId = `player-${Date.now()}`;
          const newPlayer: Player = {
            id: playerId,
            name: isSpec ? `${name || 'Watcher'} (Spectator)` : (name || `Commander ${lobby.players.length + 1}`),
            emoji: isSpec ? '👁️' : (message.payload.emoji || '👽'),
            empireName: isSpec ? 'Galactic Watchers' : (message.payload.empireName || 'Terran Alliance'),
            alienEyes: message.payload.alienEyes || 'Standard Sight',
            alienSkin: message.payload.alienSkin || 'Nebula Teal',
            empireTrait: isSpec ? 'balanced' : (message.payload.empireTrait || 'balanced'),
            color: isSpec ? '#64748B' : availableColor,
            isHost: !isSpec && !hasHumanHost,
            isReady: isSpec || !hasHumanHost, // host or spectators are auto-ready
            isBot: false,
            isSpectator: isSpec,
            credits: message.payload.empireTrait === 'syndicate' ? 150 : 100,
            upgradePoints: 0,
            upgrades: { speed: 0, production: 0, defense: 0, sensors: 0, capacity: 0, weapons: 0 },
            lastActive: Date.now(),
          };

          lobby.players.push(newPlayer);
          activeConnections.set(connectionId, { socket: ws, lobbyCode, playerId });

          // Send explicit success confirmation containing playerId
          ws.send(JSON.stringify({ type: 'join_success', payload: { playerId, lobbyCode } }));

          if (isSpec) {
            addSystemMessage(lobby, `👁️ ${newPlayer.name} has connected to spectate this sector.`);
          } else {
            addSystemMessage(lobby, `👋 Player ${newPlayer.name} of the ${newPlayer.empireName} connected to the sector!`);
          }
          
          broadcastToLobby(lobbyCode, { type: 'lobby_update', payload: { lobby } });
          broadcastPublicLobbies();
          break;
        }

        case 'add_bot': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'lobby') return;

          const host = lobby.players.find((p) => p.id === conn.playerId);
          if (!host || !host.isHost) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Only hosts can add bots' } }));
            return;
          }

          if (lobby.players.length >= PLAYER_COLORS.length) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Lobby is full (Max players reached)' } }));
            return;
          }

          // Assign distinct color
          const assignedColors = lobby.players.map((p) => p.color);
          const availableColor = PLAYER_COLORS.find((c) => !assignedColors.includes(c)) || PLAYER_COLORS[0];

          const botDifficulty = message.payload.difficulty || 'medium';
          const botTemplates = {
            easy: [
              { name: 'Sentry Drone', emoji: '🤖', empireName: 'Sentry Automata' },
              { name: 'Aegis Sentinel', emoji: '🛸', empireName: 'Aegis Defense Union' },
              { name: 'Scout Collector', emoji: '🛰️', empireName: 'Scout Survey Grid' }
            ],
            medium: [
              { name: 'Cyber Fleet', emoji: '👾', empireName: 'Cybernetic Syndicate' },
              { name: 'Quantum AI', emoji: '🐙', empireName: 'Quantum Sentinels' },
              { name: 'Nexus Mind', emoji: '🌀', empireName: 'Nexus Intelligence Core' }
            ],
            hard: [
              { name: 'Dreadnought X', emoji: '👹', empireName: 'Dreadnought Sovereign' },
              { name: 'Alpha Overlord', emoji: '💀', empireName: 'Overlord Hegemony' },
              { name: 'Apex Tyrant', emoji: '🐉', empireName: 'Apex Swarm Tyranny' }
            ]
          }[botDifficulty];

          const template = botTemplates[Math.floor(Math.random() * botTemplates.length)];
          const botName = `${template.name} (${botDifficulty})`;

          const randomTraits = ['scavenger', 'nanites', 'vanguard', 'overload', 'syndicate', 'balanced'];
          const botTrait = randomTraits[Math.floor(Math.random() * randomTraits.length)];
          const botEyes = ['Glow Visor', 'Triple Lens', 'Cybernetic Eye', 'Compound Eyes', 'Shadow Void'][Math.floor(Math.random() * 5)];
          const botSkin = ['Obsidian Shell', 'Chromium Carapace', 'Chitinous Green', 'Void Plasma', 'Synthetic Brass'][Math.floor(Math.random() * 5)];

          const botId = `bot-${Date.now()}-${Math.random()}`;
          const botPlayer: Player = {
            id: botId,
            name: botName,
            emoji: template.emoji,
            empireName: template.empireName,
            alienEyes: botEyes,
            alienSkin: botSkin,
            empireTrait: botTrait,
            color: availableColor,
            isHost: false,
            isReady: true,
            isBot: true,
            botDifficulty,
            credits: botTrait === 'syndicate' ? 150 : 100,
            upgradePoints: 0,
            upgrades: { speed: 0, production: 0, defense: 0, sensors: 0, capacity: 0, weapons: 0 },
            lastActive: Date.now(),
          };

          lobby.players.push(botPlayer);
          addSystemMessage(lobby, `🤖 Bot ${botName} (${template.emoji}) of the ${template.empireName} has entered the sector!`);
          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'remove_player': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'lobby') return;

          const host = lobby.players.find((p) => p.id === conn.playerId);
          if (!host || !host.isHost) return;

          const targetId = message.payload.playerId;
          const targetPlayer = lobby.players.find((p) => p.id === targetId);
          if (!targetPlayer) return;

          lobby.players = lobby.players.filter((p) => p.id !== targetId);
          addSystemMessage(lobby, `🚫 ${targetPlayer.name} was expelled from the lobby.`);

          // If the player removed had a connection, clean up
          activeConnections.forEach((v, k) => {
            if (v.playerId === targetId) {
              v.socket.send(JSON.stringify({ type: 'error', payload: { message: 'You have been removed from the lobby' } }));
              activeConnections.delete(k);
            }
          });

          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'toggle_ready': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'lobby') return;

          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (player) {
            player.isReady = !player.isReady;
            broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          }
          break;
        }

        case 'start_game': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'lobby') return;

          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player || !player.isHost) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Only host can start the game' } }));
            return;
          }

          // Generate random Minor Factions based on host preference (default 2)
          const minorFactionTemplates = [
            { name: 'Centauri Miners', emoji: '🪐', empireName: 'Centauri Mining Cartel' },
            { name: 'Vega Assemblers', emoji: '🛠️', empireName: 'Vega Technocracy' },
            { name: 'Orion Corsairs', emoji: '🏴‍☠️', empireName: 'Orion Corsair Syndicate' },
            { name: 'Siriun Sages', emoji: '🔮', empireName: 'Sirius Enclave' },
            { name: 'Antarean Miners', emoji: '👾', empireName: 'Antares Mining Consortium' },
            { name: 'Rigel Fabricators', emoji: '🛰️', empireName: 'Rigelian Fabricators' },
            { name: 'Polaris Watchers', emoji: '👁️', empireName: 'Polaris Watchers' },
            { name: 'Pleiades Sages', emoji: '🧬', empireName: 'Pleiades Research Council' },
          ];

          const numFactions = lobby.minorFactionsCount !== undefined ? lobby.minorFactionsCount : 2;
          const selectedFactions = minorFactionTemplates.sort(() => 0.5 - Math.random()).slice(0, numFactions);
          const assignedColors = lobby.players.map((p) => p.color);
          const availableColors = PLAYER_COLORS.filter((c) => !assignedColors.includes(c));

          selectedFactions.forEach((template, idx) => {
            const mfId = `minor-${idx}-${Date.now()}`;
            const chosenColor = availableColors[idx] || (idx === 0 ? '#EC4899' : '#8B5CF6');
            const randomTraits = ['scavenger', 'nanites', 'vanguard', 'overload', 'syndicate', 'balanced'];
            const botTrait = randomTraits[Math.floor(Math.random() * randomTraits.length)];
            const botEyes = ['Glow Visor', 'Triple Lens', 'Cybernetic Eye', 'Compound Eyes', 'Shadow Void'][Math.floor(Math.random() * 5)];
            const botSkin = ['Obsidian Shell', 'Chromium Carapace', 'Chitinous Green', 'Void Plasma', 'Synthetic Brass'][Math.floor(Math.random() * 5)];

            lobby.players.push({
              id: mfId,
              name: template.name,
              emoji: template.emoji,
              empireName: template.empireName,
              alienEyes: botEyes,
              alienSkin: botSkin,
              empireTrait: botTrait,
              color: chosenColor,
              isHost: false,
              isReady: true,
              isBot: true,
              isMinorFaction: true,
              botDifficulty: 'easy', // Slower AI updates
              credits: botTrait === 'syndicate' ? 150 : 100,
              upgradePoints: 0,
              upgrades: { speed: 0, production: 0, defense: 0, sensors: 0, capacity: 0, weapons: 0 },
              lastActive: Date.now(),
            });
          });

          // Generate planet map based on currently connected players & bots
          lobby.planets = generatePlanetMap(lobby.players, lobby.mapWidth, lobby.mapHeight, lobby.mapSizeSetting);
          lobby.status = 'playing';
          lobby.createdAt = Date.now();

          addSystemMessage(lobby, `⚔️ Space fleet conquest initiated! Protect your home sectors and conquer the galaxy!`);
          addSystemMessage(lobby, `📡 Minor independent factions have established territorial hubs in neutral sectors!`);
          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          broadcastPublicLobbies();
          break;
        }

        case 'send_chat': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby) return;

          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (player) {
            const chatMsg: ChatMessage = {
              id: `msg-${Date.now()}`,
              senderId: player.id,
              senderName: player.name,
              senderColor: player.color,
              text: message.payload.text,
              timestamp: Date.now(),
            };
            lobby.chat.push(chatMsg);
            if (lobby.chat.length > 50) lobby.chat.shift();
            broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          }
          break;
        }

        case 'launch_fleet': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'playing') return;

          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          const { fromPlanetId, toPlanetId, targetFleetId, percent } = message.payload;
          const fromPlanet = lobby.planets.find((p) => p.id === fromPlanetId);
          
          let toPlanet = lobby.planets.find((p) => p.id === toPlanetId);
          let targetFleet: Fleet | undefined;
          if (targetFleetId) {
            targetFleet = lobby.fleets.find((f) => f.id === targetFleetId);
            if (targetFleet) {
              toPlanet = lobby.planets.find((p) => p.id === targetFleet.toPlanetId);
            }
          }

          if (fromPlanet && (toPlanet || targetFleet) && fromPlanet.ownerId === player.id) {
            if (toPlanet && fromPlanet.id === toPlanet.id) return; // cannot launch to itself

            // Enforce planet launch cooldown of 1.0 second
            const now = Date.now();
            if (fromPlanet.cooldownUntil && now < fromPlanet.cooldownUntil) {
              ws.send(JSON.stringify({ type: 'error', payload: { message: 'Planet launching system is cooling down!' } }));
              return;
            }

            const shipsToLaunch = Math.floor(fromPlanet.ships * (percent / 100));
            if (shipsToLaunch >= 1) { // minimum requirement of 1 ship for maximum snappy gameplay feel
              fromPlanet.cooldownUntil = now + 1000; // 1.0 second cooldown
              fromPlanet.ships -= shipsToLaunch;

              const fleet: Fleet = {
                id: `fleet-${Date.now()}-${Math.random()}`,
                ownerId: player.id,
                ownerColor: player.color,
                fromPlanetId,
                toPlanetId: toPlanet ? toPlanet.id : '',
                targetFleetId: targetFleet ? targetFleet.id : undefined,
                ships: shipsToLaunch,
                speed: 0.015, // base incremental speed multiplier
                progress: 0,
                x: fromPlanet.x,
                y: fromPlanet.y,
              };

              lobby.fleets.push(fleet);
              broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
            }
          }
          break;
        }

        case 'purchase_upgrade': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby) return;

          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          if (player.research) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Science division is busy with an ongoing research project' } }));
            return;
          }

          const category = message.payload.category;
          const currentLevel = player.upgrades[category];
          if (currentLevel >= 10) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Max upgrade level reached (10)' } }));
            return;
          }

          const upgradeCosts = [100, 220, 380, 600, 1000, 1500, 2200, 3100, 4200, 5500];
          let cost = upgradeCosts[currentLevel];
          if (player.empireTrait === 'syndicate') {
            cost = Math.round(cost * 0.75); // 25% discount for Syndicate contacts
          }

          if (player.credits >= cost) {
            player.credits -= cost;
            const targetLevel = currentLevel + 1;
            // Level 1: 8s, Level 2: 16s, Level 3: 24s, Level 4: 32s, Level 5: 40s
            const duration = targetLevel * 8000;
            player.research = {
              category,
              targetLevel,
              startTime: Date.now(),
              duration
            };
            addSystemMessage(lobby, `🔬 Commander ${player.name} initiated ${category.toUpperCase()} Level ${targetLevel} Research (${duration / 1000} seconds)...`);
            broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          } else {
            ws.send(JSON.stringify({ type: 'error', payload: { message: `Insufficient credits for this research (${cost} CR needed)` } }));
          }
          break;
        }

        case 'update_map_size': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby) return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player || !player.isHost) return;
          const { size } = message.payload;
          if (size === 'small' || size === 'medium' || size === 'large' || size === 'giant' || size === 'cosmic') {
            lobby.mapSizeSetting = size;
            if (size === 'small') {
              lobby.mapWidth = 850;
              lobby.mapHeight = 550;
            } else if (size === 'medium') {
              lobby.mapWidth = 1100;
              lobby.mapHeight = 700;
            } else if (size === 'large') {
              lobby.mapWidth = 1400;
              lobby.mapHeight = 900;
            } else if (size === 'giant') {
              lobby.mapWidth = 1800;
              lobby.mapHeight = 1100;
            } else if (size === 'cosmic') {
              lobby.mapWidth = 2400;
              lobby.mapHeight = 1500;
            }
            addSystemMessage(lobby, `🗺️ Host changed Map Size to ${size.toUpperCase()} (${lobby.mapWidth}x${lobby.mapHeight}).`);
            broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
            broadcastPublicLobbies();
          }
          break;
        }

        case 'update_minor_factions': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby) return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player || !player.isHost) return;
          const { count } = message.payload;
          if (typeof count === 'number' && count >= 0 && count <= 15) {
            lobby.minorFactionsCount = count;
            addSystemMessage(lobby, `⚙️ Host updated minor independent factions density to ${count}.`);
            broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          }
          break;
        }

        case 'build_laser': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'playing') return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          const { planetId } = message.payload;
          const planet = lobby.planets.find((p) => p.id === planetId);
          if (!planet || planet.ownerId !== player.id || planet.isDestroyed) return;

          if (planet.hasLaser) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Planet already has a Laser constructed' } }));
            return;
          }

          if (player.credits < 1400) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Insufficient credits (1,400 CR needed to build)' } }));
            return;
          }

          player.credits -= 1400;
          planet.hasLaser = true;
          planet.laserLevel = 1;
          planet.laserLastFired = 0;

          addSystemMessage(lobby, `🏗️ ${player.name} constructed a TACTICAL LASER battery on ${planet.name}!`);
          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'upgrade_laser': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'playing') return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          const { planetId } = message.payload;
          const planet = lobby.planets.find((p) => p.id === planetId);
          if (!planet || planet.ownerId !== player.id || planet.isDestroyed) return;

          if (!planet.hasLaser) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'No Laser found on this planet to upgrade' } }));
            return;
          }

          const currentLvl = planet.laserLevel || 1;
          if (currentLvl >= 3) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Laser is already at maximum level (3)' } }));
            return;
          }

          if (player.credits < 1400) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Insufficient credits (1,400 CR needed to upgrade)' } }));
            return;
          }

          player.credits -= 1400;
          planet.laserLevel = currentLvl + 1;

          if (planet.laserLevel === 3) {
            planet.laserLevel3At = Date.now();
            addSystemMessage(lobby, `🚨 PLANET BREAKER UNLOCKED: ${player.name} upgraded the Laser on ${planet.name} to Level 3! It is now highlighted on tactical maps!`);
          } else {
            addSystemMessage(lobby, `🏗️ ${player.name} upgraded the Laser on ${planet.name} to Level ${planet.laserLevel}!`);
          }

          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'build_shield': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'playing') return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          const { planetId } = message.payload;
          const planet = lobby.planets.find((p) => p.id === planetId);
          if (!planet || planet.ownerId !== player.id || planet.isDestroyed) return;

          if (planet.hasShield) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Planet already has a Shield constructed' } }));
            return;
          }

          if (player.credits < 1400) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Insufficient credits (1,400 CR needed to build shield)' } }));
            return;
          }

          player.credits -= 1400;
          planet.hasShield = true;
          planet.shieldActive = true;
          planet.shieldCooldownUntil = 0;

          addSystemMessage(lobby, `🏗️ ${player.name} constructed an ANTI-LASER DEFLECTOR SHIELD on ${planet.name}!`);
          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'fire_laser': {
          if (!conn) return;
          const lobby = lobbies.get(conn.lobbyCode);
          if (!lobby || lobby.status !== 'playing') return;
          const player = lobby.players.find((p) => p.id === conn.playerId);
          if (!player) return;

          const { fromPlanetId, toPlanetId } = message.payload;
          const fromPlanet = lobby.planets.find((p) => p.id === fromPlanetId);
          const toPlanet = lobby.planets.find((p) => p.id === toPlanetId);

          if (!fromPlanet || !toPlanet || fromPlanet.ownerId !== player.id || fromPlanet.id === toPlanet.id || fromPlanet.isDestroyed || toPlanet.isDestroyed) return;

          if (!fromPlanet.hasLaser) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'No Laser battery active on origin planet' } }));
            return;
          }

          const lvl = fromPlanet.laserLevel || 1;
          const cooldown = lvl === 1 ? 15000 : lvl === 2 ? 10000 : 25000;
          const lastFired = fromPlanet.laserLastFired || 0;
          const now = Date.now();

          if (now - lastFired < cooldown) {
            const remaining = Math.ceil((cooldown - (now - lastFired)) / 1000);
            ws.send(JSON.stringify({ type: 'error', payload: { message: `Laser cannon cooling down. Ready in ${remaining}s.` } }));
            return;
          }

          const shotCost = lvl === 3 ? (4000 + (fromPlanet.planetBreakerUses || 0) * 2000) : 1000;
          if (player.credits < shotCost) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: `Insufficient credits to fire (${shotCost} CR needed)` } }));
            return;
          }

          player.credits -= shotCost;
          fromPlanet.laserLastFired = now;

          if (!lobby.activeLasers) {
            lobby.activeLasers = [];
          }

          if (lvl === 3) {
            // Planet Breaker! Blow up planet completely
            fromPlanet.planetBreakerUses = (fromPlanet.planetBreakerUses || 0) + 1;
            toPlanet.isDestroyed = true;
            toPlanet.ships = 0;
            toPlanet.ownerId = null; // Neutralize and destroy
            addSystemMessage(lobby, `🔥 PLANET BREAKER ACTIVATED: ${player.name} fired the Level 3 Planet Breaker from ${fromPlanet.name} and VAPORIZED ${toPlanet.name}!`);

            lobby.activeLasers.push({
              id: `laser-${Date.now()}-${Math.random()}`,
              fromPlanetId: fromPlanet.id,
              toPlanetId: toPlanet.id,
              firedAt: now,
              duration: 4500, // 4.5 seconds of dramatic animation!
              type: 'breaker',
              color: player.color,
              isShieldBlocked: false
            });
          } else {
            // Standard laser shot
            const dmg = lvl === 1 ? 75 : 135;
            
            // Check shield block
            const isShieldBlocked = toPlanet.hasShield && toPlanet.shieldActive && (toPlanet.shieldCooldownUntil || 0) < now;
            
            if (isShieldBlocked) {
              toPlanet.shieldActive = false;
              toPlanet.shieldCooldownUntil = now + 35000; // 35 seconds cooldown
              addSystemMessage(lobby, `🛡️ SHIELD ABSORBED: ${player.name}'s laser blast from ${fromPlanet.name} was fully blocked by ${toPlanet.name}'s Deflector Shield! Deflectors are now offline for 35s.`);
            } else {
              toPlanet.ships = Math.max(0, toPlanet.ships - dmg);
              addSystemMessage(lobby, `💥 DIRECT HIT: ${player.name} fired a tactical laser from ${fromPlanet.name} at ${toPlanet.name}, destroying ${dmg} defending ships!`);
            }

            lobby.activeLasers.push({
              id: `laser-${Date.now()}-${Math.random()}`,
              fromPlanetId: fromPlanet.id,
              toPlanetId: toPlanet.id,
              firedAt: now,
              duration: 2500, // 2.5 seconds to easily read and see!
              type: 'standard',
              color: player.color,
              isShieldBlocked: isShieldBlocked
            });
          }

          broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
          break;
        }

        case 'leave_lobby': {
          handleDisconnect(connectionId, true);
          break;
        }

        case 'reconnect_lobby': {
          const { playerId, lobbyCode } = message.payload;
          const lobby = lobbies.get(lobbyCode);
          if (lobby) {
            const timeoutId = lobbyCleanupTimeouts.get(lobbyCode);
            if (timeoutId) {
              clearTimeout(timeoutId);
              lobbyCleanupTimeouts.delete(lobbyCode);
            }

            // Clear player disconnect grace period timeout
            const timeoutKey = `${lobbyCode}-${playerId}`;
            if (playerDisconnectTimeouts.has(timeoutKey)) {
              clearTimeout(playerDisconnectTimeouts.get(timeoutKey));
              playerDisconnectTimeouts.delete(timeoutKey);
            }

            const player = lobby.players.find((p) => p.id === playerId);
            if (player) {
              activeConnections.set(connectionId, { socket: ws, lobbyCode, playerId });
              player.isOffline = false; // Mark as online
              
              if (player.isBot && !player.isMinorFaction) {
                player.isBot = false;
                player.name = player.name.replace(/ \(AI\)$/, '');
                addSystemMessage(lobby, `📡 Commander ${player.name} has reconnected to the sector.`);
              } else {
                addSystemMessage(lobby, `📡 Commander ${player.name} reconnected successfully.`);
              }
              ws.send(JSON.stringify({ type: 'lobby_update', payload: { lobby } }));
              broadcastToLobby(lobbyCode, { type: 'lobby_update', payload: { lobby } });
            } else {
              ws.send(JSON.stringify({ type: 'reconnect_fail' }));
            }
          } else {
            ws.send(JSON.stringify({ type: 'reconnect_fail' }));
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error parsing client WS message: ', err);
    }
  });

  ws.on('close', () => {
    handleDisconnect(connectionId);
  });
});

function handleDisconnect(connectionId: string, isIntentionalLeave: boolean = false) {
  const conn = activeConnections.get(connectionId);
  if (!conn) return;

  // If this is an intentional leave, remove from activeConnections immediately 
  // so they do not receive subsequent 'lobby_update' broadcasts and auto-rejoin
  if (isIntentionalLeave) {
    activeConnections.delete(connectionId);
  }

  const lobby = lobbies.get(conn.lobbyCode);
  if (lobby) {
    const player = lobby.players.find((p) => p.id === conn.playerId);
    if (player) {
      if (lobby.status === 'lobby') {
        // Safe to completely remove from lobby before game begins
        lobby.players = lobby.players.filter((p) => p.id !== conn.playerId);
        addSystemMessage(lobby, `👋 Commander ${player.name} left the sector.`);
        
        // Transfer host if host left
        if (player.isHost && lobby.players.length > 0) {
          const newHost = lobby.players.find((p) => !p.isBot);
          if (newHost) {
            newHost.isHost = true;
            newHost.isReady = true;
            addSystemMessage(lobby, `👑 Host permissions transferred to ${newHost.name}.`);
          }
        }
      } else {
        if (isIntentionalLeave) {
          // Intentional leave during active game: convert to AI immediately so other players can continue
          player.isBot = true;
          player.isOffline = false;
          if (!player.name.endsWith(' (AI)')) {
            player.name = `${player.name} (AI)`;
          }
          addSystemMessage(lobby, `🤖 Commander ${player.name.replace(/ \(AI\)$/, '')} left the sector. Empire control transferred to Tactical AI Takeover!`);
        } else {
          // Game is active, mark player as offline
          player.isOffline = true;
          addSystemMessage(lobby, `📡 Commander ${player.name} lost connection. Synchronizing link...`);
          
          const timeoutKey = `${conn.lobbyCode}-${player.id}`;
          // Clear any existing disconnect timeout just in case
          if (playerDisconnectTimeouts.has(timeoutKey)) {
            clearTimeout(playerDisconnectTimeouts.get(timeoutKey));
          }
          
          const timeoutId = setTimeout(() => {
            const currentLobby = lobbies.get(conn.lobbyCode);
            if (currentLobby) {
              const currentPlayer = currentLobby.players.find((p) => p.id === player.id);
              if (currentPlayer && currentPlayer.isOffline && !currentPlayer.isBot) {
                addSystemMessage(currentLobby, `📡 Commander ${currentPlayer.name} offline. Tactical systems paused (No AI takeover).`);
                
                // Clean up if all players are offline
                const activeHumans = currentLobby.players.filter((p) => !p.isBot && !p.isOffline);
                if (activeHumans.length === 0) {
                  if (!lobbyCleanupTimeouts.has(conn.lobbyCode)) {
                    const cleanupTimeoutId = setTimeout(() => {
                      const cleanLobby = lobbies.get(conn.lobbyCode);
                      if (cleanLobby) {
                        const cleanActiveHumans = cleanLobby.players.filter((p) => !p.isBot && !p.isOffline);
                        if (cleanActiveHumans.length === 0) {
                          lobbies.delete(conn.lobbyCode);
                        }
                      }
                      lobbyCleanupTimeouts.delete(conn.lobbyCode);
                      broadcastPublicLobbies();
                    }, 60000);
                    lobbyCleanupTimeouts.set(conn.lobbyCode, cleanupTimeoutId);
                  }
                }
                
                broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby: currentLobby } });
              }
            }
            playerDisconnectTimeouts.delete(timeoutKey);
          }, 15000); // 15 seconds grace period
          
          playerDisconnectTimeouts.set(timeoutKey, timeoutId);
        }
      }

      // If no human players are online in lobby, destroy it after 60 seconds grace period
      const onlineHumans = lobby.players.filter((p) => !p.isBot && !p.isOffline);
      if (onlineHumans.length === 0) {
        if (!lobbyCleanupTimeouts.has(conn.lobbyCode)) {
          const timeoutId = setTimeout(() => {
            const currentLobby = lobbies.get(conn.lobbyCode);
            if (currentLobby) {
              const currentOnlineHumans = currentLobby.players.filter((p) => !p.isBot && !p.isOffline);
              if (currentOnlineHumans.length === 0) {
                lobbies.delete(conn.lobbyCode);
              }
            }
            lobbyCleanupTimeouts.delete(conn.lobbyCode);
            broadcastPublicLobbies();
          }, 60000); // 60 seconds grace period
          lobbyCleanupTimeouts.set(conn.lobbyCode, timeoutId);
        }
      } else {
        broadcastToLobby(conn.lobbyCode, { type: 'lobby_update', payload: { lobby } });
      }
    }
  }
  activeConnections.delete(connectionId);
  broadcastPublicLobbies();
}

// Integration of Vite middleware & static index files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Multiplayer Planet-Conquest server listening at http://localhost:${PORT}`);
  });
}

startServer();
