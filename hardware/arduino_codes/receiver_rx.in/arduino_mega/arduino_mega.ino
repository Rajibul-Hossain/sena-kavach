#include <TinyGPS++.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <Keypad.h>

// --- HARDWARE PIN DEFINITIONS ---
#define DHTPIN 4
#define DHTTYPE DHT11
#define DIGITAL_ORANGE_PIN 5
#define MQ_ANALOG_PIN A0
#define MPU_ADDR 0x68

// --- 4x4 KEYPAD MATRIX ---
const byte ROWS = 4; 
const byte COLS = 4; 
char keys[ROWS][COLS] = {
    {'1','2','3','A'}, 
    {'4','5','6','B'}, 
    {'7','8','9','C'}, 
    {'*','0','#','D'}
};
byte rowPins[ROWS] = {29, 28, 27, 26}; 
byte colPins[COLS] = {25, 24, 23, 22};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// --- DUAL I2C LCD HUDs ---
LiquidCrystal_I2C lcd1(0x27, 16, 2); // Auth & GPS HUD (5V)
LiquidCrystal_I2C lcd2(0x3F, 16, 2); // Sensor HUD (5V)
TinyGPSPlus gps;
DHT dht(DHTPIN, DHTTYPE);

// --- SYSTEM STATE VARIABLES ---
String soldierID = "";
bool isDeployed = false;
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL = 1000;

// Dedicated helper to continuously pump the GPS hardware buffer
void pumpGPSBuffer() {
    while (Serial1.available() > 0) {
        gps.encode(Serial1.read());
    }
}

void wakeMPU6050() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B); 
    Wire.write(0x00); // Wake up MPU6050
    Wire.endTransmission(true);
}

void deployUnit() {
    isDeployed = true;
    lcd1.clear(); 
    lcd1.setCursor(0, 0); lcd1.print(F("LINK ESTABLISHED"));
    lcd1.setCursor(0, 1); lcd1.print(F("CMD-")); lcd1.print(soldierID); 
    
    lcd2.clear(); 
    lcd2.setCursor(0, 0); lcd2.print(F("ARMING SENSORS.."));
    
    Serial.print(F("[SYSTEM] UNIT DEPLOYED: CMD-"));
    Serial.println(soldierID);
    delay(1500);
}

void setup() {
    Serial.begin(115200);   // USB Uplink to Raspberry Pi / PC Debug (Pins 0/1)
    Serial2.begin(9600);    // Uplink to Wemos D1 R1 (TX2 = Pin 16, RX2 = Pin 17)
    Serial1.begin(9600);    // GPS Downlink (RX1 = Pin 19, TX1 = Pin 18)
    
    dht.begin();
    pinMode(DIGITAL_ORANGE_PIN, INPUT);
    pinMode(MQ_ANALOG_PIN, INPUT);

    // Boot I2C Bus with Anti-Lockup Timeout for field reliability
    Wire.begin();
    Wire.setWireTimeout(3000, true); 

    lcd1.init(); lcd1.backlight();
    lcd2.init(); lcd2.backlight();

    wakeMPU6050();
    
    // Initial UI Boot State
    lcd1.clear();
    lcd1.setCursor(0, 0); lcd1.print(F("ENTER ARMY NO:"));
    lcd2.clear();
    lcd2.setCursor(0, 0); lcd2.print(F("SENA KAVACH OS"));
    lcd2.setCursor(0, 1); lcd2.print(F("AWAITING LOGIN.."));

    Serial.println(F("[BOOT] Sena Kavach Mega Master Ready. Enter ID on Keypad + '#' (or type ID in Serial Monitor)."));
}

