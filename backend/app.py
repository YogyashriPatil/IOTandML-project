"""
FruitSense Backend  v3.1
========================
NEW in this version
-------------------
* Integrates four new individual model files:
    model/best_classifier.pkl       – predicts edible flag + condition label
    model/best_regressor.pkl        – predicts shelf-life (days, float)
    model/scaler.pkl                – StandardScaler fitted on all 10 features
    model/label_encoder_fruit.pkl   – LabelEncoder for fruit names

* Feature pipeline (EXACT order, must match training):
    Raw   : mq3, mq5, mq135, temperature, humidity
    Derived:
        gas_intensity      = mq3 + mq5 + mq135
        fermentation_index = mq135 / (mq3 + 1e-6)
        spoilage_index     = mq5  / (mq3 + 1e-6)
        env_factor         = temperature * humidity
    Final : [mq3, mq5, mq135, temp, hum,
             gas_intensity, fermentation_index,
             spoilage_index, env_factor, fruit_enc]   <- 10 features

* Automatic fallback to legacy fruit_quality_models.pkl bundle if the
  new files are absent (zero breaking changes for existing deployments).

* All existing APIs (/analyze-image, /sensor-result, /health) are UNCHANGED.

* Improved error handling:
    - division-by-zero protected in derived features
    - unknown fruit label resolution with prefix matching + hard fallback
    - graceful degradation when predict_proba is unavailable
    - meaningful error messages stored per session
"""

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


# =============================================================================
# LOGGING  (Windows-safe UTF-8)
# =============================================================================

class SafeStreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            super().emit(record)
        except UnicodeEncodeError:
            record.msg = record.msg.encode("ascii", "replace").decode("ascii")
            super().emit(record)


log = logging.getLogger("FruitSense")
log.setLevel(logging.INFO)
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
_sh  = SafeStreamHandler(sys.stdout)
_sh.setFormatter(_fmt)
log.addHandler(_sh)
try:
    _fh = logging.FileHandler("fruitsense.log", encoding="utf-8")
    _fh.setFormatter(_fmt)
    log.addHandler(_fh)
except Exception:
    pass


# =============================================================================
# FLASK APP
# =============================================================================

app = Flask(__name__)
CORS(app)


# =============================================================================
# PATHS & CONSTANTS
# =============================================================================

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

# CNN (PyTorch .pth)
MODEL_PTH = os.environ.get("MODEL_PTH", os.path.join(MODEL_DIR, "best_fruit_model_resnet50.pth"))

# NEW individual model files
MODEL_CLASSIFIER = os.environ.get("MODEL_CLASSIFIER", os.path.join(MODEL_DIR, "best_classifier.pkl"))
MODEL_REGRESSOR  = os.environ.get("MODEL_REGRESSOR",  os.path.join(MODEL_DIR, "best_regressor.pkl"))
MODEL_SCALER     = os.environ.get("MODEL_SCALER",     os.path.join(MODEL_DIR, "scaler.pkl"))
MODEL_LE_FRUIT   = os.environ.get("MODEL_LE_FRUIT",   os.path.join(MODEL_DIR, "label_encoder_fruit.pkl"))

# Legacy bundle (fallback only)
MODEL_PKL = os.environ.get("MODEL_PKL", os.path.join(MODEL_DIR, "fruit_quality_models.pkl"))

# Serial
SERIAL_PORT = os.environ.get("SERIAL_PORT", "COM4")
BAUD_RATE   = int(os.environ.get("BAUD_RATE", 115200))

# Image pre-processing
IMG_SIZE    = 224
IMG_MEAN    = [0.485, 0.456, 0.406]
IMG_STD     = [0.229, 0.224, 0.225]
CNN_CLASSES = ["Apple", "Banana", "Grape", "Mango", "Strawberry"]

# Timing
SENSOR_DELAY_S      = 15   # seconds after image upload before LED turns on
COLLECTION_WINDOW_S = 15   # seconds of sensor collection (1 minute)
READ_INTERVAL_S     = 2    # Arduino sends every ~1 s; we use every 2 s


# =============================================================================
# MODEL CACHES  (module-level singletons, loaded once at startup)
# =============================================================================

_pth_model  = None   # CNN ResNet-50
_new_models = None   # dict: classifier, regressor, scaler, le_fruit
_pkl_models = None   # legacy bundle dict


# =============================================================================
# CNN ARCHITECTURE
# =============================================================================

def build_model(num_classes=5):
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


# =============================================================================
# MODEL LOADERS
# =============================================================================

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
    if real_missing:
        log.warning("Truly missing keys: %s", real_missing)
    if unexpected:
        log.warning("Unexpected keys (first 10): %s", unexpected[:10])
    model = model.float().eval()
    _pth_model = model
    log.info("CNN loaded OK (%d classes)", num_classes)
    return _pth_model


