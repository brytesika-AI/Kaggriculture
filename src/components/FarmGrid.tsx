import React, { useState, useEffect, useRef } from 'react';
import type { GameState, CropType } from '../game/simulation';
import { CROP_CONFIGS } from '../game/simulation';
import { Droplet, Sprout, Star, Sparkles, ChevronRight } from 'lucide-react';

interface FarmGridProps {
  state: GameState;
  onManualAction: (action: { type: string; plotId: number; cropType?: CropType }) => void;
}

interface FloatingIndicator {
  id: number;
  plotId: number;
  text: string;
  color: string;
  timestamp: number;
}

export const FarmGrid: React.FC<FarmGridProps> = ({ state, onManualAction }) => {
  const [selectedPlotId, setSelectedPlotId] = useState<number | null>(null);
  const { plots, seeds, water, fertilizer } = state;
  const [indicators, setIndicators] = useState<FloatingIndicator[]>([]);
  const prevPlotsRef = useRef(plots);

  // Monitor plots and trigger floating text
  useEffect(() => {
    const prevPlots = prevPlotsRef.current;
    const currentPlots = plots;
    
    if (prevPlots && prevPlots.length === currentPlots.length) {
      const newIndicators: FloatingIndicator[] = [];
      
      currentPlots.forEach((plot, idx) => {
        const prev = prevPlots[idx];
        if (!prev) return;
        
        // 1. Water level increased
        if (plot.waterLevel > prev.waterLevel) {
          const diff = plot.waterLevel - prev.waterLevel;
          newIndicators.push({
            id: Math.random(),
            plotId: plot.id,
            text: `+${diff}% H2O`,
            color: '#0ea5e9',
            timestamp: Date.now()
          });
        }
        
        // 2. Crop planted
        if (plot.cropType && !prev.cropType) {
          newIndicators.push({
            id: Math.random(),
            plotId: plot.id,
            text: `Planted ${CROP_CONFIGS[plot.cropType].name}`,
            color: '#10b981',
            timestamp: Date.now()
          });
        }
        
        // 3. Crop fertilized
        if (plot.fertilized && !prev.fertilized) {
          newIndicators.push({
            id: Math.random(),
            plotId: plot.id,
            text: `Boosted! ✨`,
            color: '#a855f7',
            timestamp: Date.now()
          });
        }
        
        // 4. Crop harvested or withered
        if (!plot.cropType && prev.cropType) {
          if (prev.growth >= 100) {
            newIndicators.push({
              id: Math.random(),
              plotId: plot.id,
              text: `Harvested! 🌾`,
              color: '#f59e0b',
              timestamp: Date.now()
            });
          } else {
            newIndicators.push({
              id: Math.random(),
              plotId: plot.id,
              text: `Withered! 🍂`,
              color: '#ef4444',
              timestamp: Date.now()
            });
          }
        }
      });
      
      if (newIndicators.length > 0) {
        setIndicators(prev => [...prev, ...newIndicators]);
      }
    }
    
    prevPlotsRef.current = plots;
  }, [plots]);

  // Clean up indicators
  useEffect(() => {
    if (indicators.length > 0) {
      const timer = setTimeout(() => {
        setIndicators(prev => prev.filter(ind => Date.now() - ind.timestamp < 2000));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [indicators]);

  const selectedPlot = selectedPlotId !== null ? plots[selectedPlotId] : null;

  const getCropEmoji = (cropType: CropType | null, growth: number) => {
    if (!cropType) return '';
    if (growth < 30) return '🌱'; // sprout
    if (growth < 70) {
      // mid-growth
      switch (cropType) {
        case 'wheat': return '🌿';
        case 'corn': return '🌿';
        case 'tomato': return '🪴';
        case 'grape': return '🍇'; // grapes are purple vines
      }
    }
    // Fully grown
    switch (cropType) {
      case 'wheat': return '🌾';
      case 'corn': return '🌽';
      case 'tomato': return '🍅';
      case 'grape': return '🍇';
    }
  };

  const getCropName = (cropType: CropType | null) => {
    if (!cropType) return 'Fallow';
    return CROP_CONFIGS[cropType].name;
  };

  const handlePlotClick = (id: number) => {
    setSelectedPlotId(selectedPlotId === id ? null : id);
  };

  const handlePlant = (crop: CropType) => {
    if (selectedPlotId !== null) {
      onManualAction({ type: 'PLANT', plotId: selectedPlotId, cropType: crop });
    }
  };

  const handleWater = () => {
    if (selectedPlotId !== null) {
      onManualAction({ type: 'WATER', plotId: selectedPlotId });
    }
  };

  const handleFertilize = () => {
    if (selectedPlotId !== null) {
      onManualAction({ type: 'FERTILIZE', plotId: selectedPlotId });
    }
  };

  const handleHarvest = () => {
    if (selectedPlotId !== null) {
      onManualAction({ type: 'HARVEST', plotId: selectedPlotId });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      
      {/* Farm Map Board */}
      <div className="glass-panel" style={{ padding: '20px', flexGrow: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sprout size={20} style={{ color: 'var(--c-primary)' }} />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Farm Fields Grid (6x6)</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary)' }}>Click plots to manually override</span>
        </div>

        {/* 6x6 CSS Grid */}
        <div className="plot-grid" style={{ position: 'relative' }}>
          
          {/* Weather Overlay Container */}
          <div className="weather-overlay-container">
            {state.weather === 'Rainy' && <div className="weather-overlay-rain" />}
            {state.weather === 'Storm' && <div className="weather-overlay-storm" />}
            {state.weather === 'Heatwave' && <div className="weather-overlay-heatwave" />}
            {state.weather === 'Drought' && <div className="weather-overlay-drought" />}
            {state.weather === 'Sunny' && <div className="weather-overlay-sunny" />}
          </div>

          {plots.map(plot => {
            const hasCrop = plot.cropType !== null;
            const isDry = plot.waterLevel < 25;
            const isHarvestReady = hasCrop && plot.growth >= 100;
            const isSelected = selectedPlotId === plot.id;
            const plotIndicators = indicators.filter(ind => ind.plotId === plot.id);

            return (
              <div
                key={plot.id}
                onClick={() => handlePlotClick(plot.id)}
                className={`plot-card 
                  ${hasCrop ? 'active-crop' : ''} 
                  ${isDry ? 'dry' : 'wet'} 
                  ${isHarvestReady ? 'harvest-ready' : ''}
                `}
                style={{
                  outline: isSelected ? '2px solid var(--c-primary)' : 'none',
                  boxShadow: isSelected ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none'
                }}
              >
                {/* Floating Indicators */}
                {plotIndicators.map(ind => (
                  <div 
                    key={ind.id} 
                    className="floating-indicator" 
                    style={{ color: ind.color }}
                  >
                    {ind.text}
                  </div>
                ))}

                {/* Plot ID */}
                <div className="plot-id">#{plot.id}</div>

                {/* Soil background showing water moisture */}
                <div 
                  className="plot-soil" 
                  style={{ height: `${plot.waterLevel * 0.4}%` }} 
                />

                {/* Plot details / Crop Icon */}
                <div className="crop-icon-wrapper">
                  {hasCrop ? (
                    <div className={`crop-sprite ${plot.growth >= 100 ? 'mature' : plot.growth >= 30 ? 'growing' : 'sprouting'}`}>
                      {getCropEmoji(plot.cropType, plot.growth)}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.15, fontSize: '1.2rem' }}>🟫</div>
                  )}
                </div>

                {/* Moisture level indicator */}
                <div className="plot-water-indicator" style={{ color: plot.waterLevel < 20 ? 'var(--c-danger)' : 'var(--c-water)' }}>
                  <Droplet size={8} fill="currentColor" />
                  <span>{plot.waterLevel}%</span>
                </div>

                {/* Fertilized Indicator */}
                {plot.fertilized && (
                  <div className="plot-fertilizer-star" title="Fertilized">
                    <Star size={10} fill="currentColor" />
                  </div>
                )}

                {/* Harvest Ready Glow */}
                {isHarvestReady && (
                  <div style={{ position: 'absolute', top: '4px', left: '18px', zIndex: 3 }} className="animate-pulse-slow">
                    <Sparkles size={10} style={{ color: 'var(--c-gold)' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Override Action Panel */}
      <div className="glass-panel" style={{ padding: '20px', minHeight: '135px' }}>
        {selectedPlot ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🟫</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Manual Control: Plot #{selectedPlot.id}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--c-text-secondary)' }}>
                    Soil Moisture: {selectedPlot.waterLevel}% | Status: {selectedPlot.cropType ? `${getCropName(selectedPlot.cropType)} (${selectedPlot.growth}% grown)` : 'Empty field'}
                  </div>
                </div>
              </div>
              <button className="glass-btn" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setSelectedPlotId(null)}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* Watering Button */}
              <button 
                onClick={handleWater} 
                className="glass-btn" 
                disabled={water < 50 || selectedPlot.waterLevel >= 100}
                style={{ fontSize: '0.8rem' }}
              >
                <Droplet size={14} /> Water Plot (Cost 50L)
              </button>

              {/* Fertilizer Button */}
              {selectedPlot.cropType !== null && (
                <button 
                  onClick={handleFertilize} 
                  className="glass-btn" 
                  disabled={fertilizer <= 0 || selectedPlot.fertilized}
                  style={{ fontSize: '0.8rem' }}
                >
                  <Star size={14} /> Fertilize (Cost 1 Pack)
                </button>
              )}

              {/* Harvest Button */}
              {selectedPlot.cropType !== null && selectedPlot.growth >= 100 && (
                <button 
                  onClick={handleHarvest} 
                  className="glass-btn primary"
                  style={{ fontSize: '0.8rem' }}
                >
                  <Sparkles size={14} /> Harvest {getCropName(selectedPlot.cropType)}
                </button>
              )}

              {/* Planting Options */}
              {selectedPlot.cropType === null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Plant: <ChevronRight size={12} />
                  </span>
                  {(['wheat', 'corn', 'tomato', 'grape'] as CropType[]).map(crop => (
                    <button
                      key={crop}
                      onClick={() => handlePlant(crop)}
                      className="glass-btn"
                      disabled={seeds[crop] <= 0}
                      style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                    >
                      {crop === 'wheat' && '🌾 Wheat'}
                      {crop === 'corn' && '🌽 Corn'}
                      {crop === 'tomato' && '🍅 Tomato'}
                      {crop === 'grape' && '🍇 Grape'}
                      <span style={{ color: 'var(--c-text-muted)', fontSize: '0.7rem', marginLeft: '4px' }}>({seeds[crop]})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--c-text-muted)', fontSize: '0.85rem', padding: '24px 0' }}>
            <span>Click any grid plot cell to manually plant, water, fertilize, or harvest.</span>
          </div>
        )}
      </div>

    </div>
  );
};
