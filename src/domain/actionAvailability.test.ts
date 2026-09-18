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
  it('показывает стабилизацию для единственного стабильного маршрута', () => {
    const single = domainState();
    expect(actionAvailability(single, single.portals[0]!, 1, gameBalance).stabilize).toBeNull();
    const duplicate = domainState({ portals: [portal(), portal({ id: 'second' })] });
    expect(actionAvailability(duplicate, duplicate.portals[0]!, 1, gameBalance).stabilize).toContain('единственному');
  });
  it('создаёт воспроизводимые состояния для проверки', () => {
    for (const name of scenarios) {
      expect(createReviewScenario(name)).toEqual(createReviewScenario(name));
    }
    expect(createReviewScenario('critical').portals[0]?.riskStatus).toBe('critical');
    expect(portalRisk(createReviewScenario('critical').portals[0]!, gameBalance)).toBeGreaterThanOrEqual(.8);
    expect(createReviewScenario('closed').portals[0]?.closedReason).toBe('manual');
    expect(createReviewScenario('isolated').employees.some((person) => person.location !== 'lab')).toBe(true);
    expect(createReviewScenario('limit').portals).toHaveLength(gameBalance.maxUnclosedPortals);
    expect(createReviewScenario('limit-explored').portals).toHaveLength(gameBalance.maxUnclosedPortals);
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

  it('разрешает возврат через критичный портал только при достаточной энергии', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'critical', energy: 10 })],
      employees: [employee('field', { location: { worldId: 'world-1' } }), employee('free')],
    });
    const reason = actionAvailability(state, state.portals[0]!, 1, gameBalance);
    expect(reason.send).toContain('критичный');
    expect(reason.returnGroup).toBeNull();
    expect(reason.observe).toContain('критичный');
    const drained = { ...state, portals: [portal({ riskStatus: 'critical', energy: 3 })] };
    expect(actionAvailability(drained, drained.portals[0]!, 1, gameBalance).returnGroup)
      .toContain('Энергии недостаточно');
  });

  it('объясняет запрет экспедиции в исследованный мир и условие закрытия критичного маршрута', () => {
    const explored = domainState({ worlds: [world({ researchStatus: 'explored', researchProgress: 100 })] });
    expect(actionAvailability(explored, explored.portals[0]!, 1, gameBalance).send).toContain('уже исследован');
    const critical = portal({ riskStatus: 'critical', wasCritical: true, energy: 10 });
    const reserve = portal({ id: 'reserve', stability: 1, dissipationCoefficient: 0,
      initialLifetimeSeconds: null });
    const withReserve = domainState({ portals: [critical, reserve] });
    expect(actionAvailability(withReserve, critical, 1, gameBalance).close).toBeNull();
    const withoutReserve = domainState({ portals: [critical] });
    expect(actionAvailability(withoutReserve, critical, 1, gameBalance).close).toContain('надёжный маршрут');
  });

  it('разрешает закрыть стабильный канал в неисследованный мир с резервом', () => {
    const main = portal();
    const reserve = portal({ id: 'reserve', stability: 1, dissipationCoefficient: 0,
      initialLifetimeSeconds: null });
    const state = domainState({ portals: [main, reserve] });
    expect(actionAvailability(state, main, 1, gameBalance).close).toBeNull();
    expect(actionAvailability({ ...state, portals: [main] }, main, 1, gameBalance).close).toContain('надёжный маршрут');
  });

  it('даёт закрыть пустой маршрут, энергии которого не хватает даже на одного', () => {
    const route = portal({ energy: 3 });
    const state = domainState({ portals: [route] });
    const availability = actionAvailability(state, route, 1, gameBalance);
    expect(availability.send).toContain('Энергии портала недостаточно');
    expect(availability.close).toBeNull();

    const occupied = domainState({ portals: [route],
      employees: [employee('field', { location: { worldId: 'world-1' } })] });
    expect(actionAvailability(occupied, route, 1, gameBalance).close)
      .toContain('надёжный маршрут');
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
    expect(delayed.portals.filter((item) => item.lifecycle !== 'closed')).toHaveLength(gameBalance.maxUnclosedPortals);
    const cleared = closePortal(delayed, delayed.portals[0]!.id, true, testDependencies(), gameBalance).value;
    const next = tickGame(cleared, 1, testDependencies(), gameBalance);
    expect(next.portals).toHaveLength(gameBalance.maxUnclosedPortals + 1);
    expect(next.portals.filter((item) => item.lifecycle !== 'closed')).toHaveLength(gameBalance.maxUnclosedPortals);
  });
});
