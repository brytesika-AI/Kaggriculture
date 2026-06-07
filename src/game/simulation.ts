export type CropType = 'wheat' | 'tomato' | 'corn' | 'grape';
export type Weather = 'Sunny' | 'Rainy' | 'Heatwave' | 'Storm' | 'Drought';

export interface Plot {
  id: number;
  cropType: CropType | null;
  growth: number; // 0 to 100
  waterLevel: number; // 0 to 100
  fertilized: boolean;
  daysGrowing: number;
}

export interface GameState {
  day: number;
  weather: Weather;
  weatherForecast: Weather[];
  cash: number;
  water: number; // current reserves (0 - 1000)
  waterCapacity: number;
  fertilizer: number;
  seeds: Record<CropType, number>;
  harvested: Record<CropType, number>;
  plots: Plot[];
  marketPrices: {
    crops: Record<CropType, number>;
    seeds: Record<CropType, number>;
    fertilizer: number;
    waterRefill: number;
  };
  marketHistory: {
    day: number;
    crops: Record<CropType, number>;
  }[];
  logs: {
    day: number;
    agent: string;
    action: string;
    details: string;
    type: 'info' | 'success' | 'warning' | 'danger';
  }[];
  agentMessages: {
    day: number;
    sender: string;
    recipient: string;
    message: string;
  }[];
}

export interface AgentAction {
  agent: 'Farmer' | 'Trader' | 'RiskAnalyst';
  type: 'PLANT' | 'WATER' | 'FERTILIZE' | 'HARVEST' | 'BUY_SEED' | 'BUY_FERTILIZER' | 'SELL_CROP' | 'REFILL_WATER' | 'MESSAGE' | 'WAIT';
  plotId?: number;
  cropType?: CropType;
  quantity?: number;
  recipient?: string;
  message?: string;
  reason?: string;
}

export const CROP_CONFIGS: Record<CropType, {
  name: string;
  growthRate: number; // percentage per day under normal conditions
  waterConsumption: number; // water lost per day
  baseSeedPrice: number;
  baseSellPrice: number;
  minPrice: number;
  maxPrice: number;
}> = {
  wheat: { name: 'Wheat', growthRate: 25, waterConsumption: 8, baseSeedPrice: 10, baseSellPrice: 30, minPrice: 15, maxPrice: 55 },
  corn: { name: 'Corn', growthRate: 18, waterConsumption: 12, baseSeedPrice: 15, baseSellPrice: 45, minPrice: 25, maxPrice: 80 },
  tomato: { name: 'Tomato', growthRate: 14, waterConsumption: 16, baseSeedPrice: 22, baseSellPrice: 65, minPrice: 35, maxPrice: 115 },
  grape: { name: 'Grape', growthRate: 8, waterConsumption: 20, baseSeedPrice: 40, baseSellPrice: 130, minPrice: 70, maxPrice: 240 }
};

export const INITIAL_STATE: GameState = {
  day: 1,
  weather: 'Sunny',
  weatherForecast: ['Sunny', 'Sunny', 'Rainy', 'Sunny', 'Heatwave'],
  cash: 1000,
  water: 600,
  waterCapacity: 1000,
  fertilizer: 6,
  seeds: { wheat: 5, corn: 3, tomato: 2, grape: 0 },
  harvested: { wheat: 0, corn: 0, tomato: 0, grape: 0 },
  plots: Array.from({ length: 36 }, (_, i) => ({
    id: i,
    cropType: null,
    growth: 0,
    waterLevel: 50,
    fertilized: false,
    daysGrowing: 0
  })),
  marketPrices: {
    crops: { wheat: 30, corn: 45, tomato: 65, grape: 130 },
    seeds: { wheat: 10, corn: 15, tomato: 22, grape: 40 },
    fertilizer: 25,
    waterRefill: 50
  },
  marketHistory: [
    { day: 1, crops: { wheat: 30, corn: 45, tomato: 65, grape: 130 } }
  ],
  logs: [
    { day: 1, agent: 'System', action: 'Simulation Start', details: 'Welcome to Kaggriculture. Farm initialized with $1,000.', type: 'info' }
  ],
  agentMessages: []
};

