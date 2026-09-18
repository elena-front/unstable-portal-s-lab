import { describe, expect, it } from 'vitest';

import { findBetterReturnPortal, maxReturnCount, returnEmployees, sendResearchers, transitCost } from './expeditions';
import { advanceResearch } from './research';
import { tickGame } from './gameCycle';
import { closePortal } from './interventions';
import {
  domainState,
  employee,
  portal,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';

describe('экспедиции и исследование', () => {
  const config = testConfig();
  const dependencies = testDependencies();

  it('расходует энергию пропорционально числу сотрудников', () => {
    const route = portal({ dissipationCoefficient: 1, stability: 0 });
    expect(transitCost(route, 2, config)).toBe(14);
    const result = sendResearchers(
      domainState({ portals: [route] }),
      route.id,
      ['employee-1', 'employee-2'],
      dependencies,
      config,
    );
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]?.energy).toBe(86);
    expect(result.value.worlds[0]?.researchStatus).toBe('exploring');
  });

  it('не отправляет сотрудников в уже исследованный мир', () => {
    const state = domainState({ worlds: [world({ researchStatus: 'explored', researchProgress: 100 })] });
    const result = sendResearchers(state, 'portal-1', ['employee-1'], dependencies, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('уже исследован');
    expect(result.value.employees[0]?.location).toBe('lab');
    expect(result.value.portals[0]?.energy).toBe(state.portals[0]?.energy);
  });

  it('блокирует исчерпывающую отправку без надёжного резерва', () => {
    const result = sendResearchers(
      domainState({ portals: [portal({ energy: 7 })] }),
      'portal-1',
      ['employee-1'],
      dependencies,
      config,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('надёжного маршрута');
    expect(result.value.employees[0]?.location).toBe('lab');
  });

  it('разрешает исчерпывающую отправку при надёжном стабильном резерве', () => {
    const selected = portal({ energy: 7 });
    const reserve = portal({
      id: 'reserve',
      energy: 100,
      dissipationCoefficient: 0,
      stability: 1,
      initialLifetimeSeconds: null,
    });
    const state = domainState({
      worlds: [world({ researchRequired: 1 })],
      portals: [selected, reserve],
    });
    const result = sendResearchers(
      state,
      selected.id,
      ['employee-1'],
      dependencies,
      config,
    );
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]?.lifecycle).toBe('collapsed');
    expect(result.value.employees[0]?.location).toEqual({ worldId: 'world-1' });
  });

  it('учитывает всех сотрудников мира при проверке резерва исчерпывающей отправки', () => {
    const selected = portal({ energy: 7 });
    const reserve = portal({ id: 'reserve', energy: 4, dissipationCoefficient: 0,
      stability: 1, initialLifetimeSeconds: null });
    const state = domainState({
      worlds: [world({ researchRequired: 1 })],
      portals: [selected, reserve],
      employees: [employee('field', { location: { worldId: 'world-1' } }), employee('free')],
    });
    const rejected = sendResearchers(state, selected.id, ['free'], dependencies, config);
    expect(rejected.ok).toBe(false);
    expect(rejected.value.employees.find((person) => person.id === 'free')?.location).toBe('lab');
    const enough = { ...state, portals: [selected, { ...reserve, energy: 5 }] };
    expect(sendResearchers(enough, selected.id, ['free'], dependencies, config).ok).toBe(true);
  });

  it('не отправляет сотрудника, если энергии не хватает оплатить переход даже с резервом', () => {
    const selected = portal({ energy: 3 });
    const reserve = portal({ id: 'reserve', energy: 100,
      dissipationCoefficient: 0, stability: 1, initialLifetimeSeconds: null });
    const state = domainState({ portals: [selected, reserve] });
    const result = sendResearchers(state, selected.id, ['employee-1'], dependencies, config);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Энергии портала недостаточно');
    expect(result.value.employees[0]?.location).toBe('lab');
  });

  it('после аварийного возврата сохраняет схлопнувшийся портал до ручного закрытия', () => {
    const route = portal({ energy: 7, riskStatus: 'critical', wasCritical: true });
    const state = domainState({ portals: [route],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
      cycle: { ...domainState().cycle, nextPortalInSeconds: 100 } });
    const returned = returnEmployees(state, route.id, ['field'], dependencies, config);
    expect(returned.ok).toBe(true);
    expect(returned.value.portals[0]?.lifecycle).toBe('collapsed');
    const later = tickGame(returned.value, 2, dependencies, config);
    expect(later.portals[0]?.lifecycle).toBe('collapsed');
    const closed = closePortal(later, route.id, false, dependencies, config);
    expect(closed.ok).toBe(true);
    expect(closed.value.portals[0]?.closedReason).toBe('collapsed-cleared');
  });

  it('отклоняет опасный резерв, даже если его энергии достаточно', () => {
    const result = sendResearchers(
      domainState({
        worlds: [world({ researchRequired: 1 })],
        portals: [
          portal({ energy: 7 }),
          portal({ id: 'reserve', riskStatus: 'dangerous', energy: 100 }),
        ],
      }),
      'portal-1',
      ['employee-1'],
      dependencies,
      config,
    );
    expect(result.ok).toBe(false);
  });

  it('исследует со скоростью sqrt(N) и не превышает объём мира', () => {
    const state = domainState({
      worlds: [world({ researchRequired: 10, researchProgress: 9 })],
      employees: [
        employee('e1', { location: { worldId: 'world-1' } }),
        employee('e2', { location: { worldId: 'world-1' } }),
        employee('e3', { location: { worldId: 'world-1' } }),
        employee('e4', { location: { worldId: 'world-1' } }),
      ],
    });
    const next = advanceResearch(state, 1);
    expect(next.worlds[0]?.researchProgress).toBe(10);
    expect(next.worlds[0]?.researchStatus).toBe('explored');
  });

  it('разрешает оплачиваемый возврат через критичный портал', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'critical', energy: 50, wasCritical: true })],
      employees: [employee('e1', { location: { worldId: 'world-1' } })],
    });
    const returned = returnEmployees(
      state,
      'portal-1',
      ['e1'],
      dependencies,
      config,
    );
    expect(returned.ok).toBe(true);
    expect(returned.value.employees[0]?.location).toBe('lab');
    expect(returned.value.portals[0]?.energy).toBe(43);
  });

  it('критичный портал возвращает часть группы, но блокирует переход без энергии', () => {
    const critical = portal({ riskStatus: 'critical', energy: 10, wasCritical: true });
    const state = domainState({ portals: [critical], employees: [
      employee('first', { location: { worldId: 'world-1' } }),
      employee('second', { location: { worldId: 'world-1' } }),
    ] });
    expect(maxReturnCount(critical, config)).toBe(1);
    expect(returnEmployees(state, critical.id, ['first', 'second'], dependencies, config).ok).toBe(false);
    const partial = returnEmployees(state, critical.id, ['first'], dependencies, config);
    expect(partial.ok).toBe(true);
    expect(partial.value.employees.find((person) => person.id === 'second')?.location)
      .toEqual({ worldId: 'world-1' });
    expect(partial.value.portals[0]?.lifecycle).toBe('active');
    const empty = portal({ riskStatus: 'critical', energy: 3, wasCritical: true });
    expect(maxReturnCount(empty, config)).toBe(0);
    expect(returnEmployees({ ...state, portals: [empty] }, empty.id, ['first'], dependencies, config).ok)
      .toBe(false);
  });

  it('разрешает только оплачиваемую часть группы и находит другой маршрут', () => {
    const limited = portal({ energy: 10, initialLifetimeSeconds: 100 });
    const safe = portal({ id: 'safe', riskStatus: 'stable', energy: 100,
      dissipationCoefficient: 0, stability: 1, initialLifetimeSeconds: null });
    const state = domainState({ portals: [limited, safe], employees: [
      employee('first', { location: { worldId: 'world-1' } }),
      employee('second', { location: { worldId: 'world-1' } }),
    ] });
    expect(maxReturnCount(limited, config)).toBe(1);
    expect(findBetterReturnPortal(state, limited, 2, config)?.id).toBe('safe');
    expect(returnEmployees(state, limited.id, ['first', 'second'], dependencies, config).ok).toBe(false);
    const partial = returnEmployees(state, limited.id, ['first'], dependencies, config);
    expect(partial.ok).toBe(true);
    expect(partial.value.employees.find((person) => person.id === 'first')?.location).toBe('lab');
    expect(partial.value.employees.find((person) => person.id === 'second')?.location)
      .toEqual({ worldId: 'world-1' });
  });

  it('предлагает критичный портал для возврата, когда другого пригодного нет', () => {
    const selected = portal({ energy: 3 });
    const critical = portal({ id: 'critical', riskStatus: 'critical', energy: 30,
      initialLifetimeSeconds: 2000 });
    const state = domainState({ portals: [selected, critical], employees: [
      employee('first', { location: { worldId: 'world-1' } }),
      employee('second', { location: { worldId: 'world-1' } }),
    ] });
    expect(findBetterReturnPortal(state, selected, 2, config)?.id).toBe('critical');
    expect(returnEmployees(state, critical.id, ['first', 'second'], dependencies, config).ok).toBe(true);
  });

  it('никогда не разрешает отправку в критичный портал', () => {
    const state = domainState({ portals: [portal({ riskStatus: 'critical' })] });
    const result = sendResearchers(
      state,
      'portal-1',
      ['employee-1'],
      dependencies,
      config,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('критичный');
  });
});
