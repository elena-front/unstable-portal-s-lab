import { describe, expect, it } from 'vitest';

import { evolvePortal, portalRisk, remainingLifetime, riskStatusFromRisk } from './portalPhysics';
import { portal, sequenceRandom, testConfig } from '../test/domainFixtures';

describe('физика портала', () => {
  const config = testConfig();

  it.each([
    [0, 'stable'],
    [0.499, 'stable'],
    [0.5, 'dangerous'],
    [0.799, 'dangerous'],
    [0.8, 'critical'],
    [1, 'critical'],
  ] as const)('классифицирует риск %s как %s', (risk, status) => {
    expect(riskStatusFromRisk(risk, config)).toBe(status);
  });

  it('считает риск долей истёкшего начального времени', () => {
    expect(portalRisk(portal({ energy: 100 }), config)).toBe(0);
    expect(portalRisk(portal({ energy: 50 }), config)).toBe(0.5);
    expect(portalRisk(portal({ energy: 20 }), config)).toBe(0.8);
    expect(portalRisk(portal({ energy: 0 }), config)).toBe(1);
  });

  it('оставляет новый критичный портал видимым на время реакции', () => {
    const opened = portal({ riskStatus: 'critical', wasCritical: true,
      initialLifetimeSeconds: 5000, openingGraceSecondsRemaining: 20 });
    const beforeTimeout = evolvePortal(opened, 19, 0, () => 0.5, config);
    expect(beforeTimeout.lifecycle).toBe('active');
    expect(beforeTimeout.openingGraceSecondsRemaining).toBe(1);
    const expired = evolvePortal(beforeTimeout, 1, 0, () => 0.5, config);
    expect(expired.lifecycle).toBe('closed');
    expect(expired.closedReason).toBe('critical-empty');
  });

  it('безопасно обрабатывает нулевое рассеивание и откладывает T_initial', () => {
    const timeless = portal({
      stability: 1,
      initialLifetimeSeconds: null,
    });
    expect(remainingLifetime(timeless, config)).toBe(Infinity);
    expect(portalRisk(timeless, config)).toBe(0);

    const evolved = evolvePortal(
      timeless,
      60,
      1,
      sequenceRandom([0.5, 0]),
      config,
    );
    expect(evolved.initialLifetimeSeconds).not.toBeNull();
    expect(portalRisk(evolved, config)).toBe(0);
  });

  it('за секунду расходует K / C и обновляет коэффициенты ровно на 60-й секунде', () => {
    const evolved = evolvePortal(
      portal({ coefficientAgeSeconds: 59 }),
      1,
      1,
      sequenceRandom([0.25, 0.75]),
      config,
    );
    expect(evolved.energy).toBeCloseTo(99.9);
    expect(evolved.dissipationCoefficient).toBeCloseTo(0.25);
    expect(evolved.stability).toBeCloseTo(0.75);
    expect(evolved.coefficientAgeSeconds).toBe(0);
  });

  it('не возвращает NaN для повреждённых чисел', () => {
    const broken = portal({ energy: Number.NaN, initialLifetimeSeconds: Number.NaN });
    expect(portalRisk(broken, config)).toBe(1);
    expect(remainingLifetime(broken, config)).toBe(0);
  });
});
