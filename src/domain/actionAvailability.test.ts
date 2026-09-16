import { describe, expect, it } from 'vitest';

import { gameBalance } from '../config/gameBalance';
import { loadAppState, saveAppState } from '../persistence/localGameStorage';
import { createAppState } from '../state/portalReducer';
import { domainState, employee, portal, testDependencies, world } from '../test/domainFixtures';
import { actionAvailability } from './actionAvailability';
import { createReviewScenario, type ReviewScenario } from './demoScenario';
import { tickGame } from './gameCycle';
import { closePortal } from './interventions';
import { portalRisk } from './portalPhysics';

const scenarios: ReviewScenario[] = ['normal', 'dangerous', 'critical', 'critical-reserve', 'closed', 'isolated', 'limit', 'limit-explored', 'exhausted', 'no-reserve', 'reserve', 'observer', 'success', 'failure', 'observer-success', 'observer-failure', 'explored', 'finished'];

describe('проверочные сценарии и причины действий', () => {
  it('создаёт воспроизводимые состояния для проверки', () => {
    for (const name of scenarios) {
      expect(createReviewScenario(name)).toEqual(createReviewScenario(name));
    }
    expect(createReviewScenario('critical').portals[0]?.riskStatus).toBe('critical');
    expect(portalRisk(createReviewScenario('critical').portals[0]!, gameBalance)).toBeGreaterThanOrEqual(.8);
    expect(createReviewScenario('closed').portals[0]?.closedReason).toBe('critical-empty');
    expect(createReviewScenario('isolated').employees.some((person) => person.location !== 'lab')).toBe(true);
    expect(createReviewScenario('limit').portals).toHaveLength(20);
    expect(createReviewScenario('limit-explored').portals).toHaveLength(20);
    expect(createReviewScenario('finished').cycle.result?.lostEmployees).toBeGreaterThan(0);
    expect(createReviewScenario('observer').employees.some((person) => person.role.type === 'observer')).toBe(true);
    expect(createReviewScenario('explored').worlds.some((item) => item.researchStatus === 'explored')).toBe(true);
    expect(tickGame(createReviewScenario('explored'), 1, testDependencies(), gameBalance).portals[0]?.lifecycle).toBe('active');
    expect(createReviewScenario('success').events.at(-1)?.message).toContain('успешна');
    expect(createReviewScenario('failure').events.at(-1)?.message).toContain('не удалась');
    for (const name of scenarios) {
      localStorage.clear();
      expect(saveAppState(localStorage, createAppState(createReviewScenario(name)))).toBeNull();
      expect(loadAppState(localStorage, testDependencies(), gameBalance).storageWarning, name).toBeNull();
    }
    localStorage.clear();
  });

  it('объясняет запрет отправки и эвакуацию критичного портала', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'critical', energy: 10 })],
      employees: [employee('field', { location: { worldId: 'world-1' } }), employee('free')],
    });
    const reason = actionAvailability(state, state.portals[0]!, 1, gameBalance);
    expect(reason.send).toContain('критичный');
    expect(reason.returnGroup).toBeNull();
    expect(reason.observe).toContain('критичный');
  });

  it('объясняет риск изоляции и исчерпание попыток', () => {
    const state = domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      portals: [portal({ energy: 40, riskStatus: 'dangerous' })],
      employees: [employee('field', { location: { worldId: 'world-1' } }), employee('free')],
      cycle: { ...domainState().cycle, stabilizationAttemptsUsed: gameBalance.stabilizationAttempts },
    });
    const reason = actionAvailability(state, state.portals[0]!, 1, gameBalance);
    expect(reason.close).toContain('без надёжного маршрута');
    expect(reason.stabilize).toContain('закончились');
  });

  it('различает исчерпывающий переход с резервом и без него', () => {
    const blocked = createReviewScenario('no-reserve');
    const allowed = createReviewScenario('reserve');
    expect(actionAvailability(blocked, blocked.portals[0]!, 1, gameBalance).send).toContain('надёжного маршрута');
    expect(actionAvailability(allowed, allowed.portals[0]!, 1, gameBalance).send).toBeNull();
  });

  it('после закрытия схлопнувшегося портала освобождает слот ожидающему', () => {
    const full = createReviewScenario('limit');
    const delayed = tickGame(full, 1, testDependencies(), gameBalance);
    expect(delayed.portals.filter((item) => item.lifecycle !== 'closed')).toHaveLength(20);
    const cleared = closePortal(delayed, delayed.portals[0]!.id, true, testDependencies(), gameBalance).value;
    const next = tickGame(cleared, 1, testDependencies(), gameBalance);
    expect(next.portals).toHaveLength(21);
    expect(next.portals.filter((item) => item.lifecycle !== 'closed')).toHaveLength(20);
  });
});
