import type { GameBalanceConfig } from '../config/gameBalance';
import { appendEvent } from './events';
import { releaseInvalidObservers } from './observerRules';
import { evolvePortal } from './portalPhysics';
import { accelerateAfterEarlyClosure, spawnPortal } from './portalDirector';
import { advanceResearch } from './research';
import { employeesInWorld } from './selectors';
import type {
  DomainDependencies,
  DomainState,
  GameResult,
  Portal,
} from './types';

function collapsedPortalCount(portals: readonly Portal[]): number {
  return portals.filter(
    (portal) =>
      portal.lifecycle === 'collapsed' ||
      portal.closedReason === 'collapsed-cleared',
  ).length;
}

export function missionSummary(result: GameResult): { completed: boolean; score: number } {
  const totalEmployees = result.returnedEmployees + result.lostEmployees;
  return {
    completed: result.totalWorlds > 0 && result.exploredWorlds === result.totalWorlds,
    score: totalEmployees > 0
      ? Math.round(100 * result.returnedEmployees / totalEmployees)
      : 0,
  };
}

export function createGameResult(
  state: DomainState,
  dependencies: DomainDependencies,
): GameResult {
  const returnedEmployees = state.employees.filter(
    (employee) => employee.location === 'lab',
  ).length;
  return {
    id: state.cycle.id,
    startedAt: state.cycle.startedAt,
    finishedAt: dependencies.now(),
    exploredWorlds: state.worlds.filter(
      (world) => world.researchStatus === 'explored',
    ).length,
    totalWorlds: state.worlds.length,
    returnedEmployees,
    lostEmployees: state.employees.length - returnedEmployees,
    closedPortals: state.portals.filter(
      (portal) => portal.lifecycle === 'closed',
    ).length,
    collapsedPortals: collapsedPortalCount(state.portals),
    stabilizationAttemptsUsed: state.cycle.stabilizationAttemptsUsed,
  };
}

export function finishGame(
  state: DomainState,
  dependencies: DomainDependencies,
): DomainState {
  if (state.cycle.status === 'finished') return state;
  const result = createGameResult(state, dependencies);
  const finished = {
    ...state,
    cycle: {
      ...state.cycle,
      status: 'finished' as const,
      elapsedSeconds: state.cycle.durationSeconds,
      result,
    },
  };
  return appendEvent(
    finished,
    dependencies,
    'cycle',
    'info',
    `Партия завершена: исследовано миров ${result.exploredWorlds} из ${result.totalWorlds}.`,
  );
}

function tickStep(
  state: DomainState,
  deltaSeconds: number,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainState {
  if (
    state.cycle.status !== 'running' ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  ) {
    return state;
  }
  const activeDelta = Math.min(
    deltaSeconds,
    state.cycle.durationSeconds - state.cycle.elapsedSeconds,
  );
  if (activeDelta <= 0) return finishGame(state, dependencies);

  const previousPortals = new Map(state.portals.map((portal) => [portal.id, portal]));
  const previousExplored = new Set(
    state.worlds
      .filter((world) => world.researchStatus === 'explored')
      .map((world) => world.id),
  );

  let next = advanceResearch(state, activeDelta);
  next = {
    ...next,
    portals: next.portals.map((portal) =>
      evolvePortal(
        portal,
        activeDelta,
        employeesInWorld(next, portal.destinationWorldId).length,
        dependencies.random,
        config,
      ),
    ),
  };
  next = releaseInvalidObservers(next);

  let earlyClosureOccurred = false;
  for (const portal of next.portals) {
    const previous = previousPortals.get(portal.id);
    if (previous?.lifecycle === 'active' && portal.lifecycle === 'collapsed') {
      next = appendEvent(next, dependencies, 'portal', 'info', `${portal.name} схлопнулся.`);
    } else if (
      previous?.lifecycle === 'active' &&
      portal.lifecycle === 'closed' &&
      portal.closedReason === 'critical-empty'
    ) {
      earlyClosureOccurred = true;
      next = appendEvent(next, dependencies, 'portal', 'info', `${portal.name} автоматически закрыт.`);
    }
  }
  for (const world of next.worlds) {
    if (world.researchStatus === 'explored' && !previousExplored.has(world.id)) {
      next = appendEvent(next, dependencies, 'research', 'success', `Мир «${world.name}» исследован.`);
    }
  }

  const nextPortalInSeconds = Math.max(
    0,
    next.cycle.nextPortalInSeconds - activeDelta,
  );
  next = {
    ...next,
    cycle: {
      ...next.cycle,
      elapsedSeconds: next.cycle.elapsedSeconds + activeDelta,
      nextPortalInSeconds,
    },
  };
  if (earlyClosureOccurred) next = accelerateAfterEarlyClosure(next, config);

  if (next.cycle.elapsedSeconds >= next.cycle.durationSeconds) {
    return finishGame(next, dependencies);
  }
  if (next.cycle.nextPortalInSeconds === 0 || next.cycle.spawnPending) {
    next = spawnPortal(next, dependencies, config);
  }
  return next;
}

export function tickGame(
  state: DomainState,
  deltaSeconds: number,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainState {
  if (
    state.cycle.status !== 'running' ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  ) {
    return state;
  }
  if (config.energyTickSeconds <= 0) {
    throw new Error('Шаг симуляции должен быть больше нуля.');
  }
  let next = state;
  let remaining = Math.min(
    deltaSeconds,
    state.cycle.durationSeconds - state.cycle.elapsedSeconds,
  );
  if (remaining <= 0) return finishGame(state, dependencies);
  while (remaining > 0 && next.cycle.status === 'running') {
    const step = Math.min(remaining, config.energyTickSeconds);
    next = tickStep(next, step, dependencies, config);
    remaining -= step;
  }
  return next;
}
