# Changelog

All notable changes to the Keeson Bed MQTT project will be documented in this file.

## v2.0.0 (Keeson-Only Refactor)

**Breaking Changes**

- **Keeson-Only**: This project now exclusively supports Keeson smart beds. All other brand support has been removed.
- Configuration type must be set to "keeson"
- Removed all non-Keeson device configuration options

**Changes**

- Removed support for all non-Keeson brands (ErgoMotion, ErgoWifi, LeggettPlatt, Linak, Logicdata, MotoSleep, Octo, Okimat, Reverie, Richmat, Scanner, Sleeptracker, Solace)
- Simplified configuration to focus only on Keeson beds
- Updated documentation to reflect Keeson-only scope
- Streamlined codebase by removing unused brand-specific code
- Updated package and project metadata to reflect Keeson focus

**Features**

- Support for KSBT Keeson controllers
- Support for BaseI5 Keeson controllers
- Support for BaseI4 Keeson controllers
- Motor control (head, back, legs, feet)
- Massage functions
- Preset positions
- BLE communication via ESPHome proxies
- MQTT integration for Home Assistant
- Automatic Home Assistant entity discovery

---

## Previous Versions (Multi-Brand Support)

For changelog entries from the original multi-brand smartbed-mqtt project by Richard Hopton, see the project history prior to v2.0.0.

Key Keeson-related features from previous versions:

### v1.1.22
- (Keeson) Send stop command after movement commands
- (Keeson) Fix checksum calculation for base-i4 & base-i5 controllers
- (Keeson) Fix support for base-i4 controllers

### v1.1.21
- (Keeson) Support extending motor control commands

### v1.1.20
- (Keeson) Add support for base-i4 controllers
- (Keeson) Remove need for base-i5 names to match and have expect services

### v1.1.19
- (Keeson) Add support for base-i5 controllers
- (Keeson) Add prototype motor control entities

### v1.1.17
- (Keeson) Add initial support for Keeson beds
