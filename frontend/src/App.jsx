// import { useState, useRef, useEffect, useCallback } from "react";
// import axios from "axios";

// const API = "http://127.0.0.1:5000";

// function mapBackendToUI(b) {
//   const stagesRaw        = Array.isArray(b.validity?.stages) ? b.validity.stages : [];
//   const harvestedDaysAgo = b.validity?.harvestedDaysAgo ?? 0;
//   const shelfDays        = b.validity?.chemicalShelfDays ?? stagesRaw.length - 1;

//   const stages = stagesRaw.map((label, i) => ({
//     day:     i,
//     label:   typeof label === "string" ? label : label.label ?? `D${i}`,
//     done:    i <= harvestedDaysAgo,
//     current: i === harvestedDaysAgo,
//     warn:    i === stagesRaw.length - 2 && i !== harvestedDaysAgo,
//     danger:  i === stagesRaw.length - 1,
//     alert:   i === 1 && (b.prediction?.chemicalProb ?? 0) > 50,
//   }));

//   return {
//     fruit: {
//       name:   b.fruit ?? "Unknown Fruit",
//       origin: "Detected via CNN",
//     },
//     sensors:     b.sensors,
//     sampleCount: b.sample_count ?? 0,
//     prediction: {
//       label:        b.prediction?.label        ?? "Unknown",
//       edible:       b.prediction?.edible       ?? false,
//       confidence:   b.prediction?.confidence   ?? 0,
//       naturalProb:  b.prediction?.naturalProb  ?? 0,
//       chemicalProb: b.prediction?.chemicalProb ?? 0,
//       risk:         b.prediction?.risk         ?? "Unknown",
//       flags:        b.prediction?.flags        ?? [],
//       model:        b.prediction?.model        ?? "FruitSense-CNN v2.1",
//       processedAt:  b.prediction?.processedAt
//                       ? new Date(b.prediction.processedAt).toLocaleString("en-IN")
//                       : new Date().toLocaleString("en-IN"),
//       consume: b.validity?.consume ? "Safe to consume" : "Avoid — chemical residues detected",
//     },
//     validity: {
//       harvestedDaysAgo,
//       chemicalShelfDays: shelfDays,
//       storageAdvice: b.validity?.storageAdvice ?? "Store in a cool place.",
//       consume:       b.validity?.consume       ?? false,
//       stages,
//     },
//     nutrition: {
//       calories: b.nutrition?.calories ?? 0,
//       carbs:    b.nutrition?.carbs    ?? 0,
//       sugar:    b.nutrition?.sugar    ?? 0,
//       fiber:    b.nutrition?.fiber    ?? 0,
//       vitC:     b.nutrition?.vitC     ?? 0,
//       vitA:     b.nutrition?.vitA     ?? 0,
//     },
//   };
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Sub-components  (your originals, untouched)
// // ─────────────────────────────────────────────────────────────────────────────
// function StepBadge({ n, active, done }) {
//   return (
//     <div style={{
//       width: 28, height: 28, borderRadius: "50%",
//       display: "flex", alignItems: "center", justifyContent: "center",
//       fontSize: 12, fontWeight: 700, flexShrink: 0,
//       background: done ? "#16a34a" : active ? "#f59e0b" : "#232323",
//       color: done || active ? "white" : "#555",
//       boxShadow: active ? "0 0 0 4px rgba(245,158,11,0.2)" : "none",
//       transition: "all 0.4s",
//     }}>
//       {done ? "✓" : n}
//     </div>
//   );
// }

// function SensorPill({ data }) {
//   const ok = data.value >= data.safe[0] && data.value <= data.safe[1];
//   return (
//     <div style={{
//       background: ok ? "#052e16" : "#450a0a",
//       border: `1px solid ${ok ? "#166534" : "#991b1b"}`,
//       borderRadius: 12, padding: "10px 12px", textAlign: "center",
//       animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1) both",
//     }}>
//       <div style={{ fontSize: 16, marginBottom: 2 }}>{data.icon}</div>
//       <div style={{ fontSize: 19, fontWeight: 700, color: ok ? "#4ade80" : "#f87171", fontFamily: "monospace", lineHeight: 1 }}>
//         {data.value}
//       </div>
//       <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{data.unit}</div>
//       <div style={{ fontSize: 10, fontWeight: 600, color: ok ? "#4ade80" : "#f87171", marginTop: 2 }}>{data.label}</div>
//       <div style={{
//         marginTop: 4, fontSize: 9, padding: "2px 6px", borderRadius: 99,
//         background: ok ? "#14532d" : "#7f1d1d",
//         color: ok ? "#86efac" : "#fca5a5", fontWeight: 700,
//       }}>
//         {ok ? "NORMAL" : "ALERT"}
//       </div>
//     </div>
//   );
// }

// function ProbBar({ label, value, color, delay }) {
//   const [w, setW] = useState(0);
//   useEffect(() => {
//     const t = setTimeout(() => setW(value), delay || 200);
//     return () => clearTimeout(t);
//   }, [value, delay]);
//   return (
//     <div style={{ marginBottom: 12 }}>
//       <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
//         <span style={{ color: "#9ca3af" }}>{label}</span>
//         <span style={{ fontWeight: 700, color, fontFamily: "monospace" }}>{value.toFixed(1)}%</span>
//       </div>
//       <div style={{ height: 8, borderRadius: 99, background: "#232323", overflow: "hidden" }}>
//         <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
//       </div>
//     </div>
//   );
// }

// function Timeline({ stages }) {
//   return (
//     <div style={{ position: "relative", padding: "6px 0 2px" }}>
//       <div style={{ position: "absolute", top: 19, left: "6%", right: "6%", height: 2, background: "#232323", zIndex: 0 }} />
//       <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
//         {stages.map((s, i) => (
//           <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
//             <div style={{
//               width: 22, height: 22, borderRadius: "50%", border: "2px solid",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               fontSize: 8, fontWeight: 800, marginBottom: 4,
//               background: s.current ? "#f59e0b" : s.done ? "#16a34a" : s.danger ? "#450a0a" : s.warn ? "#451a03" : "#1a1a1a",
//               borderColor: s.current ? "#f59e0b" : s.done ? "#16a34a" : s.danger ? "#dc2626" : s.warn ? "#ca8a04" : "#374151",
//               color: s.current || s.done ? "white" : s.danger ? "#f87171" : s.warn ? "#fbbf24" : "#6b7280",
//               boxShadow: s.current ? "0 0 0 3px rgba(245,158,11,0.3)" : "none",
//             }}>
//               {s.done && !s.current ? "✓" : s.alert ? "!" : `D${s.day}`}
//             </div>
//             <div style={{ fontSize: 8.5, textAlign: "center", color: s.current ? "#fbbf24" : s.danger ? "#f87171" : "#6b7280", fontWeight: s.current ? 700 : 400, maxWidth: 48, lineHeight: 1.3 }}>
//               {s.label}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// function NutritionRow({ label, value, max, unit, color }) {
//   const [w, setW] = useState(0);
//   useEffect(() => {
//     const t = setTimeout(() => setW((value / max) * 100), 600);
//     return () => clearTimeout(t);
//   }, [value, max]);
//   return (
//     <div style={{ marginBottom: 7 }}>
//       <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
//         <span style={{ color: "#9ca3af" }}>{label}</span>
//         <span style={{ fontWeight: 600, color: "#d1d5db", fontFamily: "monospace" }}>{value}{unit}</span>
//       </div>
//       <div style={{ height: 5, borderRadius: 99, background: "#232323", overflow: "hidden" }}>
//         <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width 1s ease" }} />
//       </div>
//     </div>
//   );
// }

// // ── NEW: slim progress bar that fits your existing dark card style ─────────────
// function CollectionBar({ elapsed, total, samples }) {
//   const pct  = Math.min(100, (elapsed / total) * 100);
//   const secs = Math.max(0, Math.floor(total - elapsed));
//   return (
//     <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8, background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: 12, padding: "10px 20px", minWidth: 280 }}>
//       <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 11, color: "#6b7280" }}>
//         <span>Collecting sensor data...</span>
//         <span style={{ fontFamily: "monospace" }}>{secs}s left · {samples} samples</span>
//       </div>
//       <div style={{ width: "100%", height: 6, borderRadius: 99, background: "#1a1a1a", overflow: "hidden" }}>
//         <div style={{
//           height: "100%", width: `${pct}%`,
//           background: "linear-gradient(90deg,#f59e0b,#fbbf24)",
//           borderRadius: 99, transition: "width 1s ease",
//         }} />
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // Main App
// // ─────────────────────────────────────────────────────────────────────────────
// export default function App() {
//   const videoRef  = useRef(null);
//   const canvasRef = useRef(null);
//   const streamRef = useRef(null);
//   const pollRef   = useRef(null);

//   const [step,          setStep]          = useState(0);
//   const [capturedImg,   setCapturedImg]   = useState(null);
//   const [result,        setResult]        = useState(null);
//   const [camErr,        setCamErr]        = useState(false);
//   const [countdown,     setCountdown]     = useState(null);
//   const [aStep,         setAStep]         = useState(0);
//   const [error,         setError]         = useState(null);
//   const [detectedFruit, setDetectedFruit] = useState(null);
//   // eslint-disable-next-line no-unused-vars
//   const [sessionId,     setSessionId]     = useState(null);
//   const [sensorDots,    setSensorDots]    = useState(".");

