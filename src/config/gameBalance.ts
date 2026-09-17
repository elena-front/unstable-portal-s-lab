export type NumberRange = readonly [minimum: number, maximum: number];

export interface GameBalanceConfig {
  cycleDurationSeconds: number;
  worldsCount: number;
  initialEmployees: number;
  maxExpeditionSize: number;
  maxUnclosedPortals: number;
  portalEnergyRange: NumberRange;
  initialPortalRiskRange: NumberRange;
  newPortalGraceSeconds: number;
  dissipationRange: NumberRange;
  stabilityRange: NumberRange;
  researchRequiredRange: NumberRange;
  earlyPortalDelayRange: NumberRange;
  earlyPortalCount: number;
  nextPortalDelayRange: NumberRange;
  earlyClosureDelaySeconds: number;
  hiddenWorldProbability: number;
  knownWorldStreakLimit: number;
  reliableReserveSeconds: number;
  energyTickSeconds: number;
  coefficientRefreshSeconds: number;
  lifetimeScaleSeconds: number;
  dangerousRiskThreshold: number;
  criticalRiskThreshold: number;
  transitBaseCost: number;
  transitDissipationWeight: number;
  transitInstabilityWeight: number;
  stabilizationAttempts: number;
  stabilizationStrengthRange: NumberRange;
  maxStabilizationBonus: number;
  maxActiveObservers: number;
  stabilizationBaseChance: number;
  stabilizationRiskPenalty: number;
  observerChanceBonus: number;
  stabilizationChanceRange: NumberRange;
}

export const gameBalance: Readonly<GameBalanceConfig> = Object.freeze({
  cycleDurationSeconds: 600,
  worldsCount: 9,
  initialEmployees: 12,
  maxExpeditionSize: 4,
  maxUnclosedPortals: 8,
  portalEnergyRange: [0, 100],
  initialPortalRiskRange: [0, 0.95],
  newPortalGraceSeconds: 20,
  dissipationRange: [0, 1],
  stabilityRange: [0, 1],
  researchRequiredRange: [90, 150],
  earlyPortalDelayRange: [5, 9],
  earlyPortalCount: 3,
  nextPortalDelayRange: [25, 40],
  earlyClosureDelaySeconds: 5,
  hiddenWorldProbability: 0.65,
  knownWorldStreakLimit: 2,
  reliableReserveSeconds: 60,
  energyTickSeconds: 1,
  coefficientRefreshSeconds: 60,
  lifetimeScaleSeconds: 10,
  dangerousRiskThreshold: 0.5,
  criticalRiskThreshold: 0.8,
  transitBaseCost: 2,
  transitDissipationWeight: 3,
  transitInstabilityWeight: 2,
  stabilizationAttempts: 3,
  stabilizationStrengthRange: [0.08, 0.25],
  maxStabilizationBonus: 0.75,
  maxActiveObservers: 1,
  stabilizationBaseChance: 0.9,
  stabilizationRiskPenalty: 0.65,
  observerChanceBonus: 0.15,
  stabilizationChanceRange: [0.2, 0.8],
} satisfies GameBalanceConfig);
