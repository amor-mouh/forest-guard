#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <math.h>

// ======================================================
// Wi-Fi Access Point
// ======================================================

const char* AP_SSID = "ESP32-Forest-Guard";
const char* AP_PASSWORD = "12345678";

WebServer server(80);

// ======================================================
// Pins
// ======================================================

const int MQ9_PIN = 34;
const int ALERT_PIN = 2;
const int BUZZER_PIN = 4;
const int DHT_PIN = 15;

// ======================================================
// Thresholds
// ======================================================

const int GAS_THRESHOLD = 2000;
const float QUAKE_THRESHOLD = 0.20;     // g
const unsigned long QUAKE_HOLD = 2000;

// ======================================================
// MPU6050
// ======================================================

#define MPU_ADDR 0x68

// ======================================================
// DHT11
// ======================================================

#define DHTTYPE DHT11

DHT dht(DHT_PIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ======================================================
// Timing
// ======================================================

unsigned long lastSensors = 0;
unsigned long lastMPU = 0;
unsigned long lastQuake = 0;
unsigned long lastLCD = 0;

// ======================================================
// Sensor data
// ======================================================

bool quake = false;

int gasValue = 0;

float temp = NAN;
float hum = NAN;

float vib = 0;
float peakVib = 0;

// ======================================================
// MPU6050 reading
// ======================================================

bool readAccel(float &ax, float &ay, float &az) {

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(MPU_ADDR, 6) != 6) {
    return false;
  }

  int16_t x = Wire.read() << 8 | Wire.read();
  int16_t y = Wire.read() << 8 | Wire.read();
  int16_t z = Wire.read() << 8 | Wire.read();

  ax = x / 16384.0;
  ay = y / 16384.0;
  az = z / 16384.0;

  return true;
}

// ======================================================
// LCD
// ======================================================

void showLine(int row, const char* s) {

  char buf[17];

  snprintf(buf, sizeof(buf), "%-16s", s);

  lcd.setCursor(0, row);
  lcd.print(buf);
}

void updateLCD(unsigned long now) {

  char l1[24];
  char l2[24];

  int page = (now / 3000) % 2;

  // أثناء الزلزال نظهر صفحة الزلزال
  if (quake) {
    page = 1;
  }

  if (page == 0) {

    snprintf(
      l1,
      sizeof(l1),
      "Gas:%d %s",
      gasValue,
      gasValue > GAS_THRESHOLD ? "ALERT!" : "OK"
    );

    if (isnan(temp) || isnan(hum)) {

      snprintf(
        l2,
        sizeof(l2),
        "DHT Error"
      );

    } else {

      snprintf(
        l2,
        sizeof(l2),
        "T:%.0fC H:%.0f%%",
        temp,
        hum
      );
    }

  } else {

    snprintf(
      l1,
      sizeof(l1),
      "%s",
      quake ? "EARTHQUAKE!!!" : "Quake: OK"
    );

    snprintf(
      l2,
      sizeof(l2),
      "V:%.2fg Pk:%.2fg",
      vib,
      peakVib
    );
  }

  showLine(0, l1);
  showLine(1, l2);
}

// ======================================================
// JSON API
// ======================================================

void handleData() {

  bool gasAlert = gasValue > GAS_THRESHOLD;
  bool alarm = quake || gasAlert;

  String json = "{";

  json += "\"gas\":";
  json += String(gasValue);

  json += ",\"gasThreshold\":";
  json += String(GAS_THRESHOLD);

  json += ",\"temperature\":";

  if (isnan(temp)) {
    json += "null";
  } else {
    json += String(temp, 1);
  }

  json += ",\"humidity\":";

  if (isnan(hum)) {
    json += "null";
  } else {
    json += String(hum, 1);
  }

  json += ",\"vibration\":";
  json += String(vib, 3);

  json += ",\"peakVibration\":";
  json += String(peakVib, 3);

  json += ",\"quake\":";
  json += quake ? "true" : "false";

  json += ",\"gasAlert\":";
  json += gasAlert ? "true" : "false";

  json += ",\"alarm\":";
  json += alarm ? "true" : "false";

  json += ",\"uptime\":";
  json += String(millis());

  json += "}";

  // السماح للموقع الموجود على الحاسوب بالاتصال
  server.sendHeader("Access-Control-Allow-Origin", "*");

  server.send(
    200,
    "application/json",
    json
  );
}

// ======================================================
// Root API test
// ======================================================

