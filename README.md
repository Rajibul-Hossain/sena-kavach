# 🛡️ Sena Kavach

> **An advanced soldier telemetry, environmental monitoring, and tactical command platform.**

Sena Kavach is a comprehensive, full-stack defense technology ecosystem designed to provide real-time situational awareness and secure communications for military personnel. By integrating custom hardware telemetry, encrypted radio transmissions, predictive AI, and autonomous UAV support, this platform acts as a unified tactical dashboard for modern defense operations.

---

## 🚀 Key Features

*   **Real-Time Tactical Dashboard:** A centralized web interface built on Firebase that aggregates live telemetry, biometric data, and environmental statistics from deployed nodes.
*   **Encrypted Communications:** Secure serial packet transmission and decryption (simulating LoRa environments) to ensure mission-critical data remains uncompromised.
*   **Predictive AI & Overwatch:** Built-in AI agents (Sentinel, Overwatch, and Command) alongside an integrated machine learning model for avalanche prediction to proactively assess environmental threats.
*   **Secure Voice Transmission:** Wake-word-activated voice communication modules for seamless, hands-free tactical coordination.
*   **UAV & Hardware Integration:** Embedded systems support for field hardware (main box, deployment poles) and companion microcontroller code for quadcopter drone surveillance feeds.

---

## 📂 Codebase Structure

The repository is modularized into distinct operational domains for hardware, software, and artificial intelligence.

```text
DEFENCE/
├── avalanche_pred/         # ML models & classifiers for environmental threat detection
├── drone_codes/            # Camera feeds and control logic for UAV support
├── encryption/             # Arduino and Python scripts for secure packet encryption/decryption
├── hardware/               # Embedded C++ code for field nodes (main box, poles, BLDC motors)
├── software_2/             # Tactical web dashboards and AI agent logic
│   ├── agentic_ai/         # AI modules: Sentinel, Overwatch, and Command agents
│   └── main/               # Core application logic, simulation data, and UI styling
├── voice transmission/     # Brain models and transmission scripts for secure voice comms
├── misc/                   # Real-time database exports and utility scripts
├── public/                 # Static assets and public-facing deployment files
└── [Root Files]            # Firebase configurations, database rules, manifest, and licensing
```

---

## 🛠️ Technology Stack

**Software & Cloud**
*   **Frontend:** HTML5, CSS3 (Glassmorphism/Claymorphism UI), JavaScript, WebRTC
*   **Backend & Cloud:** Firebase (Hosting, Realtime Database, Rules), Node.js
*   **Artificial Intelligence:** Python, Scikit-learn (Avalanche Prediction), Agentic AI architectures, Vosk (Voice Recognition)

**Hardware & Embedded**
*   **Microcontrollers:** Arduino Mega, ESP32 / ESP8266, Raspberry Pi (3B/4)
*   **Sensors & IoT:** MPU6050 IMU, Environmental sensors, LoRa transceivers
*   **Actuation:** BLDC motors, ESC controllers, Custom UAV quadcopter frames

---

## ⚙️ Getting Started

### Prerequisites
*   Node.js and npm installed.
*   Python 3.8+ with pip.
*   Arduino IDE (with ESP32/ESP8266 board support).
*   Firebase CLI installed globally (`npm install -g firebase-tools`).

### Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/sena-kavach.git
    cd sena-kavach
    ```

2.  **Initialize Cloud Infrastructure**
    Ensure you are logged into Firebase and deploy the security rules and hosting environment:
    ```bash
    firebase login
    firebase deploy --only database,hosting
    ```

3.  **Bootstrapping the AI Agents**
    Navigate to the AI directory and install required Python dependencies:
    ```bash
    cd software_2/agentic_ai
    pip install -r requirements.txt # (Ensure your local env matches required packages)
    python agent_command.py
    ```

4.  **Hardware Flashing**
    Open the respective `.ino` files located in the `hardware/arduino_codes` directory and flash them to your target microcontrollers. Ensure I2C addresses and pin configurations match your physical wiring for the IMU and deployment poles.

---

## 🔒 Security & Data Compliance

Sena Kavach utilizes strict Firebase Realtime Database rules (`database.rules.json` and `storage.rules`) to ensure that telemetry data can only be written by authenticated field hardware and read by authorized command personnel.

---

## 📄 License

This project is licensed under the terms specified in the `LICENSE` file.
