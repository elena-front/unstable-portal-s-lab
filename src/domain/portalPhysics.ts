import type { GameBalanceConfig } from '../config/gameBalance';
import { clamp, randomFloat } from './random';
import type { Portal, RandomSource, RiskStatus } from './types';

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function effectiveStability(portal: Portal): number {
  const stability = clamp(portal.stability, 0, 1);
  const bonus = clamp(portal.stabilizationBonus, 0, 1);
  return clamp(stability + (1 - stability) * bonus, 0, 1);
}

export function effectiveDissipation(portal: Portal): number {
  return (
    clamp(portal.dissipationCoefficient, 0, 1) *
    (1 - effectiveStability(portal))
  );
}

export function remainingLifetime(
  portal: Portal,
  config: GameBalanceConfig,
): number {
  const energy = Math.max(0, finiteOr(portal.energy, 0));
  if (energy === 0) return 0;
  const dissipation = effectiveDissipation(portal);
  if (dissipation === 0) return Number.POSITIVE_INFINITY;
  return (config.lifetimeScaleSeconds * energy) / dissipation;
}

export function portalRisk(portal: Portal, config: GameBalanceConfig): number {
  if (Math.max(0, finiteOr(portal.energy, 0)) === 0) return 1;
  if (portal.initialLifetimeSeconds === null) return 0;
  const initial = finiteOr(portal.initialLifetimeSeconds, 0);
  if (initial <= 0) return 1;
  return clamp(1 - remainingLifetime(portal, config) / initial, 0, 1);
}

export function riskStatusFromRisk(
  risk: number,
  config: GameBalanceConfig,
): RiskStatus {
  const normalizedRisk = clamp(risk, 0, 1);
  if (normalizedRisk >= config.criticalRiskThreshold) return 'critical';
  if (normalizedRisk >= config.dangerousRiskThreshold) return 'dangerous';
  return 'stable';
}

export function synchronizePortal(
  portal: Portal,
  employeeCount: number,
  config: GameBalanceConfig,
): Portal {
  if (portal.lifecycle !== 'active') return portal;
  const energy = clamp(portal.energy, 0, config.portalEnergyRange[1]);
  if (energy === 0) {
    return { ...portal, energy: 0, lifecycle: 'collapsed', riskStatus: 'critical' };
  }

  const withEnergy = { ...portal, energy };
  const currentLifetime = remainingLifetime(withEnergy, config);
  const initialLifetimeSeconds =
    portal.initialLifetimeSeconds === null && Number.isFinite(currentLifetime)
      ? currentLifetime
      : portal.initialLifetimeSeconds;
  const initialized = { ...withEnergy, initialLifetimeSeconds };
  const riskStatus = riskStatusFromRisk(portalRisk(initialized, config), config);
  const wasCritical = portal.wasCritical || riskStatus === 'critical';

  if (wasCritical && employeeCount === 0) {
    return {
      ...initialized,
      wasCritical,
      riskStatus,
      lifecycle: 'closed',
      closedReason: 'critical-empty',
    };
  }
  return { ...initialized, wasCritical, riskStatus };
}

export function evolvePortal(
  portal: Portal,
  deltaSeconds: number,
  employeeCount: number,
  random: RandomSource,
  config: GameBalanceConfig,
): Portal {
  if (portal.lifecycle !== 'active' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return synchronizePortal(portal, employeeCount, config);
  }

  let next = synchronizePortal(portal, employeeCount, config);
  let remainingDelta = deltaSeconds;

  while (remainingDelta > 0 && next.lifecycle === 'active') {
    const untilRefresh = Math.max(
      0,
      config.coefficientRefreshSeconds - next.coefficientAgeSeconds,
    );
    if (untilRefresh === 0) {
      next = {
        ...next,
        dissipationCoefficient: randomFloat(random, config.dissipationRange),
        stability: randomFloat(random, config.stabilityRange),
        coefficientAgeSeconds: 0,
      };
      next = synchronizePortal(next, employeeCount, config);
      continue;
    }

    const step = Math.min(remainingDelta, untilRefresh);
    const consumed =
      (effectiveDissipation(next) * step) / config.lifetimeScaleSeconds;
    next = {
      ...next,
      energy: Math.max(0, next.energy - consumed),
      coefficientAgeSeconds: next.coefficientAgeSeconds + step,
    };
    remainingDelta -= step;
    next = synchronizePortal(next, employeeCount, config);
    if (
      next.lifecycle === 'active' &&
      next.coefficientAgeSeconds >= config.coefficientRefreshSeconds
    ) {
      next = synchronizePortal(
        {
          ...next,
          dissipationCoefficient: randomFloat(random, config.dissipationRange),
          stability: randomFloat(random, config.stabilityRange),
          coefficientAgeSeconds: 0,
        },
        employeeCount,
        config,
      );
    }
  }

  return next;
}
