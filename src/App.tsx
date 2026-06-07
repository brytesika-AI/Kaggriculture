import { useState, useEffect, useRef } from 'react';
import { INITIAL_STATE } from './game/simulation';
import type { GameState, CropType } from './game/simulation';
import type { AgentConfig, AgentResponse } from './game/agents';
import { SettingsPanel } from './components/SettingsPanel';
import { Telemetry } from './components/Telemetry';
import { MarketPanel } from './components/MarketPanel';
import { AgentControlRoom } from './components/AgentControlRoom';
import { FarmGrid } from './components/FarmGrid';
import { 
  Sprout, 
  Bot, 
  GitBranch,
  Shield
} from 'lucide-react';
import confetti from 'canvas-confetti';

function App() {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [config, setConfig] = useState<AgentConfig>({
    mode: 'heuristic',
    endpoint: 'http://localhost:11434',
    model: 'qwen2.5-coder:7b',
    accountId: '244693f2079c982e757ff6ec7dbd8f96',
    apiKey: ''
  });
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [speedMs, setSpeedMs] = useState<number>(4000); // 4 seconds per tick
  const [isThinking, setIsThinking] = useState<Record<string, boolean>>({
    Farmer: false,
    Trader: false,
    RiskAnalyst: false
  });
  const [agentThoughts, setAgentThoughts] = useState<Record<string, AgentResponse | null>>({
    Farmer: null,
    Trader: null,
    RiskAnalyst: null
  });

  const stateRef = useRef<GameState>(state);
  const configRef = useRef<AgentConfig>(config);
  const isQueryingRef = useRef<boolean>(false);
  
  // Keep refs up-to-date to avoid stale state in interval closures
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Milestone confetti triggering
  useEffect(() => {
    if (state.cash >= 2000 && state.day > 1) {
      // Trigger milestone celebration
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#6366f1', '#fbbf24']
      });
    }
  }, [state.cash]);

  // Synchronize initial state from backend
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const data = await res.json();
          setState(data.state);
          setAgentThoughts(data.thoughts);
        }
      } catch (err) {
        console.error("Failed to fetch initial state:", err);
      }
    };
    fetchInitialState();
  }, []);

  // Main tick loop calling FastAPI backend
  useEffect(() => {
    let intervalId: any = null;

    if (isRunning) {
      intervalId = setInterval(async () => {
        if (isQueryingRef.current) return;
        isQueryingRef.current = true;

        const currentConfig = configRef.current;

        // 1. Set agents thinking status
        setIsThinking({ Farmer: true, Trader: true, RiskAnalyst: true });

        try {
          const res = await fetch('/api/tick', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentConfig)
          });
          
          if (!res.ok) {
            throw new Error(`Backend tick failed: ${res.statusText}`);
          }
          
          const data = await res.json();
          setState(data.state);
          setAgentThoughts(data.thoughts);
        } catch (err) {
          console.error("Simulation tick failed:", err);
        } finally {
          setIsThinking({ Farmer: false, Trader: false, RiskAnalyst: false });
          isQueryingRef.current = false;
        }

      }, speedMs);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRunning, speedMs]);

  // Handle manual player overrides via FastAPI backend
  const handleManualAction = async (action: { type: string; plotId: number; cropType?: CropType }) => {
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: action.type,
          plotId: action.plotId,
          cropType: action.cropType || null
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Manual override action failed");
      }
      const data = await res.json();
      setState(data.state);
      setAgentThoughts(data.thoughts);
    } catch (err: any) {
      console.error("Manual action failed:", err);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/reset', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
        setAgentThoughts(data.thoughts);
      }
    } catch (err) {
      console.error("Reset failed:", err);
    }
    setIsRunning(false);
    setIsThinking({ Farmer: false, Trader: false, RiskAnalyst: false });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flexGrow: 1 }}>
      
      {/* Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderRadius: '16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-glass)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'var(--grad-primary)',
            padding: '10px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px var(--c-primary-glow)'
          }}>
            <Sprout size={24} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #10b981, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              KAGGRICULTURE
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', margin: 0 }}>Autonomous Multi-Agent Farming Simulation</p>
          </div>
        </div>

        {/* Global Control Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary)' }}>System:</span>
            <span className={`badge ${config.mode === 'heuristic' ? 'success' : 'purple'}`}>
              <Bot size={12} style={{ marginRight: '4px' }} />
              {config.mode === 'heuristic' ? 'Smart Simulator' : config.model}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary)' }}>Status:</span>
            <span className={`badge ${isRunning ? 'success' : 'warning'}`}>
              {isRunning ? 'Running' : 'Paused'}
            </span>
          </div>
        </div>
      </header>

      {/* Resource Telemetry Row */}
      <Telemetry state={state} />

      {/* Main Grid Dashboards */}
      <div className="dashboard-grid">
        
        {/* Left Hand: Visual Grid Map */}
        <FarmGrid 
          state={state} 
          onManualAction={handleManualAction} 
        />

        {/* Right Hand: Settings & Commodity Market */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <SettingsPanel 
            config={config}
            setConfig={setConfig}
            isRunning={isRunning}
            setIsRunning={setIsRunning}
            speedMs={speedMs}
            setSpeedMs={setSpeedMs}
            onReset={handleReset}
            day={state.day}
          />
          <MarketPanel state={state} />
        </div>

      </div>

      {/* Agent Comms & Thought logs */}
      <AgentControlRoom 
        state={state}
        agentThoughts={agentThoughts}
        isThinking={isThinking}
      />

      {/* Bottom Footer Section */}
      <footer style={{
        marginTop: 'auto',
        padding: '24px 0 12px 0',
        borderTop: '1px solid var(--border-glass)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.8rem',
        color: 'var(--c-text-muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Shield size={14} style={{ color: 'var(--c-primary)' }} />
          <span>Secured Autonomous Sandbox Environments</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="https://github.com/brytesika-AI/Kaggriculture" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <GitBranch size={14} /> GitHub Repository
          </a>
          <span>•</span>
          <span style={{ color: 'var(--c-text-secondary)', fontWeight: 600 }}>
            Footer by: BryteSikaStrategyAI
          </span>
        </div>
      </footer>

    </div>
  );
}

export default App;
