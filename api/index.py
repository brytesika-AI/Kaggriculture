import random
import copy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from .agents import query_langchain_agent

app = FastAPI()

# Enable CORS for frontend querying
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for Vercel/local flexibility
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------
# Game Configs & Constants
# -----------------------------------------------------------------

CROP_CONFIGS = {
    'wheat': { 'name': 'Wheat', 'growthRate': 25, 'waterConsumption': 8, 'baseSeedPrice': 10, 'baseSellPrice': 30, 'minPrice': 15, 'maxPrice': 55 },
    'corn': { 'name': 'Corn', 'growthRate': 18, 'waterConsumption': 12, 'baseSeedPrice': 15, 'baseSellPrice': 45, 'minPrice': 25, 'maxPrice': 80 },
    'tomato': { 'name': 'Tomato', 'growthRate': 14, 'waterConsumption': 16, 'baseSeedPrice': 22, 'baseSellPrice': 65, 'minPrice': 35, 'maxPrice': 115 },
    'grape': { 'name': 'Grape', 'growthRate': 8, 'waterConsumption': 20, 'baseSeedPrice': 40, 'baseSellPrice': 130, 'minPrice': 70, 'maxPrice': 240 }
}

WEATHER_TYPES = ['Sunny', 'Rainy', 'Heatwave', 'Storm', 'Drought']

def get_initial_state() -> dict:
    return {
        'day': 1,
        'weather': 'Sunny',
        'weatherForecast': ['Sunny', 'Sunny', 'Rainy', 'Sunny', 'Heatwave'],
        'cash': 1000,
        'water': 600,
        'waterCapacity': 1000,
        'fertilizer': 6,
        'seeds': { 'wheat': 5, 'corn': 3, 'tomato': 2, 'grape': 0 },
        'harvested': { 'wheat': 0, 'corn': 0, 'tomato': 0, 'grape': 0 },
        'plots': [
            {
                'id': i,
                'cropType': None,
                'growth': 0,
                'waterLevel': 50,
                'fertilized': False,
                'daysGrowing': 0
            } for i in range(36)
        ],
        'marketPrices': {
            'crops': { 'wheat': 30, 'corn': 45, 'tomato': 65, 'grape': 130 },
            'seeds': { 'wheat': 10, 'corn': 15, 'tomato': 22, 'grape': 40 },
            'fertilizer': 25,
            'waterRefill': 50
        },
        'marketHistory': [
            { 'day': 1, 'crops': { 'wheat': 30, 'corn': 45, 'tomato': 65, 'grape': 130 } }
        ],
        'logs': [
            { 'day': 1, 'agent': 'System', 'action': 'Simulation Start', 'details': 'Welcome to Kaggriculture. Farm initialized with $1,000.', 'type': 'info' }
        ],
        'agentMessages': [],
        'agentThoughtsHistory': []
    }

# Centralized in-memory database
game_state = get_initial_state()
last_agent_thoughts = {
    'Farmer': None,
    'Trader': None,
    'RiskAnalyst': None
}

# -----------------------------------------------------------------
# Simulation Physics & Engine
# -----------------------------------------------------------------

def generate_next_weather(current: str) -> str:
    rand = random.random()
    if current == 'Sunny':
        if rand < 0.5: return 'Sunny'
        if rand < 0.8: return 'Rainy'
        if rand < 0.9: return 'Heatwave'
        return 'Drought'
    elif current == 'Rainy':
        if rand < 0.4: return 'Rainy'
        if rand < 0.8: return 'Sunny'
        if rand < 0.95: return 'Storm'
        return 'Drought'
    elif current == 'Heatwave':
        if rand < 0.5: return 'Heatwave'
        if rand < 0.8: return 'Sunny'
        return 'Drought'
    elif current == 'Storm':
        if rand < 0.3: return 'Storm'
        if rand < 0.8: return 'Rainy'
        return 'Sunny'
    elif current == 'Drought':
        if rand < 0.6: return 'Drought'
        if rand < 0.9: return 'Sunny'
        return 'Rainy'
    return 'Sunny'

