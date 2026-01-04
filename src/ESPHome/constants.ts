/**
 * Message types that are expected but unhandled by the esphome-client library.
 * These should be silently ignored rather than logged as warnings.
 */
export const IGNORED_MESSAGE_TYPES = [
  81,  // Disconnect-related message (expected but unhandled)
  93,  // BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE (handled by wrapper)
  126, // BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE (handled by wrapper)
];
