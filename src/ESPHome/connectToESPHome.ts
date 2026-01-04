import { EspHomeClientWrapper } from './EspHomeClientWrapper';
import { logInfo, logError, logWarn } from '@utils/logger';
import { ESPConnection } from './ESPConnection';
import { IESPConnection } from './IESPConnection';
import { connect } from './connect';
import { BLEProxy, getProxies } from './options';

export const connectToESPHome = async (onReconnected?: () => void | Promise<void>): Promise<IESPConnection> => {
  logInfo('[ESPHome] Connecting...');

  const proxies = getProxies();

  if (proxies.length === 0) {
    logWarn('[ESPHome] No proxies configured, returning empty connection');
    return new ESPConnection([], [], onReconnected);
  }

  const connections = await Promise.all(
    proxies.map(async (config: BLEProxy) => {
      try {
        const connection = new EspHomeClientWrapper(config);
        return await connect(connection);
      } catch (error) {
        logError(`[ESPHome] Failed to connect to ${config.host}:`, error);
        throw error;
      }
    })
  );

  return new ESPConnection(connections, proxies, onReconnected);
};
