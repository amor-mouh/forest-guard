# Forest Guard

IoT environmental station for wildfire and seismic activity monitoring using ESP32.

## Features

- **Wildfire & Smoke Detection**: Reads gas and smoke levels using the MQ-9 sensor.
- **Seismic Tremor Detection**: Tracks soil vibration and acceleration with the MPU-6050 sensor.
- **Weather Telemetry**: Measures ambient temperature and humidity with the DHT-11 sensor.
- **Disaster Event Logger**: Automatically logs every fire alert and earthquake event in browser storage with start time, duration, and peak values.
- **Real-Time Seismograph**: Dynamic canvas visualizer showing vibration waveforms.
- **CSV Export**: Export recorded hazard logs to a spreadsheet-compatible file.
- **Web Audio Alarm**: Built-in sound generator for fire and earthquake alerts without external audio files.
- **Simulation Mode**: Built-in simulator to test dashboard alerts without physical hardware.
- **Standalone Operation**: Hosts a local Wi-Fi Access Point (`ESP32-Forest-Guard`) and an embedded HTTP API (`/api/data`).

## Project Layout

- `index.html`: Main monitoring dashboard.
- `style.css`: Visual styling and dark theme.
- `script.js`: Data polling, waveform rendering, and incident logging logic.
- `firmware/forest_guard/forest_guard.ino`: ESP32 firmware sketch.
- `esp32-code.txt`: Reference firmware source.

## Hardware Wiring

| Component | Component Pin | ESP32 Pin | Purpose |
| :--- | :--- | :--- | :--- |
| MQ-9 Gas Sensor | AOUT | GPIO 34 | Analog gas measurement |
| MPU-6050 | SDA | GPIO 21 | I2C data |
| MPU-6050 | SCL | GPIO 22 | I2C clock |
| DHT-11 | Data | GPIO 15 | Temperature & humidity |
| I2C LCD 16x2 | SDA / SCL | GPIO 21 / 22 | Local telemetry display |
| Buzzer | Positive | GPIO 4 | Acoustic alarm |
| Alert LED | Anode | GPIO 2 | Visual hazard indicator |

## Firmware Setup

1. Open `firmware/forest_guard/forest_guard.ino` in the Arduino IDE.
2. Install the necessary libraries (`DHT` and `LiquidCrystal_I2C`).
3. Select your ESP32 board and serial port, then flash the sketch.

## Dashboard Usage

1. Connect your computer or phone to the Wi-Fi network:
   - SSID: `ESP32-Forest-Guard`
   - Password: `12345678`
2. Open `index.html` in any web browser.
3. The dashboard connects to `http://192.168.4.1/api/data` and starts displaying real-time readings.
