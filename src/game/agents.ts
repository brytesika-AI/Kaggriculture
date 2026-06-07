import type { GameState, AgentAction, CropType } from './simulation';
import { CROP_CONFIGS } from './simulation';

export interface AgentConfig {
  mode: 'heuristic' | 'ollama' | 'openai' | 'cloudflare';
  endpoint: string; // e.g. http://localhost:11434
  model: string; // e.g. llama3, qwen2.5-coder, mistral
  apiKey?: string;
  accountId?: string; // Cloudflare Account ID
  userDirective?: string; // Strategy Directive (Natural Language)
}

export interface AgentResponse {
  thoughts: string;
  actions: Omit<AgentAction, 'agent'>[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
  };
}

// -----------------------------------------------------------------
// Prompt Templates
// -----------------------------------------------------------------

function getSystemInstructions(role: string): string {
  return `You are the ${role} Agent in Kaggriculture, a farming simulation game.
You collaborate with two other agents (Farmer, Trader, RiskAnalyst) to run a 6x6 farm grid (Plots 0-35) and maximize profits.

You must respond ONLY with a valid JSON object. Do not include markdown code block syntax (like \`\`\`json) in your reply. Respond with raw JSON only.
Your JSON response must follow this schema exactly:
{
  "thoughts": "Your detailed reasoning, observations of the weather, cash, resources, and current state.",
  "actions": [
    {
      "type": "ACTION_TYPE", 
      // depends on role
    }
  ]
}

Ensure all JSON properties are double-quoted. Do not write text outside the JSON object.`;
}

function getFarmerPrompt(state: GameState, messages: GameState['agentMessages']): string {
  const plotsSummary = state.plots
    .map(p => `Plot #${p.id}: Crop=${p.cropType || 'None'}, Growth=${p.growth}%, Water=${p.waterLevel}%, Fertilized=${p.fertilized ? 'Yes' : 'No'}`)
    .join('\n');

  const incomingMsgs = messages
    .filter(m => m.recipient === 'Farmer')
    .map(m => `[From ${m.sender}]: ${m.message}`)
    .join('\n');

  return `Current Game State (Day ${state.day}):
- Weather Today: ${state.weather}
- Weather Forecast: ${state.weatherForecast.join(' -> ')}
- Farm Water Reservoir: ${state.water}/${state.waterCapacity} units
- Fertilizer Stock: ${state.fertilizer} packs
- Seed Stock: ${JSON.stringify(state.seeds)}
- Plot States:
${plotsSummary}

Incoming Messages:
${incomingMsgs || 'No new messages.'}

As the Farmer Agent, you control:
1. {"type": "PLANT", "plotId": number, "cropType": "wheat"|"corn"|"tomato"|"grape", "reason": "why"}
2. {"type": "WATER", "plotId": number}
3. {"type": "FERTILIZE", "plotId": number}
4. {"type": "HARVEST", "plotId": number}
5. {"type": "MESSAGE", "recipient": "Trader"|"RiskAnalyst", "message": "text"}
6. {"type": "WAIT"}

Rules:
- You can only plant if seeds are available.
- Grapes grow slow but sell high. Wheat grows fast but sells low.
- Crops wither and die if Plot Water is 0. Keep crops watered!
- Apply fertilizer to accelerate growth rate by 30%.
- Harvest crops once growth reaches 100%.
- If you lack seeds, MESSAGE the Trader to buy them.
- Output up to 4 actions for today in the "actions" array. Keep it rational.`;
}

