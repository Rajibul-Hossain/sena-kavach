from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import numpy as np
import requests
from PIL import Image
from io import BytesIO
import time
import os

app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from the browser dashboard

# --- 1. LOAD MODEL ---
MODEL_PATH = r"D:\Local Disk\Codes\DEFENCE\software_2\ai_model\sena_vision_engine.keras"
print(f"[SYSTEM] Loading TensorFlow Engine from: {MODEL_PATH}")

try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print("[SYSTEM] TensorFlow Vision Engine Loaded Successfully.")
except Exception as e:
    print(f"[CRITICAL ERROR] Failed to load model file: {e}")
    exit(1)

CLASS_NAMES = [
    "NORMAL TACTICAL MOVEMENT",
    "CONFIRMED ENVIRONMENTAL DISASTER",
    "SOLDIER FALL / TRAUMA",
    "UNCERTAIN / POOR VISIBILITY"
]

def generate_reasoning(class_idx):
    if class_idx == 0:
        return "Visual frame analysis confirms stable horizon and controlled posture. Sensor trigger was caused by rapid tactical maneuvering, running, or climbing."
    elif class_idx == 1:
        return "CRITICAL DISASTER ALERT: Image analysis detects active geological displacement, snow slide, or heavy rubble movement in the operational zone."
    elif class_idx == 2:
        return "Image geometry indicates ground-level proximity and horizontal body displacement without environmental mass movement. Likely soldier fall or injury."
    else:
        return "Visual clarity is compromised due to lens obstruction, extreme motion blur, or poor lighting. Manual commander verification required."

# --- 2. ENDPOINT ---
@app.route('/verify_vision', methods=['POST'])
def verify_vision():
    start_time = time.time()
    data = request.json or {}
    
    soldier_id = data.get("soldier_id", "UNKNOWN")
    image_url = data.get("image_url")

    if not image_url:
        return jsonify({
            "classification": "NO IMAGE PROVIDED",
            "confidence_score": "0%",
            "reasoning": "Tripwire fired, but no valid image URL was passed to the inference engine."
        }), 400

    print(f"\n[⚠️ TRIPWIRE] Anomaly verification initiated for CMD-{soldier_id}")

    try:
        # Download image into RAM
        res = requests.get(image_url, timeout=5)
        res.raise_for_status()
        
        img = Image.open(BytesIO(res.content)).convert('RGB')
        img = img.resize((224, 224))
        
        # Format tensor shape: (1, 224, 224, 3)
        img_array = np.array(img, dtype=np.float32)
        tensor_img = np.expand_dims(img_array, axis=0)
        
        # Execute TensorFlow prediction
        predictions = model.predict(tensor_img, verbose=0)
        
        class_idx = int(np.argmax(predictions[0]))
        confidence = float(predictions[0][class_idx]) * 100.0
        
        classification_label = CLASS_NAMES[class_idx]
        reasoning_text = generate_reasoning(class_idx)
        
        elapsed_ms = (time.time() - start_time) * 1000.0
        print(f"[VISION COMPLETE] Result: {classification_label} ({confidence:.1f}%) in {elapsed_ms:.2f}ms")

        return jsonify({
            "classification": classification_label,
            "confidence_score": f"{confidence:.1f}%",
            "reasoning": reasoning_text,
            "inference_time_ms": f"{elapsed_ms:.1f}ms"
        })

    except Exception as e:
        print(f"[FATAL ERROR] Inference loop failed: {e}")
        return jsonify({
            "classification": "SYSTEM ERROR",
            "confidence_score": "0%",
            "reasoning": f"TensorFlow Engine Error: {str(e)}"
        }), 500

if __name__ == '__main__':
    print("[SYSTEM] Sena Kavach AI Overwatch Service Online on Port 5000")
    app.run(host='0.0.0.0', port=5000, debug=False)