//   // NEW sensor phase state — only used inside step 4
//   // "countdown"  = 15 s delay before LED activates
//   // "collecting" = LED ON, buffer filling (1 min)
//   const [sensorPhase,    setSensorPhase]    = useState(null);
//   const [countdownLeft,  setCountdownLeft]  = useState(15);
//   const [collectElapsed, setCollectElapsed] = useState(0);
//   const [collectSamples, setCollectSamples] = useState(0);
//   const COLLECTION_TOTAL = 60;   // 1 minute — matches backend COLLECTION_WINDOW_S

//   // BUG-1 FIX: ASTEPS inside component so ASTEPS.length is always correct
//   const ASTEPS = [
//     "Sending image to server...",
//     "Running FruitSense-CNN v2.1...",
//     "Detecting fruit type...",
//     "Activating sensor LED...",
//   ];

//   const STEP_LABELS = ["Camera", "Capture", "CNN", "Sensor", "Results"];

//   // Animate dots while collecting
//   useEffect(() => {
//     if (step !== 4 || sensorPhase !== "collecting") return;
//     const iv = setInterval(() => {
//       setSensorDots(d => d.length >= 3 ? "." : d + ".");
//     }, 500);
//     return () => clearInterval(iv);
//   }, [step, sensorPhase]);

//   // ── Camera ─────────────────────────────────────────────────────────────────
//   const startCam = useCallback(async () => {
//     setCamErr(false);
//     setStep(1);
//     try {
//       const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
//       streamRef.current = s;
//       if (videoRef.current) videoRef.current.srcObject = s;
//     } catch {
//       setCamErr(true);
//     }
//   }, []);

//   const stopCam = useCallback(() => {
//     streamRef.current?.getTracks().forEach(t => t.stop());
//     streamRef.current = null;
//   }, []);

//   const capture = useCallback(() => {
//     let c = 3;
//     setCountdown(c);
//     const iv = setInterval(() => {
//       c--;
//       if (c === 0) {
//         clearInterval(iv);
//         setCountdown(null);
//         const cv = canvasRef.current;
//         const vd = videoRef.current;
//         if (cv && vd) {
//           cv.width  = vd.videoWidth  || 640;
//           cv.height = vd.videoHeight || 480;
//           cv.getContext("2d").drawImage(vd, 0, 0);
//           setCapturedImg(cv.toDataURL("image/jpeg"));
//         }
//         stopCam();
//         setStep(2);
//       } else {
//         setCountdown(c);
//       }
//     }, 1000);
//   }, [stopCam]);

//   // ── Polling (replaces old blocking axios.get) ──────────────────────────────
//   const stopPolling = useCallback(() => {
//     if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
//   }, []);

//   const startPolling = useCallback((sid) => {
//     stopPolling();
//     pollRef.current = setInterval(async () => {
//       try {
//         const res  = await axios.get(`${API}/sensor-result`, { params: { session_id: sid } });
//         const data = res.data;

//         if (data.status === "waiting_for_activation") {
//           setSensorPhase("countdown");
//           setCountdownLeft(Math.ceil(data.countdown_s ?? 15));

//         } else if (data.status === "collecting") {
//           setSensorPhase("collecting");
//           setCollectElapsed(data.elapsed_s ?? 0);
//           setCollectSamples(data.samples   ?? 0);

//         } else if (data.status === "done") {
//           stopPolling();
//           setResult(mapBackendToUI(data));
//           setStep(5);

//         } else if (data.status === "error") {
//           stopPolling();
//           setError(data.message ?? "Sensor pipeline error.");
//         }
//       } catch (err) {
//         stopPolling();
//         setError(err.response?.data?.error ?? err.message ?? "Polling failed");
//       }
//     }, 3000);
//   }, [stopPolling]);

//   useEffect(() => () => stopPolling(), [stopPolling]);

//   // ── Step 3 → 4 → 5 flow ───────────────────────────────────────────────────
//   const analyzeImage = useCallback(async () => {
//     setStep(3);
//     setAStep(0);
//     setError(null);
//     setSensorPhase("countdown");
//     setCountdownLeft(15);
//     setCollectElapsed(0);
//     setCollectSamples(0);

//     const iv = setInterval(() => {
//       setAStep(p => {
//         if (p >= ASTEPS.length - 1) { clearInterval(iv); return p; }
//         return p + 1;
//       });
//     }, 500);

//     try {
//       const res = await axios.post(
//         `${API}/analyze-image`,
//         { image: capturedImg },
//         { timeout: 30000 },
//       );
//       clearInterval(iv);

//       const { fruit, confidence, session_id } = res.data;
//       if (fruit === "Unknown") {
//         setDetectedFruit({ name: fruit, confidence: Math.round(confidence * 10) / 10 });
//         setStep(4);        // go to step 4 UI
//         return;            // ❌ DO NOT start sensor
//       }

//       // ✅ Normal flow
//       setDetectedFruit({ name: fruit, confidence: Math.round(confidence * 10) / 10 });
//       setSessionId(session_id);
//       setStep(4);
//       startPolling(session_id);

//     } catch (err) {
//       clearInterval(iv);
//       let msg;
//       if (err.code === "ECONNREFUSED" || err.message?.includes("Network Error")) {
//         msg = "Cannot reach backend at http://127.0.0.1:5000 — is app.py running?";
//       } else if (err.code === "ECONNABORTED") {
//         msg = "Request timed out — CNN inference may be slow. Try again.";
//       } else if (err.response) {
//         msg = `Server error ${err.response.status}: ${err.response.data?.error ?? err.message}`;
//       } else {
//         msg = err.message ?? "Unknown error";
//       }
//       setError(msg);
//       setStep(2);
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [capturedImg, ASTEPS.length, startPolling]);

//   const reset = useCallback(() => {
//     stopCam();
//     stopPolling();
//     setStep(0);
//     setCapturedImg(null);
//     setResult(null);
//     setCamErr(false);
//     setError(null);
//     setDetectedFruit(null);
//     setSessionId(null);
//     setSensorPhase(null);
//     setCountdownLeft(15);
//     setCollectElapsed(0);
//     setCollectSamples(0);
//     setAStep(0);
//   }, [stopCam, stopPolling]);

//   const edible = result?.prediction?.edible;
//   const sColor = edible ? "#16a34a" : "#dc2626";
//   const sBg    = edible ? "#052e16" : "#450a0a";
//   const sBd    = edible ? "#166534" : "#991b1b";

//   // ─────────────────────────────────────────────────────────────────────────
//   return (
//     <div style={{ fontFamily: "'Outfit', 'Segoe UI', sans-serif", background: "#0a0a0a", minHeight: "100vh", color: "#f0f0f0" }}>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
//         @keyframes popIn    { from{opacity:0;transform:scale(0.75)} to{opacity:1;transform:scale(1)} }
//         @keyframes fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
//         @keyframes spin     { to{transform:rotate(360deg)} }
//         @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.35} }
//         @keyframes scan     { 0%{top:-8%} 100%{top:108%} }
//         @keyframes ledPulse { 0%,100%{box-shadow:0 0 0 4px rgba(250,204,21,0.25),0 0 12px rgba(250,204,21,0.5)} 50%{box-shadow:0 0 0 8px rgba(250,204,21,0.1),0 0 24px rgba(250,204,21,0.8)} }
//         .fu  { animation: fadeUp 0.45s ease both; }
//         .card{ background:#141414; border:1px solid #222; border-radius:16px; padding:18px; }
//         .btn { background:#f59e0b; color:#0a0a0a; border:none; padding:13px 30px; border-radius:99px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .2s; }
//         .btn:hover { background:#fbbf24; transform:translateY(-1px); }
//         .ghost{ background:transparent; color:#9ca3af; border:1px solid #222; padding:11px 22px; border-radius:99px; font-size:13px; cursor:pointer; font-family:inherit; transition:all .2s; }
//         .ghost:hover{ border-color:#374151; color:#e5e7eb; }
//       `}</style>

//       {/* ── HEADER ── */}
//       <div style={{ borderBottom: "1px solid #1a1a1a", padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d" }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
//           <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🍋</div>
//           <div>
//             <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>FruitSense</div>
//             <div style={{ fontSize: 10, color: "#4b5563" }}>IoT + ML · Ripeness Detector</div>
//           </div>
//         </div>
//         {step > 0 && <button className="ghost" onClick={reset} style={{ fontSize: 12 }}>↺ New Scan</button>}
//       </div>

//       {/* ── STEP TRACKER ── */}
//       {step > 0 && (
//         <div style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "12px 24px" }}>
//           <div style={{ display: "flex", alignItems: "center", maxWidth: 620, margin: "0 auto" }}>
//             {STEP_LABELS.map((lbl, i) => (
//               <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? "1 1 auto" : "0 0 auto" }}>
//                 <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
//                   <StepBadge n={i + 1} active={step === i + 1} done={step > i + 1} />
//                   <span style={{ fontSize: 9.5, color: step >= i + 1 ? "#f59e0b" : "#374151", fontWeight: step === i + 1 ? 700 : 400 }}>{lbl}</span>
//                 </div>
//                 {i < STEP_LABELS.length - 1 && (
//                   <div style={{ flex: 1, height: 2, background: step > i + 1 ? "#16a34a" : "#1f1f1f", margin: "0 5px", marginBottom: 14, transition: "background .5s" }} />
//                 )}
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 18px" }}>

//         {/* ── ERROR BANNER ── */}
//         {error && (
//           <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, animation: "fadeUp .4s ease" }}>
//             <span style={{ fontSize: 16 }}>⚠️</span>
//             <div>
//               <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171" }}>Error</div>
//               <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 2 }}>{error}</div>
//             </div>
//           </div>
//         )}

