import { gameBalance, type GameBalanceConfig } from '../config/gameBalance';
import type {
  DomainDependencies,
  DomainState,
  Employee,
  Portal,
  World,
} from '../domain/types';

export function testConfig(
  overrides: Partial<GameBalanceConfig> = {},
): GameBalanceConfig {
  return { ...gameBalance, ...overrides };
}

export function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

export function testDependencies(random: () => number = () => 0.5): DomainDependencies {
  let id = 0;
  return {
    random,
    createId: (entity) => `${entity}-${++id}`,
    now: () => '2026-09-16T08:00:00.000Z',
  };
}

export function world(overrides: Partial<World> = {}): World {
  return {
    id: 'world-1',
    name: 'Аэрис',
    visibility: 'revealed',
    researchStatus: 'questionable',
    researchRequired: 100,
    researchProgress: 0,
    ...overrides,
  };
}

export function portal(overrides: Partial<Portal> = {}): Portal {
  return {
    id: 'portal-1',
    name: 'Канал 1',
    destinationWorldId: 'world-1',
    energy: 100,
    dissipationCoefficient: 1,
    stability: 0,
    stabilizationBonus: 0,
    initialLifetimeSeconds: 1000,
    coefficientAgeSeconds: 0,
    wasCritical: false,
    riskStatus: 'stable',
    lifecycle: 'active',
    closedReason: null,
    ...overrides,
  };
}

export function employee(
  id: string,
  overrides: Partial<Employee> = {},
): Employee {
  return {
    id,
    location: 'lab',
    role: { type: 'researcher' },
    ...overrides,
  };
}

export function domainState(overrides: Partial<DomainState> = {}): DomainState {
  return {
    cycle: {
      id: 'game-1',
      status: 'running',
      startedAt: '2026-09-16T08:00:00.000Z',
      durationSeconds: 600,
      elapsedSeconds: 0,
      nextPortalInSeconds: 30,
      spawnPending: false,
      knownWorldStreak: 0,
      stabilizationAttemptsUsed: 0,
      result: null,
    },
    worlds: [world()],
    portals: [portal()],
    employees: [employee('employee-1'), employee('employee-2')],
    events: [],
    ...overrides,
  };
}
