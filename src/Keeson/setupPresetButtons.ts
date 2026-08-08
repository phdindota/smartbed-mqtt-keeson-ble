import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { Commands } from 'Common/Commands';
import { IController } from 'Common/IController';
import { buildCommandButton } from 'Common/buildCommandButton';

export const setupPresetButtons = (mqtt: IMQTTConnection, controller: IController<number>) => {
  buildCommandButton('Keeson', mqtt, controller, 'PresetFlat', Commands.PresetFlat);
  buildCommandButton('Keeson', mqtt, controller, 'PresetZeroG', Commands.PresetZeroG);

  // Verified Tempur-Pedic / KSBT03 mappings
  buildCommandButton('Keeson', mqtt, controller, 'PresetTV', Commands.PresetMemory1);
  buildCommandButton('Keeson', mqtt, controller, 'PresetFavorite1', Commands.PresetMemory4);
  buildCommandButton('Keeson', mqtt, controller, 'PresetFavorite2', Commands.PresetMemory2);
  buildCommandButton('Keeson', mqtt, controller, 'PresetAntiSnore', Commands.PresetMemory3);

  buildCommandButton(
    'Keeson',
    mqtt,
    controller,
    'UnderBedLightsToggle',
    Commands.ToggleSafetyLights
  );
};
