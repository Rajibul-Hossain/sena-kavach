#include <TinyGPS++.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <Keypad.h>
#define DHTPIN 4
#define DHTTYPE DHT11
#define DIGITAL_ORANGE_PIN 5
#define MQ_ANALOG_PIN A0
#define MPU_ADDR 0x68
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

// --- Dual LCD Objects ---
LiquidCrystal_I2C lcd1(0x27, 16, 2); // Auth & GPS HUD (5V)
LiquidCrystal_I2C lcd2(0x3F, 16, 2); // SENSOR HUD (5V)
TinyGPSPlus gps;
DHT dht(DHTPIN, DHTTYPE);

// --- System State Variables ---
String soldierID = "";
bool isDeployed = false;
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL = 1000;

void setup() {
    Serial.begin(115200);     // USB Uplink to Raspberry Pi (Pins 0/1)
    Serial2.begin(115200);    // Serial Uplink to Wemos D1 R1 (TX2 = Pin 16)
    Serial1.begin(9600);      // GPS Downlink (RX1 = 19, TX1 = 18)
    
    dht.begin();
    pinMode(DIGITAL_ORANGE_PIN, INPUT);
    pinMode(MQ_ANALOG_PIN, INPUT);

    // Boot I2C Bus with ANTI-LOCKUP TIMEOUT (CRUCIAL FOR FIELD OPS)
    Wire.begin();
    Wire.setWireTimeout(3000, true); 

    lcd1.init(); lcd1.backlight();
    lcd2.init(); lcd2.backlight();

    // MPU6050 Wakeup Sequence
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B); 
    Wire.write(0); 
    Wire.endTransmission(true);
    
    // Initial UI Boot State
    lcd1.setCursor(0, 0); lcd1.print(F("ENTER ARMY NO:"));
    lcd2.setCursor(0, 0); lcd2.print(F("SENA KAVACH OS"));
    lcd2.setCursor(0, 1); lcd2.print(F("AWAITING LOGIN.."));
}

void loop() {
    // 1. DEDICATED GPS BUFFER FEED
    while (Serial1.available() > 0) {
        gps.encode(Serial1.read());
    }

    // ========================================================
    // PHASE 1: KEYPAD AUTHENTICATION & LOGIN
    // ========================================================
    if (!isDeployed) {
        char key = keypad.getKey();
        if (key) {
            if (key == '#') {
                if (soldierID.length() > 0) {
                    isDeployed = true;
                    lcd1.clear(); 
                    lcd1.print(F("LINK ESTABLISHED"));
                    lcd1.setCursor(0, 1); 
                    lcd1.print(F("CMD-")); lcd1.print(soldierID); 
                    
                    lcd2.clear(); 
                    lcd2.print(F("ARMING SENSORS.."));
                    delay(1500);
                }
            } else if (key == '*') {
                soldierID = "";
                lcd1.setCursor(0, 1); lcd1.print(F("                "));
            } else {
                if (soldierID.length() < 10) {
                    soldierID += key;
                    lcd1.setCursor(0, 1); lcd1.print(soldierID);
                }
            }
        }
    } 
    // ========================================================
    // PHASE 2: ACTIVE COMBAT TELEMETRY LOOP
    // ========================================================
    else {
        if (millis() - lastTelemetryTime >= TELEMETRY_INTERVAL) {
            lastTelemetryTime = millis();
            
            // --- Sensor Data Acquisition ---
            float t = dht.readTemperature();
            float h = dht.readHumidity();
            if (isnan(t)) t = 0.0; 
            
            int gasLevel = analogRead(MQ_ANALOG_PIN);
            int orangeStatus = digitalRead(DIGITAL_ORANGE_PIN); 
            
            // --- MPU6050 Geometric Math ---
            Wire.beginTransmission(MPU_ADDR);
            Wire.write(0x3B); 
            Wire.endTransmission(false);
            Wire.requestFrom(MPU_ADDR, 6, true); 
            
            int16_t ax = Wire.read()<<8 | Wire.read();
            int16_t ay = Wire.read()<<8 | Wire.read();
            int16_t az = Wire.read()<<8 | Wire.read();
            
            float pitch = atan2(-ax, sqrt(ay*ay + az*az)) * 180.0 / PI;
            float roll = atan2(ay, az) * 180.0 / PI;

            // --- GPS Logic ---
            float lat = 0.0, lon = 0.0, alt = 0.0, spd = 0.0;
            int sats = gps.satellites.value();
            int hdop = 999;
            bool hasLock = gps.location.isValid();

            if (hasLock) {
                lat = gps.location.lat(); lon = gps.location.lng();
                alt = gps.altitude.meters(); spd = gps.speed.kmph();
                hdop = gps.hdop.value();
            }

            // --- 1. TRANSMIT TO D1 R1 (Firebase Cloud Link) ---
            Serial2.print(F("UAV,CMD-")); Serial2.print(soldierID); Serial2.print(F(","));
            Serial2.print(lat, 6); Serial2.print(F(","));
            Serial2.print(lon, 6); Serial2.print(F(","));
            Serial2.print(alt); Serial2.print(F(","));
            Serial2.print(spd); Serial2.print(F(","));
            Serial2.print(sats); Serial2.print(F(","));
            Serial2.print(hdop); Serial2.print(F(","));
            Serial2.print(t, 1); Serial2.print(F(","));
            Serial2.print(h, 1); Serial2.print(F(","));
            Serial2.print(gasLevel); Serial2.print(F(","));
            Serial2.print(orangeStatus); Serial2.print(F(","));
            Serial2.print(pitch, 1); Serial2.print(F(","));
            Serial2.println(roll, 1); 

            // --- 2. TRANSMIT TO RASPBERRY PI (Vision Edge Node) ---
            Serial.print(F("UAV,CMD-")); Serial.print(soldierID); Serial.print(F(","));
            Serial.print(lat, 6); Serial.print(F(","));
            Serial.print(lon, 6); Serial.print(F(","));
            Serial.print(alt); Serial.print(F(","));
            Serial.print(spd); Serial.print(F(","));
            Serial.print(sats); Serial.print(F(","));
            Serial.print(hdop); Serial.print(F(","));
            Serial.print(t, 1); Serial.print(F(","));
            Serial.print(h, 1); Serial.print(F(","));
            Serial.print(gasLevel); Serial.print(F(","));
            Serial.print(orangeStatus); Serial.print(F(","));
            Serial.print(pitch, 1); Serial.print(F(","));
            Serial.println(roll, 1); 

            // --- 3. DYNAMIC HUD UPDATES (Zero Heap Fragmentation) ---
            lcd2.clear();
            lcd2.print(F("T:")); lcd2.print((int)t); lcd2.print(F("C GAS:")); lcd2.print(gasLevel);
            lcd2.setCursor(0, 1);
            lcd2.print(F("P:")); lcd2.print((int)pitch); lcd2.print(F(" R:")); lcd2.print((int)roll);

            lcd1.clear();
            if (gps.charsProcessed() < 10) {
                lcd1.print(F("GPS DATA FAULT"));
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