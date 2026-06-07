import { useState, useEffect, useRef } from 'react';
import { 
  INITIAL_STATE, 
  runDailyTick, 
  CROP_CONFIGS 
} from './game/simulation';
import type { GameState, AgentAction, CropType } from './game/simulation';
import { queryAgent } from './game/agents';
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
    model: 'qwen2.5-coder:7b'
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

  // Main tick loop
  useEffect(() => {
    let intervalId: any = null;

    if (isRunning) {
      intervalId = setInterval(async () => {
        if (isQueryingRef.current) return;
        isQueryingRef.current = true;

        const currentState = stateRef.current;
        const currentConfig = configRef.current;

        // 1. Set agents thinking status
        setIsThinking({ Farmer: true, Trader: true, RiskAnalyst: true });

        try {
          // 2. Query Agents sequentially to model conversation flow
          // First, Risk Analyst reviews forecast and advises
          const riskResult = await queryAgent('RiskAnalyst', currentState, currentConfig);
          setIsThinking(prev => ({ ...prev, RiskAnalyst: false }));
          setAgentThoughts(prev => ({ ...prev, RiskAnalyst: riskResult }));
          
          // Construct intermediate state with Analyst messages so Farmer/Trader can read them
          let intermediateState = { ...currentState };
          riskResult.actions.forEach(act => {
            if (act.type === 'MESSAGE' && act.recipient && act.message) {
              intermediateState.agentMessages.push({
                day: currentState.day,
                sender: 'RiskAnalyst',
                recipient: act.recipient,
                message: act.message
              });
            }
          });

          // Second, Farmer decides what to water/plant/harvest
          const farmerResult = await queryAgent('Farmer', intermediateState, currentConfig);
          setIsThinking(prev => ({ ...prev, Farmer: false }));
          setAgentThoughts(prev => ({ ...prev, Farmer: farmerResult }));

          // Update intermediate state with Farmer messages (e.g. asking Trader for seeds)
          farmerResult.actions.forEach(act => {
            if (act.type === 'MESSAGE' && act.recipient && act.message) {
              intermediateState.agentMessages.push({
                day: currentState.day,
                sender: 'Farmer',
                recipient: act.recipient,
                message: act.message
              });
            }
          });

          // Third, Trader sells crop and buys seeds/fertilizers
          const traderResult = await queryAgent('Trader', intermediateState, currentConfig);
          setIsThinking(prev => ({ ...prev, Trader: false }));
          setAgentThoughts(prev => ({ ...prev, Trader: traderResult }));

          // 3. Compile all actions
          const riskActions: AgentAction[] = riskResult.actions.map(a => ({ ...a, agent: 'RiskAnalyst' } as AgentAction));
          const farmerActions: AgentAction[] = farmerResult.actions.map(a => ({ ...a, agent: 'Farmer' } as AgentAction));
          const traderActions: AgentAction[] = traderResult.actions.map(a => ({ ...a, agent: 'Trader' } as AgentAction));

          const dayActions = [...riskActions, ...farmerActions, ...traderActions];

          // 4. Run tick update
          setState(prev => runDailyTick(prev, dayActions));

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

  // Handle manual player overrides
  const handleManualAction = (action: { type: string; plotId: number; cropType?: CropType }) => {
    setState(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as GameState;
      const plot = next.plots[action.plotId];

      if (action.type === 'WATER') {
        const waterNeeded = Math.min(50, 100 - plot.waterLevel);
        if (next.water >= waterNeeded) {
          next.water -= waterNeeded;
          plot.waterLevel += waterNeeded;
          next.logs.push({
            day: next.day,
            agent: 'Manual Override',
            action: 'Water Crop',
            details: `Watered Plot #${action.plotId} (+${waterNeeded} moisture).`,
            type: 'info'
          });
        }
      } 
      
      else if (action.type === 'PLANT' && action.cropType) {
        if (next.seeds[action.cropType] > 0) {
          next.seeds[action.cropType] -= 1;
          plot.cropType = action.cropType;
          plot.growth = 0;
          plot.daysGrowing = 0;
          plot.waterLevel = Math.max(plot.waterLevel, 40);
          next.logs.push({
            day: next.day,
            agent: 'Manual Override',
            action: 'Plant Crop',
            details: `Planted ${CROP_CONFIGS[action.cropType].name} on Plot #${action.plotId}.`,
            type: 'info'
          });
        }
      } 
      
      else if (action.type === 'FERTILIZE') {
        if (next.fertilizer > 0 && !plot.fertilized) {
          next.fertilizer -= 1;
          plot.fertilized = true;
          next.logs.push({
            day: next.day,
            agent: 'Manual Override',
            action: 'Apply Fertilizer',
            details: `Applied fertilizer to Plot #${action.plotId}.`,
            type: 'info'
          });
        }
      } 
      
      else if (action.type === 'HARVEST') {
        if (plot.cropType && plot.growth >= 100) {
          const crop = plot.cropType;
          next.harvested[crop] += 1;
          next.logs.push({
            day: next.day,
            agent: 'Manual Override',
            action: 'Harvest Crop',
            details: `Harvested ${CROP_CONFIGS[crop].name} from Plot #${action.plotId}.`,
            type: 'info'
          });
          plot.cropType = null;
          plot.growth = 0;
          plot.daysGrowing = 0;
          plot.fertilized = false;
        }
      }

      return next;
    });
  };

  const handleReset = () => {
    setState(INITIAL_STATE);
    setIsRunning(false);
    setAgentThoughts({ Farmer: null, Trader: null, RiskAnalyst: null });
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
