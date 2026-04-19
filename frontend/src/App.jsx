import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK RESPONSE — used as UI fallback if backend is offline
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_RESPONSE = {
  fruit: { name: "Alphonso Mango", origin: "Ratnagiri, MH", weight: "318g", color: "Golden Yellow" },
  sensors: {
    ethylene:    { value: 4.21, unit: "ppm",  safe: [0, 2],    label: "Ethylene",  icon: "⚗️" },
    ammonia:     { value: 0.23, unit: "ppm",  safe: [0, 0.1],  label: "NH₃",       icon: "🧪" },
    co2:         { value: 438,  unit: "ppm",  safe: [350, 450], label: "CO₂",      icon: "☁️" },
    temperature: { value: 29.1, unit: "°C",   safe: [20, 32],  label: "Temp",      icon: "🌡️" },
    humidity:    { value: 68.4, unit: "%",    safe: [50, 80],  label: "Humidity",  icon: "💧" },
    voc:         { value: 1.12, unit: "idx",  safe: [0, 0.6],  label: "VOC",       icon: "🔬" },
  },
  prediction: {
    label: "Chemically Ripened",
    edible: false,
    confidence: 93.2,
    naturalProb: 6.8,
    chemicalProb: 93.2,
    risk: "High",
    flags: ["Ethylene spike (4.21 ppm)", "NH₃ above threshold", "Uniform surface coloring"],
    model: "FruitSense-CNN v2.1",
    processedAt: new Date().toLocaleString("en-IN"),
    consume: "Avoid — chemical residues detected",
  },
  validity: {
    harvestedDaysAgo: 3,
    chemicalShelfDays: 5,
    storageAdvice: "Keep below 15°C, avoid direct sunlight",
    consume: false,
    stages: [
      { day: 0, label: "Harvested",          done: true },
      { day: 1, label: "Chemical treatment", done: true, alert: true },
      { day: 3, label: "Today",              done: true, current: true },
      { day: 4, label: "Peak visual",        done: false },
      { day: 6, label: "Overripe",           done: false, warn: true },
      { day: 8, label: "Spoiled",            done: false, danger: true },
    ],
  },
  nutrition: {
    calories: 60, carbs: 15, sugar: 14, fiber: 1.6, vitC: 36, vitA: 54,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: map backend response → exact UI shape
// ─────────────────────────────────────────────────────────────────────────────
function mapBackendToUI(b) {
  // stages: backend sends string[] → Timeline needs object[]
  const stagesRaw        = Array.isArray(b.validity?.stages) ? b.validity.stages : [];
  const harvestedDaysAgo = b.validity?.harvestedDaysAgo ?? 0;
  const shelfDays        = b.validity?.chemicalShelfDays ?? stagesRaw.length - 1;

  const stages = stagesRaw.map((label, i) => ({
    day:     i,
    label:   typeof label === "string" ? label : label.label ?? `D${i}`,
    done:    i <= harvestedDaysAgo,
    current: i === harvestedDaysAgo,
    warn:    i === stagesRaw.length - 2 && i !== harvestedDaysAgo,
    danger:  i === stagesRaw.length - 1,
    alert:   i === 1 && (b.prediction?.chemicalProb ?? 0) > 50,
  }));

  return {
    fruit: {
      name:   b.fruit   ?? "Unknown Fruit",
      origin: "Detected via CNN",
      weight: "—",
      color:  "—",
    },

    // sensors already match { value, unit, safe, label, icon }
    sensors: b.sensors,

    prediction: {
      label:        b.prediction?.label        ?? "Unknown",
      edible:       b.prediction?.edible       ?? false,
      confidence:   b.prediction?.confidence   ?? 0,
      naturalProb:  b.prediction?.naturalProb  ?? 0,
      chemicalProb: b.prediction?.chemicalProb ?? 0,
      risk:         b.prediction?.risk         ?? "Unknown",
      flags:        b.prediction?.flags        ?? [],
      model:        b.prediction?.model        ?? "FruitSense-CNN v2.1",
      processedAt:  b.prediction?.processedAt
                      ? new Date(b.prediction.processedAt).toLocaleString("en-IN")
                      : new Date().toLocaleString("en-IN"),
      // backend: boolean → UI: string
      consume: b.validity?.consume
                 ? "Safe to consume"
                 : "Avoid — chemical residues detected",
    },

    validity: {
      harvestedDaysAgo,
      chemicalShelfDays: shelfDays,
      storageAdvice: b.validity?.storageAdvice ?? "Store in a cool place.",
      consume:       b.validity?.consume       ?? false,
      stages,
    },

    nutrition: {
      calories: b.nutrition?.calories ?? 0,
      carbs:    b.nutrition?.carbs    ?? 0,
      sugar:    b.nutrition?.sugar    ?? 0,
      fiber:    b.nutrition?.fiber    ?? 0,
      vitC:     b.nutrition?.vitC     ?? 0,
      vitA:     b.nutrition?.vitA     ?? 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (IDENTICAL to original — zero UI changes)
// ─────────────────────────────────────────────────────────────────────────────
function StepBadge({ n, active, done }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 700, flexShrink: 0,
      background: done ? "#16a34a" : active ? "#f59e0b" : "#232323",
      color: done || active ? "white" : "#555",
      boxShadow: active ? "0 0 0 4px rgba(245,158,11,0.2)" : "none",
      transition: "all 0.4s",
    }}>
      {done ? "✓" : n}
    </div>
  );
}

function SensorPill({ data }) {
  const ok = data.value >= data.safe[0] && data.value <= data.safe[1];
  return (
    <div style={{
      background: ok ? "#052e16" : "#450a0a",
      border: `1px solid ${ok ? "#166534" : "#991b1b"}`,
      borderRadius: 12, padding: "10px 12px", textAlign: "center",
      animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1) both",
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{data.icon}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: ok ? "#4ade80" : "#f87171", fontFamily: "monospace", lineHeight: 1 }}>
        {data.value}
      </div>
      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{data.unit}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: ok ? "#4ade80" : "#f87171", marginTop: 2 }}>{data.label}</div>
      <div style={{
        marginTop: 4, fontSize: 9, padding: "2px 6px", borderRadius: 99,
        background: ok ? "#14532d" : "#7f1d1d",
        color: ok ? "#86efac" : "#fca5a5", fontWeight: 700,
      }}>
        {ok ? "NORMAL" : "ALERT"}
      </div>
    </div>
  );
}

