import os
import json
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from google.adk.models import LLMRegistry
from google.adk.models.lite_llm import LiteLlm
from google.genai import types
from google.adk.models.llm_request import LlmRequest

# Register custom model prefixes to LiteLlm in LLMRegistry
LLMRegistry._register(r'huggingface/.*', LiteLlm)
LLMRegistry._register(r'kaggle/.*', LiteLlm)
LLMRegistry._register(r'cloudflare/.*', LiteLlm)


# -----------------------------------------------------------------
# Pydantic Schemas for LangChain Structured Output
# -----------------------------------------------------------------

class ActionModel(BaseModel):
    type: Literal['PLANT', 'WATER', 'FERTILIZE', 'HARVEST', 'BUY_SEED', 'BUY_FERTILIZER', 'SELL_CROP', 'REFILL_WATER', 'MESSAGE', 'WAIT'] = Field(
        ..., description="The action to take"
    )
    plotId: Optional[int] = Field(None, description="The plot index (0-35) for PLANT, WATER, FERTILIZE, HARVEST")
    cropType: Optional[Literal['wheat', 'tomato', 'corn', 'grape']] = Field(None, description="The crop type for PLANT, BUY_SEED, SELL_CROP")
    quantity: Optional[int] = Field(None, description="The quantity to buy/sell for BUY_SEED, BUY_FERTILIZER, SELL_CROP")
    recipient: Optional[Literal['Farmer', 'Trader', 'RiskAnalyst']] = Field(None, description="The recipient agent for MESSAGE")
    message: Optional[str] = Field(None, description="The text message content for MESSAGE")
    reason: Optional[str] = Field(None, description="Detailed rationale or reason for this action")

class AgentResponseModel(BaseModel):
    thoughts: str = Field(..., description="Detailed observation logs, thoughts, reasoning, and plans for the day.")
    actions: List[ActionModel] = Field(..., description="An array of actions to execute today.")

# -----------------------------------------------------------------
# Heuristic Agent Decider (Fallback and Mock Engine)
# -----------------------------------------------------------------

CROP_BASE_SELL = {
    'wheat': 30,
    'corn': 45,
    'tomato': 65,
    'grape': 130
}