void handleRoot() {

  server.sendHeader("Access-Control-Allow-Origin", "*");

  String message = "";

  message += "ESP32 Sensor API\n\n";

  message += "WiFi SSID: ";
  message += AP_SSID;
  message += "\n";

  message += "IP Address: ";
  message += WiFi.softAPIP().toString();
  message += "\n\n";

  message += "API:\n";
  message += "/api/data\n";

  server.send(
    200,
    "text/plain",
    message
  );
}

// ======================================================
// Setup
// ======================================================

void setup() {

  Serial.begin(115200);

  // --------------------------------------------------
  // Pins
  // --------------------------------------------------

  pinMode(ALERT_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  analogReadResolution(12);

  // --------------------------------------------------
  // DHT
  // --------------------------------------------------

  dht.begin();

  // --------------------------------------------------
  // I2C
  // --------------------------------------------------

  Wire.begin(21, 22);

  // --------------------------------------------------
  // MPU6050
  // --------------------------------------------------

  Wire.beginTransmission(MPU_ADDR);

  Wire.write(0x6B);
  Wire.write(0);

  Wire.endTransmission();

  // --------------------------------------------------
  // LCD
  // --------------------------------------------------

  lcd.init();
  lcd.backlight();

  showLine(0, "Starting...");
  showLine(1, "ESP32");

  // --------------------------------------------------
  // Wi-Fi Access Point
  // --------------------------------------------------

  WiFi.mode(WIFI_AP);

  bool apStarted = WiFi.softAP(
    AP_SSID,
    AP_PASSWORD
  );

  if (apStarted) {

    Serial.println();
    Serial.println("==============================");
    Serial.println("ESP32 ACCESS POINT STARTED");
    Serial.println("==============================");

    Serial.print("SSID: ");
    Serial.println(AP_SSID);

    Serial.print("Password: ");
    Serial.println(AP_PASSWORD);

    Serial.print("IP Address: ");
    Serial.println(WiFi.softAPIP());

    Serial.println("==============================");
    Serial.println();

  } else {

    Serial.println("ERROR: Failed to start WiFi AP");

  }

  // --------------------------------------------------
  // Web Server
  // --------------------------------------------------

  server.on("/", HTTP_GET, handleRoot);

  server.on("/api/data", HTTP_GET, handleData);

  server.begin();

  Serial.println("HTTP server started.");

  // --------------------------------------------------
  // Sensor warm-up
  // --------------------------------------------------

  showLine(0, "Warming up...");
  showLine(1, "Please wait");

  Serial.println("تسخين الحساس...");
  delay(10000);

  lcd.clear();
}

// ======================================================
// Main Loop
// ======================================================

void loop() {

  unsigned long now = millis();

  // ==================================================
  // Handle HTTP requests
  // ==================================================

  server.handleClient();

  // ==================================================
  // MPU6050
  // Every 20 ms
  // ==================================================

  if (now - lastMPU >= 20) {

    lastMPU = now;

    float ax, ay, az;

    if (readAccel(ax, ay, az)) {

      float mag = sqrt(
        ax * ax +
        ay * ay +
        az * az
      );

      vib = fabs(mag - 1.0);

      if (vib > QUAKE_THRESHOLD) {

        if (!quake) {

          peakVib = 0;

          Serial.println(
            "!!! اهتزاز / زلزال !!!"
          );
        }

        quake = true;

        lastQuake = now;
      }

      if (quake && vib > peakVib) {
        peakVib = vib;
      }
    }

    // انتهاء الزلزال
    if (
      quake &&
      now - lastQuake > QUAKE_HOLD
    ) {

      quake = false;

      Serial.println(
        "انتهى الاهتزاز"
      );
    }
  }

  // ==================================================
  // Gas + DHT
  // Every 2 seconds
  // ==================================================

  if (now - lastSensors >= 2000) {

    lastSensors = now;

    long sum = 0;

    for (int i = 0; i < 10; i++) {

      sum += analogRead(MQ9_PIN);

      delay(2);
    }

    gasValue = sum / 10;

    temp = dht.readTemperature();

    hum = dht.readHumidity();

    Serial.printf(
      "Gas: %d | Temp: %.1f | Hum: %.0f | Vib: %.3f g\n",
      gasValue,
      temp,
      hum,
      vib
    );
  }

  // ==================================================
  // LCD
  // Every 250 ms
  // ==================================================

  if (now - lastLCD >= 250) {

    lastLCD = now;

    updateLCD(now);
  }

  // ==================================================
  // Alarm
  // ==================================================

  bool alarm =
    quake ||
    gasValue > GAS_THRESHOLD;

  digitalWrite(
    ALERT_PIN,
    alarm ? HIGH : LOW
  );

  digitalWrite(
    BUZZER_PIN,
    alarm ? (now / 200) % 2 : LOW
  );
}