/**
 * KSBT03 Device Identification Helper
 * 
 * Provides utilities for identifying Keeson KSBT03 series devices based on
 * observed BLE characteristics from nRF Connect captures.
 */

import { KEESON_KSBT03_NAME_PREFIX, KEESON_KSBT03_SERVICE_UUID } from './constants';

/**
 * Information about a potential KSBT03 device
 */
export interface KeesonKSBT03DeviceInfo {
  /**
   * The BLE device name
   */
  name: string;
  
  /**
   * Whether the device name matches the KSBT03 pattern
   */
  isKSBT03: boolean;
  
  /**
   * The expected service UUID for KSBT03 devices
   */
  expectedServiceUuid: string;
}

/**
 * Checks if a given BLE device name appears to be a KSBT03-series Keeson bed.
 * 
 * This is a simple name-based heuristic derived from observed devices.
 * A device name starting with "KSBT03" is considered a likely KSBT03 device.
 * 
 * Example matching names:
 * - KSBT03C101071926
 * - KSBT03C000015046
 * - KSBT03...
 * 
 * @param deviceName - The BLE device name to check
 * @returns True if the device name starts with "KSBT03", false otherwise
 * 
 * @example
 * ```typescript
 * isKSBT03Device('KSBT03C101071926'); // true
 * isKSBT03Device('KSBT02C000015046'); // false
 * isKSBT03Device('base-i5.1234'); // false
 * ```
 */
export function isKSBT03Device(deviceName: string): boolean {
  return deviceName.startsWith(KEESON_KSBT03_NAME_PREFIX);
}

/**
 * Gets device information for a potential KSBT03 device.
 * 
 * This function provides a structured way to check if a device name matches
 * the KSBT03 pattern and retrieve the expected service UUID.
 * 
 * @param deviceName - The BLE device name to analyze
 * @returns Device information object with identification details
 * 
 * @example
 * ```typescript
 * const info = getKSBT03DeviceInfo('KSBT03C101071926');
 * console.log(info.isKSBT03); // true
 * console.log(info.expectedServiceUuid); // '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
 * ```
 */
export function getKSBT03DeviceInfo(deviceName: string): KeesonKSBT03DeviceInfo {
  return {
    name: deviceName,
    isKSBT03: isKSBT03Device(deviceName),
    expectedServiceUuid: KEESON_KSBT03_SERVICE_UUID,
  };
}
