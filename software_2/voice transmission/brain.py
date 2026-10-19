import os
import sys
import json
import asyncio
import fractions
import functools
import pyaudiowpatch as pyaudio
import av
import requests
from vosk import Model, KaldiRecognizer
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription

# ---------------------------------------------------------
# 1. CONFIGURATION & ROBUST PATHING
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")

# We use the public REST endpoint to bypass strict IAM credential requirements, 
# relying on the database rules you already opened for the hackathon.
DB_URL = "https://sena-kavach-default-rtdb.firebaseio.com"

# Global flag to signal the WebRTC loop to tear down
TERMINATE_FLAG = False

# ---------------------------------------------------------
# 2. CUSTOM WEBRTC AUDIO TRACK (DUAL-ROUTING)
# ---------------------------------------------------------
class MicrophoneTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, stream, recognizer):
        super().__init__()
        self.stream = stream
        self.recognizer = recognizer
        self.pts = 0
        self.audio_accumulator = bytearray()

    async def recv(self):
        global TERMINATE_FLAG
        loop = asyncio.get_event_loop()
        
        # 1. Read 20ms of audio (320 samples * 2 bytes/sample for paInt16 = 640 bytes)
        data = await loop.run_in_executor(None, self.stream.read, 320, False)
        
        # 2. Accumulate PCM bytes for speech recognition (trigger Vosk every ~250ms / 4000 bytes)
        self.audio_accumulator.extend(data)
        if len(self.audio_accumulator) >= 4000:
            chunk = bytes(self.audio_accumulator)
            self.audio_accumulator.clear()
            
            # Check full recognition
            if self.recognizer.AcceptWaveform(chunk):
                res = json.loads(self.recognizer.Result())
                text = res.get("text", "").lower()
                if any(w in text for w in ["terminate", "over and out", "stop", "abort"]):
                    print(f"\n[!] KILL SWITCH TRIGGERED (FULL): '{text}'")
                    TERMINATE_FLAG = True
            else:
                # Also check partial results so fast utterances aren't dropped
                partial_res = json.loads(self.recognizer.PartialResult())
                partial_text = partial_res.get("partial", "").lower()
                if any(w in partial_text for w in ["terminate", "over and out", "stop", "abort"]):
                    print(f"\n[!] KILL SWITCH TRIGGERED (PARTIAL): '{partial_text}'")
                    TERMINATE_FLAG = True

        # 3. Stream 320 samples directly to WebRTC
        frame = av.AudioFrame(format='s16', layout='mono', samples=320)
        frame.sample_rate = 16000
        frame.planes[0].update(data)
        frame.pts = self.pts
        frame.time_base = fractions.Fraction(1, 16000)
        self.pts += 320
        
        return frame
# ---------------------------------------------------------
# 3. WEBRTC SIGNALING LOGIC (TARGETED ROUTING)
# ---------------------------------------------------------
async def start_webrtc_transmission(pa, recognizer, target_id):
    global TERMINATE_FLAG
    TERMINATE_FLAG = False
    loop = asyncio.get_event_loop()
    
    print(f"\n[!] Initializing secure WebRTC channel for CMD-{target_id}...")
    
    webrtc_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=320)
    pc = RTCPeerConnection()
    pc.addTrack(MicrophoneTrack(webrtc_stream, recognizer))

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    comms_url = f"{DB_URL}/active_soldiers/{target_id}/comms"

    # Push offer to the specific soldier's node
    try:
        # Clear old answers
        await loop.run_in_executor(None, requests.delete, f"{comms_url}/answer.json")
        
        # Dispatch new offer using functools.partial to safely pass the json kwarg
        offer_data = {'type': pc.localDescription.type, 'sdp': pc.localDescription.sdp}
        put_request = functools.partial(requests.put, f"{comms_url}/offer.json", json=offer_data)
        await loop.run_in_executor(None, put_request)
        
    except Exception as e:
        print(f"[!] Network Error: {e}")
        return

    print(f"[*] Offer sent to CMD-{target_id}. Waiting for Dashboard to connect...")

    connected = False
    while not TERMINATE_FLAG:
        if not connected:
            try:
                # Non-blocking REST poll for the answer
                resp = await loop.run_in_executor(None, requests.get, f"{comms_url}/answer.json")
                if resp.status_code == 200 and resp.json():
                    answer_data = resp.json()
                    answer = RTCSessionDescription(sdp=answer_data['sdp'], type=answer_data['type'])
                    await pc.setRemoteDescription(answer)
                    print(f"\n[SUCCESS] Connected! Streaming live audio to CMD-{target_id}. Say 'terminate' to end.\n")
                    connected = True
            except Exception:
                pass
        await asyncio.sleep(0.5)

    # Teardown Sequence
    print("\n[*] Terminating transmission and clearing Firebase nodes...")
    await pc.close()
    webrtc_stream.stop_stream()
    webrtc_stream.close()
    
    try:
        await loop.run_in_executor(None, requests.delete, f"{comms_url}.json")
    except Exception:
        pass
    print("[*] Link closed. Returning to standby.\n")

# ---------------------------------------------------------
# 4. MAIN ENGINE WAKE-WORD LOOP
# ---------------------------------------------------------
def main():
    if not os.path.exists(MODEL_PATH):
        print(f"\n[FATAL ERROR] Model folder not found at:\n{MODEL_PATH}")
        sys.exit(1)

    print(f"[*] Loading Vosk model from: {MODEL_PATH}")
    model = Model(MODEL_PATH)
    recognizer = KaldiRecognizer(model, 16000)
    pa = pyaudio.PyAudio()

    try:
        while True:
            # Standby mode (large buffer for efficiency)
            vosk_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=4000)
            vosk_stream.start_stream()
            print("Microphone active. Say 'hello' to activate Sena Kavach...")

            triggered = False
            while not triggered:
                data = vosk_stream.read(4000, exception_on_overflow=False)
                if recognizer.AcceptWaveform(data):
                    res = json.loads(recognizer.Result())
                    text = res.get("text", "")
                    if "hello" in text.lower():
                        print(f"\n[!] WAKE WORD DETECTED: '{text}'")
                        triggered = True
                else:
                    partial = json.loads(recognizer.PartialResult())
                    if partial.get("partial", ""):
                        print(f"Hearing... {partial.get('partial')}", end='\r')

            # Suspend standby stream to hand over hardware control to WebRTC
            vosk_stream.stop_stream()
            vosk_stream.close()

            # Retrieve active target from Dashboard
            try:
                target_res = requests.get(f"{DB_URL}/command_state/active_target.json")
                target_id = target_res.json()
                if not target_id: 
                    target_id = "101"
            except Exception:
                target_id = "101"

            # Execute transmission (blocks until 'terminate' is spoken)
            asyncio.run(start_webrtc_transmission(pa, recognizer, target_id))
                    
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        pa.terminate()

if __name__ == '__main__':
    main()