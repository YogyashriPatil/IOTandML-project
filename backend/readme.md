# 🍎 Smart Fruit Quality Detection System

A full-stack IoT + AI system that combines a **PyTorch ResNet50 CNN** (image classification), a **scikit-learn RandomForest ensemble** (sensor-based quality prediction), **Arduino UNO** sensor hardware, and a **React frontend**.

---

## 🗂️ Project Structure

```
fruit_quality_system/
├── arduino/
│   └── fruit_sensor.ino          ← Upload to Arduino UNO
├── backend/
│   ├── app.py                    ← Flask API server (main file)
│   ├── requirements.txt          ← Python dependencies
│   ├── test_backend.py           ← API test script
│   ├── .env.example              ← Config template
│   ├── best_fruit_model_resnet50.pth   ← Copy here ⬅️
│   └── fruit_quality_models.pkl        ← Copy here ⬅️
├── setup.sh                      ← Linux/macOS setup
├── setup.bat                     ← Windows setup
└── README.md
```

---

## ⚡ Quick Start

### Step 1 – Copy model files

```bash
cp best_fruit_model_resnet50.pth backend/
cp fruit_quality_models.pkl       backend/
```

### Step 2 – Setup Python environment

**Linux / macOS:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```bat
setup.bat
```

**Manual (any OS):**
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# CPU PyTorch (recommended for most setups)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Other dependencies
pip install flask flask-cors Pillow opencv-python scikit-learn==1.6.1 joblib numpy pyserial python-dotenv
```

> ⚠️ **scikit-learn version**: The PKL model was trained with sklearn 1.6.1. Use exactly that version to avoid warnings.

### Step 3 – Configure serial port

```bash
cp backend/.env.example backend/.env
# Edit .env → set SERIAL_PORT to your Arduino port:
# Windows: COM3, COM4, …
# Linux:   /dev/ttyUSB0, /dev/ttyACM0
# macOS:   /dev/cu.usbmodem…
```

### Step 4 – Upload Arduino sketch

1. Open `arduino/fruit_sensor.ino` in **Arduino IDE**
2. Install library: `DHT sensor library` by Adafruit (+ Adafruit Unified Sensor)
3. Select **Board: Arduino UNO** and correct **Port**
4. Upload → Open Serial Monitor @ 9600 baud to verify output

### Step 5 – Run backend

```bash
source venv/bin/activate   # or venv\Scripts\activate on Windows
cd backend
python app.py
```

Expected output:
```
2024-01-15 10:23:45 [INFO] Loading CNN model from best_fruit_model_resnet50.pth …
2024-01-15 10:23:47 [INFO] CNN model loaded. Classes: ['Apple', 'Banana', 'Grape', 'Mango', 'Strawberry']
2024-01-15 10:23:47 [INFO] Loading ML models from fruit_quality_models.pkl …
2024-01-15 10:23:47 [INFO] ML models loaded.
2024-01-15 10:23:47 [INFO] Opening serial port COM3 @ 9600 baud …
2024-01-15 10:23:49 [INFO] Serial connected.
2024-01-15 10:23:49 [INFO] Server listening on http://127.0.0.1:5000
```

### Step 6 – Run frontend

```bash
cd frontend   # your existing React project
npm install
npm start
```

Open **http://localhost:3000**

---

## 🔌 Arduino Wiring

```
Arduino UNO
    ┌──────────────────────────────┐
    │  5V ──────┬──┬──┬──┬────── │
    │           │  │  │  │       │
    │          MQ3 MQ5 MQ135 DHT11│
    │  GND ─────┴──┴──┴──┴────── │
    │                             │
    │  A0 ──── MQ3  AOUT          │
    │  A1 ──── MQ5  AOUT          │
    │  A2 ──── MQ135 AOUT         │
    │  D2 ──── DHT11 DATA (+ 10kΩ pull-up to 5V)
    └──────────────────────────────┘
