#!/usr/bin/env python3
"""
test_backend.py – Test the FruitSense Flask API
=================================================
Run this while app.py is running to validate the full pipeline.

Usage:
  python test_backend.py                          # uses built-in dummy image
  python test_backend.py path/to/fruit.jpg        # uses real image file
  python test_backend.py --sensors 350,280,500,29,68   # custom sensor values
"""

import sys
import json
import base64
import time
import argparse
import urllib.request
import urllib.error

API_URL = "http://127.0.0.1:5000"

# ── Minimal 1×1 banana-yellow PNG (valid image, CNN will produce some output) ─
DUMMY_B64 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
    "z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
)

# ─────────────────────────────────────────────────────────────────────────────
def check_health():
    print("\n[1] Health check …")
    try:
        req = urllib.request.urlopen(f"{API_URL}/health", timeout=5)
        data = json.loads(req.read())
        print(f"    Status  : {data.get('status')}")
        print(f"    Arduino : {'✅ Connected' if data['arduino'] else '⚠️  Simulated'}")
        print(f"    CNN .pth: {'✅' if data['models']['cnn'] else '❌ NOT FOUND'}")
        print(f"    ML .pkl : {'✅' if data['models']['pkl'] else '❌ NOT FOUND'}")
        return True
    except Exception as e:
        print(f"    ❌ Health check failed: {e}")
        print(f"    Make sure app.py is running on {API_URL}")
        return False


def load_image_b64(path):
    if path:
        with open(path, "rb") as f:
            data = f.read()
        ext = path.rsplit(".", 1)[-1].lower()
        mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png"}.get(ext, "jpeg")
        return f"data:image/{mime};base64," + base64.b64encode(data).decode()
    return DUMMY_B64


def run_analyze(b64_image):
    print("\n[2] Calling /analyze …")
    body = json.dumps({"image": b64_image}).encode()
    req = urllib.request.Request(
        f"{API_URL}/analyze",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    t0 = time.time()
    resp = urllib.request.urlopen(req, timeout=30)
    elapsed = time.time() - t0
    data = json.loads(resp.read())
    return data, elapsed


def pretty_print(result, elapsed):
    print(f"\n{'='*55}")
    print(f"  RESULT  (in {elapsed:.2f}s)")
    print(f"{'='*55}")

    print(f"  Fruit      : {result['fruit']} ({result['confidence']:.1f}% confidence)")

    pred = result["prediction"]
    print(f"  Label      : {pred['label']}")
    print(f"  Edible     : {'✅ Yes' if pred['edible'] else '❌ No'}")
    print(f"  Risk       : {pred['risk']}")
    print(f"  Ripening   : Natural {pred['naturalProb']:.0f}% / Chemical {pred['chemicalProb']:.0f}%")
    if pred["flags"]:
        print(f"  Flags      : {', '.join(pred['flags'])}")

    val = result["validity"]
    print(f"\n  Storage    : {val['storageAdvice']}")
    print(f"  Shelf life : {val['chemicalShelfDays']} days")

    sensors = result["sensors"]
    print(f"\n  Sensors:")
    for key, s in sensors.items():
        status = "✅" if s["safe"][0] <= s["value"] <= s["safe"][1] else "⚠️"
        print(f"    {status} {s['label']:25s} {s['value']} {s['unit']}")

    debug = result.get("_debug", {})
    if debug.get("simulated"):
        print("\n  ⚠️  Sensor data is SIMULATED (Arduino not connected)")

    print(f"\n{'='*55}")
    print("  Full JSON response saved to: test_output.json")


def main():
    parser = argparse.ArgumentParser(description="Test FruitSense API")
    parser.add_argument("image", nargs="?", help="Path to fruit image (optional)")
    args = parser.parse_args()

    if not check_health():
        sys.exit(1)

    b64 = load_image_b64(args.image)
    print(f"    Image   : {'<dummy 1x1 px>' if not args.image else args.image}")
    print(f"    B64 len : {len(b64)} chars")

    try:
        result, elapsed = run_analyze(b64)
        pretty_print(result, elapsed)

        with open("test_output.json", "w") as f:
            json.dump(result, f, indent=2)

    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"\n❌ HTTP {e.code}: {body}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()