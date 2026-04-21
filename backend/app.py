import io
import os
import sys
import base64
import logging
import threading
import time
import uuid
import warnings
from collections import deque
from datetime import datetime

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", message=".*InconsistentVersionWarning.*")

# ── Windows-safe logging ──────────────────────────────────────────────────────
class SafeStreamHandler(logging.StreamHandler):
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

app = Flask(__name__)
CORS(app)

# ── Paths & constants ─────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR   = os.path.join(BASE_DIR, "model")
MODEL_PTH   = os.environ.get("MODEL_PTH",  os.path.join(MODEL_DIR, "best_fruit_model_resnet50.pth"))
MODEL_PKL   = os.environ.get("MODEL_PKL",  os.path.join(MODEL_DIR, "fruit_quality_models.pkl"))
SERIAL_PORT = os.environ.get("SERIAL_PORT", "COM8")
BAUD_RATE   = int(os.environ.get("BAUD_RATE", 115200))

IMG_SIZE    = 224
IMG_MEAN    = [0.485, 0.456, 0.406]
IMG_STD     = [0.229, 0.224, 0.225]
CNN_CLASSES = ["Apple", "Banana", "Grape", "Mango", "Strawberry"]

# ── Sensor-activation delay & collection window ───────────────────────────────
SENSOR_DELAY_S      = 15       # wait after image analysis before activating sensor
COLLECTION_WINDOW_S = 60       # 1 minute of sensor collection
READ_INTERVAL_S     = 2        # Arduino sends every ~1 s; we sample every 2 s

_pth_model  = None
_pkl_models = None

# ── Serial state ──────────────────────────────────────────────────────────────
_serial_lock   = threading.Lock()
_serial_obj    = None

# ── Sensor-activation gate (FIX: no startup reads) ───────────────────────────
_sensor_active     = False          # True ONLY after LED_ON is sent
_sensor_active_lock = threading.Lock()

# ── Per-session sensor buffer ─────────────────────────────────────────────────
# session_id → {
#   "fruit": str, "confidence": float,
#   "buffer": deque of raw reading dicts,
#   "activated_at": float (monotonic),
#   "done": bool,
#   "result": dict | None
# }
_sessions      = {}
_sessions_lock = threading.Lock()


# =============================================================================
# MODEL ARCHITECTURE
# =============================================================================

def build_model(num_classes: int = 5):
    import torch.nn as nn
    import torchvision.models as tvm

    class FruitSenseCNN(nn.Module):
        def __init__(self, nc):
            super().__init__()
            bb = tvm.resnet50(weights=None)
            self.conv1   = bb.conv1
            self.bn1     = bb.bn1
            self.relu    = bb.relu
            self.maxpool = bb.maxpool
            self.layer1  = bb.layer1
            self.layer2  = bb.layer2
            self.layer3  = bb.layer3
            self.layer4  = bb.layer4
            self.avgpool = bb.avgpool
            self.fc      = nn.Module()
            self.fc.head = nn.Sequential(
                nn.BatchNorm1d(2048),
                nn.Dropout(p=0.5),
                nn.Linear(2048, 256),
                nn.ReLU(inplace=True),
                nn.BatchNorm1d(256),
                nn.Dropout(p=0.3),
                nn.Linear(256, nc),
            )

        def forward(self, x):
            x = self.conv1(x); x = self.bn1(x); x = self.relu(x)
            x = self.maxpool(x)
            x = self.layer1(x); x = self.layer2(x)
            x = self.layer3(x); x = self.layer4(x)
            x = self.avgpool(x); x = x.flatten(1)
            return self.fc.head(x)

    return FruitSenseCNN(num_classes)


_EXPECTED_MISSING = frozenset({
    "relu", "maxpool", "avgpool",
    "fc.head.1", "fc.head.3", "fc.head.5",
})