def load_new_models():
    """
    Load the four new individual model files.
    Returns a dict on success, None if any file is missing (triggers legacy fallback).
    Thread-safe: repeated calls return the cached dict.
    """
    global _new_models
    if _new_models is not None:
        return _new_models

    import joblib

    paths = {
        "classifier": MODEL_CLASSIFIER,
        "regressor":  MODEL_REGRESSOR,
        "scaler":     MODEL_SCALER,
        "le_fruit":   MODEL_LE_FRUIT,
    }

    missing = [k for k, p in paths.items() if not os.path.exists(p)]
    if missing:
        log.warning("New model file(s) not found: %s -- will use legacy bundle", missing)
        return None

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            loaded = {key: joblib.load(path) for key, path in paths.items()}

        _new_models = loaded

        # Diagnostic logging so you can verify classes at startup
        le = loaded["le_fruit"]
        if hasattr(le, "classes_"):
            log.info("le_fruit classes : %s", list(le.classes_))

        clf = loaded["classifier"]
        if hasattr(clf, "classes_"):
            log.info("classifier classes: %s", list(np.atleast_1d(clf.classes_).tolist()))

        log.info("New ML models loaded OK (classifier + regressor + scaler + le_fruit)")
        return _new_models

    except Exception as exc:
        log.error("Failed to load new ML models: %s -- falling back to legacy bundle", exc)
        return None


def load_legacy_models():
    """Load legacy bundled pkl file (fruit_quality_models.pkl). Used as fallback."""
    global _pkl_models
    if _pkl_models is not None:
        return _pkl_models
    import joblib
    log.info("Loading legacy ML bundle from %s", MODEL_PKL)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        _pkl_models = joblib.load(MODEL_PKL)
    log.info("Legacy ML bundle loaded. Keys: %s", list(_pkl_models.keys()))
    return _pkl_models


# =============================================================================
# SERIAL PORT
# =============================================================================

_serial_lock        = threading.Lock()
_serial_obj         = None
_sensor_active      = False
_sensor_active_lock = threading.Lock()


def _open_serial():
    global _serial_obj
    with _serial_lock:
        if _serial_obj is not None and _serial_obj.is_open:
            return _serial_obj
    try:
        import serial
        log.info("Opening %s @ %d baud ...", SERIAL_PORT, BAUD_RATE)
        ser = serial.Serial(
            port=SERIAL_PORT, baudrate=BAUD_RATE,
            timeout=0.5, dsrdtr=False, rtscts=False,
        )
        log.info("Waiting 2.5 s for Arduino boot + sensor warm-up ...")
        ser.setDTR(False)
        time.sleep(2.5)
        ser.flushInput()
        ser.reset_input_buffer()
        log.info("Serial ready (%s @ %d baud) -- sensor INACTIVE until image upload",
                 SERIAL_PORT, BAUD_RATE)
        with _serial_lock:
            _serial_obj = ser
    except Exception as exc:
        log.warning("Cannot open %s: %s", SERIAL_PORT, exc)
        with _serial_lock:
            _serial_obj = None
    with _serial_lock:
        return _serial_obj


def _send_serial_cmd(cmd):
    with _serial_lock:
        ser = _serial_obj
    if ser is None or not ser.is_open:
        log.warning("Serial not open -- cannot send: %r", cmd.strip())
        return
    try:
        ser.write(cmd.encode("utf-8"))
        ser.flush()
        log.info("-> Arduino: %s", cmd.strip())
    except Exception as exc:
        log.warning("Serial write error: %s", exc)


def led_on():
    log.info("Turning LED ON -- sensor activation in progress")
    with _serial_lock:
        if _serial_obj:
            _serial_obj.reset_input_buffer()
    _send_serial_cmd("LED_ON\n")


def led_off():
    log.info("Turning LED OFF")
    _send_serial_cmd("LED_OFF\n")


# =============================================================================
# SESSION STORE
# =============================================================================

_sessions      = {}
_sessions_lock = threading.Lock()


# =============================================================================
# SERIAL READER THREAD
# =============================================================================

def _serial_reader_thread():
    """
    Runs forever in a daemon thread.
    Lines are ONLY processed when _sensor_active is True -- no noise at startup.
    """
    ser = _open_serial()
    if ser is None:
        log.warning("Serial reader thread exiting -- port unavailable.")
        return

    log.info("Serial reader thread running (%s @ %d baud) -- idle until sensor activated",
             SERIAL_PORT, BAUD_RATE)

    consecutive_empty = 0

    while True:
        try:
            raw = ser.readline()   # blocks up to timeout=0.5 s

            with _sensor_active_lock:
                active = _sensor_active

            if not raw:
                consecutive_empty += 1
                if active and consecutive_empty == 20:   # ~10 s of silence
                    log.warning(
                        "No data from Arduino for ~10 s on %s while sensor ACTIVE. "
                        "Check wiring / power.", SERIAL_PORT,
                    )
                continue

            consecutive_empty = 0
            line = raw.decode("utf-8", errors="ignore").strip()

            if not line:
                continue

            # Arduino debug lines always logged
            if line.startswith("#"):
                log.info("Arduino: %s", line)
                continue

            # Discard data while sensor is inactive (startup noise guard)
            if not active:
                log.debug("Sensor inactive -- discarding: %r", line)
                continue

            # Expect CSV: mq3,mq5,mq135,temperature,humidity
            parts = line.split(",")
            if len(parts) != 5:
                log.warning("Bad CSV (%d fields, expected 5): %r", len(parts), line)
                continue

            try:
                mq3, mq5, mq135, temp, hum = (float(p) for p in parts)
            except ValueError as ve:
                log.warning("CSV parse error (%s) for: %r", ve, line)
                continue

            reading = {
                "mq3": mq3, "mq5": mq5, "mq135": mq135,
                "temperature": temp, "humidity": hum,
                "timestamp": datetime.utcnow().isoformat(),
            }
            log.info("Sensor <- mq3=%.0f  mq5=%.0f  mq135=%.0f  t=%.1f C  h=%.1f%%",
                     mq3, mq5, mq135, temp, hum)

            # Fan out reading to all active sessions
            with _sessions_lock:
                for sess in _sessions.values():
                    if not sess["done"]:
                        sess["buffer"].append(reading)

        except Exception as exc:
            log.warning("Serial read error: %s", exc)
            time.sleep(1)


