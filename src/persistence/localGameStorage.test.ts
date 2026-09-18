import { describe, expect, it } from 'vitest';

import { loadAppState, saveAppState, GAME_STORAGE_KEY, HISTORY_STORAGE_KEY, STORAGE_VERSION } from './localGameStorage';
import { createAppState, createPortalReducer } from '../state/portalReducer';
import { domainState, portal, testConfig, testDependencies } from '../test/domainFixtures';
import { finishGame } from '../domain/gameCycle';
import { createWorlds } from '../domain/gameFactory';
import { actionAvailability } from '../domain/actionAvailability';
import { unclosedPortalCount } from '../domain/selectors';

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

  it('сохраняет открытую вкладку миров после перезагрузки', () => {
    const storage = memoryStorage();
    const state = createAppState(domainState());
    state.activeView = 'worlds';
    expect(saveAppState(storage, state)).toBeNull();
    expect(loadAppState(storage, dependencies, config).activeView).toBe('worlds');
  });

  it('продолжает сохранённые партии с шестью и восемью мирами, но создаёт девять в новой', () => {
    for (const count of [6, 8]) {
      const storage = memoryStorage();
      const oldWorlds = createWorlds(dependencies, testConfig({ worldsCount: count }));
      const oldGame = createAppState(domainState({ worlds: oldWorlds }));
      saveAppState(storage, oldGame);
      const loaded = loadAppState(storage, dependencies, config);
      expect(loaded.storageWarning).toBeNull();
      expect(loaded.worlds).toHaveLength(count);
      const restarted = createPortalReducer(dependencies, config)(loaded, { type: 'newGame' });
      expect(restarted.worlds).toHaveLength(9);
    }
  });

  it('загружает старую партию с двадцатью незакрытыми каналами', () => {
    const storage = memoryStorage();
    const portals = Array.from({ length: 20 }, (_, index) => portal({ id: `portal-${index}` }));
    saveAppState(storage, createAppState(domainState({ portals })));
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.storageWarning).toBeNull();
    expect(loaded.portals).toHaveLength(20);
  });

  it('восстанавливает автоматически закрытые каналы старой незавершённой партии', () => {
    const storage = memoryStorage();
    const old = createAppState(domainState({ portals: [
      portal({ id: 'positive', energy: 3, lifecycle: 'closed', closedReason: 'critical-empty',
        riskStatus: 'critical', wasCritical: true }),
      portal({ id: 'empty', energy: 0, lifecycle: 'closed', closedReason: 'critical-empty',
        riskStatus: 'critical', wasCritical: true }),
      portal({ id: 'manual', lifecycle: 'closed', closedReason: 'manual' }),
    ] }));
    old.selectedPortalId = 'empty';
    old.portalFilter = 'closed';
    saveAppState(storage, old);
    const saved = JSON.parse(storage.getItem(GAME_STORAGE_KEY)!);
    saved.version = 1;
    storage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved));

    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.storageWarning).toBeNull();
    expect(loaded.portals.map((item) => [item.lifecycle, item.closedReason])).toEqual([
      ['active', null], ['collapsed', null], ['closed', 'manual'],
    ]);
    expect(unclosedPortalCount(loaded.portals)).toBe(2);
    expect(loaded.portalFilter).toBe('all');
    expect(loaded.selectedPortalId).toBe('empty');
    expect(actionAvailability(loaded, loaded.portals[0]!, 1, config).close).toBeNull();
    expect(actionAvailability(loaded, loaded.portals[1]!, 1, config).close).toBeNull();
    saveAppState(storage, loaded);
    expect(JSON.parse(storage.getItem(GAME_STORAGE_KEY)!).version).toBe(STORAGE_VERSION);
    expect(loadAppState(storage, dependencies, config).portals).toEqual(loaded.portals);
  });

  it('не меняет автоматически закрытые каналы и итог завершённой партии', () => {
    const storage = memoryStorage();
    const finished = finishGame(domainState({ portals: [portal({ energy: 3,
      lifecycle: 'closed', closedReason: 'critical-empty' })] }), dependencies);
    saveAppState(storage, createAppState(finished));
    const saved = JSON.parse(storage.getItem(GAME_STORAGE_KEY)!);
    saved.version = 1;
    storage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved));
    const loaded = loadAppState(storage, dependencies, config);
    expect(loaded.portals[0]?.closedReason).toBe('critical-empty');
    expect(loaded.cycle.result).toEqual(finished.cycle.result);
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