//         {/* ─── IDLE ─── */}
//         {step === 0 && (
//           <div style={{ textAlign: "center", padding: "56px 20px", animation: "fadeUp .6s ease" }}>
//             <div style={{ fontSize: 72, marginBottom: 16 }}>🍎</div>
//             <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 10px", background: "linear-gradient(130deg,#f59e0b,#fcd34d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
//               Fruit Ripeness Detector
//             </h1>
//             <p style={{ color: "#6b7280", fontSize: 14, maxWidth: 380, margin: "0 auto 32px", lineHeight: 1.8 }}>
//               Capture a fruit image → CNN identifies the fruit → LED signals you to place it near the sensor → AI predicts natural or chemical ripening.
//             </p>
//             <button className="btn" onClick={startCam} style={{ fontSize: 15, padding: "15px 38px" }}>📷 Start Camera</button>
//             <div style={{ marginTop: 36, display: "flex", justifyContent: "center", gap: 28 }}>
//               {["📡 6 IoT Sensors", "🧠 CNN v2.1", "💡 LED Guided", "📅 Validity Window"].map(t => (
//                 <div key={t} style={{ fontSize: 11, color: "#374151" }}>{t}</div>
//               ))}
//             </div>
//           </div>
//         )}

//         {/* ─── CAMERA ─── */}
//         {step === 1 && (
//           <div className="fu" style={{ textAlign: "center" }}>
//             <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#000", maxWidth: 560, margin: "0 auto 20px" }}>
//               {camErr ? (
//                 <div style={{ height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
//                   <div style={{ fontSize: 48 }}>📷</div>
//                   <div style={{ color: "#6b7280", fontSize: 13 }}>Camera unavailable</div>
//                 </div>
//               ) : (
//                 <>
//                   <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
//                   <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
//                     <div style={{ position: "absolute", top: "18%", left: "14%", right: "14%", bottom: "18%", border: "2px solid rgba(245,158,11,.55)", borderRadius: 12 }}>
//                       {["tl","tr","bl","br"].map(c => (
//                         <div key={c} style={{
//                           position: "absolute", width: 18, height: 18,
//                           top: c[0]==="t" ? -2 : "auto", bottom: c[0]==="b" ? -2 : "auto",
//                           left: c[1]==="l" ? -2 : "auto", right: c[1]==="r" ? -2 : "auto",
//                           borderTop:    c[0]==="t" ? "3px solid #f59e0b" : "none",
//                           borderBottom: c[0]==="b" ? "3px solid #f59e0b" : "none",
//                           borderLeft:   c[1]==="l" ? "3px solid #f59e0b" : "none",
//                           borderRight:  c[1]==="r" ? "3px solid #f59e0b" : "none",
//                         }} />
//                       ))}
//                       <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "rgba(245,158,11,.65)", animation: "scan 2s ease-in-out infinite" }} />
//                     </div>
//                     <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, fontSize: 11, color: "rgba(255,255,255,.5)", textAlign: "center" }}>
//                       Align fruit within the frame
//                     </div>
//                   </div>
//                   {countdown && (
//                     <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
//                       <div style={{ fontSize: 90, fontWeight: 800, color: "#f59e0b", animation: "pulse 1s ease infinite" }}>{countdown}</div>
//                     </div>
//                   )}
//                 </>
//               )}
//             </div>
//             <canvas ref={canvasRef} style={{ display: "none" }} />
//             {!camErr && <button className="btn" onClick={capture} style={{ fontSize: 15, padding: "14px 38px" }}>📸 Capture Photo</button>}
//           </div>
//         )}

//         {/* ─── REVIEW ─── */}
//         {step === 2 && (
//           <div className="fu" style={{ textAlign: "center" }}>
//             <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", maxWidth: 540, margin: "0 auto 16px", border: "2px solid #f59e0b" }}>
//               {capturedImg
//                 ? <img src={capturedImg} alt="Captured" style={{ width: "100%", display: "block" }} />
//                 : <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", background: "#111", fontSize: 80 }}>🥭</div>
//               }
//               <div style={{ position: "absolute", top: 12, left: 12, background: "#16a34a", color: "white", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99 }}>
//                 ✓ Captured
//               </div>
//             </div>
//             <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>
//               Ready to analyse. The LED will turn ON after detection — then place the fruit near the sensor.
//             </p>
//             <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
//               <button className="ghost" onClick={() => { stopCam(); startCam(); }}>↺ Retake</button>
//               <button className="btn" onClick={analyzeImage} style={{ fontSize: 15 }}>🔬 Analyse Fruit →</button>
//             </div>
//           </div>
//         )}

//         {/* ─── CNN RUNNING ─── */}
//         {step === 3 && (
//           <div className="fu" style={{ textAlign: "center", padding: "44px 20px" }}>
//             <div style={{ width: 76, height: 76, border: "4px solid #1f1f1f", borderTop: "4px solid #f59e0b", borderRadius: "50%", margin: "0 auto 26px", animation: "spin 1s linear infinite" }} />
//             <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>Identifying fruit...</h2>
//             <div style={{ maxWidth: 360, margin: "0 auto" }}>
//               {ASTEPS.map((s, i) => (
//                 <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a1a", opacity: i <= aStep ? 1 : 0.22, transition: "opacity .4s" }}>
//                   <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, background: i < aStep ? "#16a34a" : i === aStep ? "#f59e0b" : "#232323", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>
//                     {i < aStep ? "✓" : i === aStep ? "●" : ""}
//                   </div>
//                   <span style={{ fontSize: 13, color: i <= aStep ? "#e5e7eb" : "#374151", textAlign: "left" }}>{s}</span>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}
// {step === 4 && (
//   <div className="fu" style={{ textAlign: "center", padding: "36px 20px" }}>

//     {/* ❌ UNKNOWN FLOW (NO SENSOR, NO LED) */}
//     {detectedFruit && detectedFruit.name === "Unknown" ? (

//       <div>
//         <div style={{
//           display: "inline-flex",
//           alignItems: "center",
//           gap: 10,
//           background: "#450a0a",
//           border: "1px solid #991b1b",
//           borderRadius: 12,
//           padding: "14px 22px",
//           marginBottom: 20
//         }}>
//           <span style={{ fontSize: 20 }}>⚠️</span>
//           <span style={{ fontWeight: 700, fontSize: 16, color: "#f87171" }}>
//             Unknown fruit detected
//           </span>
//         </div>

//         <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>
//           This fruit is not in the trained dataset. Please capture again.
//         </p>

//         <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
//           <button className="ghost" onClick={reset}>
//             ↺ Start Over
//           </button>

//           <button
//             className="btn"
//             onClick={() => {
//               setStep(1);
//               startCam();
//             }}
//           >
//             📷 Retry Capture
//           </button>
//         </div>
//       </div>

//     ) : (

//       /* ✅ FULL SENSOR FLOW (UNCHANGED UI) */
//       <>
//         {/* Fruit Badge */}
//         {detectedFruit && (
//           <div style={{
//             display: "inline-flex",
//             alignItems: "center",
//             gap: 10,
//             background: "#0f2a0f",
//             border: "1px solid #166534",
//             borderRadius: 99,
//             padding: "8px 20px",
//             marginBottom: 28
//           }}>
//             <span style={{ fontSize: 18 }}>🧠</span>
//             <span style={{ fontWeight: 700, fontSize: 15, color: "#4ade80" }}>
//               {detectedFruit.name}
//             </span>
//             <span style={{ fontSize: 11, color: "#6b7280" }}>
//               detected · {detectedFruit.confidence}% confidence
//             </span>
//           </div>
//         )}

//         {/* LED UI */}
//         <div style={{ marginBottom: 24 }}>
//           <div style={{
//             width: 80, height: 80, borderRadius: "50%",
//             background: "#facc1522", border: "3px solid #facc15",
//             margin: "0 auto 12px",
//             display: "flex", alignItems: "center", justifyContent: "center",
//             animation: (error || sensorPhase === "countdown") ? "none" : "ledPulse 1.4s ease-in-out infinite",
//           }}>
//             <div style={{
//               width: 36, height: 36, borderRadius: "50%",
//               background: (error || sensorPhase === "countdown") ? "#374151" : "#facc15",
//               boxShadow: (error || sensorPhase === "countdown") ? "none" : "0 0 20px #facc15",
//             }} />
//           </div>

//           <div style={{ fontSize: 12, color: sensorPhase === "collecting" ? "#facc15" : "#4b5563", fontWeight: 600 }}>
//             {sensorPhase === "countdown"
//               ? `LED activates in ${countdownLeft}s — get ready`
//               : sensorPhase === "collecting"
//               ? "LED ON — Sensor Active"
//               : "LED OFF"}
//           </div>
//         </div>

//         {!error ? (
//           <>
//             <h2 style={{
//               fontSize: 26,
//               fontWeight: 800,
//               letterSpacing: "-0.03em",
//               color: "#facc15",
//               marginBottom: 10
//             }}>
//               {sensorPhase === "countdown"
//                 ? "Place the fruit near the sensor"
//                 : `Collecting data${sensorDots}`}
//             </h2>

//             <p style={{
//               color: "#9ca3af",
//               fontSize: 14,
//               maxWidth: 400,
//               margin: "0 auto 24px",
//               lineHeight: 1.8
//             }}>
//               {sensorPhase === "countdown"
//                 ? <>The LED will turn ON in <strong>{countdownLeft}s</strong>. Hold the <strong>{detectedFruit?.name}</strong> near the sensor.</>
//                 : <>Collecting readings for <strong>1 minute</strong>. Keep the <strong>{detectedFruit?.name}</strong> steady.</>
//               }
//             </p>

