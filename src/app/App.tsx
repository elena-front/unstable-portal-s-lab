import { useEffect, useRef, useState } from 'react';

import { gameBalance } from '../config/gameBalance';
import {
  actionAvailability,
  employeesInWorld,
  energyAfterTransit,
  estimatedResearchSeconds,
  findReliableReserve,
  portalRisk,
  recommendationForPortal,
  remainingLifetime,
  stabilizationChance,
  transitCost,
} from '../domain';
import type { Portal } from '../domain/types';
import { usePortals } from '../state/PortalContext';
import { portalMatchesFilter, type PortalFilter } from '../state/portalReducer';
import styles from './App.module.css';
import { Worklog } from './Worklog';
import { EventJournal, GameSetup, ResultDialog, ResultsTable } from './GameViews';

const riskNames = { stable: 'Стабильный', dangerous: 'Опасный', critical: 'Критичный' };
const lifecycleNames = { active: 'Активный', collapsed: 'Схлопнулся', closed: 'Закрыт' };
const researchNames = { questionable: 'Не исследован', exploring: 'Исследуется', explored: 'Исследован' };
const filterNames: Record<PortalFilter, string> = {
  all: 'Все активные', stable: 'Стабильные', dangerous: 'Опасные', critical: 'Критичные', collapsed: 'Схлопнувшиеся', closed: 'Закрытые',
};

function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

function priority(portal: Portal): number {
  if (portal.lifecycle === 'collapsed') return 4;
  if (portal.lifecycle === 'closed') return 5;
  return { critical: 0, dangerous: 1, stable: 2 }[portal.riskStatus];
}

