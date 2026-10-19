import os
import sys
import json
import asyncio
import fractions
import pyaudiowpatch as pyaudio  # <-- The Option 1 Patch
import av
from vosk import Model, KaldiRecognizer
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
import firebase_admin
from firebase_admin import credentials, db

# ---------------------------------------------------------
# 1. FIREBASE SETUP
# ---------------------------------------------------------
cred = credentials.Certificate("firebase_key.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://sena-kavach-default-rtdb.firebaseio.com//'  # <-- CHANGE THIS
})

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
        # aiortc expects 20ms chunks (320 frames at 16000Hz)
        loop = asyncio.get_event_loop()
        # Read from PyAudio in a background thread to prevent blocking the async loop
        data = await loop.run_in_executor(None, self.stream.read, 320, False)
        
        # Package the raw bytes into an FFmpeg audio frame for WebRTC
        frame = av.AudioFrame(format='s16', layout='mono', samples=320)
        frame.sample_rate = 16000
        frame.planes[0].update(data)
        
        # Manage audio timing
        frame.pts = self.pts
        frame.time_base = fractions.Fraction(1, 16000)
        self.pts += 320
        
        return frame

# ---------------------------------------------------------
# 3. WEBRTC SIGNALING LOGIC
# ---------------------------------------------------------
async def start_webrtc_transmission(pa):
    print("\n[!] Initializing secure WebRTC channel...")
    
    # Re-open the microphone specifically formatted for WebRTC (320 frame buffer)
    webrtc_stream = pa.open(format=pyaudio.paInt16,
                            channels=1,
                            rate=16000,
                            input=True,
                            frames_per_buffer=320)
                            
    pc = RTCPeerConnection()
    mic_track = MicrophoneTrack(webrtc_stream)
    pc.addTrack(mic_track)

    # Generate the SDP Offer
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    # Push the offer to Firebase so the Web Dashboard can read it
    ref = db.reference('webrtc')
    ref.child('offer').set({
        'type': pc.localDescription.type,
        'sdp': pc.localDescription.sdp
    })
    
    # Clear any old answers to ensure a clean handshake
    ref.child('answer').delete()

    print("[*] Offer sent to Firebase. Waiting for Dashboard to connect...")

    # Poll Firebase for the Dashboard's Answer
    while True:
        answer_data = ref.child('answer').get()
        if answer_data:
            answer = RTCSessionDescription(sdp=answer_data['sdp'], type=answer_data['type'])
            await pc.setRemoteDescription(answer)
            print("\n[SUCCESS] WebRTC Connected! Streaming live audio to dashboard...\n")
            break
        await asyncio.sleep(1)

    # Keep the connection alive indefinitely
    while True:
        await asyncio.sleep(3600)

# ---------------------------------------------------------
# 4. VOSK WAKE-WORD ENGINE
# ---------------------------------------------------------
def main():
    if not os.path.exists("model"):
        print("Error: 'model' folder not found. Download and extract the Vosk model here.")
        sys.exit(1)

    model = Model("model")
    recognizer = KaldiRecognizer(model, 16000)
    pa = pyaudio.PyAudio()

    # Open microphone for Vosk (4000 frame buffer)
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