function getTraderPrompt(state: GameState, messages: GameState['agentMessages']): string {
  const incomingMsgs = messages
    .filter(m => m.recipient === 'Trader')
    .map(m => `[From ${m.sender}]: ${m.message}`)
    .join('\n');

  return `Current Game State (Day ${state.day}):
- Cash Available: $${state.cash}
- Water Reservoir: ${state.water}/${state.waterCapacity} units
- Fertilizer Stock: ${state.fertilizer} packs
- Seed Stock: ${JSON.stringify(state.seeds)}
- Harvested Crops Inventory (Unsold): ${JSON.stringify(state.harvested)}
- Market Prices:
  - Seeds: ${JSON.stringify(state.marketPrices.seeds)}
  - Crops (Sell Price): ${JSON.stringify(state.marketPrices.crops)}
  - Fertilizer: $${state.marketPrices.fertilizer}/pack
  - Water Refill (300 units): $${state.marketPrices.waterRefill}

Incoming Messages:
${incomingMsgs || 'No new messages.'}

As the Trader Agent, you control:
1. {"type": "BUY_SEED", "cropType": "wheat"|"corn"|"tomato"|"grape", "quantity": number}
2. {"type": "BUY_FERTILIZER", "quantity": number}
3. {"type": "SELL_CROP", "cropType": "wheat"|"corn"|"tomato"|"grape", "quantity": number}
4. {"type": "REFILL_WATER"}
5. {"type": "MESSAGE", "recipient": "Farmer"|"RiskAnalyst", "message": "text"}
6. {"type": "WAIT"}

Rules:
- Sell harvested crops to earn cash.
- Buy seeds requested by the Farmer, if cash allows.
- Buy fertilizer if stock is low (< 3 packs).
- Buy water refill if reservoir is critical (< 200 units).
- Do not overspend. Retain a buffer of cash for emergencies.
- Output up to 3 actions for today in the "actions" array.`;
}

function getRiskAnalystPrompt(state: GameState, messages: GameState['agentMessages']): string {
  const plotsSummary = state.plots
    .filter(p => p.cropType !== null)
    .map(p => `Plot #${p.id}: ${p.cropType} (${p.growth}% grown)`)
    .join(', ') || 'No crops planted';

  const incomingMsgs = messages
    .filter(m => m.recipient === 'RiskAnalyst')
    .map(m => `[From ${m.sender}]: ${m.message}`)
    .join('\n');

  return `Current Game State (Day ${state.day}):
- Cash Available: $${state.cash}
- Weather Forecast: ${state.weather} -> ${state.weatherForecast.join(' -> ')}
- Water Reservoir: ${state.water}/${state.waterCapacity}
- Market Prices (Selling): ${JSON.stringify(state.marketPrices.crops)}
- Planted Crops: ${plotsSummary}

Incoming Messages:
${incomingMsgs || 'No new messages.'}

As the RiskAnalyst Agent, your role is strategy, coordination, and advice. You do not touch the farm or the market directly. You send messages to guide the Farmer and Trader.
You control:
1. {"type": "MESSAGE", "recipient": "Farmer"|"Trader", "message": "text"}
2. {"type": "WAIT"}

Rules:
- Analyze weather forecasts: alert Farmer of upcoming Droughts/Storms so they can manage reservoir levels.
- Analyze crop prices: advise Trader when prices are exceptionally high to sell, or low to hold.
- Direct Farmer on what crops to plant based on price trends.
- Output up to 2 message actions in the "actions" array.`;
}

// -----------------------------------------------------------------
// Heuristic Agent Decider (Fallback and Mock Engine)
// -----------------------------------------------------------------