def load_cnn_model():
    global _pth_model
    if _pth_model is not None:
        return _pth_model
    import torch
    log.info("Loading CNN from %s", MODEL_PTH)
    ckpt = torch.load(MODEL_PTH, map_location="cpu", weights_only=False)
    if isinstance(ckpt, dict) and "state_dict" in ckpt:
        num_classes = ckpt.get("num_classes", len(CNN_CLASSES))
        state_dict  = ckpt["state_dict"]
    else:
        num_classes = len(CNN_CLASSES)
        state_dict  = ckpt
    model = build_model(num_classes)
    missing, unexpected = model.load_state_dict(state_dict, strict=False)
    real_missing = [k for k in missing
                    if not any(k == e or k.startswith(e + ".") for e in _EXPECTED_MISSING)]
    if real_missing:  log.warning("Truly missing keys: %s", real_missing)
    if unexpected:    log.warning("Unexpected keys (first 10): %s", unexpected[:10])
    model = model.float().eval()
    _pth_model = model
    log.info("CNN loaded OK (%d classes)", num_classes)
    return _pth_model


def load_pkl_models():
    global _pkl_models
    if _pkl_models is not None:
        return _pkl_models
    import joblib
    log.info("Loading ML models from %s", MODEL_PKL)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        _pkl_models = joblib.load(MODEL_PKL)
    log.info("ML models loaded. Features: %s", _pkl_models.get("features"))
    return _pkl_models


# =============================================================================
# SERIAL — opens on startup but NEVER reads until sensor_active == True
# =============================================================================

def _open_serial():
    """
    Open the serial port and clear the RX buffer.
    Does NOT start reading — reading only begins after LED_ON is sent.
    """
    global _serial_obj
    with _serial_lock:
        if _serial_obj is not None and _serial_obj.is_open:
            return _serial_obj
    try:
        import serial
        log.info("Opening %s @ %d baud ...", SERIAL_PORT, BAUD_RATE)
        ser = serial.Serial(
            port     = SERIAL_PORT,
            baudrate = BAUD_RATE,
            timeout  = 0.5,
            dsrdtr   = False,
            rtscts   = False,
        )
        log.info("Waiting 2.5 s for Arduino boot + sensor warm-up ...")
        ser.setDTR(False)
        time.sleep(2.5)
        ser.flushInput()
        ser.reset_input_buffer()
        log.info("Serial port ready on %s @ %d baud (sensor INACTIVE — awaiting image upload)",
                 SERIAL_PORT, BAUD_RATE)
        with _serial_lock:
            _serial_obj = ser
    except Exception as exc:
        log.warning("Cannot open %s: %s", SERIAL_PORT, exc)
        with _serial_lock:
            _serial_obj = None
    with _serial_lock:
        return _serial_obj


def _send_serial_cmd(cmd: str):
    with _serial_lock:
        ser = _serial_obj
    if ser is None or not ser.is_open:
        log.warning("Serial not open — cannot send: %r", cmd.strip())
        return
    try:
        ser.write(cmd.encode("utf-8"))
        ser.flush()
        log.info("-> Arduino: %s", cmd.strip())
    except Exception as exc:
        log.warning("Serial write error: %s", exc)


def led_on():
    log.info("Turning LED ON — sensor activation in progress")
    _send_serial_cmd("LED_ON\n")


def led_off():
    log.info("Turning LED OFF")
    _send_serial_cmd("LED_OFF\n")


