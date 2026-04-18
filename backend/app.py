from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import serial
import threading

app = Flask(__name__)
CORS(app)

# Load model
model = joblib.load("model/model.pkl")
scaler = joblib.load("model/scaler.pkl")

labels = ['Apple', 'Banana', 'Grapes', 'Strawberry', 'Sapodila']

# Serial connection
ser = serial.Serial('COM3', 9600)

latest_data = {}

# -------------------------------
# Thread for Arduino reading
# -------------------------------
def read_serial():
    global latest_data
    while True:
        try:
            line = ser.readline().decode().strip()
            mq3, mq5, mq135, temp, hum = map(float, line.split(","))

            values = np.array([[mq3, mq5, mq135, temp, hum]])
            values = scaler.transform(values)

            pred = model.predict(values)[0]

            latest_data = {
                "mq3": mq3,
                "mq5": mq5,
                "mq135": mq135,
                "temp": temp,
                "humidity": hum,
                "prediction": labels[pred]
            }
        except:
            continue

thread = threading.Thread(target=read_serial)
thread.daemon = True
thread.start()

# -------------------------------
# API
# -------------------------------
@app.route('/data', methods=['GET'])
def get_data():
    return jsonify(latest_data)

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json

    values = np.array([[
        data['mq3'],
        data['mq5'],
        data['mq135'],
        data['temp'],
        data['humidity']
    ]])

    values = scaler.transform(values)
    pred = model.predict(values)[0]

    return jsonify({"prediction": labels[pred]})

if __name__ == "__main__":
    app.run(debug=True)