import type {
  DomainDependencies,
  DomainState,
  EventKind,
  GameEvent,
} from './types';

export function appendEvent(
  state: DomainState,
  dependencies: DomainDependencies,
  kind: EventKind,
  outcome: GameEvent['outcome'],
  message: string,
): DomainState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        id: dependencies.createId('event'),
        occurredAt: dependencies.now(),
        kind,
        outcome,
        message,
      },
    ],
  };
}
