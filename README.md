# Лаборатория нестабильных порталов

Короткая стратегическая сессия для смотрителя магической лаборатории: порталы
случайно открывают миры, сотрудники исследуют их, а оператор управляет риском,
стабилизацией и возвращением экспедиций. Партия длится 10 минут, её результат
сохраняется локально, а стартовые параметры баланса собраны в одной
конфигурации для быстрых игровых прогонов.

Этапы 1–2 завершены: доменные правила находятся в `src/domain/`, баланс — в
`src/config/gameBalance.ts`, а состояние приложения и сохранение — в `src/state/`
и `src/persistence/`. Интерфейс пока остаётся каркасом; игровые экраны
запланированы на этап 3. Источник задания сохранён в `Untitled.rtf`, а вариант описан в
[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).

## Стек

- React 19 + TypeScript;
- Vite;
- React Context + `useReducer` для состояния;
- CSS Modules;
- Vitest + React Testing Library;
- LocalStorage без backend и внешних API.

## Запуск

Требуется Node.js 24+ и npm 11+.

```bash
npm install
npm run dev
```

Проверки:

```bash
npm run typecheck
npm run test:run
npm run build
```

## Документы для разработки

- [Требования](docs/PRODUCT_SPEC.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [План реализации](docs/IMPLEMENTATION_PLAN.md)
- [Журнал решений](docs/DECISIONS.md)
- [AI Worklog](docs/AI_WORKLOG.md)
- [Чеклист проверки](docs/TEST_CHECKLIST.md)

Инструкции для AI-агентов находятся в [`AGENTS.md`](AGENTS.md). Перед началом
новой задачи агент должен прочитать этот файл и релевантные документы из `docs/`.