def update_prices(current_prices: dict, weather: str) -> dict:
    next_prices = copy.deepcopy(current_prices)
    
    crop_multiplier = 1.0
    seed_multiplier = 1.0
    fertilizer_multiplier = 1.0

    if weather == 'Drought' or weather == 'Heatwave':
        crop_multiplier = 1.15
        next_prices['waterRefill'] = min(120, max(40, round(next_prices['waterRefill'] * 1.1)))
    elif weather == 'Rainy' or weather == 'Storm':
        crop_multiplier = 0.92
        next_prices['waterRefill'] = max(30, round(next_prices['waterRefill'] * 0.85))

    for crop, config in CROP_CONFIGS.items():
        noise = 1 + (random.random() * 0.16 - 0.08) # +/- 8%
        price = round(next_prices['crops'][crop] * noise * crop_multiplier)
        
        # Regression to mean
        mean_diff = config['baseSellPrice'] - price
        price += round(mean_diff * 0.05)
        next_prices['crops'][crop] = min(config['maxPrice'], max(config['minPrice'], price))

        # Seed prices at ~33% crop value
        seed_noise = 1 + (random.random() * 0.06 - 0.03)
        seed_price = round(next_prices['crops'][crop] * 0.33 * seed_noise * seed_multiplier)
        next_prices['seeds'][crop] = min(config['baseSeedPrice'] * 2, max(round(config['baseSeedPrice'] * 0.6), seed_price))

    # Fertilizer
    fert_noise = 1 + (random.random() * 0.1 - 0.05)
    next_prices['fertilizer'] = min(45, max(15, round(next_prices['fertilizer'] * fert_noise * fertilizer_multiplier)))

    return next_prices

