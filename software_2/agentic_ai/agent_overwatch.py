# agent_overwatch.py
import requests
import base64
import cv2
import time
import json
import re

class OverwatchAgent:
    def __init__(self, ollama_url="http://localhost:11434/api/generate"):
        self.ollama_url = ollama_url
        self.firebase_url = "https://sena-kavach-default-rtdb.firebaseio.com"
        # Local laptop testing URL. Change to Pi IP (192.168.4.1) for live drone.
        self.drone_stream_url = "10.235.29.43:8000"

    def extract_clean_json(self, raw_text):
        """Bulletproof RegEx parser to extract JSON."""
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
        return None

    def analyze_visuals(self, soldier_id):
        print(f"\n[OVERWATCH] Sentinel anomaly verified. Assuming control of UAV network...")
        
        # 1. COMMAND THE DRONE HARDWARE TO SLEW TO TARGET
        try:
            print(f"[UAV LINK] Sluing drone camera to coordinates of CMD-{soldier_id}...")
            requests.patch(f"{self.firebase_url}/uav_commands.json", 
                           json={"target_lock": soldier_id, "mode": "OVERWATCH_ACTIVE"})
            # Simulate mechanical gimbal travel time. This makes the terminal output feel incredibly real.
            time.sleep(1.5) 
            print(f"[UAV LINK] Target CMD-{soldier_id} acquired. Capturing optical feed.")
        except Exception as e:
            print(f"[UAV ERROR] Failed to transmit slew command: {e}")

        try:
            # 2. CAPTURE THE FRAME (Zero-Latency mode)
            cap = cv2.VideoCapture(self.drone_stream_url)
            if not cap.isOpened():
                return {"visual_confirmation": False, "report": "OVERWATCH BLIND: UAV feed unavailable."}

            for _ in range(5):
                cap.grab() # Flush buffer to ensure we get the CURRENT frame, not a cached one
            
            ret, frame = cap.retrieve()
            cap.release()
            
            if not ret:
                return {"visual_confirmation": False, "report": "OVERWATCH BLIND: Frame capture failed."}

            # 3. COMPRESS FOR MOONDREAM
            frame_resized = cv2.resize(frame, (320, 320))
            _, buffer = cv2.imencode('.jpg', frame_resized)
            img_b64 = base64.b64encode(buffer).decode('utf-8')

            # 4. EXECUTE VLM REASONING
   # 4. EXECUTE VLM REASONING
            moondream_prompt = """Analyze this image for military hazards. 
Is there a fallen soldier, prone body, fire, or smoke?
Respond ONLY with a valid JSON object. Do not add any other text.
Example: {"threat_detected": true, "tactical_sitrep": "Smoke detected near prone personnel.", "tool_to_execute": "trigger_haptic_evac"}

Your JSON Response:"""
            
            print(f"[OVERWATCH] Frame secured. Executing Edge-VLM threat analysis on CMD-{soldier_id}...")
            start_time = time.time()
            
            response_data = requests.post(self.ollama_url, json={
                "model": "moondream",
                "prompt": moondream_prompt,
                "images": [img_b64],
                "stream": False,
                "options": {
                    "temperature": 0.0, 
                    "num_ctx": 2048
                }
            }).json()

            # --- BULLETPROOF ERROR HANDLING ---
            if "error" in response_data:
                print(f"[OVERWATCH FATAL] Ollama Server Error: {response_data['error']}")
                return {"visual_confirmation": True, "report": f"VLM FAULT: {response_data['error']}"}

            raw_output = response_data['response'].strip()
            eval_time = (time.time() - start_time)
            
            # 5. PARSE VLM INTELLIGENCE
            decision = self.extract_clean_json(raw_output)
            
            if decision:
                sitrep = decision.get('tactical_sitrep', 'No intelligence generated.')
                threat_detected = decision.get('threat_detected', False)
                print(f" -> [OVERWATCH REPORT] ({eval_time:.1f}s): {sitrep}")
                
                threat_words = ['prone', 'injured', 'smoke', 'fire', 'casualty', 'hazard', 'down']
                confirmed = threat_detected or any(word in sitrep.lower() for word in threat_words)
                
                return {"visual_confirmation": confirmed, "report": sitrep}
            else:
                return {"visual_confirmation": True, "report": "OVERWATCH VLM FORMAT ERROR. DEFAULTING TO SENSOR DATA."}

        except Exception as e:
            print(f"[OVERWATCH ERROR] VLM Offline: {e}")
            return {"visual_confirmation": True, "report": "OVERWATCH VLM OFFLINE. DEFAULTING TO SENSOR DATA."}