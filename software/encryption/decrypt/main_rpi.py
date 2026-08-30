import time
import board
import busio
import digitalio
import adafruit_rfm9x

from packet import TelemetryData, build_ota_frame

class PhysicalLoRa:
    def __init__(self):
        print("Initializing SPI LoRa Module...")
        spi = busio.SPI(board.SCK, MOSI=board.MOSI, MISO=board.MISO)
        cs = digitalio.DigitalInOut(board.CE1)
        reset = digitalio.DigitalInOut(board.D25)
        self.rfm9x = adafruit_rfm9x.RFM9x(spi, cs, reset, 433.0)
        
        self.rfm9x.tx_power = 20        
        self.rfm9x.spreading_factor = 9
        self.rfm9x.signal_bandwidth = 125000
        self.rfm9x.coding_rate = 5      
        print("LoRa Radio Ready.")

    def transmit(self, data: bytes):
        # Send the raw 50-byte encrypted frame over the air
        self.rfm9x.send(data)
        print(f"[TX] Secure Packet Sent! Length: {len(data)} bytes")

def main():
    try:
        lora = PhysicalLoRa()
    except RuntimeError as e:
        print(f"CRITICAL HARDWARE ERROR: SPI bus failed to find LoRa chip.\nCheck wiring.\n{e}")
        return

    packet_counter = 1
    
    print("Starting Secure Edge Telemetry Node...")
    
    try:
        while True:
            # --- INJECT SENSOR LOGIC HERE ---
            # Your friend will replace these hardcoded values with actual I2C sensor reads
            current_time = int(time.time())
            sensor_data = TelemetryData(
                counter=packet_counter,
                timestamp=current_time,
                temperature=24.5,       
                humidity=60.2,          
                battery_mv=4100,        
                flags=0x00              
            )
            
            # Build and Encrypt
            ota_packet = build_ota_frame(sensor_data)
            
            # Transmit
            lora.transmit(ota_packet)
            
            packet_counter += 1
            
            # 3-second delay to respect RF duty cycle
            time.sleep(3) 
            
    except KeyboardInterrupt:
        print("\nSystem halted by user.")

if __name__ == "__main__":
    main()