import { connectToMQTT } from '@mqtt/connectToMQTT';
import { loadStrings } from '@utils/getString';
import { logError, logWarn } from '@utils/logger';
import { connectToESPHome } from 'ESPHome/connectToESPHome';
import { keeson } from 'Keeson/keeson';

let espHomeConnection: any = null;

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
    logWarn('[ESPHome] Unknown message type error (non-fatal):', err);
    logWarn('[ESPHome] Attempting to reconnect...');
    
    // Try to reconnect the ESPHome connection
    if (espHomeConnection) {
      try {
        await espHomeConnection.reconnect();
        logWarn('[ESPHome] Reconnection successful, continuing...');
        return; // Don't exit, continue running
      } catch (reconnectErr) {
        logError('[ESPHome] Reconnection failed:', reconnectErr);
      }
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
