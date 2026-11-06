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