def _serial_reader_thread():
    """
    Continuously reads from the serial port.
    CRITICAL FIX: Lines are ONLY processed when _sensor_active is True.
    Timeout warnings are ONLY emitted when _sensor_active is True.
    No warnings appear at startup.
    """
    ser = _open_serial()
    if ser is None:
        log.warning("Serial reader thread exiting — port unavailable.")
        return

    log.info("Serial reader thread running (%s @ %d baud) — idle until sensor activated",
             SERIAL_PORT, BAUD_RATE)

    consecutive_empty = 0

    while True:
        try:
            raw = ser.readline()   # blocks up to timeout=0.5 s

            # ── Check if sensor is active BEFORE processing anything ──────────
            with _sensor_active_lock:
                active = _sensor_active

            if not raw:
                consecutive_empty += 1
                # CRITICAL FIX: only warn when sensor is supposed to be active
                if active and consecutive_empty == 20:   # ~10 s at 0.5 s timeout
                    log.warning(
                        "No data from Arduino for ~10 s on %s while sensor is ACTIVE. "
                        "Is Arduino powered? Did LED_ON get received?",
                        SERIAL_PORT,
                    )
                continue

            consecutive_empty = 0
            line = raw.decode("utf-8", errors="ignore").strip()

            if not line:
                continue

            # Arduino debug lines — always log regardless of active state
            if line.startswith("#"):
                log.info("Arduino: %s", line)
                continue

            # CRITICAL FIX: discard all CSV data when sensor is inactive
            if not active:
                log.debug("Sensor inactive — discarding: %r", line)
                continue

            # Parse CSV: mq3,mq5,mq135,temperature,humidity
            parts = line.split(",")
            if len(parts) != 5:
                log.warning("Bad CSV (%d fields, expected 5): %r", len(parts), line)
                continue

            try:
                mq3, mq5, mq135, temp, hum = (float(p) for p in parts)
            except ValueError as ve:
                log.warning("CSV parse error (%s) for line: %r", ve, line)
                continue

            reading = {
                "mq3":         mq3,
                "mq5":         mq5,
                "mq135":       mq135,
                "temperature": temp,
                "humidity":    hum,
                "timestamp":   datetime.utcnow().isoformat(),
            }

            log.info("Sensor <- mq3=%.0f  mq5=%.0f  mq135=%.0f  t=%.1f°C  h=%.1f%%",
                     mq3, mq5, mq135, temp, hum)

            # Distribute reading to all active sessions
            with _sessions_lock:
                for sid, sess in _sessions.items():
                    if not sess["done"]:
                        sess["buffer"].append(reading)

        except Exception as exc:
            log.warning("Serial read error: %s", exc)
            time.sleep(1)


def start_serial_thread():
    """
    Open the port eagerly (so we catch connection errors early) but
    do NOT set _sensor_active — that happens only after image analysis.
    """
    _open_serial()
    t = threading.Thread(target=_serial_reader_thread, daemon=True, name="SerialReader")
    t.start()
    log.info("Serial reader thread started (sensor gate CLOSED — awaiting image upload)")


# =============================================================================
# SESSION LIFECYCLE THREAD
# =============================================================================

def _session_lifecycle_thread(session_id: str):
    """
    Non-blocking lifecycle manager for one analysis session:

      T+0   s  — thread starts (image already analyzed by Flask route)
      T+15  s  — send LED_ON, open sensor gate
      T+615 s  — close sensor gate, send LED_OFF, compute result
    """
    global _sensor_active

    log.info("[%s] Lifecycle: waiting %d s before activating sensor ...",
             session_id, SENSOR_DELAY_S)

    # ── Phase 1: Pre-activation delay (non-blocking sleep) ───────────────────
    time.sleep(SENSOR_DELAY_S)

    # Mark session as now collecting
    with _sessions_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            log.warning("[%s] Session disappeared before activation", session_id)
            return
        sess["activated_at"] = time.monotonic()

    # Open sensor gate and send LED_ON
    with _sensor_active_lock:
        _sensor_active = True
    led_on()
    log.info("[%s] Sensor ACTIVATED — collecting for %d s (1 min)", session_id, COLLECTION_WINDOW_S)

    # ── Phase 2: Collection window ───────────────────────────────────────────
    time.sleep(COLLECTION_WINDOW_S)

    # Close sensor gate and turn LED off
    with _sensor_active_lock:
        _sensor_active = False
    led_off()
    log.info("[%s] Collection window complete — processing buffer", session_id)

    # ── Phase 3: Average buffer & run ML ────────────────────────────────────
    with _sessions_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            log.warning("[%s] Session missing at processing time", session_id)
            return
        buf = list(sess["buffer"])
        fruit_label = sess["fruit"]
        cnn_conf    = sess["confidence"]

    if not buf:
        log.error("[%s] Buffer is empty — no sensor data collected", session_id)
        with _sessions_lock:
            if session_id in _sessions:
                _sessions[session_id]["done"]  = True
                _sessions[session_id]["error"] = "No sensor data collected during the 10-minute window."
        return

    # Average raw readings
    avg = {
        "mq3":         float(np.mean([r["mq3"]         for r in buf])),
        "mq5":         float(np.mean([r["mq5"]         for r in buf])),
        "mq135":       float(np.mean([r["mq135"]       for r in buf])),
        "temperature": float(np.mean([r["temperature"] for r in buf])),
        "humidity":    float(np.mean([r["humidity"]    for r in buf])),
        "sample_count": len(buf),
    }
    log.info("[%s] Averaged %d readings: mq3=%.1f mq5=%.1f mq135=%.1f t=%.1f h=%.1f",
             session_id, len(buf),
             avg["mq3"], avg["mq5"], avg["mq135"], avg["temperature"], avg["humidity"])

    quality = predict_quality(avg, fruit_label)
    result  = {
        "fruit":      fruit_label,
        "confidence": cnn_conf,
        "sensors":    build_sensor_ui(avg),
        "prediction": build_prediction_ui(quality),
        "validity":   build_validity(fruit_label, quality["condition"],
                                     quality["ripening_type"], quality["shelf_life"]),
        "nutrition":  NUTRITION_DB.get(fruit_label, NUTRITION_DB["Apple"]),
        "sample_count": len(buf),
    }

    with _sessions_lock:
        if session_id in _sessions:
            _sessions[session_id]["done"]   = True
            _sessions[session_id]["result"] = result

    log.info("[%s] Lifecycle complete — result stored", session_id)


