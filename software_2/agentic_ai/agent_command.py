# agent_command.py
import requests

class CommandAgent:
    def __init__(self, ollama_url="http://localhost:11434/api/generate"):
        self.ollama_url = ollama_url

    def draft_rescue_plan(self, sentinel_report, overwatch_report):
        print("[COMMAND] Fusing multi-domain intelligence...")
        
        system_prompt = """You are COMMAND, the Lead Tactical AI. 
Fuse the sensor and vision reports. Draft a strict, 3-step Rescue Execution Plan.
Format as:
STEP 1: [Action]
STEP 2: [Action]
STEP 3: [Action]
Keep it military-grade, aggressive, and concise."""
        
        prompt = f"Sensor Intel: {sentinel_report} | Visual Intel: {overwatch_report}"
        
        try:
            response = requests.post(self.ollama_url, json={
                "model": "llama3.2",
                "system": system_prompt,
                "prompt": prompt,
                "stream": False
            }).json()
            
            plan = response['response'].strip()
            return plan
            
        except Exception as e:
            print(f"[COMMAND ERROR] {e}")
            return "STEP 1: SECURE SECTOR.\nSTEP 2: DISPATCH MEDEVAC.\nSTEP 3: EXTRACT CASUALTY."