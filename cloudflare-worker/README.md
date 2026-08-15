# WorkPilot Cloudflare Worker

Backend без стороннего AI API-ключа. Использует Workers AI через binding `AI` и D1 для ограничения четырёх успешных анализов на браузер за скользящие 24 часа.

## Развёртывание

```bash
npm install
npx wrangler login
npx wrangler d1 create workpilot-rate-limits
```

Замените временный `database_id` в `wrangler.jsonc` на идентификатор созданной D1 базы, затем:

```bash
npm run types
npx wrangler d1 migrations apply workpilot-rate-limits --remote
npm run check
npm run deploy
```

После публикации frontend должен отправлять запросы на `https://workpilot-api.<subdomain>.workers.dev/analyze`.

В D1 не сохраняются исходные тексты и ответы модели. Таблица содержит только SHA-256 случайного идентификатора браузера, окно лимита и счётчик запросов.