# =============================================================================
# IMAGE PIPELINE
# =============================================================================

def base64_to_tensor(b64_string: str):
    import torch
    from PIL import Image
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64_string))).convert("RGB")
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - np.array(IMG_MEAN, dtype=np.float32)) / np.array(IMG_STD, dtype=np.float32)
    tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    return tensor.float()


def predict_fruit(b64_image: str):
    import torch
    model  = load_cnn_model()
    tensor = base64_to_tensor(b64_image)
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    idx   = int(probs.argmax())
    label = CNN_CLASSES[idx]
    conf  = float(probs[idx]) * 100.0
    log.info("CNN -> %s  (%.1f%%)", label, conf)
    return label, conf


# =============================================================================
# FEATURE ENGINEERING + QUALITY PREDICTION
# =============================================================================
# Required ML input features (in exact order):
# ['mq3', 'mq5', 'mq135', 'temperature', 'humidity',
#  'gas_intensity', 'fermentation_index', 'spoilage_index', 'env_factor', 'fruit_enc']

_CNN_TO_LE = {"grape": "Grapes"}


def _compute_features(sensors: dict, fruit_enc: int) -> np.ndarray:
    """
    Compute ALL 10 features required by the ML model.

    Raw sensor values (from Arduino):
        mq3, mq5, mq135, temperature, humidity

    Derived features (computed here — MUST match training-time formulas):
        gas_intensity      = mq3 + mq5 + mq135
        fermentation_index = mq135 / (mq3 + 1e-6)
        spoilage_index     = mq5  / (mq3 + 1e-6)
        env_factor         = temperature * humidity

    Encoded label:
        fruit_enc          = LabelEncoder.transform(fruit_name)
    """
    mq3   = sensors["mq3"]
    mq5   = sensors["mq5"]
    mq135 = sensors["mq135"]
    temp  = sensors["temperature"]
    hum   = sensors["humidity"]

    gas_intensity      = mq3 + mq5 + mq135
    fermentation_index = mq135 / (mq3 + 1e-6)
    spoilage_index     = mq5  / (mq3 + 1e-6)
    env_factor         = temp * hum

    feature_vector = np.array([[
        mq3, mq5, mq135, temp, hum,
        gas_intensity, fermentation_index,
        spoilage_index, env_factor, fruit_enc
    ]], dtype=np.float32)

    log.info(
        "Features: mq3=%.1f mq5=%.1f mq135=%.1f t=%.1f h=%.1f | "
        "gas=%.1f ferm=%.4f spoil=%.4f env=%.1f enc=%d",
        mq3, mq5, mq135, temp, hum,
        gas_intensity, fermentation_index, spoilage_index, env_factor, fruit_enc
    )
    return feature_vector


