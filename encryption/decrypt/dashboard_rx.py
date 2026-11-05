import serial
import time
import struct
from config import AES_KEY, PROTOCOL_VERSION, NODE_ID
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

# --- Cryptography Logic ---
def decrypt_payload(iv: bytes, ciphertext: bytes, key: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    return decryptor.update(ciphertext) + decryptor.finalize()

def calculate_crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
            crc &= 0xFFFF
    return crc

# --- Serial Ingestion Logic ---
def main():
    # UPDATE THIS to match Arduino 2
    RX_COM_PORT = 'COM14' 
    
    try:
        ser = serial.Serial(RX_COM_PORT, 115200, timeout=1)
        print(f"Connected to Transparent Gateway on {RX_COM_PORT}")
    except Exception as e:
        print(f"Failed to open {RX_COM_PORT}: {e}")
        return

    print("Waiting for encrypted telemetry...")

    while True:
        try:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8').strip()
                
                # Check if it's a valid packet line
                if line.startswith("RX:"):
                    # Split the hex string and the RSSI
                    parts = line[3:].split(',')
                    hex_data = parts[0]
                    rssi = parts[1] if len(parts) > 1 else "Unknown"
                    
                    # Convert hex string back to raw bytes
                    raw_bytes = bytes.fromhex(hex_data)
                    
                    if len(raw_bytes) != 50:
                        continue
                        
                    # 1. Parse Unencrypted Header
                    header_ver = raw_bytes[0]
                    header_node = raw_bytes[1]
                    
                    if header_ver != PROTOCOL_VERSION or header_node != NODE_ID:
                        print("WARN: Dropped packet. Invalid Node/Version.")
                        continue
                        
                    # 2. Extract IV and Ciphertext
                    iv = raw_bytes[2:18]
                    ciphertext = raw_bytes[18:50]
                    
                    # 3. Decrypt
                    plaintext = decrypt_payload(iv, ciphertext, AES_KEY)
                    
                    # 4. CRC Verification (Calculated over first 20 bytes of plaintext)
                    data_to_check = plaintext[:20]
                    expected_crc = struct.unpack('<H', plaintext[20:22])[0]
                    actual_crc = calculate_crc16_ccitt(data_to_check)
                    
                    if actual_crc != expected_crc:
                        print("CRITICAL: CRC Failure. Packet Tampered or Corrupt.")
                        continue
                        
                    # 5. Extract and print data
                    payload_format = '<IIffHBB' # Excludes CRC
                    parsed = struct.unpack(payload_format, data_to_check)
                    
                    print("\n=== SECURE TELEMETRY RECEIVED ===")
                    print(f"Packet # : {parsed[0]}")
                    print(f"Timestamp: {parsed[1]}")
                    print(f"Temp     : {parsed[2]:.2f} °C")
                    print(f"Humidity : {parsed[3]:.2f} %")
                    print(f"Battery  : {parsed[4]} mV")
                    print(f"Flags    : {hex(parsed[5])}")
                    print(f"RSSI     : {rssi} dBm")
                    
        except KeyboardInterrupt:
            print("\nSystem closed.")
            break
        except Exception as e:
            # Ignore standard serial decoding errors during startup
            pass

if __name__ == "__main__":
    main()