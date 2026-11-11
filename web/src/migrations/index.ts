import * as migration_20261024_153617_initial from './20261024_153617_initial';
import * as migration_20261031_184721_guests from './20261031_184721_guests';

export const migrations = [
  {
    up: migration_20261024_153617_initial.up,
    down: migration_20261024_153617_initial.down,
    name: '20261024_153617_initial',
  },
  {
    up: migration_20261031_184721_guests.up,
    down: migration_20261031_184721_guests.down,
    name: '20261031_184721_guests'
  },
];
