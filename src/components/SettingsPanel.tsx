import React from 'react';
import type { AgentConfig } from '../game/agents';
import { Settings, Play, Pause, RefreshCw, Cpu, Database } from 'lucide-react';

interface SettingsPanelProps {
  config: AgentConfig;
  setConfig: (config: AgentConfig) => void;
  isRunning: boolean;
  setIsRunning: (run: boolean) => void;
  speedMs: number;
  setSpeedMs: (speed: number) => void;
  onReset: () => void;
  day: number;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  setConfig,
  isRunning,
  setIsRunning,
  speedMs,
  setSpeedMs,
  onReset,
  day
}) => {
  const handleModeChange = (mode: AgentConfig['mode']) => {
    let defaultEndpoint = 'http://localhost:11434';
    let defaultModel = 'qwen2.5-coder:7b';
    
    if (mode === 'openai') {
      defaultEndpoint = 'https://openrouter.ai/api/v1';
      defaultModel = 'meta-llama/llama-3-8b-instruct';
    } else if (mode === 'heuristic') {
      defaultEndpoint = '';
      defaultModel = 'Heuristic Engine';
    }

    setConfig({
      ...config,
      mode,
      endpoint: defaultEndpoint,
      model: defaultModel
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
        <Settings size={20} className="animate-float" style={{ color: 'var(--c-primary)' }} />
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Simulation Settings</h2>
      </div>

      {/* Control Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => setIsRunning(!isRunning)} 
          className={`glass-btn ${isRunning ? 'danger' : 'primary'}`}
          style={{ flexGrow: 1, justifyContent: 'center' }}
        >
          {isRunning ? (
            <>
              <Pause size={18} /> Pause Simulation
            </>
          ) : (
            <>
              <Play size={18} /> Start Simulation
            </>
          )}
        </button>

        <button 
          onClick={onReset} 
          className="glass-btn"
          style={{ flexGrow: 0, justifyContent: 'center' }}
          title="Reset Farm"
        >
          <RefreshCw size={18} /> Reset
        </button>
      </div>

      {/* Speed Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--c-text-secondary)' }}>
          <span>Day Duration (Simulation Speed)</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-primary)' }}>{speedMs / 1000}s</span>
        </div>
        <input 
          type="range" 
          min="1500" 
          max="8000" 
          step="500"
          value={speedMs} 
          onChange={(e) => setSpeedMs(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--c-primary)', cursor: 'pointer' }}
        />
      </div>

      {/* Agent API Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
          <Cpu size={16} style={{ color: 'var(--c-secondary)' }} />
          <span>LLM Agent Driver</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {(['heuristic', 'ollama', 'openai'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className="glass-btn"
              style={{
                fontSize: '0.8rem',
                padding: '6px 4px',
                justifyContent: 'center',
                borderColor: config.mode === mode ? 'var(--c-secondary)' : 'var(--border-glass)',
                background: config.mode === mode ? 'var(--c-secondary-glow)' : 'transparent',
                fontWeight: config.mode === mode ? 600 : 400
              }}
            >
              {mode === 'heuristic' && 'Smart Local'}
              {mode === 'ollama' && 'Ollama'}
              {mode === 'openai' && 'Custom API'}
            </button>
          ))}
        </div>

        {config.mode !== 'heuristic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>API Endpoint</label>
              <input 
                type="text" 
                className="glass-input" 
                value={config.endpoint}
                onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
                placeholder="http://localhost:11434"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>Model Name</label>
              <input 
                type="text" 
                className="glass-input" 
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="llama3"
              />
            </div>

            {config.mode === 'openai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>API Key</label>
                <input 
                  type="password" 
                  className="glass-input" 
                  value={config.apiKey || ''}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.05)',
              border: '1px dashed rgba(99, 102, 241, 0.2)',
              fontSize: '0.75rem',
              color: 'var(--c-text-secondary)',
              alignItems: 'flex-start'
            }}>
              <Database size={14} style={{ color: 'var(--c-secondary)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                {config.mode === 'ollama' ? (
                  <span>Ensure Ollama is running and accessible (enable CORS if connecting from web browsers: set <code style={{ fontSize: '0.7rem' }}>OLLAMA_ORIGINS="*"</code>).</span>
                ) : (
                  <span>Specify an OpenAI-compatible endpoint. Enter model identifier (e.g. meta-llama/llama-3-8b-instruct) and API Key.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Farm Stats Summary */}
      <div style={{
        marginTop: 'auto',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '0.8rem',
        display: 'flex',
        justifyContent: 'space-between',
        color: 'var(--c-text-secondary)'
      }}>
        <span>Days Under Management:</span>
        <span style={{ fontWeight: 600, color: 'var(--c-text-primary)', fontFamily: 'var(--font-mono)' }}>Day {day}</span>
      </div>
    </div>
  );
};
