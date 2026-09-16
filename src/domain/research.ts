import type { DomainState, World } from './types';
import { employeesInWorld } from './selectors';

export function estimatedResearchSeconds(
  world: World,
  employeeCount: number,
): number {
  if (world.researchProgress >= world.researchRequired) return 0;
  if (employeeCount <= 0) return Number.POSITIVE_INFINITY;
  return (world.researchRequired - world.researchProgress) / Math.sqrt(employeeCount);
}

export function synchronizeWorldStatuses(state: DomainState): DomainState {
  return {
    ...state,
    worlds: state.worlds.map((world) => {
      if (world.researchProgress >= world.researchRequired) {
        return {
          ...world,
          researchProgress: world.researchRequired,
          researchStatus: 'explored' as const,
        };
      }
      return {
        ...world,
        researchStatus:
          employeesInWorld(state, world.id).length > 0
            ? ('exploring' as const)
            : ('questionable' as const),
      };
    }),
  };
}

export function advanceResearch(state: DomainState, deltaSeconds: number): DomainState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state;
  const worlds = state.worlds.map((world) => {
    if (world.researchStatus === 'explored') return world;
    const count = employeesInWorld(state, world.id).length;
    if (count === 0) return world;
    const progress = Math.min(
      world.researchRequired,
      world.researchProgress + Math.sqrt(count) * deltaSeconds,
    );
    return {
      ...world,
      researchProgress: progress,
      researchStatus:
        progress >= world.researchRequired
          ? ('explored' as const)
          : ('exploring' as const),
    };
  });
  return { ...state, worlds };
}
