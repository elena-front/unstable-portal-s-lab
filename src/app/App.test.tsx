import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GAME_STORAGE_KEY, saveAppState } from '../persistence/localGameStorage';
import { PortalProvider } from '../state/PortalContext';
import { createAppState } from '../state/portalReducer';
import { domainState, employee, portal, testDependencies, world } from '../test/domainFixtures';
import { App } from './App';

function renderGame() {
  render(<PortalProvider dependencies={testDependencies()} storage={localStorage}><App /></PortalProvider>);
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('App', () => {
  it('показывает сводку, миры и навигацию', () => {
    renderGame();
    expect(screen.getByRole('heading', { name: 'Лаборатория нестабильных порталов' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Сводка порталов' })).toHaveTextContent('Открытые');
    expect(screen.getByRole('heading', { name: 'Миры' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI Worklog' }));
    expect(screen.getByRole('heading', { name: 'AI Worklog' })).toBeInTheDocument();
  });

  it('отправляет группу и возвращает её через выбранный портал', () => {
    const initial = createAppState(domainState());
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.change(screen.getByLabelText('Размер группы'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить сотрудников' }));
    expect(screen.getByText('В лаборатории: 0 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуть всех (2)' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть всех (2)' }));
    expect(screen.getByText('В лаборатории: 2 из 2')).toBeInTheDocument();
  });

  it('требует подтверждение аварийного возвращения', () => {
    const initial = createAppState(domainState({
      portals: [portal({ riskStatus: 'critical', energy: 40, wasCritical: true })],
      employees: [employee('employee-1', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    expect(within(detail).getByRole('button', { name: 'Отправить сотрудников' })).toBeDisabled();
    fireEvent.click(within(detail).getByRole('button', { name: /Вернуть всех/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('В лаборатории: 0 из 1')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    fireEvent.click(within(detail).getByRole('button', { name: /Вернуть всех/ }));
    expect(screen.getByText('В лаборатории: 1 из 1')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Закрыть схлопнувшийся портал' })).toHaveFocus();
  });

  it('показывает изменение риска после обновления времени и коэффициентов', () => {
    const initial = createAppState(domainState({
      cycle: { ...domainState().cycle, nextPortalInSeconds: 500 },
      portals: [portal({ energy: 60, initialLifetimeSeconds: 1000 })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    expect(screen.getByText('40% · Стабильный')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Сценарии для проверки'));
    fireEvent.click(screen.getByRole('button', { name: 'Промотать 60 секунд' }));
    expect(screen.getByText('0% · Стабильный')).toBeInTheDocument();
  });

  it('загружает критичный сценарий для проверяющего', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGame();
    fireEvent.click(screen.getByText('Сценарии для проверки'));
    fireEvent.change(screen.getByLabelText('Состояние'), { target: { value: 'critical' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить сценарий' }));
    const row = within(screen.getByRole('region', { name: 'Список порталов' })).getAllByRole('button')[0]!;
    fireEvent.click(row);
    expect(screen.getByRole('alert')).toHaveTextContent('Критический риск');
    expect(screen.getByText('Отправка в критичный портал запрещена.')).toBeInTheDocument();
  });

  it('показывает повреждение сохранения и предлагает демоданные', () => {
    localStorage.setItem(GAME_STORAGE_KEY, '{сломано');
    renderGame();
    expect(screen.getByRole('alert')).toHaveTextContent('сохранения повреждена');
    expect(screen.getByRole('button', { name: 'Загрузить демоданные' })).toBeInTheDocument();
  });

  it('после закрытия портала возвращает фокус в список', () => {
    const initial = createAppState(domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    const row = screen.getByRole('button', { name: /Канал 1/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(row).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Детали портала' })).toHaveTextContent('Портал закрыт');
  });
});
