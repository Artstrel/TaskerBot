## 2026-10-30T09:40:23Z

This is a single self-contained fix; keep it small and focused.
Fix intermittent white/light status bar and bottom toolbar background artifacts in iOS Safari and WebApp under dark theme, ensuring seamless dark background matching Photo 3.

Working directory: /Users/artstrelani/Documents/TaskerBot/frontend
Integrity mode: development

## Requirements

### R1. Устранение белых полос системного хрома в Safari на iOS
Обеспечить корректное отображение системного хрома в темной теме оформления (`#0d0d0d`): верхняя область статус-бара (safe area за часами и индикаторами) и нижняя область панели Safari (toolbar / home indicator safe area) должны бесшовно совпадать по цвету с фоном страницы, устраняя белые артефакты (зафиксированные на фото 1 и фото 2) и соответствуя эталону на фото 3.

### R2. Предотвращение рендеринга светлого холста до исполнения JavaScript
Исключить зависимость цвета системных панелей от позднего выполнения клиентского JS. На уровне статического HTML (`index.html`) и базового CSS (`index.css`) гарантировать явное объявление цветовой схемы (`<meta name="color-scheme" content="dark light">`, метатегов `<meta name="theme-color">` с медиа-запросами и CSS `color-scheme: dark` на `:root`), а также корректное наследование фона `html`, `body` и контейнера `#root` без зазоров при оверскролле и инициализации.

### R3. Сохранение функциональности PWA, Telegram WebApp и светлой темы
Все изменения не должны нарушать работу светлой темы, динамическое переключение тем в `src/theme.js`, полноэкранный режим в Telegram WebApp (`is-tg-fullscreen`), а также поведение на Android и десктопных браузерах.

## Acceptance Criteria

### Системный хром и разметка
- [ ] В `index.html` присутствует метатег `<meta name="color-scheme" content="dark light">`.
- [ ] В `index.html` определены декларативные метатегов `<meta name="theme-color">` для темного (`#0d0d0d`) и светлого режимов с медиавыражениями `(prefers-color-scheme: ...)`.
- [ ] Свойства фона `html`, `body`, `#root` и правила `safe-area-inset-*` в `src/index.css` согласованы и не вызывают появления белых полос при замере цвета движком WebKit.

### Сборка и верификация
- [ ] Команда `npm run build` в директории `frontend/` выполняется успешно без ошибок компиляции и типов.
- [ ] Устранены условия возникновения белых полос в Safari/WebKit при холодном старте и навигации (соответствие целевому виду на фото 3).
- [ ] Решение готово к финальной проверке на физическом iOS-устройстве пользователя после сборки.

---
Metadata:
Working directory for agent: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/swe_1/
Workspace root: /Users/artstrelani/Documents/TaskerBot
Frontend directory: /Users/artstrelani/Documents/TaskerBot/frontend
ORIGINAL_REQUEST.md path: /Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md
Screenshots:
- Photo 1 (bug): /Users/artstrelani/.gemini/antigravity/brain/82f633b8-3e08-408e-b2e8-d696c1705c6b/.user_uploaded/media_1793350902617_d9e19e5e.jpg
- Photo 2 (bug): /Users/artstrelani/.gemini/antigravity/brain/82f633b8-3e08-408e-b2e8-d696c1705c6b/.user_uploaded/media_1793350904814_043f7b86.jpg
- Photo 3 (expected): /Users/artstrelani/.gemini/antigravity/brain/82f633b8-3e08-408e-b2e8-d696c1705c6b/.user_uploaded/media_1793350912073_714c59fa.jpg