export function runHeuristicAgent(role: 'Farmer' | 'Trader' | 'RiskAnalyst', state: GameState): AgentResponse {
  const thoughts: string[] = [];
  const actions: Omit<AgentAction, 'agent'>[] = [];

  // Get messages for current day or previous day
  const messages = state.agentMessages.filter(m => m.day === state.day - 1);

  if (role === 'Farmer') {
    thoughts.push(`Checking plots on Day ${state.day}.`);
    
    // 1. Harvest any grown crops
    const readyPlots = state.plots.filter(p => p.cropType !== null && p.growth >= 100);
    readyPlots.forEach(p => {
      actions.push({ type: 'HARVEST', plotId: p.id });
      thoughts.push(`Plot #${p.id} has fully grown ${p.cropType}. Harvesting it.`);
    });

    // 2. Water dry plots containing crops
    const dryPlots = state.plots.filter(p => p.cropType !== null && p.waterLevel < 40);
    let tempWater = state.water;
    dryPlots.forEach(p => {
      if (tempWater >= 50 && actions.length < 4) {
        actions.push({ type: 'WATER', plotId: p.id });
        tempWater -= 50;
        thoughts.push(`Plot #${p.id} (${p.cropType}) water is low at ${p.waterLevel}%. Irrigating plot.`);
      }
    });

    // 3. Fertilize unfertilized crops
    let tempFert = state.fertilizer;
    const unfertPlots = state.plots.filter(p => p.cropType !== null && !p.fertilized);
    unfertPlots.forEach(p => {
      if (tempFert > 0 && actions.length < 4) {
        actions.push({ type: 'FERTILIZE', plotId: p.id });
        tempFert -= 1;
        thoughts.push(`Plot #${p.id} (${p.cropType}) is unfertilized. Applying fertilizer to accelerate growth.`);
      }
    });

    // 4. Plant seeds in empty plots
    const emptyPlots = state.plots.filter(p => p.cropType === null);
    const availableSeeds = { ...state.seeds };

    // Priority order for planting
    const plantPriority: CropType[] = ['grape', 'tomato', 'corn', 'wheat'];
    
    emptyPlots.forEach(p => {
      if (actions.length < 4) {
        // Find first seed available in priority
        const seedToPlant = plantPriority.find(crop => availableSeeds[crop] > 0);
        if (seedToPlant) {
          actions.push({ type: 'PLANT', plotId: p.id, cropType: seedToPlant, reason: 'High profit margin' });
          availableSeeds[seedToPlant] -= 1;
          thoughts.push(`Plot #${p.id} is empty. Planting ${seedToPlant}.`);
        }
      }
    });

    // If empty plots remain but we have zero seeds of high value, request Trader
    const totalSeeds = Object.values(state.seeds).reduce((a, b) => a + b, 0);
    if (emptyPlots.length > 3 && totalSeeds < 2 && actions.length < 4) {
      const preferred = state.cash > 400 ? 'grape' : 'tomato';
      actions.push({
        type: 'MESSAGE',
        recipient: 'Trader',
        message: `Farmer: We have ${emptyPlots.length} empty plots but we are out of seeds. Please purchase some ${preferred} or corn seeds.`
      });
      thoughts.push(`Out of seeds with multiple empty fields. Messaging Trader to restock seeds.`);
    }

    if (actions.length === 0) {
      actions.push({ type: 'WAIT' });
      thoughts.push('All fields in good condition. Resting today.');
    }
  }

  else if (role === 'Trader') {
    thoughts.push(`Managing treasury and supply logistics.`);
    
    // 1. Sell all harvested crops immediately for liquidity
    const cropsToSell = (Object.keys(state.harvested) as CropType[]).filter(crop => state.harvested[crop] > 0);
    cropsToSell.forEach(crop => {
      const qty = state.harvested[crop];
      actions.push({ type: 'SELL_CROP', cropType: crop, quantity: qty });
      thoughts.push(`Selling harvested inventory of ${qty}x ${CROP_CONFIGS[crop].name} for $${state.marketPrices.crops[crop] * qty}.`);
    });

    // 2. Replenish water if reservoir is low
    if (state.water < 200 && state.cash >= state.marketPrices.waterRefill && actions.length < 3) {
      actions.push({ type: 'REFILL_WATER' });
      thoughts.push(`Water reservoir level is critical (${state.water} units). Buying refill for $${state.marketPrices.waterRefill}.`);
    }

    // 3. Purchase fertilizer if low
    if (state.fertilizer < 3 && state.cash > state.marketPrices.fertilizer * 3 && actions.length < 3) {
      actions.push({ type: 'BUY_FERTILIZER', quantity: 3 });
      thoughts.push(`Fertilizer stock is low (${state.fertilizer} packs). Buying 3 packs.`);
    }

    // 4. Respond to Farmer requests or buy seeds proactively
    const seedReq = messages.find(m => m.sender === 'Farmer' && m.message.includes('seeds'));
    const totalSeeds = Object.values(state.seeds).reduce((a, b) => a + b, 0);
    
    if (actions.length < 3) {
      if (seedReq && state.cash > 150) {
        const cropToBuy = seedReq.message.includes('grape') && state.cash > 400 ? 'grape' : 'tomato';
        actions.push({ type: 'BUY_SEED', cropType: cropToBuy, quantity: 2 });
        thoughts.push(`Received seed request from Farmer. Buying 2x ${cropToBuy} seeds.`);
      } else if (totalSeeds < 3 && state.cash > 250) {
        // Proactively buy some tomato or corn seeds
        const seedType = state.cash > 500 ? 'tomato' : 'corn';
        actions.push({ type: 'BUY_SEED', cropType: seedType, quantity: 2 });
        thoughts.push(`Proactively replenishing seed stock. Buying 2x ${seedType} seeds.`);
      }
    }

    if (actions.length === 0) {
      actions.push({ type: 'WAIT' });
      thoughts.push('Treasury healthy. No transactions needed today.');
    }
  }

  else if (role === 'RiskAnalyst') {
    thoughts.push(`Analyzing weather telemetry and crop markets.`);

    // 1. Check for incoming severe weather
    const droughtDay = state.weatherForecast.findIndex(w => w === 'Drought');
    const stormDay = state.weatherForecast.findIndex(w => w === 'Storm');

    if (droughtDay !== -1 && droughtDay <= 2) {
      actions.push({
        type: 'MESSAGE',
        recipient: 'Farmer',
        message: `RiskAnalyst: Alert! Drought forecasted in ${droughtDay + 1} days. Conserve water and ensure plots are highly irrigated before it hits.`
      });
      thoughts.push(`Drought forecasted soon. Warning Farmer to preemptively water crops.`);
    } else if (stormDay !== -1 && stormDay <= 2) {
      actions.push({
        type: 'MESSAGE',
        recipient: 'Farmer',
        message: `RiskAnalyst: Alert! Heavy storm forecast in ${stormDay + 1} days. Extreme wind risk. Delay planting high-value seeds like grapes until storm passes.`
      });
      thoughts.push(`Storm warning. Advising Farmer to hold off planting expensive crops.`);
    }

    // 2. Market advising
    const grapePrice = state.marketPrices.crops.grape;

    if (grapePrice > 145 && actions.length < 2) {
      actions.push({
        type: 'MESSAGE',
        recipient: 'Trader',
        message: `RiskAnalyst: Grape sell prices are currently very high ($${grapePrice}/unit). Liquidate grape stocks immediately.`
      });
      thoughts.push(`Grapes are peaking. Prompting Trader to sell.`);
    }

    if (actions.length === 0) {
      // General encouragement/coordination
      actions.push({
        type: 'MESSAGE',
        recipient: 'Farmer',
        message: `RiskAnalyst: Everything looks stable. Maintain crop rotation and soil moisture levels.`
      });
      thoughts.push('No anomalies detected. Keeping communication lines warm.');
    }
  }

  return { thoughts: thoughts.join(' '), actions };
}