def start_serial_thread():
    _open_serial()
    t = threading.Thread(target=_serial_reader_thread, daemon=True, name="SerialReader")
    t.start()
    log.info("Serial reader thread started (sensor gate CLOSED -- awaiting image upload)")


# =============================================================================
# SESSION LIFECYCLE THREAD
# =============================================================================

def _session_lifecycle_thread(session_id):
    """
    Per-session lifecycle:
      T+0   s  thread starts (CNN already ran in the Flask request thread)
      T+15  s  LED_ON + open sensor gate
      T+75  s  LED_OFF + close sensor gate + run ML + store result
    """
    global _sensor_active

    log.info("[%s] Lifecycle: waiting %d s before activating sensor ...",
             session_id, SENSOR_DELAY_S)
    time.sleep(SENSOR_DELAY_S)

    # Phase 1: Mark session as collecting
    with _sessions_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            log.warning("[%s] Session disappeared before activation", session_id)
            return
        sess["activated_at"] = time.monotonic()

    with _sensor_active_lock:
        _sensor_active = True
    led_on()
    log.info("[%s] Sensor ACTIVATED -- collecting for %d s", session_id, COLLECTION_WINDOW_S)

    # Phase 2: Collection window
    time.sleep(COLLECTION_WINDOW_S)

    with _sensor_active_lock:
        _sensor_active = False
    led_off()
    log.info("[%s] Collection window complete -- processing buffer", session_id)

    # Phase 3: Read buffer
    with _sessions_lock:
        sess = _sessions.get(session_id)
        if sess is None:
            log.warning("[%s] Session missing at processing time", session_id)
            return
        buf         = list(sess["buffer"])
        fruit_label = sess["fruit"]
        cnn_conf    = sess["confidence"]

    if not buf:
        msg = (
            "No sensor data was collected during the 60-second window. "
            "Verify the Arduino is connected and the serial port is correct."
        )
        log.error("[%s] %s", session_id, msg)
        with _sessions_lock:
            if session_id in _sessions:
                _sessions[session_id]["done"]  = True
                _sessions[session_id]["error"] = msg
        return

    # Phase 4: Average all readings
    avg = {
        "mq3":          float(np.mean([r["mq3"]         for r in buf])),
        "mq5":          float(np.mean([r["mq5"]         for r in buf])),
        "mq135":        float(np.mean([r["mq135"]       for r in buf])),
        "temperature":  float(np.mean([r["temperature"] for r in buf])),
        "humidity":     float(np.mean([r["humidity"]    for r in buf])),
        "sample_count": len(buf),
    }
    log.info("[%s] Averaged %d readings: mq3=%.1f mq5=%.1f mq135=%.1f t=%.1f h=%.1f",
             session_id, len(buf),
             avg["mq3"], avg["mq5"], avg["mq135"], avg["temperature"], avg["humidity"])

    # Phase 5: ML prediction
    try:
        quality = predict_quality(avg, fruit_label)
    except Exception as exc:
        msg = f"ML prediction failed: {exc}"
        log.exception("[%s] %s", session_id, msg)
        with _sessions_lock:
            if session_id in _sessions:
                _sessions[session_id]["done"]  = True
                _sessions[session_id]["error"] = msg
        return

    result = {
        "fruit":        fruit_label,
        "confidence":   cnn_conf,
        "sensors":      build_sensor_ui(avg),
        "prediction":   build_prediction_ui(quality),
        "validity":     build_validity(fruit_label, quality["condition"],
                                       quality["ripening_type"], quality["shelf_life"]),
        "nutrition":    NUTRITION_DB.get(fruit_label, NUTRITION_DB["Apple"]),
        "sample_count": len(buf),
    }

    with _sessions_lock:
        if session_id in _sessions:
            _sessions[session_id]["done"]   = True
            _sessions[session_id]["result"] = result

    log.info("[%s] Lifecycle complete -- result stored", session_id)


# =============================================================================
# IMAGE PIPELINE  (CNN)
# =============================================================================

def base64_to_tensor(b64_string):
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


