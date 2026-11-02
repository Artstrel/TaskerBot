# Context — TaskerBot "Before Leaving" Mode

## Project Overview
TaskerBot is a Telegram WebApp / Web-based task and routine tracking application.
- Workspace: `/Users/artstrelani/Documents/TaskerBot`
- Integrity Mode: development
- Requirements Source: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`

## Architecture Targets
1. Backend: Python FastAPI / SQLAlchemy / SQLite or PostgreSQL / Pydantic.
2. Frontend: React / Vite / Tailwind CSS / Telegram WebApp SDK integration.
3. Testing: Pytest for backend tests (`tests/`), Vitest / Jest / Playwright for frontend.

## Key Feature Requirements
1. **R1: Pre-departure template configuration**
   - CRUD interface (modal or screen) for items and tasks in "Before Leaving" mode.
   - Persistence in backend DB via API across sessions.
2. **R2: Active "Before Leaving" blocking mode**
   - Checklist with checkboxes based on template.
   - Fullscreen blocking overlay hiding/disabling main navigation, preventing tab switching or dismissal until all checkboxes are checked.
   - Sync of checklist progress state with backend DB.
   - Unlocks automatically or allows standard exit once all items are checked.
3. **R3: Adaptive launch button**
   - Telegram WebApp on iOS: inside profile bubble context menu.
   - All other devices and breakpoints: on the same horizontal line (level) as the profile bubble.
4. **Verification & Regression**
   - Automated tests: backend API tests and frontend component/E2E tests.
   - Zero regression in existing test suites.