def predict_quality(sensors: dict, fruit_label: str) -> dict:
    b            = load_pkl_models()
    le_fruit     = b["le_fruit"]
    le_condition = b["le_condition"]
    le_ripening  = b["le_ripening"]

    # Resolve fruit label against the LabelEncoder classes
    key     = fruit_label.lower()
    le_name = _CNN_TO_LE.get(key, fruit_label)
    le_low  = {c.lower(): c for c in le_fruit.classes_}
    if le_name.lower() not in le_low:
        le_name = next(
            (le_low[k] for k in le_low if k.startswith(key[:4])),
            list(le_fruit.classes_)[0],
        )
    else:
        le_name = le_low[le_name.lower()]

    fruit_enc = int(le_fruit.transform([le_name])[0])
    log.info("fruit_enc for '%s' -> %d  (LE class: '%s')", fruit_label, fruit_enc, le_name)

    # Build the feature matrix with all 10 features
    X = _compute_features(sensors, fruit_enc)

    # Run all ML models
    edible_enc    = int(b["clf_edible"].predict(X)[0])
    safe_enc      = int(b["clf_safe"].predict(X)[0])
    condition_enc = int(b["clf_condition"].predict(X)[0])
    ripening_enc  = int(b["clf_ripening"].predict(X)[0])
    shelf_life    = float(b["reg_shelf"].predict(X)[0])
    condition     = str(le_condition.classes_[condition_enc])
    ripening_type = str(le_ripening.classes_[ripening_enc])
    confidence    = float(np.max(b["clf_edible"].predict_proba(X)[0])) * 100.0
    rip_prob      = b["clf_ripening"].predict_proba(X)[0]

    log.info("ML -> edible=%s  condition=%s  ripening=%s  shelf=%.1fd",
             bool(edible_enc), condition, ripening_type, shelf_life)

    return {
        "edible":        bool(edible_enc),
        "safe":          bool(safe_enc),
        "condition":     condition,
        "ripening_type": ripening_type,
        "shelf_life":    round(max(0.0, shelf_life), 1),
        "confidence":    round(confidence, 1),
        "natural_prob":  round(float(rip_prob[1]) * 100.0, 1),
        "chemical_prob": round(float(rip_prob[0]) * 100.0, 1),
    }


# =============================================================================
# RESPONSE BUILDERS
# =============================================================================

# def build_sensor_ui(sensors: dict) -> dict:
#     mq3, mq5, mq135 = sensors["mq3"], sensors["mq5"], sensors["mq135"]
#     temp, hum        = sensors["temperature"], sensors["humidity"]
#     return {
#         "ethylene":    {"value": round(mq3, 1),         "unit": "ppm", "safe": [0, 500],   "label": "Ethylene",  "icon": "⚗️"},
#         "ammonia":     {"value": round(mq5, 1),          "unit": "ppm", "safe": [0, 400],   "label": "NH3",       "icon": "🧪"},
#         "co2":         {"value": round(mq135 * 0.6, 1), "unit": "ppm", "safe": [350, 450], "label": "CO2",       "icon": "☁️"},
#         "temperature": {"value": round(temp, 1),         "unit": "°C",  "safe": [20, 32],   "label": "Temp",      "icon": "🌡️"},
#         "humidity":    {"value": round(hum, 1),          "unit": "%",   "safe": [50, 80],   "label": "Humidity",  "icon": "💧"},
#         "voc":         {"value": round(mq135 * 0.4, 1), "unit": "ppm", "safe": [0, 300],   "label": "VOC",       "icon": "🔬"},
#     }

def build_sensor_ui(sensors: dict) -> dict:
    mq3, mq5, mq135 = sensors["mq3"], sensors["mq5"], sensors["mq135"]
    temp, hum        = sensors["temperature"], sensors["humidity"]

    return {
        "alcohol":    {"value": round(mq3, 1), "unit": "ppm", "safe": [0, 300], "label": "Alcohol", "icon": "🍺"},
        "ammonia":    {"value": round(mq5, 1), "unit": "ppm", "safe": [0, 400], "label": "NH3", "icon": "🧪"},
        "co2":        {"value": round(mq135 * 0.6, 1), "unit": "ppm", "safe": [350, 450], "label": "CO2", "icon": "☁️"},
        "voc":        {"value": round(mq135 * 0.4, 1), "unit": "ppm", "safe": [0, 300], "label": "VOC", "icon": "🔬"},
        "temperature":{"value": round(temp, 1), "unit": "°C", "safe": [20, 32], "label": "Temp", "icon": "🌡️"},
        "humidity":   {"value": round(hum, 1), "unit": "%", "safe": [50, 80], "label": "Humidity", "icon": "💧"},
    }