// Generates next weather based on current weather probabilities
export function generateNextWeather(current: Weather): Weather {
  const rand = Math.random();
  switch (current) {
    case 'Sunny':
      if (rand < 0.5) return 'Sunny';
      if (rand < 0.8) return 'Rainy';
      if (rand < 0.9) return 'Heatwave';
      return 'Drought';
    case 'Rainy':
      if (rand < 0.4) return 'Rainy';
      if (rand < 0.8) return 'Sunny';
      if (rand < 0.95) return 'Storm';
      return 'Drought';
    case 'Heatwave':
      if (rand < 0.5) return 'Heatwave';
      if (rand < 0.8) return 'Sunny';
      return 'Drought';
    case 'Storm':
      if (rand < 0.3) return 'Storm';
      if (rand < 0.8) return 'Rainy';
      return 'Sunny';
    case 'Drought':
      if (rand < 0.6) return 'Drought';
      if (rand < 0.9) return 'Sunny';
      return 'Rainy';
  }
}

export function updatePrices(currentPrices: GameState['marketPrices'], weather: Weather, _day: number): GameState['marketPrices'] {
  const nextPrices = JSON.parse(JSON.stringify(currentPrices)) as GameState['marketPrices'];
  
  // Weather price multipliers
  let cropMultiplier = 1.0;
  let seedMultiplier = 1.0;
  let fertilizerMultiplier = 1.0;

  if (weather === 'Drought' || weather === 'Heatwave') {
    // Crop shortages drive prices up, water refills cost more
    cropMultiplier = 1.15;
    nextPrices.waterRefill = Math.min(120, Math.max(40, Math.round(nextPrices.waterRefill * 1.1)));
  } else if (weather === 'Rainy' || weather === 'Storm') {
    // Water is cheap, crops grow well so prices might drop slightly
    cropMultiplier = 0.92;
    nextPrices.waterRefill = Math.max(30, Math.round(nextPrices.waterRefill * 0.85));
  }

  // Adjust crop prices
  (Object.keys(CROP_CONFIGS) as CropType[]).forEach(crop => {
    const config = CROP_CONFIGS[crop];
    const noise = 1 + (Math.random() * 0.16 - 0.08); // +/- 8% daily noise
    let price = Math.round(nextPrices.crops[crop] * noise * cropMultiplier);
    
    // Regression to mean
    const meanDiff = config.baseSellPrice - price;
    price += Math.round(meanDiff * 0.05); // pull back 5% towards base
    
    nextPrices.crops[crop] = Math.min(config.maxPrice, Math.max(config.minPrice, price));

    // Seeds track crop prices at about 33% value
    const seedPriceNoise = 1 + (Math.random() * 0.06 - 0.03);
    let seedPrice = Math.round(nextPrices.crops[crop] * 0.33 * seedPriceNoise * seedMultiplier);
    nextPrices.seeds[crop] = Math.min(config.baseSeedPrice * 2, Math.max(Math.round(config.baseSeedPrice * 0.6), seedPrice));
  });

  // Fertilizer price fluctuation
  const fertNoise = 1 + (Math.random() * 0.1 - 0.05);
  nextPrices.fertilizer = Math.min(45, Math.max(15, Math.round(nextPrices.fertilizer * fertNoise * fertilizerMultiplier)));

  return nextPrices;
}

