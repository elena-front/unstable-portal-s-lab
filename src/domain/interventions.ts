import type { GameBalanceConfig } from '../config/gameBalance';
import { appendEvent } from './events';
import {
  energyAfterTransit,
  findReliableReserve,
  maxReturnCount,
} from './expeditions';
import { releaseInvalidObservers } from './observerRules';
import { accelerateAfterEarlyClosure } from './portalDirector';
import { portalRisk, remainingLifetime, synchronizePortal } from './portalPhysics';
import { clamp, randomFloat } from './random';
import {
  employeesInWorld,
  isStabilizationEligible,
  isVeryImportantPortal,
} from './selectors';
import type {
  DomainDependencies,
  DomainResult,
  DomainState,
  EventKind,
  Portal,
} from './types';

function rejected(
  state: DomainState,
  dependencies: DomainDependencies,
  kind: EventKind,
  reason: string,
): DomainResult {
  return {
    ok: false,
    reason,
    value: appendEvent(state, dependencies, kind, 'rejected', reason),
  };
}

function releaseObserver(state: DomainState, portalId: string): DomainState {
  return {
    ...state,
    employees: state.employees.map((employee) =>
      employee.role.type === 'observer' && employee.role.portalId === portalId
        ? { ...employee, role: { type: 'researcher' } }
        : employee,
    ),
  };
}

export function stabilizationChance(
  portal: Portal,
  hasObserver: boolean,
  config: GameBalanceConfig,
): number {
  return clamp(
    config.stabilizationBaseChance -
      config.stabilizationRiskPenalty * portalRisk(portal, config) +
      (hasObserver ? config.observerChanceBonus : 0),
    config.stabilizationChanceRange[0],
    config.stabilizationChanceRange[1],
  );
}

