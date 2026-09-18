import { describe, expect, it } from 'vitest';

import { createPortalReducer, createAppState, portalMatchesFilter } from './portalReducer';
import { unclosedPortalCount } from '../domain/selectors';
import {
  domainState,
  employee,
  portal,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';

describe('Portal reducer', () => {
  const dependencies = testDependencies(() => 0);
  const config = testConfig();
  const reducer = createPortalReducer(dependencies, config);

  it('координирует выбор портала, фильтр и отказ доменного действия', () => {
    const initial = createAppState(domainState());
    const selected = reducer(initial, { type: 'selectPortal', portalId: 'portal-1' });
    const filtered = reducer(selected, { type: 'setFilter', filter: 'critical' });
    const rejected = reducer(filtered, {
      type: 'sendResearchers',
      portalId: 'portal-1',
      employeeIds: ['missing'],
    });
    expect(rejected.selectedPortalId).toBeNull();
    expect(rejected.portalFilter).toBe('critical');
    expect(rejected.notification?.kind).toBe('error');
    expect(rejected.events.at(-1)?.outcome).toBe('rejected');
    expect(reducer(rejected, { type: 'dismissNotification', notification: { kind: 'info', message: 'Старое' } }))
      .toBe(rejected);
    expect(reducer(rejected, { type: 'dismissNotification', notification: rejected.notification! }).notification)
      .toBeNull();
  });

  it('сохраняет выбранный канал после схлопывания и открывает все незакрытые', () => {
    const initial = createAppState(domainState({
      portals: [portal({ energy: 7, riskStatus: 'critical', wasCritical: true })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    }));
    const selected = reducer(reducer(initial, { type: 'setFilter', filter: 'critical' }),
      { type: 'selectPortal', portalId: 'portal-1' });
    const returned = reducer(selected, { type: 'returnEmployees',
      portalId: 'portal-1', employeeIds: ['field'] });
    expect(returned.portals[0]?.lifecycle).toBe('collapsed');
    expect(returned.portalFilter).toBe('all');
    expect(returned.selectedPortalId).toBe('portal-1');
  });

  it('показывает невыбранный схлопнувшийся канал в новой партии под фильтром риска', () => {
    const awaiting = reducer(createAppState(domainState()), { type: 'newGame' });
    const started = reducer(awaiting, { type: 'startGame', scenario: 'normal' });
    const opened = started.portals[0]!;
    const running = {
      ...started,
      cycle: { ...started.cycle, nextPortalInSeconds: 500 },
      portals: [{ ...opened, energy: 0.05, dissipationCoefficient: 1,
        stability: 0, initialLifetimeSeconds: 1000, riskStatus: 'stable' as const,
        lifecycle: 'active' as const, closedReason: null }],
      portalFilter: 'stable' as const,
      selectedPortalId: null,
    };
    const next = reducer(running, { type: 'tick', deltaSeconds: 1 });
    expect(next.portals[0]?.lifecycle).toBe('collapsed');
    expect(next.portalFilter).toBe('all');
    expect(next.portals.filter((item) => portalMatchesFilter(item, next.portalFilter)))
      .toContainEqual(next.portals[0]);
    expect(unclosedPortalCount(next.portals)).toBe(1);
  });

  it('после завершения добавляет результат ровно один раз и замораживает партию', () => {
    const initial = createAppState(domainState({
      cycle: { ...domainState().cycle, elapsedSeconds: 599 },
      employees: [
        employee('safe'),
        employee('field', { location: { worldId: 'world-1' } }),
      ],
    }));
    const finished = reducer(initial, { type: 'tick', deltaSeconds: 1 });
    expect(finished.cycle.status).toBe('finished');
    expect(finished.resultHistory).toHaveLength(1);
    expect(finished.resultHistory[0]?.lostEmployees).toBe(1);
    const frozen = reducer(finished, { type: 'tick', deltaSeconds: 10 });
    expect(frozen).toBe(finished);
    expect(frozen.resultHistory).toHaveLength(1);
  });

  it('новая партия сохраняет историю, но сбрасывает оперативное состояние', () => {
    const finished = reducer(
      createAppState(domainState({
        cycle: { ...domainState().cycle, elapsedSeconds: 599 },
      })),
      { type: 'tick', deltaSeconds: 1 },
    );
    const restarted = reducer(finished, { type: 'newGame' });
    expect(restarted.cycle.status).toBe('running');
    expect(restarted.cycle.id).not.toBe(finished.cycle.id);
    expect(restarted.resultHistory).toHaveLength(1);
    expect(restarted.portals).toHaveLength(0);
    expect(restarted.events).toHaveLength(0);
  });

  it('открывает первый портал сразу при старте обычной партии', () => {
    const awaiting = reducer(createAppState(domainState()), { type: 'newGame' });
    expect(awaiting.portals).toHaveLength(0);
    const started = reducer(awaiting, { type: 'startGame', scenario: 'normal' });
    expect(started.cycle.elapsedSeconds).toBe(0);
    expect(started.portals).toHaveLength(1);
    expect(started.worlds.find((world) => world.id === started.portals[0]?.destinationWorldId)?.visibility)
      .toBe('revealed');
  });

  it('очищает историю только после подтверждения и не удаляет итог текущей партии', () => {
    const finished = reducer(
      createAppState(domainState({
        cycle: { ...domainState().cycle, elapsedSeconds: 599 },
      })),
      { type: 'tick', deltaSeconds: 1 },
    );
    expect(reducer(finished, { type: 'clearHistory', confirmed: false }).resultHistory)
      .toHaveLength(1);
    const cleared = reducer(finished, { type: 'clearHistory', confirmed: true });
    expect(cleared.resultHistory).toHaveLength(0);
    expect(cleared.cycle.result).not.toBeNull();
    expect(cleared.historyClearedForCycleId).toBe(finished.cycle.id);
  });

  it('хранит назначение наблюдателя и число попыток в общем состоянии', () => {
    const important = createAppState(domainState({
      worlds: [world({ researchProgress: 50, researchStatus: 'exploring' })],
      portals: [portal({ energy: 50, riskStatus: 'dangerous' })],
      employees: [
        employee('field', { location: { worldId: 'world-1' } }),
        employee('free'),
      ],
    }));
    const observed = reducer(important, {
      type: 'sendObserver',
      portalId: 'portal-1',
      employeeId: 'free',
    });
    expect(observed.employees.find((person) => person.id === 'free')?.role.type)
      .toBe('observer');
    const stabilized = reducer(observed, {
      type: 'stabilizePortal',
      portalId: 'portal-1',
    });
    expect(stabilized.cycle.stabilizationAttemptsUsed).toBe(1);
    expect(stabilized.employees.find((person) => person.id === 'free')?.role.type)
      .toBe('researcher');
  });

  it('восстанавливает воспроизводимый демосценарий без удаления истории', () => {
    const finished = reducer(
      createAppState(domainState({
        cycle: { ...domainState().cycle, elapsedSeconds: 599 },
      })),
      { type: 'tick', deltaSeconds: 1 },
    );
    const demo = reducer(finished, { type: 'restoreDemo' });
    expect(demo.cycle.status).toBe('running');
    expect(demo.cycle.id).not.toBe(finished.cycle.id);
    expect(demo.worlds).toHaveLength(9);
    expect(demo.portals.length).toBeGreaterThan(0);
    expect(demo.resultHistory).toHaveLength(1);
  });
});
