import type { GameBalanceConfig } from '../config/gameBalance';
import { appendEvent } from './events';
import { remainingLifetime, synchronizePortal } from './portalPhysics';
import { normalizedRandom, randomFloat, randomInteger, randomItem } from './random';
import { employeesInWorld, unclosedPortalCount } from './selectors';
import type { DomainDependencies, DomainState, Portal, World } from './types';

const PORTAL_NAMES = [
  'Серебряная арка',
  'Сумеречный разлом',
  'Янтарное окно',
  'Звёздный порог',
  'Тихий резонанс',
  'Северный проход',
] as const;

export function accelerateAfterEarlyClosure(state: DomainState, config: GameBalanceConfig): DomainState {
  return {
    ...state,
    cycle: {
      ...state.cycle,
      nextPortalInSeconds: Math.min(
        state.cycle.nextPortalInSeconds,
        Math.max(0, config.earlyClosureDelaySeconds),
      ),
    },
  };
}

function chooseDestination(
  state: DomainState,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): World | null {
  const hidden = state.worlds.filter((world) => world.visibility === 'hidden');
  const revealed = state.worlds.filter((world) => world.visibility === 'revealed');
  if (hidden.length === 0) return randomItem(dependencies.random, revealed);
  if (state.portals.length === 0) return randomItem(dependencies.random, hidden);

  const mustReveal = state.cycle.knownWorldStreak >= config.knownWorldStreakLimit;
  const reveal =
    mustReveal ||
    revealed.length === 0 ||
    normalizedRandom(dependencies.random) < config.hiddenWorldProbability;
  return randomItem(dependencies.random, reveal ? hidden : revealed);
}

function createPortal(
  world: World,
  state: DomainState,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): Portal {
  const id = dependencies.createId('portal');
  const base: Portal = {
    id,
    name: `${randomItem(dependencies.random, PORTAL_NAMES) ?? 'Канал'} · ${id}`,
    destinationWorldId: world.id,
    energy: randomInteger(dependencies.random, config.portalEnergyRange),
    dissipationCoefficient: randomFloat(
      dependencies.random,
      config.dissipationRange,
    ),
    stability: randomFloat(dependencies.random, config.stabilityRange),
    stabilizationBonus: 0,
    initialLifetimeSeconds: null,
    coefficientAgeSeconds: 0,
    wasCritical: false,
    riskStatus: 'stable',
    lifecycle: 'active',
    closedReason: null,
  };
  return synchronizePortal(
    base,
    employeesInWorld(state, world.id).length,
    config,
  );
}

export function spawnPortal(
  state: DomainState,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainState {
  if (state.cycle.status !== 'running') return state;
  if (unclosedPortalCount(state.portals) >= config.maxUnclosedPortals) {
    return {
      ...state,
      cycle: { ...state.cycle, nextPortalInSeconds: 0, spawnPending: true },
    };
  }

  const destination = chooseDestination(state, dependencies, config);
  if (!destination) return state;
  const wasHidden = destination.visibility === 'hidden';
  const portal = createPortal(destination, state, dependencies, config);
  const next: DomainState = {
    ...state,
    cycle: {
      ...state.cycle,
      nextPortalInSeconds: randomFloat(
        dependencies.random,
        config.nextPortalDelayRange,
      ),
      spawnPending: false,
      knownWorldStreak: wasHidden ? 0 : state.cycle.knownWorldStreak + 1,
    },
    worlds: state.worlds.map((world) =>
      world.id === destination.id ? { ...world, visibility: 'revealed' } : world,
    ),
    portals: [...state.portals, portal],
  };

  return appendEvent(
    next,
    dependencies,
    'portal',
    'info',
    `${portal.name} открыт в мир «${destination.name}».`,
  );
}

export function portalSnapshot(portal: Portal, config: GameBalanceConfig) {
  return {
    ...portal,
    remainingLifetimeSeconds: remainingLifetime(portal, config),
  };
}
