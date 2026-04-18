import serial
import time

ser = serial.Serial('COM8', 9600, timeout=1)  # use your working port
time.sleep(3)

print("Reading sensor data...")

while True:
    if ser.in_waiting > 0:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        
        if line:
            print("Raw:", line)

            try:
                mq3, mq5, mq135, temp, hum = map(float, line.split(","))
                
                print("Parsed:")
                print("MQ3:", mq3)
                print("MQ5:", mq5)
                print("MQ135:", mq135)
                print("Temp:", temp)
                print("Humidity:", hum)
                print("---------------------")

            except:
                print("Invalid data")