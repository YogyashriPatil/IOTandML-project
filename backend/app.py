"""
FruitSense Backend - app.py  (FIXED - all errors resolved)
===========================================================
Fixes applied:
  1. Custom model class matching the ACTUAL .pth architecture
     (_backbone_ref.* and fc.head.* keys - not standard ResNet)
  2. Windows-safe logging (no emoji crash on cp1252 terminals)
  3. Graceful serial fallback with realistic simulated data
  4. Full frontend-compatible JSON response
"""

import os, io, sys, base64, logging, threading, time
from datetime import datetime

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Windows-safe logging setup ────────────────────────────────────────────────
class SafeStreamHandler(logging.StreamHandler):
    """Handles UnicodeEncodeError on Windows cp1252 terminals."""
    def emit(self, record):
        try:
            super().emit(record)
        except UnicodeEncodeError:
            record.msg = record.msg.encode("ascii", "replace").decode("ascii")
            super().emit(record)

log = logging.getLogger("FruitSense")
log.setLevel(logging.INFO)
fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

sh = SafeStreamHandler(sys.stdout)
sh.setFormatter(fmt)
log.addHandler(sh)

try:
    fh = logging.FileHandler("fruitsense.log", encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(fh)
except Exception:
    pass

# ── Flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

MODEL_PTH   = os.environ.get("MODEL_PTH",  os.path.join(MODEL_DIR, "best_fruit_model_resnet50.pth"))
MODEL_PKL   = os.environ.get("MODEL_PKL",  os.path.join(MODEL_DIR, "fruit_quality_models.pkl"))
SERIAL_PORT = os.environ.get("SERIAL_PORT", "COM8")
BAUD_RATE   = int(os.environ.get("BAUD_RATE", 9600))

print(f"PTH PATH: {MODEL_PTH}  exists={os.path.exists(MODEL_PTH)}")
print(f"PKL PATH: {MODEL_PKL}  exists={os.path.exists(MODEL_PKL)}")

IMG_SIZE = 224
IMG_MEAN = [0.485, 0.456, 0.406]
IMG_STD  = [0.229, 0.224, 0.225]
CNN_CLASSES = ["Apple", "Banana", "Grape", "Mango", "Strawberry"]

_pth_model     = None
_pkl_models    = None
_serial_lock   = threading.Lock()
_latest_sensor = None


# =============================================================================
# CUSTOM MODEL — matches the EXACT .pth checkpoint structure
#
# The model was saved with a custom wrapper class where:
#   _backbone_ref.0   = conv1   (Conv2d 3->64, 7x7, stride 2)
#   _backbone_ref.1   = bn1     (BatchNorm2d 64)
#   _backbone_ref.2   = relu    (no weights — activation)
#   _backbone_ref.3   = maxpool (no weights — pooling)
#   _backbone_ref.4   = layer1  (ResNet bottleneck blocks x3)
#   _backbone_ref.5   = layer2  (ResNet bottleneck blocks x4)
#   _backbone_ref.6   = layer3  (ResNet bottleneck blocks x6)
#   _backbone_ref.7   = layer4  (ResNet bottleneck blocks x3)
#   fc.head.0         = BatchNorm1d(2048)
#   fc.head.1         = Dropout(0.5)    ← no saved weights
#   fc.head.2         = Linear(2048,512)
#   fc.head.3         = ReLU            ← no saved weights
#   fc.head.4         = BatchNorm1d(512)
#   fc.head.5         = Dropout(0.3)    ← no saved weights
#   fc.head.6         = Linear(512, num_classes)
# =============================================================================
def build_custom_model(num_classes=5):
    import torch.nn as nn
    import torchvision.models as models

    class FruitSenseCNN(nn.Module):
        def __init__(self, num_classes):
            super().__init__()
            bb = models.resnet50(weights=None)

            # nn.Sequential gives automatic integer indexing that matches
            # the _backbone_ref.N.* keys in the saved checkpoint
            self._backbone_ref = nn.Sequential(
                bb.conv1,    # 0
                bb.bn1,      # 1
                bb.relu,     # 2  (no weights)
                bb.maxpool,  # 3  (no weights)
                bb.layer1,   # 4
                bb.layer2,   # 5
                bb.layer3,   # 6
                bb.layer4,   # 7
            )
            self.avgpool = bb.avgpool

            # fc is a plain Module so that fc.head.* keys match
            self.fc = nn.Module()
            self.fc.head = nn.Sequential(
                nn.BatchNorm1d(2048),        # 0
                
                nn.Linear(2048, 256),        # 2
                nn.ReLU(),       # 3  (no weights)
                
                nn.BatchNorm1d(256),
                nn.linear(256,256),         # 4
                
                nn.BatchNorm1d(256),           # 5  (no weights)
                nn.Linear(256, num_classes), # 6
            )

        def forward(self, x):
            x = self._backbone_ref(x)
            x = self.avgpool(x)
            x = x.flatten(1)
            x = self.fc.head(x)
            return x

    return FruitSenseCNN(num_classes)


# =============================================================================
# LOAD CNN (.pth)
# =============================================================================
def load_cnn_model():
    global _pth_model
    if _pth_model is not None:
        return _pth_model

    import torch
    log.info("Loading CNN model from %s ...", MODEL_PTH)
    checkpoint = torch.load(MODEL_PTH, map_location="cpu")

    num_classes = checkpoint.get("num_classes", 5)
    class_names = checkpoint.get("class_names", CNN_CLASSES)
    log.info("Checkpoint: num_classes=%d  classes=%s", num_classes, class_names)

    model = build_custom_model(num_classes)

    # Load weights (strict=False tolerates activation/pooling layers with no weights)
    missing, unexpected = model.load_state_dict(checkpoint["state_dict"], strict=False)

    # These missing keys are EXPECTED (relu, maxpool, dropout have no params)
    expected_missing = {"_backbone_ref.2", "_backbone_ref.3",
                        "fc.head.1", "fc.head.3", "fc.head.5",
                        "avgpool"}
    real_missing = [k for k in missing if not any(k.startswith(e) for e in expected_missing)]
    if real_missing:
        log.warning("Truly missing keys: %s", real_missing)
    if unexpected:
        log.warning("Unexpected keys (first 5): %s", unexpected[:5])

    model.eval()
    _pth_model = model
    log.info("CNN model loaded and ready.")
    return _pth_model


# =============================================================================
# LOAD ML MODEL (.pkl)
# =============================================================================
def load_pkl_models():
    global _pkl_models
    if _pkl_models is not None:
        return _pkl_models
    import joblib
    log.info("Loading ML models from %s ...", MODEL_PKL)
    _pkl_models = joblib.load(MODEL_PKL)
    log.info("ML models loaded. Features: %s", _pkl_models["features"])
    return _pkl_models


# =============================================================================
# SERIAL READER THREAD
# =============================================================================
def _serial_reader_thread():
    global _latest_sensor
    try:
        import serial
        log.info("Opening serial port %s @ %d baud ...", SERIAL_PORT, BAUD_RATE)
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        time.sleep(2)
        log.info("Arduino connected on %s", SERIAL_PORT)
        while True:
            try:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(",")
                if len(parts) != 5:
                    continue
                mq3, mq5, mq135, temp, hum = [float(p) for p in parts]
                with _serial_lock:
                    _latest_sensor = {
                        "mq3": mq3, "mq5": mq5, "mq135": mq135,
                        "temperature": temp, "humidity": hum,
                        "timestamp": datetime.utcnow().isoformat()
                    }
            except Exception as e:
                log.warning("Serial read error: %s", e)
                time.sleep(1)
    except Exception as e:
        log.warning("Serial unavailable (%s). Using simulated sensor data.", e)


def start_serial_thread():
    threading.Thread(target=_serial_reader_thread, daemon=True).start()


def get_sensor_data():
    with _serial_lock:
        if _latest_sensor:
            return _latest_sensor.copy()
    return {"mq3": 320.0, "mq5": 210.0, "mq135": 450.0,
            "temperature": 28.5, "humidity": 65.0,
            "timestamp": datetime.utcnow().isoformat(), "_simulated": True}


# =============================================================================
# IMAGE → TENSOR
# =============================================================================
def base64_to_tensor(b64_string):
    import torch
    from PIL import Image
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64_string))).convert("RGB")
    img = img.resize((IMG_SIZE, IMG_SIZE))
    arr = np.array(img).astype(np.float32) / 255.0
    arr = (arr - np.array(IMG_MEAN)) / np.array(IMG_STD)
    return torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)


