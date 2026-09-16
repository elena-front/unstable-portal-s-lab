import type { GameBalanceConfig } from '../config/gameBalance';
import { randomFloat, randomInteger } from './random';
import type { DomainDependencies, DomainState, Employee, World } from './types';

export const WORLD_NAMES = [
  'Аэрис',
  'Кальдера',
  'Люмен',
  'Нимбус',
  'Таласса',
  'Эхо',
] as const;

export function createWorlds(
  dependencies: Pick<DomainDependencies, 'random'>,
  config: GameBalanceConfig,
): World[] {
  return Array.from({ length: config.worldsCount }, (_, index) => ({
    id: `world-${index + 1}`,
    name: WORLD_NAMES[index] ?? `Мир ${index + 1}`,
    visibility: 'hidden',
    researchStatus: 'questionable',
    researchRequired: randomInteger(
      dependencies.random,
      config.researchRequiredRange,
    ),
    researchProgress: 0,
  }));
}

export function createEmployees(config: GameBalanceConfig): Employee[] {
  return Array.from({ length: config.initialEmployees }, (_, index) => ({
    id: `employee-${index + 1}`,
    location: 'lab',
    role: { type: 'researcher' },
  }));
}

export function createInitialState(
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainState {
  return {
    cycle: {
      id: dependencies.createId('game'),
      status: 'running',
      startedAt: dependencies.now(),
      durationSeconds: config.cycleDurationSeconds,
      elapsedSeconds: 0,
      nextPortalInSeconds: randomFloat(
        dependencies.random,
        config.firstPortalDelayRange,
      ),
      spawnPending: false,
      knownWorldStreak: 0,
      stabilizationAttemptsUsed: 0,
      result: null,
    },
    worlds: createWorlds(dependencies, config),
    portals: [],
    employees: createEmployees(config),
    events: [],
  };
}
