# Keeson and Tempur-Pedic Bed MQTT Bridge

Control compatible Keeson and Tempur-Pedic adjustable beds from Home Assistant through MQTT and an ESPHome Bluetooth Proxy.

This fork adds compatibility with current ESPHome Bluetooth Proxy firmware, including ESPHome API 1.14 and ESPHome 2026.x.

## Verified Setup

This fork has been physically tested with:

- Tempur-Pedic adjustable base with Sleeptracker Gen2
- BLE device name `KSBT03C201099417`
- ESPHome Bluetooth Proxy firmware `2026.5.1`
- ESPHome API `1.14`
- Home Assistant MQTT Discovery
- Mosquitto MQTT broker
- Raspberry Pi running Node.js 20

Verified controls include:

- Flat
- Zero G
- Anti-Snore
- Memory presets
- Head movement
- Foot movement
- Lumbar movement
- Massage controls

## Features

- Home Assistant MQTT Discovery
- ESPHome Bluetooth Proxy support
- Encrypted ESPHome API transport
- Raw V2 Bluetooth advertisement support
- Automatic BLE discovery by configured device name or MAC address
- KSBT, BaseI5, and BaseI4 controller support
- Head, foot, tilt, and lumbar controls
- Massage controls
- Preset position buttons
- Automatic reconnect support
- Standalone Node.js operation
- Docker support

## Important Bluetooth Proxy Requirement

Use a dedicated ESPHome Bluetooth Proxy for this bridge.

Home Assistant and this application should not both subscribe to Bluetooth advertisements from the same ESPHome proxy. Only one API client can own the Bluetooth advertisement subscription at a time.

Recommended layout:

