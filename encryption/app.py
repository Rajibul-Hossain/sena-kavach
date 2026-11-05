import serial
import serial.tools.list_ports
import sys
import threading
from flask import Flask, render_template_string
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = 'sena-kavach-secure'
socketio = SocketIO(app, async_mode='threading')

sender = None
receiver = None

# --- UPGRADED HIGH-REALISM DEFENSE UI ---
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SENA KAVACH | Tactical Telemetry Terminal</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        
        :root {
            --bg-base: #050a0f;
            --grid-color: rgba(0, 229, 255, 0.05);
            --panel-bg: rgba(10, 15, 25, 0.6);
            --text-main: #e6edf3;
            --accent-cyan: #00e5ff;
            --accent-green: #39ff14;
            --accent-red: #ff3333;
            --glass-border: rgba(0, 229, 255, 0.2);
            --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.6);
            --inner-glow: inset 0px 0px 15px rgba(0, 229, 255, 0.05);
        }

        body {
            background-color: var(--bg-base);
            background-image: 
                linear-gradient(var(--grid-color) 1px, transparent 1px),
                linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
            background-size: 30px 30px;
            color: var(--text-main);
            font-family: 'Product Sans', system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }

        .header {
            width: 90%;
            max-width: 1400px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--accent-cyan);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        .header h1 {
            color: var(--text-main);
            margin: 0;
            font-size: 1.8rem;
            letter-spacing: 3px;
            text-transform: uppercase;
            text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
        }

        .header h1 span {
            color: var(--accent-cyan);
        }

        .status-badge {
            background: rgba(57, 255, 20, 0.1);
            color: var(--accent-green);
            padding: 8px 16px;
            border: 1px solid var(--accent-green);
            border-radius: 4px;
            font-family: 'Share Tech Mono', monospace;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 0 10px rgba(57, 255, 20, 0.2);
        }

        .status-dot {
            width: 10px;
            height: 10px;
            background-color: var(--accent-green);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(57, 255, 20, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(57, 255, 20, 0); }
            100% { box-shadow: 0 0 0 0 rgba(57, 255, 20, 0); }
        }

        .dashboard {
            display: flex;
            gap: 25px;
            width: 90%;
            max-width: 1400px;
        }

        .panel {
            flex: 1;
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            padding: 25px;
            box-shadow: var(--glass-shadow), var(--inner-glow);
            position: relative;
            overflow: hidden;
        }

        /* Top corner UI accents */
        .panel::before {
            content: '';
            position: absolute;
            top: 0; left: 0;
            width: 20px; height: 20px;
            border-top: 2px solid var(--accent-cyan);
            border-left: 2px solid var(--accent-cyan);
            border-top-left-radius: 16px;
        }
        .panel::after {
            content: '';
            position: absolute;
            bottom: 0; right: 0;
            width: 20px; height: 20px;
            border-bottom: 2px solid var(--accent-cyan);
            border-right: 2px solid var(--accent-cyan);
            border-bottom-right-radius: 16px;
        }

        .panel h2 {
            font-size: 0.9rem;
            color: #8b949e;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 0;
            margin-bottom: 15px;
            font-family: 'Share Tech Mono', monospace;
        }

        .data-box {
            font-family: 'Share Tech Mono', monospace;
            font-size: 4.5rem;
            text-align: center;
            margin: 20px 0;
            min-height: 80px;
            text-shadow: 0 0 20px currentColor;
            transition: all 0.1s ease-in-out;
        }

        .flash { transform: scale(1.05); filter: brightness(1.5); }

        .origin-data { color: var(--accent-cyan); }
        .cipher-data { color: #a371f7; }
        .hex-data { color: var(--accent-red); font-size: 3.5rem; }

        .log-container {
            width: 90%;
            max-width: 1400px;
            margin-top: 25px;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            border: 1px solid #30363d;
            border-radius: 12px;
            padding: 20px;
            height: 300px;
            overflow-y: auto;
            font-family: 'Share Tech Mono', monospace;
            font-size: 0.95rem;
        }

        .log-entry { 
            margin-bottom: 8px; 
            padding-bottom: 8px; 
            border-bottom: 1px solid rgba(255,255,255,0.05);
            line-height: 1.4;
        }
        
        .timestamp { color: #8b949e; margin-right: 15px; }
        .log-label { color: #8b949e; }
        
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg-base); }
        ::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--accent-cyan); }
    </style>