def run_simulation_tick(state: dict, actions: List[dict]) -> dict:
    next_state = copy.deepcopy(state)
    next_state['day'] += 1

    # 1. Update weather
    current_forecast = list(next_state['weatherForecast'])
    old_weather = next_state['weather']
    next_state['weather'] = current_forecast.pop(0) if current_forecast else 'Sunny'
    
    # Append next forecast element
    last_w = current_forecast[-1] if current_forecast else next_state['weather']
    current_forecast.append(generate_next_weather(last_w))
    next_state['weatherForecast'] = current_forecast

    next_state['logs'].append({
        'day': next_state['day'],
        'agent': 'System',
        'action': 'Weather Change',
        'details': f"Weather is now {next_state['weather']} (was {old_weather}).",
        'type': 'info'
    })

    # 2. Weather water replenishment
    if next_state['weather'] == 'Rainy':
        next_state['water'] = min(next_state['waterCapacity'], next_state['water'] + 120)
        next_state['logs'].append({
            'day': next_state['day'],
            'agent': 'Environment',
            'action': 'Rain Collection',
            'details': 'Rainfall replenished water reservoir by +120 units.',
            'type': 'success'
        })
    elif next_state['weather'] == 'Storm':
        next_state['water'] = min(next_state['waterCapacity'], next_state['water'] + 250)
        next_state['logs'].append({
            'day': next_state['day'],
            'agent': 'Environment',
            'action': 'Storm Refill',
            'details': 'Heavy storm filled the water reservoir by +250 units.',
            'type': 'success'
        })

    # 3. Apply agent actions
    for action in actions:
        act_type = action.get('type')
        agent = action.get('agent')
        reason = action.get('reason', 'None')

        if act_type == 'MESSAGE' and action.get('recipient') and action.get('message'):
            next_state['agentMessages'].append({
                'day': next_state['day'],
                'sender': agent,
                'recipient': action.get('recipient'),
                'message': action.get('message')
            })
            next_state['logs'].append({
                'day': next_state['day'],
                'agent': agent,
                'action': 'Send Message',
                'details': f"To {action.get('recipient')}: \"{action.get('message')}\"",
                'type': 'info'
            })

        elif act_type == 'PLANT' and action.get('plotId') is not None and action.get('cropType'):
            plot = next_state['plots'][action.get('plotId')]
            crop = action.get('cropType')
            if plot['cropType'] is None:
                if next_state['seeds'].get(crop, 0) > 0:
                    next_state['seeds'][crop] -= 1
                    plot['cropType'] = crop
                    plot['growth'] = 0
                    plot['daysGrowing'] = 0
                    plot['waterLevel'] = max(plot['waterLevel'], 40)
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': agent,
                        'action': 'Plant Crop',
                        'details': f"Planted {CROP_CONFIGS[crop]['name']} on Plot #{action.get('plotId')}. Reason: {reason}",
                        'type': 'success'
                    })
                else:
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': agent,
                        'action': 'Action Failed',
                        'details': f"Failed to plant {crop} on Plot #{action.get('plotId')}: Out of seeds.",
                        'type': 'danger'
                    })

        elif act_type == 'WATER' and action.get('plotId') is not None:
            plot = next_state['plots'][action.get('plotId')]
            needed = 100 - plot['waterLevel']
            to_apply = min(needed, 50)
            
            if next_state['water'] >= to_apply:
                next_state['water'] -= to_apply;
                plot['waterLevel'] += to_apply
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Water Crop',
                    'details': f"Watered Plot #{action.get('plotId')} (+{to_apply} water).",
                    'type': 'success'
                })
            elif next_state['water'] > 0:
                partial = next_state['water']
                next_state['water'] = 0
                plot['waterLevel'] += partial
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Water Crop (Partial)',
                    'details': f"Drained last {partial} units of reservoir to irrigate Plot #{action.get('plotId')}.",
                    'type': 'warning'
                })
            else:
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Action Failed',
                    'details': f"Cannot water Plot #{action.get('plotId')}: Reservoir empty!",
                    'type': 'danger'
                })

        elif act_type == 'FERTILIZE' and action.get('plotId') is not None:
            plot = next_state['plots'][action.get('plotId')]
            if plot['cropType'] is not None and not plot['fertilized']:
                if next_state['fertilizer'] > 0:
                    next_state['fertilizer'] -= 1
                    plot['fertilized'] = True
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': agent,
                        'action': 'Apply Fertilizer',
                        'details': f"Applied fertilizer to Plot #{action.get('plotId')}.",
                        'type': 'success'
                    })
                else:
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': agent,
                        'action': 'Action Failed',
                        'details': f"Cannot fertilize Plot #{action.get('plotId')}: Out of fertilizer.",
                        'type': 'danger'
                    })

        elif act_type == 'HARVEST' and action.get('plotId') is not None:
            plot = next_state['plots'][action.get('plotId')]
            crop = plot['cropType']
            if crop is not None and plot['growth'] >= 100:
                next_state['harvested'][crop] += 1
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Harvest Crop',
                    'details': f"Harvested {CROP_CONFIGS[crop]['name']} from Plot #{action.get('plotId')}.",
                    'type': 'success'
                })
                plot['cropType'] = None
                plot['growth'] = 0
                plot['daysGrowing'] = 0
                plot['fertilized'] = False
            else:
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Action Failed',
                    'details': f"Failed to harvest Plot #{action.get('plotId')}: Crop not ready.",
                    'type': 'danger'
                })

        elif act_type == 'BUY_SEED' and action.get('cropType') and action.get('quantity'):
            crop = action.get('cropType')
            qty = action.get('quantity')
            price = next_state['marketPrices']['seeds'][crop] * qty
            if next_state['cash'] >= price:
                next_state['cash'] -= price
                next_state['seeds'][crop] += qty
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Buy Seeds',
                    'details': f"Bought {qty}x {CROP_CONFIGS[crop]['name']} seeds for ${price}.",
                    'type': 'success'
                })
            else:
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Action Failed',
                    'details': f"Failed to buy seeds: Insufficient cash.",
                    'type': 'danger'
                })

        elif act_type == 'BUY_FERTILIZER' and action.get('quantity'):
            qty = action.get('quantity')
            price = next_state['marketPrices']['fertilizer'] * qty
            if next_state['cash'] >= price:
                next_state['cash'] -= price
                next_state['fertilizer'] += qty
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Buy Fertilizer',
                    'details': f"Bought {qty}x fertilizer packs for ${price}.",
                    'type': 'success'
                })
            else:
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Action Failed',
                    'details': "Failed to buy fertilizer: Insufficient cash.",
                    'type': 'danger'
                })

        elif act_type == 'SELL_CROP' and action.get('cropType') and action.get('quantity'):
            crop = action.get('cropType')
            qty = action.get('quantity')
            available = next_state['harvested'].get(crop, 0)
            sell_qty = min(available, qty)
            
            if sell_qty > 0:
                price = next_state['marketPrices']['crops'][crop] * sell_qty
                next_state['cash'] += price
                next_state['harvested'][crop] -= sell_qty
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Sell Harvest',
                    'details': f"Sold {sell_qty}x harvested {CROP_CONFIGS[crop]['name']} for ${price}.",
                    'type': 'success'
                })

        elif act_type == 'REFILL_WATER':
            price = next_state['marketPrices']['waterRefill']
            refill_amt = 300
            if next_state['cash'] >= price:
                next_state['cash'] -= price
                next_state['water'] = min(next_state['waterCapacity'], next_state['water'] + refill_amt)
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Refill Reservoir',
                    'details': f"Refilled reservoir (+{refill_amt} L) for ${price}.",
                    'type': 'success'
                })
            else:
                next_state['logs'].append({
                    'day': next_state['day'],
                    'agent': agent,
                    'action': 'Action Failed',
                    'details': "Failed to refill water reservoir: Insufficient cash.",
                    'type': 'danger'
                })

    # 4. Crop Growth & Evaporation
    for plot in next_state['plots']:
        evaporation = 10
        if next_state['weather'] == 'Heatwave': evaporation = 24
        elif next_state['weather'] == 'Drought': evaporation = 18
        elif next_state['weather'] == 'Sunny': evaporation = 12
        elif next_state['weather'] == 'Rainy': evaporation = 2
        elif next_state['weather'] == 'Storm': evaporation = 0

        plot['waterLevel'] = max(0, plot['waterLevel'] - evaporation)

        crop = plot['cropType']
        if crop is not None:
            plot['daysGrowing'] += 1
            config = CROP_CONFIGS[crop]
            
            if plot['waterLevel'] > 0:
                base_growth = config['growthRate']
                weather_mod = 1.0

                if next_state['weather'] == 'Heatwave': weather_mod = 0.5
                elif next_state['weather'] == 'Drought': weather_mod = 0.7
                elif next_state['weather'] == 'Storm':
                    if random.random() < 0.15:
                        # Ruined
                        next_state['logs'].append({
                            'day': next_state['day'],
                            'agent': 'Environment',
                            'action': 'Crop Destroyed',
                            'details': f"Plot #{plot['id']} crop was destroyed in the storm.",
                            'type': 'danger'
                        })
                        plot['cropType'] = None
                        plot['growth'] = 0
                        plot['daysGrowing'] = 0
                        plot['fertilized'] = False
                        continue
                    weather_mod = 0.6

                fertilizer_bonus = 1.3 if plot['fertilized'] else 1.0
                day_growth = round(base_growth * weather_mod * fertilizer_bonus)
                plot['growth'] = min(100, plot['growth'] + day_growth)
                plot['waterLevel'] = max(0, plot['waterLevel'] - config['waterConsumption'])
            else:
                plot['growth'] = max(0, plot['growth'] - 10)
                if plot['growth'] == 0 and plot['daysGrowing'] > 3:
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': 'Environment',
                        'action': 'Crop Died',
                        'details': f"Plot #{plot['id']} crop withered and died from dehydration.",
                        'type': 'danger'
                    })
                    plot['cropType'] = None
                    plot['daysGrowing'] = 0
                    plot['fertilized'] = False
                else:
                    next_state['logs'].append({
                        'day': next_state['day'],
                        'agent': 'Environment',
                        'action': 'Crop Dehydrating',
                        'details': f"Warning: Plot #{plot['id']} has dried soil. Crop is losing health!",
                        'type': 'warning'
                    })

    # 5. Price fluctuations
    next_state['marketPrices'] = update_prices(next_state['marketPrices'], next_state['weather'])
    
    # History ledger
    next_state['marketHistory'].append({
        'day': next_state['day'],
        'crops': dict(next_state['marketPrices']['crops'])
    })
    if len(next_state['marketHistory']) > 15:
        next_state['marketHistory'].pop(0)

    if len(next_state['logs']) > 100:
        next_state['logs'] = next_state['logs'][-100:]

    return next_state