//             {/* Sensor labels */}
//             <div style={{ display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
//               {["MQ3 ⚗️", "MQ5 🧪", "MQ135 ☁️", "DHT11 🌡️"].map(s => (
//                 <div key={s} style={{
//                   background: "#111",
//                   border: "1px solid #222",
//                   borderRadius: 8,
//                   padding: "6px 14px",
//                   fontSize: 11,
//                   color: "#6b7280"
//                 }}>
//                   {s}
//                 </div>
//               ))}
//             </div>

//             {/* Progress */}
//             {sensorPhase === "collecting" ? (
//               <CollectionBar
//                 elapsed={collectElapsed}
//                 total={COLLECTION_TOTAL}
//                 samples={collectSamples}
//               />
//             ) : (
//               <div style={{
//                 display: "inline-flex",
//                 alignItems: "center",
//                 gap: 8,
//                 background: "#0d0d0d",
//                 border: "1px solid #1f1f1f",
//                 borderRadius: 99,
//                 padding: "8px 18px",
//                 fontSize: 12,
//                 color: "#6b7280"
//               }}>
//                 <div style={{
//                   width: 8,
//                   height: 8,
//                   borderRadius: "50%",
//                   background: "#f59e0b",
//                   animation: "pulse 1s ease infinite"
//                 }} />
//                 Waiting for sensor activation — {countdownLeft}s
//               </div>
//             )}

//           </>
//         ) : (
//           <div style={{ maxWidth: 440, margin: "0 auto" }}>
//             <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f87171" }}>
//               Sensor Error
//             </h2>
//             <p style={{ color: "#9ca3af" }}>{error}</p>

//             <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
//               <button className="ghost" onClick={reset}>↺ Start Over</button>
//               <button className="btn" onClick={() => { setError(null); analyzeImage(); }}>
//                 🔄 Retry
//               </button>
//             </div>
//           </div>
//         )}
//       </>
//     )}

//   </div>
// )}

//         {/* ─── STEP 5: RESULTS ─── */}
//         {step === 5 && result && (
//           <div>
//             {/* Row 1: Image + Sensor Readings */}
//             <div className="fu" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, marginBottom: 14 }}>
//               <div style={{ borderRadius: 16, overflow: "hidden", border: `2px solid ${sBd}`, position: "relative" }}>
//                 {capturedImg
//                   ? <img src={capturedImg} alt="Scanned fruit" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
//                   : <div style={{ aspectRatio: "1/1", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 68 }}>🥭</div>
//                 }
//                 <div style={{ padding: "10px 12px", background: "#111" }}>
//                   <div style={{ fontWeight: 700, fontSize: 13 }}>{result.fruit.name}</div>
//                   <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{result.fruit.origin}</div>
//                   <div style={{ fontSize: 10, color: "#4b5563", marginTop: 1 }}>{result.prediction.processedAt}</div>
//                 </div>
//                 <div style={{ position: "absolute", top: 10, right: 10, background: sBg, border: `1px solid ${sBd}`, color: sColor, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99 }}>
//                   {edible ? "✓ SAFE" : "✗ CONTAMINATED"}
//                 </div>
//               </div>

//               <div>
//                 <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>📡 Real Sensor Readings</div>
//                 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
//                   {Object.entries(result.sensors).map(([k, v], i) => (
//                     <div key={k} style={{ animationDelay: `${i * 60}ms` }}>
//                       <SensorPill data={v} />
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>

//             {/* Row 2: Verdict Banner */}
//             <div className="fu" style={{ borderRadius: 16, padding: "14px 18px", marginBottom: 14, background: sBg, border: `1.5px solid ${sBd}`, display: "flex", alignItems: "center", gap: 14, animationDelay: "80ms" }}>
//               <div style={{ fontSize: 36 }}>{edible ? "✅" : "🚫"}</div>
//               <div style={{ flex: 1 }}>
//                 <div style={{ fontWeight: 800, fontSize: 16, color: sColor }}>{edible ? "Safe to Consume" : "NOT Safe to Consume"}</div>
//                 <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{edible ? "All sensor readings within natural ripening thresholds." : result.prediction.consume}</div>
//                 <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
//                   {result.prediction.flags.map(f => (
//                     <span key={f} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 99, background: "#7f1d1d", color: "#fca5a5", fontWeight: 600 }}>⚑ {f}</span>
//                   ))}
//                 </div>
//               </div>
//               <div style={{ textAlign: "center", flexShrink: 0 }}>
//                 <div style={{ fontSize: 38, fontWeight: 900, color: sColor, lineHeight: 1 }}>{result.prediction.confidence}%</div>
//                 <div style={{ fontSize: 10, color: "#6b7280" }}>confidence</div>
//                 <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, padding: "2px 10px", borderRadius: 99, background: result.prediction.risk === "High" ? "#7f1d1d" : "#14532d", color: result.prediction.risk === "High" ? "#fca5a5" : "#86efac" }}>
//                   {result.prediction.risk} Risk
//                 </div>
//               </div>
//             </div>

//             {/* Row 3: ML + Validity + Nutrition */}
//             <div className="fu" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, animationDelay: "140ms" }}>
//               <div className="card">
//                 <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🧠 ML Prediction</div>
//                 <div style={{ fontSize: 17, fontWeight: 800, color: sColor, marginBottom: 3, letterSpacing: "-0.02em" }}>{result.prediction.label}</div>
//                 <div style={{ fontSize: 10, color: "#4b5563", marginBottom: 14 }}>Model: {result.prediction.model}</div>
//                 <ProbBar label="Natural Ripening"  value={result.prediction.naturalProb}  color="#16a34a" delay={300} />
//                 <ProbBar label="Chemical Ripening" value={result.prediction.chemicalProb} color="#dc2626" delay={450} />
//               </div>

//               <div className="card">
//                 <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>📅 Validity Window</div>
//                 <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
//                   {[
//                     { lbl: "Days since harvest",  val: result.validity.harvestedDaysAgo, c: "#f59e0b" },
//                     { lbl: "Est. days remaining", val: Math.max(0, result.validity.chemicalShelfDays - result.validity.harvestedDaysAgo), c: sColor },
//                   ].map(({ lbl, val, c }) => (
//                     <div key={lbl} style={{ flex: 1, background: "#0d0d0d", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
//                       <div style={{ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }}>{val}</div>
//                       <div style={{ fontSize: 9, color: "#4b5563", marginTop: 3 }}>{lbl}</div>
//                     </div>
//                   ))}
//                 </div>
//                 <Timeline stages={result.validity.stages} />
//                 <div style={{ marginTop: 10, fontSize: 10, color: "#6b7280", lineHeight: 1.5, borderTop: "1px solid #1f1f1f", paddingTop: 8 }}>
//                   💡 {result.validity.storageAdvice}
//                 </div>
//               </div>

//               <div className="card">
//                 <div style={{ fontSize: 9.5, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🥗 Nutrition / 100g</div>
//                 <NutritionRow label="Calories"  value={result.nutrition.calories} max={120} unit=" kcal" color="#f59e0b" />
//                 <NutritionRow label="Carbs"     value={result.nutrition.carbs}    max={30}  unit="g"     color="#f97316" />
//                 <NutritionRow label="Sugar"     value={result.nutrition.sugar}    max={25}  unit="g"     color="#ec4899" />
//                 <NutritionRow label="Fibre"     value={result.nutrition.fiber}    max={5}   unit="g"     color="#22c55e" />
//                 <NutritionRow label="Vitamin C" value={result.nutrition.vitC}     max={100} unit="mg"    color="#06b6d4" />
//                 <NutritionRow label="Vitamin A" value={result.nutrition.vitA}     max={100} unit="µg"    color="#a78bfa" />
//                 <div style={{ marginTop: 8, fontSize: 9, color: "#374151" }}>* Typical values for {result.fruit.name}.</div>
//               </div>
//             </div>

//             <div className="fu" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 22, animationDelay: "200ms" }}>
//               <button className="ghost" onClick={reset}>↺ Scan Another Fruit</button>
//               <button className="btn" onClick={() => window.print()}>⬇ Export Report</button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API = "http://127.0.0.1:5000";

// ─── ALL LOGIC UNCHANGED ──────────────────────────────────────────────────────
function mapBackendToUI(b) {
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
      name:   b.fruit ?? "Unknown Fruit",
      origin: "Detected via CNN",
    },
    sensors:     b.sensors,
    sampleCount: b.sample_count ?? 0,
    prediction: {
      label:        b.prediction?.label        ?? "Unknown",
      edible:       b.prediction?.edible       ?? false,
      confidence:   b.prediction?.confidence   ?? 0,
      naturalProb:  Number(b.prediction?.naturalProb  ?? 0),
      chemicalProb: Number(b.prediction?.chemicalProb ?? 0),
      risk:         b.prediction?.risk         ?? "Unknown",
      flags:        b.prediction?.flags        ?? [],
      model:        b.prediction?.model        ?? "FruitSense-CNN v2.1",
      processedAt:  b.prediction?.processedAt
                      ? new Date(b.prediction.processedAt).toLocaleString("en-IN")
                      : new Date().toLocaleString("en-IN"),
      consume: b.validity?.consume ? "CONFIDENCE" : "Avoid — chemical residues detected",
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

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:          "#0f172a",
  bgCard:      "rgba(255,255,255,0.04)",
  bgCardHover: "rgba(255,255,255,0.07)",
  border:      "rgba(255,255,255,0.08)",
  borderHover: "rgba(102,126,234,0.4)",
  grad1:       "linear-gradient(135deg,#667eea,#764ba2)",
  grad2:       "linear-gradient(135deg,#43cea2,#185a9d)",
  gradAccent:  "linear-gradient(135deg,#00f5a0,#00d9f5)",
  gradAmber:   "linear-gradient(135deg,#f59e0b,#ef4444)",
  accent:      "#00f5a0",
  accentBlue:  "#667eea",
  textPri:     "#ffffff",
  textSec:     "#cbd5e1",
  textMuted:   "#64748b",
  safe:        "#00f5a0",
  safeBg:      "rgba(0,245,160,0.08)",
  safeBd:      "rgba(0,245,160,0.25)",
  danger:      "#f87171",
  dangerBg:    "rgba(248,113,113,0.08)",
  dangerBd:    "rgba(248,113,113,0.25)",
  shadow:      "0 8px 32px rgba(0,0,0,0.4)",
  shadowCard:  "0 4px 24px rgba(0,0,0,0.3)",
  blur:        "backdrop-filter:blur(16px)",
  radius:      18,
  radiusSm:    12,
};

