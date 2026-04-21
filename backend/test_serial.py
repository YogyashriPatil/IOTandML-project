import serial
import time

PORT = "COM8"      # change to your port
BAUD = 115200

print(f"Opening {PORT} ...")
ser = serial.Serial(
    port=PORT, baudrate=BAUD,
    timeout=3, dsrdtr=False, rtscts=False
)
print("Waiting 2.5s for Arduino boot...")
time.sleep(2.5)
ser.reset_input_buffer()
print("Sending LED_ON...")
ser.write(b"LED_ON\n")
ser.flush()

print("Reading for 5 seconds:")
deadline = time.time() + 5
while time.time() < deadline:
    line = ser.readline()
    if line:
        print("  GOT:", line.decode("utf-8", errors="ignore").strip())

ser.write(b"LED_OFF\n")
ser.flush()
ser.close()
print("Done.")