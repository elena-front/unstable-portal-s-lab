import { describe, expect, it } from 'vitest';

import { closePortal, sendObserver, stabilizationChance, stabilizePortal } from './interventions';
import { tickGame } from './gameCycle';
import { remainingLifetime } from './portalPhysics';
import {
  domainState,
  employee,
  portal,
  sequenceRandom,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';

describe('стабилизация и наблюдатель', () => {
  const config = testConfig();

  function importantState() {
    return domainState({
      portals: [portal({ energy: 50, riskStatus: 'dangerous' })],
      employees: [
        employee('field', { location: { worldId: 'world-1' } }),
        employee('free'),
      ],
    });
  }

  it('разрешает стабилизацию единственного стабильного маршрута без сотрудников', () => {
    const single = domainState({ portals: [portal({ riskStatus: 'stable' })] });
    const result = stabilizePortal(single, 'portal-1', testDependencies(() => 0), config);
    expect(result.ok).toBe(true);
    expect(result.value.cycle.stabilizationAttemptsUsed).toBe(1);

    const duplicate = domainState({ portals: [portal(), portal({ id: 'second' })] });
    const blocked = stabilizePortal(duplicate, 'portal-1', testDependencies(() => 0), config);
    expect(blocked.ok).toBe(false);
    expect(blocked.value.cycle.stabilizationAttemptsUsed).toBe(0);
  });

  it('повышает шанс опасного портала наблюдателем', () => {
    const route = importantState().portals[0]!;
    expect(stabilizationChance(route, true, config)).toBeGreaterThan(
      stabilizationChance(route, false, config),
    );
  });

  it('успешно даёт случайный бонус и не уменьшает время жизни', () => {
    const state = importantState();
    const before = remainingLifetime(state.portals[0]!, config);
    const result = stabilizePortal(
      state,
      'portal-1',
      testDependencies(sequenceRandom([0, 0.5])),
      config,
    );
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]!.stabilizationBonus).toBeGreaterThan(0);
    expect(remainingLifetime(result.value.portals[0]!, config)).toBeGreaterThanOrEqual(before);
    expect(result.value.cycle.stabilizationAttemptsUsed).toBe(1);
  });

  it('неудача расходует попытку, но сохраняет физические параметры', () => {
    const state = importantState();
    const result = stabilizePortal(
      state,
      'portal-1',
      testDependencies(() => 0.99),
      config,
    );
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]).toEqual(state.portals[0]);
    expect(result.value.cycle.stabilizationAttemptsUsed).toBe(1);
  });

  it('не расходует четвёртую попытку или попытку при максимальном бонусе', () => {
    const exhausted = importantState();
    exhausted.cycle.stabilizationAttemptsUsed = 3;
    const noAttempts = stabilizePortal(
      exhausted,
      'portal-1',
      testDependencies(),
      config,
    );
    expect(noAttempts.ok).toBe(false);
    expect(noAttempts.value.cycle.stabilizationAttemptsUsed).toBe(3);

    const capped = importantState();
    capped.portals[0] = portal({
      energy: 50,
      riskStatus: 'dangerous',
      stabilizationBonus: config.maxStabilizationBonus,
    });
    const noBonus = stabilizePortal(capped, 'portal-1', testDependencies(), config);
    expect(noBonus.ok).toBe(false);
    expect(noBonus.value.cycle.stabilizationAttemptsUsed).toBe(0);
  });

  it('назначает только одного наблюдателя очень важному опасному порталу', () => {
    const result = sendObserver(
      importantState(),
      'portal-1',
      'free',
      testDependencies(),
      config,
    );
    expect(result.ok).toBe(true);
    expect(result.value.employees.find((item) => item.id === 'free')?.role).toEqual({
      type: 'observer',
      portalId: 'portal-1',
    });
  });

  it('проверяет абсолютный запрет наблюдателя для критичного портала первым', () => {
    const state = domainState({
      portals: [portal({ riskStatus: 'critical' })],
      employees: [employee('free')],
    });
    const result = sendObserver(
      state,
      'portal-1',
      'free',
      testDependencies(),
      config,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('критичный');
  });

  it('снимает наблюдателя при переходе портала в критичный статус', () => {
    const state = domainState({
      portals: [portal({ energy: 20.1, riskStatus: 'dangerous' })],
      employees: [
        employee('observer', {
          location: { worldId: 'world-1' },
          role: { type: 'observer', portalId: 'portal-1' },
        }),
      ],
    });
    const next = tickGame(state, 1, testDependencies(), config);
    expect(next.portals[0]?.riskStatus).toBe('critical');
    expect(next.employees[0]?.role).toEqual({ type: 'researcher' });
  });
});