export function runDailyTick(state: GameState, actions: AgentAction[]): GameState {
  // Deep copy state to avoid mutating React state directly
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;
  
  nextState.day += 1;

  // 1. Shift weather and forecast
  const currentForecast = [...nextState.weatherForecast];
  const oldWeather = nextState.weather;
  nextState.weather = currentForecast.shift() || 'Sunny';
  
  // Append new weather to forecast
  let lastWeather = currentForecast[currentForecast.length - 1] || nextState.weather;
  currentForecast.push(generateNextWeather(lastWeather));
  nextState.weatherForecast = currentForecast;

  nextState.logs.push({
    day: nextState.day,
    agent: 'System',
    action: 'Weather Change',
    details: `Weather is now ${nextState.weather} (was ${oldWeather}).`,
    type: 'info'
  });

  // 2. Apply general weather impacts to water capacity
  if (nextState.weather === 'Rainy') {
    nextState.water = Math.min(nextState.waterCapacity, nextState.water + 120);
    nextState.logs.push({
      day: nextState.day,
      agent: 'Environment',
      action: 'Rain Collection',
      details: 'Rainfall replenished water reservoir by +120 units.',
      type: 'success'
    });
  } else if (nextState.weather === 'Storm') {
    nextState.water = Math.min(nextState.waterCapacity, nextState.water + 250);
    nextState.logs.push({
      day: nextState.day,
      agent: 'Environment',
      action: 'Storm Refill',
      details: 'Heavy storm filled the water reservoir by +250 units.',
      type: 'success'
    });
  }

  // 3. Process agent actions
  actions.forEach(action => {
    // Process messages first
    if (action.type === 'MESSAGE' && action.recipient && action.message) {
      nextState.agentMessages.push({
        day: nextState.day,
        sender: action.agent,
        recipient: action.recipient,
        message: action.message
      });
      nextState.logs.push({
        day: nextState.day,
        agent: action.agent,
        action: 'Send Message',
        details: `To ${action.recipient}: "${action.message}"`,
        type: 'info'
      });
      return;
    }

    if (action.type === 'PLANT' && action.plotId !== undefined && action.cropType) {
      const plot = nextState.plots[action.plotId];
      if (plot.cropType === null) {
        if (nextState.seeds[action.cropType] > 0) {
          nextState.seeds[action.cropType] -= 1;
          plot.cropType = action.cropType;
          plot.growth = 0;
          plot.daysGrowing = 0;
          plot.waterLevel = Math.max(plot.waterLevel, 40); // planting prepares soil
          nextState.logs.push({
            day: nextState.day,
            agent: action.agent,
            action: 'Plant Crop',
            details: `Planted ${CROP_CONFIGS[action.cropType].name} on Plot #${action.plotId}. Reason: ${action.reason || 'None'}`,
            type: 'success'
          });
        } else {
          nextState.logs.push({
            day: nextState.day,
            agent: action.agent,
            action: 'Action Failed',
            details: `Failed to plant ${action.cropType} on Plot #${action.plotId}: Out of seeds.`,
            type: 'danger'
          });
        }
      }
    }

    else if (action.type === 'WATER' && action.plotId !== undefined) {
      const plot = nextState.plots[action.plotId];
      const waterNeeded = 100 - plot.waterLevel;
      const waterToApply = Math.min(waterNeeded, 50); // water in increments of 50
      
      if (nextState.water >= waterToApply) {
        nextState.water -= waterToApply;
        plot.waterLevel += waterToApply;
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Water Crop',
          details: `Watered Plot #${action.plotId} (+${waterToApply} water). Reservoir: ${nextState.water}/${nextState.waterCapacity}.`,
          type: 'success'
        });
      } else if (nextState.water > 0) {
        const partial = nextState.water;
        nextState.water = 0;
        plot.waterLevel += partial;
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Water Crop (Partial)',
          details: `Drained last ${partial} units of water reservoir to irrigate Plot #${action.plotId}.`,
          type: 'warning'
        });
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `Cannot water Plot #${action.plotId}: Reservoir empty!`,
          type: 'danger'
        });
      }
    }

    else if (action.type === 'FERTILIZE' && action.plotId !== undefined) {
      const plot = nextState.plots[action.plotId];
      if (plot.cropType !== null && !plot.fertilized) {
        if (nextState.fertilizer > 0) {
          nextState.fertilizer -= 1;
          plot.fertilized = true;
          nextState.logs.push({
            day: nextState.day,
            agent: action.agent,
            action: 'Apply Fertilizer',
            details: `Applied fertilizer to Plot #${action.plotId}. Growth speed boosted.`,
            type: 'success'
          });
        } else {
          nextState.logs.push({
            day: nextState.day,
            agent: action.agent,
            action: 'Action Failed',
            details: `Cannot fertilize Plot #${action.plotId}: Out of fertilizer.`,
            type: 'danger'
          });
        }
      }
    }

    else if (action.type === 'HARVEST' && action.plotId !== undefined) {
      const plot = nextState.plots[action.plotId];
      if (plot.cropType !== null && plot.growth >= 100) {
        const crop = plot.cropType;
        nextState.harvested[crop] += 1;
        
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Harvest Crop',
          details: `Harvested ${CROP_CONFIGS[crop].name} from Plot #${action.plotId}. Inventory +1.`,
          type: 'success'
        });
        
        // Reset plot
        plot.cropType = null;
        plot.growth = 0;
        plot.daysGrowing = 0;
        plot.fertilized = false;
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `Failed to harvest Plot #${action.plotId}: Crop not fully grown.`,
          type: 'danger'
        });
      }
    }

    else if (action.type === 'BUY_SEED' && action.cropType && action.quantity) {
      const price = nextState.marketPrices.seeds[action.cropType] * action.quantity;
      if (nextState.cash >= price) {
        nextState.cash -= price;
        nextState.seeds[action.cropType] += action.quantity;
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Buy Seeds',
          details: `Bought ${action.quantity}x ${CROP_CONFIGS[action.cropType].name} seeds for $${price}.`,
          type: 'success'
        });
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `Insufficient cash ($${nextState.cash} < $${price}) to purchase ${action.quantity}x ${action.cropType} seeds.`,
          type: 'danger'
        });
      }
    }

    else if (action.type === 'BUY_FERTILIZER' && action.quantity) {
      const price = nextState.marketPrices.fertilizer * action.quantity;
      if (nextState.cash >= price) {
        nextState.cash -= price;
        nextState.fertilizer += action.quantity;
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Buy Fertilizer',
          details: `Bought ${action.quantity}x fertilizer packs for $${price}.`,
          type: 'success'
        });
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `Insufficient cash to purchase ${action.quantity}x fertilizer ($${price}).`,
          type: 'danger'
        });
      }
    }

    else if (action.type === 'SELL_CROP' && action.cropType && action.quantity) {
      const available = nextState.harvested[action.cropType];
      const sellQty = Math.min(available, action.quantity);
      
      if (sellQty > 0) {
        const price = nextState.marketPrices.crops[action.cropType] * sellQty;
        nextState.cash += price;
        nextState.harvested[action.cropType] -= sellQty;
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Sell Harvest',
          details: `Sold ${sellQty}x harvested ${CROP_CONFIGS[action.cropType].name} for $${price} ($${nextState.marketPrices.crops[action.cropType]}/unit).`,
          type: 'success'
        });
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `No harvested ${action.cropType} in inventory to sell.`,
          type: 'danger'
        });
      }
    }

    else if (action.type === 'REFILL_WATER') {
      const cost = nextState.marketPrices.waterRefill;
      const refilAmt = 300;
      if (nextState.cash >= cost) {
        nextState.cash -= cost;
        nextState.water = Math.min(nextState.waterCapacity, nextState.water + refilAmt);
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Refill Reservoir',
          details: `Paid $${cost} to refill water reservoir (+${refilAmt} units). Current water: ${nextState.water}/${nextState.waterCapacity}.`,
          type: 'success'
        });
      } else {
        nextState.logs.push({
          day: nextState.day,
          agent: action.agent,
          action: 'Action Failed',
          details: `Failed water refill: Needs $${cost}, has $${nextState.cash}.`,
          type: 'danger'
        });
      }
    }
  });

  // 4. Update plot moisture and grow crops
  nextState.plots.forEach(plot => {
    // Water evaporation based on weather
    let evaporation = 10;
    if (nextState.weather === 'Heatwave') evaporation = 24;
    else if (nextState.weather === 'Drought') evaporation = 18;
    else if (nextState.weather === 'Sunny') evaporation = 12;
    else if (nextState.weather === 'Rainy') evaporation = 2; // minor drying
    else if (nextState.weather === 'Storm') evaporation = 0; // none

    plot.waterLevel = Math.max(0, plot.waterLevel - evaporation);

    // Crop growth logic
    if (plot.cropType !== null) {
      plot.daysGrowing += 1;
      const config = CROP_CONFIGS[plot.cropType];
      
      if (plot.waterLevel > 0) {
        let baseGrowth = config.growthRate;
        let weatherModifier = 1.0;

        // Weather impact on growth
        if (nextState.weather === 'Heatwave') {
          weatherModifier = 0.5; // too hot, growth stunted
        } else if (nextState.weather === 'Drought') {
          weatherModifier = 0.7; // dry spells retard growth
        } else if (nextState.weather === 'Storm') {
          // Storms have a chance to destroy or stunt crops
          if (Math.random() < 0.15) {
            plot.cropType = null;
            plot.growth = 0;
            plot.daysGrowing = 0;
            plot.fertilized = false;
            nextState.logs.push({
              day: nextState.day,
              agent: 'Environment',
              action: 'Crop Destroyed',
              details: `Plot #${plot.id} crop was ruined by the violent storm.`,
              type: 'danger'
            });
            return;
          }
          weatherModifier = 0.6;
        }

        // Fertilizer boost (+30% growth speed)
        const fertilizerBonus = plot.fertilized ? 1.3 : 1.0;
        
        const dayGrowth = Math.round(baseGrowth * weatherModifier * fertilizerBonus);
        plot.growth = Math.min(100, plot.growth + dayGrowth);

        // Crop consumes water
        const consumption = config.waterConsumption;
        plot.waterLevel = Math.max(0, plot.waterLevel - consumption);
      } else {
        // Crop is drying out!
        plot.growth = Math.max(0, plot.growth - 10);
        if (plot.growth === 0 && plot.daysGrowing > 3) {
          // crop dies of dehydration
          nextState.logs.push({
            day: nextState.day,
            agent: 'Environment',
            action: 'Crop Died',
            details: `The crop on Plot #${plot.id} withered and died due to zero soil moisture.`,
            type: 'danger'
          });
          plot.cropType = null;
          plot.daysGrowing = 0;
          plot.fertilized = false;
        } else {
          nextState.logs.push({
            day: nextState.day,
            agent: 'Environment',
            action: 'Crop Dehydrating',
            details: `Warning: Plot #${plot.id} is dehydrated. Crop is losing health!`,
            type: 'warning'
          });
        }
      }
    }
  });

  // 5. Update market prices for next day
  nextState.marketPrices = updatePrices(nextState.marketPrices, nextState.weather, nextState.day);
  
  // Record market price history
  nextState.marketHistory.push({
    day: nextState.day,
    crops: { ...nextState.marketPrices.crops }
  });
  
  // Keep market history capped to last 15 days to save memory / rendering overhead
  if (nextState.marketHistory.length > 15) {
    nextState.marketHistory.shift();
  }

  // 6. Keep logs capped to last 100 lines
  if (nextState.logs.length > 100) {
    nextState.logs = nextState.logs.slice(nextState.logs.length - 100);
  }

  return nextState;
}
