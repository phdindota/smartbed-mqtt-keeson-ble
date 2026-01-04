import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logWarn } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { keeson } from 'Keeson/keeson';
import { IGNORED_MESSAGE_TYPES } from 'ESPHome/constants';

let espHomeConnection: IESPConnection | null = null;

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
  
  // Check if this is a recoverable error (unknown message type)
  const isUnknownMessageType = errorMessage.includes('Failed find message type for Id:');
  
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
  
  // For all other errors or if reconnection failed, exit
  logError(err);
  processExit(2);
});

const start = async () => {
  await loadStrings();

  const mqtt = await connectToMQTT();
  espHomeConnection = await connectToESPHome();
  
  // Keeson BLE beds only
  return void (await keeson(mqtt, espHomeConnection));
};
void start();
