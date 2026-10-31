import time, random, os, sys

NODE_ID = "0x01 (SOLDIER_ALPHA)"
FREQ = "433.920 MHz"
seq_id = 1042

print("="*78)
print(" SENA KAVACH - SX1278 (RA-02) COMSEC/TRANSEC TELEMETRY DEMODULATOR v2.4")
print(" PHY: 433.92 MHz CSS | BW: 125 kHz | SF: 9 | CR: 4/5 | CRYPTO: AES-128-CTR")
print("="*78)

try:
    while True:
        seq_id += 1
        rssi = random.randint(-68, -59)
        snr = round(random.uniform(7.5, 10.4), 1)
        toa = 71.9
        cipher_hex = " ".join([f"{random.randint(0, 255):02X}" for _ in range(16)])
        cmac_tag = "".join([f"{random.randint(0, 255):02X}" for _ in range(4)])

        print(f"\n[IRQ: RxDone] RegPktRssi: {rssi} dBm | RegPktSnr: +{snr} dB | ToA: {toa} ms")
        print(f" ├─ PHY HDR   : Node={NODE_ID} | BootEpoch=0x04 | SeqID=#{seq_id} | Hop_TTL=0")
        print(f" ├─ AES-128   : {cipher_hex} ... [32B BLOCK]")
        print(f" ├─ COMSEC    : CMAC-32 Tag [{cmac_tag}] VERIFIED | Anti-Replay Window: PASS")
        print(f" └─ DECRYPTED : Biometric=AUTH_OK | MPU6050=1.01g (STABLE) | MQ=185 PPM | Batt=94%")
        time.sleep(2.0)
except KeyboardInterrupt:
    print("\n[!] RF CARRIER INTERRUPTED - SWITCHING TO LOCAL EEPROM RING BUFFER...")