# import tensorflow as tf
# import numpy as np

# print(tf.__version__)
# print(np.__version__)
import serial.tools.list_ports

ports = serial.tools.list_ports.comports()

for port in ports:
    print(port.device)