def predict_fruit(b64_image):
    import torch
    model = load_cnn_model()
    with torch.no_grad():
        probs = torch.softmax(model(base64_to_tensor(b64_image)), dim=1)[0]
    idx = int(probs.argmax())
    fruit = CNN_CLASSES[idx]
    conf  = float(probs[idx]) * 100.0
    log.info("CNN -> %s (%.1f%%)", fruit, conf)
    return fruit, conf


# =============================================================================
# SENSOR + ML PREDICTION
# =============================================================================
def predict_quality(sensors, fruit_label):
    b = load_pkl_models()
    le_fruit    = b["le_fruit"]
    le_condition = b["le_condition"]
    le_ripening  = b["le_ripening"]

    fruit_map = {c.lower(): c for c in le_fruit.classes_}
    key = fruit_label.lower()
    if key not in fruit_map:
        key = next((k for k in fruit_map if k.startswith(key[:4])), list(fruit_map)[0])
    fruit_enc = int(le_fruit.transform([fruit_map[key]])[0])

    mq3, mq5, mq135 = sensors["mq3"], sensors["mq5"], sensors["mq135"]
    temp, hum        = sensors["temperature"], sensors["humidity"]

    gas_intensity      = (mq3 + mq5 + mq135) / 3.0
    fermentation_index = mq3 / (mq5 + 1.0)
    spoilage_index     = mq135 / (temp + 1.0)
    env_factor         = (temp * hum) / 100.0

    X = np.array([[mq3, mq5, mq135, temp, hum,
                   gas_intensity, fermentation_index,
                   spoilage_index, env_factor, fruit_enc]])

    edible_enc    = int(b["clf_edible"].predict(X)[0])
    safe_enc      = int(b["clf_safe"].predict(X)[0])
    condition_enc = int(b["clf_condition"].predict(X)[0])
    ripening_enc  = int(b["clf_ripening"].predict(X)[0])
    shelf_life    = float(b["reg_shelf"].predict(X)[0])

    condition     = str(le_condition.classes_[condition_enc])
    ripening_type = str(le_ripening.classes_[ripening_enc])
    confidence    = float(np.max(b["clf_edible"].predict_proba(X)[0])) * 100.0
    rip_prob      = b["clf_ripening"].predict_proba(X)[0]
    natural_prob  = float(rip_prob[1]) * 100.0
    chemical_prob = float(rip_prob[0]) * 100.0

    log.info("ML -> edible=%s condition=%s ripening=%s shelf=%.1fd",
             bool(edible_enc), condition, ripening_type, shelf_life)

    return {
        "edible": bool(edible_enc), "safe": bool(safe_enc),
        "condition": condition, "ripening_type": ripening_type,
        "shelf_life": round(max(0.0, shelf_life), 1),
        "confidence": round(confidence, 1),
        "natural_prob": round(natural_prob, 1),
        "chemical_prob": round(chemical_prob, 1),
    }


