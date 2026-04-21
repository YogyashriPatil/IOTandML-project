#include <DHT.h>

// ── Pin definitions ───────────────────────────────────────────────────────────
#define MQ3_PIN            A0
#define MQ5_PIN            A1
#define MQ135_PIN          A2
#define DHT_PIN            2
#define DHT_TYPE           DHT11
#define LED_PIN            7       // external indicator LED

// ── Timing & sampling constants ───────────────────────────────────────────────
#define SERIAL_BAUD        115200  // MUST match BAUD_RATE in app.py
#define SEND_INTERVAL_MS   2000    // one CSV line every 2 s (matches READ_INTERVAL_S)
#define WARMUP_MS          2000    // sensor warm-up at boot
#define SAMPLES_PER_READ   5       // ADC over-sampling for noise reduction

// ── DHT fallback values ───────────────────────────────────────────────────────
#define DHT_FALLBACK_TEMP  28.5f
#define DHT_FALLBACK_HUM   65.0f

// ── Command reception buffer ──────────────────────────────────────────────────
#define CMD_BUFFER_SIZE 16
char    cmdBuf[CMD_BUFFER_SIZE];
uint8_t cmdLen = 0;

// ── Global state ──────────────────────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastSendTime  = 0;
unsigned long lastBlinkTime = 0;
bool blinkState     = false;
bool warmedUp       = false;
bool ledState       = false;

// CRITICAL FIX: gate flag — false at startup, true only after LED_ON received
bool shouldSendData = false;

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(SERIAL_BAUD);
  dht.begin();

  pinMode(LED_PIN,     OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_PIN,     LOW);
  digitalWrite(LED_BUILTIN, LOW);

  Serial.println(F("# FruitSense v3.0 — warming up..."));
  Serial.flush();

  delay(WARMUP_MS);

  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println(F("# Ready. Sensor gate CLOSED. Awaiting LED_ON command."));
  Serial.println(F("# Commands: LED_ON | LED_OFF"));
  Serial.println(F("# CSV format: mq3,mq5,mq135,temperature,humidity"));
  Serial.flush();

  warmedUp = true;
}

// ── Helper: average multiple ADC reads to reduce noise ───────────────────────
int readAnalogAverage(int pin, int samples) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(2);
  }
  return (int)(total / samples);
}

// ── Helper: integer clamp ─────────────────────────────────────────────────────
int clampI(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// ── Helper: float clamp ───────────────────────────────────────────────────────
float clampF(float v, float lo, float hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// ── Set the external LED and report its state ─────────────────────────────────
void setLed(bool on) {
  ledState = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
  Serial.print(F("# LED "));
  Serial.println(on ? F("ON — sensor gate OPEN") : F("OFF — sensor gate CLOSED"));
  Serial.flush();
}

// ── Parse and act on incoming serial commands ─────────────────────────────────
// Commands are newline-terminated: "LED_ON\n" or "LED_OFF\n"
// This is the ONLY place command parsing happens (removed duplicate in loop()).
void processSerialCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();

    if (c == '\r') {
      continue;          // ignore CR so Windows CRLF works
    }

    if (c == '\n') {
      cmdBuf[cmdLen] = '\0';   // null-terminate

      if (strcmp(cmdBuf, "LED_ON") == 0) {
        setLed(true);
        shouldSendData = true;    // OPEN the sensor gate
        Serial.println(F("# Sensor gate OPENED — CSV streaming started"));
        Serial.flush();

      } else if (strcmp(cmdBuf, "LED_OFF") == 0) {
        setLed(false);
        shouldSendData = false;   // CLOSE the sensor gate
        Serial.println(F("# Sensor gate CLOSED — CSV streaming stopped"));
        Serial.flush();

      } else if (cmdLen > 0) {
        // Unknown command — echo back for debugging
        Serial.print(F("# Unknown command: "));
        Serial.println(cmdBuf);
        Serial.flush();
      }

      cmdLen = 0;   // reset buffer

    } else {
      if (cmdLen < CMD_BUFFER_SIZE - 1) {
        cmdBuf[cmdLen++] = c;
      } else {
        // Buffer overflow — discard and start fresh
        cmdLen = 0;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  // Always service incoming commands so LED_ON / LED_OFF are never missed
  processSerialCommands();

  if (!warmedUp) return;

  // ── Heartbeat blink (non-blocking) ───────────────────────────────────────
  unsigned long now = millis();
  if (now - lastBlinkTime >= 500UL) {
    blinkState = !blinkState;
    digitalWrite(LED_BUILTIN, blinkState ? HIGH : LOW);
    lastBlinkTime = now;
  }

  // ── Rate-limit CSV output ─────────────────────────────────────────────────
  if (now - lastSendTime < (unsigned long)SEND_INTERVAL_MS) return;
  lastSendTime = now;

  // CRITICAL FIX: do NOT emit CSV if sensor gate is closed
  if (!shouldSendData) return;

  // ── Read MQ gas sensors (averaged over SAMPLES_PER_READ) ─────────────────
  int mq3   = clampI(readAnalogAverage(MQ3_PIN,   SAMPLES_PER_READ), 0, 1023);
  int mq5   = clampI(readAnalogAverage(MQ5_PIN,   SAMPLES_PER_READ), 0, 1023);
  int mq135 = clampI(readAnalogAverage(MQ135_PIN, SAMPLES_PER_READ), 0, 1023);

  // ── Read DHT11 ────────────────────────────────────────────────────────────
  float humidity    = dht.readHumidity();
  float temperature = dht.readTemperature();   // Celsius

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println(F("# DHT11 read error — using fallback values"));
    Serial.flush();
    humidity    = DHT_FALLBACK_HUM;
    temperature = DHT_FALLBACK_TEMP;
  }

  // Clamp and round to 1 decimal place
  temperature = clampF(roundf(temperature * 10.0f) / 10.0f, -10.0f, 60.0f);
  humidity    = clampF(roundf(humidity    * 10.0f) / 10.0f,   0.0f, 100.0f);

  // ── Emit CSV line ─────────────────────────────────────────────────────────
  // Format: mq3,mq5,mq135,temperature,humidity
  // Example: 312,198,445,28.5,64.0
  Serial.print(mq3);
  Serial.print(F(","));
  Serial.print(mq5);
  Serial.print(F(","));
  Serial.print(mq135);
  Serial.print(F(","));
  Serial.print(temperature, 1);
  Serial.print(F(","));
  Serial.println(humidity, 1);
  Serial.flush();   // ensure bytes leave the TX FIFO immediately
}
