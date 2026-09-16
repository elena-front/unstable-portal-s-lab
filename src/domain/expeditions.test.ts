import { describe, expect, it } from 'vitest';

import { returnEmployees, sendResearchers, transitCost } from './expeditions';
import { advanceResearch } from './research';
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

  it('блокирует исчерпывающую отправку без надёжного резерва', () => {
    const result = sendResearchers(
      domainState({ portals: [portal({ energy: 5 })] }),
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
    const selected = portal({ energy: 5 });
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

  it('отклоняет опасный резерв, даже если его энергии достаточно', () => {
    const result = sendResearchers(
      domainState({
        worlds: [world({ researchRequired: 1 })],
        portals: [
          portal({ energy: 5 }),
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

  it('требует подтверждение критической эвакуации и затем схлопывает портал', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'critical', energy: 50, wasCritical: true })],
      employees: [employee('e1', { location: { worldId: 'world-1' } })],
    });
    const rejected = returnEmployees(
      state,
      'portal-1',
      ['e1'],
      false,
      dependencies,
      config,
    );
    expect(rejected.ok).toBe(false);

    const returned = returnEmployees(
      state,
      'portal-1',
      ['e1'],
      true,
      dependencies,
      config,
    );
    expect(returned.ok).toBe(true);
    expect(returned.value.employees[0]?.location).toBe('lab');
    expect(returned.value.portals[0]?.lifecycle).toBe('collapsed');
    expect(returned.value.portals[0]?.energy).toBe(43);
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
