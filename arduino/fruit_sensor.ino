#include <DHT.h>

// -----------------------------
// DHT11 Setup
// -----------------------------
#define DHTPIN 2        // DHT11 data pin connected to digital pin 2
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// -----------------------------
// MQ Sensors (Analog Pins)
// -----------------------------
int mq3Pin = A0;
int mq5Pin = A1;
int mq135Pin = A2;

// -----------------------------
void setup() {
  Serial.begin(9600);   // Baud rate (must match Python)
  dht.begin();

  Serial.println("System Starting...");
}

// -----------------------------
void loop() {
  int mq3_val = analogRead(mq3);
  int mq5_val = analogRead(mq5);
  int mq135_val = analogRead(mq135);

  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (isnan(temp) || isnan(hum)) {
    return;
  }

  Serial.print(mq3_val);
  Serial.print(",");
  Serial.print(mq5_val);
  Serial.print(",");
  Serial.print(mq135_val);
  Serial.print(",");
  Serial.print(temp);
  Serial.print(",");
  Serial.println(hum);

  delay(2000);
}