def build_prediction_ui(quality: dict) -> dict:
    edible    = quality["edible"]
    condition = quality["condition"]
    ripening  = quality["ripening_type"]

    if not edible or not quality["safe"]:
        risk = "High"
    elif ripening == "Chemical":
        risk = "Medium"
    elif condition in ("Ripe", "Fresh"):
        risk = "Low"
    else:
        risk = "Medium"

    if not edible:                label = "Not Edible"
    elif condition == "Rotten":   label = "Spoiled / Rotten"
    elif ripening == "Chemical":  label = "Chemically Ripened"
    elif condition == "Overripe": label = "Overripe"
    elif condition == "Ripe":     label = "Naturally Ripened"
    else:                         label = "Fresh & Natural"

    flags = []
    if quality["chemical_prob"] > 60:        flags.append("High chemical ripening gas detected")
    if condition in ("Rotten", "Overripe"):  flags.append(f"Fruit is {condition.lower()}")
    if not quality["safe"]:                  flags.append("Unsafe for consumption")
    if not edible:                           flags.append("Not recommended for eating")

    return {
        "label":        label,
        "edible":       edible,
        "confidence":   quality["confidence"],
        "naturalProb":  quality["natural_prob"],
        "chemicalProb": quality["chemical_prob"],
        "risk":         risk,
        "flags":        flags,
        "model":        "FruitSense-CNN v2.1",
        "processedAt":  datetime.utcnow().isoformat() + "Z",
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


def build_validity(fruit: str, condition: str, ripening_type: str, shelf_days: float) -> dict:
    advice_map = {
        "Fresh":    f"Store in a cool, dry place. Consume within {int(shelf_days)} days.",
        "Ripe":     f"Best consumed within {max(1, int(shelf_days))} days. Refrigerate to extend.",
        "Overripe": "Consume immediately or use in smoothies / cooking.",
        "Rotten":   "Do not consume. Dispose safely.",
    }
    harvested_ago  = max(0, int(14 - shelf_days))
    chemical_shelf = int(shelf_days * 0.7) if ripening_type == "Chemical" else int(shelf_days)
    return {
        "harvestedDaysAgo":  harvested_ago,
        "chemicalShelfDays": chemical_shelf,
        "storageAdvice":     advice_map.get(condition, "Store in a cool place."),
        "consume":           condition != "Rotten",
        "stages":            STAGES_DB.get(fruit, ["Stage 1", "Stage 2", "Stage 3", "Stage 4"]),
    }


# =============================================================================
# ROUTES
# =============================================================================

@app.route("/analyze-image", methods=["POST", "OPTIONS"])
def analyze_image():
    """
    STEP 1 + 2: Receive base64 image → run CNN → start lifecycle thread.

    Returns immediately with session_id and fruit detection result.
    The 15-second delay + sensor collection happen in a background thread.
    Frontend polls /sensor-result for completion.
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify({"error": "Missing 'image' field in request body"}), 400

        fruit_label, cnn_conf = predict_fruit(body["image"])

        session_id = str(uuid.uuid4())

        # Register session BEFORE starting the lifecycle thread
        with _sessions_lock:
            _sessions[session_id] = {
                "fruit":        fruit_label,
                "confidence":   round(cnn_conf, 1),
                "buffer":       deque(maxlen=int(COLLECTION_WINDOW_S / READ_INTERVAL_S * 2)),
                "activated_at": None,
                "done":         False,
                "result":       None,
                "error":        None,
                "started_at":   time.monotonic(),
            }

        # Lifecycle thread: sleeps 15 s, activates sensor, collects 10 min, runs ML
        t = threading.Thread(
            target=_session_lifecycle_thread,
            args=(session_id,),
            daemon=True,
            name=f"Lifecycle-{session_id[:8]}",
        )
        t.start()

        log.info("analyze-image -> %s %.1f%%  session=%s  (sensor activates in %d s)",
                 fruit_label, cnn_conf, session_id, SENSOR_DELAY_S)

        return jsonify({
            "fruit":            fruit_label,
            "confidence":       round(cnn_conf, 1),
            "session_id":       session_id,
            "sensor_delay_s":   SENSOR_DELAY_S,
            "collection_s":     COLLECTION_WINDOW_S,
            "message":          (
                f"Fruit detected! Place {fruit_label} near the sensors within "
                f"{SENSOR_DELAY_S} seconds — LED will activate automatically."
            ),
        }), 200

    except Exception:
        log.exception("Error in /analyze-image")
        return jsonify({"error": "Internal server error — check fruitsense.log"}), 500


@app.route("/sensor-result", methods=["GET", "OPTIONS"])
def sensor_result():
    """
    STEP 7 + 8: Poll this endpoint for the final ML prediction result.

    Returns one of:
      { "status": "waiting_for_activation", "countdown_s": N }
      { "status": "collecting",             "elapsed_s":   N, "samples": N }
      { "status": "done",                   <full result>      }
      { "status": "error",                  "message": "..."   }

    Frontend should poll every 2–3 seconds.
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id query parameter"}), 400

    with _sessions_lock:
        sess = _sessions.get(session_id)

    if sess is None:
        return jsonify({"error": "Unknown session_id — call /analyze-image first"}), 404

    # Session errored out
    if sess.get("error"):
        return jsonify({"status": "error", "message": sess["error"]}), 200

    # Collection complete — return result
    if sess["done"] and sess["result"] is not None:
        result = dict(sess["result"])
        result["status"] = "done"
        # Cleanup old session to free memory (keep for 60 s in case of re-poll)
        return jsonify(result), 200

    now = time.monotonic()

    # Still in pre-activation delay
    if sess["activated_at"] is None:
        elapsed  = now - sess["started_at"]
        remaining = max(0, SENSOR_DELAY_S - elapsed)
        return jsonify({
            "status":      "waiting_for_activation",
            "countdown_s": round(remaining, 1),
            "message":     f"Place fruit near sensors — LED activates in {int(remaining)+1} s",
        }), 200

    # Actively collecting
    elapsed  = now - sess["activated_at"]
    remaining = max(0, COLLECTION_WINDOW_S - elapsed)
    with _sessions_lock:
        n_samples = len(sess["buffer"])
    return jsonify({
        "status":       "collecting",
        "elapsed_s":    round(elapsed, 1),
        "remaining_s":  round(remaining, 1),
        "samples":      n_samples,
        "message":      f"Collecting sensor data — {int(remaining)} s remaining ({n_samples} samples so far)",
    }), 200


@app.route("/health", methods=["GET"])
def health():
    with _serial_lock:
        connected = _serial_obj is not None and _serial_obj.is_open
    with _sensor_active_lock:
        active = _sensor_active
    with _sessions_lock:
        n_sessions = len(_sessions)

    return jsonify({
        "status":            "ok",
        "arduino_port":      SERIAL_PORT,
        "baud_rate":         BAUD_RATE,
        "arduino_connected": connected,
        "sensor_active":     active,
        "active_sessions":   n_sessions,
        "models":            {
            "cnn": os.path.exists(MODEL_PTH),
            "pkl": os.path.exists(MODEL_PKL),
        },
        "timing": {
            "sensor_delay_s":      SENSOR_DELAY_S,
            "collection_window_s": COLLECTION_WINDOW_S,
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    log.info("=" * 60)
    log.info("  FruitSense Backend v3.0 — starting up")
    log.info("  Serial port        : %s", SERIAL_PORT)
    log.info("  Baud rate          : %d", BAUD_RATE)
    log.info("  Sensor delay       : %d s after image upload", SENSOR_DELAY_S)
    log.info("  Collection window  : %d s (1 min)", COLLECTION_WINDOW_S)
    log.info("  Sensor gate        : CLOSED at startup (no auto-read)")
    log.info("=" * 60)

    try:
        load_cnn_model()
        log.info("CNN model  : READY")
    except Exception as exc:
        log.error("CNN model FAILED: %s", exc)

    try:
        load_pkl_models()
        log.info("ML models  : READY")
    except Exception as exc:
        log.error("ML models FAILED: %s", exc)

    # Start reader thread — port opens, but sensor gate is CLOSED
    start_serial_thread()
    log.info("Sensor reader : IDLE (gate opens after first /analyze-image call)")

    log.info("Server -> http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)