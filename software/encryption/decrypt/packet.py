import struct
from dataclasses import dataclass
import config
from crypto import encrypt_payload

# Little-endian: uint32, uint32, float, float, uint16, uint8, uint8, uint16
PAYLOAD_FORMAT = '<IIffHBBH'

@dataclass
class TelemetryData:
    counter: int
    timestamp: int
    temperature: float
    humidity: float
    battery_mv: int
    flags: int
    reserved: int = 0

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

def build_ota_frame(data: TelemetryData) -> bytes:
    partial_format = '<IIffHBB'
    packed_data = struct.pack(
        partial_format,
        data.counter, data.timestamp, data.temperature,
        data.humidity, data.battery_mv, data.flags, data.reserved
    )
    
    crc16 = calculate_crc16_ccitt(packed_data)
    full_plaintext_payload = struct.pack(
        PAYLOAD_FORMAT, 
        data.counter, data.timestamp, data.temperature,
        data.humidity, data.battery_mv, data.flags, data.reserved, crc16
    )
    
    iv, ciphertext = encrypt_payload(full_plaintext_payload, config.AES_KEY)
    
    header = struct.pack('<BB', config.PROTOCOL_VERSION, config.NODE_ID)
    
    ota_frame = header + iv + ciphertext
    return ota_frame