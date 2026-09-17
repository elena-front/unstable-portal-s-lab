import { describe, expect, it } from 'vitest';

import { closePortal } from './interventions';
import { spawnPortal } from './portalDirector';
import { tickGame } from './gameCycle';
import {
  domainState,
  portal,
  sequenceRandom,
  testConfig,
  testDependencies,
  world,
} from '../test/domainFixtures';

describe('случайный директор порталов', () => {
  it('первым открывает случайный скрытый мир', () => {
    const dependencies = testDependencies(sequenceRandom([0.9, 0.5, 0.5, 0.5, 0.5]));
    const state = domainState({
      worlds: [world({ id: 'hidden', visibility: 'hidden' })],
      portals: [],
    });
    const next = spawnPortal(state, dependencies, testConfig());
    expect(next.worlds[0]?.visibility).toBe('revealed');
    expect(next.portals[0]?.destinationWorldId).toBe('hidden');
  });

  it.each([
    [0.1, 'stable'],
    [0.65, 'dangerous'],
    [0.95, 'critical'],
  ] as const)('может открыть портал с начальным риском %s и статусом %s', (riskDraw, status) => {
    const dependencies = testDependencies(sequenceRandom([
      0.5, 0.5, 0.8, 0.8, 0, riskDraw, 0.5,
    ]));
    const state = domainState({ worlds: [world({ visibility: 'hidden' })], portals: [] });
    const next = spawnPortal(state, dependencies, testConfig());
    expect(next.portals[0]?.riskStatus).toBe(status);
    expect(next.portals[0]?.lifecycle).toBe('active');
    expect(next.portals[0]?.openingGraceSecondsRemaining).toBe(20);
  });

  it('после двух известных назначений принудительно выбирает скрытый мир', () => {
    const state = domainState({
      cycle: { ...domainState().cycle, knownWorldStreak: 2 },
      worlds: [
        world({ id: 'known', visibility: 'revealed' }),
        world({ id: 'hidden', visibility: 'hidden' }),
      ],
      portals: [portal({ destinationWorldId: 'known' })],
    });
    const next = spawnPortal(state, testDependencies(() => 0.99), testConfig());
    expect(next.portals.at(-1)?.destinationWorldId).toBe('hidden');
    expect(next.cycle.knownWorldStreak).toBe(0);
  });

  it('считает collapsed занятым слотом и создаёт ожидающий портал после закрытия', () => {
    const config = testConfig({ maxUnclosedPortals: 1 });
    const dependencies = testDependencies(() => 0.5);
    const blocked = domainState({
      cycle: { ...domainState().cycle, nextPortalInSeconds: 0 },
      portals: [portal({ lifecycle: 'collapsed', energy: 0 })],
    });
    const pending = spawnPortal(blocked, dependencies, config);
    expect(pending.cycle.spawnPending).toBe(true);
    expect(pending.portals).toHaveLength(1);

    const closed = closePortal(pending, 'portal-1', false, dependencies, config);
    expect(closed.ok).toBe(true);
    const spawned = tickGame(closed.value, 1, dependencies, config);
    expect(spawned.cycle.spawnPending).toBe(false);
    expect(spawned.portals).toHaveLength(2);
  });

  it('после первых трёх открытий использует обычный интервал', () => {
    const config = testConfig({ earlyPortalDelayRange: [5, 5], nextPortalDelayRange: [30, 30] });
    const dependencies = testDependencies();
    const first = spawnPortal(domainState({ portals: [] }), dependencies, config);
    const second = spawnPortal(first, dependencies, config);
    const third = spawnPortal(second, dependencies, config);
    expect(first.cycle.nextPortalInSeconds).toBe(5);
    expect(second.cycle.nextPortalInSeconds).toBe(5);
    expect(third.cycle.nextPortalInSeconds).toBe(30);
  });

  it('по умолчанию соблюдает лимит незакрытых каналов', () => {
    const state = domainState({
      portals: Array.from({ length: testConfig().maxUnclosedPortals }, (_, index) =>
        portal({ id: `portal-${index}`, lifecycle: index === 0 ? 'collapsed' : 'active' }),
      ),
    });
    const next = spawnPortal(state, testDependencies(), testConfig());
    expect(next.portals).toHaveLength(testConfig().maxUnclosedPortals);
    expect(next.cycle.spawnPending).toBe(true);
  });
});