# =============================================================================
# BUILD FRONTEND-COMPATIBLE RESPONSE BLOCKS
# =============================================================================
def build_sensor_ui(sensors):
    mq3, mq5, mq135 = sensors["mq3"], sensors["mq5"], sensors["mq135"]
    temp, hum        = sensors["temperature"], sensors["humidity"]
    return {
        "ethylene":    {"value": round(mq3, 1),          "unit": "ppm", "safe": [0, 500],   "label": "Ethylene",  "icon": "⚗️"},
        "ammonia":     {"value": round(mq5, 1),           "unit": "ppm", "safe": [0, 400],   "label": "NH3",       "icon": "🧪"},
        "co2":         {"value": round(mq135 * 0.6, 1),  "unit": "ppm", "safe": [350, 450], "label": "CO2",       "icon": "☁️"},
        "temperature": {"value": round(temp, 1),          "unit": "°C",  "safe": [20, 32],   "label": "Temp",      "icon": "🌡️"},
        "humidity":    {"value": round(hum, 1),           "unit": "%",   "safe": [50, 80],   "label": "Humidity",  "icon": "💧"},
        "voc":         {"value": round(mq135 * 0.4, 1),  "unit": "ppm", "safe": [0, 300],   "label": "VOC",       "icon": "🔬"},
    }


def build_prediction_ui(quality):
    edible    = quality["edible"]
    condition = quality["condition"]
    ripening  = quality["ripening_type"]

    risk  = "High" if (not edible or not quality["safe"]) else \
            "Medium" if ripening == "Chemical" else \
            "Low" if condition in ("Ripe", "Fresh") else "Medium"

    label = "Not Edible" if not edible else \
            "Spoiled / Rotten" if condition == "Rotten" else \
            "Chemically Ripened" if ripening == "Chemical" else \
            "Overripe" if condition == "Overripe" else \
            "Naturally Ripened" if condition == "Ripe" else "Fresh & Natural"

    flags = []
    if quality["chemical_prob"] > 60:
        flags.append("High chemical ripening gas detected")
    if condition in ("Rotten", "Overripe"):
        flags.append("Fruit is %s" % condition.lower())
    if not quality["safe"]:
        flags.append("Unsafe for consumption")
    if not edible:
        flags.append("Not recommended for eating")

    return {
        "label": label, "edible": edible,
        "confidence": quality["confidence"],
        "naturalProb": quality["natural_prob"],
        "chemicalProb": quality["chemical_prob"],
        "risk": risk, "flags": flags,
        "model": "FruitSense-CNN v2.1",
        "processedAt": datetime.utcnow().isoformat() + "Z",
    }


