import { gameBalance, type GameBalanceConfig } from '../config/gameBalance';
import { createInitialState } from './gameFactory';
import { tickGame } from './gameCycle';
import { stabilizePortal } from './interventions';
import type { DomainState, EntityId } from './types';

export type ReviewScenario = 'normal' | 'dangerous' | 'critical' | 'critical-reserve' | 'closed' | 'isolated' | 'limit' | 'limit-explored' | 'exhausted' | 'finished' | 'no-reserve' | 'reserve' | 'observer' | 'success' | 'failure' | 'observer-success' | 'observer-failure' | 'explored';

export function createDemoScenario(
  config: GameBalanceConfig = gameBalance,
): DomainState {
  let seed = 20260916;
  let sequence = 0;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const createId = (entity: 'game' | 'portal' | 'event'): EntityId =>
    `${entity}-demo-${++sequence}`;
  const dependencies = {
    random,
    createId,
    now: () => '2026-09-16T08:00:00.000Z',
  };
  const initial = createInitialState(dependencies, config);
  return tickGame(initial, Math.min(75, config.cycleDurationSeconds - 1), dependencies, config);
}

export function createReviewScenario(
  scenario: ReviewScenario,
  config: GameBalanceConfig = gameBalance,
): DomainState {
  const base = createDemoScenario(config);
  if (scenario === 'normal') return base;
  const first = base.portals[0];
  if (!first) return base;
  const worldId = first.destinationWorldId;
  const field = base.employees.map((employee, index) =>
    index === 0 ? { ...employee, location: { worldId }, role: { type: 'researcher' as const } } : employee,
  );
  const danger = {
    ...first,
    energy: 40,
    dissipationCoefficient: 1,
    stability: 0,
    stabilizationBonus: 0,
    initialLifetimeSeconds: 1000,
    riskStatus: 'dangerous' as const,
    lifecycle: 'active' as const,
    closedReason: null,
  };
  const critical = { ...danger, energy: 10, riskStatus: 'critical' as const, wasCritical: true };
  const worlds = base.worlds.map((world) => world.id === worldId
    ? { ...world, visibility: 'revealed' as const, researchStatus: 'exploring' as const, researchProgress: Math.max(1, Math.min(world.researchRequired - 1, 30)) }
    : world);
  const ready = { ...base, worlds, employees: field, portals: [danger] };
  if (scenario === 'dangerous') return ready;
  if (scenario === 'explored') return {
    ...base,
    worlds: base.worlds.map((world) => world.id === worldId
      ? { ...world, visibility: 'revealed' as const, researchStatus: 'explored' as const, researchProgress: world.researchRequired }
      : world),
    portals: [{ ...danger, energy: 100, dissipationCoefficient: 0, stability: 1,
      initialLifetimeSeconds: null, riskStatus: 'stable', wasCritical: false }],
  };
  if (['success', 'failure', 'observer-success', 'observer-failure'].includes(scenario)) {
    const observed = scenario.startsWith('observer-');
    const prepared = observed ? {
      ...ready,
      employees: ready.employees.map((employee, index) => index === 0
        ? { ...employee, role: { type: 'observer' as const, portalId: danger.id } }
        : employee),
    } : ready;
    return stabilizePortal(prepared, danger.id, {
      random: () => scenario.endsWith('failure') ? 0.99 : 0,
      createId: (kind) => `${kind}-review-attempt`,
      now: () => '2026-09-16T08:01:15.000Z',
    }, config).value;
  }
  if (scenario === 'observer') return {
    ...ready,
    employees: ready.employees.map((employee, index) => index === 0
      ? { ...employee, role: { type: 'observer' as const, portalId: danger.id } }
      : employee),
  };
  if (scenario === 'no-reserve') return {
    ...ready,
    portals: [{ ...danger, energy: 7, initialLifetimeSeconds: 175, riskStatus: 'dangerous' }],
  };
  if (scenario === 'reserve') return {
    ...ready,
    portals: [
      { ...danger, energy: 7, initialLifetimeSeconds: 175, riskStatus: 'dangerous' },
      { ...first, id: 'portal-review-reserve', name: 'Резервный портал', energy: 100,
        dissipationCoefficient: 0, stability: 1, initialLifetimeSeconds: null,
        riskStatus: 'stable', lifecycle: 'active', closedReason: null },
    ],
  };
  if (scenario === 'critical') return { ...ready, portals: [critical] };
  if (scenario === 'critical-reserve') return {
    ...ready,
    portals: [critical, { ...first, id: 'portal-review-safe', name: 'Безопасный маршрут',
      energy: 100, dissipationCoefficient: 0, stability: 1,
      initialLifetimeSeconds: null, wasCritical: false, riskStatus: 'stable',
      lifecycle: 'active', closedReason: null }],
  };
  if (scenario === 'exhausted') return {
    ...ready,
    cycle: { ...ready.cycle, stabilizationAttemptsUsed: config.stabilizationAttempts },
  };
  if (scenario === 'isolated') return {
    ...ready,
    portals: [{ ...critical, energy: 0, lifecycle: 'collapsed', riskStatus: 'critical' }],
  };
  if (scenario === 'closed') return {
    ...base,
    portals: [{ ...critical, lifecycle: 'closed', closedReason: 'manual' }],
  };
  if (scenario === 'limit') return {
    ...base,
    cycle: { ...base.cycle, spawnPending: true, nextPortalInSeconds: 0 },
    portals: Array.from({ length: config.maxUnclosedPortals }, (_, index) => ({
      ...first,
      id: `portal-review-${index + 1}`,
      name: `Портал ${index + 1}`,
      lifecycle: index === 0 ? 'collapsed' as const : 'active' as const,
      closedReason: null,
      energy: index === 0 ? 0 : 100,
      dissipationCoefficient: 0,
      stability: 1,
      initialLifetimeSeconds: null,
      wasCritical: index === 0,
      riskStatus: index === 0 ? 'critical' as const : 'stable' as const,
    })),
  };
  if (scenario === 'limit-explored') {
    const full = createReviewScenario('limit', config);
    return {
      ...full,
      worlds: full.worlds.map((world) => world.id === worldId
        ? { ...world, visibility: 'revealed' as const, researchStatus: 'explored' as const, researchProgress: world.researchRequired }
        : world),
      portals: full.portals.map((portal, index) => index === 0
        ? { ...portal, energy: 100, lifecycle: 'active' as const,
          riskStatus: 'stable' as const, wasCritical: false }
        : portal),
    };
  }
  const nearlyDone = {
    ...ready,
    worlds: ready.worlds.map((world) => world.id === worldId
      ? { ...world, researchStatus: 'explored' as const, researchProgress: world.researchRequired }
      : world),
    cycle: { ...ready.cycle, elapsedSeconds: config.cycleDurationSeconds - 1 },
  };
  return tickGame(nearlyDone, 1, {
    random: () => 0.5,
    createId: (kind) => `${kind}-review-finish`,
    now: () => '2026-09-16T08:10:00.000Z',
  }, config);
}