// -----------------------------------------------------------------
// Live API Call to Local Ollama or OpenAI-Compatible API
// -----------------------------------------------------------------

async function fetchLLMCompletion(config: AgentConfig, systemPrompt: string, userPrompt: string): Promise<string> {
  let url = '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.mode === 'cloudflare') {
    url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1/chat/completions`;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  } else if (config.mode === 'ollama') {
    url = `${config.endpoint}/v1/chat/completions`;
  } else {
    url = `${config.endpoint}/chat/completions`;
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1, // low temperature for structured logic
      // Only include response_format if not cloudflare, since Cloudflare AI might fail with response_format parameter
      ...(config.mode !== 'cloudflare' ? { response_format: { type: 'json_object' } } : {})
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error: ${response.statusText} (${response.status}) - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Clean and parse LLM response
function cleanAndParseJSON(rawContent: string): AgentResponse {
  // Strip potential markdown fence characters if the model ignored instructions
  let cleaned = rawContent.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '');
  }
  cleaned = cleaned.trim();
  
  return JSON.parse(cleaned) as AgentResponse;
}

export async function queryAgent(role: 'Farmer' | 'Trader' | 'RiskAnalyst', state: GameState, config: AgentConfig): Promise<AgentResponse> {
  if (config.mode === 'heuristic') {
    return runHeuristicAgent(role, state);
  }

  const systemInstructions = getSystemInstructions(role);
  let userPrompt = '';
  
  // Get messages for current day or previous day
  const messages = state.agentMessages.filter(m => m.day === state.day - 1);

  if (role === 'Farmer') {
    userPrompt = getFarmerPrompt(state, messages);
  } else if (role === 'Trader') {
    userPrompt = getTraderPrompt(state, messages);
  } else {
    userPrompt = getRiskAnalystPrompt(state, messages);
  }

  try {
    const rawResult = await fetchLLMCompletion(config, systemInstructions, userPrompt);
    const parsed = cleanAndParseJSON(rawResult);
    
    // Basic validation of keys
    if (parsed.thoughts === undefined || !Array.isArray(parsed.actions)) {
      throw new Error("Missing 'thoughts' or 'actions' array in LLM response");
    }

    return parsed;
  } catch (error) {
    console.error(`Agent ${role} API call failed, falling back to heuristic:`, error);
    const fallback = runHeuristicAgent(role, state);
    fallback.thoughts = `[API Error Fallback] ${fallback.thoughts}`;
    return fallback;
  }
}
