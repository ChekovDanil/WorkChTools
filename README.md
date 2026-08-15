# WorkPilot Brief

PWA, которая превращает заметки, письма и описания проектов в структурированный рабочий план: цели, задачи, сроки, риски, вопросы и следующие действия.

## Локальный запуск

```bash
npm install
npm run dev
```

Без `VITE_API_URL` приложение работает в демонстрационном режиме.

## Архитектура

- **Frontend:** React, TypeScript, Vite, PWA; публикуется через GitHub Pages.
- **Backend:** `supabase/functions/analyze`; хранит OpenAI API key и возвращает Structured Output.
- **Данные:** исходный текст и результат не сохраняются на сервере; черновик хранится только в браузере пользователя.

## Подключение GPT

1. Создайте проект Supabase и установите Supabase CLI.
2. Добавьте секреты функции:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_KEY
supabase secrets set APP_ORIGIN=https://chekovdanil.github.io
supabase secrets set OPENAI_MODEL=gpt-5.6-luna
```

3. Опубликуйте функцию: `supabase functions deploy analyze --no-verify-jwt`.
4. В GitHub → Settings → Secrets and variables → Actions → Variables создайте `VITE_API_URL` со значением URL функции.
5. Повторно запустите workflow `Deploy to GitHub Pages`.

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` собирает приложение и публикует папку `dist`. В настройках репозитория Pages должен быть выбран источник **GitHub Actions**.
