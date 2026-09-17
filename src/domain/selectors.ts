import type { GameBalanceConfig } from '../config/gameBalance';
import { remainingLifetime } from './portalPhysics';
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
  if (portal.lifecycle !== 'active') return false;
  if (portal.riskStatus === 'stable') {
    const routes = activePortalsToWorld(state, portal.destinationWorldId);
    return routes.length === 1 && routes[0]?.id === portal.id;
  }
  return isImportantPortal(state, portal);
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
