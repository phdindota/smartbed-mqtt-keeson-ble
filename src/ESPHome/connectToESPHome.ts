import { Connection } from '@2colors/esphome-native-api';
import { logInfo, logError, logWarn } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

export const connectToESPHome = async (): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();
  
  if (proxies.length === 0) {
    logWarn('[ESPHome] No proxies configured, returning empty connection');
    return new ESPConnection([], []);
  }

  const connections = await Promise.all(
    proxies.map(async (config: BLEProxy) => {
      try {
        const connection = new Connection(config);
        return await connect(connection);
      } catch (error) {
        logError(`[ESPHome] Failed to connect to ${config.host}:`, error);
        throw error;
      }
    })
  );
  
  return new ESPConnection(connections, proxies);
};
