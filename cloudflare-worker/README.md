# WorkPilot Cloudflare Worker

Backend без стороннего AI API-ключа. Использует Workers AI через binding `AI` и D1 для ограничения четырёх успешных анализов на браузер за скользящие 24 часа.

Рабочий адрес: [`https://workpilot-api.chekov-99.workers.dev`](https://workpilot-api.chekov-99.workers.dev). Проверка состояния: `/health`, анализ: `/analyze`.

Используемая модель: `@cf/meta/llama-3.1-8b-instruct-fast` — она отвечает заметно быстрее 70B-варианта и подходит для интерактивного интерфейса.

## Развёртывание

```bash
npm install
npx wrangler login
npx wrangler d1 create workpilot-rate-limits
```

Для уже созданного проекта `database_id` записан в `wrangler.jsonc`. Чтобы заново развернуть текущую конфигурацию:

```bash
npm run types
npx wrangler d1 migrations apply workpilot-rate-limits --remote
npm run check
npm run deploy
```

Frontend отправляет запросы на `https://workpilot-api.chekov-99.workers.dev/analyze`.

В D1 не сохраняются исходные тексты и ответы модели. Таблица содержит только SHA-256 случайного идентификатора браузера, окно лимита и счётчик запросов.
