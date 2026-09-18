import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GAME_STORAGE_KEY, saveAppState } from '../persistence/localGameStorage';
import { tickGame } from '../domain/gameCycle';
import { PortalProvider } from '../state/PortalContext';
import { createAppState } from '../state/portalReducer';
import { domainState, employee, portal, testConfig, testDependencies, world } from '../test/domainFixtures';
import { App } from './App';

function renderGame(start = true) {
  render(<PortalProvider dependencies={testDependencies()} storage={localStorage}><App /></PortalProvider>);
  if (start && screen.queryByRole('button', { name: 'Начать партию' })) {
    fireEvent.click(screen.getByRole('button', { name: 'Начать партию' }));
  }
}

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('App', () => {
  it('показывает результат действия тостом и скрывает его по таймеру или кнопке', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(saveAppState(localStorage, createAppState(domainState({ portals: [portal({ energy: 3 })] })))).toBeNull();
    renderGame();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(screen.getByRole('status')).toHaveTextContent('Портал');
    expect(screen.getByRole('status').parentElement?.className).toContain('toastRegion');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('позволяет закрыть тост вручную', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(saveAppState(localStorage, createAppState(domainState({ portals: [portal({ energy: 3 })] })))).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('раскрывает дополнительные характеристики выбранного канала', () => {
    expect(saveAppState(localStorage, createAppState(domainState()))).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    const details = within(detail).getByText('Показать все характеристики портала').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details?.previousElementSibling).toHaveTextContent('Риск — доля истёкшего расчётного времени жизни.');
    expect(within(detail).getByText(/Мир «Аэрис» · Не исследован/)).toBeInTheDocument();
    fireEvent.click(within(detail).getByText('Показать все характеристики портала'));
    expect(details).toHaveAttribute('open');
    expect(within(detail).getByRole('heading', { name: 'Экспедиция' })).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: 'Управление порталом' })).toBeInTheDocument();
  });
  it('показывает легенду и выбор сценария только перед началом партии', () => {
    renderGame(false);
    expect(screen.getByRole('heading', { name: 'Правила и решения оператора' })).toBeInTheDocument();
    expect(screen.getByLabelText('Режим запуска')).toHaveValue('normal');
    expect(screen.getByText(/готовые ситуации для проверки отдельных правил/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Начать партию' }));
    expect(screen.queryByLabelText('Режим запуска')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Список порталов' }).querySelector('button')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Новая партия' }));
    expect(screen.getByLabelText('Режим запуска')).toHaveValue('normal');
  });

  it('переключает миры и порталы и держит статус рядом с навигацией', () => {
    renderGame();
    expect(screen.getByRole('heading', { name: 'Лаборатория нестабильных порталов' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Сводка порталов' })).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    const status = screen.getByLabelText('Состояние партии');
    expect(status.parentElement).toContainElement(navigation);
    expect(status).toHaveTextContent('Партия идёт');
    expect(status).toHaveTextContent('10:00');
    expect(status).toHaveTextContent('В лаборатории: 12 из 12');
    expect(screen.queryByRole('heading', { name: 'Исследуйте миры и верните команду' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Миры' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Миры' }));
    expect(screen.getByRole('heading', { name: 'Миры' })).toBeInTheDocument();
    expect(screen.getByLabelText('Состояние партии')).toHaveTextContent('10:00');
    expect(screen.getByText('0 / 9 исследовано')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(9);
    expect(screen.queryByRole('region', { name: 'Список порталов' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Порталы' }));
    expect(screen.getByRole('region', { name: 'Список порталов' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AI Worklog' }));
    expect(screen.getByRole('heading', { name: 'AI Worklog' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Этапы работы и ключевые запросы' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Решения человека' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Исправления' })).toBeInTheDocument();
    expect(screen.getByText(/AI ошибочно сделал критичный статус безусловным запретом возврата/)).toBeInTheDocument();
    expect(screen.getByText(/прошли автоматические тесты/)).toBeInTheDocument();
    expect(screen.getByText(/статистика токенов недоступна/)).toBeInTheDocument();
  });

  it('показывает прогресс мира и сотрудников в строке портала', () => {
    const initial = createAppState(domainState({
      worlds: [world({ name: 'Таласса', researchProgress: 10 })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    expect(within(screen.getByRole('region', { name: 'Список порталов' }))
      .getByRole('button', { name: /Канал 1/ })).toHaveTextContent('Таласса (исследован на 10%, 1 сотр.)');
  });

  it('отправляет группу и возвращает её через выбранный портал', () => {
    const initial = createAppState(domainState());
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.change(screen.getByLabelText('Размер группы'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить сотрудников' }));
    expect(screen.getByText('В лаборатории: 0 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуть сотрудников (2)' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть сотрудников (2)' }));
    expect(screen.getByText('В лаборатории: 2 из 2')).toBeInTheDocument();
  });

  it('позволяет оператору закрыть пустой канал без энергии для экспедиции', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const initial = createAppState(domainState({ portals: [portal({ energy: 3 })] }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    expect(within(detail).getByRole('button', { name: 'Отправить сотрудников' })).toBeDisabled();
    const close = within(detail).getByRole('button', { name: 'Закрыть портал' });
    expect(close).toBeEnabled();
    fireEvent.click(close);
    fireEvent.click(screen.getByRole('button', { name: 'Закрытые' }));
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    expect(within(detail).getByText('Портал закрыт. Действия недоступны.')).toBeInTheDocument();
  });

  it('предупреждает перед закрытием последнего маршрута и сохраняет его при отказе', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(saveAppState(localStorage, createAppState(domainState()))).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('последний работающий портал'));
    expect(screen.getByRole('button', { name: /Канал 1/ })).toHaveTextContent('Стабильный');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(screen.getByRole('status')).toHaveTextContent('Портал закрыт');
  });

  it('предупреждает о менее рисковом маршруте перед стабилизацией', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const risky = portal({ energy: 40, initialLifetimeSeconds: 2000, riskStatus: 'critical' });
    const safer = portal({ id: 'safer', name: 'Запасной', initialLifetimeSeconds: 1000 });
    expect(saveAppState(localStorage, createAppState(domainState({ portals: [risky, safer] })))).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const stabilize = screen.getByRole('button', { name: 'Стабилизировать' });
    expect(stabilize).toBeEnabled();
    fireEvent.click(stabilize);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('«Запасной»'));
    expect(screen.getByText(/Осталось попыток: 3/)).toBeInTheDocument();
    confirm.mockReturnValue(true);
    fireEvent.click(stabilize);
    expect(screen.getByText(/Осталось попыток: 2/)).toBeInTheDocument();
  });

  it('после загрузки старой партии возвращает автоматически закрытый канал в список', () => {
    const old = createAppState(domainState({ portals: [portal({ energy: 3,
      lifecycle: 'closed', closedReason: 'critical-empty', riskStatus: 'critical', wasCritical: true })] }));
    expect(saveAppState(localStorage, old)).toBeNull();
    const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY)!);
    saved.version = 1;
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(saved));
    renderGame();
    const row = within(screen.getByRole('region', { name: 'Список порталов' }))
      .getByRole('button', { name: /Канал 1/ });
    expect(row).toBeInTheDocument();
    fireEvent.click(row);
    const close = within(screen.getByRole('region', { name: 'Детали портала' }))
      .getByRole('button', { name: 'Закрыть портал' });
    expect(close).toBeEnabled();
  });

  it('после аварийного возврата оставляет выбранный схлопнувшийся канал видимым', () => {
    const initial = createAppState(domainState({
      portals: [portal({ energy: 7, riskStatus: 'critical', wasCritical: true })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Критичные' }));
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть сотрудников (1)' }));
    expect(screen.getByRole('button', { name: 'Все активные' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'Список порталов' }))
      .getByRole('button', { name: /Канал 1/ })).toHaveTextContent('Схлопнулся');
    expect(within(screen.getByRole('region', { name: 'Детали портала' }))
      .getByRole('button', { name: 'Закрыть схлопнувшийся портал' })).toBeEnabled();
  });

  it('при нехватке энергии критичного портала предлагает безопасный маршрут', () => {
    const initial = createAppState(domainState({
      portals: [portal({ riskStatus: 'critical', energy: 3, wasCritical: true }),
        portal({ id: 'safe', name: 'Безопасный маршрут', dissipationCoefficient: 0, stability: 1,
          initialLifetimeSeconds: null })],
      employees: [employee('employee-1', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Критичные' }));
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    expect(within(detail).getByRole('button', { name: 'Отправить сотрудников' })).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Вернуть сотрудников (0)' })).toBeDisabled();
    expect(within(detail).getByText('Энергии недостаточно даже для одного сотрудника.')).toBeInTheDocument();
    expect(screen.getByText('В лаборатории: 0 из 1')).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Выбрать маршрут: Безопасный маршрут' }));
    expect(screen.getByRole('button', { name: 'Все активные' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(detail).getByRole('button', { name: 'Вернуть сотрудников (1)' }));
    expect(screen.getByText('В лаборатории: 1 из 1')).toBeInTheDocument();
  });

  it('возвращает сотрудника через критичный портал при достаточной энергии', () => {
    const initial = createAppState(domainState({
      portals: [portal({ riskStatus: 'critical', energy: 40, wasCritical: true })],
      employees: [employee('field', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    expect(within(detail).getByRole('button', { name: 'Вернуть сотрудников (1)' })).toBeEnabled();
    fireEvent.click(within(detail).getByRole('button', { name: 'Вернуть сотрудников (1)' }));
    expect(screen.getByText('В лаборатории: 1 из 1')).toBeInTheDocument();
  });

  it('предлагает частичный возврат, если энергии на всех недостаточно', () => {
    const initial = createAppState(domainState({
      portals: [portal({ energy: 10, initialLifetimeSeconds: 100 })],
      employees: [employee('first', { location: { worldId: 'world-1' } }),
        employee('second', { location: { worldId: 'world-1' } })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    const detail = screen.getByRole('region', { name: 'Детали портала' });
    expect(within(detail).getByText(/Энергии хватит на 1 из 2/)).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Вернуть сотрудников (1)' }));
    expect(screen.getByText('В лаборатории: 1 из 2')).toBeInTheDocument();
  });

  it('показывает изменение риска после обновления времени и коэффициентов', () => {
    vi.useFakeTimers();
    const initial = createAppState(domainState({
      cycle: { ...domainState().cycle, nextPortalInSeconds: 500 },
      portals: [portal({ energy: 60, initialLifetimeSeconds: 1000 })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: /Канал 1/ }));
    expect(screen.getByText('Риск').closest('div')).toHaveTextContent('40%');
    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByText('Риск').closest('div')).toHaveTextContent('0%');
    vi.useRealTimers();
  });

  it('загружает критичный сценарий для проверяющего', () => {
    renderGame(false);
    fireEvent.change(screen.getByLabelText('Режим запуска'), { target: { value: 'critical' } });
    fireEvent.click(screen.getByRole('button', { name: 'Начать партию' }));
    const row = within(screen.getByRole('region', { name: 'Список порталов' })).getAllByRole('button')[0]!;
    fireEvent.click(row);
    expect(screen.getByRole('alert')).toHaveTextContent('Критический риск');
    expect(screen.getByText('Отправка в критичный портал запрещена.')).toBeInTheDocument();
  });

  it('показывает повреждение сохранения и предлагает начать новую партию', () => {
    localStorage.setItem(GAME_STORAGE_KEY, '{сломано');
    renderGame();
    expect(screen.getByRole('alert')).toHaveTextContent('сохранения повреждена');
    expect(screen.getByRole('button', { name: 'Новая партия' })).toBeInTheDocument();
  });

  it('после закрытия портала сохраняет фильтр и возвращает фокус к нему', () => {
    const initial = createAppState(domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: 'Стабильные' }));
    const row = screen.getByRole('button', { name: /Канал 1/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть портал' }));
    expect(screen.getByRole('button', { name: 'Стабильные' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Стабильные' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'Список порталов' })).queryByRole('button', { name: /Канал 1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрытые' }));
    expect(within(screen.getByRole('region', { name: 'Список порталов' })).getByRole('button', { name: /Канал 1/ })).toBeInTheDocument();
  });

  it('разделяет активные и закрытые порталы и предупреждает об исследованном мире', () => {
    const initial = createAppState(domainState({
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      portals: [portal(), portal({ id: 'collapsed', name: 'Схлопнувшийся канал', lifecycle: 'collapsed', energy: 0, riskStatus: 'critical' }), portal({ id: 'closed', name: 'Старый канал', lifecycle: 'closed', closedReason: 'manual' })],
    }));
    expect(saveAppState(localStorage, initial)).toBeNull();
    renderGame();
    const list = screen.getByRole('region', { name: 'Список порталов' });
    expect(within(list).getByRole('button', { name: /Канал 1/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Схлопнувшийся канал/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Старый канал/ })).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /Канал 1/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Мир уже исследован. Новая экспедиция не нужна.');
    fireEvent.click(screen.getByRole('button', { name: 'Закрытые' }));
    expect(within(list).getByRole('button', { name: /Старый канал/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /Канал 1/ })).not.toBeInTheDocument();
  });

  it('показывает итоговое окно и отдельные вкладки журнала и результатов', () => {
    const prepared = domainState({
      cycle: { ...domainState().cycle, elapsedSeconds: 599 },
      worlds: [world({ researchStatus: 'explored', researchProgress: 100 })],
      employees: [employee('safe'), employee('lost', { location: { worldId: 'world-1' } })],
    });
    const finished = tickGame(prepared, 1, testDependencies(), testConfig());
    expect(saveAppState(localStorage, createAppState(finished))).toBeNull();
    renderGame();
    const dialog = screen.getByRole('dialog', { name: 'Миссия выполнена' });
    expect(dialog).toHaveTextContent('50% очков');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Посмотреть партию' }));
    fireEvent.click(screen.getByRole('button', { name: 'Журнал событий' }));
    expect(screen.getByRole('heading', { name: 'Журнал событий' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Результаты' }));
    expect(screen.getByRole('table')).toHaveTextContent('50%');
  });
});
