import { describe, expect, it } from 'vitest';

import { loadAppState, saveAppState, GAME_STORAGE_KEY, HISTORY_STORAGE_KEY } from './localGameStorage';
import { createAppState } from '../state/portalReducer';
import { domainState, testConfig, testDependencies } from '../test/domainFixtures';
import { finishGame } from '../domain/gameCycle';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

describe('версионированное локальное сохранение', () => {
  const config = testConfig();
  const dependencies = testDependencies();

  it('восстанавливает текущую партию и фильтры после перезагрузки', () => {
    const storage = memoryStorage();
    const state = createAppState(domainState());
    state.selectedPortalId = 'portal-1';
    state.portalFilter = 'dangerous';
    expect(saveAppState(storage, state)).toBeNull();
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.cycle.id).toBe(state.cycle.id);
    expect(loaded.selectedPortalId).toBe('portal-1');
    expect(loaded.portalFilter).toBe('dangerous');
    expect(loaded.storageWarning).toBeNull();
  });

  it('восстанавливает историю независимо от повреждённой партии', () => {
    const storage = memoryStorage();
    const finished = finishGame(domainState(), dependencies);
    const state = createAppState(finished);
    state.resultHistory = [finished.cycle.result!];
    saveAppState(storage, state);
    storage.entries.set(GAME_STORAGE_KEY, '{broken');
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.cycle.status).toBe('running');
    expect(loaded.resultHistory).toHaveLength(1);
    expect(loaded.storageWarning).not.toBeNull();
  });

  it('восстанавливает завершённый результат после повреждения истории без дубля', () => {
    const storage = memoryStorage();
    const finished = finishGame(domainState(), dependencies);
    saveAppState(storage, createAppState(finished));
    storage.entries.set(HISTORY_STORAGE_KEY, '{broken');
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.cycle.status).toBe('finished');
    expect(loaded.resultHistory).toHaveLength(1);
    saveAppState(storage, loaded);
    expect(loadAppState(storage, dependencies, config).resultHistory).toHaveLength(1);
  });

  it('не возвращает намеренно очищенный итог после перезагрузки', () => {
    const storage = memoryStorage();
    const finished = finishGame(domainState(), dependencies);
    const state = createAppState(finished);
    state.historyClearedForCycleId = finished.cycle.id;
    saveAppState(storage, state);
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.cycle.status).toBe('finished');
    expect(loaded.resultHistory).toHaveLength(0);
  });

  it('отвергает неверную версию и испорченную связь сотрудника с миром', () => {
    const storage = memoryStorage();
    saveAppState(storage, createAppState(domainState()));
    const current = JSON.parse(storage.getItem(GAME_STORAGE_KEY)!);
    current.domain.employees[0].location = { worldId: 'missing' };
    storage.entries.set(GAME_STORAGE_KEY, JSON.stringify(current));
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.storageWarning).not.toBeNull();
    expect(loaded.cycle.id).not.toBe('game-1');

    storage.entries.set(HISTORY_STORAGE_KEY, JSON.stringify({ version: 99, results: [] }));
    expect(loadAppState(storage, dependencies, config).storageWarning).not.toBeNull();
  });

  it('считает JSON null повреждённым сохранением, а не отсутствием данных', () => {
    const storage = memoryStorage();
    storage.entries.set(GAME_STORAGE_KEY, 'null');
    expect(loadAppState(storage, dependencies, config).storageWarning).not.toBeNull();
  });

  it('переживает недоступное хранилище без потери состояния в памяти', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.cycle.status).toBe('running');
    expect(loaded.storageWarning).not.toBeNull();
    expect(saveAppState(storage, loaded)).not.toBeNull();
  });
});