export function App() {
  const { state, dispatch } = usePortals();
  const [groupSize, setGroupSize] = useState(1);
  const [dismissedResultId, setDismissedResultId] = useState<string | null>(null);
  const collapsedActionRef = useRef<HTMLButtonElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const currentFilterRef = useRef<HTMLButtonElement>(null);
  const previousSelectionRef = useRef<string | null>(state.selectedPortalId);
  const resultsTabRef = useRef<HTMLButtonElement>(null);
  const selected = state.portals.find((portal) => portal.id === state.selectedPortalId) ?? null;
  const world = selected ? state.worlds.find((item) => item.id === selected.destinationWorldId) : null;
  const inWorld = world ? employeesInWorld(state, world.id) : [];
  const available = state.employees.filter((employee) => employee.location === 'lab');
  const active = state.cycle.status !== 'finished';
  const visible = state.portals
    .filter((portal) => portalMatchesFilter(portal, state.portalFilter))
    .sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name, 'ru'));
  const openCount = state.portals.filter((portal) => portal.lifecycle !== 'closed').length;
  const criticalCount = state.portals.filter((portal) => portal.lifecycle === 'active' && portal.riskStatus === 'critical').length;
  const closedCount = state.portals.filter((portal) => portal.lifecycle === 'closed').length;
  const attentionCount = state.portals.filter((portal) => portal.lifecycle === 'collapsed' || (portal.lifecycle === 'active' && portal.riskStatus !== 'stable')).length;
  const exploredCount = state.worlds.filter((item) => item.researchStatus === 'explored').length;
  const observer = selected && state.employees.some((employee) => employee.role.type === 'observer' && employee.role.portalId === selected.id);
  const selectedCount = Math.min(groupSize, available.length);
  const afterTransit = selected ? energyAfterTransit(selected, selectedCount, gameBalance) : 0;
  const reserve = selected && world && selectedCount > 0 && afterTransit === 0
    ? findReliableReserve(state, selected, selectedCount, estimatedResearchSeconds(world, inWorld.length + selectedCount), gameBalance)
    : null;
  const availability = selected ? actionAvailability(state, selected, groupSize, gameBalance) : null;
  const canSend = availability?.send === null;

  useEffect(() => { setGroupSize(1); }, [selected?.id]);
  useEffect(() => {
    if (previousSelectionRef.current && !state.selectedPortalId && document.activeElement === document.body) {
      currentFilterRef.current?.focus();
    }
    previousSelectionRef.current = state.selectedPortalId;
  }, [state.selectedPortalId, state.portalFilter]);
  useEffect(() => {
    if (document.activeElement !== document.body) return;
    if (selected?.lifecycle === 'collapsed') collapsedActionRef.current?.focus();
    if (selected?.lifecycle === 'closed') selectedRowRef.current?.focus();
  }, [selected?.lifecycle]);

  const send = () => {
    if (!selected || !canSend) return;
    dispatch({ type: 'sendResearchers', portalId: selected.id, employeeIds: available.slice(0, selectedCount).map((employee) => employee.id) });
  };
  const returnGroup = () => {
    if (!selected || inWorld.length === 0) return;
    const emergency = selected.riskStatus === 'critical';
    if (emergency && !window.confirm('Аварийная эвакуация схлопнет портал. Вернуть всех сотрудников?')) return;
    dispatch({ type: 'returnEmployees', portalId: selected.id, employeeIds: inWorld.map((employee) => employee.id), emergencyConfirmed: emergency });
  };
  const close = () => {
    if (!selected) return;
    const confirmed = selected.lifecycle === 'active' && inWorld.length > 0
      ? window.confirm('Закрыть портал? Сотрудники останутся в мире; проверьте резервный маршрут.')
      : true;
    if (!confirmed) return;
    dispatch({ type: 'closePortal', portalId: selected.id, confirmed });
  };
  const newGame = () => { dispatch({ type: 'newGame' }); setDismissedResultId(null); };
  const clearHistory = () => {
    if (window.confirm('Удалить всю историю результатов?')) dispatch({ type: 'clearHistory', confirmed: true });
  };
  const showResult = !state.awaitingStart && state.cycle.result && dismissedResultId !== state.cycle.result.id;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>MOX / Оперативный центр</p><h1>Лаборатория нестабильных порталов</h1></div>
        {!state.awaitingStart && <nav aria-label="Основная навигация" className={styles.nav}>
          <button className={state.activeView === 'portals' ? styles.activeTab : ''} aria-current={state.activeView === 'portals' ? 'page' : undefined} onClick={() => dispatch({ type: 'setView', view: 'portals' })}>Порталы</button>
          <button className={state.activeView === 'events' ? styles.activeTab : ''} aria-current={state.activeView === 'events' ? 'page' : undefined} onClick={() => dispatch({ type: 'setView', view: 'events' })}>Журнал событий</button>
          <button ref={resultsTabRef} className={state.activeView === 'results' ? styles.activeTab : ''} aria-current={state.activeView === 'results' ? 'page' : undefined} onClick={() => dispatch({ type: 'setView', view: 'results' })}>Результаты</button>
          <button className={state.activeView === 'worklog' ? styles.activeTab : ''} aria-current={state.activeView === 'worklog' ? 'page' : undefined} onClick={() => dispatch({ type: 'setView', view: 'worklog' })}>AI Worklog</button>
        </nav>}
      </header>
      {state.awaitingStart ? <GameSetup storageWarning={state.storageWarning} onStart={(scenario) => dispatch({ type: 'startGame', scenario })} /> :
        state.activeView === 'worklog' ? <Worklog /> :
        state.activeView === 'events' ? <EventJournal events={state.events} /> :
        state.activeView === 'results' ? <ResultsTable results={state.resultHistory} onNewGame={newGame} onClear={clearHistory} /> : <main>
        <section className={styles.intro} aria-label="Состояние партии">
          <div><p className={styles.eyebrow}>Партия {state.cycle.status === 'finished' ? 'завершена' : 'идёт'}</p><h2>Исследуйте миры и верните команду</h2><p>Отправляйте сотрудников через порталы. Следите за риском, энергией и временем до конца цикла.</p></div>
          <div className={styles.timer}><span>Осталось</span><strong aria-label={`Осталось ${duration(state.cycle.durationSeconds - state.cycle.elapsedSeconds)}`}>{duration(state.cycle.durationSeconds - state.cycle.elapsedSeconds)}</strong><span>В лаборатории: {available.length} из {state.employees.length}</span></div>
        </section>
        {state.storageWarning && <p role="alert" className={styles.alert}>{state.storageWarning} Для проверки можно загрузить демосценарий ниже.</p>}
        {state.notification && <div role="status" className={styles.notice}><span>{state.notification.message}</span><button onClick={() => dispatch({ type: 'dismissNotification' })} aria-label="Закрыть уведомление">×</button></div>}
        <section className={styles.metrics} aria-label="Сводка порталов">
          <div><span>Незакрытые</span><strong>{openCount}</strong></div><div><span>Критические</span><strong>{criticalCount}</strong></div><div><span>Закрытые</span><strong>{closedCount}</strong></div><div><span>Требуют внимания</span><strong>{attentionCount}</strong></div>
        </section>
        <section className={styles.worldSection} aria-labelledby="worlds-title"><div className={styles.sectionHeading}><h2 id="worlds-title">Миры</h2><span>{exploredCount} / {state.worlds.length} исследовано</span></div><div className={styles.worldGrid}>{state.worlds.map((item) => <div key={item.id} className={styles.world}><div><strong>{item.visibility === 'hidden' ? 'Неизвестный мир' : item.name}</strong><span>{item.visibility === 'hidden' ? 'Скрыт' : researchNames[item.researchStatus]}</span></div><progress aria-label={`Прогресс мира ${item.visibility === 'hidden' ? 'неизвестный' : item.name}`} value={item.researchProgress} max={item.researchRequired} /><small>{item.visibility === 'hidden' ? 'Ожидает открытия' : `${Math.floor(100 * item.researchProgress / item.researchRequired)}% · сотрудников: ${employeesInWorld(state, item.id).length}`}</small></div>)}</div></section>
        <div className={styles.sectionHeading}><h2>Порталы</h2><span>{visible.length} в списке</span></div>
        <div className={styles.filters} aria-label="Фильтр порталов">{(Object.keys(filterNames) as PortalFilter[]).map((filter) => <button key={filter} ref={state.portalFilter === filter ? currentFilterRef : undefined} aria-pressed={state.portalFilter === filter} onClick={() => dispatch({ type: 'setFilter', filter })}>{filterNames[filter]}</button>)}</div>
        <div className={styles.mainGrid}>
          <section className={styles.list} aria-label="Список порталов">{visible.length === 0 ? <div className={styles.empty}><p>{state.portals.length === 0 ? `Порталов пока нет. Первый откроется через ${duration(state.cycle.nextPortalInSeconds)}.` : 'По выбранному фильтру порталов нет.'}</p></div> : visible.map((portal) => {
            const destination = state.worlds.find((item) => item.id === portal.destinationWorldId);
            return <button key={portal.id} ref={state.selectedPortalId === portal.id ? selectedRowRef : undefined} className={`${styles.portalRow} ${state.selectedPortalId === portal.id ? styles.selected : ''}`} aria-pressed={state.selectedPortalId === portal.id} onClick={() => dispatch({ type: 'selectPortal', portalId: portal.id })}><span><strong>{portal.name}</strong><small>{destination?.name ?? 'Мир неизвестен'} · {employeesInWorld(state, portal.destinationWorldId).length} чел.</small></span><span className={styles.rowStatus}>{portal.lifecycle === 'active' ? riskNames[portal.riskStatus] : lifecycleNames[portal.lifecycle]}<small>{portal.lifecycle === 'active' ? `Энергия ${portal.energy.toFixed(1)}` : ''}</small></span></button>;
          })}</section>
          <section className={styles.detail} aria-label="Детали портала">{selected && world ? <><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Выбранный портал</p><h2>{selected.name}</h2></div><span className={styles.badge}>{selected.lifecycle === 'active' ? riskNames[selected.riskStatus] : lifecycleNames[selected.lifecycle]}</span></div><p>Ведёт в мир «{world.name}». {recommendationForPortal(selected)}</p><dl className={styles.facts}><div><dt>Энергия</dt><dd>{selected.energy.toFixed(1)} / 100</dd></div><div><dt>Риск</dt><dd>{Math.round(portalRisk(selected, gameBalance) * 100)}% · {riskNames[selected.riskStatus]}</dd></div><div><dt>До схлопывания</dt><dd>{duration(remainingLifetime(selected, gameBalance))}</dd></div><div><dt>Рассеивание / стабильность</dt><dd>{selected.dissipationCoefficient.toFixed(2)} / {selected.stability.toFixed(2)}</dd></div><div><dt>В мире</dt><dd>{inWorld.length} сотрудников</dd></div></dl><p className={styles.hint}>Риск — доля истёкшего расчётного времени жизни. При 50% портал опасен, при 80% — критичен. Коэффициенты меняются раз в минуту.</p>
            {selected.lifecycle === 'active' && selected.riskStatus === 'critical' &&
              <div className={styles.critical} role="alert"><strong>Критический риск · {Math.round(portalRisk(selected, gameBalance) * 100)}%</strong><p>Расчётное время жизни упало ниже 20% начального. Энергия: {selected.energy.toFixed(1)}; рассеивание: {selected.dissipationCoefficient.toFixed(2)}; стабильность: {selected.stability.toFixed(2)}. Отправка запрещена. Сотрудников в мире: {inWorld.length}.</p></div>}
            {selected.lifecycle === 'active' && <div className={styles.actions}>
              <h3>Экспедиция</h3>
              <label htmlFor="group-size">Размер группы</label>
              <select id="group-size" value={Math.min(groupSize, Math.max(1, available.length))} onChange={(event) => setGroupSize(Number(event.target.value))} disabled={!active || available.length === 0}>{Array.from({ length: Math.min(gameBalance.maxExpeditionSize, Math.max(1, available.length)) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select>
              <p>Цена отправки: {transitCost(selected, selectedCount, gameBalance).toFixed(1)} энергии. После перехода: {afterTransit.toFixed(1)}. {afterTransit === 0 && selectedCount > 0 ? reserve ? `Резерв: ${reserve.name}.` : 'Надёжного резервного портала нет.' : `Оценка жизни после перехода: ${duration(remainingLifetime({ ...selected, energy: afterTransit }, gameBalance))}.`}</p>
              <button className={styles.primary} onClick={send} disabled={!canSend} aria-describedby={availability?.send ? 'send-reason' : undefined}>Отправить сотрудников</button>
              {availability?.send && <p id="send-reason" role={world.researchStatus === 'explored' ? 'alert' : undefined} className={styles.reason}>{availability.send}</p>}
              <button onClick={returnGroup} disabled={availability?.returnGroup !== null} aria-describedby={availability?.returnGroup ? 'return-reason' : undefined}>Вернуть всех ({inWorld.length}){selected.riskStatus === 'critical' ? ' · аварийно' : ''}</button>
              {availability?.returnGroup && <p id="return-reason" className={styles.reason}>{availability.returnGroup}</p>}
              <h3>Управление порталом</h3>
              <p>Стабилизация: шанс {Math.round(stabilizationChance(selected, Boolean(observer), gameBalance) * 100)}%. Осталось попыток: {gameBalance.stabilizationAttempts - state.cycle.stabilizationAttemptsUsed}.</p>
              <button onClick={() => dispatch({ type: 'stabilizePortal', portalId: selected.id })} disabled={availability?.stabilize !== null} aria-describedby={availability?.stabilize ? 'stabilize-reason' : undefined}>Стабилизировать</button>
              {availability?.stabilize && <p id="stabilize-reason" className={styles.reason}>{availability.stabilize}</p>}
              <button onClick={() => dispatch({ type: 'sendObserver', portalId: selected.id, employeeId: available[0]?.id ?? '' })} disabled={availability?.observe !== null} aria-describedby={availability?.observe ? 'observe-reason' : undefined}>Назначить наблюдателя</button>
              {availability?.observe && <p id="observe-reason" className={styles.reason}>{availability.observe}</p>}
              <button onClick={close} disabled={availability?.close !== null} aria-describedby={availability?.close ? 'close-reason' : undefined}>Закрыть портал</button>
              {availability?.close && <p id="close-reason" className={styles.reason}>{availability.close}</p>}
            </div>}
            {selected.lifecycle === 'collapsed' && <><button ref={collapsedActionRef} onClick={close} disabled={availability?.close !== null} aria-describedby={availability?.close ? 'close-reason' : undefined}>Закрыть схлопнувшийся портал</button>{availability?.close && <p id="close-reason" className={styles.reason}>{availability.close}</p>}</>}
            {selected.lifecycle === 'closed' && <p className={styles.hint}>Портал закрыт. Действия недоступны.</p>}
</> : <p className={styles.empty}>Выберите портал, чтобы увидеть риск, прогноз перехода и доступные действия.</p>}</section>
        </div>
        <button className={styles.newGame} onClick={newGame}>Новая партия</button>
      </main>}
      {showResult && state.cycle.result && <ResultDialog result={state.cycle.result} onClose={() => { setDismissedResultId(state.cycle.id); resultsTabRef.current?.focus(); }} onNewGame={newGame} />}
    </div>
  );
}
