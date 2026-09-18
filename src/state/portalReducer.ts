import type { GameBalanceConfig } from '../config/gameBalance';
import {
  closePortal,
  createDemoScenario,
  createReviewScenario,
  createInitialState,
  returnEmployees,
  sendObserver,
  sendResearchers,
  spawnPortal,
  stabilizePortal,
  tickGame,
} from '../domain';
import type {
  DomainDependencies,
  DomainResult,
  DomainState,
  GameResult,
  Portal,
} from '../domain/types';
import type { ReviewScenario } from '../domain/demoScenario';

export type PortalFilter = 'all' | 'stable' | 'dangerous' | 'critical' | 'collapsed' | 'closed';
export type ActiveView = 'portals' | 'worlds' | 'events' | 'results' | 'worklog';

export function portalMatchesFilter(portal: Portal, filter: PortalFilter): boolean {
  if (filter === 'all') return portal.lifecycle !== 'closed';
  if (filter === 'closed' || filter === 'collapsed') return portal.lifecycle === filter;
  return portal.lifecycle === 'active' && portal.riskStatus === filter;
}

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
  awaitingStart: boolean;
}

export type PortalAction =
  | { type: 'tick'; deltaSeconds: number }
  | { type: 'selectPortal'; portalId: string | null }
  | { type: 'setFilter'; filter: PortalFilter }
  | { type: 'setView'; view: ActiveView }
  | { type: 'dismissNotification'; notification: Notification }
  | { type: 'storageFailure'; message: string }
  | { type: 'sendResearchers'; portalId: string; employeeIds: string[] }
  | {
      type: 'returnEmployees';
      portalId: string;
      employeeIds: string[];
    }
  | { type: 'sendObserver'; portalId: string; employeeId: string }
  | { type: 'stabilizePortal'; portalId: string }
  | { type: 'closePortal'; portalId: string; confirmed: boolean }
  | { type: 'newGame' }
  | { type: 'startGame'; scenario: ReviewScenario }
  | { type: 'restoreDemo'; scenario?: ReviewScenario }
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
    awaitingStart: false,
  };
}

function appendResultOnce(history: GameResult[], result: GameResult): GameResult[] {
  return history.some((saved) => saved.id === result.id)
    ? history
    : [...history, result];
}

function selectionAfterPortalChange(state: AppState, portals: Portal[]): Pick<AppState, 'selectedPortalId' | 'portalFilter'> {
  const previous = new Map(state.portals.map((portal) => [portal.id, portal.lifecycle]));
  const newCollapse = portals.some((portal) =>
    portal.lifecycle === 'collapsed' && previous.get(portal.id) === 'active');
  const riskFilter = state.portalFilter === 'stable' ||
    state.portalFilter === 'dangerous' || state.portalFilter === 'critical';
  const portalFilter = newCollapse && riskFilter ? 'all' : state.portalFilter;
  const selected = portals.find((portal) => portal.id === state.selectedPortalId);
  return {
    selectedPortalId: selected && portalMatchesFilter(selected, portalFilter) ? selected.id : null,
    portalFilter,
  };
}

function domainResultToState(state: AppState, result: DomainResult): AppState {
  const lastEvent = result.value.events.at(-1);
  return {
    ...state,
    ...result.value,
    ...selectionAfterPortalChange(state, result.value.portals),
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
    awaitingStart: false,
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
          ...selectionAfterPortalChange(state, next.portals),
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
        return {
          ...state,
          portalFilter: action.filter,
          selectedPortalId: state.portals.some((portal) =>
            portal.id === state.selectedPortalId && portalMatchesFilter(portal, action.filter)
          ) ? state.selectedPortalId : null,
        };
      case 'setView':
        return { ...state, activeView: action.view };
      case 'dismissNotification':
        return state.notification === action.notification ? { ...state, notification: null } : state;
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
      case 'closePortal': {
        const result = closePortal(state, action.portalId, action.confirmed, dependencies, config);
        return domainResultToState(state, result);
      }
      case 'newGame':
        return { ...resetOperationalState(state, createInitialState(dependencies, config)), awaitingStart: true };
      case 'startGame': {
        if (!state.awaitingStart) return state;
        if (action.scenario === 'normal') {
          const started = {
            ...state,
            awaitingStart: false,
            cycle: { ...state.cycle, startedAt: dependencies.now() },
          };
          return started.portals.length === 0
            ? { ...started, ...spawnPortal(started, dependencies, config) }
            : started;
        }
        const demo = createReviewScenario(action.scenario, config);
        const cycleId = state.cycle.id;
        const startedAt = dependencies.now();
        const started = resetOperationalState(state, {
          ...demo,
          cycle: {
            ...demo.cycle,
            id: cycleId,
            startedAt,
            result: demo.cycle.result
              ? { ...demo.cycle.result, id: cycleId, startedAt, finishedAt: startedAt }
              : null,
          },
        });
        return {
          ...started,
          resultHistory: started.cycle.result
            ? appendResultOnce(started.resultHistory, started.cycle.result)
            : started.resultHistory,
        };
      }
      case 'restoreDemo': {
        const demo = action.scenario
          ? createReviewScenario(action.scenario, config)
          : createDemoScenario(config);
        const cycleId = dependencies.createId('game');
        const startedAt = dependencies.now();
        const operational = resetOperationalState(state, {
          ...demo,
          cycle: {
            ...demo.cycle,
            id: cycleId,
            startedAt,
            result: demo.cycle.result
              ? { ...demo.cycle.result, id: cycleId, startedAt, finishedAt: dependencies.now() }
              : null,
          },
        });
        return operational.cycle.result
          ? { ...operational, resultHistory: appendResultOnce(operational.resultHistory, operational.cycle.result) }
          : operational;
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
