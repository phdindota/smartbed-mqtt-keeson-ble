import { IDeviceData } from '@ha/IDeviceData';
import { Dictionary } from '@utils/Dictionary';
import { Timer } from '@utils/Timer';
import { loopWithWait } from '@utils/loopWithWait';
import { IBLEDevice } from 'ESPHome/types/IBLEDevice';
import EventEmitter from 'events';
import { IController } from '../Common/IController';
import { IEventSource } from '../Common/IEventSource';
import { arrayEquals } from '@utils/arrayEquals';
import { deepArrayEquals } from '@utils/deepArrayEquals';
import { logError, logInfo, logWarn } from '@utils/logger';

export class BLEController<TCommand> extends EventEmitter implements IEventSource, IController<TCommand> {
  cache: Dictionary<object> = {};
  get notifyNames() {
    return Object.keys(this.notifyHandles);
  }
  private timer?: Timer;
  private notifyValues: Dictionary<Uint8Array> = {};
  private lastCommands?: number[][];
  private commandQueue: Promise<void> = Promise.resolve();
  private readonly CONNECT_RETRY_DELAYS_MS = [0, 2000, 5000, 10000];

  constructor(
    public deviceData: IDeviceData,
    private bleDevice: IBLEDevice,
    private handle: number,
    private commandBuilder: (command: TCommand) => number[],
    private notifyHandles: Dictionary<number> = {}
  ) {
    super();
    Object.entries(notifyHandles).forEach(([key, handle]) => {
      void this.bleDevice.subscribeToCharacteristic(handle, (data) => {
        const previous = this.notifyValues[key];
        if (previous && arrayEquals(data, previous)) return;
        this.emit(key, data);
      });
    });
  }

  private wait = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

  private connectWithRetry = async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.CONNECT_RETRY_DELAYS_MS.length; attempt++) {
      const delay = this.CONNECT_RETRY_DELAYS_MS[attempt];

      if (delay > 0) {
        logWarn(
          `[BLE] Reconnect attempt ${attempt + 1}/${this.CONNECT_RETRY_DELAYS_MS.length} in ${delay}ms`
        );
        await this.wait(delay);
      }

      try {
        await this.bleDevice.connect();

        if (attempt > 0) {
          logInfo('[BLE] Reconnected successfully');
        }

        return;
      } catch (error) {
        lastError = error;
        logWarn(
          `[BLE] Connection attempt ${attempt + 1}/${this.CONNECT_RETRY_DELAYS_MS.length} failed`,
          error
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Unable to connect to BLE device: ${String(lastError)}`);
  };

  private writeOnce = async (command: number[]) => {
    await this.connectWithRetry();
    await this.bleDevice.writeCharacteristic(this.handle, new Uint8Array(command));
  };

  private write = async (command: number[]) => {
    try {
      await this.writeOnce(command);
    } catch (firstError) {
      logWarn('[BLE] First write failed; reconnecting and retrying command once', firstError);

      try {
        await this.bleDevice.disconnect();
      } catch (disconnectError) {
        logWarn('[BLE] Cleanup disconnect failed; continuing with reconnect', disconnectError);
      }

      try {
        await this.writeOnce(command);
        logInfo('[BLE] Command succeeded after reconnect');
      } catch (retryError) {
        logError('[BLE] Command failed after reconnect retry', retryError);
        await this.cancelCommands();
        throw retryError;
      }
    }
  };

  writeCommand = (command: TCommand, count: number = 1, waitTime?: number) =>
    this.writeCommands([command], count, waitTime);

  writeCommands = async (commands: TCommand[], count: number = 1, waitTime?: number) => {
    const operation = async () => {
      const commandList = commands.map(this.commandBuilder).filter((command) => command.length > 0);
      if (commandList.length === 0) return;

      await this.connectWithRetry();

      const onTick =
        commandList.length === 1
          ? () => this.write(commandList[0])
          : () => loopWithWait(commandList, this.write);

      if (count === 1 && !waitTime) {
        await onTick();
        return;
      }

      if (this.timer && this.lastCommands) {
        if (deepArrayEquals(commandList, this.lastCommands)) {
          this.timer.extendCount(count);
          return;
        }

        await this.cancelCommands();
      }

      this.lastCommands = commandList;

      const onFinish = () => {
        this.timer = undefined;
        this.lastCommands = undefined;
      };

      this.timer = new Timer(onTick, count, waitTime, onFinish);
      await this.timer.start();
    };

    const queuedOperation = this.commandQueue.then(operation, operation);
    this.commandQueue = queuedOperation.catch(() => undefined);
    return queuedOperation;
  };

  cancelCommands = async () => {
    await this.timer?.cancel();
  };

  on = (eventName: string, handler: (data: Uint8Array) => void): this => {
    this.addListener(eventName, handler);
    return this;
  };
}