def predict_fruit(b64_image):
    import torch
    model  = load_cnn_model()
    tensor = base64_to_tensor(b64_image)
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    idx   = int(probs.argmax())
    label = CNN_CLASSES[idx]
    conf  = float(probs[idx]) * 100.0
    THRESHOLD = 80.0
    if conf < THRESHOLD:
        log.info("CNN -> Unknown (%.1f%%)", conf)
        return "Unknown", conf
    log.info("CNN -> %s (%.1f%%)", label, conf)
    return label, conf


# =============================================================================
# FEATURE ENGINEERING
# =============================================================================

# Maps CNN class names that differ from the label-encoder vocabulary
_CNN_TO_LE = {"grape": "Grapes"}


def _compute_features(sensors, fruit_enc):
    """
    Build the 10-element feature vector in the EXACT order used during training.

    Feature order (index 0-9):
        0  mq3
        1  mq5
        2  mq135
        3  temperature
        4  humidity
        5  gas_intensity      = mq3 + mq5 + mq135
        6  fermentation_index = mq135 / (mq3 + 1e-6)
        7  spoilage_index     = mq5  / (mq3 + 1e-6)
        8  env_factor         = temperature * humidity
        9  fruit_enc

    Sensor values are clipped to valid hardware ranges.
    All divisions include 1e-6 epsilon to prevent zero-division.
    """
    mq3   = float(np.clip(sensors["mq3"],         0, 4095))
    mq5   = float(np.clip(sensors["mq5"],         0, 4095))
    mq135 = float(np.clip(sensors["mq135"],       0, 4095))
    temp  = float(np.clip(sensors["temperature"], -40, 85))
    hum   = float(np.clip(sensors["humidity"],    0,  100))

    gas_intensity      = mq3 + mq5 + mq135
    fermentation_index = mq135 / (mq3 + 1e-6)
    spoilage_index     = mq5   / (mq3 + 1e-6)
    # env_factor         = (temp*0.6)  +(hum * 0.4)
    env_factor = temp * hum

    X = np.array([[
        mq3, mq5, mq135, temp, hum,
        gas_intensity, fermentation_index,
        spoilage_index, env_factor, float(fruit_enc),
    ]], dtype=np.float64)

    log.info(
        "Features: mq3=%.1f mq5=%.1f mq135=%.1f t=%.1f h=%.1f | "
        "gas=%.1f ferm=%.4f spoil=%.4f env=%.1f enc=%d",
        mq3, mq5, mq135, temp, hum,
        gas_intensity, fermentation_index, spoilage_index, env_factor, fruit_enc,
    )
    return X


def _resolve_fruit_enc(fruit_label, le_fruit):
    """
    Map CNN fruit label -> (canonical_le_class, encoded_integer).

    Resolution order:
      1. Exact match (case-insensitive)
      2. CNN-to-LE alias dict
      3. 4-character prefix match
      4. Hard fallback to first class in le_fruit.classes_
    """
    key    = fruit_label.lower()
    le_low = {c.lower(): c for c in le_fruit.classes_}

    # Step 1: exact match
    if key in le_low:
        matched = le_low[key]
    else:
        # Step 2: alias
        alias = _CNN_TO_LE.get(key, fruit_label).lower()
        if alias in le_low:
            matched = le_low[alias]
        else:
            # Step 3: prefix
            matched = next(
                (le_low[k] for k in le_low if k.startswith(key[:4])),
                list(le_fruit.classes_)[0],   # Step 4: hard fallback
            )
            log.warning(
                "Fruit '%s' not in LE vocabulary -- using '%s' as fallback",
                fruit_label, matched,
            )

    enc = int(le_fruit.transform([matched])[0])
    log.info("fruit_enc for '%s' -> %d  (LE class: '%s')", fruit_label, enc, matched)
    return matched, enc


# =============================================================================
# QUALITY PREDICTION  -- NEW models (primary) + legacy bundle (fallback)
# =============================================================================

# Condition label normalisation: maps any training-time string -> canonical 4
_COND_NORM = {
    # Fresh variants
    "fresh": "Fresh", "good": "Fresh", "unripe": "Fresh", "green": "Fresh",
    # Ripe variants
    "ripe": "Ripe", "ok": "Ripe", "yellow": "Ripe", "mature": "Ripe",
    # Overripe variants
    "overripe": "Overripe", "over-ripe": "Overripe", "over ripe": "Overripe",
    # Rotten / bad variants
    "rotten": "Rotten", "bad": "Rotten", "spoiled": "Rotten",
    "spoilt": "Rotten", "not edible": "Rotten", "inedible": "Rotten",
}

# Edibility positive class strings
_EDIBLE_POS = {"edible", "safe", "yes", "1", "true", "good", "fresh", "ripe", "ok"}


def _safe_predict_proba(clf, X):
    """
    Return (max_confidence_pct, proba_array | None).
    Never raises -- returns 75.0 default when predict_proba is unavailable.
    """
    try:
        proba = clf.predict_proba(X)
        # Multi-output classifiers return a list of arrays
        if isinstance(proba, list):
            arr = np.array(proba[0][0])
        else:
            arr = np.array(proba[0])
        return float(np.max(arr)) * 100.0, arr
    except Exception:
        return 75.0, None


# def _predict_with_new_models(sensors, fruit_label):
#     """
#     Run the new individual ML files.

