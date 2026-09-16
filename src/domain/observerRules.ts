import type { DomainState } from './types';

export function releaseInvalidObservers(state: DomainState): DomainState {
  const validPortalIds = new Set(
    state.portals
      .filter(
        (portal) =>
          portal.lifecycle === 'active' && portal.riskStatus === 'dangerous',
      )
      .map((portal) => portal.id),
  );
  return {
    ...state,
    employees: state.employees.map((employee) =>
      employee.role.type === 'observer' &&
      !validPortalIds.has(employee.role.portalId)
        ? { ...employee, role: { type: 'researcher' } }
        : employee,
    ),
  };
}