# -----------------------------------------------------------------
# FastAPI API Endpoints
# -----------------------------------------------------------------

class ConfigModel(BaseModel):
    mode: str
    endpoint: str
    model: str
    apiKey: Optional[str] = ""
    accountId: Optional[str] = ""
    userDirective: Optional[str] = ""

class ActionRequest(BaseModel):
    type: str
    plotId: int
    cropType: Optional[str] = None

@app.get("/api/state")
def get_state():
    return {
        "state": game_state,
        "thoughts": last_agent_thoughts
    }

@app.post("/api/reset")
def reset_state():
    global game_state, last_agent_thoughts
    game_state = get_initial_state()
    last_agent_thoughts = {
        'Farmer': None,
        'Trader': None,
        'RiskAnalyst': None
    }
    return {
        "state": game_state,
        "thoughts": last_agent_thoughts
    }

@app.post("/api/action")
def execute_manual_action(req: ActionRequest):
    global game_state
    plot = game_state['plots'][req.plotId]
    
    if req.type == 'WATER':
        water_needed = min(50, 100 - plot['waterLevel'])
        if game_state['water'] >= water_needed:
            game_state['water'] -= water_needed
            plot['waterLevel'] += water_needed
            game_state['logs'].append({
                'day': game_state['day'],
                'agent': 'Manual Override',
                'action': 'Water Crop',
                'details': f"Watered Plot #{req.plotId} (+{water_needed} moisture).",
                'type': 'info'
            })
        else:
            raise HTTPException(status_code=400, detail="Insufficient reservoir water")

    elif req.type == 'PLANT' and req.cropType:
        if game_state['seeds'].get(req.cropType, 0) > 0 and plot['cropType'] is None:
            game_state['seeds'][req.cropType] -= 1
            plot['cropType'] = req.cropType
            plot['growth'] = 0
            plot['daysGrowing'] = 0
            plot['waterLevel'] = max(plot['waterLevel'], 40)
            game_state['logs'].append({
                'day': game_state['day'],
                'agent': 'Manual Override',
                'action': 'Plant Crop',
                'details': f"Planted {CROP_CONFIGS[req.cropType]['name']} on Plot #{req.plotId}.",
                'type': 'info'
            })
        else:
            raise HTTPException(status_code=400, detail="Cannot plant crop: Out of seeds or plot occupied")

    elif req.type == 'FERTILIZE':
        if game_state['fertilizer'] > 0 and plot['cropType'] is not None and not plot['fertilized']:
            game_state['fertilizer'] -= 1
            plot['fertilized'] = True
            game_state['logs'].append({
                'day': game_state['day'],
                'agent': 'Manual Override',
                'action': 'Apply Fertilizer',
                'details': f"Applied fertilizer to Plot #{req.plotId}.",
                'type': 'info'
            })
        else:
            raise HTTPException(status_code=400, detail="Cannot fertilize plot")

    elif req.type == 'HARVEST':
        if plot['cropType'] is not None and plot['growth'] >= 100:
            crop = plot['cropType']
            game_state['harvested'][crop] += 1
            game_state['logs'].append({
                'day': game_state['day'],
                'agent': 'Manual Override',
                'action': 'Harvest Crop',
                'details': f"Harvested {CROP_CONFIGS[crop]['name']} from Plot #{req.plotId}.",
                'type': 'info'
            })
            plot['cropType'] = None
            plot['growth'] = 0
            plot['daysGrowing'] = 0
            plot['fertilized'] = False
        else:
            raise HTTPException(status_code=400, detail="Crop not ready to harvest")

    return {
        "state": game_state,
        "thoughts": last_agent_thoughts
    }