#     Classifier output handling
#     --------------------------
#     The classifier is inspected at runtime to decide if it predicts:
#       (a) condition labels  (Fresh / Ripe / Overripe / Rotten)
#       (b) edibility flag    (Edible / Not Edible / 0 / 1)
#       (c) numeric index     (0=Fresh, 1=Ripe, 2=Overripe, 3=Rotten)
#     All three are handled transparently.

#     Ripening type derivation
#     ------------------------
#     The new model set has no ripening classifier, so Natural vs Chemical is
#     derived from the fermentation_index gas signature (same chemistry used
#     during feature engineering).
#     """
#     m        = load_new_models()
#     clf      = m["classifier"]
#     reg      = m["regressor"]
#     scaler   = m["scaler"]
#     le_fruit = m["le_fruit"]

#     _, fruit_enc = _resolve_fruit_enc(fruit_label, le_fruit)

#     # Build raw 10-feature vector then SCALE before prediction
#     X_raw    = _compute_features(sensors, fruit_enc)
#     X_scaled = scaler.transform(X_raw)   # must use scaler.transform, not fit_transform

#     # --- Classifier ---------------------------------------------------------
#     raw_pred = clf.predict(X_scaled)

#     # Flatten 2-D multi-output arrays to scalar
#     if hasattr(raw_pred, "ndim") and raw_pred.ndim == 2:
#         pred_val = raw_pred[0, 0]
#     else:
#         pred_val = np.atleast_1d(raw_pred)[0]

#     pred_str = str(pred_val).strip().lower()

#     # Confidence from predict_proba
#     confidence, _ = _safe_predict_proba(clf, X_scaled)

#     # Decode prediction -> (condition, edible)
#     condition = "Ripe"   # safe default
#     edible    = True

#     if pred_str in _COND_NORM:
#         # (a) condition label
#         condition = _COND_NORM[pred_str]
#         edible    = (condition != "Rotten")

#     elif pred_str in {"0", "1"}:
#     # Numeric binary classifier handling
#     # 0 = edible/safe
#     # 1 = not edible/unsafe

#         edible = (pred_str == "0")

#         if edible:
#             condition = "Ripe"
#         else:
#             condition = "Rotten"

#     elif pred_str in _EDIBLE_POS or pred_str in {"false", "not edible", "unsafe", "no"}:
#         edible = pred_str in _EDIBLE_POS
#         condition = "Ripe" if edible else "Rotten"
#     else:
#         # (c) numeric index
#         try:
#             idx       = int(float(pred_str))
#             cond_list = ["Fresh", "Ripe", "Overripe", "Rotten"]
#             condition = cond_list[idx] if 0 <= idx < len(cond_list) else "Ripe"
#             edible    = idx < 3
#         except (ValueError, TypeError):
#             # Unknown string -- capitalise and assume edible
#             condition = pred_str.capitalize() if pred_str else "Ripe"
#             edible    = True

#     # --- Regressor: shelf life ----------------------------------------------
#     shelf_life = float(max(0.0, reg.predict(X_scaled)[0]))

#     # --- Derive ripening type from fermentation_index -----------------------
#     # fermentation_index = mq135 / (mq3 + 1e-6)
#     # High CO2/VOC relative to alcohol -> chemical ripening
#     fi = float(sensors["mq135"]) / (float(sensors["mq3"]) + 1e-6)

#     # safer scaling
#     chemical_prob = float(np.clip((fi / 25.0) * 100.0, 0.0, 100.0))

#     natural_prob = 100.0 - chemical_prob

#     # higher threshold
#     ripening_type = "Chemical" if chemical_prob > 75.0 else "Natural"
#     log.info(
#         "NEW ML -> condition=%s  edible=%s  ripening=%s  shelf=%.1fd  conf=%.1f%%",
#         condition, edible, ripening_type, shelf_life, confidence,
#     )

