export type EntityId = string;
export type RandomSource = () => number;
export type IdSource = (entity: 'game' | 'portal' | 'event') => EntityId;
export type TimeSource = () => string;

export type CycleStatus = 'ready' | 'running' | 'finished';
export type WorldVisibility = 'hidden' | 'revealed';
export type ResearchStatus = 'questionable' | 'exploring' | 'explored';
export type RiskStatus = 'stable' | 'dangerous' | 'critical';
export type PortalLifecycle = 'active' | 'collapsed' | 'closed';
export type ClosedReason = 'manual' | 'critical-empty' | 'collapsed-cleared';

export interface GameResult {
  id: EntityId;
  startedAt: string;
  finishedAt: string;
  exploredWorlds: number;
  totalWorlds: number;
  returnedEmployees: number;
  lostEmployees: number;
  closedPortals: number;
  collapsedPortals: number;
  stabilizationAttemptsUsed: number;
}

export interface GameCycle {
  id: EntityId;
  status: CycleStatus;
  startedAt: string;
  durationSeconds: number;
  elapsedSeconds: number;
  nextPortalInSeconds: number;
  spawnPending: boolean;
  knownWorldStreak: number;
  stabilizationAttemptsUsed: number;
  result: GameResult | null;
}

export interface World {
  id: EntityId;
  name: string;
  visibility: WorldVisibility;
  researchStatus: ResearchStatus;
  researchRequired: number;
  researchProgress: number;
}

export type EmployeeLocation = 'lab' | { worldId: EntityId };
export type EmployeeRole =
  | { type: 'researcher' }
  | { type: 'observer'; portalId: EntityId };

export interface Employee {
  id: EntityId;
  location: EmployeeLocation;
  role: EmployeeRole;
}

export interface Portal {
  id: EntityId;
  name: string;
  destinationWorldId: EntityId;
  energy: number;
  dissipationCoefficient: number;
  stability: number;
  stabilizationBonus: number;
  initialLifetimeSeconds: number | null;
  coefficientAgeSeconds: number;
  openingGraceSecondsRemaining?: number;
  wasCritical: boolean;
  riskStatus: RiskStatus;
  lifecycle: PortalLifecycle;
  closedReason: ClosedReason | null;
}

export type EventKind =
  | 'cycle'
  | 'portal'
  | 'expedition'
  | 'research'
  | 'stabilization'
  | 'observer';

export interface GameEvent {
  id: EntityId;
  occurredAt: string;
  kind: EventKind;
  outcome: 'success' | 'rejected' | 'info';
  message: string;
}

export interface DomainState {
  cycle: GameCycle;
  worlds: World[];
  portals: Portal[];
  employees: Employee[];
  events: GameEvent[];
}

export interface DomainDependencies {
  random: RandomSource;
  createId: IdSource;
  now: TimeSource;
}

export type DomainResult<T = DomainState> =
  | { ok: true; value: T }
  | { ok: false; value: T; reason: string };
