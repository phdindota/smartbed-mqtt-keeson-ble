import { Cover } from '@ha/Cover';
import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { buildEntityConfig } from 'Common/buildEntityConfig';
import { Commands } from 'Common/Commands';
import { IController } from 'Common/IController';
import { Cancelable } from 'Common/Cancelable';
import { ICache } from 'Common/ICache';

interface MotorState {
  head?: boolean;
  feet?: boolean;
  tilt?: boolean;
  lumbar?: boolean;
}

interface Cache {
  motorState?: MotorState & Cancelable;
}

const move = (motorState: MotorState) => {
  let command = 0;
  const { head, feet, tilt, lumbar } = motorState;
  if (head !== undefined) command += head ? Commands.MotorHeadUp : Commands.MotorHeadDown;
  if (feet !== undefined) command += feet ? Commands.MotorFeetUp : Commands.MotorFeetDown;
  if (tilt !== undefined) command += tilt ? Commands.MotorTiltUp : Commands.MotorTiltDown;
  if (lumbar !== undefined) command += lumbar ? Commands.MotorLumbarUp : Commands.MotorLumbarDown;
  return command;
};

export const setupMotorEntities = (
  mqtt: IMQTTConnection,
  { cache, deviceData, writeCommand, cancelCommands }: IController<number> & ICache<Cache>
) => {
  if (!cache.motorState) cache.motorState = {};

  const isKSBT03 = deviceData.device.mdl.toUpperCase().startsWith('KSBT03');

  const buildCoverCommand = (motor: keyof MotorState) => async (command: string) => {
    const motorState = cache.motorState!;
    const originalCommand = move(motorState);
    motorState[motor] = command === 'OPEN' ? true : command === 'CLOSE' ? false : undefined;
    const newCommand = move(motorState);
    const sendCommand = async () => {
      newCommand && (await writeCommand(newCommand, 25, 200));
    };

    if (newCommand === originalCommand) return await sendCommand();

    motorState.canceled = true;
    await cancelCommands();
    motorState.canceled = false;

    const stopCommand = move({});
    if (newCommand !== stopCommand) {
      await sendCommand();
      if (motorState.canceled) return;
      cache.motorState = {};
    }
    await writeCommand(stopCommand);
  };

  if (!cache.headMotor) {
    cache.headMotor = new Cover(
      mqtt,
      deviceData,
      buildEntityConfig('MotorHead', { icon: 'mdi:head' }),
      buildCoverCommand('head')
    ).setOnline();
  }

  if (!cache.feetMotor) {
    cache.feetMotor = new Cover(
      mqtt,
      deviceData,
      buildEntityConfig('MotorFeet', { icon: 'mdi:foot-print' }),
      buildCoverCommand('feet')
    ).setOnline();
  }

  // KSBT03 Tempur-Pedic bases use the command historically labeled
  // "Tilt" for their physical lumbar motor.
  if (!isKSBT03 && !cache.tiltMotor) {
    cache.tiltMotor = new Cover(
      mqtt,
      deviceData,
      buildEntityConfig('MotorTilt', { icon: 'mdi:tilt' }),
      buildCoverCommand('tilt')
    ).setOnline();
  }

  if (!cache.lumbarMotor) {
    const lumbarCommandMotor: keyof MotorState = isKSBT03 ? 'tilt' : 'lumbar';

    cache.lumbarMotor = new Cover(
      mqtt,
      deviceData,
      buildEntityConfig('MotorLumbar', { icon: 'mdi:lumbar' }),
      buildCoverCommand(lumbarCommandMotor)
    ).setOnline();
  }
};
