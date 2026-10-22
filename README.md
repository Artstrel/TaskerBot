# 🤖 TaskerBot — Умный Telegram-бот и WebApp трекер задач

<p align="center">
  <b>Минималистичный персональный ассистент для трекинга ежедневных рутин, разовых задач и долгосрочных целей в Telegram с поддержкой голосового ввода (Groq Whisper / Google Gemini) и премиальным Telegram WebApp (Mini App).</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Aiogram-3.4+-2CA5E0?style=flat&logo=telegram&logoColor=white" alt="Aiogram" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/SQLite-aiosqlite-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## ✨ Ключевые возможности

### 1. 🔄 Две категории ежедневных задач
- **Ежедневные привычки и рутины:**
  - Обновляются каждое утро в зависимости от настроек таймзоны пользователя.
  - Подсчитывают серии выполнений (**стрики** и личные рекорды).
  - Срочность и напоминания: автоматические push-уведомления за 6, 3 и 1 час до отбоя с инлайн-кнопками для закрытия в 1 клик.
- **Одноразовые задачи:**
  - Дела на сегодня. Если задача не завершена до конца дня — она **автоматически переносится на следующий день** и закрепляется вверху с бейджем просрочки.
  - Утренний дайджест со сводкой дел на день.

### 2. 🎯 Проекты и долгосрочные цели (Goals)
- Масштабные цели с дедлайнами и визуальными прогресс-барами (`40% • 4/10 шагов`).
- Чеклист подзадач внутри каждой цели.
- Возможность планировать подзадачи на **«Сегодня»** в 1 клик.

### 3. 🎙 Голосовой ввод и распознавание задач через AI
- **Два AI-провайдера на выбор**:
  - **Groq (по умолчанию)**: ультрабыстрая транскрипция Whisper-large-v3 + парсинг Llama 3 (ответ за доли секунды).
  - **Google Gemini**: распознавание через Gemini 2.5 Flash.
- Надиктуйте список дел в голосовом сообщении в Telegram или прямо в WebApp:
  - AI автоматически распознает фразы вида *«каждый день пить воду, купить продукты до вечера и цель выучить английский до конца года»*.
  - Разделит поток речи на задачи, проставит категории и даты, и предложит сохранить их в один клик.

### 4. 🖤 Премиальный Telegram Mini App (WebApp)
- **Строгий монохромный дизайн**: тёмно-графитовая эстетика (`#0d0d0d`), высококонтрастные карточки, титаново-белые акценты.
- **Сбалансированная навигация**: парящий док из 3 симметричных вкладок (**Сегодня**, **Цели**, **Настройки**).
- **Плавающая кнопка быстрого добавления (FAB)**: эргономичная кнопка `(+)` под большой палец.
- **Сдержанная анимация записи**: 4-полосный мягкий индикатор волны звука и таймер.
- **Тактильный отклик (Haptic Feedback)**: виброотклик Telegram при каждом клике, чекбоксе и переключении вкладок.

---

## 🚀 Быстрый старт (Локально)

### 1. Клонирование репозитория
```bash
git clone https://github.com/Artstrel/TaskerBot.git
cd TaskerBot
```

### 2. Установка зависимостей бэкенда
```bash
# Создание и активация виртуального окружения
python3 -m venv .venv
source .venv/bin/activate

# Установка библиотек
pip install -r requirements.txt
```

### 3. Сборка фронтенда WebApp
```bash
cd frontend
npm install
npm run build
cd ..
```
*Собранный SPA-бандл автоматически помещается в `frontend/dist` и раздается сервером FastAPI.*

### 4. Настройка переменных окружения
Скопируйте шаблон конфигурации:
```bash
cp .env.example .env
```
Заполните параметры в `.env`:
```env
BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz   # От @BotFather в Telegram
GROQ_API_KEY=gsk_...                              # Бесплатно на console.groq.com
GEMINI_API_KEY=...                                # Бесплатно на aistudio.google.com
DATABASE_URL=sqlite+aiosqlite:///./data/taskerbot.db
WEBAPP_URL=https://your-tunnel.ngrok-free.app     # Ссылка на Mini App (см. ниже)
```

### 5. Запуск
```bash
python main.py
```
Сервер запустит FastAPI API, фоновый планировщик задач APScheduler, Telegram-бота и раздачу WebApp на порту `8000`.

---

## 🐳 Запуск через Docker & Docker Compose

Проект готов к деплою в один клик через Docker:

```bash
# 1. Создайте .env и укажите ключи
cp .env.example .env
nano .env

# 2. Запустите контейнер
docker compose up -d --build
```

База данных SQLite сохраняется на хосте в смонтированной директории `./data`, поэтому при перезапуске контейнера все задачи и пользователи сохраняются.

Остановка контейнера:
```bash
docker compose down
```

---

## 🌐 Подключение WebApp в Telegram

Telegram требует, чтобы WebApp открывался по безопасному протоколу `https://`. Для локальной разработки или тестирования используйте **ngrok** или **Cloudflare Tunnel**:

