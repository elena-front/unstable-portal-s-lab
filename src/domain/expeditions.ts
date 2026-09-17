import type { GameBalanceConfig } from '../config/gameBalance';
import { appendEvent } from './events';
import { releaseInvalidObservers } from './observerRules';
import { effectiveStability, remainingLifetime, synchronizePortal } from './portalPhysics';
import { estimatedResearchSeconds, synchronizeWorldStatuses } from './research';
import { activePortalsToWorld, employeesInWorld } from './selectors';
import type {
  DomainDependencies,
  DomainResult,
  DomainState,
  Employee,
  Portal,
} from './types';

function rejected(
  state: DomainState,
  dependencies: DomainDependencies,
  reason: string,
): DomainResult {
  return {
    ok: false,
    reason,
    value: appendEvent(state, dependencies, 'expedition', 'rejected', reason),
  };
}

export function transitCostPerEmployee(
  portal: Portal,
  config: GameBalanceConfig,
): number {
  return (
    config.transitBaseCost +
    config.transitDissipationWeight * portal.dissipationCoefficient +
    config.transitInstabilityWeight * (1 - effectiveStability(portal))
  );
}

export function transitCost(
  portal: Portal,
  employeeCount: number,
  config: GameBalanceConfig,
): number {
  return Math.max(0, employeeCount) * transitCostPerEmployee(portal, config);
}

export function energyAfterTransit(
  portal: Portal,
  employeeCount: number,
  config: GameBalanceConfig,
): number {
  return Math.max(0, portal.energy - transitCost(portal, employeeCount, config));
}

export function maxReturnCount(portal: Portal, config: GameBalanceConfig): number {
  if (portal.lifecycle !== 'active') return 0;
  return Math.max(0, Math.floor(portal.energy / transitCostPerEmployee(portal, config)));
}

export function findBetterReturnPortal(
  state: DomainState,
  selectedPortal: Portal,
  employeeCount: number,
  config: GameBalanceConfig,
): Portal | null {
  const currentCapacity = maxReturnCount(selectedPortal, config);
  return activePortalsToWorld(state, selectedPortal.destinationWorldId)
    .filter((portal) => portal.id !== selectedPortal.id &&
      portal.riskStatus !== 'critical' &&
      maxReturnCount(portal, config) > currentCapacity)
    .sort((a, b) =>
      Number(maxReturnCount(b, config) >= employeeCount) - Number(maxReturnCount(a, config) >= employeeCount) ||
      Number(b.riskStatus === 'stable') - Number(a.riskStatus === 'stable') ||
      maxReturnCount(b, config) - maxReturnCount(a, config))
    .at(0) ?? null;
}

export function findReliableReserve(
  state: DomainState,
  selectedPortal: Portal,
  returningEmployeeCount: number,
  requiredSeconds: number,
  config: GameBalanceConfig,
): Portal | null {
  return (
    activePortalsToWorld(state, selectedPortal.destinationWorldId).find(
      (portal) =>
        portal.id !== selectedPortal.id &&
        portal.riskStatus === 'stable' &&
        energyAfterTransit(portal, returningEmployeeCount, config) > 0 &&
        remainingLifetime(portal, config) >=
          requiredSeconds + config.reliableReserveSeconds,
    ) ?? null
  );
}

function selectedEmployees(
  state: DomainState,
  ids: readonly string[],
): Employee[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const selected = ids.map((id) => state.employees.find((employee) => employee.id === id));
  return selected.every((employee): employee is Employee => employee !== undefined)
    ? selected
    : null;
}