def run_heuristic_agent(role: str, state: dict) -> dict:
    thoughts = []
    actions = []
    
    day = state.get('day', 1)
    messages = [m for m in state.get('agentMessages', []) if m.get('day') == day - 1]
    plots = state.get('plots', [])
    water = state.get('water', 600)
    fertilizer = state.get('fertilizer', 6)
    seeds = state.get('seeds', {})
    cash = state.get('cash', 1000)
    harvested = state.get('harvested', {})
    market_prices = state.get('marketPrices', {})

    if role == 'Farmer':
        thoughts.append(f"Farmer examining plots on Day {day}.")
        
        # 1. Harvest mature crops (growth >= 100)
        for p in plots:
            if p.get('cropType') is not None and p.get('growth', 0) >= 100:
                actions.append({"type": "HARVEST", "plotId": p.get('id')})
                thoughts.append(f"Plot #{p.get('id')} has mature {p.get('cropType')}. Harvesting.")

        # 2. Water dry plots containing crops
        temp_water = water
        for p in plots:
            if p.get('cropType') is not None and p.get('waterLevel', 100) < 40:
                if temp_water >= 50 and len(actions) < 4:
                    actions.append({"type": "WATER", "plotId": p.get('id')})
                    temp_water -= 50;
                    thoughts.append(f"Plot #{p.get('id')} ({p.get('cropType')}) has low soil moisture ({p.get('waterLevel')}%). Watering plot.")

        # 3. Apply fertilizer
        temp_fert = fertilizer
        for p in plots:
            if p.get('cropType') is not None and not p.get('fertilized', False):
                if temp_fert > 0 and len(actions) < 4:
                    actions.append({"type": "FERTILIZE", "plotId": p.get('id')})
                    temp_fert -= 1
                    thoughts.append(f"Plot #{p.get('id')} is unfertilized. Applying fertilizer.")

        # 4. Plant seeds
        empty_plots = [p for p in plots if p.get('cropType') is None]
        available_seeds = dict(seeds)
        plant_priority = ['grape', 'tomato', 'corn', 'wheat']
        
        for p in empty_plots:
            if len(actions) < 4:
                seed_to_plant = next((crop for crop in plant_priority if available_seeds.get(crop, 0) > 0), None)
                if seed_to_plant:
                    actions.append({
                        "type": "PLANT",
                        "plotId": p.get('id'),
                        "cropType": seed_to_plant,
                        "reason": "Planting high profit crops"
                    })
                    available_seeds[seed_to_plant] -= 1
                    thoughts.append(f"Plot #{p.get('id')} is empty. Planting {seed_to_plant}.")

        # Request seeds from Trader if out
        total_seeds = sum(seeds.values())
        if len(empty_plots) > 3 and total_seeds < 2 and len(actions) < 4:
            preferred = 'grape' if cash > 400 else 'tomato'
            actions.append({
                "type": "MESSAGE",
                "recipient": "Trader",
                "message": f"Farmer: We have {len(empty_plots)} empty plots but we are out of seeds. Please buy some {preferred} or corn seeds."
            })
            thoughts.append("Out of seeds. Requesting restock from Trader.")

        if not actions:
            actions.append({"type": "WAIT"})
            thoughts.append("All fields in excellent condition. Resting today.")

    elif role == 'Trader':
        thoughts.append("Trader managing financials and resources.")

        # 1. Sell crops
        for crop, qty in harvested.items():
            if qty > 0:
                actions.append({"type": "SELL_CROP", "cropType": crop, "quantity": qty})
                thoughts.append(f"Selling {qty}x harvested {crop} for ${market_prices.get('crops', {}).get(crop, 0) * qty}.")

        # 2. Refill reservoir
        refill_cost = market_prices.get('waterRefill', 50)
        if water < 200 and cash >= refill_cost and len(actions) < 3:
            actions.append({"type": "REFILL_WATER"})
            thoughts.append(f"Water reservoir is low ({water} L). Purchasing refill.")

        # 3. Buy fertilizer
        fert_cost = market_prices.get('fertilizer', 25)
        if fertilizer < 3 and cash > fert_cost * 3 and len(actions) < 3:
            actions.append({"type": "BUY_FERTILIZER", "quantity": 3})
            thoughts.append("Fertilizer stock is low. Purchasing 3 packs.")

        # 4. Buy seeds
        seed_req = next((m for m in messages if m.get('sender') == 'Farmer' and 'seeds' in m.get('message', '').lower()), None)
        total_seeds = sum(seeds.values())
        
        if len(actions) < 3:
            if seed_req and cash > 150:
                crop_to_buy = 'grape' if 'grape' in seed_req.get('message', '') and cash > 400 else 'tomato'
                actions.append({"type": "BUY_SEED", "cropType": crop_to_buy, "quantity": 2})
                thoughts.append(f"Fulfilling Farmer's seed request. Buying 2x {crop_to_buy} seeds.")
            elif total_seeds < 3 and cash > 250:
                crop_to_buy = 'tomato' if cash > 500 else 'corn'
                actions.append({"type": "BUY_SEED", "cropType": crop_to_buy, "quantity": 2})
                thoughts.append(f"Replenishing seeds proactively. Buying 2x {crop_to_buy} seeds.")

        if not actions:
            actions.append({"type": "WAIT"})
            thoughts.append("Financial status stable. Holding cash.")

    elif role == 'RiskAnalyst':
        thoughts.append("RiskAnalyst assessing telemetry.")
        
        forecast = state.get('weatherForecast', [])
        drought_day = next((i for i, w in enumerate(forecast) if w == 'Drought'), -1)
        storm_day = next((i for i, w in enumerate(forecast) if w == 'Storm'), -1)

        if drought_day != -1 and drought_day <= 2:
            actions.append({
                "type": "MESSAGE",
                "recipient": "Farmer",
                "message": f"RiskAnalyst: Alert! Drought forecasted in {drought_day + 1} days. Preemptively water fields and conserve reserves."
            })
            thoughts.append("Drought detected in forecast. Warning Farmer.")
        elif storm_day != -1 and storm_day <= 2:
            actions.append({
                "type": "MESSAGE",
                "recipient": "Farmer",
                "message": f"RiskAnalyst: Alert! Storm forecast in {storm_day + 1} days. High wind risk. Postpone planting premium seeds."
            })
            thoughts.append("Storm warning in forecast. Informing Farmer.")

        grape_price = market_prices.get('crops', {}).get('grape', 130)
        if grape_price > 145 and len(actions) < 2:
            actions.append({
                "type": "MESSAGE",
                "recipient": "Trader",
                "message": f"RiskAnalyst: Grape prices are peaking at ${grape_price}/unit. Instructing liquidation of grape stocks."
            })
            thoughts.append("Grape market peaking. Advising Trader to sell.")

        if not actions:
            actions.append({
                "type": "MESSAGE",
                "recipient": "Farmer",
                "message": "RiskAnalyst: Operational environment looks stable. Maintain normal soil watering."
            })
            thoughts.append("No hazards detected. Normal advisory sent.")

    return {"thoughts": " ".join(thoughts), "actions": actions}