### Через ngrok:
```bash
ngrok http 8000
```
1. Скопируйте полученный адрес (например, `https://abc-123.ngrok-free.app`).
2. Укажите его в `.env`:
   ```env
   WEBAPP_URL=https://abc-123.ngrok-free.app
   ```
3. Откройте диалог с [@BotFather](https://t.me/BotFather):
   - Отправьте команду `/mybots` -> выберите вашего бота.
   - Перейдите в **Bot Settings** -> **Menu Button** -> **Configure menu button**.
   - Отправьте адрес: `https://abc-123.ngrok-free.app`.
   - Теперь у всех пользователей слева от поля ввода появится кнопка открытия Mini App.

---

## 🚀 Деплой через GitHub

Репозиторий полностью настроен для автоматической сборки и деплоя через GitHub:

### Вариант 1. Автоматический деплой на GitHub Pages (Frontend)
В репозиторий добавлен workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).
1. Перейдите в ваш репозиторий на GitHub: **Settings** -> **Pages**.
2. В секции **Build and deployment** выберите:
   * **Source**: `GitHub Actions`.
3. При каждом коммите в ветку `main` фронтенд будет автоматически собираться и публиковаться по адресу:  
   👉 `https://artstrel.github.io/TaskerBot/`

### Вариант 2. Полный деплой Бэкенда + Бота в Render.com (1 клик из GitHub)
Для круглосуточной работы бота и API в репозиторий добавлен файл [render.yaml](render.yaml):
1. Зарегистрируйтесь на [Render.com](https://render.com/) через GitHub.
2. Нажмите **New +** -> **Blueprint**.
3. Выберите ваш репозиторий `TaskerBot`.
4. Укажите ваши секретные ключи (`BOT_TOKEN`, `GROQ_API_KEY`, `GEMINI_API_KEY`) в мастере настройки.
5. Render автоматически соберёт `Dockerfile`, смонтирует диск для базы данных SQLite и выдаст постоянный HTTPS-домен (например, `https://taskerbot.onrender.com`), который можно сразу указать в меню бота через @BotFather!

## 📂 Архитектура и структура файлов

```
TaskerBot/
├── backend/
│   ├── api/
│   │   └── routes.py         # REST API эндпоинты (дашборд, задачи, цели, настройки)
│   ├── bot/
│   │   ├── bot_instance.py   # Инициализация Aiogram бота и диспетчера
│   │   ├── handlers.py       # Обработчики команд, кнопок и голосовых сообщений
│   │   └── keyboards.py      # Клавиатуры чата и инлайн-кнопки
│   ├── ai_service.py         # Мульти-провайдерная интеграция (Groq Whisper + Gemini)
│   ├── config.py             # Pydantic Settings и пути проекта
│   ├── crud.py               # Запросы к SQLite, расчет стриков и переносы просрочек
│   ├── database.py           # Асинхронная сессия SQLAlchemy (aiosqlite)
│   ├── models.py             # Схема БД: User, RoutineTask, RoutineLog, Goal, OneTimeTask
│   ├── schemas.py            # Pydantic DTO модели
│   └── scheduler.py          # APScheduler: напоминания за 6/3/1ч, утренний дайджест
├── frontend/                 # Telegram WebApp (React 18 + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── TodayTab.jsx        # Экран «Сегодня»: просрочки, привычки, задачи
│   │   │   ├── GoalsTab.jsx        # Экран «Цели»: проекты, прогресс-бары, чеклисты
│   │   │   ├── SettingsTab.jsx     # Экран «Настройки»: таймзона, время отбоя, напоминания
│   │   │   ├── QuickAddModal.jsx   # Модальное окно: голосовая запись + умный AI ввод
│   │   │   └── Mascot.jsx          # Цифровой маскот-напарник с реакциями
│   │   ├── api.js            # Axios-клиент и обёртка Telegram Haptic Feedback
│   │   ├── App.jsx           # Навигация, плавающий FAB и переключение вкладок
│   │   └── index.css         # Монохромная дизайн-система (ч/б палитра, анимации)
│   └── dist/                 # Скомпилированный продакшн-бандл фронтенда
├── data/                     # Директория SQLite БД (taskerbot.db)
├── Dockerfile                # Multi-stage сборка (Node build + Python runtime)
├── docker-compose.yml        # Конфигурация запуска с persistent volume
├── main.py                   # Единая точка входа: FastAPI + Bot + WebApp
├── requirements.txt          # Python зависимости
├── .env.example              # Шаблон настроек окружения
├── .gitignore                # Защита секретов и БД от попадания в коммиты
└── README.md
```

---

## 🔒 Безопасность и Git

> [!IMPORTANT]
> - Файл `.env` и локальная база данных `data/*.db` исключены из Git в [.gitignore](file:///.gitignore).
> - Никогда не публикуйте и не коммитьте боевые ключи (`BOT_TOKEN`, `GROQ_API_KEY`, `GEMINI_API_KEY`).
> - Для конфигурации нового окружения всегда используйте копирование из `.env.example`.

---

## 📄 Лицензия

MIT License. Свободно для личного и коммерческого использования.
