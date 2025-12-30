/**
 * KSBT03 Keeson Bed BLE Constants
 * 
 * These constants are derived from an nRF Connect BLE advertisement capture
 * of a Keeson KSBT03 device (observed device: KSBT03C101071926).
 * 
 * Source: nRF Connect screenshot showing BLE advertisement data
 * Date: December 2025
 */

/**
 * The primary service UUID observed in KSBT03 devices.
 * This is a Nordic UART Service (NUS) compatible UUID.
 * 
 * Observed in nRF Connect as:
 * - Complete list of 128-bit Service UUIDs: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
 */
export const KEESON_KSBT03_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/**
 * Device name prefix for KSBT03 series devices.
 * 
 * Observed pattern: KSBT03C followed by numeric identifier
 * Example: KSBT03C101071926
 */
export const KEESON_KSBT03_NAME_PREFIX = 'KSBT03';

/**
 * Observed BLE characteristics from nRF Connect capture:
 * 
 * - Device complete local name: KSBT03C101071926
 * - Connectable: Yes
 * - Advertising type: Legacy
 * - Flags: LE General Discoverable, BR/EDR Not Supported
 * - Complete list of 128-bit Service UUIDs: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
 * - Advertising interval: ~157 ms
 * - RSSI: Stable around -68 to -73 dBm (during observation)
 * 
 * Note: This information represents observed BLE advertisement characteristics only.
 * The actual command protocol and characteristic UUIDs for bed control are not
 * included as they require deeper protocol reverse-engineering beyond what's
 * visible in the advertisement data.
 */
export const KEESON_KSBT03_BLE_CHARACTERISTICS = {
  /**
   * The primary service UUID used by KSBT03 devices.
   * This appears to be a Nordic UART Service (NUS) compatible service.
   */
  serviceUuid: KEESON_KSBT03_SERVICE_UUID,
  
  /**
   * Device name prefix for identification
   */
  namePrefix: KEESON_KSBT03_NAME_PREFIX,
  
  /**
   * Expected advertising type
   */
  advertisingType: 'Legacy' as const,
  
  /**
   * Expected to be connectable
   */
  connectable: true,
  
  /**
   * Observed advertising interval in milliseconds (approximate)
   */
  advertisingIntervalMs: 157,
  
  /**
   * BLE flags observed in advertisement
   */
  flags: {
    leGeneralDiscoverable: true,
    brEdrNotSupported: true,
  },
} as const;
