import os
import sys
import json
import asyncio
import fractions
import pyaudiowpatch as pyaudio
import av
import requests
from vosk import Model, KaldiRecognizer
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")
DB_URL = "https://sena-kavach-default-rtdb.firebaseio.com"

TERMINATE_FLAG = False
class MicrophoneTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, stream, recognizer):
        super().__init__()
        self.stream = stream
        self.recognizer = recognizer
        self.pts = 0

    async def recv(self):
        global TERMINATE_FLAG
        loop = asyncio.get_event_loop()
        
        data = await loop.run_in_executor(None, self.stream.read, 320, False)
        
        if self.recognizer.AcceptWaveform(data):
            res = json.loads(self.recognizer.Result())
            text = res.get("text", "")
            if "terminate" in text.lower() or "over and out" in text.lower():
                print(f"\n[!] KILL SWITCH DETECTED: '{text}'")
                TERMINATE_FLAG = True
        frame = av.AudioFrame(format='s16', layout='mono', samples=320)
        frame.sample_rate = 16000
        frame.planes[0].update(data)
        frame.pts = self.pts
        frame.time_base = fractions.Fraction(1, 16000)
        self.pts += 320
        
        return frame
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

    try:
        await loop.run_in_executor(None, requests.delete, f"{comms_url}/answer.json")
        offer_data = {'type': pc.localDescription.type, 'sdp': pc.localDescription.sdp}
        await loop.run_in_executor(None, requests.put, f"{comms_url}/offer.json", json=offer_data)
    except Exception as e:
        print(f"[!] Network Error: {e}")
        return

    print(f"[*] Offer sent to CMD-{target_id}. Waiting for Dashboard to connect...")

    connected = False
    while not TERMINATE_FLAG:
        if not connected:
            try:
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

            vosk_stream.stop_stream()
            vosk_stream.close()

            try:
                target_id = requests.get(f"{DB_URL}/command_state/active_target.json").json()
                if not target_id: target_id = "101"
            except Exception:
                target_id = "101"

            asyncio.run(start_webrtc_transmission(pa, recognizer, target_id))
                    
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        pa.terminate()

if __name__ == '__main__':
    main()