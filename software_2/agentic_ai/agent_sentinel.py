import time
import json
import requests

# 1. TACTICAL CONFIGURATION
FIREBASE_URL = "https://sena-kavach-default-rtdb.firebaseio.com"
OLLAMA_API = "http://localhost:11434/api/generate"
TARGET_SOLDIER = "10" 

# =====================================================================
# V2 SWARM COMPONENT (Required by sawrnm.py / master_orchestrator)
# =====================================================================
class SentinelAgent:
    def __init__(self, ollama_url="http://localhost:11434/api/generate"):
        self.ollama_url = ollama_url

    def analyze_telemetry(self, telemetry):
        """Audits incoming sensor telemetry for life-threatening thresholds."""
        pitch = telemetry.get('pitch', 0)
        gas = telemetry.get('gas_ppm', 0)
        
        anomaly_detected = False
        report = "Sector secure. Nominal telemetry."

        # Define tactical failure thresholds
        if abs(pitch) > 60:
            anomaly_detected = True
            report = f"CRITICAL ANOMALY: Soldier pitch is abnormal ({pitch}°). Potential fall or casualty."
        
        if gas > 300:
            anomaly_detected = True
            report += f" HAZARD: Toxic gas levels detected at {gas} ppm."

        if anomaly_detected:
            print(f"\n[SENTINEL THOUGHT] Tactical threshold breached: {report}")
            
        return {
            "anomaly_detected": anomaly_detected,
            "report": report
        }

# =====================================================================
# V1 STANDALONE LOGIC (Preserved as requested)
# =====================================================================
def trigger_haptic_evac(target_id):
    """Fires a high-priority evacuation command to the Arduino Mega."""
    print(f"[HARDWARE TX] Triggering Haptic Evac for CMD-{target_id}...")
    requests.patch(f"{FIREBASE_URL}/active_soldiers/{target_id}/tactical.json", 
                   json={"evac_order": True, "buzzer_active": True})
    return "Evacuation command dispatched successfully."

def task_drone_camera(target_id):
    """Commands the UAV to lock camera onto the compromised soldier."""
    print(f"[UAV LINK] Reorienting drone optics to CMD-{target_id}...")
    requests.patch(f"{FIREBASE_URL}/uav_commands.json", 
                   json={"target_lock": target_id, "mode": "OVERWATCH"})
    return "UAV optics locked onto target."

AVAILABLE_TOOLS = {
    "trigger_haptic_evac": trigger_haptic_evac,
    "task_drone_camera": task_drone_camera
}

def run_tactical_agent(telemetry_data):
    system_prompt = """You are SENA-KAVACH-ALPHA, an autonomous tactical agent.
You monitor soldier telemetry. If impact/pitch/roll > 60, or gas > 300, or obstacle detected, you MUST act.
If conditions are normal, output tool_name: "none".

AVAILABLE TOOLS:
1. trigger_haptic_evac(target_id)
2. task_drone_camera(target_id)

OUTPUT FORMAT (Respond ONLY with valid JSON):
{
    "thought": "Brief tactical reasoning",
    "tool_name": "name of tool or 'none'",
    "target_id": "10"
}"""

    prompt = f"Current Telemetry for CMD-10: {json.dumps(telemetry_data)}"

    try:
        response = requests.post(OLLAMA_API, json={
            "model": "llama3.2",
            "system": system_prompt,
            "prompt": prompt,
            "format": "json",
            "stream": False
        }).json()

        decision = json.loads(response['response'])
        print(f"\n[AGENT THOUGHT] {decision.get('thought')}")

        tool_name = decision.get("tool_name")
        if tool_name in AVAILABLE_TOOLS:
            target = decision.get("target_id", TARGET_SOLDIER)
            print(f"[AGENT ACTION] Executing autonomous tool: {tool_name}")
            
            # Execute the actual Python function
            result = AVAILABLE_TOOLS[tool_name](target)
            print(f"[ACTION RESULT] {result}")
        else:
            print("[AGENT ACTION] Sector secure. No intervention required.")

    except Exception as e:
        print(f"[AGENT ERROR] Signal degradation: {e}")

# --- EXECUTION GUARD ---
if __name__ == "__main__":
    # 4. THE OODA LOOP (Observe, Orient, Decide, Act)
    print("="*60)
    print(" SENA KAVACH // AUTONOMOUS AGENTIC OVERWATCH ONLINE")
    print("="*60)

    while True:
        try:
            data = requests.get(f"{FIREBASE_URL}/active_soldiers/{TARGET_SOLDIER}.json").json()
            
            telemetry = {
                "gas_ppm": data.get("environment", {}).get("gas_level", 0),
                "pitch": data.get("telemetry", {}).get("pitch", 0),
                "obstacle": data.get("tactical", {}).get("obstacle_detected", 0)
            }
            
            run_tactical_agent(telemetry)
            
        except Exception as e:
            print(f"[DB ERROR] {e}")
            
        time.sleep(3.0)