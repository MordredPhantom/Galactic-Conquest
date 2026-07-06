import React, { useEffect, useState, useRef } from 'react';
import { 
  Lobby, 
  Player, 
  LeaderboardEntry, 
  ClientMessage, 
  ServerMessage, 
  PlayerUpgrades,
  PlayerColor
} from './types';
import GameCanvas from './components/GameCanvas';
import { 
  Shield, 
  Zap, 
  Rocket, 
  Award, 
  MessageSquare, 
  UserPlus, 
  Users, 
  Power, 
  TrendingUp, 
  ArrowRight, 
  Plus, 
  Crown, 
  BookOpen, 
  Target, 
  AlertTriangle,
  Radio,
  Globe,
  Package,
  Flame,
  Swords
} from 'lucide-react';

export default function App() {
  // Websocket state
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [publicLobbies, setPublicLobbies] = useState<{ code: string; hostName: string; playerCount: number; status: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [commanderName, setCommanderName] = useState(() => {
    return localStorage.getItem('commanderName') || '';
  });
  const [empireName, setEmpireName] = useState(() => {
    return localStorage.getItem('empireName') || 'Terran Alliance';
  });
  const [selectedEmoji, setSelectedEmoji] = useState(() => {
    return localStorage.getItem('selectedEmoji') || '👽';
  });
  const [alienSkin, setAlienSkin] = useState(() => {
    return localStorage.getItem('alienSkin') || 'Nebula Teal';
  });
  const [alienEyes, setAlienEyes] = useState(() => {
    return localStorage.getItem('alienEyes') || 'Standard Sight';
  });
  const [empireTrait, setEmpireTrait] = useState(() => {
    return localStorage.getItem('empireTrait') || 'balanced';
  });
  const [inputLobbyCode, setInputLobbyCode] = useState('');
  const [chatInput, setChatInput] = useState('');

  // Local game states
  const [playerId, setPlayerId] = useState<string | null>(() => {
    return sessionStorage.getItem('gcPlayerId') || null;
  });
  const [launchPercent, setLaunchPercent] = useState<number>(50); // 25, 50, 75, 100%

  // Planetary Facilities and Targeting Weapon state
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null);
  const [isTargetingWeapon, setIsTargetingWeapon] = useState<boolean>(false);

  const [, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 250); // fast ticking for responsive countdown updates
    return () => clearInterval(timer);
  }, []);

  // Use refs for values that shouldn't trigger WebSocket re-connection
  const playerIdRef = useRef<string | null>(sessionStorage.getItem('gcPlayerId'));
  const commanderNameRef = useRef<string>('');
  const lobbyCodeRef = useRef<string | null>(sessionStorage.getItem('gcLobbyCode'));

  useEffect(() => {
    playerIdRef.current = playerId;
    if (playerId) {
      sessionStorage.setItem('gcPlayerId', playerId);
    } else {
      sessionStorage.removeItem('gcPlayerId');
    }
  }, [playerId]);

  useEffect(() => {
    commanderNameRef.current = commanderName;
  }, [commanderName]);

  useEffect(() => {
    lobbyCodeRef.current = lobby ? lobby.code : sessionStorage.getItem('gcLobbyCode');
    if (lobby) {
      sessionStorage.setItem('gcLobbyCode', lobby.code);
    }
  }, [lobby]);

  // Refs for the scrollable chat containers
  const lobbyChatContainerRef = useRef<HTMLDivElement | null>(null);
  const gameChatContainerRef = useRef<HTMLDivElement | null>(null);

  // Initialize Websocket Connection
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setErrorMsg(null);
        if (playerIdRef.current && lobbyCodeRef.current) {
          ws.send(JSON.stringify({
            type: 'reconnect_lobby',
            payload: { playerId: playerIdRef.current, lobbyCode: lobbyCodeRef.current }
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          switch (msg.type) {
            case 'lobby_update':
              // If we intentionally left, ignore any delayed lobby updates
              if (!sessionStorage.getItem('gcLobbyCode')) {
                break;
              }
              setLobby(msg.payload.lobby);
              sessionStorage.setItem('gcLobbyCode', msg.payload.lobby.code);
              // Fallback identify our current playerId if not already set
              if (!playerIdRef.current && commanderNameRef.current) {
                const matched = msg.payload.lobby.players.find(
                  (p) => p.name.toLowerCase() === commanderNameRef.current.toLowerCase() && !p.isBot
                );
                if (matched) {
                  setPlayerId(matched.id);
                  sessionStorage.setItem('gcPlayerId', matched.id);
                }
              }
              break;
            case 'join_success':
              setPlayerId(msg.payload.playerId);
              sessionStorage.setItem('gcPlayerId', msg.payload.playerId);
              sessionStorage.setItem('gcLobbyCode', msg.payload.lobbyCode);
              break;
            case 'leaderboard_update':
              setLeaderboard(msg.payload.leaderboard);
              break;
            case 'public_lobbies':
              setPublicLobbies(msg.payload.lobbies);
              break;
            case 'reconnect_fail':
              setLobby(null);
              setPlayerId(null);
              sessionStorage.removeItem('gcPlayerId');
              sessionStorage.removeItem('gcLobbyCode');
              break;
            case 'error':
              setErrorMsg(msg.payload.message);
              setTimeout(() => setErrorMsg(null), 4000);
              break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket response: ', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Attempt automated reconnection every 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      setSocket(ws);
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // Save commander configuration to local storage
  useEffect(() => {
    if (commanderName) {
      localStorage.setItem('commanderName', commanderName);
    }
  }, [commanderName]);

  useEffect(() => {
    if (empireName) {
      localStorage.setItem('empireName', empireName);
    }
  }, [empireName]);

  useEffect(() => {
    if (selectedEmoji) {
      localStorage.setItem('selectedEmoji', selectedEmoji);
    }
  }, [selectedEmoji]);

  useEffect(() => {
    if (alienSkin) {
      localStorage.setItem('alienSkin', alienSkin);
    }
  }, [alienSkin]);

  useEffect(() => {
    if (alienEyes) {
      localStorage.setItem('alienEyes', alienEyes);
    }
  }, [alienEyes]);

  useEffect(() => {
    if (empireTrait) {
      localStorage.setItem('empireTrait', empireTrait);
    }
  }, [empireTrait]);

  // Keep chat scrolled down
  useEffect(() => {
    if (lobbyChatContainerRef.current) {
      lobbyChatContainerRef.current.scrollTop = lobbyChatContainerRef.current.scrollHeight;
    }
    if (gameChatContainerRef.current) {
      gameChatContainerRef.current.scrollTop = gameChatContainerRef.current.scrollHeight;
    }
  }, [lobby?.chat]);

  // Message dispatcher helper
  const sendMessage = (msg: ClientMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      setErrorMsg('Lost connection to central galactic command server.');
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Lobby actions
  const handleCreateLobby = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commanderName.trim()) {
      setErrorMsg('Please specify your Commander name first!');
      return;
    }
    sendMessage({ 
      type: 'join_lobby', 
      payload: { 
        name: commanderName, 
        code: '', 
        emoji: selectedEmoji, 
        empireName: empireName,
        alienEyes,
        alienSkin,
        empireTrait
      } 
    });
  };

  const handleJoinLobby = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commanderName.trim()) {
      setErrorMsg('Please specify your Commander name first!');
      return;
    }
    if (!inputLobbyCode.trim()) {
      setErrorMsg('Please enter a 4-letter sector code!');
      return;
    }
    sendMessage({ 
      type: 'join_lobby', 
      payload: { 
        name: commanderName, 
        code: inputLobbyCode, 
        emoji: selectedEmoji, 
        empireName: empireName,
        alienEyes,
        alienSkin,
        empireTrait
      } 
    });
  };

  const handleAddBot = (difficulty: 'easy' | 'medium' | 'hard') => {
    sendMessage({ type: 'add_bot', payload: { difficulty } });
  };

  const handleKickPlayer = (idToKick: string) => {
    sendMessage({ type: 'remove_player', payload: { playerId: idToKick } });
  };

  const handleToggleReady = () => {
    sendMessage({ type: 'toggle_ready' });
  };

  const handleStartGame = () => {
    sendMessage({ type: 'start_game' });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendMessage({ type: 'send_chat', payload: { text: chatInput } });
    setChatInput('');
  };

  // Battle controls
  const handleLaunchFleet = (fromPlanetId: string, toPlanetId?: string, targetFleetId?: string) => {
    sendMessage({
      type: 'launch_fleet',
      payload: { fromPlanetId, toPlanetId, targetFleetId, percent: launchPercent },
    });
  };

  const handleBuyUpgrade = (category: keyof PlayerUpgrades) => {
    sendMessage({ type: 'purchase_upgrade', payload: { category } });
  };

  const handleLeaveLobby = () => {
    sendMessage({ type: 'leave_lobby' });
    sessionStorage.removeItem('gcPlayerId');
    sessionStorage.removeItem('gcLobbyCode');
    playerIdRef.current = null;
    lobbyCodeRef.current = null;
    setLobby(null);
    setPlayerId(null);
    if (socket) {
      socket.close();
    }
  };

  // Find player details in current state
  const selfPlayer = lobby?.players.find((p) => p.id === playerId);
  const isHost = selfPlayer?.isHost || false;

  const isPlaying = lobby && lobby.status === 'playing';

  const playerTotalShips = lobby ? (
    lobby.planets.filter((pl) => pl.ownerId === playerId && !pl.isDestroyed).reduce((acc, pl) => acc + Math.floor(pl.ships), 0) +
    lobby.fleets.filter((fl) => fl.ownerId === playerId).reduce((acc, fl) => acc + Math.floor(fl.ships), 0)
  ) : 0;
  const playerCapacityLevel = selfPlayer?.upgrades?.capacity || 0;
  const playerPlanetsCount = lobby ? lobby.planets.filter((pl) => pl.ownerId === playerId && !pl.isDestroyed).length : 0;
  const playerGlobalCap = 1000 + playerCapacityLevel * 500 + playerPlanetsCount * 100;

  return (
    <div className={`w-screen bg-[#070913] text-slate-100 font-sans flex flex-col ${
      isPlaying ? 'h-screen overflow-hidden' : 'min-h-screen overflow-y-auto'
    } selection:bg-indigo-500/30 selection:text-indigo-200`}>
      
      {/* Top Status Banner */}
      <header className="border-b border-slate-900 bg-slate-950/40 backdrop-blur-md px-6 py-2.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center font-bold tracking-wider text-white shadow-lg shadow-indigo-500/20">
              GC
            </div>
            {isConnected ? (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#070913]" title="Online"></span>
            ) : (
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-rose-500 border-2 border-[#070913]" title="Connecting"></span>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              GALACTIC CONQUEST
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono border border-indigo-500/20">
                REAL-TIME MULTIPLAYER
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">Continuous Map Simulation Engine</p>
          </div>
        </div>

        {lobby && (
          <div className="flex items-center gap-4">
            <span className="text-xs px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              Players: {lobby.players.length}/7
            </span>
            <button
              onClick={handleLeaveLobby}
              className="text-xs px-3 py-1.5 rounded-lg border border-rose-950 bg-rose-950/20 text-rose-400 hover:bg-rose-900/30 hover:border-rose-900 transition flex items-center gap-1"
            >
              <Power className="w-3.5 h-3.5" />
              Leave Sector
            </button>
          </div>
        )}
      </header>

      {/* Global Toast Error */}
      {errorMsg && (
        <div className="max-w-md mx-auto mt-4 mx-6 p-4 rounded-xl border border-rose-900/40 bg-rose-950/30 text-rose-300 flex items-start gap-3 shadow-lg shadow-rose-950/10 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Galactic Server Broadcast</p>
            <p className="text-xs text-rose-400 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Primary Layout Router */}
      <main className={`flex-1 ${isPlaying ? 'min-h-0 h-full' : ''} p-4 md:p-5 max-w-7xl w-full mx-auto flex flex-col`}>
        {!lobby ? (
          
          /* ==========================================================
             SCREEN 1: SPLASH & LOBBY ENTRANCE
             ========================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start my-auto">
            {/* Action Card */}
            <div className="lg:col-span-7 bg-slate-950/40 border border-slate-900 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full filter blur-3xl pointer-events-none"></div>
              
              <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Initialize Sector Gateway</h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                Connect your planetary array to the tactical conquest fleet coordinates. Form a defense lobby, recruit auxiliary AI systems, or deploy to hostile warzones with an access code.
              </p>

              <form className="space-y-6">
                {/* Name & Empire Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name Input */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Commander Call Sign</label>
                    <input
                      type="text"
                      value={commanderName}
                      onChange={(e) => setCommanderName(e.target.value.slice(0, 16))}
                      placeholder="Enter Commander Name (e.g., Alice)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/50 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium transition"
                      maxLength={16}
                      id="commander-name-input"
                    />
                  </div>

                  {/* Empire Name Input */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Empire Designation</label>
                    <input
                      type="text"
                      value={empireName}
                      onChange={(e) => setEmpireName(e.target.value.slice(0, 24))}
                      placeholder="Enter Empire Name (e.g., Terran Alliance)"
                      className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/50 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium transition"
                      maxLength={24}
                      id="empire-name-input"
                    />
                  </div>
                </div>

                {/* Custom Emblem / Emoji Picker */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Faction Emblem (Custom Avatar)</label>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-3 bg-slate-900/30 rounded-xl border border-slate-800/60">
                    {['👽', '👾', '🤖', '🛸', '🐙', '👹', '🪐', '🦎', '🕷️', '🦠'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setSelectedEmoji(emoji)}
                        className={`text-2xl p-2 rounded-lg transition hover:bg-slate-800/50 flex items-center justify-center ${
                          selectedEmoji === emoji 
                            ? 'bg-indigo-600/30 border border-indigo-500 shadow-sm shadow-indigo-500/20 scale-110' 
                            : 'border border-transparent'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Alien Appearance & Stat Upgrades */}
                <div className="space-y-6 pt-4 border-t border-slate-900/60">
                  {/* Faction Trait Picker */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Unique Empire Trait (Select Starting Bonus)</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { 
                          id: 'balanced', 
                          name: 'Zenith Standard', 
                          desc: 'Standard specifications across speed, economy, and production.', 
                          bonus: 'Normal (No Trait)',
                          icon: Award, 
                          color: 'text-slate-400',
                          badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        },
                        { 
                          id: 'scavenger', 
                          name: 'Debris Salvagers', 
                          desc: 'Orbital scrap harvesters. Capturing any planet instantly awards a salvage bounty of 45 Credits and 10 ships.', 
                          bonus: 'Capture Scrap Harvest', 
                          icon: Zap, 
                          color: 'text-rose-400',
                          badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        },
                        { 
                          id: 'nanites', 
                          name: 'Regenerative Swarm', 
                          desc: 'Self-replicating nanite hulls. Traveling fleets that are not in combat regenerate +1.5 ships per second in deep space.', 
                          bonus: 'In-Transit Fleet Repair', 
                          icon: Shield, 
                          color: 'text-emerald-400',
                          badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        },
                        { 
                          id: 'vanguard', 
                          name: 'Neutral Vanguard', 
                          desc: 'Expedited colonization. Ignore defense bonus of Neutral planets entirely, and captured Neutral planets start with +12 ships.', 
                          bonus: 'Expedited Colonization', 
                          icon: Rocket, 
                          color: 'text-indigo-400',
                          badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        },
                        { 
                          id: 'overload', 
                          name: 'Overcharged Cores', 
                          desc: 'Volatile reactor grids. When an enemy captures one of your planets, the core overloads, vaporizing 50% of the invading forces.', 
                          bonus: 'Planet Core Overload Trap', 
                          icon: AlertTriangle, 
                          color: 'text-amber-400',
                          badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        },
                        { 
                          id: 'syndicate', 
                          name: 'Syndicate Contacts', 
                          desc: 'Connected shadow network. All technology upgrades cost 25% less credits, and starts with 150 Credits (+50 bonus).', 
                          bonus: '-25% Tech Cost / +50 Credits', 
                          icon: TrendingUp, 
                          color: 'text-cyan-400',
                          badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                        }
                      ].map((trait) => {
                        const Icon = trait.icon;
                        return (
                          <button
                            key={trait.id}
                            type="button"
                            onClick={() => setEmpireTrait(trait.id)}
                            className={`p-3 rounded-xl border text-left flex flex-col justify-between transition h-full ${
                              empireTrait === trait.id 
                                ? 'bg-indigo-950/20 border-indigo-500 ring-2 ring-indigo-500 shadow-md shadow-indigo-500/5' 
                                : 'bg-slate-900/30 border-slate-800/80 hover:bg-slate-900/50 hover:border-slate-800'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Icon className={`w-4 h-4 ${trait.color}`} />
                                <span className="text-xs font-bold text-slate-200">{trait.name}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-normal mb-2">{trait.desc}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${trait.badgeColor}`}>
                              {trait.bonus}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-900">
                  {/* Create Option */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Host New Campaign</h3>
                    <button
                      onClick={handleCreateLobby}
                      className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 font-semibold text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/10 transition group"
                    >
                      <Plus className="w-5 h-5" />
                      Establish New Sector
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition translate-x-1" />
                    </button>
                  </div>

                  {/* Join Option */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 font-mono">Access War Room Code</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputLobbyCode}
                        onChange={(e) => setInputLobbyCode(e.target.value.toUpperCase().slice(0, 4))}
                        placeholder="CODE (e.g. ABCD)"
                        className="w-1/2 px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/50 text-white text-center font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500 uppercase transition"
                        maxLength={4}
                        id="lobby-code-input"
                      />
                      <button
                        onClick={handleJoinLobby}
                        className="w-1/2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-white flex items-center justify-center gap-1.5 transition border border-slate-700"
                      >
                        <UserPlus className="w-4 h-4 text-cyan-400" />
                        Join Sector
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Game Manual Quick Look */}
              <div className="mt-8 pt-6 border-t border-slate-900 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-2.5">
                  <BookOpen className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">Expansion Strategy</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Settle empty systems early. They build raw shipyard power passive reserves.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Target className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">Automated Tactics</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Continuous combat maps calculate defense bonuses & upgrade stats instantly.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">System Upgrades</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">Allocate credits from nodes to scale armor shields, velocity, & extraction.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard & Active Sectors Column */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Active Sectors Panel */}
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-900">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    Active Hosted Sectors
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    LIVE MONITOR
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {publicLobbies.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-slate-900 rounded-xl bg-slate-900/10">
                      <p className="text-xs text-slate-400">No active sectors found on this server.</p>
                      <p className="text-[10px] text-slate-600 mt-1">Host one by establishing a new sector!</p>
                    </div>
                  ) : (
                    publicLobbies.map((pubLobby) => (
                      <div 
                        key={pubLobby.code}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-900/60 hover:border-slate-800 hover:bg-slate-900/80 transition"
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-white tracking-wider">{pubLobby.code}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              pubLobby.status === 'lobby' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : pubLobby.status === 'playing'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {pubLobby.status === 'lobby' ? 'ASSEMBLE' : pubLobby.status === 'playing' ? 'IN COMBAT' : 'ENDED'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">Host: <span className="text-slate-300 font-medium">{pubLobby.hostName}</span></p>
                          <p className="text-[10px] text-slate-500 font-mono">Forces: {pubLobby.playerCount}/7 Commanders</p>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          {pubLobby.status === 'lobby' && pubLobby.playerCount < 7 && (
                            <button
                              type="button"
                              onClick={() => {
                                setInputLobbyCode(pubLobby.code);
                                if (commanderName.trim()) {
                                  sendMessage({ 
                                    type: 'join_lobby', 
                                    payload: { 
                                      name: commanderName, 
                                      code: pubLobby.code, 
                                      emoji: selectedEmoji, 
                                      empireName: empireName,
                                      alienEyes,
                                      alienSkin,
                                      empireTrait
                                    } 
                                  });
                                } else {
                                  setErrorMsg('Commander call sign is required to join. Please fill in your name first!');
                                  setTimeout(() => setErrorMsg(null), 4000);
                                  document.getElementById('commander-name-input')?.focus();
                                }
                              }}
                              className="py-1 px-2.5 rounded-lg bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 text-[11px] font-semibold font-mono transition cursor-pointer"
                            >
                              JOIN
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setInputLobbyCode(pubLobby.code);
                              sendMessage({ 
                                type: 'join_lobby', 
                                payload: { 
                                  name: commanderName.trim() || 'Observer', 
                                  code: pubLobby.code, 
                                  isSpectator: true
                                } 
                              });
                            }}
                            className="py-1 px-2.5 rounded-lg bg-teal-600/20 text-teal-400 hover:bg-teal-600 hover:text-white border border-teal-500/30 text-[11px] font-semibold font-mono transition cursor-pointer"
                          >
                            👁️ SPECTATE
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Leaderboard Panel */}
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col flex-1">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-900">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Award className="w-4 h-4 text-indigo-400" />
                    Sector High Commanders
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">UPDATES REAL-TIME</span>
                </div>

                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[350px]">
                  {leaderboard.map((entry, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-900/60 hover:bg-slate-900/80 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-md font-mono text-xs flex items-center justify-center font-bold ${
                          idx === 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          idx === 1 ? 'bg-slate-400/10 text-slate-300 border border-slate-400/20' :
                          idx === 2 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                          'bg-slate-800/30 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{entry.playerName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">Wins: {entry.wins}/{entry.gamesPlayed} games</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-indigo-400">{entry.score} PTS</span>
                        <p className="text-[10px] text-slate-500 font-mono">{entry.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tactical Command Manual & Game Mechanics Guide */}
            <div className="lg:col-span-12 mt-8 bg-slate-950/25 border border-slate-900/60 rounded-2xl p-6 backdrop-blur-sm shadow-lg w-full">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-900 mb-5">
                <BookOpen className="w-5 h-5 text-indigo-400 animate-pulse" />
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Sector Tactical Command Manual</h3>
                  <p className="text-[10px] text-slate-500 font-mono">Standard Operating Procedures for Fleet Commanders</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Mechanic 1 */}
                <div className="p-3.5 bg-slate-900/20 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">🚀</span>
                    <h4 className="text-xs font-bold text-slate-200 uppercase">Fleet Logistics</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Drag from any owned system to dispatch fleets. The dispatch percentage slider scales size. Home planets start with <strong>50 ships</strong> (300 limit) to secure a balanced tactical progression.
                  </p>
                </div>

                {/* Mechanic 2 */}
                <div className="p-3.5 bg-slate-900/20 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">📈</span>
                    <h4 className="text-xs font-bold text-slate-200 uppercase">Research Upgrades</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Factions possess 6 research tracks (Hyperdrive, Shipyard, Shields, Deep Mining, Capacity, and Weapons Tech) up to <strong>Level 10</strong>. Capacity research raises the global ship cap by +500/level, and each owned planet expands capacity by +100.
                  </p>
                </div>

                {/* Mechanic 3 */}
                <div className="p-3.5 bg-slate-900/20 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">📡</span>
                    <h4 className="text-xs font-bold text-slate-200 uppercase">Tactical Lasers</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Construct laser batteries (1400 CR) to strike enemy units remotely for 1000 CR. Level 3 unlocks the <strong>Planet Breaker</strong> (4000 CR base) to permanently vaporize target planets!
                  </p>
                </div>

                {/* Mechanic 4 */}
                <div className="p-3.5 bg-slate-900/20 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">🛡️</span>
                    <h4 className="text-xs font-bold text-slate-200 uppercase">Deflector Shields</h4>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Construct Deflector Shields (1400 CR) to completely absorb the next incoming tactical laser blast. Once detonated, shields enter a recharging cooldown before reactivating.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : lobby.status === 'lobby' ? (
          
          /* ==========================================================
             SCREEN 2: FLEET ASSEMBLY LOBBY
             ========================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
            
            {/* Crew/Player Panel */}
            <div className="lg:col-span-4 bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm shadow-xl flex flex-col">
              <div className="mb-4 pb-2 border-b border-slate-900">
                <span className="text-[10px] text-indigo-400 font-mono tracking-widest block mb-1">COMMAND CAMPAIGN ID</span>
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-mono font-bold text-white tracking-widest">{lobby.code}</h3>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(lobby.code);
                      alert('War room sector code copied!');
                    }}
                    className="text-xs py-1 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-slate-800 transition"
                  >
                    Copy Code
                  </button>
                </div>
              </div>

              <div className="space-y-2 flex-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Connected Fleets</h4>
                
                {lobby.players.map((p) => (
                  <div 
                    key={p.id} 
                    className={`flex items-center justify-between p-3 rounded-xl border transition ${
                      p.isMinorFaction 
                        ? 'bg-pink-950/15 border-pink-900/35 hover:border-pink-800/50' 
                        : 'bg-slate-900/50 border-slate-900 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span 
                        className={`w-3.5 h-3.5 rounded-full border border-white/20 shadow flex-shrink-0 ${
                          p.isMinorFaction ? 'ring-2 ring-pink-500/20' : ''
                        }`} 
                        style={{ backgroundColor: p.color }}
                      ></span>
                      <div>
                        <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                          <span className="text-lg flex-shrink-0">{p.emoji || '👽'}</span>
                          <span>{p.name} {p.isMinorFaction ? '⚜️' : ''}</span>
                          {p.id === playerId && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-mono">Self</span>
                          )}
                        </p>
                        <p className={`text-[11px] font-mono ${p.isMinorFaction ? 'text-pink-400' : 'text-indigo-400/90'}`}>
                          {p.empireName || 'Terran Alliance'}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {p.isMinorFaction ? 'Minor Faction (NPC)' : p.isBot ? 'Auxiliary Tactical Drone' : 'Human Commander'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {p.alienSkin && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-mono">
                              🧬 {p.alienSkin}
                            </span>
                          )}
                          {p.empireTrait && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-medium ${
                              p.empireTrait === 'scavenger' ? 'bg-rose-950/40 text-rose-400 border-rose-900/40' :
                              p.empireTrait === 'nanites' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' :
                              p.empireTrait === 'vanguard' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/40' :
                              p.empireTrait === 'overload' ? 'bg-amber-950/40 text-amber-400 border-amber-900/40' :
                              p.empireTrait === 'syndicate' ? 'bg-cyan-950/40 text-cyan-400 border-cyan-900/40' :
                              'bg-slate-900 text-slate-500 border-slate-800'
                            }`}>
                              {p.empireTrait === 'scavenger' ? '♻️ Salvage Harvest' :
                               p.empireTrait === 'nanites' ? '🛡️ Regenerative' :
                               p.empireTrait === 'vanguard' ? '🚀 Neutral Vanguard' :
                               p.empireTrait === 'overload' ? '💥 Core Trap' :
                               p.empireTrait === 'syndicate' ? '⚡ Syndicate Contacts' :
                               '⚖️ Zenith Standard'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.isHost ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono font-semibold">
                          HOST
                        </span>
                      ) : p.isReady ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 font-mono">
                          STAGING
                        </span>
                      )}

                      {/* Host can kick players or bots */}
                      {isHost && p.id !== playerId && (
                        <button 
                          onClick={() => handleKickPlayer(p.id)}
                          className="text-xs text-rose-500 hover:text-rose-400 p-1 hover:bg-rose-500/10 rounded transition"
                          title="Expel"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Staging actions */}
              <div className="mt-6 pt-4 border-t border-slate-900 space-y-3">
                <button
                  onClick={handleToggleReady}
                  className={`w-full py-3 rounded-xl font-semibold transition ${
                    selfPlayer?.isReady 
                      ? 'bg-rose-950/40 border border-rose-900/60 text-rose-400 hover:bg-rose-950/60'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {selfPlayer?.isReady ? 'STAY IN DOCK (CANCEL READY)' : 'ENGAGE FLEET (READY UP)'}
                </button>

                {isHost && (
                  <button
                    onClick={handleStartGame}
                    disabled={!lobby.players.every((p) => p.isReady)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/10"
                  >
                    INITIATE CONQUEST (START)
                  </button>
                )}
              </div>
            </div>

            {/* AI Customizers & Chat panel */}
            <div className="lg:col-span-8 bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-sm shadow-xl flex flex-col">
              
              {/* Galaxy Map Scale Settings */}
              <div className="mb-6 pb-4 border-b border-slate-900">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Galaxy Map Sector Scale
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {(['small', 'medium', 'large', 'giant', 'cosmic'] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => sendMessage({ type: 'update_map_size', payload: { size: sz } })}
                      disabled={!isHost}
                      className={`py-2 px-1 rounded-xl border text-center transition ${
                        lobby.mapSizeSetting === sz
                          ? 'border-indigo-500 bg-indigo-500/25 text-white font-bold shadow-lg shadow-indigo-500/10'
                          : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <p className="text-[10px] uppercase font-mono tracking-wider font-bold">
                        {sz}
                      </p>
                      <p className="text-[9px] text-slate-500 font-mono">
                        {sz === 'small' ? '850x550' : sz === 'medium' ? '1100x700' : sz === 'large' ? '1400x900' : sz === 'giant' ? '1800x1100' : '2400x1500'}
                      </p>
                    </button>
                  ))}
                </div>
                {!isHost && (
                  <p className="text-[11px] text-slate-500 mt-2 font-mono">
                    Current Scale: <span className="text-indigo-400 font-bold uppercase">{lobby.mapSizeSetting || 'small'}</span>. Only host can change map scale.
                  </p>
                )}
              </div>

              {/* Minor Independent Factions Density Settings */}
              <div className="mb-6 pb-4 border-b border-slate-900">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-pink-500" />
                  Minor Independent Factions Count
                </h3>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    disabled={!isHost}
                    value={lobby.minorFactionsCount ?? 2}
                    onChange={(e) => sendMessage({ type: 'update_minor_factions', payload: { count: parseInt(e.target.value, 10) } })}
                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-pink-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs font-mono font-bold text-pink-400 bg-pink-500/10 px-3 py-1.5 rounded-lg border border-pink-500/20 shrink-0">
                    {lobby.minorFactionsCount ?? 2} Factions
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 font-mono">
                  {isHost 
                    ? "Control how many independent AI organizations populate neutral sectors (0 to 8 factions)."
                    : `Host configured independent faction count: ${lobby.minorFactionsCount ?? 2}.`
                  }
                </p>
              </div>

              {/* Host AI Recruitments */}
              <div className="mb-6 pb-4 border-b border-slate-900">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-cyan-400" />
                  Recruit Auxiliary AI Battalions
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => handleAddBot('easy')}
                    disabled={!isHost || lobby.players.length >= 7}
                    className="py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition disabled:opacity-40 disabled:hover:bg-slate-900/40"
                  >
                    <span className="text-emerald-400 text-[10px] font-mono">EASY DRONE</span>
                    <span>Sentry unit</span>
                  </button>
                  <button
                    onClick={() => handleAddBot('medium')}
                    disabled={!isHost || lobby.players.length >= 7}
                    className="py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition disabled:opacity-40 disabled:hover:bg-slate-900/40"
                  >
                    <span className="text-indigo-400 text-[10px] font-mono">TACTICAL AI</span>
                    <span>Cyber fleet</span>
                  </button>
                  <button
                    onClick={() => handleAddBot('hard')}
                    disabled={!isHost || lobby.players.length >= 7}
                    className="py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-slate-200 text-xs font-semibold flex flex-col items-center gap-1 transition disabled:opacity-40 disabled:hover:bg-slate-900/40"
                  >
                    <span className="text-amber-500 text-[10px] font-mono">APEX HIVEMIND</span>
                    <span>Dreadnought X</span>
                  </button>
                </div>
                {!isHost && (
                  <p className="text-[11px] text-slate-500 mt-2 font-mono">Only host can inject AI bot fleets.</p>
                )}
              </div>

              {/* Chat Interface */}
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                Interstellar Chat Logs
              </h4>

              <div 
                ref={lobbyChatContainerRef}
                className="flex-1 overflow-y-auto bg-slate-900/20 border border-slate-900 rounded-xl p-4 min-h-[180px] max-h-[300px] space-y-2"
              >
                {lobby.chat.map((msg) => {
                  const sender = lobby.players.find((p) => p.id === msg.senderId);
                  return (
                    <div key={msg.id} className="text-xs flex items-center gap-1.5 leading-relaxed">
                      <span className="font-mono text-slate-500 flex-shrink-0">[{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                      {sender?.emoji && <span className="text-sm flex-shrink-0">{sender.emoji}</span>}
                      <span 
                        className="font-semibold text-slate-100 font-sans"
                        style={{ color: msg.senderColor }}
                      >
                        {msg.senderName}:
                      </span>
                      <span className="text-slate-300 font-sans">{msg.text}</span>
                    </div>
                  );
                })}
              </div>

              {/* Chat Send */}
              <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value.slice(0, 80))}
                  placeholder="Broadcast message to sector comms..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900/50 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  maxLength={80}
                  id="chat-message-input"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white rounded-xl transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        ) : (
          
          /* ==========================================================
             SCREEN 3: ACTIVE GAME BOARD & WAR ROOM
             ========================================================== */
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch flex-1 min-h-0 w-full h-full">
            
            {/* Left Column: Interactive Game Canvas Board */}
            <div className="xl:col-span-8 flex flex-col gap-4 relative xl:h-full min-h-0">
              <div className="relative w-full h-full flex-1 min-h-0">
                <GameCanvas
                  planets={lobby.planets}
                  fleets={lobby.fleets}
                  players={lobby.players}
                  currentPlayerId={playerId}
                  launchPercent={launchPercent}
                  onLaunchFleet={handleLaunchFleet}
                  selectedPlanetId={selectedPlanetId}
                  onSelectPlanet={setSelectedPlanetId}
                  isTargetingWeapon={isTargetingWeapon}
                  onFireWeapon={(targetPlanetId) => {
                    if (selectedPlanetId) {
                      sendMessage({
                        type: 'fire_laser',
                        payload: {
                          fromPlanetId: selectedPlanetId,
                          toPlanetId: targetPlanetId,
                        }
                      });
                    }
                    setIsTargetingWeapon(false);
                  }}
                  mapWidth={lobby.mapWidth}
                  mapHeight={lobby.mapHeight}
                  activeLasers={lobby.activeLasers}
                />

                {/* Game Over Modal Overlay */}
                {lobby.status === 'ended' && lobby.victoryStats && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center backdrop-blur-md rounded-xl z-30">
                    <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                      <Crown className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-white mb-2">SYSTEM CONQUEST COMPLETED</h2>
                    <p className="text-sm text-slate-400 max-w-md leading-relaxed mb-6">
                      <span 
                        className="font-bold text-lg"
                        style={{ color: lobby.victoryStats.winnerColor }}
                      >
                        {lobby.victoryStats.winnerName}
                      </span> has successfully colonized all planetary nodes, vanquishing defending forces and securing total domain control!
                    </p>

                    <div className="grid grid-cols-2 gap-4 max-w-sm w-full mb-8 font-mono text-xs">
                      <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="block text-slate-500">BATTLE DURATION</span>
                        <span className="text-white font-bold">{lobby.victoryStats.duration} seconds</span>
                      </div>
                      <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                        <span className="block text-slate-500">FLEETS DEPLOYED</span>
                        <span className="text-white font-bold">{lobby.victoryStats.totalFleetsSent} fleets</span>
                      </div>
                    </div>

                    <button
                      onClick={handleLeaveLobby}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold transition shadow-lg shadow-indigo-600/10"
                    >
                      Return to Fleet Gateway
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Sector Command Center Sidebar */}
            <div className="xl:col-span-4 flex flex-col gap-3 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 backdrop-blur-sm xl:h-full min-h-0 justify-start overflow-y-auto max-h-[85vh] xl:max-h-full">
              
              {/* Header: Commander Signature */}
              <div className="border-b border-slate-900 pb-2">
                <span className="text-[10px] text-indigo-400 font-mono tracking-widest block uppercase">Commander Signature</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl flex-shrink-0">{selfPlayer?.emoji || '👽'}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-white leading-tight truncate">{selfPlayer?.name || 'Commander'}</h3>
                    <p className="text-[9px] text-slate-400 font-mono leading-none mt-0.5 truncate">{selfPlayer?.empireName || 'Terran Syndicate'}</p>
                    <div className="flex flex-wrap gap-1 mt-1 font-mono text-[8px]">
                      {selfPlayer?.alienSkin && (
                        <span className="px-1 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {selfPlayer.alienSkin}
                        </span>
                      )}
                      {selfPlayer?.empireTrait && (
                        <span className="px-1 py-0.2 rounded bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 font-semibold">
                          {selfPlayer.empireTrait === 'scavenger' ? '♻️ Salvage Harvest' :
                           selfPlayer.empireTrait === 'nanites' ? '🛡️ Regenerative' :
                           selfPlayer.empireTrait === 'vanguard' ? '🚀 Neutral Vanguard' :
                           selfPlayer.empireTrait === 'overload' ? '💥 Core Trap' :
                           selfPlayer.empireTrait === 'syndicate' ? '⚡ Syndicate Contacts' :
                           '⚖️ Zenith Standard'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compact 2x2 Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {/* Credits */}
                <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-xl flex flex-col">
                  <span className="text-[9px] text-amber-500/80 uppercase">Credits</span>
                  <span className="text-sm font-bold text-amber-400 mt-0.5">
                    {selfPlayer ? Math.floor(selfPlayer.credits) : 0} <span className="text-[10px] text-slate-500 font-normal">CR</span>
                  </span>
                </div>

                {/* Upgrade Power */}
                <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-xl flex flex-col">
                  <span className="text-[9px] text-indigo-400 uppercase">Upgrade Power</span>
                  <span className="text-sm font-bold text-indigo-300 mt-0.5">
                    {selfPlayer ? Math.floor(selfPlayer.upgradePoints) : 0} <span className="text-[10px] text-slate-500 font-normal">UP</span>
                  </span>
                </div>

                {/* Secured Sectors */}
                <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-xl flex flex-col">
                  <span className="text-[9px] text-slate-400 uppercase">Secured</span>
                  <span className="text-sm font-bold text-white mt-0.5">
                    {lobby.planets.filter((p) => p.ownerId === playerId).length}
                    <span className="text-[10px] text-slate-500 font-normal">/{lobby.planets.length}</span>
                  </span>
                </div>

                {/* Active Fleets */}
                <div className="p-2 bg-slate-900/40 border border-slate-900 rounded-xl flex flex-col">
                  <span className="text-[9px] text-cyan-400 uppercase">Fleets</span>
                  <span className="text-sm font-bold text-cyan-400 mt-0.5">
                    {lobby.fleets.filter((f) => f.ownerId === playerId).length} <span className="text-[10px] text-slate-500 font-normal">active</span>
                  </span>
                </div>
              </div>

              {/* Naval Fleet Capacity Status Bar */}
              {lobby && (
                <div className="bg-slate-900/40 border border-[#1e293b]/50 rounded-xl p-2.5 font-mono">
                  <div className="flex justify-between items-center text-[9px] mb-1">
                    <span className="text-emerald-400 uppercase">Empire Naval Fleet</span>
                    <span className="text-white font-bold">
                      {playerTotalShips} <span className="text-slate-500">/ {playerGlobalCap} Ships</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (playerTotalShips / playerGlobalCap) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Launch Dispatch percentage */}
              <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-rose-500" />
                  Fleet Launch Dispatch Size
                </h4>
                <div className="grid grid-cols-4 gap-1.5">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setLaunchPercent(pct)}
                      className={`py-1.5 text-center font-mono font-bold text-xs rounded-lg border transition ${
                        launchPercent === pct
                          ? 'bg-rose-500 text-white border-rose-400 shadow-sm shadow-rose-500/10'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Planet Control Panel / Fleet Upgrades Swap */}
              {selectedPlanetId ? (() => {
                const selPlanet = lobby.planets.find(p => p.id === selectedPlanetId);
                if (!selPlanet) return null;
                const isMyPlanet = selPlanet.ownerId === playerId;
                
                const getDistance = (p1: any, p2: any) => {
                  const dx = p1.x - p2.x;
                  const dy = p1.y - p2.y;
                  return Math.sqrt(dx * dx + dy * dy);
                };

                const myLaserPlanets = lobby.planets.filter(
                  (p) => p.ownerId === playerId && p.hasLaser && !p.isDestroyed
                );

                // Closest standard laser (Level 1 or 2)
                const standardLaserCandidates = myLaserPlanets.filter((p) => (p.laserLevel || 1) < 3);
                const closestLaserPlanet = standardLaserCandidates.length > 0 
                  ? [...standardLaserCandidates].sort((a, b) => getDistance(a, selPlanet) - getDistance(b, selPlanet))[0]
                  : null;

                // Closest planet breaker (Level 3)
                const planetBreakerCandidates = myLaserPlanets.filter((p) => (p.laserLevel || 1) === 3);
                const closestPlanetBreakerPlanet = planetBreakerCandidates.length > 0 
                  ? [...planetBreakerCandidates].sort((a, b) => getDistance(a, selPlanet) - getDistance(b, selPlanet))[0]
                  : null;
                
                // Calculate costs for display
                const cityLvl = selPlanet.buildings?.city?.level || 0;
                const starportLvl = selPlanet.buildings?.starport?.level || 0;
                const weaponLvl = selPlanet.buildings?.spaceWeapon?.level || 0;
                const shieldLvl = selPlanet.buildings?.shield?.level || 0;
                
                const cityCost = cityLvl >= 3 ? 0 : [200, 500, 1200][cityLvl];
                const starportCost = starportLvl >= 3 ? 0 : [150, 400, 900][starportLvl];
                const weaponCost = weaponLvl >= 3 ? 0 : [500, 1200, 2500][weaponLvl];
                const shieldCost = shieldLvl >= 3 ? 0 : [250, 600, 1500][shieldLvl];
                
                const myCredits = selfPlayer ? selfPlayer.credits : 0;
                const hasActiveConstruction = !!selPlanet.construction;
                
                return (
                  <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-3.5 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm flex-shrink-0">🪐</span>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white leading-tight truncate">{selPlanet.name}</h4>
                          <p className="text-[9px] text-slate-400 font-mono uppercase">
                            {selPlanet.type === 'normal' 
                              ? (selPlanet.resourceType ? `Resource Node: ${selPlanet.resourceType.toUpperCase()}` : 'Standard Colony')
                              : `SPECIAL: ${selPlanet.type.toUpperCase().replace('_', ' ')}`
                            }
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPlanetId(null);
                          setIsTargetingWeapon(false);
                        }}
                        className="px-2 py-0.5 text-[9px] font-mono text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-md transition"
                      >
                        ← Back
                      </button>
                    </div>

                    {/* Quick Planet Info */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono p-2 bg-slate-950/40 rounded-lg border border-slate-900">
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Garrison Ships</span>
                        <span className="text-white font-bold">{Math.floor(selPlanet.ships)} / {selPlanet.maxShips}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[8px] uppercase">Yield Rate</span>
                        <span className="text-emerald-400 font-bold">+{selPlanet.creditsRate || 0} CR/s</span>
                      </div>
                    </div>

                    {/* Special Planet Description */}
                    {selPlanet.type !== 'normal' && (
                      <div className="text-[9px] p-2 bg-indigo-950/20 border border-indigo-900/30 rounded-lg text-indigo-300 leading-normal">
                        <strong>⚡ Planetary Prize:</strong>{' '}
                        {selPlanet.type === 'cosmic_forge' && 'Cosmic Forge increases ship construction yield by +30% for whoever controls it.'}
                        {selPlanet.type === 'oracle_temple' && 'Oracle Temple reveals deep sensor visibility and grants +1 Upgrade Point every 5 seconds.'}
                        {selPlanet.type === 'aether_siphon' && 'Aether Siphon harvests raw credits directly from deep space, yielding +8 passive credits/sec.'}
                        {selPlanet.type === 'hyperdrive_station' && 'Hyperdrive Station boosts maximum fleet travel speed by +40% for your whole empire.'}
                        {selPlanet.type === 'shield_generator' && 'Shield Generator Core projects a sector-wide shield multiplier adding +10% defensive block.'}
                      </div>
                    )}

                    {/* Facility Grid */}
                    {isMyPlanet ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-900">
                          <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">Planetary Facilities</span>
                        </div>

                        {/* Tactical Laser Facility */}
                        <div className="flex flex-col gap-2 p-2 bg-slate-950/40 rounded-xl border border-slate-900">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                                <span>📡 Tactical Laser Battery</span>
                                {selPlanet.hasLaser && (
                                  <span className="px-1.5 py-0.2 text-[8px] bg-rose-950 text-rose-400 border border-rose-900 rounded font-mono">
                                    Lvl {selPlanet.laserLevel || 1}
                                  </span>
                                )}
                              </div>
                              <span className="text-[8.5px] text-slate-400 block mt-0.5 leading-tight">
                                {!selPlanet.hasLaser 
                                  ? 'Construct a tactical space laser to damage enemy ships remotely.' 
                                  : (selPlanet.laserLevel || 1) === 3 
                                  ? 'Unlocks PLANET BREAKER: completely annihilates target planetary bodies!'
                                  : 'Upgrades increase firing speed and damage yield.'
                                }
                              </span>
                            </div>

                            {!selPlanet.hasLaser ? (
                              <button
                                disabled={myCredits < 1400}
                                onClick={() => {
                                  sendMessage({
                                    type: 'build_laser',
                                    payload: { planetId: selPlanet.id }
                                  });
                                }}
                                className={`px-2 py-1 text-[9px] font-mono rounded font-bold border transition flex-shrink-0 min-w-[70px] text-center ${
                                  myCredits < 1400
                                    ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-rose-950 hover:bg-rose-900 border-rose-800 text-rose-400'
                                }`}
                              >
                                1400 CR
                              </button>
                            ) : (selPlanet.laserLevel || 1) < 3 ? (
                              <button
                                disabled={myCredits < 1400}
                                onClick={() => {
                                  sendMessage({
                                    type: 'upgrade_laser',
                                    payload: { planetId: selPlanet.id }
                                  });
                                }}
                                className={`px-2 py-1 text-[9px] font-mono rounded font-bold border transition flex-shrink-0 min-w-[70px] text-center ${
                                  myCredits < 1400
                                    ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-950 hover:bg-indigo-900 border-indigo-850 text-indigo-400'
                                }`}
                              >
                                UPGRADE (1400 CR)
                              </button>
                            ) : (
                              <span className="text-[8px] text-amber-500 font-mono font-bold uppercase tracking-widest px-2 py-1 bg-amber-950/20 border border-amber-900 rounded">MAX</span>
                            )}
                          </div>

                          {/* Laser Fire Control */}
                          {selPlanet.hasLaser && (
                            <div className="pt-2 border-t border-slate-900/60 flex flex-col gap-1.5">
                              {(() => {
                                const lvl = selPlanet.laserLevel || 1;
                                const cooldown = lvl === 1 ? 15000 : lvl === 2 ? 10000 : 25000;
                                const lastFired = selPlanet.laserLastFired || 0;
                                const elapsed = Date.now() - lastFired;
                                const isReady = elapsed > cooldown;
                                const remaining = Math.ceil((cooldown - elapsed) / 1000);
                                const cost = lvl === 3 ? (4000 + (selPlanet.planetBreakerUses || 0) * 2000) : 1000;
                                const canAfford = myCredits >= cost;

                                return (
                                  <>
                                    <div className="flex justify-between items-center text-[8.5px] font-mono text-slate-500">
                                      <span>Firing Cost: <strong className="text-amber-400">{cost} CR</strong></span>
                                      <span>Cooldown: <strong>{cooldown / 1000}s</strong></span>
                                    </div>
                                    <button
                                      disabled={!isReady || !canAfford}
                                      onClick={() => setIsTargetingWeapon(!isTargetingWeapon)}
                                      className={`w-full py-1.5 text-[9.5px] font-bold font-mono rounded border transition-all ${
                                        isTargetingWeapon
                                          ? 'bg-red-500 hover:bg-red-600 text-white border-red-400 shadow shadow-red-500/25 animate-pulse'
                                          : !isReady
                                          ? 'bg-slate-900 border-slate-950 text-slate-500 cursor-not-allowed'
                                          : !canAfford
                                          ? 'bg-slate-900 border-slate-950 text-red-500 cursor-not-allowed'
                                          : lvl === 3
                                          ? 'bg-amber-950 hover:bg-amber-900 border-amber-800 text-amber-400 shadow-md'
                                          : 'bg-rose-950 hover:bg-rose-900 border-rose-800 text-rose-400'
                                      }`}
                                    >
                                      {isTargetingWeapon 
                                        ? '🚨 SELECT TARGET PLANET' 
                                        : !isReady 
                                        ? `RECHARGING (${remaining}s)` 
                                        : lvl === 3 
                                        ? '🔥 ACTIVATE PLANET BREAKER' 
                                        : '🎯 FIRE TACTICAL LASER'
                                      }
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Anti-Laser Deflector Shield */}
                        <div className="flex flex-col gap-2 p-2 bg-slate-950/40 rounded-xl border border-slate-900">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                                <span>🛡️ Deflector Shield</span>
                                {selPlanet.hasShield && (
                                  <span className="px-1.5 py-0.2 text-[8px] bg-emerald-950 text-emerald-400 border border-emerald-900 rounded font-mono">
                                    ONLINE
                                  </span>
                                )}
                              </div>
                              <span className="text-[8.5px] text-slate-400 block mt-0.5 leading-tight">
                                {!selPlanet.hasShield 
                                  ? 'Blocks one space laser shot completely. Goes into a semi-long cooldown.' 
                                  : 'Deflector shield generator active. Will neutralize the next incoming laser blast.'
                                }
                              </span>
                            </div>

                            {!selPlanet.hasShield ? (
                              <button
                                disabled={myCredits < 1400}
                                onClick={() => {
                                  sendMessage({
                                    type: 'build_shield',
                                    payload: { planetId: selPlanet.id }
                                  });
                                }}
                                className={`px-2 py-1 text-[9px] font-mono rounded font-bold border transition flex-shrink-0 min-w-[70px] text-center ${
                                  myCredits < 1400
                                    ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-emerald-950 hover:bg-emerald-900 border-emerald-800 text-emerald-400'
                                }`}
                              >
                                1400 CR
                              </button>
                            ) : (
                              <span className="text-[8px] text-emerald-400 font-mono font-bold uppercase tracking-widest px-2 py-1 bg-emerald-950/20 border border-emerald-900 rounded">BUILT</span>
                            )}
                          </div>

                          {/* Shield Cooldown Status if Built */}
                          {selPlanet.hasShield && (() => {
                            const now = Date.now();
                            const cooldownEnd = selPlanet.shieldCooldownUntil || 0;
                            const isRecharging = cooldownEnd > now;
                            const remaining = Math.ceil((cooldownEnd - now) / 1000);

                            return (
                              <div className="pt-1 text-[8.5px] font-mono flex items-center gap-1">
                                <span className="text-slate-500">Deflector State:</span>
                                {isRecharging ? (
                                  <span className="text-amber-400 animate-pulse">RECHARGING ({remaining}s remaining)</span>
                                ) : (
                                  <span className="text-emerald-400 font-bold">READY / CHARGED</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="text-center py-3 bg-slate-950/40 rounded-xl border border-slate-900/60">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Sector Owner</span>
                          <span className="text-xs font-bold block mt-1" style={{ color: selPlanet.ownerId ? (lobby.players.find(p => p.id === selPlanet.ownerId)?.color || '#94A3B8') : '#94A3B8' }}>
                            {selPlanet.ownerId ? (lobby.players.find(p => p.id === selPlanet.ownerId)?.name || 'Neutrals') : 'Neutrals'}
                          </span>
                          {selPlanet.ownerId && (
                            <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                              Faction: {lobby.players.find(p => p.id === selPlanet.ownerId)?.empireName || 'Independent'}
                            </span>
                          )}
                        </div>

                        {/* Remote Bombardment Command */}
                        {!selPlanet.isDestroyed ? (
                          <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl flex flex-col gap-2.5">
                            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-900/60">
                              <Swords className="w-3.5 h-3.5 text-rose-500" />
                              <h5 className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Planetary Bombardment</h5>
                            </div>

                            {myLaserPlanets.length === 0 ? (
                              <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                                No active operational laser batteries detected under your command. Build a <strong>Tactical Laser Battery</strong> (1,400 CR) on one of your systems to engage targets remotely!
                              </p>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {/* Standard Laser */}
                                {closestLaserPlanet ? (() => {
                                  const lvl = closestLaserPlanet.laserLevel || 1;
                                  const cooldown = lvl === 1 ? 15000 : 10000;
                                  const lastFired = closestLaserPlanet.laserLastFired || 0;
                                  const elapsed = Date.now() - lastFired;
                                  const isReady = elapsed > cooldown;
                                  const remaining = Math.ceil((cooldown - elapsed) / 1000);
                                  const cost = 1000;
                                  const canAfford = myCredits >= cost;
                                  const distLightYears = Math.round(getDistance(closestLaserPlanet, selPlanet) * 0.1);

                                  return (
                                    <div className="p-2 bg-rose-950/10 border border-rose-900/20 rounded-lg flex flex-col gap-1.5">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <span className="text-[9.5px] font-bold text-rose-400 block">🎯 Tactical Laser Strike</span>
                                          <span className="text-[8px] text-slate-500 font-mono block">
                                            Origin: {closestLaserPlanet.name} ({distLightYears} LY)
                                          </span>
                                        </div>
                                        <span className="text-[9.5px] font-mono font-bold text-amber-400 bg-amber-950/30 px-1 py-0.2 rounded">1,000 CR</span>
                                      </div>
                                      <p className="text-[8.5px] text-slate-400 leading-normal">
                                        Fires a rapid plasma beam to instantly vaporize <strong>{lvl === 1 ? '100' : '180'} defending ships</strong>. Blocked by active deflector shields.
                                      </p>
                                      <button
                                        disabled={!isReady || !canAfford}
                                        onClick={() => {
                                          sendMessage({
                                            type: 'fire_laser',
                                            payload: {
                                              fromPlanetId: closestLaserPlanet.id,
                                              toPlanetId: selPlanet.id
                                            }
                                          });
                                        }}
                                        className={`w-full py-1 text-[9px] font-bold font-mono rounded border transition-all ${
                                          !isReady
                                            ? 'bg-slate-900 border-slate-950 text-slate-500 cursor-not-allowed'
                                            : !canAfford
                                            ? 'bg-slate-900 border-slate-950 text-red-500 cursor-not-allowed'
                                            : 'bg-rose-950 hover:bg-rose-900 border-rose-800 text-rose-400'
                                        }`}
                                      >
                                        {!isReady ? `RECHARGING (${remaining}s)` : !canAfford ? 'INSUFFICIENT CREDITS' : 'FIRE TACTICAL LASER'}
                                      </button>
                                    </div>
                                  );
                                })() : (
                                  <div className="text-[8.5px] text-slate-500 font-mono italic text-center p-1.5 bg-slate-950/20 rounded border border-slate-900/40">
                                    No Level 1/2 laser cannons operational.
                                  </div>
                                )}

                                {/* Planet Breaker (Level 3 Laser) */}
                                {closestPlanetBreakerPlanet ? (() => {
                                  const cooldown = 25000;
                                  const lastFired = closestPlanetBreakerPlanet.laserLastFired || 0;
                                  const elapsed = Date.now() - lastFired;
                                  const isReady = elapsed > cooldown;
                                  const remaining = Math.ceil((cooldown - elapsed) / 1000);
                                  const uses = closestPlanetBreakerPlanet.planetBreakerUses || 0;
                                  const cost = 4000 + uses * 2000;
                                  const canAfford = myCredits >= cost;
                                  const distLightYears = Math.round(getDistance(closestPlanetBreakerPlanet, selPlanet) * 0.1);

                                  return (
                                    <div className="p-2 bg-amber-950/15 border border-amber-900/30 rounded-lg flex flex-col gap-1.5 mt-1">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <span className="text-[9.5px] font-bold text-amber-500 block">🔥 Planet Breaker Blast</span>
                                          <span className="text-[8px] text-slate-500 font-mono block">
                                            Origin: {closestPlanetBreakerPlanet.name} ({distLightYears} LY)
                                          </span>
                                        </div>
                                        <span className="text-[9.5px] font-mono font-bold text-amber-400 bg-amber-950/30 px-1 py-0.2 rounded">{cost.toLocaleString()} CR</span>
                                      </div>
                                      <p className="text-[8.5px] text-slate-400 leading-normal">
                                        Constructs a singularity that **permanently vaporizes** the target planet into a dead asteroid field!
                                      </p>
                                      <button
                                        disabled={!isReady || !canAfford}
                                        onClick={() => {
                                          sendMessage({
                                            type: 'fire_laser',
                                            payload: {
                                              fromPlanetId: closestPlanetBreakerPlanet.id,
                                              toPlanetId: selPlanet.id
                                            }
                                          });
                                        }}
                                        className={`w-full py-1.5 text-[9px] font-bold font-mono rounded border transition-all ${
                                          !isReady
                                            ? 'bg-slate-900 border-slate-950 text-slate-500 cursor-not-allowed'
                                            : !canAfford
                                            ? 'bg-slate-900 border-slate-950 text-red-500 cursor-not-allowed'
                                            : 'bg-amber-950 hover:bg-amber-900 border-amber-800 text-amber-400 shadow-md animate-pulse'
                                        }`}
                                      >
                                        {!isReady ? `RECHARGING (${remaining}s)` : !canAfford ? 'INSUFFICIENT CREDITS' : 'VAPORIZE PLANET'}
                                      </button>
                                    </div>
                                  );
                                })() : (
                                  <div className="text-[8.5px] text-slate-500 font-mono italic text-center p-1.5 bg-slate-950/20 rounded border border-slate-900/40">
                                    No active Planet Breakers built. Upgrade any laser battery to Level 3 to enable this planetary vaporization.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 bg-slate-950/20 rounded-xl border border-dashed border-slate-900/60">
                            <span className="text-xs font-bold text-slate-600 block uppercase tracking-wide">Vaporized Ruin</span>
                            <span className="text-[9px] text-slate-500 block mt-1 px-4 leading-normal">
                              This planetary system has been permanently reduced to a floating field of cosmic debris.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-900">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                      Fleet Upgrades
                    </h4>
                    <span className="text-[9px] text-slate-500 font-mono">CR COST</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {(() => {
                      const renderCard = (
                        category: 'speed' | 'production' | 'defense' | 'sensors' | 'capacity' | 'weapons',
                        icon: React.ReactNode,
                        title: string,
                        colorClass: string,
                        barColorClass: string,
                        tooltipTitle: string,
                        tooltipText: string
                      ) => {
                        if (!selfPlayer) return null;
                        const currentLvl = selfPlayer.upgrades[category] || 0;
                        const isMax = currentLvl >= 10;
                        const rawCost = [100, 220, 380, 600, 1000, 1500, 2200, 3100, 4200, 5500][currentLvl] || 0;
                        const cost = selfPlayer.empireTrait === 'syndicate' ? Math.round(rawCost * 0.75) : rawCost;
                        
                        const activeResearch = selfPlayer.research;
                        const isCurrentlyResearching = activeResearch && activeResearch.category === category;
                        const isBusy = !!activeResearch;
                        
                        let buttonContent = '';
                        let isDisabled = false;
                        let progressPct = 0;
                        let remainingSec = 0;
                        
                        if (isMax) {
                          buttonContent = 'MAX';
                          isDisabled = true;
                        } else if (isCurrentlyResearching && activeResearch) {
                          const elapsed = Date.now() - activeResearch.startTime;
                          const duration = activeResearch.duration;
                          progressPct = Math.min(100, Math.max(0, (elapsed / duration) * 100));
                          remainingSec = Math.ceil(Math.max(0, (duration - elapsed) / 1000));
                          buttonContent = `${remainingSec}s`;
                          isDisabled = true;
                        } else if (isBusy) {
                          buttonContent = 'LOCK';
                          isDisabled = true;
                        } else {
                          buttonContent = `${cost}`;
                          isDisabled = selfPlayer.credits < cost;
                        }
                        
                        return (
                          <div className="relative group flex flex-col gap-1 p-1.5 bg-slate-900/40 rounded-lg border border-slate-900/50 hover:bg-slate-900/70 transition-all">
                            {/* Tooltip */}
                            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 hidden group-hover:flex flex-col w-56 p-2.5 bg-slate-950/95 border border-slate-800 text-[10px] text-slate-300 rounded-lg shadow-xl pointer-events-none z-30 leading-normal font-sans">
                              <span className={`font-bold mb-1 text-[11px] ${colorClass}`}>{tooltipTitle}</span>
                              <span>{tooltipText}</span>
                            </div>
                            
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                                  {icon}
                                  <span className="truncate">{title}</span>
                                </div>
                                <div className="flex gap-0.5 mt-1">
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lvl) => (
                                    <span 
                                      key={lvl} 
                                      className={`w-1 h-1 rounded-sm ${
                                        currentLvl >= lvl 
                                          ? `${barColorClass} shadow-sm` 
                                          : 'bg-slate-800'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              
                              <button
                                onClick={() => handleBuyUpgrade(category)}
                                disabled={isDisabled}
                                className={`py-1 px-2 rounded text-[10px] font-bold font-mono transition-all ${
                                  isCurrentlyResearching 
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                    : isMax 
                                    ? 'bg-slate-900 text-slate-500 border border-slate-950'
                                    : isBusy
                                    ? 'bg-slate-900 text-slate-600 border border-slate-950 cursor-not-allowed'
                                    : 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-400'
                                } disabled:opacity-50`}
                              >
                                {buttonContent}
                              </button>
                            </div>
                            
                            {/* Research progress line */}
                            {isCurrentlyResearching && (
                              <div className="w-full bg-slate-950 h-1 rounded overflow-hidden mt-0.5">
                                <div 
                                  className={`h-full ${barColorClass} transition-all duration-300`} 
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      };
                      
                      return (
                        <div className="flex flex-col gap-2 max-h-[300px] xl:max-h-[380px] overflow-y-auto pr-1">
                          {renderCard(
                            'speed',
                            <Rocket className="w-3 h-3 text-cyan-400 flex-shrink-0" />,
                            'Hyperdrive',
                            'text-cyan-400',
                            'bg-cyan-500 shadow-cyan-500/50',
                            '🚀 Hyperdrive Speed',
                            'Increases fleet travel speed across the sector by +20% per level. Perfect for quick strikes and rapid reinforcement.'
                          )}
                          {renderCard(
                            'production',
                            <Users className="w-3 h-3 text-emerald-400 flex-shrink-0" />,
                            'Shipyard',
                            'text-emerald-400',
                            'bg-emerald-500 shadow-emerald-500/50',
                            '🏭 Shipyard Production',
                            'Increases ship construction speed and orbital population growth rates on all owned systems by +15% per level.'
                          )}
                          {renderCard(
                            'defense',
                            <Shield className="w-3 h-3 text-indigo-400 flex-shrink-0" />,
                            'Shields',
                            'text-indigo-400',
                            'bg-indigo-500 shadow-indigo-500/50',
                            '🛡️ Planetary Shields',
                            'Increases system defense garrison multiplier by +10% per level. Makes your planets significantly harder to siege and capture.'
                          )}
                          {renderCard(
                            'sensors',
                            <Zap className="w-3 h-3 text-yellow-500 flex-shrink-0" />,
                            'Deep Mining',
                            'text-yellow-400',
                            'bg-yellow-500 shadow-yellow-500/50',
                            '⚡ Deep Mining Operations',
                            'Boosts resource extraction and passive credit generation efficiency on all credit systems by +15% per level.'
                          )}
                          {renderCard(
                            'capacity',
                            <Package className="w-3 h-3 text-purple-400 flex-shrink-0" />,
                            'Naval Capacity',
                            'text-purple-400',
                            'bg-purple-500 shadow-purple-500/50',
                            '📦 Naval Capacity',
                            'Increases maximum empire ship capacity limit by +500 and individual planet local ship capacities by +15% per level.'
                          )}
                          {renderCard(
                            'weapons',
                            <Swords className="w-3 h-3 text-rose-500 flex-shrink-0" />,
                            'Weapons Tech',
                            'text-rose-500',
                            'bg-rose-500 shadow-rose-500/50',
                            '⚔️ Ship Weapons Research',
                            'Increases ship combat damage in mid-air battles and planetary sieges by +10% per level. Also counters planetary shield defense bonuses by 5% per level.'
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Tactical Comms (Chat) */}
              <div className="flex-1 flex flex-col bg-slate-900/20 border border-slate-900 rounded-xl p-3 min-h-0">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                  Tactical Comms
                </h4>

                <div 
                  ref={gameChatContainerRef}
                  className="flex-1 min-h-0 overflow-y-auto bg-slate-950/40 border border-slate-950 rounded-lg p-2 space-y-1 mb-2 font-sans"
                >
                  {lobby.chat.slice(-15).map((msg) => {
                    const sender = lobby.players.find((p) => p.id === msg.senderId);
                    return (
                      <div key={msg.id} className="text-[10px] flex items-start gap-1 leading-relaxed">
                        {sender?.emoji && <span className="text-xs flex-shrink-0">{sender.emoji}</span>}
                        <span 
                          className="font-semibold flex-shrink-0"
                          style={{ color: msg.senderColor }}
                        >
                          {msg.senderName}:
                        </span>
                        <span className="text-slate-300 break-all">{msg.text}</span>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value.slice(0, 60))}
                    placeholder="Coordinate with sector..."
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    maxLength={60}
                    id="comms-message-input"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 font-semibold text-[10px] text-white rounded-lg transition"
                  >
                    Send
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
