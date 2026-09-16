import { describe, expect, it } from 'vitest';

import { createInitialState } from './gameFactory';
import { createDemoScenario } from './demoScenario';
import { missionSummary, tickGame } from './gameCycle';
import {
  domainState,
  employee,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';

describe('игровой цикл', () => {
  it('считает выполнение миссии и процент выживших', () => {
    const base = { id: 'g', startedAt: '', finishedAt: '', exploredWorlds: 6,
      totalWorlds: 6, returnedEmployees: 9, lostEmployees: 3,
      closedPortals: 0, collapsedPortals: 0, stabilizationAttemptsUsed: 0 };
    expect(missionSummary(base)).toEqual({ completed: true, score: 75 });
    expect(missionSummary({ ...base, exploredWorlds: 5 })).toEqual({ completed: false, score: 75 });
  });
  it('создаёт шесть миров, двенадцать сотрудников и использует внедрённый баланс', () => {
    const state = createInitialState(
      testDependencies(() => 0),
      testConfig({
        cycleDurationSeconds: 10,
        worldsCount: 2,
        initialEmployees: 3,
        firstPortalDelayRange: [2, 2],
      }),
    );
    expect(state.worlds).toHaveLength(2);
    expect(state.employees).toHaveLength(3);
    expect(state.cycle.durationSeconds).toBe(10);
    expect(state.cycle.nextPortalInSeconds).toBe(2);
  });

  it('создаёт повторяемый демонстрационный сценарий с шестью мирами', () => {
    const first = createDemoScenario();
    expect(first).toEqual(createDemoScenario());
    expect(first.worlds).toHaveLength(6);
    expect(first.employees).toHaveLength(12);
    expect(first.portals.length).toBeGreaterThan(0);
  });

  it('не завершает партию досрочно после исследования всех миров', () => {
    const state = domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
    });
    const next = tickGame(state, 1, testDependencies(), testConfig());
    expect(next.cycle.status).toBe('running');
  });

  it('за большой промежуток обрабатывает каждое случайное появление', () => {
    const config = testConfig({
      cycleDurationSeconds: 20,
      worldsCount: 1,
      firstPortalDelayRange: [2, 2],
      nextPortalDelayRange: [3, 3],
      portalEnergyRange: [100, 100],
      dissipationRange: [0, 0],
    });
    const dependencies = testDependencies(() => 0);
    const initial = createInitialState(dependencies, config);
    const next = tickGame(initial, 8, dependencies, config);
    expect(next.portals).toHaveLength(3);
    expect(next.cycle.elapsedSeconds).toBe(8);
    expect(next.cycle.nextPortalInSeconds).toBe(3);
  });

  it('завершает строго по таймеру и считает сотрудников вне лаборатории потерянными', () => {
    const state = domainState({
      cycle: { ...domainState().cycle, durationSeconds: 10, elapsedSeconds: 9 },
      employees: [
        employee('safe'),
        employee('lost', { location: { worldId: 'world-1' } }),
      ],
    });
    const dependencies = testDependencies();
    const finished = tickGame(state, 1, dependencies, testConfig());
    expect(finished.cycle.status).toBe('finished');
    expect(finished.cycle.result).toMatchObject({
      returnedEmployees: 1,
      lostEmployees: 1,
    });

    const frozen = tickGame(finished, 100, dependencies, testConfig());
    expect(frozen).toBe(finished);
    expect(frozen.events).toHaveLength(finished.events.length);
  });

  it('автоматически закрывает ранее критичный портал без сотрудников', () => {
    const state = domainState({
      portals: [
        {
          ...domainState().portals[0]!,
          energy: 50,
          wasCritical: true,
          riskStatus: 'dangerous',
        },
      ],
      employees: [employee('safe')],
    });
    const next = tickGame(state, 1, testDependencies(), testConfig());
    expect(next.portals[0]?.lifecycle).toBe('closed');
    expect(next.portals[0]?.closedReason).toBe('critical-empty');
  });
});
