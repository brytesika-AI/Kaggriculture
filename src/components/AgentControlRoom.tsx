import React, { useState, useEffect, useRef } from 'react';
import type { GameState } from '../game/simulation';
import type { AgentResponse } from '../game/agents';
import { MessageSquare, Terminal, Eye, MessageCircle, AlertCircle } from 'lucide-react';

interface AgentControlRoomProps {
  state: GameState;
  agentThoughts: Record<string, AgentResponse | null>;
  isThinking: Record<string, boolean>;
}

export const AgentControlRoom: React.FC<AgentControlRoomProps> = ({
  state,
  agentThoughts,
  isThinking
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'farmer' | 'trader' | 'risk'>('chats');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.agentMessages]);

  const getAgentAvatar = (name: string) => {
    switch (name) {
      case 'Farmer': return { emoji: '👨‍🌾', color: 'var(--c-primary)', grad: 'var(--grad-primary)' };
      case 'Trader': return { emoji: '🤵', color: 'var(--c-gold)', grad: 'var(--grad-gold)' };
      case 'RiskAnalyst': return { emoji: '🕵️‍♂️', color: 'var(--c-secondary)', grad: 'var(--grad-secondary)' };
      default: return { emoji: '🤖', color: '#94a3b8', grad: 'var(--grad-dark)' };
    }
  };

  const getAgentStatus = (name: string) => {
    if (isThinking[name]) {
      return (
        <span style={{ color: 'var(--c-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="animate-pulse-slow" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
          thinking...
        </span>
      );
    }
    return <span style={{ color: 'var(--c-text-muted)' }}>idling</span>;
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', minHeight: '400px' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={20} style={{ color: 'var(--c-secondary)' }} />
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Agent Control & Comms</h2>
        </div>
        
        {/* Status Pills */}
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
          {['Farmer', 'Trader', 'RiskAnalyst'].map(name => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
              <span>{getAgentAvatar(name).emoji}</span>
              <span style={{ fontWeight: 500, color: 'var(--c-text-secondary)' }}>{name}:</span>
              <span>{getAgentStatus(name)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveTab('chats')}
          className="glass-btn"
          style={{
            fontSize: '0.8rem',
            padding: '6px 12px',
            borderColor: activeTab === 'chats' ? 'var(--c-secondary)' : 'transparent',
            background: activeTab === 'chats' ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            color: activeTab === 'chats' ? 'var(--c-text-primary)' : 'var(--c-text-secondary)'
          }}
        >
          <MessageCircle size={14} /> Agent Comms ({state.agentMessages.length})
        </button>

        {['Farmer', 'Trader', 'RiskAnalyst'].map(agent => {
          const tabKey = agent.toLowerCase() === 'riskanalyst' ? 'risk' : agent.toLowerCase() as 'farmer' | 'trader';
          const avatar = getAgentAvatar(agent);
          return (
            <button
              key={agent}
              onClick={() => setActiveTab(tabKey)}
              className="glass-btn"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderColor: activeTab === tabKey ? avatar.color : 'transparent',
                background: activeTab === tabKey ? `${avatar.color}15` : 'transparent',
                color: activeTab === tabKey ? 'var(--c-text-primary)' : 'var(--c-text-secondary)'
              }}
            >
              <Terminal size={14} /> {agent} Thoughts
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: '380px' }}>
        
        {/* Chat Transcript Panel */}
        {activeTab === 'chats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px', minHeight: '220px' }}>
            {state.agentMessages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: '8px', color: 'var(--c-text-muted)', height: '220px' }}>
                <Eye size={24} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>Listening to agent communications...</span>
              </div>
            ) : (
              state.agentMessages.map((msg, idx) => {
                const senderAvatar = getAgentAvatar(msg.sender);
                
                return (
                  <div key={idx} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: 'flex-start',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    maxWidth: '85%',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '1rem' }}>{senderAvatar.emoji}</span>
                      <span style={{ fontWeight: 600, color: senderAvatar.color }}>{msg.sender}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>→ {msg.recipient}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>Day {msg.day}</span>
                    </div>
                    <div style={{ color: 'var(--c-text-primary)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Farmer / Trader / Risk Analyst Thoughts Panel */}
        {['farmer', 'trader', 'risk'].includes(activeTab) && (() => {
          const agentName = activeTab === 'farmer' ? 'Farmer' : activeTab === 'trader' ? 'Trader' : 'RiskAnalyst';
          const thoughts = agentThoughts[agentName];
          const avatar = getAgentAvatar(agentName);

          if (isThinking[agentName]) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '10px' }}>
                <div className="animate-pulse-slow" style={{ fontSize: '2.5rem' }}>{avatar.emoji}</div>
                <span style={{ fontSize: '0.85rem', color: 'var(--c-text-secondary)' }}>Agent is querying LLM models and formulating plan...</span>
              </div>
            );
          }

          if (!thoughts) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '8px', color: 'var(--c-text-muted)' }}>
                <AlertCircle size={20} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>No cognitive records for {agentName} yet. Start simulation.</span>
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px' }}>
              
              {/* Reasoning Block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: avatar.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thoughts / Rationale</span>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderLeft: `3px solid ${avatar.color}`,
                  padding: '12px',
                  borderRadius: '0 8px 8px 0',
                  fontSize: '0.85rem',
                  lineHeight: 1.45,
                  color: 'var(--c-text-primary)'
                }}>
                  {thoughts.thoughts}
                </div>
              </div>

              {/* Token Usage Telemetry (Day 5: Observability) */}
              {thoughts.usage && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LLM Observability Telemetry</span>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: '0.8rem',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.03)',
                    padding: '8px 12px',
                    borderRadius: '8px'
                  }}>
                    <div>Prompt: <span style={{ color: 'var(--c-primary)', fontWeight: 600 }}>{thoughts.usage.prompt_tokens}</span> tokens</div>
                    <div>•</div>
                    <div>Completion: <span style={{ color: 'var(--c-secondary)', fontWeight: 600 }}>{thoughts.usage.completion_tokens}</span> tokens</div>
                    <div>•</div>
                    <div>Total: <span style={{ color: 'var(--c-text-primary)', fontWeight: 600 }}>{thoughts.usage.total_tokens}</span> tokens</div>
                    {thoughts.usage.cached_tokens && thoughts.usage.cached_tokens > 0 ? (
                      <>
                        <div>•</div>
                        <div style={{ color: '#10b981' }}>Cached: <span style={{ fontWeight: 600 }}>{thoughts.usage.cached_tokens}</span> tokens</div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Actions Plan Block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Formulated Action Queue</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {thoughts.actions.map((act, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid rgba(255,255,255,0.03)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '0.8rem'
                    }}>
                      <span className="badge info" style={{ fontSize: '0.7rem' }}>Action #{i+1}</span>
                      <span style={{ fontWeight: 600, color: 'var(--c-text-primary)' }}>{act.type}</span>
                      {act.plotId !== undefined && (
                        <span style={{ color: 'var(--c-text-secondary)' }}>on Plot #{act.plotId}</span>
                      )}
                      {act.cropType && (
                        <span className="badge purple" style={{ textTransform: 'none' }}>{act.cropType}</span>
                      )}
                      {act.quantity && (
                        <span style={{ color: 'var(--c-text-secondary)' }}>x{act.quantity}</span>
                      )}
                      {act.recipient && (
                        <span style={{ color: 'var(--c-text-muted)' }}>to {act.recipient}</span>
                      )}
                    </div>
                  ))}
                  {thoughts.actions.length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', fontStyle: 'italic' }}>No actions planned.</span>
                  )}
                </div>
              </div>

            </div>
          );
        })()}

      </div>
    </div>
  );
};