#     return {
#         "edible":        edible,
#         "safe":          edible,
#         "condition":     condition,
#         "ripening_type": ripening_type,
#         "shelf_life":    round(shelf_life, 1),
#         "confidence":    round(confidence, 1),
#         "natural_prob":  round(natural_prob, 1),
#         "chemical_prob": round(chemical_prob, 1),
#     }
def _predict_with_new_models(sensors, fruit_label):

    m = load_new_models()

    clf = m["classifier"]
    reg = m["regressor"]
    scaler = m["scaler"]
    le_fruit = m["le_fruit"]

    _, fruit_enc = _resolve_fruit_enc(fruit_label, le_fruit)

    # =========================================================
    # SENSOR NORMALIZATION + STABILIZATION
    # =========================================================

    mq3 = float(sensors["mq3"])
    mq5 = float(sensors["mq5"])
    mq135 = float(sensors["mq135"])
    temp = float(sensors["temperature"])
    hum = float(sensors["humidity"])

    # normalize environment
    norm_temp = np.clip(temp / 40.0, 0.0, 1.0)
    norm_hum = np.clip(hum / 100.0, 0.0, 1.0)

    # reduce effect of dry/hot environments
    env_penalty = 0.0

    if hum < 30:
        env_penalty += 0.15

    if temp > 33:
        env_penalty += 0.10

    # =========================================================
    # BUILD FEATURES
    # =========================================================

    X_raw = _compute_features(sensors, fruit_enc)
    X_scaled = scaler.transform(X_raw)

    # =========================================================
    # CLASSIFIER
    # =========================================================

    raw_pred = clf.predict(X_scaled)

    if hasattr(raw_pred, "ndim") and raw_pred.ndim == 2:
        pred_val = raw_pred[0, 0]
    else:
        pred_val = np.atleast_1d(raw_pred)[0]

    pred_str = str(pred_val).strip().lower()

    confidence, _ = _safe_predict_proba(clf, X_scaled)

    condition = "Ripe"
    edible = True

    # =========================================================
    # CONDITION DECODER
    # =========================================================

    if pred_str in _COND_NORM:

        condition = _COND_NORM[pred_str]

        if condition == "Rotten":
            edible = False

        else:
            edible = True

    elif pred_str in {"0", "1"}:

        # fixed logic
        # 0 = edible
        # 1 = not edible

        edible = (pred_str == "0")

        condition = "Ripe" if edible else "Rotten"

    else:

        try:
            idx = int(float(pred_str))

            cond_list = ["Fresh", "Ripe", "Overripe", "Rotten"]

            condition = cond_list[idx]

            edible = idx < 3

        except:
            condition = "Ripe"
            edible = True

    # =========================================================
    # SHELF LIFE FIX
    # =========================================================

    shelf_life = float(reg.predict(X_scaled)[0])

    # realistic clipping
    fruit_limits = {
        "Banana": 10,
        "Mango": 15,
        "Strawberry": 7,
        "Apple": 60,
        "Grape": 20,
        "Grapes": 20,
    }

    max_days = fruit_limits.get(fruit_label, 30)

    shelf_life = np.clip(shelf_life, 0, max_days)

    # =========================================================
    # RIPENING DETECTION FIX
    # =========================================================
    # =========================================================
    # IMPROVED RIPENING DETECTION
    # =========================================================

    fermentation_index = mq135 / (mq3 + 1e-6)
    spoilage_index = mq5 / (mq3 + 1e-6)

    mq3_norm = mq3 / 4095.0
    mq5_norm = mq5 / 4095.0
    mq135_norm = mq135 / 4095.0

    chemical_score = (
        (fermentation_index * 35) +
        (spoilage_index * 25) +
        (mq135_norm * 30) +
        (mq5_norm * 20) -
        (mq3_norm * 10)
    )

    # Environmental compensation
    if hum < 35:
        chemical_score += 8

    if temp > 32:
        chemical_score += 5

    # Strong VOC detection
    if mq135 > 320:
        chemical_score += 15

    # Ammonia spike
    if mq5 > 250:
        chemical_score += 10

    chemical_score = np.clip(chemical_score, 0, 100)

    natural_prob = round(100 - chemical_score, 1)
    chemical_prob = round(chemical_score, 1)

    # Final decision
    if chemical_score >= 65:
        ripening_type = "Chemical"
    else:
        ripening_type = "Natural"

    log.info(
        "CHEMICAL DEBUG -> mq3=%.1f mq5=%.1f mq135=%.1f chem_score=%.1f",
        mq3, mq5, mq135, chemical_score
    )
    # =========================================================
    # FINAL SANITY RULES
    # =========================================================

    # Fresh/Natural should never become non-edible
    if condition in ["Fresh", "Ripe"] and ripening_type == "Natural":
        edible = True

    # Rotten always unsafe
    if condition == "Rotten":
        edible = False

    # Overripe still edible sometimes
    if condition == "Overripe" and chemical_score < 60:
        edible = True

    # =========================================================
    # CONFIDENCE STABILIZATION
    # =========================================================

    confidence = np.clip(confidence, 60, 99)

    log.info(
        "FIXED ML -> edible=%s condition=%s ripening=%s shelf=%.1fd chem=%.1f%%",
        edible,
        condition,
        ripening_type,
        shelf_life,
        chemical_prob,
    )

    return {
        "edible": bool(edible),
        "safe": bool(edible),
        "condition": condition,
        "ripening_type": ripening_type,
        "shelf_life": round(float(shelf_life), 1),
        "confidence": round(float(confidence), 1),
        "natural_prob": natural_prob,
        "chemical_prob": chemical_prob,
    }

