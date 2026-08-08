import { IDeviceData } from '@ha/IDeviceData';
import { intToBytes } from '@utils/intToBytes';
import { BLEController } from 'BLE/BLEController';
import { IBLEDevice } from 'ESPHome/types/IBLEDevice';
import { logInfo } from '@utils/logger';

const buildCommand = (command: number) => [0x4, 0x2, ...intToBytes(command)];

// List of known service/characteristic UUID pairs for KSBT devices
const knownServices = [
  {
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    writeCharUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
  {
    serviceUuid: '0000ffe5-0000-1000-8000-00805f9b34fb',
    writeCharUuid: '0000ffe9-0000-1000-8000-00805f9b34fb',
  },
  {
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    writeCharUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
];

export const controllerBuilder = async (deviceData: IDeviceData, bleDevice: IBLEDevice) => {
  const { getCharacteristic, name } = bleDevice;

  // Try each known service/characteristic pair
  for (const { serviceUuid, writeCharUuid } of knownServices) {
    const writeCharacteristic = await getCharacteristic(serviceUuid, writeCharUuid, false);
    if (!writeCharacteristic) continue;

    logInfo(`[Keeson KSBT] Found working service for ${name}: ${serviceUuid}`);

    let notifyHandles: { notify: number } | undefined;

    // KSBT03 devices using Nordic UART expose notifications on RX characteristic 6e400003.
    if (serviceUuid === '6e400001-b5a3-f393-e0a9-e50e24dcca9e') {
      const notifyCharacteristic = await getCharacteristic(
        serviceUuid,
        '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
        false
      );

      if (notifyCharacteristic) {
        notifyHandles = { notify: notifyCharacteristic.handle };
        logInfo(
          `[Keeson KSBT] Found notify characteristic for ${name}: handle ${notifyCharacteristic.handle}`
        );
      }
    }

    const controller = new BLEController(
      deviceData,
      bleDevice,
      writeCharacteristic.handle,
      buildCommand,
      notifyHandles
    );
    return controller;
  }

  logInfo(`[Keeson KSBT] Could not find any supported services for device: ${name}`);
  return undefined;
};
