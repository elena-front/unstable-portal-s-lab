import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';

import { gameBalance, type GameBalanceConfig } from '../config/gameBalance';
import type { DomainDependencies } from '../domain/types';
import {
  loadAppState,
  saveAppState,
  type StorageAdapter,
} from '../persistence/localGameStorage';
import {
  createPortalReducer,
  type AppState,
  type PortalAction,
} from './portalReducer';

let generatedId = 0;

const browserDependencies: DomainDependencies = {
  random: () => Math.random(),
  createId: (kind) => `${kind}-${Date.now()}-${++generatedId}`,
  now: () => new Date().toISOString(),
};

function browserStorage(): StorageAdapter | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

interface PortalContextValue {
  state: AppState;
  dispatch: Dispatch<PortalAction>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

interface PortalProviderProps {
  children: ReactNode;
  config?: GameBalanceConfig;
  dependencies?: DomainDependencies;
  storage?: StorageAdapter | null;
}

export function PortalProvider({
  children,
  config = gameBalance,
  dependencies = browserDependencies,
  storage,
}: PortalProviderProps) {
  const resolvedStorage = useMemo(
    () => (storage === undefined ? browserStorage() : storage),
    [storage],
  );
  const reducer = useMemo(
    () => createPortalReducer(dependencies, config),
    [dependencies, config],
  );
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => loadAppState(resolvedStorage, dependencies, config),
  );

  useEffect(() => {
    const error = saveAppState(resolvedStorage, state);
    if (error && state.storageWarning !== error) {
      dispatch({ type: 'storageFailure', message: error });
    }
  }, [resolvedStorage, state]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const updateVisibility = () => {
      stop();
      if (document.hidden) return;
      timer = setInterval(() => {
        if (!document.hidden && !state.awaitingStart) {
          dispatch({ type: 'tick', deltaSeconds: config.energyTickSeconds });
        }
      }, config.energyTickSeconds * 1000);
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, [config.energyTickSeconds, state.awaitingStart]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortals(): PortalContextValue {
  const context = useContext(PortalContext);
  if (!context) throw new Error('usePortals должен использоваться внутри PortalProvider.');
  return context;
}