```

**DHT11 pull-up resistor:** Connect a 10kΩ resistor between the DATA pin and 5V.

---

## 📡 API Reference

### `POST /analyze`

**Request:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**Response:**
```json
{
  "fruit": "Banana",
  "confidence": 92.5,
  "sensors": {
    "ethylene":    { "value": 320, "unit": "ppm", "safe": [0, 500], "label": "Ethylene (MQ3)", "icon": "🌿" },
    "ammonia":     { "value": 210, "unit": "ppm", "safe": [0, 400], "label": "Ammonia/Gas (MQ5)", "icon": "⚗️" },
    "co2":         { "value": 270, "unit": "ppm", "safe": [0, 600], "label": "CO₂ (MQ135)", "icon": "💨" },
    "temperature": { "value": 28.5, "unit": "°C", "safe": [15, 35], "label": "Temperature", "icon": "🌡️" },
    "humidity":    { "value": 65.0, "unit": "%",  "safe": [40, 80], "label": "Humidity", "icon": "💧" },
    "voc":         { "value": 180, "unit": "ppm", "safe": [0, 300], "label": "VOC (MQ135)", "icon": "🔬" }
  },
  "prediction": {
    "label":       "Chemically Ripened",
    "edible":      false,
    "confidence":  93.2,
    "naturalProb": 10,
    "chemicalProb": 90,
    "risk":        "High",
    "flags":       ["High chemical ripening gas detected"],
    "model":       "FruitSense-CNN v2.1",
    "processedAt": "2024-01-15T10:23:50Z"
  },
  "validity": {
    "harvestedDaysAgo":  8,
    "chemicalShelfDays": 4,
    "storageAdvice":     "Best consumed within 3 days. Refrigerate to extend life.",
    "consume":           true,
    "stages":            ["Green", "Yellow-green", "Yellow", "Spotted/Brown"]
  },
  "nutrition": {
    "calories": 89, "carbs": 22.8, "sugar": 12.2,
    "fiber": 2.6,   "vitC":  8.7,  "vitA":  64
  }
}
```

### `GET /health`

Returns server status, Arduino connection state, and model availability.

---

## 🧪 Testing

Test without React frontend:

```bash
# Basic test (dummy image, simulated sensors)
python backend/test_backend.py

# With a real fruit image
python backend/test_backend.py photos/banana.jpg
```

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| `No module named 'torch'` | Run `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
| `No module named 'serial'` | Run `pip install pyserial` |
| Arduino not detected | Check Device Manager (Windows) or `ls /dev/tty*` (Linux). Try different USB cable. |
| `InconsistentVersionWarning` (sklearn) | Install exactly `scikit-learn==1.6.1` |
| CORS error in browser | Ensure `flask-cors` is installed and `CORS(app)` is in app.py |
| Port already in use | Kill other Flask processes: `pkill -f app.py` (Linux) or Task Manager |
| CNN gives wrong fruit | Ensure image is well-lit, fruit fills most of frame |
| Sensor values all 0 | Check `SERIAL_PORT` in `.env`. Try Arduino Serial Monitor to verify output. |

---

## 🧠 Model Details

### CNN (best_fruit_model_resnet50.pth)
- **Architecture:** ResNet50
- **Classes:** Apple, Banana, Grape, Mango, Strawberry
- **Input:** 224×224 RGB, normalized with ImageNet stats
- **Output:** class probabilities via softmax

### ML Ensemble (fruit_quality_models.pkl)
- **Algorithm:** RandomForest (multiple classifiers + 1 regressor)
- **Features (10):** `mq3, mq5, mq135, temperature, humidity, gas_intensity, fermentation_index, spoilage_index, env_factor, fruit_enc`
- **Outputs:**
  - `clf_edible` → 0 (not edible) / 1 (edible)
  - `clf_safe` → 0 (unsafe) / 1 (safe)
  - `clf_condition` → Fresh / Ripe / Overripe / Rotten
  - `clf_ripening` → Natural / Chemical
  - `reg_shelf` → shelf life in days (regression)

### Sensor → Gas Mapping
| Sensor | Gas | Frontend Key |
|--------|-----|-------------|
| MQ3 | Ethylene / Alcohol | `ethylene` |
| MQ5 | Ammonia / LPG | `ammonia` |
| MQ135 × 0.6 | CO₂ | `co2` |
| MQ135 × 0.4 | VOC | `voc` |
| DHT11 | Temperature | `temperature` |
| DHT11 | Humidity | `humidity` |

---

## 🔄 System Flow

```
📷 React captures image (base64)
         ↓
🌐 POST /analyze { image: base64 }
         ↓
🐍 Flask backend
    ├── base64 → PIL Image → ResNet50 → fruit_label + confidence
    ├── Serial port → Arduino → mq3, mq5, mq135, temp, humidity
    │   (or simulated values if Arduino disconnected)
    └── [mq3,mq5,mq135,temp,hum, gas_intensity, fermentation_index,
         spoilage_index, env_factor, fruit_enc]
              → RandomForest ensemble
              → edible, safe, condition, ripening, shelf_life
         ↓
📊 Structured JSON response → React UI renders results
```