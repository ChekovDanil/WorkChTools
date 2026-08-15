# WorkPilot Brief

PWA, которая превращает заметки, письма и описания проектов в структурированный рабочий план: цели, задачи, сроки, риски, вопросы и следующие действия.

## Локальный запуск

```bash
npm install
npm run dev
```

Без `VITE_API_URL` приложение работает в безопасном демонстрационном режиме: текст не отправляется во внешний API, а пользователь получает пример результата.

## Архитектура

- **Frontend:** React, TypeScript, Vite, PWA; публикуется через GitHub Pages.
- **Backend:** `cloudflare-worker`; использует Workers AI без стороннего API-ключа и возвращает структурированный JSON.
- **Публичная версия:** GitHub Pages обращается к развёрнутому Cloudflare Worker.
- **Предыдущий backend:** `supabase/functions/analyze`; оставлен в репозитории как резервный вариант.
- **Лимит:** 4 обращения к анализатору за скользящие 24 часа; счётчик обновляется атомарно в Cloudflare D1.
- **Данные:** исходный текст и результат не сохраняются на сервере; черновик хранится только в браузере пользователя.
- **Приватность лимита:** сервер хранит только SHA-256 случайного идентификатора браузера, без IP и без текста запроса.

## Подключение Cloudflare Workers AI

Worker развёрнут по адресу [`https://workpilot-api.chekov-99.workers.dev`](https://workpilot-api.chekov-99.workers.dev), а endpoint анализа — `/analyze`. Инструкции по повторному развёртыванию находятся в [`cloudflare-worker/README.md`](cloudflare-worker/README.md).

## Подключение GPT

1. Создайте отдельный проект Supabase.
2. Примените миграцию `supabase/migrations/202608150001_request_limits.sql`.
3. Добавьте секреты функции (секреты нельзя коммитить в GitHub):

```bash
supabase secrets set OPENAI_API_KEY=YOUR_KEY
supabase secrets set APP_ORIGIN=https://chekovdanil.github.io
supabase secrets set OPENAI_MODEL=gpt-5.6-luna
supabase secrets set RATE_LIMIT_SALT=A_LONG_RANDOM_VALUE
```

4. Опубликуйте функцию: `supabase functions deploy analyze --no-verify-jwt`.
5. Укажите публичный URL функции как `VITE_API_URL` во время сборки GitHub Pages.
6. Повторно запустите workflow `Deploy to GitHub Pages`.

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` собирает приложение и публикует папку `dist`. В настройках репозитория Pages должен быть выбран источник **GitHub Actions**.