// ─── GLASS CARD HELPER ────────────────────────────────────────────────────────
const glass = (extra = {}) => ({
  background:     T.bgCard,
  border:         `1px solid ${T.border}`,
  borderRadius:   T.radius,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow:      T.shadowCard,
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — same props/logic, premium visual treatment
// ─────────────────────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 700, flexShrink: 0,
      background: done
        ? "linear-gradient(135deg,#00f5a0,#00d9f5)"
        : active
        ? "linear-gradient(135deg,#667eea,#764ba2)"
        : "rgba(255,255,255,0.06)",
      color: done || active ? "#fff" : T.textMuted,
      boxShadow: active
        ? "0 0 0 4px rgba(102,126,234,0.25), 0 0 16px rgba(102,126,234,0.4)"
        : done
        ? "0 0 0 4px rgba(0,245,160,0.15)"
        : "none",
      transition: "all 0.45s cubic-bezier(.4,0,.2,1)",
      border: `1px solid ${done ? "rgba(0,245,160,0.3)" : active ? "rgba(102,126,234,0.5)" : T.border}`,
    }}>
      {done ? "✓" : n}
    </div>
  );
}

function SensorPill({ data }) {
  const ok = data.value >= data.safe[0] && data.value <= data.safe[1];
  return (
    <div className="sensor-pill" style={{
      background: ok ? "rgba(0,245,160,0.06)" : "rgba(248,113,113,0.06)",
      border: `1px solid ${ok ? "rgba(0,245,160,0.2)" : "rgba(248,113,113,0.2)"}`,
      borderRadius: T.radiusSm,
      padding: "12px 10px",
      textAlign: "center",
      animation: "popIn 0.5s cubic-bezier(.34,1.56,.64,1) both",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{data.icon}</div>
      <div style={{
        fontSize: 20, fontWeight: 800,
        color: ok ? T.safe : T.danger,
        fontFamily: "'DM Mono', monospace",
        lineHeight: 1,
        textShadow: ok ? "0 0 12px rgba(0,245,160,0.4)" : "0 0 12px rgba(248,113,113,0.4)",
      }}>
        {data.value}
      </div>
      <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2, letterSpacing: "0.05em" }}>{data.unit}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: ok ? T.safe : T.danger, marginTop: 3 }}>{data.label}</div>
      <div style={{
        marginTop: 5, fontSize: 9, padding: "2px 7px", borderRadius: 99,
        background: ok ? "rgba(0,245,160,0.12)" : "rgba(248,113,113,0.12)",
        color: ok ? T.safe : T.danger,
        fontWeight: 700, letterSpacing: "0.08em",
        border: `1px solid ${ok ? "rgba(0,245,160,0.2)" : "rgba(248,113,113,0.2)"}`,
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
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: T.textSec, fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${w}%`, background: color,
          borderRadius: 99, transition: "width 1.4s cubic-bezier(.4,0,.2,1)",
          boxShadow: `0 0 8px ${color}80`,
        }} />
      </div>
    </div>
  );
}

function Timeline({ stages }) {
  return (
    <div style={{ position: "relative", padding: "8px 0 4px" }}>
      <div style={{ position: "absolute", top: 20, left: "6%", right: "6%", height: 2, background: "rgba(255,255,255,0.06)", zIndex: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        {stages.map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", border: "2px solid",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 800, marginBottom: 5,
              background: s.current
                ? "linear-gradient(135deg,#667eea,#764ba2)"
                : s.done
                ? "rgba(0,245,160,0.15)"
                : s.danger
                ? "rgba(248,113,113,0.1)"
                : s.warn
                ? "rgba(245,158,11,0.1)"
                : "rgba(255,255,255,0.04)",
              borderColor: s.current ? "#667eea" : s.done ? T.safe : s.danger ? T.danger : s.warn ? "#f59e0b" : T.border,
              color: s.current || s.done ? "#fff" : s.danger ? T.danger : s.warn ? "#f59e0b" : T.textMuted,
              boxShadow: s.current ? "0 0 0 3px rgba(102,126,234,0.3), 0 0 12px rgba(102,126,234,0.4)" : "none",
              transition: "all 0.3s ease",
            }}>
              {s.done && !s.current ? "✓" : s.alert ? "!" : `D${s.day}`}
            </div>
            <div style={{
              fontSize: 8.5, textAlign: "center",
              color: s.current ? "#667eea" : s.danger ? T.danger : T.textMuted,
              fontWeight: s.current ? 700 : 400,
              maxWidth: 48, lineHeight: 1.3,
            }}>
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
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: T.textSec, fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color: T.textPri, fontFamily: "'DM Mono', monospace" }}>{value}{unit}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${w}%`, background: color,
          borderRadius: 99, transition: "width 1.1s ease",
          boxShadow: `0 0 6px ${color}80`,
        }} />
      </div>
    </div>
  );
}