@app.post("/api/tick")
async def process_simulation_tick(config: ConfigModel):
    global game_state, last_agent_thoughts
    
    config_dict = config.dict()
    current_state = game_state

    # 1. Run sequential ADK Multi-Agent completions
    # Risk Analyst first
    risk_result = await query_langchain_agent('RiskAnalyst', current_state, config_dict)
    last_agent_thoughts['RiskAnalyst'] = risk_result
    
    # Generate intermediate state with Analyst messages
    intermediate_state = copy.deepcopy(current_state)
    for act in risk_result.get('actions', []):
        if act.get('type') == 'MESSAGE' and act.get('recipient') and act.get('message'):
            intermediate_state['agentMessages'].append({
                'day': current_state['day'],
                'sender': 'RiskAnalyst',
                'recipient': act.get('recipient'),
                'message': act.get('message')
            })

    # Farmer Agent
    farmer_result = await query_langchain_agent('Farmer', intermediate_state, config_dict)
    last_agent_thoughts['Farmer'] = farmer_result
    for act in farmer_result.get('actions', []):
        if act.get('type') == 'MESSAGE' and act.get('recipient') and act.get('message'):
            intermediate_state['agentMessages'].append({
                'day': current_state['day'],
                'sender': 'Farmer',
                'recipient': act.get('recipient'),
                'message': act.get('message')
            })

    # Trader Agent
    trader_result = await query_langchain_agent('Trader', intermediate_state, config_dict)
    last_agent_thoughts['Trader'] = trader_result

    # 2. Compile combined actions
    risk_actions = [{**a, 'agent': 'RiskAnalyst'} for a in risk_result.get('actions', [])]
    farmer_actions = [{**a, 'agent': 'Farmer'} for a in farmer_result.get('actions', [])]
    trader_actions = [{**a, 'agent': 'Trader'} for a in trader_result.get('actions', [])]
    combined_actions = risk_actions + farmer_actions + trader_actions

    # 3. Tick the physics engine
    updated_state = run_simulation_tick(current_state, combined_actions)
    
    # Record cognitive thoughts history (memory)
    if 'agentThoughtsHistory' not in updated_state:
        updated_state['agentThoughtsHistory'] = []
    updated_state['agentThoughtsHistory'].append({
        'day': current_state['day'],
        'Farmer': farmer_result.get('thoughts', ''),
        'Trader': trader_result.get('thoughts', ''),
        'RiskAnalyst': risk_result.get('thoughts', '')
    })
    if len(updated_state['agentThoughtsHistory']) > 10:
        updated_state['agentThoughtsHistory'].pop(0)

    game_state = updated_state

    return {
        "state": game_state,
        "thoughts": last_agent_thoughts
    }