</head>
<body>
    <div class="header">
        <h1><span>SENA KAVACH</span> // COMMAND CENTER</h1>
        <div class="status-badge">
            <div class="status-dot"></div>
            SECURE TELEMETRY UPLINK ACTIVE
        </div>
    </div>

    <div class="dashboard">
        <div class="panel">
            <h2>[Tx] Origin Plaintext</h2>
            <div class="data-box origin-data" id="decData">-</div>
        </div>
        <div class="panel">
            <h2>[Tx] Ciphertext (In-Transit)</h2>
            <div class="data-box cipher-data" id="encData">-</div>
        </div>
        <div class="panel">
            <h2>[Rx] Raw Network Payload</h2>
            <div class="data-box hex-data" id="hexData">-</div>
        </div>
    </div>

    <div class="log-container" id="logBox">
        <div style="color: var(--accent-cyan); margin-bottom: 15px;">> INITIALIZING SECURE PACKET INTERCEPTION PROTOCOL... OK<br>> WAITING FOR TRANSMISSION FROM ENDPOINT ALPHA...</div>
    </div>

    <script>
        const socket = io();
        const logBox = document.getElementById('logBox');

        function triggerFlash(elementId) {
            const el = document.getElementById(elementId);
            el.classList.add('flash');
            setTimeout(() => el.classList.remove('flash'), 150);
        }

        socket.on('new_data', function(msg) {
            document.getElementById('decData').innerText = msg.raw;
            document.getElementById('encData').innerText = msg.encrypted;
            document.getElementById('hexData').innerText = msg.hex;

            triggerFlash('decData');
            triggerFlash('encData');
            triggerFlash('hexData');

            // Generate precise military-style timestamp
            const now = new Date();
            const timeStr = now.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);

            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.innerHTML = `
                <span class="timestamp">[${timeStr}]</span> 
                <span style="color: var(--accent-cyan)">PACKET CAPTURE</span> || 
                <span class="log-label">SRC:</span> <span style="color:var(--accent-cyan)">${msg.raw}</span> -> 
                <span class="log-label">CRYPT_HASH:</span> <span style="color:#a371f7">${msg.encrypted}</span> -> 
                <span class="log-label">TRANSPORT_HEX:</span> <span style="color:var(--accent-red)">0x${msg.hex}</span> 
                <span style="color: var(--accent-green); float:right;">[VERIFIED]</span>
            `;
            
            logBox.prepend(logEntry);
        });
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

def select_ports():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("[!] FATAL: No hardware endpoints detected. Check physical connections.")
        sys.exit()

    print("\n=== SENA KAVACH NETWORK CONFIGURATION ===")
    for i, port in enumerate(ports):
        print(f"[{i}] {port.device} - {port.description}")

    try:
        s_idx = int(input("\nEnter NUMBER IN BRACKETS [ ] for ENDPOINT ALPHA (Tx Keypad): "))
        r_idx = int(input("Enter NUMBER IN BRACKETS [ ] for ENDPOINT BRAVO (Rx LCD): "))
        return ports[s_idx].device, ports[r_idx].device
    except (ValueError, IndexError):
        print("[!] ERROR: Invalid endpoint designation.")
        sys.exit()

def serial_monitor(sender_port, receiver_port, baud_rate=9600):
    global sender, receiver
    try:
        sender = serial.Serial(sender_port, baud_rate, timeout=1)
        receiver = serial.Serial(receiver_port, baud_rate, timeout=1)
        print(f"\n[*] SECURE TUNNEL ESTABLISHED: {sender_port} <--> {receiver_port}")
        print("[*] TACTICAL DASHBOARD LIVE AT http://127.0.0.1:5000\n")

        while True:
            if sender.in_waiting > 0:
                raw_byte = sender.read()
                raw_ascii = raw_byte.decode('utf-8', errors='ignore')
                
                if raw_ascii:
                    # Encryption algorithm execution
                    enc_ascii = chr(ord(raw_ascii) + 5)
                    hex_val = enc_ascii.encode('utf-8').hex().upper()
                else:
                    enc_ascii = "ERR"
                    hex_val = "00"

                # Route to destination endpoint
                receiver.write(raw_byte)

                # Transmit telemetry to UI
                socketio.emit('new_data', {
                    'raw': raw_ascii,
                    'encrypted': enc_ascii,
                    'hex': hex_val
                })
                
    except serial.SerialException as e:
        print(f"\n[!] NETWORK FAILURE: {e}")
        print("[!] Verify IDE Serial Monitors are closed and hardware is connected.")
        sys.exit()

if __name__ == '__main__':
    s_port, r_port = select_ports()

    monitor_thread = threading.Thread(target=serial_monitor, args=(s_port, r_port))
    monitor_thread.daemon = True
    monitor_thread.start()

    socketio.run(app, host='127.0.0.1', port=5000, debug=False, use_reloader=False, log_output=False)