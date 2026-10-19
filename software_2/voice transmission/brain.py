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

# ---------------------------------------------------------
# 1. CONFIGURATION
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")

# Bypassing the Admin SDK. We use the public REST endpoint 
# since your database rules for /webrtc are already open.
DB_URL = "https://sena-kavach-default-rtdb.firebaseio.com/webrtc"

# ---------------------------------------------------------
# 2. CUSTOM WEBRTC AUDIO TRACK
# ---------------------------------------------------------
class MicrophoneTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, stream):
        super().__init__()
        self.stream = stream
        self.pts = 0

    async def recv(self):
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, self.stream.read, 320, False)
        
        frame = av.AudioFrame(format='s16', layout='mono', samples=320)
        frame.sample_rate = 16000
        frame.planes[0].update(data)
        
        frame.pts = self.pts
        frame.time_base = fractions.Fraction(1, 16000)
        self.pts += 320
        
        return frame

# ---------------------------------------------------------
# 3. WEBRTC SIGNALING LOGIC (REST API BYPASS)
# ---------------------------------------------------------
async def start_webrtc_transmission(pa):
    print("\n[!] Initializing secure WebRTC channel...")
    
    webrtc_stream = pa.open(format=pyaudio.paInt16,
                            channels=1,
                            rate=16000,
                            input=True,
                            frames_per_buffer=320)
                            
    pc = RTCPeerConnection()
    mic_track = MicrophoneTrack(webrtc_stream)
    pc.addTrack(mic_track)

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    # Use standard HTTP requests to bypass Google Cloud IAM entirely
    try:
        requests.delete(f"{DB_URL}/answer.json")
        
        offer_data = {
            'type': pc.localDescription.type,
            'sdp': pc.localDescription.sdp
        }
        requests.put(f"{DB_URL}/offer.json", json=offer_data)
    except Exception as e:
        print(f"[!] Network Error writing to Firebase: {e}")
        sys.exit(1)

    print("[*] Offer sent to Firebase via REST. Waiting for Dashboard to connect...")

    while True:
        try:
            resp = requests.get(f"{DB_URL}/answer.json")
            if resp.status_code == 200 and resp.json():
                answer_data = resp.json()
                answer = RTCSessionDescription(sdp=answer_data['sdp'], type=answer_data['type'])
                await pc.setRemoteDescription(answer)
                print("\n[SUCCESS] WebRTC Connected! Streaming live audio to dashboard...\n")
                break
        except Exception:
            pass
        await asyncio.sleep(0.5)

    while True:
        await asyncio.sleep(3600)

# ---------------------------------------------------------
# 4. VOSK WAKE-WORD ENGINE
# ---------------------------------------------------------
def main():
    if not os.path.exists(MODEL_PATH):
        print(f"\n[FATAL ERROR] Model folder not found at:\n{MODEL_PATH}")
        sys.exit(1)

    print(f"[*] Loading Vosk model from: {MODEL_PATH}")
    model = Model(MODEL_PATH)
    recognizer = KaldiRecognizer(model, 16000)
    pa = pyaudio.PyAudio()

    vosk_stream = pa.open(format=pyaudio.paInt16,
                          channels=1,
                          rate=16000,
                          input=True,
                          frames_per_buffer=4000)
    
    vosk_stream.start_stream()
    print("Microphone active. Say 'hello' to activate Sena Kavach...")

    try:
        while True:
            data = vosk_stream.read(4000, exception_on_overflow=False)
            
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                text = result.get("text", "")
                
                if "hello" in text.lower():
                    print(f"\n[!] WAKE WORD DETECTED: '{text}'")
                    
                    vosk_stream.stop_stream()
                    vosk_stream.close()
                    
                    asyncio.run(start_webrtc_transmission(pa))
                    break
            else:
                partial = json.loads(recognizer.PartialResult())
                partial_text = partial.get("partial", "")
                if partial_text:
                    print(f"Hearing... {partial_text}", end='\r')
                    
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        pa.terminate()

if __name__ == '__main__':
    main()