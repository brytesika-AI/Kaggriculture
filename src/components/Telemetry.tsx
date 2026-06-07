import React from 'react';
import type { GameState, CropType } from '../game/simulation';
import { CROP_CONFIGS } from '../game/simulation';
import { 
  DollarSign, Droplet, Sprout, 
  Sun, CloudRain, CloudLightning, Thermometer, Wind 
} from 'lucide-react';

interface TelemetryProps {
  state: GameState;
}

export const Telemetry: React.FC<TelemetryProps> = ({ state }) => {
  const { cash, water, waterCapacity, fertilizer, seeds, harvested, weather, weatherForecast } = state;

  const getWeatherIcon = (w: string, size = 24) => {
    switch (w) {
      case 'Sunny':
        return <Sun size={size} style={{ color: '#f59e0b' }} className="animate-float" />;
      case 'Rainy':
        return <CloudRain size={size} style={{ color: '#38bdf8' }} />;
      case 'Heatwave':
        return <Thermometer size={size} style={{ color: '#ef4444' }} className="animate-pulse-slow" />;
      case 'Storm':
        return <CloudLightning size={size} style={{ color: '#a855f7' }} />;
      case 'Drought':
        return <Wind size={size} style={{ color: '#94a3b8' }} />;
      default:
        return <Sun size={size} />;
    }
  };

  const getCropDisplay = (crop: CropType) => {
    switch (crop) {
      case 'wheat': return { emoji: '🌾', color: '#fcd34d' };
      case 'corn': return { emoji: '🌽', color: '#fbbf24' };
      case 'tomato': return { emoji: '🍅', color: '#f87171' };
      case 'grape': return { emoji: '🍇', color: '#c084fc' };
    }
  };

  // Calculate total net worth (Cash + Crop inventories at current prices)
  const totalCropValue = (Object.keys(harvested) as CropType[]).reduce((total, crop) => {
    return total + (harvested[crop] * state.marketPrices.crops[crop]);
  }, 0);
  const netWorth = cash + totalCropValue;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
      
      {/* Capital Telemetry Card */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>FINANCIAL CAPITAL</span>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '6px', borderRadius: '8px' }}>
            <DollarSign size={18} style={{ color: 'var(--c-gold)' }} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--c-text-primary)', fontFamily: 'var(--font-mono)' }}>
            ${cash.toLocaleString()}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--c-text-secondary)', marginTop: '4px' }}>
            <span>Harvest Valuation: ${totalCropValue}</span>
            <span style={{ color: 'var(--c-primary)' }}>Net Worth: ${netWorth}</span>
          </div>
        </div>
      </div>

      {/* Reservoir Telemetry Card */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>WATER TELEMETRY</span>
          <div style={{ background: 'rgba(14, 165, 233, 0.1)', padding: '6px', borderRadius: '8px' }}>
            <Droplet size={18} style={{ color: 'var(--c-water)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {water} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--c-text-muted)' }}>/ {waterCapacity} L</span>
            </span>
            {water < 200 && (
              <span className="badge danger animate-pulse-slow">Critical</span>
            )}
          </div>
          
          {/* Progress Bar */}
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${(water / waterCapacity) * 100}%`,
              height: '100%',
              background: varWaterGradient(water),
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Resources & Inventory Card */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>RESOURCES</span>
          <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '6px', borderRadius: '8px' }}>
            <Sprout size={18} style={{ color: 'var(--c-purple)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
          {/* Fertilizer Stock */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
            <span style={{ color: 'var(--c-text-secondary)' }}>Fertilizer Packs:</span>
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{fertilizer} available</span>
          </div>
          
          {/* Seeds Inventory */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Seeds Inventory</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(Object.keys(seeds) as CropType[]).map(crop => {
                const info = getCropDisplay(crop);
                return (
                  <div key={crop} style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title={`${CROP_CONFIGS[crop].name} seeds`}>
                    <span>{info.emoji}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{seeds[crop]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Weather Forecast Card */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--c-text-secondary)', fontWeight: 500 }}>METEOROLOGY</span>
          <span className="badge info">{weather}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
            {getWeatherIcon(weather, 32)}
          </div>
          <div style={{ flexGrow: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{weather} Today</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', marginTop: '2px' }}>
              Forecast: {weatherForecast.slice(0, 4).join(' → ')}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

// Helper for water bar colors
function varWaterGradient(water: number): string {
  if (water < 200) return 'var(--grad-danger)';
  if (water < 500) return 'var(--grad-gold)';
  return 'var(--grad-water)';
}
