/**
 * Smart Fruit Quality Detection System
 * Arduino UNO - Sensor Data Collector
 * 
 * Sensors:
 *   - MQ3  (Ethylene / Alcohol gas)   → Analog pin A0
 *   - MQ5  (Ammonia / LPG gas)        → Analog pin A1
 *   - MQ135 (CO2 / Air Quality)       → Analog pin A2
 *   - DHT11 (Temperature & Humidity)  → Digital pin D2
 * 
 * Output format (Serial @ 9600 baud):
 *   mq3,mq5,mq135,temperature,humidity
 *   Example: 320,210,450,30,70
 */

#include <DHT.h>

// ─── Pin Definitions ───────────────────────────────────────────────────────
#define MQ3_PIN    A0
#define MQ5_PIN    A1
#define MQ135_PIN  A2
#define DHT_PIN    2
#define DHT_TYPE   DHT11

// ─── Sampling Config ───────────────────────────────────────────────────────
#define SEND_INTERVAL_MS   1000   // Send data every 1 second
#define WARMUP_MS          2000   // Allow sensors to warm up
#define SAMPLES_PER_READ   5      // Average N analog reads to reduce noise

// ─── Sensor Limits for Validation ─────────────────────────────────────────
#define MQ3_MIN    50
#define MQ3_MAX    900
#define MQ5_MIN    50
#define MQ5_MAX    900
#define MQ135_MIN  50
#define MQ135_MAX  900

// ─── Objects ──────────────────────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

// ─── State ────────────────────────────────────────────────────────────────
unsigned long lastSendTime = 0;
bool warmedUp = false;

// ──────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(9600);
  dht.begin();

  // Status LED (optional - uses built-in LED pin 13)
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.println("# FruitSense Arduino v1.0 - Warming up...");
  delay(WARMUP_MS);

  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("# Ready. Streaming: mq3,mq5,mq135,temperature,humidity");
  warmedUp = true;
}

// ──────────────────────────────────────────────────────────────────────────
/**
 * Read analog pin multiple times and return the average.
 * Reduces ADC noise significantly.
 */
int readAnalogAverage(int pin, int samples) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(2);
  }
  return (int)(total / samples);
}

// ──────────────────────────────────────────────────────────────────────────
/**
 * Clamp a value to [minVal, maxVal].
 */
int clamp(int value, int minVal, int maxVal) {
  if (value < minVal) return minVal;
  if (value > maxVal) return maxVal;
  return value;
}

// ──────────────────────────────────────────────────────────────────────────
void loop() {
  if (!warmedUp) return;

  unsigned long now = millis();
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  lastSendTime = now;

  // ── Read MQ sensors (averaged) ──────────────────────────────────────────
  int mq3   = readAnalogAverage(MQ3_PIN,   SAMPLES_PER_READ);
  int mq5   = readAnalogAverage(MQ5_PIN,   SAMPLES_PER_READ);
  int mq135 = readAnalogAverage(MQ135_PIN, SAMPLES_PER_READ);

  // Clamp to valid ADC range (0–1023)
  mq3   = clamp(mq3,   0, 1023);
  mq5   = clamp(mq5,   0, 1023);
  mq135 = clamp(mq135, 0, 1023);

  // ── Read DHT11 ──────────────────────────────────────────────────────────
  float humidity    = dht.readHumidity();
  float temperature = dht.readTemperature();   // Celsius

  // DHT11 error check
  if (isnan(humidity) || isnan(temperature)) {
    // Send error comment line (backend ignores lines starting with #)
    Serial.println("# DHT11 read error - check wiring");
    return;
  }

  // Round DHT values to 1 decimal place
  humidity    = round(humidity    * 10.0) / 10.0;
  temperature = round(temperature * 10.0) / 10.0;

  // ── Sanity check temperature / humidity ────────────────────────────────
  if (temperature < -10 || temperature > 60) {
    Serial.println("# Temperature out of range");
    return;
  }
  if (humidity < 0 || humidity > 100) {
    Serial.println("# Humidity out of range");
    return;
  }

  // ── Blink LED as heartbeat ──────────────────────────────────────────────
  digitalWrite(LED_BUILTIN, LOW);
  delay(50);
  digitalWrite(LED_BUILTIN, HIGH);

  // ── Emit CSV data line ──────────────────────────────────────────────────
  // Format: mq3,mq5,mq135,temperature,humidity
  Serial.print(mq3);
  Serial.print(",");
  Serial.print(mq5);
  Serial.print(",");
  Serial.print(mq135);
  Serial.print(",");
  Serial.print(temperature, 1);
  Serial.print(",");
  Serial.println(humidity, 1);
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * WIRING GUIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * MQ3 Sensor:
 *   VCC  → 5V
 *   GND  → GND
 *   AOUT → A0
 *   DOUT → (not used)
 *
 * MQ5 Sensor:
 *   VCC  → 5V
 *   GND  → GND
 *   AOUT → A1
 *   DOUT → (not used)
 *
 * MQ135 Sensor:
 *   VCC  → 5V
 *   GND  → GND
 *   AOUT → A2
 *   DOUT → (not used)
 *
 * DHT11 Sensor:
 *   VCC  → 5V
 *   GND  → GND
 *   DATA → D2  (with 10kΩ pull-up resistor to 5V)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REQUIRED LIBRARY: DHT sensor library by Adafruit
 *   Install via: Arduino IDE → Sketch → Include Library → Manage Libraries
 *   Search: "DHT sensor library" by Adafruit → Install
 *   Also install: "Adafruit Unified Sensor" (dependency)
 * ─────────────────────────────────────────────────────────────────────────
 */