void loop() {
    // 1. CONTINUOUS GPS BUFFER FEED (Must run every cycle)
    pumpGPSBuffer();

    // ========================================================
    // PHASE 1: KEYPAD AUTHENTICATION & LOGIN (With Serial Backup)
    // ========================================================
    if (!isDeployed) {
        // A. Physical 4x4 Keypad Input
        char key = keypad.getKey();
        if (key) {
            if (key == '#') {
                if (soldierID.length() > 0) {
                    deployUnit();
                }
            } else if (key == '*') {
                soldierID = "";
                lcd1.setCursor(0, 1); 
                lcd1.print(F("                "));
            } else {
                if (soldierID.length() < 10) {
                    soldierID += key;
                    lcd1.setCursor(0, 1); 
                    lcd1.print(soldierID);
                }
            }
        }

        // B. USB Serial Monitor Login Fallback
        if (Serial.available() > 0) {
            String serialInput = Serial.readStringUntil('\n');
            serialInput.trim();
            if (serialInput.length() > 0) {
                soldierID = serialInput;
                deployUnit();
            }
        }
    } 
    // ========================================================
    // PHASE 2: ACTIVE COMBAT TELEMETRY LOOP
    // ========================================================
    else {
        if (millis() - lastTelemetryTime >= TELEMETRY_INTERVAL) {
            lastTelemetryTime = millis();
            
            // --- 1. Environmental & Obstacle Data Acquisition ---
            float t = dht.readTemperature();
            pumpGPSBuffer(); 
            float h = dht.readHumidity();
            pumpGPSBuffer();

            if (isnan(t)) t = 0.0; 
            if (isnan(h)) h = 0.0; 
            
            int gasLevel = analogRead(MQ_ANALOG_PIN);
            int orangeStatus = digitalRead(DIGITAL_ORANGE_PIN); 
            
            // --- 2. MPU6050 Geometric Attitude Math (32-Bit Float Protected) ---
            float pitch = 0.0, roll = 0.0;
            Wire.beginTransmission(MPU_ADDR);
            Wire.write(0x3B); 
            if (Wire.endTransmission(false) == 0) {
                uint8_t bytesReceived = Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6, (uint8_t)true);
                if (bytesReceived == 6) {
                    int16_t raw_ax = (Wire.read() << 8) | Wire.read();
                    int16_t raw_ay = (Wire.read() << 8) | Wire.read();
                    int16_t raw_az = (Wire.read() << 8) | Wire.read();
                    
                    float ax = (float)raw_ax;
                    float ay = (float)raw_ay;
                    float az = (float)raw_az;
                    
                    pitch = atan2(-ax, sqrt((ay * ay) + (az * az))) * 180.0 / PI;
                    roll  = atan2(ay, az) * 180.0 / PI;
                } else {
                    wakeMPU6050(); 
                }
            } else {
                if (Wire.getWireTimeoutFlag()) {
                    Wire.clearWireTimeoutFlag();
                }
                wakeMPU6050();
            }

            if (isnan(pitch)) pitch = 0.0;
            if (isnan(roll))  roll = 0.0;

            pumpGPSBuffer();

            // --- 3. GPS Geolocation Logic ---
            float lat = 0.0, lon = 0.0, alt = 0.0, spd = 0.0;
            int sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
            int hdop = gps.hdop.isValid() ? gps.hdop.value() : 999;
            bool hasLock = gps.location.isValid();

            if (hasLock) {
                lat = gps.location.lat(); 
                lon = gps.location.lng();
                alt = gps.altitude.meters(); 
                spd = gps.speed.kmph();
            }

            // --- 4. TRANSMIT TO WEMOS D1 R1 (Serial2 -> Pin 16 TX2 @ 9600 Baud) ---
            // Packet Format (14 Fields):
            // UAV,CMD-{ID},{lat},{lon},{alt},{spd},{sats},{hdop},{t},{h},{gasLevel},{orangeStatus},{pitch},{roll}
            Serial2.print(F("UAV,CMD-")); Serial2.print(soldierID); Serial2.print(F(","));
            Serial2.print(lat, 6);        Serial2.print(F(","));
            Serial2.print(lon, 6);        Serial2.print(F(","));
            Serial2.print(alt, 1);        Serial2.print(F(","));
            Serial2.print(spd, 1);        Serial2.print(F(","));
            Serial2.print(sats);          Serial2.print(F(","));
            Serial2.print(hdop);          Serial2.print(F(","));
            Serial2.print(t, 1);          Serial2.print(F(","));
            Serial2.print(h, 1);          Serial2.print(F(","));
            Serial2.print(gasLevel);      Serial2.print(F(","));
            Serial2.print(orangeStatus);  Serial2.print(F(","));
            Serial2.print(pitch, 1);      Serial2.print(F(","));
            Serial2.println(roll, 1); 

            // --- 5. TRANSMIT TO RASPBERRY PI (Serial -> USB @ 115200 Baud) ---
            Serial.print(F("UAV,CMD-")); Serial.print(soldierID); Serial.print(F(","));
            Serial.print(lat, 6);        Serial.print(F(","));
            Serial.print(lon, 6);        Serial.print(F(","));
            Serial.print(alt, 1);        Serial.print(F(","));
            Serial.print(spd, 1);        Serial.print(F(","));
            Serial.print(sats);          Serial.print(F(","));
            Serial.print(hdop);          Serial.print(F(","));
            Serial.print(t, 1);          Serial.print(F(","));
            Serial.print(h, 1);          Serial.print(F(","));
            Serial.print(gasLevel);      Serial.print(F(","));
            Serial.print(orangeStatus);  Serial.print(F(","));
            Serial.print(pitch, 1);      Serial.print(F(","));
            Serial.println(roll, 1); 

            pumpGPSBuffer();

            // --- 6. DYNAMIC DUAL-LCD HUD UPDATES ---
            lcd2.clear();
            lcd2.setCursor(0, 0);
            lcd2.print(F("T:")); lcd2.print((int)t); lcd2.print(F("C GAS:")); lcd2.print(gasLevel);
            lcd2.setCursor(0, 1);
            lcd2.print(F("P:")); lcd2.print((int)pitch); lcd2.print(F(" R:")); lcd2.print((int)roll);

            lcd1.clear();
            lcd1.setCursor(0, 0);
            // Give the GPS module up to a few seconds of uptime before throwing a hard fault message
            if (millis() > 5000 && gps.charsProcessed() < 5) {
                lcd1.print(F("GPS DATA FAULT"));
                lcd1.setCursor(0, 1);
                lcd1.print(F("CHECK RX/TX WIRING"));
            } else if (!hasLock) {
                lcd1.print(F("GPS SEARCHING..."));
                lcd1.setCursor(0, 1); 
                lcd1.print(F("SATS: ")); lcd1.print(sats);
            } else {
                lcd1.print(F("LAT: ")); lcd1.print(lat, 4);
                lcd1.setCursor(0, 1); 
                lcd1.print(F("LON: ")); lcd1.print(lon, 4);
            }
        }
    }
}