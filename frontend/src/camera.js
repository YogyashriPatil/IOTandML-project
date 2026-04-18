import React, { useRef, useState } from "react";
import axios from "axios";

function Camera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [result, setResult] = useState(null);

  // Start webcam
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
  };

  // Capture image
  const capture = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append("image", blob);

      const res = await axios.post("http://127.0.0.1:5000/predict", formData);

      setResult(res.data);
    });
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h1>🍎 Fruit Detection System</h1>

      <video ref={videoRef} autoPlay width="400" />
      <br />

      <button onClick={startCamera}>Start Camera</button>
      <button onClick={capture}>Capture & Predict</button>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {result && (
        <div>
          <h2>Fruit: {result.fruit}</h2>
          <p>MQ3: {result.mq3}</p>
          <p>MQ5: {result.mq5}</p>
          <p>MQ135: {result.mq135}</p>
          <p>Temp: {result.temp}</p>
          <p>Humidity: {result.humidity}</p>

          <h2>Final Result: {result.final_prediction}</h2>
        </div>
      )}
    </div>
  );
}

export default Camera;