# -----------------------------------------------------------------
# LangChain Multi-Agent Driver
# -----------------------------------------------------------------

def parse_json_from_text(text: str) -> dict:
    text = text.strip()
    # Remove markdown formatting if present
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    # Try finding JSON braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end+1]
        
    try:
        data = json.loads(text)
        # Verify schema keys exist
        if "thoughts" not in data:
            data["thoughts"] = "Decided actions for today."
        if "actions" not in data:
            data["actions"] = []
        return data
    except Exception as e:
        raise ValueError(f"JSON parsing failed: {e}. Raw content: {text}")

def get_system_prompt(role: str) -> str:
    return f"""You are the {role} Agent in Kaggriculture, a farming simulation game.
You collaborate with two other agents (Farmer, Trader, RiskAnalyst) to manage a 6x6 farm grid (Plots 0-35) and maximize profits.

You must choose your actions logically based on the current weather, forecasts, resources, prices, and incoming messages.
Your response MUST fit the AgentResponseModel schema precisely, outlining your 'thoughts' and a list of 'actions'."""

async def query_langchain_agent(role: str, state: dict, config: dict) -> dict:
    mode = config.get('mode', 'heuristic')
    
    # Automatically detect and upgrade mode if environment variables are set
    if mode == 'heuristic':
        if os.environ.get('CLOUDFLARE_API_TOKEN') or os.environ.get('CLOUDFLARE_API_KEY'):
            mode = 'cloudflare'
        elif os.environ.get('OPENAI_API_KEY'):
            mode = 'openai'

    if mode == 'heuristic':
        return run_heuristic_agent(role, state)

    endpoint = config.get('endpoint', '')
    model_name = config.get('model', '')
    api_key = config.get('apiKey', '')
    account_id = config.get('accountId', '')

    # Configure environment variables based on selected mode
    if mode == 'cloudflare':
        cf_key = api_key or os.environ.get('CLOUDFLARE_API_TOKEN') or os.environ.get('CLOUDFLARE_API_KEY') or ""
        cf_account = account_id or os.environ.get('CLOUDFLARE_ACCOUNT_ID') or ""
        if cf_key:
            os.environ["CLOUDFLARE_API_KEY"] = cf_key
        if cf_account:
            os.environ["CLOUDFLARE_ACCOUNT_ID"] = cf_account
        
        if not model_name:
            model_name = os.environ.get('LLM_MODEL') or "@cf/meta/llama-3-8b-instruct"
        if not model_name.startswith("cloudflare/"):
            model_name = f"cloudflare/{model_name}"

    elif mode == 'ollama':
        ollama_endpoint = endpoint or os.environ.get('LLM_ENDPOINT') or "http://localhost:11434"
        os.environ["OLLAMA_API_BASE"] = ollama_endpoint
        
        if not model_name:
            model_name = os.environ.get('LLM_MODEL') or "qwen2.5-coder:7b"
        if not model_name.startswith("ollama/"):
            model_name = f"ollama/{model_name}"

    else:  # openai / huggingface / kaggle / custom
        if model_name.startswith("huggingface/") or model_name.startswith("kaggle/"):
            hf_token = api_key or os.environ.get("HF_TOKEN")
            if hf_token:
                os.environ["HF_TOKEN"] = hf_token
        else:
            openai_endpoint = endpoint or os.environ.get('LLM_ENDPOINT') or os.environ.get('OPENAI_API_BASE') or ""
            openai_key = api_key or os.environ.get('OPENAI_API_KEY') or ""
            if openai_key:
                os.environ["OPENAI_API_KEY"] = openai_key
            if openai_endpoint:
                os.environ["OPENAI_API_BASE"] = openai_endpoint
            
            if not model_name:
                model_name = os.environ.get('LLM_MODEL') or "gpt-4o-mini"
            if not model_name.startswith("openai/") and not model_name.startswith("groq/") and not model_name.startswith("anthropic/") and not model_name.startswith("azure/"):
                model_name = f"openai/{model_name}"

    # Construct prompts
    system_instructions = get_system_prompt(role)
    
    day = state.get('day', 1)
    messages = [m for m in state.get('agentMessages', []) if m.get('day') == day - 1]
    
    plots_summary = "\n".join([
        f"Plot #{p.get('id')}: Crop={p.get('cropType') or 'None'}, Growth={p.get('growth', 0)}%, Water={p.get('waterLevel', 0)}%, Fertilized={'Yes' if p.get('fertilized') else 'No'}"
        for p in state.get('plots', [])
    ])
    
    incoming_msgs = "\n".join([
        f"[From {m.get('sender')}]: {m.get('message')}"
        for m in messages if m.get('recipient') == role
    ]) or "No new messages."

    user_prompt = ""
    if role == 'Farmer':
        user_prompt = f"""Current Game State (Day {day}):
- Weather Today: {state.get('weather')}
- Weather Forecast: {" -> ".join(state.get('weatherForecast', []))}
- Farm Water Reservoir: {state.get('water')}/{state.get('waterCapacity')} units
- Fertilizer Stock: {state.get('fertilizer')} packs
- Seed Stock: {json.dumps(state.get('seeds', {}))}
- Plot States:
{plots_summary}

Incoming Messages:
{incoming_msgs}

Choose from:
1. PLANT (plotId, cropType)
2. WATER (plotId)
3. FERTILIZE (plotId)
4. HARVEST (plotId)
5. MESSAGE (recipient, message)
6. WAIT"""

    elif role == 'Trader':
        user_prompt = f"""Current Game State (Day {day}):
- Cash Available: ${state.get('cash')}
- Water Reservoir: {state.get('water')}/{state.get('waterCapacity')} units
- Fertilizer Stock: {state.get('fertilizer')} packs
- Seed Stock: {json.dumps(state.get('seeds', {}))}
- Harvested Crops: {json.dumps(state.get('harvested', {}))}
- Market Prices:
  - Seeds: {json.dumps(state.get('marketPrices', {}).get('seeds'))}
  - Crops (Sell): {json.dumps(state.get('marketPrices', {}).get('crops'))}
  - Fertilizer: ${state.get('marketPrices', {}).get('fertilizer')}/pack
  - Water Refill: ${state.get('marketPrices', {}).get('waterRefill')}

Incoming Messages:
{incoming_msgs}

Choose from:
1. BUY_SEED (cropType, quantity)
2. BUY_FERTILIZER (quantity)
3. SELL_CROP (cropType, quantity)
4. REFILL_WATER
5. MESSAGE (recipient, message)
6. WAIT"""

    else: # RiskAnalyst
        planted = ", ".join([f"Plot #{p.get('id')}: {p.get('cropType')} ({p.get('growth')}% grown)" for p in state.get('plots', []) if p.get('cropType') is not None]) or "No crops planted"
        user_prompt = f"""Current Game State (Day {day}):
- Cash Available: ${state.get('cash')}
- Weather Forecast: {state.get('weather')} -> {" -> ".join(state.get('weatherForecast', []))}
- Water Reservoir: {state.get('water')}/{state.get('waterCapacity')}
- Market Prices (Selling): {json.dumps(state.get('marketPrices', {}).get('crops'))}
- Planted Crops: {planted}

Incoming Messages:
{incoming_msgs}

Choose from:
1. MESSAGE (recipient, message)
2. WAIT"""

    try:
        model_instance = LLMRegistry.new_llm(model_name)
        
        llm_request = LlmRequest()
        llm_request.config.system_instruction = system_instructions
        llm_request.contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_prompt)]
            )
        ]
        llm_request.set_output_schema(AgentResponseModel)
        
        response = None
        async for resp in model_instance.generate_content_async(llm_request, stream=False):
            response = resp
            
        if response and response.content and response.content.parts:
            text = "".join([p.text for p in response.content.parts if p.text])
            parsed = parse_json_from_text(text)
            return parsed
        raise ValueError("Empty response from model")

    except Exception as adk_error:
        print(f"ADK structured output query failed: {adk_error}. Falling back to raw JSON completion.")
        
        model_instance = LLMRegistry.new_llm(model_name)
        
        json_system = system_instructions + "\n\nCRITICAL: You must respond ONLY with a valid JSON object matching the AgentResponseModel schema. Do not write any conversational intro, outro, explanations, or wrap the JSON in markdown code blocks. Just output raw, valid JSON.\nJSON Schema:\n" + json.dumps(AgentResponseModel.model_json_schema())
        
        llm_request = LlmRequest()
        llm_request.config.system_instruction = json_system
        llm_request.contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_prompt)]
            )
        ]
        
        try:
            response = None
            async for resp in model_instance.generate_content_async(llm_request, stream=False):
                response = resp
                
            if response and response.content and response.content.parts:
                text = "".join([p.text for p in response.content.parts if p.text])
                parsed = parse_json_from_text(text)
                return parsed
            raise ValueError("Empty response in fallback")
        except Exception as fallback_error:
            print(f"Fallback completion query failed: {fallback_error}. Falling back to heuristics.")
            fallback = run_heuristic_agent(role, state)
            fallback['thoughts'] = f"[ADK Fallback] {fallback['thoughts']} (Errors: ADK={str(adk_error)}, Fallback={str(fallback_error)})"
            return fallback