```text
Adjustable Bed
      |
     BLE
      |
Dedicated ESP32 Bluetooth Proxy
      |
     LAN
      |
Keeson Bed MQTT Bridge
      |
     MQTT
      |
Home Assistant

Do not add the dedicated bed proxy to Home Assistant.

Other ESPHome Bluetooth proxies can remain connected to Home Assistant normally.

Supported Devices

Known controller families:

KSBT
KSBT03
BaseI5
BaseI4

Known KSBT Nordic UART characteristics:

Service UUID:       6e400001-b5a3-f393-e0a9-e50e24dcca9e
Write UUID:         6e400002-b5a3-f393-e0a9-e50e24dcca9e
Notification UUID:  6e400003-b5a3-f393-e0a9-e50e24dcca9e

Some KSBT03 beds advertise only their BLE name and do not include manufacturer data or service UUIDs in the advertisement. This fork supports discovery of those devices by exact configured name.

Requirements
Home Assistant
MQTT broker, such as Mosquitto
Dedicated ESPHome Bluetooth Proxy
Compatible Keeson or Tempur-Pedic adjustable bed
Node.js 20 or newer for standalone use
Configuration

The application reads its device and proxy configuration from config.json.

Example:

{
  "mqtt_host": "<auto_detect>",
  "mqtt_port": "<auto_detect>",
  "mqtt_user": "<auto_detect>",
  "mqtt_password": "<auto_detect>",
  "type": "keeson",
  "bleProxies": [
    {
      "host": "esp32-bluetooth-proxy.local",
      "port": 6053
    }
  ],
  "keesonDevices": [
    {
      "name": "KSBT03C201099417",
      "friendlyName": "Master Bed"
    }
  ]
}

Available Bluetooth proxy options include:

host
port
password
encryptionKey
expectedServerName

The MQTT connection can also be supplied through environment variables:

MQTTHOST=192.168.2.203
MQTTPORT=1883
MQTTUSER=
MQTTPASSWORD=
Standalone Installation

Clone the repository:

git clone https://github.com/edgedout/smartbed-mqtt-keeson-ble.git
cd smartbed-mqtt-keeson-ble

Install dependencies:

npm install

Build:

npm run build

Run manually:

MQTTHOST=192.168.2.203 \
MQTTPORT=1883 \
MQTTUSER="" \
MQTTPASSWORD="" \
node dist/tsc/index.js

After startup, Home Assistant should discover the bed under:

Settings > Devices & services > MQTT > Devices
Raspberry Pi systemd Service

Example service:

[Unit]
Description=Keeson Smart Bed MQTT Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/root/smartbed-mqtt-keeson-ble
Environment=MQTTHOST=192.168.2.203
Environment=MQTTPORT=1883
Environment=MQTTUSER=
Environment=MQTTPASSWORD=
ExecStart=/root/.nvm/versions/node/v20.20.2/bin/node /root/smartbed-mqtt-keeson-ble/dist/tsc/index.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target

Save it as:

/etc/systemd/system/smartbed-mqtt.service

Enable and start it:

sudo systemctl daemon-reload
sudo systemctl enable --now smartbed-mqtt.service

Check status:

sudo systemctl status smartbed-mqtt.service --no-pager -l

View logs:

journalctl -u smartbed-mqtt.service -f

The Node.js path may be different on your system. Confirm it with:

which node
Docker

Build:

docker build -t keeson-bed-mqtt .

Run:

docker run \
  --restart unless-stopped \
  -v /path/to/data:/data \
  keeson-bed-mqtt

The mounted /data directory should contain the required configuration.

Finding the Bed Name

The BLE name commonly starts with KSBT.

You can find it using:

A BLE scanner application
ESPHome Bluetooth Proxy logs
Home Assistant Bluetooth diagnostics
A label on the adjustable base control module

The configured name must match the BLE name exactly.

Home Assistant Entities

Depending on the capabilities of the bed, MQTT Discovery may create entities for:

Flat
Zero G
Anti-Snore
Memory 1
Memory 2
Head motor
Foot motor
Tilt motor
Lumbar motor
Head massage
Foot massage
Massage timer
Combined massage

The integration currently provides reliable command control. The tested KSBT03 firmware accepted a notification subscription but did not send state notifications when the physical remote was used. Position and massage state should therefore be treated as write-only or assumed state.

Development

Build:

npm run build

Run tests:

npm run test:ci

Lint:

npm run lint

The upstream project uses Yarn in its Git hooks. On systems where Yarn is unavailable, a previously validated commit can be created with:

HUSKY=0 git commit
ESPHome Compatibility Changes in This Fork

This fork includes several updates required for current ESPHome releases:

Uses transport-aware frameAndSend() for plaintext and encrypted API connections
Requests raw V2 Bluetooth advertisements
Supports raw advertisement response message type 93
Accepts configured KSBT03 devices that advertise only a local name
Corrects current Bluetooth response message IDs
Correctly separates GATT handles from GATT error codes
Handles GATT write acknowledgements
Handles GATT notification acknowledgements
Handles current scanner-state responses
Troubleshooting
The bed is not discovered
Confirm the dedicated proxy is powered and reachable on port 6053
Confirm Home Assistant is not also connected to that proxy
Confirm the configured BLE name is exact
Confirm the bed is powered
Move the proxy closer to the bed
MQTT entities do not appear
Confirm the MQTT broker is reachable
Confirm MQTT Discovery is enabled in Home Assistant
Check the service logs
Restart the bridge after clearing stale MQTT discovery entries
The proxy connects but no advertisements arrive

The most common cause is another API client already owning the Bluetooth advertisement subscription. Disable the proxy in Home Assistant or use a separate dedicated proxy.

Commands do not move the bed
Verify the correct bed was discovered
Confirm GATT service discovery found the expected write characteristic
Confirm Home Assistant shows the entities as available
Review the service logs for write or connection errors
Credits

Based on the original smartbed-mqtt work by Richard Hopton and the Keeson-focused repository maintained by phdindota.

Modern ESPHome Bluetooth Proxy compatibility and Tempur-Pedic Sleeptracker Gen2 validation were added and tested in this fork.

License

MIT
