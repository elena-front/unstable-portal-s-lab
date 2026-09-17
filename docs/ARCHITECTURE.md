# Архитектура

## Технологические решения

- React + TypeScript + Vite.
- React Context и `useReducer` вместо стороннего state manager.
- CSS Modules для изоляции стилей.
- Vitest и React Testing Library.
- LocalStorage как единственное постоянное хранилище.

## Предлагаемая структура

```text
src/
  app/                 композиция приложения, Provider и Error Boundary
  components/          переиспользуемые UI-компоненты
  config/              единая конфигурация игрового баланса
  features/
    dashboard/         сводка и приоритеты
    game-cycle/        таймер, штат и итог цикла
    worlds/            прогресс исследования и экспедиции
    portals/           список и карточка
    event-log/         журнал событий
    ai-worklog/        встроенный AI Worklog
  domain/              типы, расчёт риска, рекомендации и проверки действий
  data/                демоданные и версия схемы
  persistence/         чтение, валидация и запись LocalStorage
  styles/              глобальные токены и базовые стили
  test/                общая настройка тестов
```

Создавать директории следует по мере появления реального кода, не заранее.

## Управление состоянием

`PortalProvider` владеет единым `AppState`:

```text
AppState
├── cycle
├── resultHistory
├── worlds
├── portals
├── employees
├── events
├── selectedPortalId
├── activeView
├── awaitingStart
├── filters
└── notification/error
```

Компоненты отправляют типизированные действия в reducer. Reducer вызывает или
использует результат чистых доменных функций, но не обращается к LocalStorage.
Сохранение выполняется отдельным адаптером и эффектом Provider.

`awaitingStart` приостанавливает тики до выбора сценария. Для старых сохранений
без этого поля применяется `false`: начатая партия продолжает загружаться.
Диалог итога получает сохранённый `GameResult`; статус миссии и процент очков
вычисляются чистой функцией, без нового поля в истории.

## Доменная модель

`World`, `Portal` и `Employee` — отдельные сущности.
`Portal.destinationWorldId` ссылается на `World.id`, а `Employee.location`
указывает лабораторию или мир. Количество сотрудников для портала получается
селектором и не хранится в портале. Генератор порталов принимает источник
случайности как зависимость, чтобы тесты оставались детерминированными.
Генератор не создаёт новый портал, если уже существует 20 порталов с
`lifecycle != closed`; `collapsed` продолжает занимать слот.

```text
GameCycle
├── status                    // ready | running | finished
├── durationSeconds          // 600 by default
├── elapsedSeconds
├── nextPortalInSeconds
├── spawnPending
├── knownWorldStreak
├── stabilizationAttempts   // 3 per cycle by default
└── result

GameResult
├── id, startedAt, finishedAt
├── exploredWorlds, totalWorlds
├── returnedEmployees, lostEmployees
├── closedPortals, collapsedPortals
└── stabilizationAttemptsUsed

World
├── id, name
├── visibility              // hidden | revealed
├── researchStatus          // questionable | exploring | explored
├── researchRequired        // 90..150 by default
└── researchProgress

Employee
├── id
├── location                // lab | { worldId }
└── role                    // researcher | { observerForPortalId }
```

Минимальные доменные данные портала:

```text
Portal
├── id, name, destinationWorldId
├── energy                  // 0..100
├── dissipationCoefficient  // 0..1
├── stability               // 0..1
├── stabilizationBonus      // 0..0.75
├── initialLifetimeSeconds  // number | null
├── wasCritical
├── riskStatus               // stable | dangerous | critical
├── lifecycle                // active | closed | collapsed
└── closedReason             // manual | critical-empty | collapsed-cleared | null
```

Время, случайность и период обновления внедряются в доменный сервис. Компоненты
не запускают собственные расчёты и не мутируют параметры портала.

## Конфигурация баланса

Все настраиваемые числа находятся в одном `GameBalanceConfig`, например в
`src/config/gameBalance.ts`. Компоненты не импортируют отдельные числовые
константы, а доменные функции получают конфигурацию аргументом.

```text
GameBalanceConfig
├── cycleDurationSeconds: 600
├── worldsCount: 8
├── initialEmployees: 12
├── maxExpeditionSize: 4
├── maxUnclosedPortals: 20
├── maxPortalEnergy: 100
├── researchRequiredRange: [90, 150]
├── firstPortalDelayRange: [3, 10]
├── nextPortalDelayRange: [15, 30]
├── earlyClosureDelaySeconds: 5
├── hiddenWorldProbability: 0.65
├── knownWorldStreakLimit: 2
├── reliableReserveSeconds: 60
├── energyTickSeconds: 1
├── coefficientRefreshSeconds: 60
├── lifetimeScaleSeconds: 10
├── dangerousRiskThreshold: 0.5
├── criticalRiskThreshold: 0.8
├── transitBaseCost: 2
├── transitDissipationWeight: 3
├── transitInstabilityWeight: 2
├── stabilizationAttempts: 3
├── stabilizationStrengthRange: [0.08, 0.25]
├── maxStabilizationBonus: 0.75
├── maxActiveObservers: 1
├── stabilizationBaseChance: 0.90
├── stabilizationRiskPenalty: 0.65
├── observerChanceBonus: 0.15
└── stabilizationChanceRange: [0.20, 0.80]
```

