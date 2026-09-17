import { useEffect, useRef, useState } from 'react';

import { gameBalance } from '../config/gameBalance';
import { missionSummary } from '../domain/gameCycle';
import type { ReviewScenario } from '../domain/demoScenario';
import type { GameEvent, GameResult } from '../domain/types';
import styles from './GameViews.module.css';

const scenarios: { value: ReviewScenario; label: string }[] = [
  { value: 'normal', label: 'Обычная партия' },
  { value: 'dangerous', label: 'Опасный портал' },
  { value: 'critical', label: 'Критичный портал: возврат по запасу энергии' },
  { value: 'critical-reserve', label: 'Критичный портал с маршрутом возврата' },
  { value: 'closed', label: 'Автоматически закрытый портал' },
  { value: 'isolated', label: 'Схлопнувшийся портал и изоляция' },
  { value: 'limit', label: 'Лимит 8 порталов' },
  { value: 'limit-explored', label: 'Лимит и исследованный мир' },
  { value: 'exhausted', label: 'Попытки стабилизации исчерпаны' },
  { value: 'no-reserve', label: 'Нет резервного маршрута' },
  { value: 'reserve', label: 'Надёжный резервный маршрут' },
  { value: 'observer', label: 'Назначенный наблюдатель' },
  { value: 'success', label: 'Успешная стабилизация' },
  { value: 'failure', label: 'Неудачная стабилизация' },
  { value: 'observer-success', label: 'Успех с наблюдателем' },
  { value: 'observer-failure', label: 'Неудача с наблюдателем' },
  { value: 'explored', label: 'Исследованный мир без сотрудников' },
  { value: 'finished', label: 'Завершённая партия с потерями' },
];

function date(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function GameSetup({ onStart, storageWarning }: {
  onStart: (scenario: ReviewScenario) => void;
  storageWarning: string | null;
}) {
  const [scenario, setScenario] = useState<ReviewScenario>('normal');
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <main className={styles.setup}>
    {storageWarning && <p role="alert">{storageWarning} Начните новую партию.</p>}
    <p className={styles.eyebrow}>Перед началом партии</p>
    <h2 ref={titleRef} tabIndex={-1}>Откройте миры. Верните команду.</h2>
    <p>За десять минут исследуйте {gameBalance.worldsCount} неизвестных миров и верните сотрудников до закрытия смены.</p>
    <h3>Краткие правила</h3>
    <ol>
      <li>Порталы появляются случайно. Выберите безопасный маршрут и отправьте от одного до четырёх сотрудников.</li>
      <li>Исследование идёт, пока сотрудники находятся в мире. Каждый переход расходует энергию портала.</li>
      <li>Возвращайте команду вручную, включая критичный портал, если хватает энергии. Иначе верните часть сотрудников или выберите другой маршрут.</li>
      <li>Миссия выполнена, если исследованы все миры. Очки — процент сотрудников, вернувшихся в лабораторию.</li>
    </ol>
    <label htmlFor="game-scenario">Режим запуска</label>
    <select id="game-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as ReviewScenario)}>
      {scenarios.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <p className={styles.hint}>«Обычная партия» начинает игру с нуля. Остальные варианты — готовые ситуации для проверки отдельных правил; они могут начинаться с открытыми порталами и уже прошедшим временем.</p>
    <button className={styles.primary} onClick={() => onStart(scenario)}>Начать партию</button>
  </main>;
}

export function EventJournal({ events }: { events: GameEvent[] }) {
  const [limit, setLimit] = useState(20);
  return <main className={styles.panel}><h2>Журнал событий</h2><p>Записи текущей партии: {events.length}</p>
    {events.length === 0 ? <p>Событий пока нет.</p> : <ol className={styles.events}>{events.slice(-limit).reverse().map((event) =>
      <li key={event.id}><time dateTime={event.occurredAt}>{date(event.occurredAt)}</time><span>{event.message}</span></li>)}</ol>}
    {events.length > limit && <button onClick={() => setLimit(limit + 20)}>Показать ещё</button>}
  </main>;
}

export function ResultsTable({ results, onNewGame, onClear }: {
  results: GameResult[];
  onNewGame: () => void;
  onClear: () => void;
}) {
  return <main className={styles.panel}><h2>Результаты партий</h2>
    {results.length === 0 ? <p>Завершённых партий пока нет.</p> : <div className={styles.tableWrap}><table>
      <thead><tr><th scope="col">Дата</th><th scope="col">Миссия</th><th scope="col">Миры</th><th scope="col">Выжили</th><th scope="col">Очки</th></tr></thead>
      <tbody>{results.slice().reverse().map((result) => {
        const summary = missionSummary(result);
        return <tr key={result.id}><td>{date(result.finishedAt)}</td><td>{summary.completed ? 'Выполнена' : 'Провалена'}</td><td>{result.exploredWorlds}/{result.totalWorlds}</td><td>{result.returnedEmployees}/{result.returnedEmployees + result.lostEmployees}</td><td>{summary.score}%</td></tr>;
      })}</tbody>
    </table></div>}
    <div className={styles.actions}><button className={styles.primary} onClick={onNewGame}>Новая партия</button><button disabled={results.length === 0} onClick={onClear}>Очистить историю</button></div>
  </main>;
}

export function ResultDialog({ result, onClose, onNewGame }: {
  result: GameResult;
  onClose: () => void;
  onNewGame: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const summary = missionSummary(result);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className={styles.backdrop} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="mission-title" aria-describedby="mission-description">
      <p className={styles.eyebrow}>Время вышло</p>
      <h2 id="mission-title">Миссия {summary.completed ? 'выполнена' : 'провалена'}</h2>
      <p id="mission-description">Исследовано {result.exploredWorlds} из {result.totalWorlds} миров. Вернулись {result.returnedEmployees} из {result.returnedEmployees + result.lostEmployees} сотрудников.</p>
      <strong className={styles.score}>{summary.score}% очков</strong>
      <div className={styles.actions}><button ref={closeRef} onClick={onClose}>Посмотреть партию</button><button className={styles.primary} onClick={onNewGame}>Новая партия</button></div>
    </section>
  </div>;
}