function CollectionBar({ elapsed, total, samples }) {
  const pct  = Math.min(100, (elapsed / total) * 100);
  const secs = Math.max(0, Math.floor(total - elapsed));
  return (
    <div style={{
      ...glass({ padding: "14px 24px", minWidth: 300, borderRadius: 14 }),
      display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10,
      border: "1px solid rgba(102,126,234,0.25)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 11, color: T.textSec }}>
        <span style={{ fontWeight: 500 }}>Collecting sensor data...</span>
        <span style={{ fontFamily: "'DM Mono', monospace", color: T.accentBlue }}>{secs}s · {samples} samples</span>
      </div>
      <div style={{ width: "100%", height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: "linear-gradient(90deg,#667eea,#00f5a0)",
          borderRadius: 99, transition: "width 1s ease",
          boxShadow: "0 0 8px rgba(102,126,234,0.6)",
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App — ALL LOGIC IDENTICAL, ONLY VISUALS UPGRADED
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const pollRef   = useRef(null);

  const [step,          setStep]          = useState(0);
  const [capturedImg,   setCapturedImg]   = useState(null);
  const [result,        setResult]        = useState(null);
  const [camErr,        setCamErr]        = useState(false);
  const [countdown,     setCountdown]     = useState(null);
  const [aStep,         setAStep]         = useState(0);
  const [error,         setError]         = useState(null);
  const [detectedFruit, setDetectedFruit] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [sessionId,     setSessionId]     = useState(null);
  const [sensorDots,    setSensorDots]    = useState(".");

  const [sensorPhase,    setSensorPhase]    = useState(null);
  const [countdownLeft,  setCountdownLeft]  = useState(15);
  const [collectElapsed, setCollectElapsed] = useState(0);
  const [collectSamples, setCollectSamples] = useState(0);
  const COLLECTION_TOTAL = 60;

  const ASTEPS = [
    "Sending image to server...",
    "Running FruitSense-CNN v2.1...",
    "Detecting fruit type...",
    "Activating sensor LED...",
  ];

  const STEP_LABELS = ["Camera", "Capture", "CNN", "Sensor", "Results"];

  useEffect(() => {
    if (step !== 4 || sensorPhase !== "collecting") return;
    const iv = setInterval(() => {
      setSensorDots(d => d.length >= 3 ? "." : d + ".");
    }, 500);
    return () => clearInterval(iv);
  }, [step, sensorPhase]);

  // ── Camera ──────────────────────────────────────────────────────────────────
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
        const cv = canvasRef.current;
        const vd = videoRef.current;
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

  // ── Polling ─────────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback((sid) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res  = await axios.get(`${API}/sensor-result`, { params: { session_id: sid } });
        const data = res.data;

        if (data.status === "waiting_for_activation") {
          setSensorPhase("countdown");
          setCountdownLeft(Math.ceil(data.countdown_s ?? 15));
        } else if (data.status === "collecting") {
          setSensorPhase("collecting");
          setCollectElapsed(data.elapsed_s ?? 0);
          setCollectSamples(data.samples   ?? 0);
        } else if (data.status === "done") {
          stopPolling();
          setResult(mapBackendToUI(data));
          setStep(5);
        } else if (data.status === "error") {
          stopPolling();
          setError(data.message ?? "Sensor pipeline error.");
        }
      } catch (err) {
        stopPolling();
        setError(err.response?.data?.error ?? err.message ?? "Polling failed");
      }
    }, 3000);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Step 3 → 4 → 5 flow ────────────────────────────────────────────────────
  const analyzeImage = useCallback(async () => {
    setStep(3);
    setAStep(0);
    setError(null);
    setSensorPhase("countdown");
    setCountdownLeft(15);
    setCollectElapsed(0);
    setCollectSamples(0);

    const iv = setInterval(() => {
      setAStep(p => {
        if (p >= ASTEPS.length - 1) { clearInterval(iv); return p; }
        return p + 1;
      });
    }, 500);

    try {
      const res = await axios.post(
        `${API}/analyze-image`,
        { image: capturedImg },
        { timeout: 30000 },
      );
      clearInterval(iv);

      const { fruit, confidence, session_id } = res.data;
      if (fruit === "Unknown") {
        setDetectedFruit({ name: fruit, confidence: Math.round(confidence * 10) / 10 });
        setStep(4);
        return;
      }

      setDetectedFruit({ name: fruit, confidence: Math.round(confidence * 10) / 10 });
      setSessionId(session_id);
      setStep(4);
      startPolling(session_id);

    } catch (err) {
      clearInterval(iv);
      let msg;
      if (err.code === "ECONNREFUSED" || err.message?.includes("Network Error")) {
        msg = "Cannot reach backend at http://127.0.0.1:5000 — is app.py running?";
      } else if (err.code === "ECONNABORTED") {
        msg = "Request timed out — CNN inference may be slow. Try again.";
      } else if (err.response) {
        msg = `Server error ${err.response.status}: ${err.response.data?.error ?? err.message}`;
      } else {
        msg = err.message ?? "Unknown error";
      }
      setError(msg);
      setStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedImg, ASTEPS.length, startPolling]);

  const reset = useCallback(() => {
    stopCam();
    stopPolling();
    setStep(0);
    setCapturedImg(null);
    setResult(null);
    setCamErr(false);
    setError(null);
    setDetectedFruit(null);
    setSessionId(null);
    setSensorPhase(null);
    setCountdownLeft(15);
    setCollectElapsed(0);
    setCollectSamples(0);
    setAStep(0);
  }, [stopCam, stopPolling]);

  const edible = result?.prediction?.edible;
  const sColor = edible ? T.safe    : T.danger;
  const sBg    = edible ? T.safeBg  : T.dangerBg;
  const sBd    = edible ? T.safeBd  : T.dangerBd;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif", background: T.bg, minHeight: "100vh", color: T.textPri, overflowX: "hidden" }}>

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        /* ── Keyframes ── */
        @keyframes popIn     { from{opacity:0;transform:scale(0.7) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes spin      { to{transform:rotate(360deg)} }
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes scan      { 0%{top:-8%} 100%{top:108%} }
        @keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes glow      { 0%,100%{box-shadow:0 0 16px rgba(102,126,234,0.3)} 50%{box-shadow:0 0 32px rgba(102,126,234,0.7),0 0 60px rgba(118,75,162,0.3)} }
        @keyframes ledPulse  { 0%,100%{box-shadow:0 0 0 5px rgba(102,126,234,0.2),0 0 20px rgba(102,126,234,0.4)} 50%{box-shadow:0 0 0 10px rgba(102,126,234,0.08),0 0 40px rgba(118,75,162,0.7)} }
        @keyframes borderFlow {
          0%   { border-color: rgba(102,126,234,0.4); }
          33%  { border-color: rgba(0,245,160,0.4); }
          66%  { border-color: rgba(118,75,162,0.4); }
          100% { border-color: rgba(102,126,234,0.4); }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes orb1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%  { transform: translate(60px,-40px) scale(1.1); }
          66%  { transform: translate(-30px,50px) scale(0.9); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%  { transform: translate(-70px,30px) scale(1.05); }
          66%  { transform: translate(40px,-60px) scale(1.1); }
        }

        /* ── Utilities ── */
        .fu  { animation: fadeUp 0.5s cubic-bezier(.4,0,.2,1) both; }
        .fi  { animation: fadeIn 0.5s ease both; }

        /* ── Glass card ── */
        .card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 20px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
          border-color: rgba(102,126,234,0.25);
        }

        /* ── Buttons ── */
        .btn {
          background: linear-gradient(135deg,#667eea,#764ba2);
          color: #fff;
          border: none;
          padding: 13px 32px;
          border-radius: 99px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.22s ease;
          box-shadow: 0 4px 20px rgba(102,126,234,0.4);
          letter-spacing: 0.01em;
        }
        .btn:hover  { transform: translateY(-2px) scale(1.03); box-shadow: 0 8px 28px rgba(102,126,234,0.55); }
        .btn:active { transform: scale(0.96); }

        .btn-accent {
          background: linear-gradient(135deg,#00f5a0,#00d9f5);
          color: #0f172a;
          border: none;
          padding: 13px 32px;
          border-radius: 99px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.22s ease;
          box-shadow: 0 4px 20px rgba(0,245,160,0.35);
        }
        .btn-accent:hover  { transform: translateY(-2px) scale(1.03); box-shadow: 0 8px 28px rgba(0,245,160,0.5); }
        .btn-accent:active { transform: scale(0.96); }

        .ghost {
          background: rgba(255,255,255,0.05);
          color: ${T.textSec};
          border: 1px solid rgba(255,255,255,0.1);
          padding: 11px 24px;
          border-radius: 99px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.22s ease;
          backdrop-filter: blur(8px);
        }
        .ghost:hover {
          border-color: rgba(102,126,234,0.4);
          color: #fff;
          background: rgba(102,126,234,0.1);
          transform: translateY(-1px);
        }
        .ghost:active { transform: scale(0.97); }

        /* ── Sensor pill hover ── */
        .sensor-pill:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .grid-3 { grid-template-columns: 1fr !important; }
          .grid-img { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
          .stack-mobile { flex-direction: column !important; }
        }
        @media (max-width: 480px) {
          .sensor-grid { grid-template-columns: repeat(2,1fr) !important; }
          .step-label  { display: none !important; }
        }
      `}</style>

      {/* ── AMBIENT ORB BACKGROUND ── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(102,126,234,0.12) 0%,transparent 70%)", animation: "orb1 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,245,160,0.07) 0%,transparent 70%)", animation: "orb2 22s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: "40%", left: "50%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(118,75,162,0.08) 0%,transparent 70%)", transform: "translateX(-50%)" }} />
      </div>

      {/* ── HEADER ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "14px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(15,23,42,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg,#667eea,#764ba2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
            boxShadow: "0 4px 16px rgba(102,126,234,0.4)",
          }}>🍋</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.04em", background: "linear-gradient(135deg,#fff,#cbd5e1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              FruitSense
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", fontWeight: 500 }}>IoT + ML · RIPENESS DETECTOR</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, boxShadow: `0 0 8px ${T.accent}`, animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>LIVE</span>
          {step > 0 && <button className="ghost" onClick={reset} style={{ fontSize: 12, padding: "8px 18px", marginLeft: 8 }}>↺ New Scan</button>}
        </div>
      </div>

      {/* ── STEP TRACKER ── */}
      {step > 0 && (
        <div style={{
          background: "rgba(15,23,42,0.6)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "14px 28px",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", maxWidth: 640, margin: "0 auto" }}>
            {STEP_LABELS.map((lbl, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? "1 1 auto" : "0 0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <StepBadge n={i + 1} active={step === i + 1} done={step > i + 1} />
                  <span className="step-label" style={{
                    fontSize: 9.5, fontWeight: step === i + 1 ? 700 : 500,
                    color: step > i + 1 ? T.accent : step === i + 1 ? T.accentBlue : T.textMuted,
                    letterSpacing: "0.04em",
                    transition: "color 0.3s ease",
                  }}>{lbl}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: "0 6px", marginBottom: 18,
                    background: step > i + 1
                      ? "linear-gradient(90deg,#00f5a0,#00d9f5)"
                      : "rgba(255,255,255,0.07)",
                    borderRadius: 99,
                    transition: "background 0.6s ease",
                    boxShadow: step > i + 1 ? "0 0 8px rgba(0,245,160,0.3)" : "none",
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px", position: "relative", zIndex: 1 }}>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div style={{
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: T.radiusSm,
            padding: "12px 18px",
            marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12,
            animation: "fadeUp .4s ease",
            backdropFilter: "blur(12px)",
          }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>⚠️</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.danger, marginBottom: 2, letterSpacing: "0.02em" }}>ERROR</div>
              <div style={{ fontSize: 11, color: "#fca5a5" }}>{error}</div>
            </div>
          </div>
        )}

        {/* ─── STEP 0: IDLE ─── */}
        {step === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeUp .7s ease" }}>
            <div style={{ fontSize: 80, marginBottom: 10, animation: "float 4s ease-in-out infinite", display: "inline-block" }}>🍎</div>

            <h1 style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: "-0.05em",
                margin: "12px 0 16px",
                lineHeight: 1.2,
                paddingBottom: 8,

                background:
                  "linear-gradient(135deg,#667eea 0%,#764ba2 40%,#00f5a0 100%)",

                backgroundSize: "200% 200%",

                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",

                animation: "gradientShift 4s ease infinite",
              }}>
              Fruit Ripeness Detector
            </h1>

            <p style={{ color: T.textSec, fontSize: 15, maxWidth: 420, margin: "0 auto 36px", lineHeight: 1.85, fontWeight: 400 }}>
              Capture a fruit image → CNN identifies the fruit → LED signals you to place it near the sensor → AI predicts natural or chemical ripening.
            </p>

            <button className="btn" onClick={startCam} style={{ fontSize: 15, padding: "16px 44px" }}>
              📷 Start Camera
            </button>

            <div style={{ marginTop: 48, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              {[
                { icon: "📡", label: "6 IoT Sensors" },
                { icon: "🧠", label: "CNN v2.1" },
                { icon: "💡", label: "LED Guided" },
                { icon: "📅", label: "Validity Window" },
              ].map(({ icon, label }) => (
                <div key={label} style={{
                  ...glass({ padding: "8px 16px", borderRadius: 99 }),
                  fontSize: 12, color: T.textSec, fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.2s ease",
                }}>
                  <span>{icon}</span> {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 1: CAMERA ─── */}
        {step === 1 && (
          <div className="fu" style={{ textAlign: "center" }}>
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden",
              background: "#000", maxWidth: 580, margin: "0 auto 24px",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 0 1px rgba(102,126,234,0.2), 0 24px 64px rgba(0,0,0,0.5)",
              animation: "borderFlow 4s linear infinite",
            }}>
              {camErr ? (
                <div style={{ height: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 52 }}>📷</div>
                  <div style={{ color: T.textMuted, fontSize: 14 }}>Camera unavailable</div>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <div style={{ position: "absolute", top: "18%", left: "14%", right: "14%", bottom: "18%", border: "1.5px solid rgba(102,126,234,0.6)", borderRadius: 14 }}>
                      {["tl","tr","bl","br"].map(c => (
                        <div key={c} style={{
                          position: "absolute", width: 20, height: 20,
                          top: c[0]==="t" ? -2 : "auto", bottom: c[0]==="b" ? -2 : "auto",
                          left: c[1]==="l" ? -2 : "auto", right: c[1]==="r" ? -2 : "auto",
                          borderTop:    c[0]==="t" ? "2.5px solid #667eea" : "none",
                          borderBottom: c[0]==="b" ? "2.5px solid #667eea" : "none",
                          borderLeft:   c[1]==="l" ? "2.5px solid #667eea" : "none",
                          borderRight:  c[1]==="r" ? "2.5px solid #667eea" : "none",
                          borderRadius: c === "tl" ? "4px 0 0 0" : c === "tr" ? "0 4px 0 0" : c === "bl" ? "0 0 0 4px" : "0 0 4px 0",
                        }} />
                      ))}
                      <div style={{ position: "absolute", left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg,transparent,#667eea,transparent)", animation: "scan 2.2s ease-in-out infinite", boxShadow: "0 0 6px #667eea" }} />
                    </div>
                    <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", letterSpacing: "0.05em" }}>
                      ALIGN FRUIT WITHIN FRAME
                    </div>
                  </div>
                  {countdown !== null && countdown > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",

                      zIndex: 100,

                      width: 150,
                      height: 150,
                      borderRadius: "50%",

                      background: "rgba(5,10,20,0.45)",
                      border: "1px solid rgba(255,255,255,0.12)",

                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",

                      boxShadow:
                        "0 0 40px rgba(102,126,234,0.35)",

                      backdropFilter: "none",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 72,
                        fontWeight: 900,
                        lineHeight: 1,

                        background:
                          "linear-gradient(135deg,#667eea,#00f5a0)",

                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",

                        animation: "pulse 1s ease infinite",
                      }}
                    >
                      {countdown}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      CAPTURING
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {!camErr && (
              <button className="btn" onClick={capture} style={{ fontSize: 15, padding: "15px 44px" }}>
                📸 Capture Photo
              </button>
            )}
          </div>
        )}

        {/* ─── STEP 2: REVIEW ─── */}
        {step === 2 && (
          <div className="fu" style={{ textAlign: "center" }}>
            <div style={{
              position: "relative", borderRadius: 20, overflow: "hidden",
              maxWidth: 560, margin: "0 auto 20px",
              border: "1px solid rgba(0,245,160,0.3)",
              boxShadow: "0 0 32px rgba(0,245,160,0.1), 0 24px 64px rgba(0,0,0,0.5)",
            }}>
              {capturedImg
                ? <img
                    src={capturedImg}
                    alt="Captured"
                    style={{
                      width: "100%",
                      height: 420,
                      objectFit: "cover",
                      display: "block",
                      background: "#000",
                       animation: "fadeZoom .45s ease",
                    }}
                  /> 
                  
                : <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)", fontSize: 80 }}>🥭</div>
              }
              <div style={{
                position: "absolute", top: 14, left: 14,
                background: "linear-gradient(135deg,#00f5a0,#00d9f5)",
                color: "#0f172a", fontSize: 11, fontWeight: 800,
                padding: "5px 14px", borderRadius: 99, letterSpacing: "0.04em",
              }}>
                ✓ CAPTURED
              </div>
            </div>

            <p style={{ color: T.textSec, fontSize: 13, marginBottom: 24, lineHeight: 1.8, maxWidth: 420, margin: "0 auto 24px" }}>
              Ready to analyse. The LED will turn ON after detection — then place the fruit near the sensor.
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="ghost" onClick={() => { stopCam(); startCam(); }}>↺ Retake</button>
              <button className="btn" onClick={analyzeImage} style={{ fontSize: 15 }}>🔬 Analyse Fruit →</button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: CNN RUNNING ─── */}
        {step === 3 && (
          <div className="fu" style={{ textAlign: "center", padding: "48px 20px" }}>
            {/* Animated spinner ring */}
            <div style={{ position: "relative", width: 90, height: 90, margin: "0 auto 30px" }}>
              <div style={{
                position: "absolute", inset: 0,
                border: "3px solid rgba(255,255,255,0.06)",
                borderTop: "3px solid #667eea",
                borderRight: "3px solid #764ba2",
                borderRadius: "50%",
                animation: "spin 0.9s linear infinite",
                boxShadow: "0 0 20px rgba(102,126,234,0.4)",
              }} />
              <div style={{
                position: "absolute", inset: 8,
                border: "2px solid rgba(255,255,255,0.04)",
                borderBottom: "2px solid #00f5a0",
                borderRadius: "50%",
                animation: "spin 1.4s linear infinite reverse",
              }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🧠</div>
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#fff,#cbd5e1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Identifying fruit...
            </h2>
            <p style={{ color: T.textMuted, fontSize: 13, marginBottom: 28 }}>AI is processing your image</p>

            <div style={{ maxWidth: 380, margin: "0 auto", ...glass({ padding: "8px 0" }) }}>
              {ASTEPS.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 20px",
                  borderBottom: i < ASTEPS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  opacity: i <= aStep ? 1 : 0.2,
                  transition: "opacity 0.4s ease",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                    background: i < aStep
                      ? "linear-gradient(135deg,#00f5a0,#00d9f5)"
                      : i === aStep
                      ? "linear-gradient(135deg,#667eea,#764ba2)"
                      : "rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: "white", fontWeight: 800,
                    boxShadow: i === aStep ? "0 0 8px rgba(102,126,234,0.5)" : "none",
                    transition: "all 0.3s ease",
                  }}>
                    {i < aStep ? "✓" : i === aStep ? "●" : ""}
                  </div>
                  <span style={{ fontSize: 13, color: i <= aStep ? T.textPri : T.textMuted, fontWeight: i === aStep ? 600 : 400 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── STEP 4: SENSOR PHASE ─── */}
        {step === 4 && (
          <div className="fu" style={{ textAlign: "center", padding: "40px 20px" }}>

            {/* ── UNKNOWN FRUIT ── */}
            {detectedFruit && detectedFruit.name === "Unknown" ? (
              <div>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 12,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.25)",
                  borderRadius: T.radiusSm, padding: "16px 24px", marginBottom: 20,
                }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: T.danger }}>Unknown fruit detected</span>
                </div>
                <p style={{ color: T.textSec, fontSize: 13, marginBottom: 24, lineHeight: 1.8 }}>
                  This fruit is not in the trained dataset. Please capture again.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <button className="ghost" onClick={reset}>↺ Start Over</button>
                  <button className="btn" onClick={() => { setStep(1); startCam(); }}>📷 Retry Capture</button>
                </div>
              </div>

            ) : (

              /* ── SENSOR COLLECTION FLOW ── */
              <>
                {/* Fruit badge */}
                {detectedFruit && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    background: "rgba(0,245,160,0.07)",
                    border: "1px solid rgba(0,245,160,0.2)",
                    borderRadius: 99, padding: "9px 22px", marginBottom: 30,
                    backdropFilter: "blur(8px)",
                  }}>
                    <span style={{ fontSize: 18 }}>🧠</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: T.safe }}>{detectedFruit.name}</span>
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'DM Mono', monospace" }}>
                      {detectedFruit.confidence}% confidence
                    </span>
                  </div>
                )}

                {/* LED orb */}
                {!error && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{
                      width: 90, height: 90, borderRadius: "50%",
                      background: sensorPhase === "collecting"
                        ? "radial-gradient(circle,rgba(102,126,234,0.25),rgba(102,126,234,0.05))"
                        : "rgba(255,255,255,0.04)",
                      border: `2px solid ${sensorPhase === "collecting" ? "rgba(102,126,234,0.4)" : "rgba(255,255,255,0.08)"}`,
                      margin: "0 auto 14px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      animation: sensorPhase === "collecting" ? "ledPulse 1.6s ease-in-out infinite" : "none",
                      transition: "all 0.5s ease",
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: sensorPhase === "collecting"
                          ? "linear-gradient(135deg,#667eea,#764ba2)"
                          : "rgba(255,255,255,0.08)",
                        boxShadow: sensorPhase === "collecting" ? "0 0 24px rgba(102,126,234,0.8)" : "none",
                        transition: "all 0.5s ease",
                      }} />
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                      color: sensorPhase === "collecting" ? T.accentBlue : T.textMuted,
                      transition: "color 0.4s ease",
                    }}>
                      {sensorPhase === "countdown"
                        ? `LED ACTIVATES IN ${countdownLeft}s — GET READY`
                        : sensorPhase === "collecting"
                        ? "LED ON — SENSOR ACTIVE"
                        : "LED OFF"}
                    </div>
                  </div>
                )}

                {!error ? (
                  <>
                    <h2 style={{
                      fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 10,
                      background: sensorPhase === "collecting"
                        ? "linear-gradient(135deg,#667eea,#764ba2)"
                        : "linear-gradient(135deg,#fff,#cbd5e1)",
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    }}>
                      {sensorPhase === "countdown"
                        ? "Place the fruit near the sensor"
                        : `Collecting data${sensorDots}`}
                    </h2>

                    <p style={{ color: T.textSec, fontSize: 14, maxWidth: 420, margin: "0 auto 28px", lineHeight: 1.85 }}>
                      {sensorPhase === "countdown"
                        ? <>The LED will turn ON in <strong style={{ color: T.accentBlue }}>{countdownLeft}s</strong>. Hold the <strong style={{ color: T.safe }}>{detectedFruit?.name}</strong> near the sensor.</>
                        : <>Collecting readings for <strong style={{ color: T.accentBlue }}>15 Seconds</strong>. Keep the <strong style={{ color: T.safe }}>{detectedFruit?.name}</strong> steady.</>
                      }
                    </p>

                    {/* Sensor chips */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
                      {["MQ3 ⚗️", "MQ5 🧪", "MQ135 ☁️", "DHT11 🌡️"].map(s => (
                        <div key={s} style={{
                          ...glass({ padding: "7px 16px", borderRadius: 99 }),
                          fontSize: 11, color: T.textSec, fontWeight: 500,
                        }}>
                          {s}
                        </div>
                      ))}
                    </div>

                    {/* Progress indicator */}
                    {sensorPhase === "collecting" ? (
                      <CollectionBar elapsed={collectElapsed} total={COLLECTION_TOTAL} samples={collectSamples} />
                    ) : (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 10,
                        ...glass({ padding: "10px 22px", borderRadius: 99 }),
                        fontSize: 12, color: T.textSec,
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accentBlue, animation: "pulse 1.2s ease infinite", boxShadow: "0 0 6px rgba(102,126,234,0.6)" }} />
                        Waiting for sensor activation — {countdownLeft}s
                      </div>
                    )}
                  </>
                ) : (
                  /* ── SENSOR ERROR ── */
                  <div style={{ maxWidth: 460, margin: "0 auto" }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: T.danger, marginBottom: 10 }}>Sensor Error</h2>
                    <p style={{ color: T.textSec, marginBottom: 24 }}>{error}</p>
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                      <button className="ghost" onClick={reset}>↺ Start Over</button>
                      <button className="btn" onClick={() => { setError(null); analyzeImage(); }}>🔄 Retry</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── STEP 5: RESULTS ─── */}
        {step === 5 && result && (
          <div>

            {/* Row 1: Image + Sensor Readings */}
            <div className="fu grid-img" style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 16, marginBottom: 16 }}>

              {/* Fruit card */}
              <div style={{
                ...glass({ padding: 0, overflow: "hidden", borderRadius: 18 }),
                border: `1px solid ${sBd}`,
                boxShadow: `0 0 24px ${sBg}, 0 8px 32px rgba(0,0,0,0.4)`,
                position: "relative",
                transition: "transform 0.25s ease",
              }}>
                {capturedImg
                  ? <img src={capturedImg} alt="Scanned fruit" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  : <div style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 68 }}>🥭</div>
                }
                <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{result.fruit.name}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>{result.fruit.origin}</div>
                  <div style={{ fontSize: 9.5, color: T.textMuted, fontFamily: "'DM Mono', monospace" }}>{result.prediction.processedAt}</div>
                </div>
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: edible ? "rgba(0,245,160,0.15)" : "rgba(248,113,113,0.15)",
                  border: `1px solid ${sBd}`,
                  color: sColor,
                  fontSize: 10, fontWeight: 800,
                  padding: "4px 12px", borderRadius: 99,
                  backdropFilter: "blur(8px)",
                  letterSpacing: "0.04em",
                }}>
                  {edible ? "✓ SAFE" : "✗ UNSAFE"}
                </div>
              </div>

              {/* Sensors */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                  📡 Real-Time Sensor Readings
                </div>
                <div className="sensor-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
                  {Object.entries(result.sensors).map(([k, v], i) => (
                    <div key={k} style={{ animationDelay: `${i * 70}ms` }}>
                      <SensorPill data={v} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Verdict Banner */}
            <div className="fu" style={{
              ...glass({ padding: "18px 22px", marginBottom: 16, borderRadius: 18 }),
              border: `1.5px solid ${sBd}`,
              background: sBg,
              display: "flex", alignItems: "center", gap: 16,
              animationDelay: "90ms",
              boxShadow: `0 0 32px ${sBg}, 0 8px 32px rgba(0,0,0,0.3)`,
              flexWrap: "wrap",
            }}>
              <div style={{
                width: 54, height: 54, borderRadius: "50%",
                background: edible ? "rgba(0,245,160,0.12)" : "rgba(248,113,113,0.12)",
                border: `1px solid ${sBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, flexShrink: 0,
              }}>
                {edible ? "✅" : "🚫"}
              </div>

              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: sColor, marginBottom: 4, letterSpacing: "-0.02em" }}>
                  {edible ? "Safe to Consume" : "NOT Safe to Consume"}
                </div>
                <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6 }}>
                  {edible ? "All sensor readings within natural ripening thresholds." : result.prediction.consume}
                </div>
                {result.prediction.flags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {result.prediction.flags.map(f => (
                      <span key={f} style={{
                        fontSize: 10, padding: "3px 10px", borderRadius: 99,
                        background: "rgba(248,113,113,0.1)",
                        color: T.danger, fontWeight: 600,
                        border: "1px solid rgba(248,113,113,0.2)",
                        letterSpacing: "0.02em",
                      }}>⚑ {f}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{
                  fontSize: 42, fontWeight: 900, color: sColor, lineHeight: 1,
                  fontFamily: "'DM Mono', monospace",
                  textShadow: `0 0 20px ${sColor}60`,
                }}>
                  {result.prediction.confidence}%
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, letterSpacing: "0.05em" }}>CONFIDENCE</div>
                <div style={{
                  fontSize: 11, fontWeight: 700, marginTop: 6, padding: "3px 12px", borderRadius: 99,
                  background: result.prediction.risk === "High"
                    ? "rgba(248,113,113,0.12)"
                    : result.prediction.risk === "Medium"
                    ? "rgba(245,158,11,0.12)"
                    : "rgba(0,245,160,0.12)",
                  color: result.prediction.risk === "High" ? T.danger : result.prediction.risk === "Medium" ? "#f59e0b" : T.safe,
                  border: `1px solid ${result.prediction.risk === "High" ? "rgba(248,113,113,0.25)" : result.prediction.risk === "Medium" ? "rgba(245,158,11,0.25)" : "rgba(0,245,160,0.25)"}`,
                  letterSpacing: "0.04em",
                }}>
                  {result.prediction.risk} Risk
                </div>
              </div>
            </div>

            {/* Row 3: ML + Validity + Nutrition */}
            <div className="fu grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, animationDelay: "160ms" }}>

              {/* ML Prediction */}
              <div className="card">
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>🧠 ML Prediction</div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: sColor, marginBottom: 4, letterSpacing: "-0.02em",
                  textShadow: `0 0 16px ${sColor}40`,
                }}>
                  {result.prediction.label}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 18, fontFamily: "'DM Mono', monospace" }}>
                  {result.prediction.model}
                </div>
                <ProbBar label="Natural Ripening"  value={result.prediction.naturalProb}  color={T.safe}    delay={300} />
                <ProbBar label="Chemical Ripening" value={result.prediction.chemicalProb} color="#f87171"   delay={480} />
              </div>

              {/* Validity Window */}
              <div className="card">
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>📅 Validity Window</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {[
                    { lbl: "Days since harvest",  val: result.validity.harvestedDaysAgo, grad: "linear-gradient(135deg,#f59e0b,#ef4444)" },
                    { lbl: "Est. days remaining", val: Math.max(0, result.validity.chemicalShelfDays - result.validity.harvestedDaysAgo), grad: edible ? T.gradAccent : T.gradAmber },
                  ].map(({ lbl, val, grad }) => (
                    <div key={lbl} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 12px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 26, fontWeight: 900, background: grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4, lineHeight: 1.4 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <Timeline stages={result.validity.stages} />
                <div style={{ marginTop: 12, fontSize: 10.5, color: T.textSec, lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
                  💡 {result.validity.storageAdvice}
                </div>
              </div>

              {/* Nutrition */}
              <div className="card">
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>🥗 Nutrition / 100g</div>
                <NutritionRow label="Calories"  value={result.nutrition.calories} max={120} unit=" kcal" color="#f59e0b" />
                <NutritionRow label="Carbs"     value={result.nutrition.carbs}    max={30}  unit="g"     color="#f97316" />
                <NutritionRow label="Sugar"     value={result.nutrition.sugar}    max={25}  unit="g"     color="#ec4899" />
                <NutritionRow label="Fibre"     value={result.nutrition.fiber}    max={5}   unit="g"     color="#22c55e" />
                <NutritionRow label="Vitamin C" value={result.nutrition.vitC}     max={100} unit="mg"    color="#06b6d4" />
                <NutritionRow label="Vitamin A" value={result.nutrition.vitA}     max={100} unit="µg"    color="#a78bfa" />
                <div style={{ marginTop: 10, fontSize: 9, color: T.textMuted, fontStyle: "italic" }}>
                  * Typical values for {result.fruit.name}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="fu" style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 26, animationDelay: "220ms", flexWrap: "wrap" }}>
              <button className="ghost" onClick={reset}>↺ Scan Another Fruit</button>
              <button className="btn-accent" onClick={() => window.print()}>⬇ Export Report</button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}