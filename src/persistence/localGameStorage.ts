import type { GameBalanceConfig } from '../config/gameBalance';
import { createInitialState } from '../domain/gameFactory';
import type {
  DomainDependencies,
  DomainState,
  Employee,
  GameCycle,
  GameEvent,
  GameResult,
  Portal,
  World,
} from '../domain/types';
import {
  createAppState,
  type ActiveView,
  type AppState,
  type PortalFilter,
} from '../state/portalReducer';

export const GAME_STORAGE_KEY = 'unstable-portals:current:v1';
export const HISTORY_STORAGE_KEY = 'unstable-portals:history:v1';
export const STORAGE_VERSION = 1;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === 'string';
}

function nonEmptyString(value: unknown): value is string {
  return string(value) && value.length > 0;
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function fraction(value: unknown): value is number {
  return nonnegative(value) && value <= 1;
}

function member<T extends string>(value: unknown, options: readonly T[]): value is T {
  return string(value) && options.includes(value as T);
}

function uniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function validGameResult(value: unknown): value is GameResult {
  if (!record(value)) return false;
  return (
    nonEmptyString(value.id) &&
    string(value.startedAt) &&
    string(value.finishedAt) &&
    nonnegative(value.exploredWorlds) &&
    nonnegative(value.totalWorlds) &&
    value.exploredWorlds <= value.totalWorlds &&
    nonnegative(value.returnedEmployees) &&
    nonnegative(value.lostEmployees) &&
    nonnegative(value.closedPortals) &&
    nonnegative(value.collapsedPortals) &&
    nonnegative(value.stabilizationAttemptsUsed)
  );
}

function validCycle(value: unknown): value is GameCycle {
  if (!record(value)) return false;
  const resultValid =
    value.status === 'finished'
      ? validGameResult(value.result) && value.result.id === value.id
      : value.result === null;
  return (
    nonEmptyString(value.id) &&
    member(value.status, ['ready', 'running', 'finished']) &&
    string(value.startedAt) &&
    nonnegative(value.durationSeconds) &&
    value.durationSeconds > 0 &&
    nonnegative(value.elapsedSeconds) &&
    value.elapsedSeconds <= value.durationSeconds &&
    nonnegative(value.nextPortalInSeconds) &&
    typeof value.spawnPending === 'boolean' &&
    nonnegative(value.knownWorldStreak) &&
    nonnegative(value.stabilizationAttemptsUsed) &&
    resultValid
  );
}

function validWorld(value: unknown): value is World {
  if (!record(value)) return false;
  return (
    nonEmptyString(value.id) &&
    nonEmptyString(value.name) &&
    member(value.visibility, ['hidden', 'revealed']) &&
    member(value.researchStatus, ['questionable', 'exploring', 'explored']) &&
    nonnegative(value.researchRequired) &&
    value.researchRequired > 0 &&
    nonnegative(value.researchProgress) &&
    value.researchProgress <= value.researchRequired &&
    (value.researchStatus !== 'explored' ||
      value.researchProgress === value.researchRequired)
  );
}

function validPortal(value: unknown, config: GameBalanceConfig): value is Portal {
  if (!record(value)) return false;
  const validInitial =
    value.initialLifetimeSeconds === null || nonnegative(value.initialLifetimeSeconds);
  return (
    nonEmptyString(value.id) &&
    nonEmptyString(value.name) &&
    nonEmptyString(value.destinationWorldId) &&
    nonnegative(value.energy) &&
    value.energy <= config.portalEnergyRange[1] &&
    fraction(value.dissipationCoefficient) &&
    fraction(value.stability) &&
    fraction(value.stabilizationBonus) &&
    value.stabilizationBonus <= config.maxStabilizationBonus &&
    validInitial &&
    nonnegative(value.coefficientAgeSeconds) &&
    value.coefficientAgeSeconds <= config.coefficientRefreshSeconds &&
    typeof value.wasCritical === 'boolean' &&
    member(value.riskStatus, ['stable', 'dangerous', 'critical']) &&
    member(value.lifecycle, ['active', 'collapsed', 'closed']) &&
    (value.closedReason === null ||
      member(value.closedReason, ['manual', 'critical-empty', 'collapsed-cleared'])) &&
    (value.lifecycle === 'closed' ? value.closedReason !== null : value.closedReason === null)
  );
}

function validEmployee(value: unknown): value is Employee {
  if (!record(value) || !nonEmptyString(value.id)) return false;
  const locationValid =
    value.location === 'lab' ||
    (record(value.location) && nonEmptyString(value.location.worldId));
  const roleValid =
    record(value.role) &&
    (value.role.type === 'researcher' ||
      (value.role.type === 'observer' && nonEmptyString(value.role.portalId)));
  return locationValid && roleValid;
}

function validEvent(value: unknown): value is GameEvent {
  if (!record(value)) return false;
  return (
    nonEmptyString(value.id) &&
    string(value.occurredAt) &&
    member(value.kind, [
      'cycle',
      'portal',
      'expedition',
      'research',
      'stabilization',
      'observer',
    ]) &&
    member(value.outcome, ['success', 'rejected', 'info']) &&
    string(value.message)
  );
}

function validDomain(value: unknown, config: GameBalanceConfig): value is DomainState {
  if (!record(value)) return false;
  if (
    !validCycle(value.cycle) ||
    !Array.isArray(value.worlds) ||
    !value.worlds.every(validWorld) ||
    !Array.isArray(value.portals) ||
    !value.portals.every((portal) => validPortal(portal, config)) ||
    !Array.isArray(value.employees) ||
    !value.employees.every(validEmployee) ||
    !Array.isArray(value.events) ||
    !value.events.every(validEvent)
  ) {
    return false;
  }
  const worlds = value.worlds as World[];
  const portals = value.portals as Portal[];
  const employees = value.employees as Employee[];
  const events = value.events as GameEvent[];
  const worldIds = new Set(worlds.map((world) => world.id));
  const portalIds = new Set(portals.map((portal) => portal.id));
  return (
    uniqueIds(worlds) &&
    uniqueIds(portals) &&
    uniqueIds(employees) &&
    uniqueIds(events) &&
    portals.every((portal) => worldIds.has(portal.destinationWorldId)) &&
    portals.filter((portal) => portal.lifecycle !== 'closed').length <=
      config.maxUnclosedPortals &&
    employees.every((employee) =>
      employee.location === 'lab' || worldIds.has(employee.location.worldId),
    ) &&
    employees.every((employee) => {
      if (employee.role.type !== 'observer') return true;
      if (employee.location === 'lab') return false;
      const portalId = employee.role.portalId;
      const worldId = employee.location.worldId;
      return (
        portalIds.has(portalId) &&
        portals.some(
          (portal) =>
            portal.id === portalId &&
            portal.destinationWorldId === worldId &&
            portal.lifecycle === 'active' &&
            portal.riskStatus === 'dangerous',
        )
      );
    }) &&
    employees.filter((employee) => employee.role.type === 'observer').length <=
      config.maxActiveObservers &&
    (value.cycle.status !== 'finished' ||
      value.cycle.elapsedSeconds === value.cycle.durationSeconds)
  );
}

interface SavedCurrent {
  version: 1;
  domain: DomainState;
  selectedPortalId: string | null;
  portalFilter: PortalFilter;
  activeView: ActiveView;
  awaitingStart?: boolean;
}

interface SavedHistory {
  version: 1;
  results: GameResult[];
  historyClearedForCycleId: string | null;
}

function validCurrent(value: unknown, config: GameBalanceConfig): value is SavedCurrent {
  if (!record(value)) return false;
  return (
    value.version === STORAGE_VERSION &&
    validDomain(value.domain, config) &&
    (value.selectedPortalId === null || string(value.selectedPortalId)) &&
    member(value.portalFilter, ['all', 'stable', 'dangerous', 'critical', 'collapsed', 'closed']) &&
    member(value.activeView, ['portals', 'events', 'results', 'worklog']) &&
    (value.awaitingStart === undefined || typeof value.awaitingStart === 'boolean')
  );
}

function validHistory(value: unknown): value is SavedHistory {
  if (!record(value)) return false;
  return (
    value.version === STORAGE_VERSION &&
    Array.isArray(value.results) &&
    value.results.every(validGameResult) &&
    uniqueIds(value.results as GameResult[]) &&
    (value.historyClearedForCycleId === null ||
      string(value.historyClearedForCycleId))
  );
}

function parseSaved(
  storage: StorageAdapter | null,
  key: string,
): { value: unknown; present: boolean; warning: string | null } {
  if (!storage) return { value: null, present: false, warning: null };
  try {
    const raw = storage.getItem(key);
    return {
      value: raw === null ? null : JSON.parse(raw),
      present: raw !== null,
      warning: null,
    };
  } catch {
    return {
      value: null,
      present: true,
      warning: 'Не удалось прочитать сохранённые данные.',
    };
  }
}

export function loadAppState(
  storage: StorageAdapter | null,
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): AppState {
  const currentRead = parseSaved(storage, GAME_STORAGE_KEY);
  const historyRead = parseSaved(storage, HISTORY_STORAGE_KEY);
  const current = validCurrent(currentRead.value, config)
    ? currentRead.value
    : null;
  const history = validHistory(historyRead.value) ? historyRead.value : null;
  const domain = current?.domain ?? createInitialState(dependencies, config);
  const state = createAppState(domain);
  if (current) {
    state.selectedPortalId =
      current.selectedPortalId !== null &&
      domain.portals.some((portal) => portal.id === current.selectedPortalId)
        ? current.selectedPortalId
        : null;
    state.portalFilter = current.portalFilter;
    state.activeView = current.activeView;
    state.awaitingStart = current.awaitingStart ?? false;
  } else {
    state.awaitingStart = true;
  }
  if (history) {
    state.resultHistory = history.results;
    state.historyClearedForCycleId = history.historyClearedForCycleId;
  }
  const result = state.cycle.result;
  if (
    result &&
    state.historyClearedForCycleId !== result.id &&
    !state.resultHistory.some((saved) => saved.id === result.id)
  ) {
    state.resultHistory = [...state.resultHistory, result];
  }

  const invalidCurrent = currentRead.present && !current;
  const invalidHistory = historyRead.present && !history;
  if (currentRead.warning || historyRead.warning || invalidCurrent || invalidHistory) {
    state.storageWarning =
      'Часть локального сохранения повреждена или недоступна. Доступные данные восстановлены.';
  }
  return state;
}

export function saveAppState(
  storage: StorageAdapter | null,
  state: AppState,
): string | null {
  if (!storage) return 'Локальное хранилище недоступно; партия работает без сохранения.';
  const current: SavedCurrent = {
    version: STORAGE_VERSION,
    domain: {
      cycle: state.cycle,
      worlds: state.worlds,
      portals: state.portals,
      employees: state.employees,
      events: state.events,
    },
    selectedPortalId: state.selectedPortalId,
    portalFilter: state.portalFilter,
    activeView: state.activeView,
    awaitingStart: state.awaitingStart,
  };
  const history: SavedHistory = {
    version: STORAGE_VERSION,
    results: state.resultHistory,
    historyClearedForCycleId: state.historyClearedForCycleId,
  };
  try {
    storage.setItem(GAME_STORAGE_KEY, JSON.stringify(current));
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    return null;
  } catch {
    return 'Не удалось сохранить партию. Игра продолжается в памяти браузера.';
  }
}