def _predict_with_legacy_bundle(sensors, fruit_label):
    """Fallback: uses the original fruit_quality_models.pkl bundle."""
    b            = load_legacy_models()
    le_fruit     = b["le_fruit"]
    le_condition = b["le_condition"]
    le_ripening  = b["le_ripening"]

    _, fruit_enc = _resolve_fruit_enc(fruit_label, le_fruit)
    X = _compute_features(sensors, fruit_enc)

    edible_enc    = int(b["clf_edible"].predict(X)[0])
    safe_enc      = int(b["clf_safe"].predict(X)[0])
    condition_enc = int(b["clf_condition"].predict(X)[0])
    ripening_enc  = int(b["clf_ripening"].predict(X)[0])
    shelf_life    = float(b["reg_shelf"].predict(X)[0])
    condition     = str(le_condition.classes_[condition_enc])
    ripening_type = str(le_ripening.classes_[ripening_enc])

    confidence, _ = _safe_predict_proba(b["clf_edible"], X)
    _, rip_arr    = _safe_predict_proba(b["clf_ripening"], X)

    if rip_arr is not None and len(rip_arr) >= 2:
        natural_prob  = round(float(rip_arr[1]) * 100.0, 1)
        chemical_prob = round(float(rip_arr[0]) * 100.0, 1)
    else:
        natural_prob, chemical_prob = 60.0, 40.0

    log.info("LEGACY ML -> edible=%s  condition=%s  ripening=%s  shelf=%.1fd",
             bool(edible_enc), condition, ripening_type, shelf_life)

    return {
        "edible":        bool(edible_enc),
        "safe":          bool(safe_enc),
        "condition":     condition,
        "ripening_type": ripening_type,
        "shelf_life":    round(max(0.0, shelf_life), 1),
        "confidence":    round(confidence, 1),
        "natural_prob":  natural_prob,
        "chemical_prob": chemical_prob,
    }


def predict_quality(sensors, fruit_label):
    """
    Primary quality prediction entry point.
    Tries new individual models first; falls back to legacy bundle if unavailable.
    """
    new_m = load_new_models()
    if new_m is not None:
        log.info("Using NEW ML models (best_classifier + best_regressor + scaler + le_fruit)")
        try:
            return _predict_with_new_models(sensors, fruit_label)
        except Exception as exc:
            log.error("New model prediction failed (%s) -- trying legacy bundle", exc)

    log.info("Using LEGACY ML bundle (fruit_quality_models.pkl)")
    return _predict_with_legacy_bundle(sensors, fruit_label)


# =============================================================================
# RESPONSE BUILDERS  (unchanged API contract)
# =============================================================================

def build_sensor_ui(sensors):
    mq3, mq5, mq135 = sensors["mq3"], sensors["mq5"], sensors["mq135"]
    temp, hum        = sensors["temperature"], sensors["humidity"]
    return {
        "alcohol":     {"value": round(mq3, 1),         "unit": "ppm", "safe": [0, 600],   "label": "Alcohol",  "icon": "🍺"},
        "ammonia":     {"value": round(mq5, 1),          "unit": "ppm", "safe": [0, 600],   "label": "NH3",      "icon": "🧪"},
        "co2":         {"value": round(mq135 * 0.6, 1), "unit": "ppm", "safe": [350, 450], "label": "CO2",      "icon": "☁️"},
        "voc":         {"value": round(mq135 * 0.4, 1), "unit": "ppm", "safe": [0, 600],   "label": "VOC",      "icon": "🔬"},
        "temperature": {"value": round(temp, 1),          "unit": "°C",  "safe": [20, 32],   "label": "Temp",     "icon": "🌡️"},
        "humidity":    {"value": round(hum, 1),           "unit": "%",   "safe": [50, 80],   "label": "Humidity", "icon": "💧"},
    }


