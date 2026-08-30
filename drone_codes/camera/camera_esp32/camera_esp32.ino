#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include "esp_http_server.h"

const char* ssid = "Pluto_2022_1123"; 
const char* password = "3145pluto";       

// Servo Settings
#define SERVO_PIN 14
#define PWM_FREQ 50   // 50Hz for standard SG90 servo
#define PWM_RES 16    // 16-bit resolution

// UDP Settings
WiFiUDP udp;
const int udpPort = 8888;
char packetBuffer[255];

// Camera Pins (AI-Thinker Module)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

httpd_handle_t stream_httpd = NULL;

// ==========================================
// 3. CORE FUNCTIONS
// ==========================================
void setServoAngle(int angle) {
  // Map angle (0-180) to duty cycle for 16-bit resolution (0-65535)
  // 0 deg = 1ms = ~5% duty cycle = 3276
  // 180 deg = 2ms = ~10% duty cycle = 6553
  uint32_t duty = map(angle, 0, 180, 3276, 6553);
  ledcWrite(SERVO_PIN, duty); // UPDATED FOR CORE V3: Uses PIN instead of CHANNEL
}

// MJPEG Stream Handler
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char * part_buf[64];

  res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=123456789000000000000987654321");
  if (res != ESP_OK) return res;

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      res = ESP_FAIL;
    } else {
      _jpg_buf_len = fb->len;
      _jpg_buf = fb->buf;
    }
    
    if (res == ESP_OK) {
      size_t hlen = snprintf((char *)part_buf, 64, "\r\n--123456789000000000000987654321\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
      _jpg_buf = NULL;
    }
    if (res != ESP_OK) break;
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  
  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };
  
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
  }
}
void setup() {
  Serial.begin(115200);

  ledcAttach(SERVO_PIN, PWM_FREQ, PWM_RES);
  setServoAngle(0);

  // 2. Init Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;     // Dropped to 10MHz to prevent heating
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA; // 320x240 for high speed/low latency
  config.jpeg_quality = 12;
  config.fb_count = 1;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("Camera init failed");
    return;
  }

  // 3. Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // 4. Start Services
  startCameraServer();
  udp.begin(udpPort);
  ArduinoOTA.begin(); // Enable wireless flashing
  
  Serial.println("AEGIS Companion Computer Ready.");
}

void loop() {
  // Handle Wireless Firmware Updates
  ArduinoOTA.handle();

  // Listen for UDP Commands from Laptop
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(packetBuffer, 255);
    if (len > 0) {
      packetBuffer[len] = 0; 
    }
    
    String command = String(packetBuffer);
    if (command == "DROP") {
      Serial.println("Executing Payload Drop!");
      setServoAngle(90);  // Open 
      delay(3000);        // Wait 3 seconds to ensure item falls
      setServoAngle(0);   // Close 
      Serial.println("Drop Complete.");
    }
  }
}
//rajibul is dead