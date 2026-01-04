import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logWarn, logInfo } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { keeson } from 'Keeson/keeson';
import { IGNORED_MESSAGE_TYPES } from 'ESPHome/constants';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';

let espHomeConnection: IESPConnection | null = null;
let mqtt: IMQTTConnection | null = null;
let keesonCleanup: (() => void) | null = null;
let isInitializing = false;

const processExit = (exitCode?: number) => {
  if (exitCode && exitCode > 0) {
    logError(`Exit code: ${exitCode}`);
  }
  process.exit();
};

process.on('exit', () => {
  logWarn('Shutting down Smartbed-MQTT...');
  processExit(0);
});
process.on('SIGINT', () => processExit(0));
process.on('SIGTERM', () => processExit(0));
process.on('uncaughtException', async (err) => {
  const errorMessage = err?.message || String(err);
  
  // Check if this is a recoverable error
  const isUnknownMessageType = errorMessage.includes('Failed find message type for Id:');
  const isConnectionTimeout = errorMessage.includes('Connection timeout for device');
  
  if (isUnknownMessageType) {
    // Extract message type ID from error message
    const match = errorMessage.match(/Id:\s*(\d+)/);
    const messageTypeId = match ? parseInt(match[1], 10) : null;
    
    // Silently ignore expected but unhandled message types
    if (messageTypeId && IGNORED_MESSAGE_TYPES.includes(messageTypeId)) {
      // Silently ignore - these are expected message types
      return;
    }
    
    logWarn('[ESPHome] Unknown message type error (non-fatal):', err);
    
    // Try to reconnect the ESPHome connection if it exists
    if (espHomeConnection) {
      logWarn('[ESPHome] Attempting to reconnect...');
      try {
        await espHomeConnection.reconnect();
        logWarn('[ESPHome] Reconnection successful, continuing...');
        return; // Don't exit, continue running
      } catch (reconnectErr) {
        logError('[ESPHome] Reconnection failed:', reconnectErr);
      }
    } else {
      logWarn('[ESPHome] No connection available to reconnect');
    }
  }
  
  // Handle connection timeout errors - don't crash, just log
  if (isConnectionTimeout) {
    logError('[BLE] Connection timeout (recoverable):', err);
    logInfo('[BLE] Device will reconnect on next command or during keepalive');
    return; // Don't exit, continue running
  }
  
  // For all other errors or if reconnection failed, exit
  logError(err);
  processExit(2);
});

// Function to initialize Keeson devices
const initializeKeeson = async () => {
  if (!mqtt || !espHomeConnection) {
    logError('[Keeson] Cannot initialize - MQTT or ESPHome connection not available');
    return;
  }
  
  // Prevent concurrent initialization attempts
  if (isInitializing) {
    logWarn('[Keeson] Initialization already in progress, skipping...');
    return;
  }
  
  isInitializing = true;
  
  try {
    // Clean up old devices if they exist
    if (keesonCleanup) {
      logInfo('[Keeson] Cleaning up old devices before re-initialization...');
      try {
        keesonCleanup();
      } catch (error) {
        logError('[Keeson] Error during cleanup, continuing with re-initialization:', error);
      }
      keesonCleanup = null;
    }
    
    // Re-initialize Keeson devices and store new cleanup function
    logInfo('[Keeson] Initializing devices...');
    keesonCleanup = await keeson(mqtt, espHomeConnection);
  } finally {
    isInitializing = false;
  }
};

const start = async () => {
  await loadStrings();

  mqtt = await connectToMQTT();
  
  // Pass reconnection callback to ESPHome connection
  espHomeConnection = await connectToESPHome(async () => {
    logInfo('[ESPHome] Reconnection detected, re-initializing Keeson devices...');
    await initializeKeeson();
  });
  
  // Initial Keeson setup
  await initializeKeeson();
};
void start();
