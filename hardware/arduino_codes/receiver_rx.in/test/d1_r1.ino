#include <ESP8266WiFi.h>
#include <Firebase_ESP_Client.h>
#include <time.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
//  Network Config 
#define WIFI_SSID "rajibul"
#define WIFI_PASSWORD "spdf0123"
#define API_KEY "AIzaSyD8VmRxwh6fiQ8msCKhwsAhfScRHaFeW04"
#define DATABASE_URL "sena-kavach-default-rtdb.firebaseio.com"
#define USER_EMAIL "node@sena.mil"
#define USER_PASSWORD "123456"
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long lastUploadTime = 0;
void setup() {
    Serial.begin(115200); 
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) { delay(500); }
    configTime(0, 0, "pool.ntp.org");
    config.api_key = API_KEY;
    config.database_url = DATABASE_URL;
    auth.user.email = USER_EMAIL;
    auth.user.password = USER_PASSWORD;
    config.token_status_callback = tokenStatusCallback;
    fbdo.setBSSLBufferSize(2048, 512);
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
}
void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        WiFi.reconnect();
        delay(1000);
        return;
    }
    while (Serial.available()) {
        String incoming = Serial.readStringUntil('\n');
        incoming.trim(); 
        if (incoming.startsWith("UAV,")) {
            String tokens[14]; 
            int tokenIdx = 0;
            int startIndex = 0;
            int commaIndex = incoming.indexOf(',');
            while (commaIndex >= 0 && tokenIdx < 13) {
                tokens[tokenIdx] = incoming.substring(startIndex, commaIndex);
                tokenIdx++;
                startIndex = commaIndex + 1;
                commaIndex = incoming.indexOf(',', startIndex);
            }
            tokens[tokenIdx] = incoming.substring(startIndex); 
            if (tokenIdx == 13) {
                String  armyID      = tokens[1];
                float   gpsLat      = tokens[2].toFloat();
                float   gpsLon      = tokens[3].toFloat();
                float   gpsAlt      = tokens[4].toFloat();
                float   gpsSpeed    = tokens[5].toFloat();
                int     gpsSats     = tokens[6].toInt();
                int     gpsHdop     = tokens[7].toInt();
                float   extTemp     = tokens[8].toFloat();
                float   extHum      = tokens[9].toFloat();
                int     extGas      = tokens[10].toInt();
                int     objDetected = tokens[11].toInt();
                float   uavPitch    = tokens[12].toFloat();
                float   uavRoll     = tokens[13].toFloat();
                if (isnan(gpsLat)) gpsLat = 0.0;
                if (isnan(gpsLon)) gpsLon = 0.0;
                if (isnan(extTemp)) extTemp = 0.0;
                if (isnan(uavPitch)) uavPitch = 0.0;
                if (isnan(uavRoll)) uavRoll = 0.0;

                if (millis() - lastUploadTime >= 3000) {
                    lastUploadTime = millis();
                    
                    FirebaseJson json;
                    json.set("army_no", armyID);
                    json.set("status", "ACTIVE_COMBAT");
                    json.set("heart_rate", random(80, 110)); 
                    
                    json.set("location/latitude", gpsLat);
                    json.set("location/longitude", gpsLon);
                    json.set("location/altitude_m", gpsAlt);
                    json.set("location/speed_kmh", gpsSpeed);
                    json.set("location/satellites", gpsSats);
                    
                    json.set("environment/temperature_c", extTemp);
                    json.set("environment/humidity_rh", extHum);
                    json.set("environment/gas_level", extGas);
                    json.set("tactical/obstacle_detected", objDetected);
                    json.set("telemetry/pitch", uavPitch);
                    json.set("telemetry/roll", uavRoll);
                    
                    String dbPath = "/active_soldiers/" + armyID;
                    Firebase.RTDB.setJSON(&fbdo, dbPath.c_str(), &json);
                }
            }
        }
    }
}