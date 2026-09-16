import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PortalProvider, usePortals } from './PortalContext';
import { testConfig, testDependencies } from '../test/domainFixtures';

function Probe() {
  const { state, dispatch } = usePortals();
  return (
    <div>
      <output aria-label="Время">{state.cycle.elapsedSeconds}</output>
      <output aria-label="Миры">{state.worlds.length}</output>
      <button onClick={() => dispatch({ type: 'setFilter', filter: 'critical' })}>
        Фильтр
      </button>
      <output aria-label="Фильтр">{state.portalFilter}</output>
    </div>
  );
}

describe('PortalProvider', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('ставит симуляцию на паузу в скрытой вкладке без догоняющего времени', () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const config = testConfig({
      firstPortalDelayRange: [100, 100],
      cycleDurationSeconds: 30,
    });
    render(
      <PortalProvider config={config} dependencies={testDependencies()} storage={null}>
        <Probe />
      </PortalProvider>,
    );
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByLabelText('Время')).toHaveTextContent('2');

    hidden = true;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByLabelText('Время')).toHaveTextContent('2');

    hidden = false;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByLabelText('Время')).toHaveTextContent('3');
  });

  it('сохраняет выбор в LocalStorage и восстанавливает его после повторного монтажа', () => {
    vi.useFakeTimers();
    const dependencies = testDependencies();
    const first = render(
      <PortalProvider dependencies={dependencies} storage={localStorage}>
        <Probe />
      </PortalProvider>,
    );
    act(() => { screen.getByRole('button', { name: 'Фильтр' }).click(); });
    expect(screen.getByLabelText('Фильтр')).toHaveTextContent('critical');
    first.unmount();

    render(
      <PortalProvider dependencies={dependencies} storage={localStorage}>
        <Probe />
      </PortalProvider>,
    );
    expect(screen.getByLabelText('Фильтр')).toHaveTextContent('critical');
  });
});