function ProbBar({ label, value, color, delay }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value), delay || 200);
    return () => clearTimeout(t);
  }, [value, delay]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "#9ca3af" }}>{label}</span>
        <span style={{ fontWeight: 700, color, fontFamily: "monospace" }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "#232323", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

function Timeline({ stages }) {
  return (
    <div style={{ position: "relative", padding: "6px 0 2px" }}>
      <div style={{ position: "absolute", top: 19, left: "6%", right: "6%", height: 2, background: "#232323", zIndex: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        {stages.map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: "2px solid",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 800, marginBottom: 4,
              background: s.current ? "#f59e0b" : s.done ? "#16a34a" : s.danger ? "#450a0a" : s.warn ? "#451a03" : "#1a1a1a",
              borderColor: s.current ? "#f59e0b" : s.done ? "#16a34a" : s.danger ? "#dc2626" : s.warn ? "#ca8a04" : "#374151",
              color: s.current || s.done ? "white" : s.danger ? "#f87171" : s.warn ? "#fbbf24" : "#6b7280",
              boxShadow: s.current ? "0 0 0 3px rgba(245,158,11,0.3)" : "none",
            }}>
              {s.done && !s.current ? "✓" : s.alert ? "!" : `D${s.day}`}
            </div>
            <div style={{ fontSize: 8.5, textAlign: "center", color: s.current ? "#fbbf24" : s.danger ? "#f87171" : "#6b7280", fontWeight: s.current ? 700 : 400, maxWidth: 48, lineHeight: 1.3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NutritionRow({ label, value, max, unit, color }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW((value / max) * 100), 600);
    return () => clearTimeout(t);
  }, [value, max]);
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: "#9ca3af" }}>{label}</span>
        <span style={{ fontWeight: 600, color: "#d1d5db", fontFamily: "monospace" }}>{value}{unit}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "#232323", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);

  const [step,        setStep]        = useState(0);
  const [capturedImg, setCapturedImg] = useState(null);
  const [result,      setResult]      = useState(null);
  const [camErr,      setCamErr]      = useState(false);
  const [countdown,   setCountdown]   = useState(null);
  const [aStep,       setAStep]       = useState(0);
  const [backendErr,  setBackendErr]  = useState(null);  // NEW: surface errors

  const ASTEPS = [
    "Detecting fruit type from image...",
    "Initialising sensor array...",
    "Reading chemical signatures...",
    "Running FruitSense-CNN v2.1...",
    "Computing validity window...",
  ];

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCam = useCallback(async () => {
    setCamErr(false);
    setStep(1);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setCamErr(true);
    }
  }, []);

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => {
    let c = 3;
    setCountdown(c);
    const iv = setInterval(() => {
      c--;
      if (c === 0) {
        clearInterval(iv);
        setCountdown(null);
        const cv = canvasRef.current, vd = videoRef.current;
        if (cv && vd) {
          cv.width  = vd.videoWidth  || 640;
          cv.height = vd.videoHeight || 480;
          cv.getContext("2d").drawImage(vd, 0, 0);
          setCapturedImg(cv.toDataURL("image/jpeg"));
        }
        stopCam();
        setStep(2);
      } else {
        setCountdown(c);
      }
    }, 1000);
  }, [stopCam]);

  // ── Analyse — FIXED: real backend call + proper data mapping ─────────────
  const analyze = useCallback(async () => {
    setStep(3);
    setAStep(0);
    setBackendErr(null);

    // Animate steps while waiting for response
    const iv = setInterval(() => {
      setAStep(p => {
        if (p >= ASTEPS.length - 1) { clearInterval(iv); return p; }
        return p + 1;
      });
    }, 520);

    try {
      const res = await axios.post("http://127.0.0.1:5000/analyze", {
        image: capturedImg,
      }, {
        timeout: 30000,   // 30 s — CNN inference can be slow on CPU
      });

      clearInterval(iv);
      // Map backend shape → UI shape
      setResult(mapBackendToUI(res.data));
      setStep(4);

    } catch (err) {
      clearInterval(iv);

      // Build a human-readable error message
      let msg = "Backend error";
      if (err.code === "ECONNREFUSED" || err.message?.includes("Network Error")) {
        msg = "Cannot reach backend at http://127.0.0.1:5000 — is app.py running?";
      } else if (err.code === "ETIMEDOUT" || err.code === "ERR_NETWORK") {
        msg = "Request timed out — CNN inference may still be loading. Try again.";
      } else if (err.response) {
        msg = `Server error ${err.response.status}: ${err.response.data?.error ?? err.message}`;
      } else {
        msg = err.message;
      }

      console.error("[FruitSense]", msg, err);
      setBackendErr(msg);

      // Show mock data with error flag so UI doesn't break
      setResult({
        ...MOCK_RESPONSE,
        prediction: {
          ...MOCK_RESPONSE.prediction,
          flags: [...MOCK_RESPONSE.prediction.flags, "⚠️ Demo mode — backend offline"],
        },
      });
      setStep(4);
    }
  }, [capturedImg]);

  const reset = useCallback(() => {
    stopCam();
    setStep(0);
    setCapturedImg(null);
    setResult(null);
    setCamErr(false);
    setBackendErr(null);
  }, [stopCam]);

  const edible = result?.prediction?.edible;
  const sColor = edible ? "#16a34a" : "#dc2626";
  const sBg    = edible ? "#052e16" : "#450a0a";
  const sBd    = edible ? "#166534" : "#991b1b";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Outfit', 'Segoe UI', sans-serif", background: "#0a0a0a", minHeight: "100vh", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes popIn  { from{opacity:0;transform:scale(0.75)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes scan   { 0%{top:-8%} 100%{top:108%} }
        .fu  { animation: fadeUp 0.45s ease both; }
        .card{ background:#141414; border:1px solid #222; border-radius:16px; padding:18px; }
        .btn { background:#f59e0b; color:#0a0a0a; border:none; padding:13px 30px; border-radius:99px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; }
        .btn:hover { background:#fbbf24; transform:translateY(-1px); }
        .ghost{ background:transparent; color:#9ca3af; border:1px solid #222; padding:11px 22px; border-radius:99px; font-size:13px; cursor:pointer; font-family:inherit; transition:all .2s; }
        .ghost:hover{ border-color:#374151; color:#e5e7eb; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🍋</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>FruitSense</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>IoT + ML · Ripeness Detector</div>
          </div>
        </div>
        {step > 0 && <button className="ghost" onClick={reset} style={{ fontSize: 12 }}>↺ New Scan</button>}
      </div>

      {/* ── STEP TRACKER ── */}
      {step > 0 && (
        <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "12px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", maxWidth: 520, margin: "0 auto" }}>
            {["Camera", "Capture", "Analyse", "Results"].map((lbl, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? "1 1 auto" : "0 0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <StepBadge n={i + 1} active={step === i + 1} done={step > i + 1} />
                  <span style={{ fontSize: 9.5, color: step >= i + 1 ? "#f59e0b" : "#374151", fontWeight: step === i + 1 ? 700 : 400 }}>{lbl}</span>
                </div>
                {i < 3 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? "#16a34a" : "#1f1f1f", margin: "0 5px", marginBottom: 14, transition: "background .5s" }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 18px" }}>

        {/* ── BACKEND ERROR BANNER (shows only when backend failed) ── */}
        {backendErr && (
          <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, animation: "fadeUp .4s ease" }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>Backend Unreachable — Showing Demo Data</div>
              <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 2 }}>{backendErr}</div>
            </div>
          </div>
        )}

        {/* ─── IDLE ─── */}
        {step === 0 && (
          <div style={{ textAlign: "center", padding: "56px 20px", animation: "fadeUp .6s ease" }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🍎</div>
            <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 10px", background: "linear-gradient(130deg,#f59e0b,#fcd34d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Fruit Ripeness Detector
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, maxWidth: 360, margin: "0 auto 32px", lineHeight: 1.8 }}>
              Capture a fruit image → sensor tray reads chemical data → AI predicts natural or chemical ripening in ~3 seconds.
            </p>
            <button className="btn" onClick={startCam} style={{ fontSize: 15, padding: "15px 38px" }}>📷 Start Camera</button>
            <div style={{ marginTop: 36, display: "flex", justifyContent: "center", gap: 28 }}>
              {["📡 6 IoT Sensors", "🧠 CNN v2.1", "⚡ ~3s Scan", "📅 Validity Window"].map(t => (
                <div key={t} style={{ fontSize: 11, color: "#374151" }}>{t}</div>
              ))}
            </div>
          </div>
        )}

        {/* ─── CAMERA ─── */}
        {step === 1 && (
          <div className="fu" style={{ textAlign: "center" }}>
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#000", maxWidth: 560, margin: "0 auto 20px" }}>
              {camErr ? (
                <div style={{ height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontSize: 48 }}>📷</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>Camera unavailable — using demo mode</div>
                  <button className="btn" onClick={() => { stopCam(); setStep(2); }}>Continue with Demo Fruit →</button>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <div style={{ position: "absolute", top: "18%", left: "14%", right: "14%", bottom: "18%", border: "2px solid rgba(245,158,11,.55)", borderRadius: 12 }}>
                      {["tl","tr","bl","br"].map(c => (
                        <div key={c} style={{
                          position: "absolute", width: 18, height: 18,
                          top: c[0]==="t" ? -2 : "auto", bottom: c[0]==="b" ? -2 : "auto",
                          left: c[1]==="l" ? -2 : "auto", right: c[1]==="r" ? -2 : "auto",
                          borderTop:    c[0]==="t" ? "3px solid #f59e0b" : "none",
                          borderBottom: c[0]==="b" ? "3px solid #f59e0b" : "none",
                          borderLeft:   c[1]==="l" ? "3px solid #f59e0b" : "none",
                          borderRight:  c[1]==="r" ? "3px solid #f59e0b" : "none",
                        }} />
                      ))}
                      <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "rgba(245,158,11,.65)", animation: "scan 2s ease-in-out infinite" }} />
                    </div>
                    <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, fontSize: 11, color: "rgba(255,255,255,.5)", textAlign: "center" }}>
                      Align fruit within the frame
                    </div>
                  </div>
                  {countdown && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 90, fontWeight: 800, color: "#f59e0b", animation: "pulse 1s ease infinite" }}>{countdown}</div>
                    </div>
                  )}
                </>
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {!camErr && <button className="btn" onClick={capture} style={{ fontSize: 15, padding: "14px 38px" }}>📸 Capture Photo</button>}
          </div>
        )}

        {/* ─── REVIEW ─── */}
        {step === 2 && (
          <div className="fu" style={{ textAlign: "center" }}>
            <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", maxWidth: 540, margin: "0 auto 16px", border: "2px solid #f59e0b" }}>
              {capturedImg
                ? <img src={capturedImg} alt="Captured" style={{ width: "100%", display: "block" }} />
                : <div style={{ height: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#111", gap: 8 }}>
                    <div style={{ fontSize: 80 }}>🥭</div>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>Demo: Alphonso Mango</div>
                  </div>
              }
              <div style={{ position: "absolute", top: 12, left: 12, background: "#16a34a", color: "white", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99 }}>
                ✓ Captured
              </div>
            </div>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
              Place the fruit on the sensor tray, then press Analyse.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="ghost" onClick={() => { stopCam(); startCam(); }}>↺ Retake</button>
              <button className="btn" onClick={analyze} style={{ fontSize: 15 }}>🔬 Analyse Fruit →</button>
            </div>
          </div>
        )}

        {/* ─── ANALYSING ─── */}
        {step === 3 && (
          <div className="fu" style={{ textAlign: "center", padding: "44px 20px" }}>
            <div style={{ width: 76, height: 76, border: "4px solid #1f1f1f", borderTop: "4px solid #f59e0b", borderRadius: "50%", margin: "0 auto 26px", animation: "spin 1s linear infinite" }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Analysing your fruit...</h2>
            <div style={{ maxWidth: 360, margin: "0 auto" }}>
              {ASTEPS.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a1a", opacity: i <= aStep ? 1 : 0.22, transition: "opacity .4s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, background: i < aStep ? "#16a34a" : i === aStep ? "#f59e0b" : "#232323", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>
                    {i < aStep ? "✓" : i === aStep ? "●" : ""}
                  </div>
                  <span style={{ fontSize: 13, color: i <= aStep ? "#e5e7eb" : "#374151", textAlign: "left" }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {step === 4 && result && (
          <div>
            {/* Row 1: Image + Sensors */}
            <div className="fu" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ borderRadius: 16, overflow: "hidden", border: `2px solid ${sBd}`, position: "relative" }}>
                {capturedImg
                  ? <img src={capturedImg} alt="Scanned fruit" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  : <div style={{ aspectRatio: "1/1", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 68 }}>🥭</div>
                }
                <div style={{ padding: "10px 12px", background: "#111" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{result.fruit.name}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{result.fruit.origin} · {result.fruit.weight}</div>
                  <div style={{ fontSize: 10, color: "#4b5563", marginTop: 1 }}>{result.prediction.processedAt}</div>
                </div>
                <div style={{ position: "absolute", top: 10, right: 10, background: sBg, border: `1px solid ${sBd}`, color: sColor, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>
                  {edible ? "✓ SAFE" : "✗ UNSAFE"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>📡 Sensor Readings</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {Object.entries(result.sensors).map(([k, v], i) => (
                    <div key={k} style={{ animationDelay: `${i * 60}ms` }}>
                      <SensorPill data={v} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Verdict Banner */}
            <div className="fu" style={{ borderRadius: 16, padding: "14px 18px", marginBottom: 14, background: sBg, border: `1.5px solid ${sBd}`, display: "flex", alignItems: "center", gap: 14, animationDelay: "80ms" }}>
              <div style={{ fontSize: 36 }}>{edible ? "✅" : "🚫"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: sColor }}>{edible ? "Safe to Consume" : "NOT Safe to Consume"}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{edible ? "All sensor readings within natural ripening thresholds." : result.prediction.consume}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {result.prediction.flags.map(f => (
                    <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 99, background: "#7f1d1d", color: "#fca5a5", fontWeight: 600 }}>⚑ {f}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 38, fontWeight: 900, color: sColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{result.prediction.confidence}%</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>confidence</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, padding: "2px 10px", borderRadius: 99, background: result.prediction.risk === "High" ? "#7f1d1d" : "#14532d", color: result.prediction.risk === "High" ? "#fca5a5" : "#86efac" }}>
                  {result.prediction.risk} Risk
                </div>
              </div>
            </div>

            {/* Row 3: ML + Validity + Nutrition */}
            <div className="fu" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, animationDelay: "140ms" }}>

              {/* ML */}
              <div className="card">
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🧠 ML Prediction</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: sColor, marginBottom: 3, letterSpacing: "-0.02em" }}>{result.prediction.label}</div>
                <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 14 }}>Model: {result.prediction.model}</div>
                <ProbBar label="Natural Ripening"  value={result.prediction.naturalProb}  color="#16a34a" delay={300} />
                <ProbBar label="Chemical Ripening" value={result.prediction.chemicalProb} color="#dc2626" delay={450} />
              </div>

              {/* Validity */}
              <div className="card">
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>📅 Validity Window</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {[
                    { lbl: "Days since harvest",  val: result.validity.harvestedDaysAgo, c: "#f59e0b" },
                    { lbl: "Est. days remaining", val: Math.max(0, result.validity.chemicalShelfDays - result.validity.harvestedDaysAgo), c: sColor },
                  ].map(({ lbl, val, c }) => (
                    <div key={lbl} style={{ flex: 1, background: "#0d0d0d", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 9, color: "#4b5563", marginTop: 3 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <Timeline stages={result.validity.stages} />
                <div style={{ marginTop: 10, fontSize: 10, color: "#6b7280", lineHeight: 1.5, borderTop: "1px solid #1f1f1f", paddingTop: 8 }}>
                  💡 {result.validity.storageAdvice}
                </div>
              </div>

              {/* Nutrition */}
              <div className="card">
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🥗 Nutrition / 100g</div>
                <NutritionRow label="Calories"  value={result.nutrition.calories} max={120} unit=" kcal" color="#f59e0b" />
                <NutritionRow label="Carbs"     value={result.nutrition.carbs}    max={30}  unit="g"     color="#f97316" />
                <NutritionRow label="Sugar"     value={result.nutrition.sugar}    max={25}  unit="g"     color="#ec4899" />
                <NutritionRow label="Fibre"     value={result.nutrition.fiber}    max={5}   unit="g"     color="#22c55e" />
                <NutritionRow label="Vitamin C" value={result.nutrition.vitC}     max={100} unit="mg"    color="#06b6d4" />
                <NutritionRow label="Vitamin A" value={result.nutrition.vitA}     max={100} unit="µg"    color="#a78bfa" />
                <div style={{ marginTop: 8, fontSize: 9, color: "#374151" }}>* Typical values for {result.fruit.name}.</div>
              </div>
            </div>

            {/* Actions */}
            <div className="fu" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 22, animationDelay: "200ms" }}>
              <button className="ghost" onClick={reset}>↺ Scan Another Fruit</button>
              <button className="btn" onClick={() => window.print()}>⬇ Export Report</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}