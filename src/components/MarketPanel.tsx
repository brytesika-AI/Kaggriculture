import React, { useEffect, useRef } from 'react';
import type { GameState, CropType } from '../game/simulation';
import { CROP_CONFIGS } from '../game/simulation';
import { TrendingUp, TrendingDown, ArrowUpRight, ShoppingBag } from 'lucide-react';

interface MarketPanelProps {
  state: GameState;
}

export const MarketPanel: React.FC<MarketPanelProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { marketPrices, marketHistory, logs } = state;

  // Render the market history chart using HTML Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and size canvas
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Support retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (marketHistory.length < 2) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting market historical data...', width / 2, height / 2);
      return;
    }

    // Colors mapping for crops
    const colors: Record<CropType, string> = {
      wheat: '#fbbf24', // Yellow
      corn: '#f59e0b', // Amber
      tomato: '#ef4444', // Red
      grape: '#a855f7' // Purple
    };

    // Find min and max price across all history for scaling
    let maxPrice = 0;
    let minPrice = Infinity;
    
    marketHistory.forEach(h => {
      (Object.keys(h.crops) as CropType[]).forEach(crop => {
        const p = h.crops[crop];
        if (p > maxPrice) maxPrice = p;
        if (p < minPrice) minPrice = p;
      });
    });

    // Add padding to scales
    maxPrice = maxPrice * 1.15;
    minPrice = Math.max(0, minPrice * 0.85);

    const padding = { top: 15, right: 15, bottom: 20, left: 35 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Draw horizontal gridlines
    const gridCount = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridCount; i++) {
      const y = padding.top + (plotHeight / gridCount) * i;
      const priceVal = Math.round(maxPrice - ((maxPrice - minPrice) / gridCount) * i);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Text labels
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`$${priceVal}`, padding.left - 8, y + 3);
    }

    // Draw paths for each crop
    const crops = Object.keys(CROP_CONFIGS) as CropType[];
    
    crops.forEach(crop => {
      ctx.strokeStyle = colors[crop];
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      marketHistory.forEach((h, index) => {
        const val = h.crops[crop];
        
        // Scale coordinates
        const x = padding.left + (index / (marketHistory.length - 1)) * plotWidth;
        const y = padding.top + (1 - (val - minPrice) / (maxPrice - minPrice)) * plotHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw active value node at the end
      if (marketHistory.length > 0) {
        const lastIndex = marketHistory.length - 1;
        const lastVal = marketHistory[lastIndex].crops[crop];
        const lastX = padding.left + plotWidth;
        const lastY = padding.top + (1 - (lastVal - minPrice) / (maxPrice - minPrice)) * plotHeight;

        ctx.fillStyle = colors[crop];
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner white dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw timeline label at bottom
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    
    const firstDay = marketHistory[0].day;
    const lastDay = marketHistory[marketHistory.length - 1].day;
    
    ctx.fillText(`Day ${firstDay}`, padding.left, height - 4);
    ctx.fillText(`Day ${lastDay}`, width - padding.right, height - 4);

  }, [marketHistory]);

  // Filters transactions out of the general log
  const tradeLogs = logs
    .filter(l => ['Buy Seeds', 'Buy Fertilizer', 'Sell Harvest', 'Refill Reservoir'].includes(l.action))
    .slice(-5)
    .reverse();

  const getCropTrend = (crop: CropType) => {
    const current = marketPrices.crops[crop];
    const base = CROP_CONFIGS[crop].baseSellPrice;
    const diff = current - base;
    const pct = Math.round((diff / base) * 100);

    if (diff > 0) {
      return (
        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.8rem' }}>
          <TrendingUp size={14} /> +{pct}%
        </span>
      );
    } else if (diff < 0) {
      return (
        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.8rem' }}>
          <TrendingDown size={14} /> {pct}%
        </span>
      );
    }
    return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>--</span>;
  };

  const getCropEmoji = (crop: CropType) => {
    switch (crop) {
      case 'wheat': return '🌾';
      case 'corn': return '🌽';
      case 'tomato': return '🍅';
      case 'grape': return '🍇';
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
        <ArrowUpRight size={20} style={{ color: 'var(--c-gold)' }} />
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Commodity Market</h2>
      </div>

      {/* Grid of Prices & Chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Table */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', color: 'var(--c-text-secondary)' }}>
                <th style={{ padding: '8px 4px', fontWeight: 600 }}>Crop Type</th>
                <th style={{ padding: '8px 4px', fontWeight: 600 }}>Seed Cost</th>
                <th style={{ padding: '8px 4px', fontWeight: 600 }}>Sell Price</th>
                <th style={{ padding: '8px 4px', fontWeight: 600 }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(CROP_CONFIGS) as CropType[]).map(crop => (
                <tr key={crop} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                  <td style={{ padding: '10px 4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                    <span>{getCropEmoji(crop)}</span>
                    <span>{CROP_CONFIGS[crop].name}</span>
                  </td>
                  <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)' }}>${marketPrices.seeds[crop]}</td>
                  <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${marketPrices.crops[crop]}</td>
                  <td style={{ padding: '10px 4px' }}>{getCropTrend(crop)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '10px 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🧪</span>
                  <span>Fertilizer</span>
                </td>
                <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)' }}>--</td>
                <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${marketPrices.fertilizer}</td>
                <td style={{ padding: '10px 4px', color: 'var(--c-text-muted)' }}>pack</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Historic Line Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price Fluctuations (15 Days)</span>
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '10px', height: '140px' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* Trade Logs Ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--c-text-primary)' }}>
            <ShoppingBag size={14} style={{ color: 'var(--c-gold)' }} />
            <span>Transaction Ledger</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '115px', overflowY: 'auto' }}>
            {tradeLogs.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', fontStyle: 'italic', padding: '4px' }}>No transactions recorded yet.</span>
            ) : (
              tradeLogs.map((log, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.01)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  border: '1px solid rgba(255,255,255,0.02)',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>Day {log.day}</span>
                    <span style={{ fontWeight: 600, color: log.type === 'success' ? '#34d399' : '#f87171' }}>{log.action}</span>
                  </div>
                  <span style={{ color: 'var(--c-text-secondary)', fontFamily: 'var(--font-mono)' }}>{log.details.split('Reason:')[0]}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