export function sendResearchers(
  state: DomainState,
  portalId: string,
  employeeIds: readonly string[],
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainResult {
  if (state.cycle.status !== 'running') {
    return rejected(state, dependencies, 'Партия уже завершена.');
  }
  const portal = state.portals.find((candidate) => candidate.id === portalId);
  if (!portal || portal.lifecycle !== 'active') {
    return rejected(state, dependencies, 'Выбранный портал недоступен.');
  }
  if (portal.riskStatus === 'critical') {
    return rejected(state, dependencies, 'Нельзя отправлять сотрудников в критичный портал.');
  }
  const destination = state.worlds.find((candidate) => candidate.id === portal.destinationWorldId);
  if (!destination) return rejected(state, dependencies, 'Мир назначения не найден.');
  if (destination.researchStatus === 'explored') {
    return rejected(state, dependencies, 'Мир уже исследован. Новая экспедиция не нужна.');
  }
  if (employeeIds.length < 1 || employeeIds.length > config.maxExpeditionSize) {
    return rejected(
      state,
      dependencies,
      `Размер группы должен быть от 1 до ${config.maxExpeditionSize}.`,
    );
  }
  const selected = selectedEmployees(state, employeeIds);
  if (!selected || selected.some((employee) => employee.location !== 'lab')) {
    return rejected(state, dependencies, 'Выбранные сотрудники недоступны в лаборатории.');
  }

  const energyAfter = energyAfterTransit(portal, selected.length, config);
  if (energyAfter === 0) {
    const world = state.worlds.find((candidate) => candidate.id === portal.destinationWorldId);
    if (!world) return rejected(state, dependencies, 'Мир назначения не найден.');
    const futureCount = employeesInWorld(state, world.id).length + selected.length;
    const researchSeconds = estimatedResearchSeconds(world, futureCount);
    if (!findReliableReserve(state, portal, selected.length, researchSeconds, config)) {
      return rejected(
        state,
        dependencies,
        'Переход исчерпает портал, а надёжного маршрута возвращения нет.',
      );
    }
  }

  const selectedIds = new Set(employeeIds);
  const futureWorldCount =
    employeesInWorld(state, portal.destinationWorldId).length + selected.length;
  let next: DomainState = {
    ...state,
    employees: state.employees.map((employee) =>
      selectedIds.has(employee.id)
        ? {
            ...employee,
            location: { worldId: portal.destinationWorldId },
            role: { type: 'researcher' },
          }
        : employee,
    ),
    portals: state.portals.map((candidate) =>
      candidate.id === portal.id
        ? energyAfter === 0
          ? { ...candidate, energy: 0, lifecycle: 'collapsed', riskStatus: 'critical' }
          : synchronizePortal(
              { ...candidate, energy: energyAfter },
              futureWorldCount,
              config,
            )
        : candidate,
    ),
  };
  next = releaseInvalidObservers(next);
  next = synchronizeWorldStatuses(next);
  next = appendEvent(
    next,
    dependencies,
    'expedition',
    'success',
    `В мир отправлено сотрудников: ${selected.length}.`,
  );
  return { ok: true, value: next };
}

export function returnEmployees(
  state: DomainState,
  portalId: string,
  employeeIds: readonly string[],
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainResult {
  if (state.cycle.status !== 'running') {
    return rejected(state, dependencies, 'Партия уже завершена.');
  }
  const portal = state.portals.find((candidate) => candidate.id === portalId);
  if (!portal || portal.lifecycle !== 'active') {
    return rejected(state, dependencies, 'Выбранный портал недоступен.');
  }
  const selected = selectedEmployees(state, employeeIds);
  if (
    !selected ||
    selected.length === 0 ||
    selected.some(
      (employee) =>
        employee.location === 'lab' ||
        employee.location.worldId !== portal.destinationWorldId,
    )
  ) {
    return rejected(state, dependencies, 'Выбранные сотрудники не находятся в этом мире.');
  }
  if (selected.length > maxReturnCount(portal, config)) {
    return rejected(state, dependencies, 'Энергии портала недостаточно для возвращения выбранной группы.');
  }

  const selectedIds = new Set(employeeIds);
  const energyAfter = energyAfterTransit(portal, selected.length, config);
  const forceCollapse = energyAfter === 0;
  let next: DomainState = {
    ...state,
    employees: state.employees.map((employee) =>
      selectedIds.has(employee.id)
        ? { ...employee, location: 'lab', role: { type: 'researcher' } }
        : employee,
    ),
  };
  const remainingInWorld = employeesInWorld(next, portal.destinationWorldId).length;
  next = {
    ...next,
    portals: next.portals.map((candidate) => {
      if (candidate.id !== portal.id) return candidate;
      if (forceCollapse) {
        return {
          ...candidate,
          energy: energyAfter,
          lifecycle: 'collapsed',
          riskStatus: 'critical',
        };
      }
      return synchronizePortal({ ...candidate, energy: energyAfter }, remainingInWorld, config);
    }),
  };
  next = releaseInvalidObservers(next);
  next = synchronizeWorldStatuses(next);
  next = appendEvent(
    next,
    dependencies,
    'expedition',
    'success',
    forceCollapse
      ? `Сотрудники возвращены: ${selected.length}; портал схлопнулся.`
      : `Сотрудники возвращены: ${selected.length}.`,
  );
  return { ok: true, value: next };
}
