import time
import requests
from agent_sentinel import SentinelAgent
from agent_overwatch import OverwatchAgent
from agent_command import CommandAgent

FB_URL = "https://sena-kavach-default-rtdb.firebaseio.com"

print("="*80)
print("="*80)
print(" !!! NATIONAL FINALS SWARM V2 ONLINE !!!")
print(" MODULES LOADED: [SENTINEL] [OVERWATCH] [COMMAND]")
print("="*80)
print("="*80)

sentinel = SentinelAgent()
overwatch = OverwatchAgent()
command = CommandAgent()

def human_in_the_loop_fb(plan, target_id):
    print(f"\n[!] WARNING: AI CANNOT SELF-EXECUTE. PUSHING PLAN TO DASHBOARD...")

    auth_node_url = f"{FB_URL}/command_state/pending_authorization.json"
    payload = {
        "target_id": target_id,
        "rescue_plan": plan,
        "status": "AWAITING_HUMAN",
        "timestamp": time.time()
    }
    requests.put(auth_node_url, json=payload)

    print("[SYSTEM] Polling Commander Authorization...")

    while True:
        try:
            current_state = requests.get(auth_node_url).json()

            if current_state and current_state.get("status") == "AUTHORIZED":
                print("\n[SYSTEM] AUTHORIZATION GRANTED BY WEB UI. EXECUTING HARDWARE.")
                requests.patch(f"{FB_URL}/active_soldiers/{target_id}/tactical.json", 
                               json={"evac_order": True, "buzzer_active": True})
                print(f"[HARDWARE TX] Evacuation Haptic Alarm triggered for CMD-{target_id}.")
                requests.delete(auth_node_url)
                return True

            elif current_state and current_state.get("status") == "ABORTED":
                print("\n[SYSTEM] AUTHORIZATION ABORTED BY WEB UI. STANDING DOWN.")
                requests.delete(auth_node_url)
                return False

        except Exception as e:
            pass 

        time.sleep(1)

# --- MAIN OODA LOOP (DYNAMIC TRIAGE) ---
while True:
    try:
        # 1. Fetch ALL soldiers on the battlefield simultaneously
        all_soldiers = requests.get(f"{FB_URL}/active_soldiers.json").json()

        if not all_soldiers:
            time.sleep(3)
            continue

        crisis_handled = False

        for soldier_id, data in all_soldiers.items():

            if not isinstance(data, dict):
                continue

            telemetry = {
                "gas_ppm": data.get("environment", {}).get("gas_level", 0),
                "pitch": data.get("telemetry", {}).get("pitch", 0)
            }

            # 3. Sentinel evaluates THIS specific soldier
            sentinel_data = sentinel.analyze_telemetry(telemetry)

            if sentinel_data["anomaly_detected"]:
                print(f"\n[!] THRESHOLD BREACH DETECTED ON CMD-{soldier_id}. INITIATING SWARM COLLABORATION.")

                # Pass the dynamic ID to Overwatch and Command
                overwatch_data = overwatch.analyze_visuals(soldier_id)
                rescue_plan = command.draft_rescue_plan(sentinel_data["report"], overwatch_data["report"])

                # Push plan for THIS specific soldier to the Dashboard
                human_in_the_loop_fb(rescue_plan, soldier_id)

                print("\n[SYSTEM] Resetting tactical state in 15 seconds...")
                time.sleep(15)
                crisis_handled = True

                # Break the loop: Handle one critical casualty at a time to prevent UI modal overlapping
                break 

        if not crisis_handled:
            print(f"[{time.strftime('%H:%M:%S')}] All sectors secure. Monitoring {len(all_soldiers)} active personnel...")

    except Exception as e:
        print(f"[ORCHESTRATOR ERROR] {e}")

    time.sleep(3)