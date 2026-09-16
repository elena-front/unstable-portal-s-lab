import type { GameBalanceConfig } from '../config/gameBalance';
import {
  closePortal,
  createDemoScenario,
  createInitialState,
  returnEmployees,
  sendObserver,
  sendResearchers,
  stabilizePortal,
  tickGame,
} from '../domain';
import type {
  DomainDependencies,
  DomainResult,
  DomainState,
  GameResult,
} from '../domain/types';

export type PortalFilter = 'all' | 'stable' | 'dangerous' | 'critical' | 'collapsed';
export type ActiveView = 'portals' | 'worklog';

export interface Notification {
  kind: 'info' | 'success' | 'error';
  message: string;
}

export interface AppState extends DomainState {
  resultHistory: GameResult[];
  historyClearedForCycleId: string | null;
  selectedPortalId: string | null;
  portalFilter: PortalFilter;
  activeView: ActiveView;
  notification: Notification | null;
  storageWarning: string | null;
}

export type PortalAction =
  | { type: 'tick'; deltaSeconds: number }
  | { type: 'selectPortal'; portalId: string | null }
  | { type: 'setFilter'; filter: PortalFilter }
  | { type: 'setView'; view: ActiveView }
  | { type: 'dismissNotification' }
  | { type: 'storageFailure'; message: string }
  | { type: 'sendResearchers'; portalId: string; employeeIds: string[] }
  | {
      type: 'returnEmployees';
      portalId: string;
      employeeIds: string[];
      emergencyConfirmed: boolean;
    }
  | { type: 'sendObserver'; portalId: string; employeeId: string }
  | { type: 'stabilizePortal'; portalId: string }
  | { type: 'closePortal'; portalId: string; confirmed: boolean }
  | { type: 'newGame' }
  | { type: 'restoreDemo' }
  | { type: 'clearHistory'; confirmed: boolean };

export function createAppState(domain: DomainState): AppState {
  return {
    ...domain,
    resultHistory: [],
    historyClearedForCycleId: null,
    selectedPortalId: null,
    portalFilter: 'all',
    activeView: 'portals',
    notification: null,
    storageWarning: null,
  };
}

function appendResultOnce(history: GameResult[], result: GameResult): GameResult[] {
  return history.some((saved) => saved.id === result.id)
    ? history
    : [...history, result];
}

function domainResultToState(state: AppState, result: DomainResult): AppState {
  const lastEvent = result.value.events.at(-1);
  return {
    ...state,
    ...result.value,
    notification: {
      kind: result.ok ? 'success' : 'error',
      message: lastEvent?.message ?? (result.ok ? 'Действие выполнено.' : result.reason),
    },
  };
}

function resetOperationalState(
  state: AppState,
  domain: DomainState,
): AppState {
  return {
    ...state,
    ...domain,
    selectedPortalId: null,
    portalFilter: 'all',
    activeView: 'portals',
    notification: null,
    storageWarning: null,
  };
}

export function createPortalReducer(
  dependencies: DomainDependencies,
  config: GameBalanceConfig,
): (state: AppState, action: PortalAction) => AppState {
  return (state, action) => {
    switch (action.type) {
      case 'tick': {
        const next = tickGame(state, action.deltaSeconds, dependencies, config);
        if (next === state) return state;
        const result = next.cycle.result;
        return {
          ...state,
          ...next,
          resultHistory: result
            ? appendResultOnce(state.resultHistory, result)
            : state.resultHistory,
        };
      }
      case 'selectPortal':
        return {
          ...state,
          selectedPortalId:
            action.portalId === null ||
            state.portals.some((portal) => portal.id === action.portalId)
              ? action.portalId
              : state.selectedPortalId,
        };
      case 'setFilter':
        return { ...state, portalFilter: action.filter };
      case 'setView':
        return { ...state, activeView: action.view };
      case 'dismissNotification':
        return { ...state, notification: null };
      case 'storageFailure':
        return { ...state, storageWarning: action.message };
      case 'sendResearchers':
        return domainResultToState(
          state,
          sendResearchers(
            state,
            action.portalId,
            action.employeeIds,
            dependencies,
            config,
          ),
        );
      case 'returnEmployees':
        return domainResultToState(
          state,
          returnEmployees(
            state,
            action.portalId,
            action.employeeIds,
            action.emergencyConfirmed,
            dependencies,
            config,
          ),
        );
      case 'sendObserver':
        return domainResultToState(
          state,
          sendObserver(state, action.portalId, action.employeeId, dependencies, config),
        );
      case 'stabilizePortal':
        return domainResultToState(
          state,
          stabilizePortal(state, action.portalId, dependencies, config),
        );
      case 'closePortal':
        return domainResultToState(
          state,
          closePortal(state, action.portalId, action.confirmed, dependencies, config),
        );
      case 'newGame':
        return resetOperationalState(state, createInitialState(dependencies, config));
      case 'restoreDemo': {
        const demo = createDemoScenario(config);
        return resetOperationalState(state, {
          ...demo,
          cycle: {
            ...demo.cycle,
            id: dependencies.createId('game'),
            startedAt: dependencies.now(),
          },
        });
      }
      case 'clearHistory':
        if (!action.confirmed) {
          return {
            ...state,
            notification: { kind: 'error', message: 'Подтвердите очистку истории результатов.' },
          };
        }
        return {
          ...state,
          resultHistory: [],
          historyClearedForCycleId:
            state.cycle.status === 'finished' ? state.cycle.id : null,
          notification: { kind: 'info', message: 'История результатов очищена.' },
        };
    }
  };
}