export function stabilizePortal(
  state: DomainState,
  portalId: string,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainResult {
  if (state.cycle.status !== 'running') {
    return rejected(state, dependencies, 'stabilization', 'Партия уже завершена.');
  }
  const portal = state.portals.find((candidate) => candidate.id === portalId);
  if (!portal || portal.lifecycle !== 'active') {
    return rejected(state, dependencies, 'stabilization', 'Портал недоступен.');
  }
  if (!isStabilizationEligible(state, portal)) {
    return rejected(state, dependencies, 'stabilization', 'Стабилизация доступна единственному стабильному маршруту или важному опасному/критичному порталу.');
  }
  if (portal.stabilizationBonus >= config.maxStabilizationBonus) {
    return rejected(state, dependencies, 'stabilization', 'Достигнут максимальный бонус стабилизации.');
  }
  if (state.cycle.stabilizationAttemptsUsed >= config.stabilizationAttempts) {
    return rejected(state, dependencies, 'stabilization', 'Попытки стабилизации закончились.');
  }

  const observer = state.employees.find(
    (employee) =>
      employee.role.type === 'observer' && employee.role.portalId === portal.id,
  );
  const success = dependencies.random() < stabilizationChance(portal, Boolean(observer), config);
  const lifetimeBefore = remainingLifetime(portal, config);
  let updatedPortal = portal;
  if (success) {
    const strength = randomFloat(dependencies.random, config.stabilizationStrengthRange);
    const stabilizationBonus = Math.min(
      config.maxStabilizationBonus,
      1 - (1 - portal.stabilizationBonus) * (1 - strength),
    );
    updatedPortal = synchronizePortal(
      { ...portal, stabilizationBonus },
      employeesInWorld(state, portal.destinationWorldId).length,
      config,
    );
    if (remainingLifetime(updatedPortal, config) < lifetimeBefore) {
      throw new Error('Стабилизация не может уменьшать время жизни портала.');
    }
  }

  let next: DomainState = {
    ...state,
    cycle: {
      ...state.cycle,
      stabilizationAttemptsUsed: state.cycle.stabilizationAttemptsUsed + 1,
    },
    portals: state.portals.map((candidate) =>
      candidate.id === portal.id ? updatedPortal : candidate,
    ),
  };
  next = releaseObserver(next, portal.id);
  next = appendEvent(
    next,
    dependencies,
    'stabilization',
    success ? 'success' : 'info',
    success ? 'Стабилизация портала успешна.' : 'Стабилизация не удалась.',
  );
  return { ok: true, value: next };
}

export function sendObserver(
  state: DomainState,
  portalId: string,
  employeeId: string,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainResult {
  if (state.cycle.status !== 'running') {
    return rejected(state, dependencies, 'observer', 'Партия уже завершена.');
  }
  const portal = state.portals.find((candidate) => candidate.id === portalId);
  if (!portal || portal.lifecycle !== 'active' || portal.riskStatus !== 'dangerous') {
    return rejected(
      state,
      dependencies,
      'observer',
      portal?.riskStatus === 'critical'
        ? 'Наблюдателя нельзя отправить в критичный портал.'
        : 'Наблюдатель доступен только для опасного активного портала.',
    );
  }
  if (!isVeryImportantPortal(state, portal)) {
    return rejected(state, dependencies, 'observer', 'Портал не является очень важным.');
  }
  const observers = state.employees.filter((employee) => employee.role.type === 'observer');
  if (observers.length >= config.maxActiveObservers) {
    return rejected(state, dependencies, 'observer', 'Активный наблюдатель уже назначен.');
  }
  const employee = state.employees.find((candidate) => candidate.id === employeeId);
  if (!employee || employee.location !== 'lab') {
    return rejected(state, dependencies, 'observer', 'Сотрудник недоступен в лаборатории.');
  }
  const energyAfter = energyAfterTransit(portal, 1, config);
  if (energyAfter === 0) {
    return rejected(state, dependencies, 'observer', 'Отправка наблюдателя исчерпает единственный портал.');
  }

  let next: DomainState = {
    ...state,
    employees: state.employees.map((candidate) =>
      candidate.id === employee.id
        ? {
            ...candidate,
            location: { worldId: portal.destinationWorldId },
            role: { type: 'observer', portalId: portal.id },
          }
        : candidate,
    ),
    portals: state.portals.map((candidate) =>
      candidate.id === portal.id
        ? synchronizePortal(
            { ...candidate, energy: energyAfter },
            employeesInWorld(state, portal.destinationWorldId).length + 1,
            config,
          )
        : candidate,
    ),
  };
  next = releaseInvalidObservers(next);
  next = appendEvent(next, dependencies, 'observer', 'success', 'Наблюдатель назначен.');
  return { ok: true, value: next };
}

export function closePortal(
  state: DomainState,
  portalId: string,
  confirmed: boolean,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): DomainResult {
  if (state.cycle.status !== 'running') {
    return rejected(state, dependencies, 'portal', 'Партия уже завершена.');
  }
  const portal = state.portals.find((candidate) => candidate.id === portalId);
  if (!portal || portal.lifecycle === 'closed') {
    return rejected(state, dependencies, 'portal', 'Портал уже закрыт или не найден.');
  }

  let reason: Portal['closedReason'] = 'collapsed-cleared';
  if (portal.lifecycle === 'active') {
    const world = state.worlds.find((candidate) => candidate.id === portal.destinationWorldId);
    if (!world) return rejected(state, dependencies, 'portal', 'Мир назначения не найден.');
    const count = employeesInWorld(state, world.id).length;
    const reserve = findReliableReserve(state, portal, count, 0, config);
    if (world.researchStatus !== 'explored' && (count > 0 || maxReturnCount(portal, config) > 0) && !reserve) {
      return rejected(state, dependencies, 'portal', 'Для закрытия канала в неисследованный мир нужен другой надёжный маршрут.');
    }
    if (count > 0) {
      if (!confirmed) {
        return rejected(state, dependencies, 'portal', 'Подтвердите закрытие портала с сотрудниками в мире.');
      }
      if (!reserve) {
        return rejected(state, dependencies, 'portal', 'Закрытие оставит сотрудников без надёжного маршрута.');
      }
    }
    reason = 'manual';
  }

  let next: DomainState = {
    ...state,
    portals: state.portals.map((candidate) =>
      candidate.id === portal.id
        ? { ...candidate, lifecycle: 'closed', closedReason: reason }
        : candidate,
    ),
  };
  next = releaseObserver(next, portal.id);
  if (portal.lifecycle === 'active') next = accelerateAfterEarlyClosure(next, config);
  next = appendEvent(next, dependencies, 'portal', 'success', 'Портал закрыт оператором.');
  return { ok: true, value: next };
}
