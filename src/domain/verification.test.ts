import { describe, expect, it } from 'vitest';

import { createAppState, createPortalReducer } from '../state/portalReducer';
import {
  domainState,
  employee,
  portal,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';
import { findReliableReserve, returnEmployees } from './expeditions';
import { tickGame } from './gameCycle';
import { createInitialState } from './gameFactory';
import { evolvePortal, riskStatusFromRisk } from './portalPhysics';
import { advanceResearch } from './research';
import { employeesInWorld, isImportantPortal } from './selectors';

describe('проверочный чеклист', () => {
  it('тестовая конфигурация меняет длительность и пороги без изменения общего баланса', () => {
    const config = testConfig({ cycleDurationSeconds: 90, dangerousRiskThreshold: .6, criticalRiskThreshold: .9 });
    const state = createInitialState(testDependencies(), config);
    expect(state.cycle.durationSeconds).toBe(90);
    expect(riskStatusFromRisk(.8, config)).toBe('dangerous');
    expect(riskStatusFromRisk(.8, testConfig())).toBe('critical');
  });

  it('не обновляет коэффициенты до 60-й секунды', () => {
    const route = portal({ coefficientAgeSeconds: 58 });
    const next = evolvePortal(route, 1, 0, () => { throw new Error('Ранний запрос случайности'); }, testConfig());
    expect(next.coefficientAgeSeconds).toBe(59);
    expect(next.dissipationCoefficient).toBe(route.dissipationCoefficient);
    expect(next.stability).toBe(route.stability);
  });

  it('два портала получают актуальный штат из общего мира', () => {
    const state = domainState({
      portals: [portal(), portal({ id: 'portal-2' })],
      employees: [employee('field', { location: { worldId: 'world-1' } }), employee('free')],
    });
    expect(state.portals.every((route) => employeesInWorld(state, route.destinationWorldId).length === 1)).toBe(true);
    const returned = returnEmployees(state, 'portal-2', ['field'], testDependencies(), testConfig());
    expect(returned.ok).toBe(true);
    expect(returned.value.portals.every((route) => employeesInWorld(returned.value, route.destinationWorldId).length === 0)).toBe(true);
  });

  it('важность учитывает все действующие маршруты к сотрудникам', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'dangerous' }), portal({ id: 'safe', riskStatus: 'stable' })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    });
    expect(isImportantPortal(state, state.portals[0]!)).toBe(false);
    const threatened = { ...state, portals: state.portals.map((route) => ({ ...route, riskStatus: 'dangerous' as const })) };
    expect(isImportantPortal(threatened, threatened.portals[0]!)).toBe(true);
  });

  it('отвергает резерв с недостаточным временем или энергией возвращения', () => {
    const selected = portal({ energy: 1 });
    const state = domainState({ portals: [selected, portal({ id: 'reserve', energy: 100 })] });
    expect(findReliableReserve(state, selected, 1, 1000, testConfig())).toBeNull();
    const lowEnergy = domainState({
      portals: [selected, portal({ id: 'reserve', energy: 2, dissipationCoefficient: 0, stability: 1, initialLifetimeSeconds: null })],
    });
    expect(findReliableReserve(lowEnergy, selected, 1, 0, testConfig())).toBeNull();
  });

  it('возвращает группу до схлопывания портала без второго резерва', () => {
    const state = domainState({
      portals: [portal({ energy: 7 })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    });
    const result = returnEmployees(state, 'portal-1', ['field'], testDependencies(), testConfig());
    expect(result.ok).toBe(true);
    expect(result.value.employees[0]?.location).toBe('lab');
    expect(result.value.portals[0]?.lifecycle).toBe('collapsed');
  });

  it('исследует группой из двух человек со скоростью sqrt(2)', () => {
    const state = domainState({
      employees: [
        employee('first', { location: { worldId: 'world-1' } }),
        employee('second', { location: { worldId: 'world-1' } }),
      ],
    });
    const next = advanceResearch(state, 10);
    expect(next.worlds[0]?.researchProgress).toBeCloseTo(10 * Math.sqrt(2));
  });

  it('оставляет критичный портал открытым до ухода последнего сотрудника', () => {
    const state = domainState({
      portals: [portal({ energy: 10, riskStatus: 'critical', wasCritical: true })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
      cycle: { ...domainState().cycle, nextPortalInSeconds: 500 },
    });
    const occupied = tickGame(state, 1, testDependencies(), testConfig());
    expect(occupied.portals[0]?.lifecycle).toBe('active');
    const empty = { ...occupied, employees: [employee('field')] };
    const closed = tickGame(empty, 1, testDependencies(), testConfig());
    expect(closed.portals[0]?.closedReason).toBe('critical-empty');
  });

  it('сохраняет первый результат и добавляет второй после новой партии', () => {
    const config = testConfig({ cycleDurationSeconds: 10 });
    const reducer = createPortalReducer(testDependencies(), config);
    const first = createAppState(domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      cycle: { ...domainState().cycle, durationSeconds: 10, elapsedSeconds: 9, nextPortalInSeconds: 100 },
    }));
    const finished = reducer(first, { type: 'tick', deltaSeconds: 1 });
    const restarted = reducer(finished, { type: 'newGame' });
    const second = reducer(restarted, { type: 'tick', deltaSeconds: 10 });
    expect(second.resultHistory).toHaveLength(2);
    expect(second.resultHistory[0]?.exploredWorlds).toBe(1);
    expect(second.resultHistory[1]?.exploredWorlds).toBe(0);
  });
});
