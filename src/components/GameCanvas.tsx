import React, { useRef, useEffect, useState } from 'react';
import { Planet, Fleet, Player, PlayerColor, ActiveLaserEffect } from '../types';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface GameCanvasProps {
  planets: Planet[];
  fleets: Fleet[];
  players: Player[];
  currentPlayerId: string | null;
  launchPercent: number; // e.g. 50%
  onLaunchFleet: (fromId: string, toId?: string, targetFleetId?: string) => void;
  selectedPlanetId: string | null;
  onSelectPlanet: (planetId: string | null) => void;
  isTargetingWeapon: boolean;
  onFireWeapon?: (targetPlanetId: string) => void;
  mapWidth?: number;
  mapHeight?: number;
  activeLasers?: ActiveLaserEffect[];
}

interface Explosion {
  x: number;
  y: number;
  color: string;
  radius: number;
  alpha: number;
  maxRadius: number;
}

export default function GameCanvas({
  planets,
  fleets,
  players,
  currentPlayerId,
  launchPercent,
  onLaunchFleet,
  selectedPlanetId,
  onSelectPlanet,
  isTargetingWeapon,
  onFireWeapon,
  mapWidth = 850,
  mapHeight = 550,
  activeLasers = [],
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Track start time of match for starting glow/flashes
  const [startTime] = useState(Date.now());

  // Zoom & Pan states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasInteractedRef = useRef(false);

  // Canvas size state
  const [canvasSize, setCanvasSize] = useState({ width: 850, height: 550 });

  // Helper to convert hex color to RGB values for transparent canvas pulses
  const hexToRgb = (hex: string): string => {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.substring(0, 2), 16) || 255;
    const g = parseInt(cleaned.substring(2, 4), 16) || 255;
    const b = parseInt(cleaned.substring(4, 6), 16) || 255;
    return `${r}, ${g}, ${b}`;
  };
  
  // Selection state
  const [hoveredPlanetId, setHoveredPlanetId] = useState<string | null>(null);
  const [hoveredFleetId, setHoveredFleetId] = useState<string | null>(null);
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPlanetId, setDragStartPlanetId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Instructions dismissible overlay (fades after 8 seconds or when clicked)
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowInstructions(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  // Reset drag state if mouse is released anywhere in the window (prevents stuck dragging)
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragStartPlanetId(null);
      }
      if (isPanning) {
        setIsPanning(false);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging, isPanning]);

  // Visual effects
  const explosionsRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    alpha: number;
    life: number;
    maxLife: number;
  }[]>([]);
  const shockwavesRef = useRef<{
    x: number;
    y: number;
    color: string;
    radius: number;
    maxRadius: number;
    alpha: number;
    speed: number;
  }[]>([]);
  const previousFleetsRef = useRef<Fleet[]>([]);
  const previousPlanetsRef = useRef<Planet[]>([]);
  const smoothedFleetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const starsRef = useRef<{ x: number; y: number; size: number; speed: number }[]>([]);

  // Setup background starfield once
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * 2400,
        y: Math.random() * 1500,
        size: Math.random() * 2,
        speed: 0.05 + Math.random() * 0.1,
      });
    }
    starsRef.current = stars;
    previousPlanetsRef.current = planets;
  }, []);

  // Helper to trigger particle explosions on regular fleet arrival (reinforcements)
  const triggerExplosion = (x: number, y: number, color: string) => {
    const particlesCount = 14 + Math.floor(Math.random() * 10);
    for (let i = 0; i < particlesCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.8;
      explosionsRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 1.2 + Math.random() * 2.5,
        alpha: 1.0,
        life: 0,
        maxLife: 20 + Math.floor(Math.random() * 18),
      });
    }
  };

  // Helper to trigger intense battle explosions with high-speed debris and expanding shockwaves
  const triggerBattleExplosion = (x: number, y: number, color: string) => {
    const particlesCount = 35 + Math.floor(Math.random() * 15);
    const combatColors = [color, '#FF5500', '#FFAA00', '#FF3300', '#FFFFFF'];
    
    // 1. Particle debris blast
    for (let i = 0; i < particlesCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      const pColor = combatColors[Math.floor(Math.random() * combatColors.length)];
      explosionsRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: pColor,
        size: 2.0 + Math.random() * 4.0,
        alpha: 1.0,
        life: 0,
        maxLife: 25 + Math.floor(Math.random() * 25),
      });
    }

    // 2. Add dynamic shockwave rings
    shockwavesRef.current.push({
      x,
      y,
      color,
      radius: 4,
      maxRadius: 40 + Math.random() * 20,
      alpha: 1.0,
      speed: 1.8,
    });
    
    shockwavesRef.current.push({
      x,
      y,
      color: '#FF7700',
      radius: 2,
      maxRadius: 30 + Math.random() * 15,
      alpha: 1.0,
      speed: 2.5,
    });
  };

  // Monitor fleet reductions to spawn explosions at target positions
  useEffect(() => {
    const prevFleets = previousFleetsRef.current;
    if (prevFleets.length > 0 && fleets.length < prevFleets.length) {
      // Find arrived fleets
      const currentIds = new Set(fleets.map(f => f.id));
      const arrivedFleets = prevFleets.filter(f => !currentIds.has(f.id));
      
      arrivedFleets.forEach(fleet => {
        const targetPlanet = planets.find(p => p.id === fleet.toPlanetId);
        if (targetPlanet) {
          // Check if it was combat
          const prevPlanet = previousPlanetsRef.current.find(p => p.id === targetPlanet.id);
          const wasCombat = prevPlanet && prevPlanet.ownerId !== fleet.ownerId;
          
          if (wasCombat) {
            triggerBattleExplosion(targetPlanet.x, targetPlanet.y, fleet.ownerColor);
          } else {
            triggerExplosion(targetPlanet.x, targetPlanet.y, fleet.ownerColor);
          }
        }
      });
    }
    previousFleetsRef.current = fleets;
    previousPlanetsRef.current = planets;
  }, [fleets, planets]);

  // Handle Resize to make canvas beautifully responsive and perfectly fill the container
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: width || 850, height: height || 550 });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Helper: Fits the current map size to the canvas size with margin
  const fitToScreen = () => {
    const W_c = canvasSize.width;
    const H_c = canvasSize.height;
    const W_m = mapWidth;
    const H_m = mapHeight;

    if (W_c <= 0 || H_c <= 0) return;

    const scale = Math.min(W_c / W_m, H_c / H_m) * 0.92;
    const panX = (W_c - W_m * scale) / 2;
    const panY = (H_c - H_m * scale) / 2;

    setZoom(scale);
    setPan({ x: panX, y: panY });
  };

  useEffect(() => {
    // Reset interaction state on map size change so we fit the new map automatically
    hasInteractedRef.current = false;
    fitToScreen();
  }, [mapWidth, mapHeight]);

  useEffect(() => {
    if (!hasInteractedRef.current) {
      fitToScreen();
    }
  }, [canvasSize]);

  // Coordinate translation helpers: from client screen to canvas-world
  const clientToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    return {
      x: (mouseX - pan.x) / zoom,
      y: (mouseY - pan.y) / zoom,
    };
  };

  // Helper: Find planet near coordinates
  const findPlanetAtCoords = (clientX: number, clientY: number): Planet | null => {
    const { x, y } = clientToWorld(clientX, clientY);

    for (const planet of planets) {
      const dx = planet.x - x;
      const dy = planet.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < planet.size + 15) {
        return planet;
      }
    }
    return null;
  };

  // Helper: Find fleet near coordinates
  const findFleetAtCoords = (clientX: number, clientY: number): Fleet | null => {
    const { x, y } = clientToWorld(clientX, clientY);

    for (const fleet of fleets) {
      const dx = fleet.x - x;
      const dy = fleet.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22) { // Easy selector collision range for mobile/fast mouse clicks
        return fleet;
      }
    }
    return null;
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const planet = findPlanetAtCoords(e.clientX, e.clientY);
    if (planet) {
      if (isTargetingWeapon) {
        if (onFireWeapon) {
          onFireWeapon(planet.id);
        }
        return;
      }
      if (selectedPlanetId && selectedPlanetId !== planet.id) {
        // Direct click-to-click action (either attack or friendly reinforcement)
        onLaunchFleet(selectedPlanetId, planet.id);
        
        // Clear selection to prevent accidental selection of the target planet
        onSelectPlanet(null);
      } else if (planet.ownerId === currentPlayerId) {
        onSelectPlanet(planet.id);
        setIsDragging(true);
        setDragStartPlanetId(planet.id);
      }
    } else {
      // Check if they clicked an existing traveling fleet instead
      const fleet = findFleetAtCoords(e.clientX, e.clientY);
      if (fleet && selectedPlanetId) {
        onLaunchFleet(selectedPlanetId, undefined, fleet.id);
        onSelectPlanet(null);
      } else {
        onSelectPlanet(null);
        // Start PANNING because they clicked empty space!
        setIsPanning(true);
        hasInteractedRef.current = true;
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const newPanX = e.clientX - panStartRef.current.x;
      const newPanY = e.clientY - panStartRef.current.y;
      setPan({ x: newPanX, y: newPanY });
      return;
    }

    const { x, y } = clientToWorld(e.clientX, e.clientY);
    setMousePos({ x, y });

    const planet = findPlanetAtCoords(e.clientX, e.clientY);
    if (planet) {
      setHoveredPlanetId(planet.id);
      setHoveredFleetId(null);
    } else {
      setHoveredPlanetId(null);
      const fleet = findFleetAtCoords(e.clientX, e.clientY);
      setHoveredFleetId(fleet ? fleet.id : null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDragging && dragStartPlanetId) {
      const targetPlanet = findPlanetAtCoords(e.clientX, e.clientY);
      if (targetPlanet && targetPlanet.id !== dragStartPlanetId) {
        onLaunchFleet(dragStartPlanetId, targetPlanet.id);
        
        // Clear selection to prevent accidental selection of the target planet
        onSelectPlanet(null);
      } else {
        // Check if they dragged and released directly on top of a fleet
        const targetFleet = findFleetAtCoords(e.clientX, e.clientY);
        if (targetFleet) {
          onLaunchFleet(dragStartPlanetId, undefined, targetFleet.id);
          onSelectPlanet(null);
        } else {
          // If released on origin or empty space, keep selected
          const releasedPlanet = findPlanetAtCoords(e.clientX, e.clientY);
          if (releasedPlanet && releasedPlanet.id === dragStartPlanetId) {
            onSelectPlanet(dragStartPlanetId);
          }
        }
      }
    }
    setIsDragging(false);
    setDragStartPlanetId(null);
  };

  // Core Animation Render Loop with Sleek Sci-Fi Visuals
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let rotationAngle = 0;

    const render = () => {
      rotationAngle += 0.005;

      // 1. Draw background space over the ENTIRE canvas area
      ctx.fillStyle = '#070913';
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

      // Save drawing context and apply zoom & pan translations
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // 2. Draw beautiful central nebula glow for space ambiance centered on the map size
      const nebulaGrad = ctx.createRadialGradient(
        mapWidth / 2, mapHeight / 2, 40,
        mapWidth / 2, mapHeight / 2, Math.max(mapWidth, mapHeight) * 0.5
      );
      nebulaGrad.addColorStop(0, 'rgba(99, 102, 241, 0.06)'); // Sleek Indigo
      nebulaGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.025)'); // Cyan hue
      nebulaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebulaGrad;
      ctx.beginPath();
      ctx.arc(mapWidth / 2, mapHeight / 2, Math.max(mapWidth, mapHeight) * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Draw tactical coordinate grid up to current map dimensions
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.02)';
      ctx.lineWidth = 1;
      const gridSpacing = 50;
      for (let x = 0; x <= mapWidth; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mapHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= mapHeight; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mapWidth, y);
        ctx.stroke();
      }

      // 4. Corner high-tech tactical bracket markers at map boundaries
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1.5;
      const bLen = 12;
      // Top-Left
      ctx.beginPath(); ctx.moveTo(15, 15 + bLen); ctx.lineTo(15, 15); ctx.lineTo(15 + bLen, 15); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.moveTo(mapWidth - 15 - bLen, 15); ctx.lineTo(mapWidth - 15, 15); ctx.lineTo(mapWidth - 15, 15 + bLen); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.moveTo(15, mapHeight - 15 - bLen); ctx.lineTo(15, mapHeight - 15); ctx.lineTo(15 + bLen, mapHeight - 15); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.moveTo(mapWidth - 15 - bLen, mapHeight - 15); ctx.lineTo(mapWidth - 15, mapHeight - 15); ctx.lineTo(mapWidth - 15, mapHeight - 15 - bLen); ctx.stroke();

      // 5. Draw subtle orbital dust ring lines centered on map size
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.04)';
      ctx.lineWidth = 1;
      for (let r = 100; r < Math.max(mapWidth, mapHeight) * 0.8; r += 120) {
        ctx.beginPath();
        ctx.arc(mapWidth / 2, mapHeight / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 6. Draw animated background stars wrapping around dynamic map dimensions
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      starsRef.current.forEach((star) => {
        star.x -= star.speed;
        if (star.x < 0) star.x = mapWidth;
        const sx = star.x % mapWidth;
        const sy = star.y % mapHeight;
        ctx.fillRect(sx, sy, star.size, star.size);
      });

      // 7. Draw dragging attack line preview
      if (isDragging && dragStartPlanetId) {
        const fromPlanet = planets.find((p) => p.id === dragStartPlanetId);
        if (fromPlanet) {
          ctx.beginPath();
          ctx.moveTo(fromPlanet.x, fromPlanet.y);
          
          let targetX = mousePos.x;
          let targetY = mousePos.y;
          if (hoveredPlanetId) {
            const hp = planets.find(p => p.id === hoveredPlanetId);
            if (hp) {
              targetX = hp.x;
              targetY = hp.y;
            }
          } else if (hoveredFleetId) {
            const hf = fleets.find(f => f.id === hoveredFleetId);
            if (hf) {
              targetX = hf.x;
              targetY = hf.y;
            }
          }
          
          ctx.lineTo(targetX, targetY);
          
          // Dash line effect
          ctx.setLineDash([6, 4]);
          const playerColor = players.find(p => p.id === currentPlayerId)?.color || '#3B82F6';
          ctx.strokeStyle = playerColor;
          ctx.lineWidth = 3;
          ctx.shadowColor = playerColor;
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.setLineDash([]); // Reset
          ctx.shadowBlur = 0; // Reset
        }
      }

      // 8. Draw click-to-click target preview line
      if (selectedPlanetId && !isDragging) {
        const fromPlanet = planets.find((p) => p.id === selectedPlanetId);
        if (fromPlanet) {
          ctx.beginPath();
          ctx.moveTo(fromPlanet.x, fromPlanet.y);
          
          let targetX = mousePos.x;
          let targetY = mousePos.y;
          if (hoveredPlanetId) {
            const hp = planets.find(p => p.id === hoveredPlanetId);
            if (hp) {
              targetX = hp.x;
              targetY = hp.y;
            }
          } else if (hoveredFleetId) {
            const hf = fleets.find(f => f.id === hoveredFleetId);
            if (hf) {
              targetX = hf.x;
              targetY = hf.y;
            }
          }
          
          ctx.lineTo(targetX, targetY);
          ctx.setLineDash([4, 6]);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 9. Draw Planets & Systems
      planets.forEach((planet) => {
        const owner = players.find((p) => p.id === planet.ownerId);
        const pColor = owner ? owner.color : '#4B5563'; // Grey for neutrals
        const isMinor = owner && owner.isMinorFaction;
        
        const isSelected = selectedPlanetId === planet.id;
        const isHovered = hoveredPlanetId === planet.id;
        const isTarget = isDragging && isHovered && dragStartPlanetId !== planet.id;

        ctx.save();

        // Atmospheric/Shield Outer Glow (With dynamic breathing scale)
        const breatheScale = 1.0 + 0.08 * Math.sin(rotationAngle * 3 + planet.x * 0.01);
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, (planet.size + 12) * breatheScale, 0, Math.PI * 2);
        
        let glowGrad = ctx.createRadialGradient(planet.x, planet.y, planet.size, planet.x, planet.y, (planet.size + 15) * breatheScale);
        if (owner) {
          glowGrad.addColorStop(0, `${pColor}35`);
          glowGrad.addColorStop(1, `${pColor}00`);
        } else {
          glowGrad.addColorStop(0, 'rgba(156, 163, 175, 0.12)');
          glowGrad.addColorStop(1, 'rgba(156, 163, 175, 0.0)');
        }
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // First 10 seconds starting alerts (Thick Glow + Flash/Radar Pulse)
        const timeElapsed = Date.now() - startTime;
        if (timeElapsed < 10000) {
          if (planet.ownerId === currentPlayerId) {
            // Pulsing neon outer glow
            const glowRadius = planet.size + 16 + 4 * Math.sin(Date.now() * 0.008);
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, glowRadius, 0, Math.PI * 2);
            ctx.strokeStyle = pColor;
            ctx.lineWidth = 3;
            ctx.shadowColor = pColor;
            ctx.shadowBlur = 18;
            ctx.stroke();
            ctx.shadowBlur = 0; // Reset

            // Expanding radar pulse ring
            const pulsePct = (Date.now() % 1200) / 1200;
            const pulseRadius = planet.size + pulsePct * 45;
            const pulseAlpha = 1.0 - pulsePct;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${hexToRgb(pColor)}, ${pulseAlpha})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        }

        // Handle Specialized Structures Render
        if (planet.type === 'shipyard') {
          // Draw orbital ring
          ctx.strokeStyle = `${pColor}80`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(planet.x, planet.y, planet.size + 8, planet.size / 2.5, rotationAngle, 0, Math.PI * 2);
          ctx.stroke();
        } else if (planet.type === 'fortress') {
          // Octagonal force barrier
          ctx.strokeStyle = `${pColor}B0`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let s = 0; s < 8; s++) {
            const angle = (s * Math.PI) / 4 + rotationAngle;
            const x = planet.x + (planet.size + 6) * Math.cos(angle);
            const y = planet.y + (planet.size + 6) * Math.sin(angle);
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        } else if (planet.type === 'tech_lab') {
          // Inner energy nodes
          ctx.strokeStyle = `${pColor}90`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, planet.size + 6, rotationAngle, rotationAngle + Math.PI * 0.4);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, planet.size + 6, rotationAngle + Math.PI, rotationAngle + Math.PI * 1.4);
          ctx.stroke();
        }

        // Selection Target Ring
        if (isSelected) {
          ctx.strokeStyle = '#F59E0B'; // Vibrant amber
          ctx.lineWidth = 3;
          ctx.shadowColor = '#F59E0B';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, planet.size + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0; // Reset
        }

        // Target Indicator when dragging over
        if (isTarget) {
          ctx.strokeStyle = '#EF4444'; // Red targeting aura
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, planet.size + 12, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Distinct decoration for minor factions (NPC)
        if (isMinor) {
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.7)'; // Bright Pink/Violet
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, planet.size + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Planet core base gradient
        const coreGrad = ctx.createRadialGradient(
          planet.x - planet.size / 4,
          planet.y - planet.size / 4,
          planet.size / 8,
          planet.x,
          planet.y,
          planet.size
        );
        
        if (owner) {
          coreGrad.addColorStop(0, '#FFFFFF');
          coreGrad.addColorStop(0.2, `${pColor}`);
          coreGrad.addColorStop(1, '#080C14');
        } else {
          coreGrad.addColorStop(0, '#E5E7EB');
          coreGrad.addColorStop(0.3, '#6B7280');
          coreGrad.addColorStop(1, '#111827');
        }

        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.size, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // --- Active Facility Visual Feedback Overlays ---
        // 1. Deflector Shield (Glowing Translucent Barrier Bubble)
        if (planet.hasShield) {
          const now = Date.now();
          const cooldownEnd = planet.shieldCooldownUntil || 0;
          const isRecharging = cooldownEnd > now;
          
          ctx.save();
          if (isRecharging) {
            // Recharging indicator: Dim orange-amber pulsing outline
            const pulse = 0.6 + 0.2 * Math.sin(Date.now() * 0.005);
            ctx.strokeStyle = `rgba(245, 158, 11, ${0.15 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.size + 8, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Shield is active: Gorgeous spinning bright neon-cyan deflector barrier!
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.006 + planet.x);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.45 * pulse})`;
            ctx.lineWidth = 2.5;
            
            // Outer energy glow effect
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.size + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
            
            // Spinning inner segments for tactical high-tech look
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([12, 15]);
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, planet.size + 6, rotationAngle * 1.5, rotationAngle * 1.5 + Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // 2. Tactical Laser Artillery Battery (Heavy Cannon Facing Outward)
        if (planet.hasLaser) {
          const laserLevel = planet.laserLevel || 1;
          ctx.save();
          
          // Artillery barrel direction rotates slowly with slight sweep feedback
          const sweepAngle = -Math.PI / 4 + 0.2 * Math.sin(rotationAngle * 0.4 + planet.x * 0.03);
          const barrelLen = planet.size + 8 + laserLevel * 2.5;
          const mountRadius = planet.size - 2;
          
          const mx = planet.x + Math.cos(sweepAngle) * mountRadius;
          const my = planet.y + Math.sin(sweepAngle) * mountRadius;
          const bx = planet.x + Math.cos(sweepAngle) * barrelLen;
          const by = planet.y + Math.sin(sweepAngle) * barrelLen;

          // Drawing Support Brackets (Sleek dark grey metallic look)
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = pColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Double or Triple Cannon Barrels depending on Level
          ctx.lineWidth = laserLevel === 3 ? 3.0 : 1.75;
          ctx.shadowBlur = laserLevel === 3 ? 6 : 0;
          ctx.shadowColor = laserLevel === 3 ? '#fbbf24' : '#f43f5e';
          
          if (laserLevel === 1) {
            // Single Laser Tube
            ctx.strokeStyle = '#f43f5e'; // Deep rose/red laser core
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(bx, by);
            ctx.stroke();
          } else if (laserLevel === 2) {
            // Dual Cannon barrels
            ctx.strokeStyle = '#ec4899'; // Pink-magenta core
            const angleOffset = 0.15;
            
            const bx1 = planet.x + Math.cos(sweepAngle - angleOffset) * barrelLen;
            const by1 = planet.y + Math.sin(sweepAngle - angleOffset) * barrelLen;
            const bx2 = planet.x + Math.cos(sweepAngle + angleOffset) * barrelLen;
            const by2 = planet.y + Math.sin(sweepAngle + angleOffset) * barrelLen;
            
            ctx.beginPath();
            ctx.moveTo(mx, my); ctx.lineTo(bx1, by1);
            ctx.moveTo(mx, my); ctx.lineTo(bx2, by2);
            ctx.stroke();
          } else {
            // Level 3: PLANET BREAKER Golden Heavy Artillery Core
            ctx.strokeStyle = '#fbbf24'; // Golden Yellow plasma core
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(bx, by);
            ctx.stroke();
            
            // Orbiting plasma particles around level 3 barrel
            const px = mx + (bx - mx) * 0.75;
            const py = my + (by - my) * 0.75;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          
          ctx.shadowBlur = 0; // reset
          ctx.restore();
        }

        // Thin elegant surface overlay mesh
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Elegant translucent tactical pod for numbers to guarantee absolute readability on bright center gradients
        ctx.fillStyle = 'rgba(7, 9, 19, 0.75)';
        ctx.beginPath();
        ctx.arc(planet.x, planet.y - 1, Math.max(12, planet.size * 0.42), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y - 1, Math.max(12, planet.size * 0.42), 0, Math.PI * 2);
        ctx.stroke();

        // Planet label and ship counter
        const shipCountStr = Math.floor(planet.ships).toString();
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Crisp high-contrast drop-shadow stroke
        ctx.strokeStyle = 'rgba(2, 4, 8, 0.95)';
        ctx.lineWidth = 3.5;
        ctx.strokeText(shipCountStr, planet.x, planet.y - 1);

        // Bright gold for owned planets or white/grey for neutral
        ctx.fillStyle = owner ? '#FCD34D' : '#F3F4F6';
        ctx.fillText(shipCountStr, planet.x, planet.y - 1);

        // Subtext (Name & type badge) with boundary-aware position to prevent clipping at canvas edges
        ctx.fillStyle = isMinor ? '#F472B6' : 'rgba(255, 255, 255, 0.7)'; // Pink name for minor factions
        ctx.font = isMinor ? 'bold 10px "Inter", sans-serif' : '10px "Inter", sans-serif';
        let labelY = planet.y + planet.size + 14;
        if (labelY > 535) {
          // Render above the planet if too close to the bottom canvas boundary
          labelY = planet.y - planet.size - 14;
        }
        const displayName = isMinor ? `⚜️ ${planet.name}` : planet.name;
        ctx.fillText(displayName, planet.x, labelY);

        // 10. Circular wrapping capacity gauge around planet boundary (high-tech & clean!)
        const capacityPct = Math.min(1.0, planet.ships / planet.maxShips);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, planet.size + 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = pColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Start from top (-Math.PI/2) and draw clockwise based on capacity percentage
        ctx.arc(planet.x, planet.y, planet.size + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * capacityPct);
        ctx.stroke();

        // 11. Specialized Resource node indicators (Sleek sci-fi symbol badges)
        if (planet.resourceType) {
          ctx.fillStyle = '#0F172A';
          ctx.beginPath();
          ctx.arc(planet.x + planet.size - 5, planet.y - planet.size + 5, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = pColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(planet.x + planet.size - 5, planet.y - planet.size + 5, 9, 0, Math.PI * 2);
          ctx.stroke();

          let rColor = '#FFFFFF';
          let rSymbol = 'R';
          if (planet.resourceType === 'credits') {
            rColor = '#F59E0B'; // Amber Credits
            rSymbol = 'CR';
          } else if (planet.resourceType === 'alloy') {
            rColor = '#3B82F6'; // Blue Alloy
            rSymbol = '♦';
          } else if (planet.resourceType === 'energy') {
            rColor = '#10B981'; // Green Energy
            rSymbol = '⚡';
          }

          ctx.fillStyle = rColor;
          ctx.font = 'bold 8px "Inter", sans-serif';
          ctx.fillText(rSymbol, planet.x + planet.size - 5, planet.y - planet.size + 5);
        }

        // 11.5 Owner Species Badge (floating high-tech capsule)
        if (owner && owner.emoji) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#070913';
          ctx.beginPath();
          ctx.arc(planet.x - planet.size + 5, planet.y - planet.size + 5, 9, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = pColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(planet.x - planet.size + 5, planet.y - planet.size + 5, 9, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '9px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(owner.emoji, planet.x - planet.size + 5, planet.y - planet.size + 5);
        }

        // 11.6 Construction Progress Overlays (all players can see this)
        if (planet.construction) {
          const elapsed = Date.now() - planet.construction.startTime;
          const progress = Math.min(1.0, elapsed / planet.construction.duration);
          const percent = Math.round(progress * 100);
          
          // Draw high-tech progress indicator above planet
          const barWidth = 46;
          const barHeight = 4;
          const barX = planet.x - barWidth / 2;
          const barY = planet.y - planet.size - 22;
          
          ctx.fillStyle = 'rgba(7, 9, 19, 0.85)';
          ctx.beginPath();
          ctx.roundRect(barX - 4, barY - 11, barWidth + 8, barHeight + 15, 4);
          ctx.fill();
          
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          ctx.fillStyle = '#F59E0B';
          ctx.font = 'bold 7px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`🏗️${planet.construction.buildingType.toUpperCase().substring(0, 5)} ${percent}%`, planet.x, barY - 3);
          
          // Fill progress bar background
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          // Fill progress
          ctx.fillStyle = '#10B981';
          ctx.fillRect(barX, barY, barWidth * progress, barHeight);
        }

        // 11.7 Render Built Structures Badge
        if (planet.buildings) {
          const badges: string[] = [];
          if (planet.buildings.city?.level) badges.push(`🏢C${planet.buildings.city.level}`);
          if (planet.buildings.starport?.level) badges.push(`🚀S${planet.buildings.starport.level}`);
          if (planet.buildings.spaceWeapon?.level) badges.push(`📡W${planet.buildings.spaceWeapon.level}`);
          if (planet.buildings.shield?.level) badges.push(`🛡️P${planet.buildings.shield.level}`);
          
          if (badges.length > 0) {
            const badgeStr = badges.join(' ');
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textWidth = ctx.measureText(badgeStr).width;
            const badgeY = labelY + 11;
            
            ctx.beginPath();
            ctx.roundRect(planet.x - textWidth / 2 - 4, badgeY - 5, textWidth + 8, 10, 3);
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            ctx.fillStyle = '#94A3B8';
            ctx.fillText(badgeStr, planet.x, badgeY);
          }
        }

        // --- Render Loot Popup Effect ---
        if (planet.lastLootedAmount && planet.lastLootedAmount > 0 && planet.lastLootedTime) {
          const lootElapsed = Date.now() - planet.lastLootedTime;
          const totalDuration = 5500; // Show for 5.5 seconds
          if (lootElapsed < totalDuration) {
            ctx.save();
            // Upward motion
            const progress = lootElapsed / totalDuration;
            const floatY = planet.y - planet.size - 18 - (progress * 30);
            // Stay fully opaque for first 3.5s, then fade out over the next 2s
            let lootAlpha = 1.0;
            if (lootElapsed > 3500) {
              lootAlpha = Math.max(0, 1.0 - (lootElapsed - 3500) / 2000);
            }
            
            ctx.globalAlpha = lootAlpha;
            ctx.shadowColor = planet.lastLootedIsSteal ? '#F43F5E' : '#10B981';
            ctx.shadowBlur = 8;
            
            // Background capsule for high contrast
            ctx.fillStyle = 'rgba(7, 9, 19, 0.95)';
            ctx.strokeStyle = planet.lastLootedIsSteal ? '#F43F5E' : '#10B981';
            ctx.lineWidth = 1.5;
            
            const textStr = planet.lastLootedIsSteal 
              ? `⚔️ PLUNDERED +${planet.lastLootedAmount} CR!` 
              : `💰 CAPTURED +${planet.lastLootedAmount} CR!`;
              
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            const textWidth = ctx.measureText(textStr).width;
            const padX = 8;
            const padY = 4;
            
            ctx.beginPath();
            ctx.roundRect(
              planet.x - textWidth / 2 - padX,
              floatY - 8 - padY,
              textWidth + padX * 2,
              16 + padY * 2,
              6
            );
            ctx.fill();
            ctx.stroke();
            
            // Text
            ctx.fillStyle = planet.lastLootedIsSteal ? '#F87171' : '#34D399';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(textStr, planet.x, floatY);
            
            ctx.restore();
          }
        }

        ctx.restore();
      });

      // Clean up smoothed positions for fleets that are no longer active
      const currentFleetIds = new Set(fleets.map((f) => f.id));
      smoothedFleetsRef.current.forEach((_, id) => {
        if (!currentFleetIds.has(id)) {
          smoothedFleetsRef.current.delete(id);
        }
      });

      // 12. Draw Traveling Fleets
      fleets.forEach((fleet) => {
        const fromPlanet = planets.find((p) => p.id === fleet.fromPlanetId);
        const toPlanet = planets.find((p) => p.id === fleet.toPlanetId);

        // Get smoothed position
        let smoothed = smoothedFleetsRef.current.get(fleet.id);
        if (!smoothed) {
          smoothed = { x: fleet.x, y: fleet.y };
          smoothedFleetsRef.current.set(fleet.id, smoothed);
        } else {
          // Smoothly move the visual representation toward the actual server position
          smoothed.x += (fleet.x - smoothed.x) * 0.15;
          smoothed.y += (fleet.y - smoothed.y) * 0.15;
        }
        const fx = smoothed.x;
        const fy = smoothed.y;

        // Compute angle of trajectory dynamically (towards target fleet or target planet)
        let dx = 1;
        let dy = 0;
        if (fleet.targetFleetId) {
          const targetFleet = fleets.find((f) => f.id === fleet.targetFleetId);
          if (targetFleet) {
            let tfSmoothed = smoothedFleetsRef.current.get(targetFleet.id) || targetFleet;
            dx = tfSmoothed.x - fx;
            dy = tfSmoothed.y - fy;
          } else if (toPlanet) {
            dx = toPlanet.x - fx;
            dy = toPlanet.y - fy;
          }
        } else if (fromPlanet && toPlanet) {
          dx = toPlanet.x - fromPlanet.x;
          dy = toPlanet.y - fromPlanet.y;
        }
        const angle = Math.atan2(dy, dx);

        // 12.1 Render Combat Lasers & Effects
        if (fleet.inCombat) {
          // Draw a laser beam to another enemy fleet nearby!
          const enemy = fleets.find(f => f.id !== fleet.id && f.ownerId !== fleet.ownerId && Math.sqrt((f.x - fleet.x)**2 + (f.y - fleet.y)**2) < 25);
          if (enemy) {
            let enemySmoothed = smoothedFleetsRef.current.get(enemy.id) || enemy;
            const ex = enemySmoothed.x;
            const ey = enemySmoothed.y;

            ctx.save();
            ctx.strokeStyle = fleet.ownerColor;
            ctx.lineWidth = 1.0 + Math.random() * 1.5;
            ctx.shadowColor = fleet.ownerColor;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.restore();

            // Spawn visual sparks/sparks on every few frames
            if (Math.random() > 0.6) {
              const midX = (fx + ex) / 2;
              const midY = (fy + ey) / 2;
              explosionsRef.current.push({
                x: midX + (Math.random() * 6 - 3),
                y: midY + (Math.random() * 6 - 3),
                vx: (Math.random() * 2.5 - 1.25),
                vy: (Math.random() * 2.5 - 1.25),
                color: Math.random() > 0.5 ? fleet.ownerColor : enemy.ownerColor,
                size: 1.2 + Math.random() * 2.2,
                alpha: 1,
                life: 0,
                maxLife: 12 + Math.floor(Math.random() * 12)
              });
            }
          }
        }

        if (fleet.isSieging && toPlanet) {
          ctx.save();
          ctx.strokeStyle = fleet.ownerColor;
          ctx.lineWidth = 1.2 + Math.random() * 1.8;
          ctx.shadowColor = fleet.ownerColor;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          // Hit orbital shield boundary/surface
          const surfaceOffsetAngle = Math.random() * Math.PI * 2;
          const hitX = toPlanet.x + Math.cos(surfaceOffsetAngle) * (toPlanet.size * 0.85);
          const hitY = toPlanet.y + Math.sin(surfaceOffsetAngle) * (toPlanet.size * 0.85);
          ctx.lineTo(hitX, hitY);
          ctx.stroke();
          ctx.restore();

          // Planet shield visual feedback/sparks
          if (Math.random() > 0.5) {
            explosionsRef.current.push({
              x: hitX,
              y: hitY,
              vx: (Math.random() * 2.0 - 1.0),
              vy: (Math.random() * 2.0 - 1.0),
              color: Math.random() > 0.35 ? '#FF9F1C' : fleet.ownerColor,
              size: 1.0 + Math.random() * 2.5,
              alpha: 1.0,
              life: 0,
              maxLife: 14 + Math.floor(Math.random() * 14)
            });
          }
        }

        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(angle);

        // Glow trail
        ctx.shadowColor = fleet.ownerColor;
        ctx.shadowBlur = 8;

        // Render mini ships as a sleek arrowhead shape
        ctx.fillStyle = fleet.ownerColor;
        ctx.beginPath();
        ctx.moveTo(8, 0);   // Nose
        ctx.lineTo(-4, -5); // Left wing
        ctx.lineTo(-2, 0);  // Tail center
        ctx.lineTo(-4, 5);  // Right wing
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0; // Reset
        ctx.restore();

        // Ship count bubble beside fleet (sleek black overlay with colored border)
        ctx.fillStyle = 'rgba(7, 9, 19, 0.9)';
        ctx.strokeStyle = fleet.ownerColor;
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.roundRect(fx - 12, fy - 20, 24, 14, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.ceil(fleet.ships).toString(), fx, fy - 13);

        // Draw high-tech target reticle if fleet is hovered
        const isHoveredFleet = hoveredFleetId === fleet.id;
        if (isHoveredFleet) {
          ctx.save();
          ctx.strokeStyle = '#EF4444'; // Tech Red lock
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(fx, fy, 14, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw little crosshairs
          ctx.beginPath();
          ctx.moveTo(fx - 18, fy); ctx.lineTo(fx - 10, fy);
          ctx.moveTo(fx + 10, fy); ctx.lineTo(fx + 18, fy);
          ctx.moveTo(fx, fy - 18); ctx.lineTo(fx, fy - 10);
          ctx.moveTo(fx, fy + 10); ctx.lineTo(fx, fy + 18);
          ctx.stroke();
          ctx.restore();
        }
      });

      // 12.4 Render Real-time Orbital Laser & Planet Breaker Firing Effects
      if (activeLasers && activeLasers.length > 0) {
        activeLasers.forEach((eff) => {
          const fromPlanet = planets.find((p) => p.id === eff.fromPlanetId);
          const toPlanet = planets.find((p) => p.id === eff.toPlanetId);
          if (!fromPlanet || !toPlanet) return;

          const elapsed = Date.now() - eff.firedAt;
          if (elapsed < 0 || elapsed > eff.duration) return;

          const dx = toPlanet.x - fromPlanet.x;
          const dy = toPlanet.y - fromPlanet.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          if (eff.type === 'breaker') {
            // ==========================================
            // PLANET BREAKER (LEVEL 3) VISUAL ENGINE
            // ==========================================
            if (elapsed < 2000) {
              // Phase A: Charging focus (0ms - 2000ms)
              const chargeRatio = elapsed / 2000;
              ctx.save();
              ctx.shadowColor = eff.color;
              ctx.shadowBlur = 20 + chargeRatio * 35;
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(fromPlanet.x, fromPlanet.y, fromPlanet.size * 0.4 + chargeRatio * 18, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();

              // Inward collapsing focus rings
              for (let r = 0; r < 3; r++) {
                const ringProgress = ((elapsed / 500) + r / 3) % 1.0;
                const radius = fromPlanet.size * 4.5 * (1.0 - ringProgress);
                ctx.save();
                ctx.strokeStyle = eff.color;
                ctx.lineWidth = 2.0 * (1.0 - ringProgress);
                ctx.shadowColor = eff.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(fromPlanet.x, fromPlanet.y, Math.max(fromPlanet.size * 0.5, radius), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }
            } else if (elapsed >= 2000 && elapsed < 2800) {
              // Phase B: Heavy plasma bolt travel (2000ms - 2800ms)
              const pct = (elapsed - 2000) / 800;
              const bx = fromPlanet.x + dx * pct;
              const by = fromPlanet.y + dy * pct;
              const tx = fromPlanet.x + dx * Math.max(0, pct - 0.22);
              const ty = fromPlanet.y + dy * Math.max(0, pct - 0.22);

              ctx.save();
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 14;
              ctx.shadowColor = eff.color;
              ctx.shadowBlur = 35;
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(bx, by);
              ctx.stroke();

              ctx.strokeStyle = eff.color;
              ctx.lineWidth = 28;
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(bx, by);
              ctx.stroke();
              ctx.restore();

              // Spark particles trailing the heavy bolt
              if (Math.random() > 0.3) {
                explosionsRef.current.push({
                  x: bx + (Math.random() * 12 - 6),
                  y: by + (Math.random() * 12 - 6),
                  vx: (Math.random() * 2 - 1) - (dx / distance) * 2,
                  vy: (Math.random() * 2 - 1) - (dy / distance) * 2,
                  color: '#FFFFFF',
                  size: 2 + Math.random() * 3,
                  alpha: 1.0,
                  life: 0,
                  maxLife: 15 + Math.floor(Math.random() * 15)
                });
              }
            } else {
              // Phase C: Catastrophic Core Impact & Engulfing Firestorm (2800ms - 4500ms)
              const impactProgress = (elapsed - 2800) / 1700; // 0.0 to 1.0
              const streamFade = 1.0 - Math.max(0, (elapsed - 3800) / 700);

              // 1. Thick direct hyper-beam connecting from source to target
              if (streamFade > 0) {
                ctx.save();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = (18 + Math.sin(Date.now() * 0.18) * 6) * streamFade;
                ctx.shadowColor = eff.color;
                ctx.shadowBlur = 45 * streamFade;
                ctx.beginPath();
                ctx.moveTo(fromPlanet.x, fromPlanet.y);
                ctx.lineTo(toPlanet.x, toPlanet.y);
                ctx.stroke();

                ctx.strokeStyle = eff.color;
                ctx.lineWidth = (36 + Math.sin(Date.now() * 0.18) * 12) * streamFade;
                ctx.beginPath();
                ctx.moveTo(fromPlanet.x, fromPlanet.y);
                ctx.lineTo(toPlanet.x, toPlanet.y);
                ctx.stroke();
                ctx.restore();
              }

              // 2. White-hot engulfing fire storm expansion at target
              ctx.save();
              ctx.shadowColor = '#FF5500';
              ctx.shadowBlur = 45 + Math.sin(Date.now() * 0.25) * 25;

              const radius = toPlanet.size * (1.2 + impactProgress * 2.2);
              const bubbleGrad = ctx.createRadialGradient(
                toPlanet.x, toPlanet.y, 4,
                toPlanet.x, toPlanet.y, radius
              );
              bubbleGrad.addColorStop(0, '#FFFFFF');
              bubbleGrad.addColorStop(0.2, '#F97316');
              bubbleGrad.addColorStop(0.5, '#EF4444');
              bubbleGrad.addColorStop(0.85, 'rgba(220, 38, 38, 0.4)');
              bubbleGrad.addColorStop(1.0, 'rgba(239, 68, 68, 0)');

              ctx.fillStyle = bubbleGrad;
              ctx.beginPath();
              ctx.arc(toPlanet.x, toPlanet.y, radius, 0, Math.PI * 2);
              ctx.fill();

              // Draw planet tearing cracks
              const numFissures = 10;
              ctx.strokeStyle = '#FF7700';
              ctx.lineWidth = 4 * (1.0 - impactProgress);
              for (let f = 0; f < numFissures; f++) {
                const fissureAngle = (f / numFissures) * Math.PI * 2 + (Math.sin(Date.now() * 0.05) * 0.1);
                ctx.beginPath();
                ctx.moveTo(toPlanet.x, toPlanet.y);
                ctx.lineTo(
                  toPlanet.x + Math.cos(fissureAngle) * (toPlanet.size * 1.5 * (1.0 + impactProgress)),
                  toPlanet.y + Math.sin(fissureAngle) * (toPlanet.size * 1.5 * (1.0 + impactProgress))
                );
                ctx.stroke();
              }
              ctx.restore();

              // 3. Massive particle shower
              if (Math.random() > 0.1) {
                const numParticles = 2;
                for (let k = 0; k < numParticles; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = 2 + Math.random() * 6;
                  explosionsRef.current.push({
                    x: toPlanet.x + Math.cos(angle) * (toPlanet.size * 0.5),
                    y: toPlanet.y + Math.sin(angle) * (toPlanet.size * 0.5),
                    vx: Math.cos(angle) * speed + (Math.random() * 2 - 1),
                    vy: Math.sin(angle) * speed + (Math.random() * 2 - 1),
                    color: ['#FFFFFF', '#FFA500', '#EF4444', '#FCD34D'][Math.floor(Math.random() * 4)],
                    size: 3.5 + Math.random() * 5.5,
                    alpha: 1.0,
                    life: 0,
                    maxLife: 25 + Math.floor(Math.random() * 30)
                  });
                }
              }

              // 4. Repeated massive expanding ring shockwaves on impact
              if (Math.random() > 0.88) {
                shockwavesRef.current.push({
                  x: toPlanet.x,
                  y: toPlanet.y,
                  color: '#FF3300',
                  radius: 10,
                  maxRadius: toPlanet.size * 4.5,
                  alpha: 1.0,
                  speed: 5.0
                });
              }
            }
          } else {
            // ==========================================
            // TACTICAL LASER (LEVEL 1 & 2) VISUAL ENGINE
            // ==========================================
            if (elapsed < 800) {
              // Phase A: Rapid laser bolt travel (0ms - 800ms)
              const pct = elapsed / 800;
              const bx = fromPlanet.x + dx * pct;
              const by = fromPlanet.y + dy * pct;
              const tx = fromPlanet.x + dx * Math.max(0, pct - 0.15);
              const ty = fromPlanet.y + dy * Math.max(0, pct - 0.15);

              ctx.save();
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 6;
              ctx.shadowColor = eff.color;
              ctx.shadowBlur = 20;
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(bx, by);
              ctx.stroke();

              ctx.strokeStyle = eff.color;
              ctx.lineWidth = 12;
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(bx, by);
              ctx.stroke();
              ctx.restore();
            } else {
              // Phase B: Strike Impact & Beam sustain (800ms - 2500ms)
              const beamFade = 1.0 - Math.max(0, (elapsed - 1600) / 900); // Fades during last 900ms

              // 1. Glowing continuous stream connecting both planets
              if (beamFade > 0) {
                ctx.save();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = (3 + Math.sin(Date.now() * 0.1) * 1.5) * beamFade;
                ctx.shadowColor = eff.color;
                ctx.shadowBlur = 20 * beamFade;
                ctx.beginPath();
                ctx.moveTo(fromPlanet.x, fromPlanet.y);
                ctx.lineTo(toPlanet.x, toPlanet.y);
                ctx.stroke();

                ctx.strokeStyle = eff.color;
                ctx.lineWidth = (8 + Math.sin(Date.now() * 0.1) * 3) * beamFade;
                ctx.beginPath();
                ctx.moveTo(fromPlanet.x, fromPlanet.y);
                ctx.lineTo(toPlanet.x, toPlanet.y);
                ctx.stroke();
                ctx.restore();
              }

              // 2. Continuous sparkling explosions at target
              if (elapsed < 2300 && Math.random() > 0.4) {
                const sparkAngle = Math.random() * Math.PI * 2;
                const sparkDist = Math.random() * toPlanet.size * 0.7;
                explosionsRef.current.push({
                  x: toPlanet.x + Math.cos(sparkAngle) * sparkDist,
                  y: toPlanet.y + Math.sin(sparkAngle) * sparkDist,
                  vx: (Math.random() * 4 - 2),
                  vy: (Math.random() * 4 - 2),
                  color: Math.random() > 0.4 ? '#FFFFFF' : eff.color,
                  size: 1.5 + Math.random() * 3.5,
                  alpha: 1.0,
                  life: 0,
                  maxLife: 15 + Math.floor(Math.random() * 15)
                });
              }

              // 3. Absorbing Deflector Shield dome if blocked
              if (eff.isShieldBlocked) {
                ctx.save();
                ctx.strokeStyle = '#38BDF8';
                ctx.lineWidth = 3.0 * beamFade;
                ctx.shadowColor = '#0EA5E9';
                ctx.shadowBlur = 15;
                ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
                ctx.beginPath();
                ctx.arc(toPlanet.x, toPlanet.y, toPlanet.size * 1.35, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                // Shield sparks
                if (elapsed < 2300 && Math.random() > 0.6) {
                  const shieldAngle = Math.random() * Math.PI * 2;
                  const sx = toPlanet.x + Math.cos(shieldAngle) * (toPlanet.size * 1.35);
                  const sy = toPlanet.y + Math.sin(shieldAngle) * (toPlanet.size * 1.35);
                  explosionsRef.current.push({
                    x: sx,
                    y: sy,
                    vx: Math.cos(shieldAngle) * 2 + (Math.random() * 1.5 - 0.75),
                    vy: Math.sin(shieldAngle) * 2 + (Math.random() * 1.5 - 0.75),
                    color: '#38BDF8',
                    size: 1.5 + Math.random() * 2,
                    alpha: 1.0,
                    life: 0,
                    maxLife: 12 + Math.floor(Math.random() * 12)
                  });
                }
              } else {
                // Non-blocked: standard impact shockwaves
                if (elapsed < 1100 && Math.random() > 0.85) {
                  shockwavesRef.current.push({
                    x: toPlanet.x,
                    y: toPlanet.y,
                    color: eff.color,
                    radius: 5,
                    maxRadius: toPlanet.size * 2.0,
                    alpha: 1.0,
                    speed: 3.0
                  });
                }
              }
            }
          }
        });
      }

      // 12.5 Update & Draw Combat Shockwaves
      const activeShockwaves = shockwavesRef.current;
      for (let i = activeShockwaves.length - 1; i >= 0; i--) {
        const s = activeShockwaves[i];
        s.radius += s.speed;
        s.alpha = 1 - (s.radius / s.maxRadius);

        if (s.radius >= s.maxRadius) {
          activeShockwaves.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = s.alpha;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 13. Update & Draw Combat Explosions
      const activeExplosions = explosionsRef.current;
      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const p = activeExplosions[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95; // drag deceleration
        p.vy *= 0.95;
        p.life++;
        p.alpha = 1 - (p.life / p.maxLife);

        if (p.life >= p.maxLife) {
          activeExplosions.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();

      // Request next frame
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [planets, fleets, players, currentPlayerId, selectedPlanetId, hoveredPlanetId, isDragging, dragStartPlanetId, mousePos, zoom, pan, canvasSize, mapWidth, mapHeight]);

  const hoveredPlanet = planets.find((p) => p.id === hoveredPlanetId);
  const hoveredFleet = fleets.find((f) => f.id === hoveredFleetId);

  // Zoom on mouse scroll (wheel) event
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    hasInteractedRef.current = true;

    const zoomIntensity = 0.08;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
    const newZoom = Math.min(4, Math.max(0.15, zoom * zoomFactor));

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleZoomIn = () => {
    hasInteractedRef.current = true;
    const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
    const worldCenter = {
      x: (center.x - pan.x) / zoom,
      y: (center.y - pan.y) / zoom,
    };
    const newZoom = Math.min(4, zoom * 1.25);
    const newPanX = center.x - worldCenter.x * newZoom;
    const newPanY = center.y - worldCenter.y * newZoom;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleZoomOut = () => {
    hasInteractedRef.current = true;
    const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
    const worldCenter = {
      x: (center.x - pan.x) / zoom,
      y: (center.y - pan.y) / zoom,
    };
    const newZoom = Math.max(0.15, zoom * 0.8);
    const newPanX = center.x - worldCenter.x * newZoom;
    const newPanY = center.y - worldCenter.y * newZoom;
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleResetZoom = () => {
    hasInteractedRef.current = false;
    fitToScreen();
  };

  const tooltipStyle: React.CSSProperties = {};
  if (hoveredPlanet || hoveredFleet) {
    const targetX = hoveredPlanet ? hoveredPlanet.x : (hoveredFleet ? hoveredFleet.x : mousePos.x);
    const targetY = hoveredPlanet ? hoveredPlanet.y : (hoveredFleet ? hoveredFleet.y : mousePos.y);

    const screenX = targetX * zoom + pan.x;
    const screenY = targetY * zoom + pan.y;

    if (screenY > canvasSize.height / 2) {
      tooltipStyle.bottom = `${canvasSize.height - screenY + 15}px`;
      tooltipStyle.top = 'auto';
    } else {
      tooltipStyle.top = `${screenY + 15}px`;
      tooltipStyle.bottom = 'auto';
    }

    if (screenX > canvasSize.width / 2) {
      tooltipStyle.right = `${canvasSize.width - screenX + 15}px`;
      tooltipStyle.left = 'auto';
    } else {
      tooltipStyle.left = `${screenX + 15}px`;
      tooltipStyle.right = 'auto';
    }
  }

  // Find fleets currently sieging this planet
  const planetSiegeFleets = hoveredPlanet
    ? fleets.filter((f) => f.toPlanetId === hoveredPlanet.id && f.isSieging)
    : [];
  const planetUnderAttack = planetSiegeFleets.length > 0;

  // Find opposing fleets in combat range
  const opposingFleets = hoveredFleet
    ? fleets.filter((f) => f.ownerId !== hoveredFleet.ownerId && Math.sqrt((f.x - hoveredFleet.x) ** 2 + (f.y - hoveredFleet.y) ** 2) < 28)
    : [];

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#070913] rounded-xl border border-slate-800/80 shadow-2xl shadow-indigo-950/20">
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="block cursor-crosshair w-full h-full select-none touch-none bg-[#070913]"
        id="conquest-canvas"
      />

      {/* Floating Tactical Zoom / Pan Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-950/85 border border-slate-800/80 p-1.5 rounded-lg backdrop-blur-sm z-20 shadow-xl">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="w-7 h-7 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/85 transition cursor-pointer select-none"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="w-7 h-7 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/85 transition cursor-pointer select-none"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetZoom}
          title="Recenter Sector Map"
          className="w-7 h-7 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800/85 transition cursor-pointer select-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono text-slate-400 px-1 select-none">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Floating Dynamic Tactical Tooltip for Planets */}
      {hoveredPlanet && (() => {
        const owner = players.find((p) => p.id === hoveredPlanet.ownerId);
        const isSelf = owner && owner.id === currentPlayerId;
        const isBot = owner && owner.isBot;
        const isMinor = owner && owner.isMinorFaction;
        
        let ownerTypeLabel = 'Neutral / Autonomous';
        let badgeColor = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        if (owner) {
          if (isSelf) {
            ownerTypeLabel = 'Your Faction';
            badgeColor = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
          } else if (isMinor) {
            ownerTypeLabel = 'Minor Faction (NPC)';
            badgeColor = 'bg-pink-500/10 text-pink-400 border-pink-500/20';
          } else if (isBot) {
            ownerTypeLabel = 'Tactical Bot (AI)';
            badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
          } else {
            ownerTypeLabel = 'Active Rival (Player)';
            badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
          }
        }

        return (
          <div 
            style={tooltipStyle}
            className="absolute pointer-events-none z-30 w-72 bg-slate-950/95 border border-slate-800/85 rounded-xl p-3 shadow-2xl backdrop-blur-md text-sans text-xs flex flex-col gap-2.5 transition-all duration-150"
          >
            {/* Header */}
            <div className="border-b border-slate-850 pb-2">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="font-bold text-slate-100 text-[13px] truncate">
                  {hoveredPlanet.name}
                </span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded border font-semibold tracking-wider uppercase font-mono ${badgeColor}`}>
                  {ownerTypeLabel}
                </span>
              </div>
              <div className="text-[10px] text-indigo-400 font-mono flex items-center gap-1.5">
                <span>
                  {hoveredPlanet.type === 'shipyard' && '🚢 Shipyard Class System'}
                  {hoveredPlanet.type === 'fortress' && '🛡️ Fortress Class System'}
                  {hoveredPlanet.type === 'tech_lab' && '🔬 Science Laboratory System'}
                  {hoveredPlanet.type === 'standard' && '🪐 Standard System'}
                </span>
              </div>
            </div>

            {/* Planet Stats */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                <div className="text-slate-500">Garrison Fleet</div>
                <div className="font-bold text-slate-200 mt-0.5">
                  {Math.ceil(hoveredPlanet.ships)} / {hoveredPlanet.maxShips}
                </div>
              </div>
              <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                <div className="text-slate-500">Growth Rate</div>
                <div className="font-bold text-slate-200 mt-0.5">
                  +{hoveredPlanet.growthRate.toFixed(1)}/s
                </div>
              </div>
              <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                <div className="text-slate-500">Planet Shields</div>
                <div className="font-bold text-slate-200 mt-0.5">
                  {hoveredPlanet.defenseBonus.toFixed(1)}x
                </div>
              </div>
              <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                <div className="text-slate-500">Resources</div>
                <div className="font-bold text-amber-400 mt-0.5 flex items-center gap-1">
                  {hoveredPlanet.resourceType === 'credits' ? '💎' :
                   hoveredPlanet.resourceType === 'energy' ? '⚡' :
                   hoveredPlanet.resourceType === 'alloy' ? '🛠️' : '⚙️'}
                  <span>
                    +{hoveredPlanet.resourceValue || 1.2}/s
                  </span>
                </div>
              </div>
            </div>

            {/* Active Siege Battle details */}
            {planetUnderAttack && (
              <div className="border-t border-rose-950/40 pt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                  <span className="text-[9px] font-bold text-rose-400 font-mono uppercase tracking-wider">Planetary Siege Active</span>
                </div>
                <div className="flex flex-col gap-1 text-[9px] font-mono text-slate-300 bg-rose-950/15 border border-rose-900/25 rounded p-1.5">
                  {planetSiegeFleets.map((fleet) => {
                    const attacker = players.find((p) => p.id === fleet.ownerId);
                    return (
                      <div key={fleet.id} className="flex justify-between items-center gap-2">
                        <span className="truncate flex-1 flex items-center gap-1 text-slate-400">
                          <span>{attacker?.emoji || '🚀'}</span>
                          <span className="truncate">{attacker?.name || 'Invasion Force'}</span>
                        </span>
                        <span className="text-rose-400 font-bold shrink-0">{Math.ceil(fleet.ships)} ships</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Owner Empire Specs (only if owned) */}
            {owner && (
              <div className="border-t border-slate-850 pt-2 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl flex-shrink-0">{owner.emoji || '👽'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-200 truncate">{owner.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{owner.empireName || 'Terran Alliance'}</div>
                  </div>
                </div>

                {/* Alien Physical Attributes */}
                {(owner.alienSkin || owner.alienEyes) && (
                  <div className="flex flex-wrap gap-1 text-[8px] font-mono text-slate-400">
                    {owner.alienSkin && (
                      <span className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800">
                        🧬 {owner.alienSkin}
                      </span>
                    )}
                    {owner.alienEyes && (
                      <span className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800">
                        👁️ {owner.alienEyes}
                      </span>
                    )}
                  </div>
                )}

                {/* Empire Starting Trait */}
                {owner.empireTrait && (
                  <div className="text-[10px] bg-indigo-950/25 border border-indigo-900/30 rounded p-1.5 font-sans leading-normal">
                    <span className="font-bold text-indigo-400 font-mono text-[9px] block uppercase mb-0.5">Starting Trait</span>
                    <span className="text-slate-300">
                      {owner.empireTrait === 'hyperdrive' && '🚀 Hyperdrive Tuning (+20% Fleet Speed)'}
                      {owner.empireTrait === 'industrial' && '⚡ Industrial Automata (+15% Shipyard Growth Rate)'}
                      {owner.empireTrait === 'orbital' && '🛡️ Orbital Fortifications (+20% Planetary Defense)'}
                      {owner.empireTrait === 'quantum' && '📈 Quantum Extraction (+15% Passive Credits Income)'}
                      {owner.empireTrait === 'reserves' && '🎯 Auxiliary Reserves (Started with +100 Credits)'}
                      {owner.empireTrait === 'balanced' && '⚖️ Zenith Balance (Standard specifications)'}
                    </span>
                  </div>
                )}

                {/* Empire Tech Upgrade Levels */}
                <div className="text-[9px] font-mono border-t border-slate-900/40 pt-1.5">
                  <span className="text-slate-500 block uppercase mb-1 tracking-wider font-bold">Active Research</span>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-1.5 text-slate-400">
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                      <span className="text-cyan-400 font-medium">Hyperdrive:</span>
                      <span className="text-cyan-400 font-bold">Lvl {owner.upgrades.speed || 0}/10</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                      <span className="text-emerald-400 font-medium">Shipyard:</span>
                      <span className="text-emerald-400 font-bold">Lvl {owner.upgrades.production || 0}/10</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                      <span className="text-indigo-400 font-medium">Shields:</span>
                      <span className="text-indigo-400 font-bold">Lvl {owner.upgrades.defense || 0}/10</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                      <span className="text-yellow-400 font-medium">Deep Mining:</span>
                      <span className="text-yellow-400 font-bold">Lvl {owner.upgrades.sensors || 0}/10</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40 col-span-2">
                      <span className="text-purple-400 font-medium">Naval Capacity:</span>
                      <span className="text-purple-400 font-bold">Lvl {owner.upgrades.capacity || 0}/10</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40 col-span-2">
                      <span className="text-rose-400 font-medium">Weapons Tech:</span>
                      <span className="text-rose-400 font-bold">Lvl {owner.upgrades.weapons || 0}/10</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Floating Dynamic Tactical Tooltip for Fleets & Space Battles */}
      {hoveredFleet && (() => {
        const owner = players.find((p) => p.id === hoveredFleet.ownerId);
        const targetPlanet = planets.find((p) => p.id === hoveredFleet.toPlanetId);
        const originPlanet = planets.find((p) => p.id === hoveredFleet.fromPlanetId);
        const isInCombat = hoveredFleet.inCombat;

        return (
          <div 
            style={tooltipStyle}
            className="absolute pointer-events-none z-30 w-72 bg-slate-950/95 border border-slate-800/85 rounded-xl p-3 shadow-2xl backdrop-blur-md text-sans text-xs flex flex-col gap-2.5 transition-all duration-150"
          >
            {isInCombat ? (
              <>
                {/* Combat Header */}
                <div className="border-b border-rose-900/30 pb-2">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="font-bold text-rose-400 text-[13px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                      💥 Space Skirmish
                    </span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded border border-rose-900/40 bg-rose-950/15 text-rose-400 font-semibold tracking-wider uppercase font-mono">
                      Active Battle
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Location: Sector [{Math.round(hoveredFleet.x)}, {Math.round(hoveredFleet.y)}]
                  </p>
                </div>

                {/* Combatants */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">Engaged Forces</span>
                  <div className="flex flex-col gap-1.5">
                    {/* Current fleet */}
                    <div className="flex items-center justify-between bg-slate-900/40 p-1.5 rounded border border-slate-800/30">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-base">{owner?.emoji || '🚀'}</span>
                        <span className="font-bold text-slate-200 truncate">{owner?.name || 'Invasion Fleet'}</span>
                      </div>
                      <span className="text-indigo-400 font-mono font-bold text-[10px]">{Math.ceil(hoveredFleet.ships)} ships</span>
                    </div>

                    <div className="text-center text-[9px] font-mono text-rose-500 font-bold">VS</div>

                    {/* Opposing fleets */}
                    {opposingFleets.length > 0 ? (
                      opposingFleets.map((of) => {
                        const ofOwner = players.find((p) => p.id === of.ownerId);
                        return (
                          <div key={of.id} className="flex items-center justify-between bg-slate-900/40 p-1.5 rounded border border-slate-800/30">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-base">{ofOwner?.emoji || '🚀'}</span>
                              <span className="font-bold text-slate-200 truncate">{ofOwner?.name || 'Defending Fleet'}</span>
                            </div>
                            <span className="text-rose-400 font-mono font-bold text-[10px]">{Math.ceil(of.ships)} ships</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[10px] text-slate-500 font-mono italic text-center">Hostile squadron engaged</div>
                    )}
                  </div>
                </div>

                <p className="text-[9px] text-slate-500 font-mono leading-normal pt-1 border-t border-slate-900/40">
                  Weapon systems are actively cycling. Hyperdrive navigation is offline until combat completes.
                </p>
              </>
            ) : (
              <>
                {/* Transit Header */}
                <div className="border-b border-slate-850 pb-2">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="font-bold text-slate-100 text-[13px] flex items-center gap-1.5">
                      🚀 Transit Fleet
                    </span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded border border-slate-800/40 bg-slate-900 text-slate-400 font-semibold tracking-wider uppercase font-mono">
                      En Route
                    </span>
                  </div>
                  <p className="text-[10px] text-indigo-400 font-mono">
                    Owner: {owner?.name || 'Autonomous Force'}
                  </p>
                </div>

                {/* Fleet details */}
                <div className="flex flex-col gap-2 font-mono text-[10px]">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                      <div className="text-slate-500">Fleet Size</div>
                      <div className="font-bold text-slate-200 mt-0.5">{Math.ceil(hoveredFleet.ships)} ships</div>
                    </div>
                    <div className="bg-slate-900/40 p-1.5 rounded border border-slate-800/40">
                      <div className="text-slate-500">Speed Rating</div>
                      <div className="font-bold text-slate-200 mt-0.5">{(hoveredFleet.speed * 200).toFixed(0)} knots</div>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 p-2 rounded border border-slate-800/40 flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Origin:</span>
                      <span className="text-slate-300 truncate max-w-[140px]">{originPlanet?.name || 'Deep Space'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Destination:</span>
                      <span className="text-slate-300 truncate max-w-[140px]">{targetPlanet?.name || 'Deep Space'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800/30 pt-1 mt-1 font-bold">
                      <span className="text-slate-500">Arrival:</span>
                      <span className="text-indigo-400">{Math.round(hoveredFleet.progress * 100)}%</span>
                    </div>
                  </div>

                  {owner && (
                    <div className="text-[9px] font-mono border-t border-slate-900/40 pt-2 mt-1">
                      <span className="text-slate-500 block uppercase mb-1.5 tracking-wider font-bold">Active Research</span>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-1.5 text-slate-400">
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                          <span className="text-cyan-400 font-medium">Hyperdrive:</span>
                          <span className="text-cyan-400 font-bold">Lvl {owner.upgrades?.speed || 0}/10</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                          <span className="text-emerald-400 font-medium">Shipyard:</span>
                          <span className="text-emerald-400 font-bold">Lvl {owner.upgrades?.production || 0}/10</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                          <span className="text-indigo-400 font-medium">Shields:</span>
                          <span className="text-indigo-400 font-bold">Lvl {owner.upgrades?.defense || 0}/10</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40">
                          <span className="text-yellow-400 font-medium">Deep Mining:</span>
                          <span className="text-yellow-400 font-bold">Lvl {owner.upgrades?.sensors || 0}/10</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40 col-span-2">
                          <span className="text-purple-400 font-medium">Naval Capacity:</span>
                          <span className="text-purple-400 font-bold">Lvl {owner.upgrades?.capacity || 0}/10</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/45 px-1.5 py-1 rounded border border-slate-800/40 col-span-2">
                          <span className="text-rose-400 font-medium">Weapons Tech:</span>
                          <span className="text-rose-400 font-bold">Lvl {owner.upgrades?.weapons || 0}/10</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Visual Instruction Overlay */}
      {showInstructions && (
        <div 
          onClick={() => setShowInstructions(false)}
          className="absolute top-4 left-4 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 backdrop-blur-sm cursor-pointer select-none transition-all duration-300 z-20 flex items-center gap-2 max-w-[90%]"
        >
          <p className="text-xs text-slate-300 font-sans flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping flex-shrink-0"></span>
            Drag from your planet to conquer systems | Scroll or Drag empty space to pan & zoom
          </p>
          <span className="text-[11px] text-slate-500 hover:text-slate-300 ml-1 font-mono">×</span>
        </div>
      )}
    </div>
  );
}