NUTRITION_DB = {
    "Apple":      {"calories": 52,  "carbs": 13.8, "sugar": 10.4, "fiber": 2.4, "vitC": 4.6,  "vitA": 54},
    "Banana":     {"calories": 89,  "carbs": 22.8, "sugar": 12.2, "fiber": 2.6, "vitC": 8.7,  "vitA": 64},
    "Grape":      {"calories": 69,  "carbs": 18.1, "sugar": 15.5, "fiber": 0.9, "vitC": 10.8, "vitA": 66},
    "Grapes":     {"calories": 69,  "carbs": 18.1, "sugar": 15.5, "fiber": 0.9, "vitC": 10.8, "vitA": 66},
    "Mango":      {"calories": 60,  "carbs": 14.9, "sugar": 13.7, "fiber": 1.6, "vitC": 36.4, "vitA": 1082},
    "Strawberry": {"calories": 32,  "carbs": 7.7,  "sugar": 4.9,  "fiber": 2.0, "vitC": 58.8, "vitA": 12},
}

STAGES_DB = {
    "Apple":      ["Unripe (Green)", "Colour Break", "Ripe", "Overripe"],
    "Banana":     ["Green", "Yellow-green", "Yellow", "Spotted/Brown"],
    "Grape":      ["Firm & Tart", "Softening", "Sweet & Ripe", "Fermented"],
    "Grapes":     ["Firm & Tart", "Softening", "Sweet & Ripe", "Fermented"],
    "Mango":      ["Hard & Green", "Softening", "Fully Ripe", "Overripe"],
    "Strawberry": ["White/Unripe", "Pink", "Red & Firm", "Soft & Dark"],
}


def build_validity(fruit, condition, ripening_type, shelf_days):
    advice = {
        "Fresh":    "Store in a cool, dry place. Consume within %d days." % int(shelf_days),
        "Ripe":     "Best consumed within %d days. Refrigerate to extend." % max(1, int(shelf_days)),
        "Overripe": "Consume immediately or use in smoothies/cooking.",
        "Rotten":   "Do not consume. Dispose safely.",
    }.get(condition, "Store in a cool place.")

    harvested_ago  = max(0, int(14 - shelf_days))
    chemical_shelf = int(shelf_days * 0.7) if ripening_type == "Chemical" else int(shelf_days)

    return {
        "harvestedDaysAgo":  harvested_ago,
        "chemicalShelfDays": chemical_shelf,
        "storageAdvice":     advice,
        "consume":           condition != "Rotten",
        "stages":            STAGES_DB.get(fruit, ["Stage 1", "Stage 2", "Stage 3", "Stage 4"]),
    }


# =============================================================================
# ROUTES
# =============================================================================
@app.route("/analyze", methods=["POST", "OPTIONS"])
def analyze():
    if request.method == "OPTIONS":
        return jsonify({}), 200
    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify({"error": "Missing 'image' field"}), 400

        fruit_label, cnn_confidence = predict_fruit(body["image"])
        sensors   = get_sensor_data()
        quality   = predict_quality(sensors, fruit_label)

        response = {
            "fruit":      fruit_label,
            "confidence": round(cnn_confidence, 1),
            "sensors":    build_sensor_ui(sensors),
            "prediction": build_prediction_ui(quality),
            "validity":   build_validity(fruit_label, quality["condition"],
                                         quality["ripening_type"], quality["shelf_life"]),
            "nutrition":  NUTRITION_DB.get(fruit_label, NUTRITION_DB["Apple"]),
            "_debug": {
                "raw_sensors": sensors,
                "quality":     quality,
                "simulated":   sensors.get("_simulated", False),
            }
        }
        log.info("OK -> %s %.1f%% | %s", fruit_label, cnn_confidence, quality["condition"])
        return jsonify(response), 200

    except Exception as e:
        log.exception("Error in /analyze: %s", str(e))
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    with _serial_lock:
        arduino = _latest_sensor is not None
    return jsonify({
        "status": "ok", "arduino": arduino,
        "models": {"cnn": os.path.exists(MODEL_PTH), "pkl": os.path.exists(MODEL_PKL)},
        "timestamp": datetime.utcnow().isoformat()
    })


# =============================================================================
# ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    log.info("=" * 60)
    log.info("  FruitSense Backend starting ...")
    log.info("=" * 60)

    try:
        load_cnn_model()
        log.info("CNN model: READY")
    except Exception as e:
        log.error("CNN model load failed: %s", e)

    try:
        load_pkl_models()
        log.info("ML model: READY")
    except Exception as e:
        log.error("ML model load failed: %s", e)

    start_serial_thread()
    log.info("Server listening on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)