def build_prediction_ui(quality):
    edible    = quality["edible"]
    condition = quality["condition"]
    ripening  = quality["ripening_type"]

    # Risk level
    if condition == "Rotten":
        risk = "High"

    elif condition == "Overripe":
        risk = "Medium"

    elif ripening == "Chemical":
        risk = "Medium"

    else:
        risk = "Low"

    # Human-readable label
    if not edible:                label = "Not Edible"
    elif condition == "Rotten":   label = "Spoiled / Rotten"
    elif ripening == "Chemical":  label = "Chemically Ripened"
    elif condition == "Overripe": label = "Overripe"
    elif condition == "Ripe":     label = "Naturally Ripened"
    else:                         label = "Fresh & Natural"

    # Warning flags
    flags = []
    if quality["chemical_prob"] > 50:
        flags.append("High chemical ripening gas detected")
    if condition in ("Rotten", "Overripe"):
        flags.append(f"Fruit is {condition.lower()}")
    if not quality["safe"]:
        flags.append("Unsafe for consumption")
    if not edible:
        flags.append("Not recommended for eating")

    return {
        "label":        label,
        "edible":       edible,
        "confidence":   quality["confidence"],
        "naturalProb":  quality["natural_prob"],
        "chemicalProb": quality["chemical_prob"],
        "risk":         risk,
        "flags":        flags,
        "model":        "FruitSense-CNN v2.1 + NewML",
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


def build_validity(fruit, condition, ripening_type, shelf_days):
    shelf_days = max(0.0, shelf_days)
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
# ROUTES  (API contract UNCHANGED)
# =============================================================================

@app.route("/analyze-image", methods=["POST", "OPTIONS"])
def analyze_image():
    """
    STEP 1+2: Receive base64 image -> run CNN -> start lifecycle thread.
    Returns immediately; frontend polls /sensor-result for completion.
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify({"error": "Missing 'image' field in request body"}), 400

        fruit_label, cnn_conf = predict_fruit(body["image"])
        session_id = str(uuid.uuid4())

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

        t = threading.Thread(
            target=_session_lifecycle_thread,
            args=(session_id,),
            daemon=True,
            name=f"Lifecycle-{session_id[:8]}",
        )
        t.start()

        log.info("analyze-image -> %s %.1f%%  session=%s  (sensor in %d s)",
                 fruit_label, cnn_conf, session_id, SENSOR_DELAY_S)

        return jsonify({
            "fruit":          fruit_label,
            "confidence":     round(cnn_conf, 1),
            "session_id":     session_id,
            "sensor_delay_s": SENSOR_DELAY_S,
            "collection_s":   COLLECTION_WINDOW_S,
            "message": (
                f"Fruit detected! Place {fruit_label} near the sensors within "
                f"{SENSOR_DELAY_S} seconds -- LED will activate automatically."
            ),
        }), 200

    except Exception:
        log.exception("Error in /analyze-image")
        return jsonify({"error": "Internal server error -- check fruitsense.log"}), 500


@app.route("/sensor-result", methods=["GET", "OPTIONS"])
def sensor_result():
    """
    STEP 7+8: Poll for the ML prediction result.

    Possible responses:
      { "status": "waiting_for_activation", "countdown_s": N }
      { "status": "collecting",  "elapsed_s": N, "remaining_s": N, "samples": N }
      { "status": "done",        <full result dict> }
      { "status": "error",       "message": "..." }
    """
    if request.method == "OPTIONS":
        return jsonify({}), 200

    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Missing session_id query parameter"}), 400

    with _sessions_lock:
        sess = _sessions.get(session_id)

    if sess is None:
        return jsonify({"error": "Unknown session_id -- call /analyze-image first"}), 404

    if sess.get("error"):
        return jsonify({"status": "error", "message": sess["error"]}), 200

    if sess["done"] and sess["result"] is not None:
        result = dict(sess["result"])
        result["status"] = "done"
        return jsonify(result), 200

    now = time.monotonic()

    # Pre-activation countdown
    if sess["activated_at"] is None:
        elapsed   = now - sess["started_at"]
        remaining = max(0.0, SENSOR_DELAY_S - elapsed)
        return jsonify({
            "status":      "waiting_for_activation",
            "countdown_s": round(remaining, 1),
            "message":     f"Place fruit near sensors -- LED activates in {int(remaining) + 1} s",
        }), 200

    # Active collection
    elapsed   = now - sess["activated_at"]
    remaining = max(0.0, COLLECTION_WINDOW_S - elapsed)
    with _sessions_lock:
        n_samples = len(sess["buffer"])
    return jsonify({
        "status":      "collecting",
        "elapsed_s":   round(elapsed, 1),
        "remaining_s": round(remaining, 1),
        "samples":     n_samples,
        "message":     f"Collecting sensor data -- {int(remaining)} s remaining ({n_samples} samples so far)",
    }), 200


@app.route("/health", methods=["GET"])
def health():
    with _serial_lock:
        connected = _serial_obj is not None and _serial_obj.is_open
    with _sensor_active_lock:
        active = _sensor_active
    with _sessions_lock:
        n_sessions = len(_sessions)

    using_new = load_new_models() is not None

    return jsonify({
        "status":            "ok",
        "arduino_port":      SERIAL_PORT,
        "baud_rate":         BAUD_RATE,
        "arduino_connected": connected,
        "sensor_active":     active,
        "active_sessions":   n_sessions,
        "models": {
            "cnn":              os.path.exists(MODEL_PTH),
            "new_classifier":   os.path.exists(MODEL_CLASSIFIER),
            "new_regressor":    os.path.exists(MODEL_REGRESSOR),
            "new_scaler":       os.path.exists(MODEL_SCALER),
            "new_le_fruit":     os.path.exists(MODEL_LE_FRUIT),
            "legacy_bundle":    os.path.exists(MODEL_PKL),
            "using_new_models": using_new,
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
    log.info("=" * 62)
    log.info("  FruitSense Backend  v3.1")
    log.info("  Serial port        : %s", SERIAL_PORT)
    log.info("  Baud rate          : %d", BAUD_RATE)
    log.info("  Sensor delay       : %d s after image upload", SENSOR_DELAY_S)
    log.info("  Collection window  : %d s", COLLECTION_WINDOW_S)
    log.info("  Sensor gate        : CLOSED at startup")
    log.info("=" * 62)

    # Load CNN
    try:
        load_cnn_model()
        log.info("CNN model          : READY")
    except Exception as exc:
        log.error("CNN model FAILED   : %s", exc)

    # Load ML models (new first, legacy fallback)
    try:
        nm = load_new_models()
        if nm is not None:
            log.info("New ML models      : READY  (classifier + regressor + scaler + le_fruit)")
        else:
            log.warning("New ML models      : NOT FOUND -- loading legacy bundle")
            load_legacy_models()
            log.info("Legacy ML bundle   : READY")
    except Exception as exc:
        log.error("ML models FAILED   : %s", exc)

    # Start serial reader (sensor gate stays CLOSED until first scan)
    start_serial_thread()
    log.info("Serial reader      : IDLE (gate opens on first /analyze-image call)")

    log.info("Server             : http://127.0.0.1:5000")
    log.info("=" * 62)
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)