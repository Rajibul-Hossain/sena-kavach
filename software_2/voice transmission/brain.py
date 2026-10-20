import os
import sys
import json
import asyncio
import fractions
import functools
import concurrent.futures
import pyaudiowpatch as pyaudio
import av
import requests
from vosk import Model, KaldiRecognizer
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model")
DB_URL = "https://sena-kavach-default-rtdb.firebaseio.com"
TERMINATE_FLAG = False

# --- WEBRTC AUDIO TRACK ---
class MicrophoneTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self, stream, recognizer):
        super().__init__()
        self.stream = stream
        self.recognizer = recognizer
        self.pts = 0
        self.buffer = bytearray()
        # Thread pool prevents Vosk from choking the WebRTC audio frame delivery
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    async def recv(self):
        global TERMINATE_FLAG
        loop = asyncio.get_event_loop()
        
        # 1. Read raw audio from mic
        data = await loop.run_in_executor(self.executor, self.stream.read, 320, False)
        
        # 2. Accumulate audio for the kill-switch (checked every ~125ms)
        self.buffer.extend(data)
        if len(self.buffer) >= 4000:
            chunk = bytes(self.buffer)
            self.buffer.clear()
            loop.run_in_executor(self.executor, self.process_vosk, chunk)

        # 3. Stream instantly to WebRTC
        frame = av.AudioFrame(format='s16', layout='mono', samples=320)
        frame.sample_rate = 16000
        frame.planes[0].update(data)
        frame.pts = self.pts
        frame.time_base = fractions.Fraction(1, 16000)
        self.pts += 320
        return frame

    def process_vosk(self, chunk):
        global TERMINATE_FLAG
        if self.recognizer.AcceptWaveform(chunk):
            text = json.loads(self.recognizer.Result()).get("text", "").lower()
            if "terminate" in text or "stop" in text:
                print(f"\n[!] KILL SWITCH DETECTED: '{text}'")
                TERMINATE_FLAG = True
        else:
            p_text = json.loads(self.recognizer.PartialResult()).get("partial", "").lower()
            if "terminate" in p_text or "stop" in p_text:
                print(f"\n[!] KILL SWITCH DETECTED: '{p_text}'")
                TERMINATE_FLAG = True
async def start_webrtc_transmission(pa, model, target_id):
    global TERMINATE_FLAG
    TERMINATE_FLAG = False
    loop = asyncio.get_event_loop()
    
    print(f"\n[!] Initializing secure WebRTC channel for CMD-{target_id}...")
    
    kill_recognizer = KaldiRecognizer(model, 16000)
    webrtc_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=320)
    
    # Cloud STUN server config
    config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
    pc = RTCPeerConnection(configuration=config)
    pc.addTrack(MicrophoneTrack(webrtc_stream, kill_recognizer))

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    # CRITICAL FIX: Wait for STUN to gather public ICE candidates before sending
    print("[*] Gathering network coordinates...")
    await asyncio.sleep(1.5) 

    comms_url = f"{DB_URL}/active_soldiers/{target_id}/comms"

    try:
        await loop.run_in_executor(None, requests.delete, f"{comms_url}/answer.json")
        # Now the SDP contains the STUN public IP addresses
        offer_data = {'type': pc.localDescription.type, 'sdp': pc.localDescription.sdp}
        put_req = functools.partial(requests.put, f"{comms_url}/offer.json", json=offer_data)
        await loop.run_in_executor(None, put_req)
    except Exception as e:
        print(f"[!] Network Error: {e}")
        return

    print(f"[*] Offer dispatched. Awaiting Commander to Accept Uplink...")

    connected = False
    while not TERMINATE_FLAG:
        if not connected:
            try:
                resp = await loop.run_in_executor(None, requests.get, f"{comms_url}/answer.json")
                if resp.status_code == 200 and resp.json():
                    answer_data = resp.json()
                    answer = RTCSessionDescription(sdp=answer_data['sdp'], type=answer_data['type'])
                    await pc.setRemoteDescription(answer)
                    print(f"\n[SUCCESS] Connected! Audio streaming live to CMD-{target_id}.")
                    print("[*] Say 'terminate' to end the stream.")
                    connected = True
            except Exception:
                pass
        await asyncio.sleep(0.2)

    print("\n[*] Terminating transmission...")
    await pc.close()
    webrtc_stream.stop_stream()
    webrtc_stream.close()
    
    try:
        await loop.run_in_executor(None, requests.delete, f"{comms_url}.json")
    except Exception:
        pass
        
    print("[*] Link closed cleanly. Returned to standby.\n")
# --- MAIN ENGINE ---
def main():
    if not os.path.exists(MODEL_PATH):
        print(f"\n[FATAL ERROR] Model not found at: {MODEL_PATH}")
        sys.exit(1)

    print(f"[*] Loading Vosk AI from: {MODEL_PATH}")
    model = Model(MODEL_PATH)
    pa = pyaudio.PyAudio()

    try:
        while True:
            standby_recognizer = KaldiRecognizer(model, 16000, '["hello", "[unk]"]')
            vosk_stream = pa.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=4000)
            vosk_stream.start_stream()
            print("Microphone active. Say 'hello' to activate Sena Kavach...")

            triggered = False
            while not triggered:
                data = vosk_stream.read(4000, exception_on_overflow=False)
                if standby_recognizer.AcceptWaveform(data):
                    if "hello" in json.loads(standby_recognizer.Result()).get("text", "").lower():
                        print(f"\n[!] WAKE WORD DETECTED")
                        triggered = True
                else:
                    p_text = json.loads(standby_recognizer.PartialResult()).get("partial", "")
                    if p_text: print(f"Hearing... {p_text}", end='\r')

            vosk_stream.stop_stream()
            vosk_stream.close()

            # Get target soldier
            try:
                target_id = requests.get(f"{DB_URL}/command_state/active_target.json", timeout=2).json() or "101"
            except:
                target_id = "101"

            asyncio.run(start_webrtc_transmission(pa, model, target_id))
                    
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        pa.terminate()

if __name__ == '__main__':
    main()