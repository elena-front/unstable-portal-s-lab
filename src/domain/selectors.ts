import type { GameBalanceConfig } from '../config/gameBalance';
import { portalRisk, remainingLifetime } from './portalPhysics';
import type { DomainState, Employee, Portal } from './types';

export function isEmployeeInWorld(employee: Employee, worldId: string): boolean {
  return employee.location !== 'lab' && employee.location.worldId === worldId;
}

export function employeesInWorld(state: DomainState, worldId: string): Employee[] {
  return state.employees.filter((employee) => isEmployeeInWorld(employee, worldId));
}

export function activePortalsToWorld(
  state: DomainState,
  worldId: string,
): Portal[] {
  return state.portals.filter(
    (portal) =>
      portal.lifecycle === 'active' && portal.destinationWorldId === worldId,
  );
}

export function unclosedPortalCount(portals: readonly Portal[]): number {
  return portals.filter((portal) => portal.lifecycle !== 'closed').length;
}

export function isImportantPortal(state: DomainState, portal: Portal): boolean {
  if (employeesInWorld(state, portal.destinationWorldId).length === 0) return false;
  const routes = activePortalsToWorld(state, portal.destinationWorldId);
  return (
    routes.some((route) => route.id === portal.id) &&
    (routes.length === 1 ||
      routes.every((route) =>
        ['dangerous', 'critical'].includes(route.riskStatus),
      ))
  );
}

export function isVeryImportantPortal(state: DomainState, portal: Portal): boolean {
  return (
    employeesInWorld(state, portal.destinationWorldId).length > 0 &&
    activePortalsToWorld(state, portal.destinationWorldId).length === 1
  );
}

export function isStabilizationEligible(state: DomainState, portal: Portal): boolean {
  return portal.lifecycle === 'active' && state.portals.some((route) => route.id === portal.id);
}

export function lessRiskyAlternative(state: DomainState, portal: Portal, config: GameBalanceConfig): Portal | null {
  return activePortalsToWorld(state, portal.destinationWorldId)
    .filter((route) => route.id !== portal.id && portalRisk(route, config) < portalRisk(portal, config))
    .sort((a, b) => portalRisk(a, config) - portalRisk(b, config))[0] ?? null;
}

export function closeConfirmationReason(state: DomainState, portal: Portal): string | null {
  if (portal.lifecycle !== 'active') return null;
  const world = state.worlds.find((item) => item.id === portal.destinationWorldId);
  const employees = employeesInWorld(state, portal.destinationWorldId).length;
  const lastRoute = activePortalsToWorld(state, portal.destinationWorldId).every((route) => route.id === portal.id);
  if (employees > 0) return `В мире остались сотрудники (${employees}). Закрытие канала может оставить их без маршрута возвращения. Закрыть портал?`;
  if (world?.researchStatus !== 'explored' && lastRoute) return 'Это последний работающий портал в неисследованный мир. Доступ к нему будет потерян до появления нового канала. Закрыть портал?';
  return null;
}

export function recommendationForPortal(portal: Portal): string {
  if (portal.lifecycle === 'collapsed') {
    return 'Закройте схлопнувшийся портал, чтобы освободить место.';
  }
  if (portal.lifecycle === 'closed') return 'Портал закрыт, действий не требуется.';
  if (portal.riskStatus === 'critical') {
    return 'Не отправляйте сотрудников; для возвращения проверьте запас энергии и другой маршрут.';
  }
  if (portal.riskStatus === 'dangerous') {
    return 'Проверьте резервный маршрут и целесообразность стабилизации.';
  }
  return 'Портал стабилен; следите за временем жизни и коэффициентами.';
}

export function hasEnoughLifetime(
  portal: Portal,
  requiredSeconds: number,
  config: GameBalanceConfig,
): boolean {
  return remainingLifetime(portal, config) >= requiredSeconds;
}
