import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo, logWarn } from '@utils/logger';

const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second

interface ConnectionConfig {
  host: string;
  port?: number;
  password?: string;
  encryptionKey?: string;
  expectedServerName?: string;
}

export const connect = (connection: Connection, retryAttempt = 0, originalConfig?: ConnectionConfig): Promise<Connection> => {
  // Store the original config on first call
  const config: ConnectionConfig = originalConfig || {
    host: connection.host,
    port: connection.port,
    password: connection.password,
  };

  return new Promise<Connection>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const handleSuccess = async () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();

      logInfo('[ESPHome] Connected:', connection.host);
      connection.off('error', errorHandler);
      
      try {
        const deviceInfo = await connection.deviceInfoService();
        const { bluetoothProxyFeatureFlags } = deviceInfo as any;
        if (!bluetoothProxyFeatureFlags) {
          logError('[ESPHome] No Bluetooth proxy features detected:', connection.host);
          return reject(new Error('No Bluetooth proxy features detected'));
        }
        resolve(connection);
      } catch (err) {
        logError('[ESPHome] Error getting device info:', err);
        reject(err);
      }
    };

    const errorHandler = (error: any) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();

      const errorMessage = error?.message || String(error);
      
      // Check if this is a recoverable error that we should retry
      const isRecoverableError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('HelloResponse');

      if (isRecoverableError && retryAttempt < MAX_RETRY_ATTEMPTS) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryAttempt);
        logWarn(`[ESPHome] Connection failed (attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}), retrying in ${delay}ms:`, errorMessage);
        
        setTimeout(() => {
          // Create a new connection with the same config
          const newConnection = new Connection(config);
          
          connect(newConnection, retryAttempt + 1, config)
            .then(resolve)
            .catch(reject);
        }, delay);
      } else {
        logError('[ESPHome] Failed Connecting:', error);
        reject(error);
      }
    };

    // Set up connection timeout
    timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      
      connection.off('authorized', handleSuccess);
      connection.off('error', errorHandler);
      
      const timeoutError = new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
      errorHandler(timeoutError);
    }, CONNECTION_TIMEOUT_MS);

    connection.once('authorized', handleSuccess);

    const doConnect = (handler: (error: any) => void) => {
      try {
        connection.once('error', handler);
        connection.connect();
        connection.off('error', handler);
        connection.once('error', errorHandler);
      } catch (err) {
        errorHandler(err);
      }
    };

    const retryHandler = (error: any) => {
      // Initial connection attempt error - pass to main error handler
      errorHandler(error);
    };

    doConnect(retryHandler);
  });
};