describe('закрытие порталов', () => {
  const config = testConfig();
  const dependencies = testDependencies();

  it('закрывает collapsed без дополнительных условий', () => {
    const state = domainState({
      cycle: { ...domainState().cycle, nextPortalInSeconds: 20 },
      portals: [portal({ lifecycle: 'collapsed', energy: 0 })],
    });
    const result = closePortal(state, 'portal-1', false, dependencies, config);
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]?.closedReason).toBe('collapsed-cleared');
    expect(result.value.cycle.nextPortalInSeconds).toBe(20);
  });

  it('ускоряет появление после досрочного закрытия, не удлиняя короткий таймер', () => {
    const base = domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      cycle: { ...domainState().cycle, nextPortalInSeconds: 20 },
    });
    const result = closePortal(base, 'portal-1', false, dependencies, config);
    expect(result.ok).toBe(true);
    expect(result.value.cycle.nextPortalInSeconds).toBe(config.earlyClosureDelaySeconds);
    const beforeOpening = tickGame(result.value, 4, dependencies, config);
    expect(beforeOpening.portals).toHaveLength(1);
    const afterOpening = tickGame(beforeOpening, 1, dependencies, config);
    expect(afterOpening.portals).toHaveLength(2);
    const sooner = closePortal({ ...base, cycle: { ...base.cycle, nextPortalInSeconds: 2 } },
      'portal-1', false, dependencies, config);
    expect(sooner.value.cycle.nextPortalInSeconds).toBe(2);
  });

  it('разрешает закрыть стабильный канал в исследованный мир без резерва', () => {
    const unexplored = closePortal(
      domainState(),
      'portal-1',
      false,
      dependencies,
      config,
    );
    expect(unexplored.ok).toBe(false);

    const explored = closePortal(
      domainState({ worlds: [world({ researchStatus: 'explored', researchProgress: 100 })] }),
      'portal-1',
      false,
      dependencies,
      config,
    );
    expect(explored.ok).toBe(true);
    expect(explored.value.portals[0]?.closedReason).toBe('manual');
  });

  it('разрешает закрыть стабильный канал в неисследованный мир при надёжном резерве', () => {
    const main = portal({ riskStatus: 'stable' });
    const reserve = portal({ id: 'reserve', stability: 1, dissipationCoefficient: 0,
      initialLifetimeSeconds: null });
    const state = domainState({ portals: [main, reserve] });
    expect(closePortal(state, main.id, false, dependencies, config).ok).toBe(true);
    expect(closePortal({ ...state, portals: [main] }, main.id, false, dependencies, config).ok).toBe(false);
  });

  it('не позволяет закрыть последний маршрут к сотруднику', () => {
    const state = domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    });
    const result = closePortal(state, 'portal-1', true, dependencies, config);
    expect(result.ok).toBe(false);
    expect(result.value.portals[0]?.lifecycle).toBe('active');
  });

  it('закрывает исследованный маршрут при подтверждении и надёжном резерве', () => {
    const state = domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      portals: [portal(), portal({ id: 'reserve', stability: 1, dissipationCoefficient: 0 })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    });
    const result = closePortal(state, 'portal-1', true, dependencies, config);
    expect(result.ok).toBe(true);
    expect(result.value.portals[0]?.lifecycle).toBe('closed');
  });

  it('закрывает критичный маршрут в неисследованный мир только при надёжном резерве', () => {
    const critical = portal({ riskStatus: 'critical', wasCritical: true, energy: 10 });
    const reserve = portal({ id: 'reserve', dissipationCoefficient: 0, stability: 1,
      initialLifetimeSeconds: null });
    const state = domainState({ portals: [critical, reserve],
      employees: [employee('field', { location: { worldId: 'world-1' } })] });
    expect(closePortal(state, critical.id, false, dependencies, config).ok).toBe(false);
    const closed = closePortal(state, critical.id, true, dependencies, config);
    expect(closed.ok).toBe(true);
    expect(closed.value.portals[0]?.lifecycle).toBe('closed');
    const noReserve = closePortal({ ...state, portals: [critical] }, critical.id, true, dependencies, config);
    expect(noReserve.ok).toBe(false);
  });
});
