import serial
import time
import joblib
import numpy as np

# -----------------------------
# Load Model
# -----------------------------
model = joblib.load("model/model.pkl")
scaler = joblib.load("model/scaler.pkl")

labels = ['Apple', 'Banana', 'Grapes', 'Strawberry', 'Sapodila']

# -----------------------------
# Serial Connection
# -----------------------------
ser = serial.Serial('COM8', 9600, timeout=1)
time.sleep(3)

print("🚀 System Started...\n")

# -----------------------------
# Main Loop
# -----------------------------
while True:
    if ser.in_waiting > 0:
        line = ser.readline().decode('utf-8', errors='ignore').strip()

        if line:
            print("Raw:", line)

            try:
                mq3, mq5, mq135, temp, hum = map(float, line.split(","))

                # Prepare input
                values = np.array([[mq3, mq5, mq135, temp, hum]])
                values = scaler.transform(values)

                # Prediction
                pred = model.predict(values)[0]

                print("🍎 Predicted Fruit:", labels[pred])
                print("----------------------------")

            except:
                print("Invalid data")