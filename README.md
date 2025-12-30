# Keeson Bed MQTT Integration

A Home Assistant add-on to control Keeson smart beds via Bluetooth Low Energy (BLE) and MQTT.

## Overview

This project provides MQTT integration for Keeson smart beds, allowing you to control your Keeson bed through Home Assistant. It communicates with Keeson beds over BLE using ESPHome Bluetooth proxies.

## Features

- **BLE Communication**: Connect to Keeson beds via Bluetooth Low Energy
- **MQTT Integration**: Expose bed controls through MQTT for Home Assistant
- **Multiple Keeson Models**: Supports KSBT, BaseI5, and BaseI4 Keeson bed controllers
- **Motor Control**: Adjust head, back, legs, and feet positions
- **Massage Functions**: Control massage features (if available on your bed)
- **Preset Positions**: Quick access to favorite bed positions
- **Home Assistant Discovery**: Automatic entity discovery in Home Assistant

## Supported Keeson Models

- KSBT (e.g., KSBT03C000015046)
- BaseI5
- BaseI4

### Observed KSBT03 Characteristics (nRF Connect)

The following BLE characteristics have been observed for KSBT03 series devices through reverse-engineering using nRF Connect. This information is preliminary and represents advertisement-level data only.

**Observed Device:** `KSBT03C101071926`

**BLE Advertisement Details:**
- **Device Name Pattern:** `KSBT03C` followed by numeric identifier
- **Service UUID:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART Service compatible)
- **Connectable:** Yes
- **Advertising Type:** Legacy
- **BLE Flags:** 
  - LE General Discoverable Mode
  - BR/EDR Not Supported
- **Advertising Interval:** ~157 ms
- **Observed RSSI:** -68 to -73 dBm (stable)

**Note:** This information comes from nRF Connect BLE advertisement captures and represents only the service-level characteristics currently known. The actual command protocol for controlling KSBT03 devices requires deeper protocol analysis beyond what is visible in advertisement data. KSBT03 devices are expected to work with the existing KSBT controller implementation in this project, as they share the same service UUID.

## Requirements

- Home Assistant with MQTT broker (e.g., Mosquitto)
- ESPHome Bluetooth proxy device(s) for BLE connectivity
- Keeson smart bed with BLE capability

## Configuration

Add your Keeson bed configuration in the add-on options:

```json
{
  "mqtt_host": "<auto_detect>",
  "mqtt_port": "<auto_detect>",
  "mqtt_user": "<auto_detect>",
  "mqtt_password": "<auto_detect>",
  "type": "keeson",
  "bleProxies": [
    {
      "host": "bluetooth-proxy.local"
    }
  ],
  "keesonDevices": [
    {
      "name": "KSBT03C000015046",
      "friendlyName": "Keeson Bed"
    }
  ]
}
```

### Configuration Options

- **mqtt_host**: MQTT broker hostname (auto-detected by default)
- **mqtt_port**: MQTT broker port (auto-detected by default)
- **mqtt_user**: MQTT username (auto-detected by default)
- **mqtt_password**: MQTT password (auto-detected by default)
- **type**: Must be set to "keeson"
- **bleProxies**: List of ESPHome Bluetooth proxy devices
  - **host**: Hostname or IP of the Bluetooth proxy
  - **port**: (Optional) Custom port for ESPHome API
  - **password**: (Optional) ESPHome API password
  - **encryptionKey**: (Optional) ESPHome API encryption key
  - **expectedServerName**: (Optional) Expected server name for validation
- **keesonDevices**: List of Keeson beds to control
  - **name**: BLE device name of your Keeson bed
  - **friendlyName**: Friendly name to use in Home Assistant

## Installation

1. Add this repository to your Home Assistant add-on store
2. Install the "Keeson Bed MQTT" add-on
3. Configure your MQTT broker settings (or use auto-detect)
4. Add your ESPHome Bluetooth proxy details
5. Add your Keeson bed device name and friendly name
6. Start the add-on

## Finding Your Keeson Bed Name

Your Keeson bed's BLE name typically starts with "KSBT" followed by numbers. You can find it by:

1. Using a BLE scanner app on your phone
2. Checking the ESPHome Bluetooth proxy logs
3. Looking at the bed's control unit (may have a sticker with the device ID)

## Docker Usage

You can also run this as a standalone Docker container:

```bash
docker build -t keeson-bed-mqtt .
docker run -v /path/to/data:/data keeson-bed-mqtt
```

The `/data` directory should contain an `options.json` file with your configuration.

## Development

### Building

```bash
yarn install
yarn build
```

### Testing

```bash
yarn test
```

### Linting

```bash
yarn lint
```

## Architecture

- **BLE Layer**: Handles Bluetooth Low Energy communication with Keeson beds
- **ESPHome Connection**: Connects to ESPHome Bluetooth proxies
- **Keeson Controllers**: Brand-specific protocol implementation for different Keeson models
- **MQTT Layer**: Publishes/subscribes to MQTT topics for Home Assistant integration
- **Home Assistant Entities**: Auto-discovery and control of switches, buttons, covers, and sensors

## Troubleshooting

### Bed not discovered
- Ensure your ESPHome Bluetooth proxy is running and reachable
- Check that the bed name in configuration matches the actual BLE device name
- Verify the bed is powered on and in range of the Bluetooth proxy

### Connection issues
- Check MQTT broker is running and accessible
- Verify MQTT credentials are correct
- Review add-on logs for error messages

### Unsupported device
If you have a Keeson bed that's not recognized, check the logs for device information and contact the maintainer with:
- BLE device name
- Manufacturer data (from logs)
- Service UUIDs (from logs)

## License

MIT

## Credits

Based on the original smartbed-mqtt project by Richard Hopton, refactored to focus exclusively on Keeson bed support.