Диапазоны генерации энергии, рассеивания и стабильности также входят в этот
объект. Тесты могут передавать уменьшенную конфигурацию, не меняя
production-значения. В доменной логике нет иных числовых констант игрового
баланса.

## Расчёт времени и риска

Чистые функции в `src/domain/` реализуют:

```text
ENERGY_TICK_SECONDS = 1
COEFFICIENT_REFRESH_SECONDS = 60
C = 10 seconds

K_effective = D * (1 - S_effective)
E_next = max(0, E - K_effective * deltaTime / C)
T_remaining = C * E / K_effective
R = clamp(1 - T_remaining / T_initial, 0, 1)
```

Provider инициирует обновление раз в секунду, но чистая доменная функция
принимает фактический `deltaTime`, внедряемые часы и источник случайности.
Новые `D` и `S` генерируются после каждых 60 секунд симуляционного времени.

`E = 0` даёт `T_remaining = 0` и `R = 1`. При `E > 0` и `K_effective = 0`
деление не выполняется: `T_remaining = Infinity`, `T_initial = null`, `R = 0`.
При первом `K_effective > 0` доменная функция фиксирует конечное
`T_initial = T_remaining`; риск в этот момент равен 0%. Для хранения в
LocalStorage бесконечность не сериализуется; адаптер хранит физические параметры
и `T_initial`, а оставшееся время и риск рассчитывает после загрузки.

`riskStatus` выводится из риска по границам `[0, 0.5)`, `[0.5, 0.8)` и
`[0.8, 1]` только при `lifecycle = active`. При достижении критичного диапазона
устанавливается `wasCritical`; если после этого селектор сотрудников мира
возвращает 0, выполняется необратимый переход в `closed`. При `E = 0` портал
переходит в `collapsed`, прекращает обновление физических параметров, но
остаётся занятым слотом.

Периодическое изменение коэффициентов может менять оценку оставшегося времени
и риск в обе стороны. Provider слушает Page Visibility API: при
`document.hidden = true` секундные обновления останавливаются, а при возвращении
продолжаются с прежнего симуляционного времени без компенсации паузы.

## Случайный директор порталов

В начале цикла `nextPortalInSeconds` выбирается из диапазона 3–10 секунд; первый
портал ведёт в случайный скрытый мир. После каждого появления следующая задержка
заново выбирается из диапазона 15–30 секунд. Когда счётчик достигает нуля,
чистая функция `spawnPortal`:

1. откладывает появление, если незакрытых порталов уже 20;
2. при наличии скрытых миров с вероятностью 0.65 выбирает случайный скрытый
   мир, иначе — случайный открытый;
3. после двух последовательных выборов открытого мира принудительно выбирает
   случайный скрытый мир;
4. генерирует физические параметры портала и новую случайную задержку.

Источник случайности внедряется. Защита от серии относится к выбору назначения,
а не задаёт момент или порядок открытия конкретных миров. Заблокированная
лимитом попытка хранится как `spawnPending`; появление повторяется на следующем
тике после освобождения места без нового броска задержки.

## Переходы и исследование

Чистая функция предварительного расчёта перехода использует текущий снимок:

```text
costPerEmployee = 2 + 3 * D + 2 * (1 - S_effective)
totalCost = employeeCount * costPerEmployee
E_after = max(0, E_before - totalCost)
```

`sendResearchers` принимает от 1 до 4 свободных сотрудников и разрешён только
для активного `stable` или `dangerous` портала. При `E_after > 0` операция
атомарно уменьшает энергию и меняет `Employee.location`.

При `E_after = 0` доменный селектор ищет другой портал, удовлетворяющий всем
условиям:

```text
isReliableReserve =
  reserve.id != selected.id &&
  reserve.destinationWorldId == selected.destinationWorldId &&
  reserve.lifecycle == active &&
  reserve.riskStatus == stable &&
  energyAfterReturn(reserve, sentGroup) > 0 &&
  remainingTime(reserve) >= estimatedResearchTimeAfterSend + 60
```

При наличии резерва reducer сначала переводит сотрудников в мир, затем ставит
энергию выбранного портала в 0 и `lifecycle = collapsed`. Без резерва действие
отклоняется и ничего не меняет. Проверка выполняется одним чистым расчётом на
одном снимке состояния.

`returnEmployees` делает обратный переход по той же цене. Если энергия
исчерпана, reducer сначала перемещает всю выбранную группу в лабораторию, затем
помечает портал как `collapsed`; резерв не требуется. Для `critical` действие
требует подтверждения: группа возвращается по обычной цене, после чего портал
принудительно получает `collapsed`, даже если часть энергии сохранилась.

На каждом обновлении прогресс открытого мира вычисляется независимо от наличия
текущего портала:

```text
rate = sqrt(employeeCountInWorld)
progressNext = min(researchRequired, progress + rate * deltaTime)
```

Полный прогресс всегда даёт `explored`; иначе положительное число сотрудников
даёт `exploring`, а нулевое — `questionable`. В конце цикла все сотрудники с
`location != lab` учитываются как потерянные в результате партии, но сами записи
не удаляются.

## Завершение и сохранение партий

Когда `elapsedSeconds` достигает `durationSeconds`, reducer одним переходом:

1. устанавливает `cycle.status = finished`;
2. рассчитывает неизменяемый `GameResult`;
3. добавляет его в `resultHistory` ровно один раз;
4. блокирует игровые actions и дальнейшие тики.

Адаптер LocalStorage хранит текущую партию и историю результатов в
версионированной, валидируемой схеме. Повреждение текущей партии не удаляет
валидную историю, а повреждение истории не мешает восстановить новую партию.
Сохранение сначала записывает текущую партию, затем историю; если запись истории
прервалась, валидный результат завершённой партии добавляется по `id` при
загрузке. Подтверждённая очистка истории записывает маркер текущей завершённой
партии, чтобы её результат не восстановился вопреки воле оператора.
Action `newGame` пересоздаёт `cycle`, миры, порталы, сотрудников и события
текущей партии, сохраняя `resultHistory`, затем показывает экран подготовки.
`startGame` применяет выбранный сценарий и запускает тики. Очистка истории —
отдельный action с подтверждением.

## Действия первой версии

Чистые селекторы определяют важность относительно всех активных порталов в
тот же мир:

```text
important = employeesInWorld > 0 &&
  (activeToWorld.length == 1 ||
   activeToWorld.every(riskStatus is dangerous or critical))

veryImportant = employeesInWorld > 0 && activeToWorld.length == 1
```

`stabilize` доступен важному порталу с `lifecycle = active` и `riskStatus`
`dangerous` или `critical`, а также единственному работающему порталу в мир со
статусом `stable`, если `stabilizationBonus < 0.75`.
Reducer хранит число использованных попыток; лимит — три на весь
10-минутный цикл без восстановления. Проверка доступности выполняется до
расходования попытки.

Вероятность и результат рассчитываются чистой функцией с внедряемым источником
случайности:

```text
P = clamp(0.90 - 0.65 * risk + 0.15 * observer, 0.20, 0.80)
A = 0.08 + 0.17 * random()
B_new = min(0.75, 1 - (1 - B_old) * (1 - A))
S_effective = S + (1 - S) * B_new
K_effective = D * (1 - S_effective)
```

Первое случайное значение определяет успех, второе — силу только успешного
эффекта. Неудача сохраняет физические параметры, но расходует попытку.
Наблюдатель — сотрудник с ролью `observer` в мире назначения. Он применяется к
следующей допустимой попытке и затем становится `researcher`. Допустим не более
одного сотрудника с ролью `observer` во всём `AppState`.

`sendObserver` сначала проверяет статус: допустим только `dangerous`.
`critical`, `stable`, `closed` и `collapsed` возвращают доменный отказ до любых
остальных проверок и ничего не меняют. Затем проверяются `veryImportant`,
доступность сотрудника и наблюдателя. Отправка расходует энергию как переход
одного человека. При переходе портала в `critical` reducer атомарно меняет роль
связанного наблюдателя на `researcher`; его местоположение не меняется. Поэтому
в формуле для критичного портала `observer` всегда равен 0.

Для проверки инварианта сравниваются оценки времени до и после действия на
одной временной отметке. Изменение времени между отметками относится к обычной
эволюции портала, а не к стабилизации.

`close` для `lifecycle = active` разрешён порталу в `explored`-мир или
критичному порталу в неисследованный мир при наличии другого надёжного маршрута.
Для исследованного мира без сотрудников резерв не требуется. Если сотрудники
есть, чистый селектор требует другой надёжный портал для того же мира с
`energyAfterReturn > 0` и `remainingTime >= 60`; UI дополнительно требует
подтверждение. Для неисследованного мира резерв обязателен даже при нуле
сотрудников. Закрытие портала, для которого назначен наблюдатель, сначала
переводит его в роль `researcher`.

Для `lifecycle = collapsed` действие `close` доступно без дополнительных
проверок и устанавливает `closedReason = collapsed-cleared`. До этого перехода
портал входит в лимит 20; после него ожидающее появление может выполниться на
следующем тике. `markQuestionable` больше не является
действием портала: `questionable` — начальный статус исследования мира.

События экспедиций, возвращений, попыток стабилизации, назначения наблюдателя,
ручного закрытия, открытия миров и терминальных переходов записываются в журнал.

## Надёжность и доступность

- Кнопка должна иметь текст, а уровень риска — не кодироваться только цветом.
- Диалог подтверждения должен работать с клавиатуры и возвращать фокус.
- Ошибка загрузки LocalStorage восстанавливается через демоданные.
- Глобальный Error Boundary показывает понятный fallback.
- Все даты форматируются единообразно для русской локали.
