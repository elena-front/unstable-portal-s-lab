import { gameBalance, type GameBalanceConfig } from '../config/gameBalance';
import { createInitialState } from './gameFactory';
import { tickGame } from './gameCycle';
import type { DomainState, EntityId } from './types';

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
