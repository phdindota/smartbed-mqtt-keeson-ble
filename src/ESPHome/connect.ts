import { EspHomeClientWrapper } from './EspHomeClientWrapper';
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

export const connect = (
  connection: EspHomeClientWrapper,
  retryAttempt = 0,
  originalConfig?: ConnectionConfig
): Promise<EspHomeClientWrapper> => {
  // Store the original config on first call
  const config: ConnectionConfig = originalConfig || {
    host: connection.host,
    port: connection.port,
  };

  return new Promise<EspHomeClientWrapper>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const handleSuccess = async (data: { encrypted: boolean }) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();

      logInfo(`[ESPHome] Connected: ${connection.host} (encrypted: ${data.encrypted})`);
      connection.off('error', errorHandler);

      // Wait for device info to check Bluetooth proxy features
      const deviceInfoHandler = (deviceInfo: any) => {
        const { bluetoothProxyFeatureFlags } = deviceInfo;
        if (!bluetoothProxyFeatureFlags) {
          logError('[ESPHome] No Bluetooth proxy features detected:', connection.host);
          connection.disconnect();
          reject(new Error('No Bluetooth proxy features detected'));
        } else {
          logInfo(`[ESPHome] Bluetooth proxy features detected: ${bluetoothProxyFeatureFlags}`);
          connection.off('deviceInfo', deviceInfoHandler);
          resolve(connection);
        }
      };

      connection.once('deviceInfo', deviceInfoHandler);

      // Set a timeout for device info
      setTimeout(() => {
        connection.off('deviceInfo', deviceInfoHandler);
        // If we haven't received device info yet, assume it's okay
        // (some devices may not send it immediately)
        resolve(connection);
      }, 5000);
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
        logWarn(
          `[ESPHome] Connection failed (attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}), retrying in ${delay}ms:`,
          errorMessage
        );

        setTimeout(() => {
          // Create a new connection with the same config
          const newConnection = new EspHomeClientWrapper(config);

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

      connection.off('connected', handleSuccess);
      connection.off('error', errorHandler);

      const timeoutError = new Error(`Connection timeout after ${CONNECTION_TIMEOUT_MS}ms`);
      errorHandler(timeoutError);
    }, CONNECTION_TIMEOUT_MS);

    connection.once('connected', handleSuccess);
    connection.once('error', errorHandler);

    // Start connection
    connection.connect().catch(errorHandler);
  });
};
