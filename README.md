# Лаборатория нестабильных порталов

Веб-приложение для смотрителя магической лаборатории: оно рассчитывает риск
порталов, рекомендует действия, запрещает нелогичные операции и ведёт журнал
событий.

Проект находится на стадии подготовленного каркаса. Источник задания сохранён в
`Untitled.rtf`, а выбранный вариант нормализован в
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

