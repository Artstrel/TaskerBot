# Investigation Report: Test Infrastructure, Regression Baseline & "Before Leaving" Mode Test Plan

**Agent**: Survey Explorer 3 (Test & Infrastructure Specialist)  
**Date**: 2026-11-02  
**Working Directory**: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/survey_explorer_3`  
**Target Codebase**: `/Users/artstrelani/Documents/TaskerBot`  

---

## 1. Observation

### 1.1 Backend Test Infrastructure & Existing Suites
[Documented]
- **Test Directory**: `/Users/artstrelani/Documents/TaskerBot/tests/`
- **File Inventory**:
  1. `tests/test_numeric_tasks_persistence.py` (42,047 bytes, 1,041 lines, 22 test cases)
  2. `tests/test_numeric_challenge_stress.py` (32,517 bytes, 804 lines, 13 test cases)
  3. `tests/test_non_numeric_regressions_stress.py` (40,239 bytes, 929 lines, 17 test cases)
- **Pytest Configuration**:
  - `tests/conftest.py`: **ABSENT** (`ls tests/conftest.py` returned `No such file or directory`).
  - `pytest.ini` / `pyproject.toml` / `setup.cfg`: **ABSENT** at project root and within `tests/`.
  - Python Environment: Python 3.9.6 within `.venv/bin/python3`.
  - Pytest Version: `pytest 8.4.2` with active plugins `anyio-4.12.1`, `asyncio-1.2.0`.
- **Harness Isolation Mechanism** (`tests/test_numeric_tasks_persistence.py:37-80`):
  - Each file defines a standalone fixture (`test_env` or `challenge_env`).
  - Provisions an isolated SQLite database via `tempfile.mkdtemp(prefix="tasker_test_")`.
  - Connects using `create_async_engine(f"sqlite+aiosqlite:///{db_path}")`.
  - Creates clean schema on setup: `await conn.run_sync(Base.metadata.create_all)`.
  - Overrides FastAPI dependency: `app.dependency_overrides[get_db] = override_get_db`.
  - Exercises endpoints via `httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")`.
  - On teardown: `app.dependency_overrides.clear()`, `await engine.dispose()`, and `shutil.rmtree(temp_dir, ignore_errors=True)`.
  - Zero external network access or Supabase dependency during test execution.
- **Authentication Bypass in Tests**:
  - `backend/api/routes.py:102-150` (`get_current_user`) allows authentication via query parameter `?telegram_id={user_id}` when bearer token and init data are not provided.
  - Tests utilize synthetic Telegram IDs (e.g., `10001`, `20001`, `30001`, `40001`) to maintain multi-tenant isolation.
- **Current Execution Baseline**:
  - Command: `.venv/bin/pytest tests/ -v`
  - Output: `52 passed, 6 warnings in 5.04s` (100% pass rate).
  - Breakdown:
    - `test_non_numeric_regressions_stress.py`: 17 passed (~1.8s)
    - `test_numeric_challenge_stress.py`: 13 passed (~1.5s)
    - `test_numeric_tasks_persistence.py`: 22 passed (~2.7s)
  - Warnings: 6 deprecation warnings from Pydantic V2 (`PydanticDeprecatedSince20: Support for class-based config is deprecated, use ConfigDict instead`).

---

### 1.2 Frontend Test Tooling & Verification Assets
[Documented]
- **File**: `frontend/package.json`
- **Scripts**:
  ```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  }
  ```
- **Dependencies**:
  - `react`: `^19.3.1`, `react-dom`: `^19.3.1`
  - `motion`: `^14.6.0`, `lucide-react`: `^1.61.0`
  - `@fontsource/inter`: `^5.3.0`, `@fontsource/outfit`: `^5.3.0`
- **DevDependencies**:
  - `@types/react`: `^19.3.0`, `@types/react-dom`: `^19.3.0`
  - `@vitejs/plugin-react`: `^6.1.2`, `oxlint`: `^1.88.0`, `vite`: `^8.3.4`
- **Automated Frontend Test Harness**: **COMPLETELY ABSENT**.
  - No `test` npm script.
  - No testing framework installed: `vitest`, `jest`, `playwright`, `cypress`, `@testing-library/react` are absent.
  - 0 test files in `frontend/` (pattern searches for `*test*` and `*spec*` returned zero results).
- **Frontend Code Verification Commands**:
  - Linting: `cd frontend && npm run lint` (`oxlint` executes in 120ms; 0 errors, 171 warnings).
  - Build: `cd frontend && npm run build` (`vite build` executes in 306ms; exits code 0, outputs `dist/`).

---

### 1.3 CI/CD Workflow Audit
[Documented]
- **File**: `.github/workflows/ci.yml` (lines 9–40)
- **Current CI Steps**:
  1. `pip install -r requirements.txt` (Note: `pytest` and `pytest-asyncio` are NOT in `requirements.txt`).
  2. `npm --prefix frontend ci`
  3. `npm --prefix frontend run build`
  4. `python -m py_compile main.py backend/*.py backend/*/*.py`
- **Critical Finding**: Pytest test suites (`tests/`) are **NOT executed in GitHub Actions CI**. Tests currently run only manually in local developer environments.

---

### 1.4 Architectural Integration Points for "Before Leaving" Mode
[Documented]
- **Requirements Boundary** (`ORIGINAL_REQUEST.md`):
  - **R1 (Template Configuration)**: CRUD interface for items/tasks to check before leaving; persistent DB storage.
  - **R2 (Blocking Checklist Mode)**: Interactive checklist; full-screen blocking overlay hiding main navigation; cannot exit/navigate until all items checked; state saved in DB.
  - **R3 (Adaptive Button Placement)**:
    - iOS Telegram WebApp: inside context menu of profile bubble (`header-profile-bubble`).
    - All other devices & breakpoints: inline at the same level as profile bubble.
- **Frontend Layout Locations** (`frontend/src/App.jsx`):
  - Desktop Sidebar Profile Bubble: line 616 (`<button className="header-profile-bubble">`).
  - Mobile Sticky Header Profile Bubble: line 765 (`<button className="header-profile-bubble">`).
  - Mobile Floating Navigation Dock: line 905 (`<nav className="bottom-dock mobile-only-dock">`).
  - Desktop Sidebar Navigation: line 660+ (`<div className="sidebar-nav">`).
  - iOS Platform Detection (`App.jsx:235-239`):
    ```javascript
    const isIOS =
      tg.platform === 'ios' ||
      /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    ```
  - Background Polling Loop (`App.jsx:436-443`): 18-second periodic loop calling `loadData(false, true)`.

---

## 2. Logic Chain

1. **Premise 1 (Existing Test Robustness)**: The backend test infrastructure in `tests/` executes an end-to-end ASGI test suite against FastAPI using SQLite + aiosqlite in under 5.1 seconds with 100% deterministic isolation and zero external dependencies.
2. **Premise 2 (Zero Regression Requirement)**: Per `ORIGINAL_REQUEST.md` Acceptance Criteria, the existing 52-test suite (`test_numeric_tasks_persistence.py`, `test_numeric_challenge_stress.py`, `test_non_numeric_regressions_stress.py`) must pass with 0 failures after all new code is introduced.
3. **Premise 3 (Fixture Architecture Refactoring vs Isolation)**: Because `tests/conftest.py` is absent, each existing test file manages its own fixture lifecycle. Creating `tests/test_before_leaving_mode.py` following the established `test_env` pattern ensures self-contained execution without breaking existing test runners. However, introducing a global `tests/conftest.py` will eliminate 150+ lines of duplicate fixture boilerplate.
4. **Premise 4 (Frontend Testing Gap)**: Because `frontend/` contains zero automated tests and lacks test frameworks, UI regressions (such as navigation leaks during active blocking mode or misplacement of the trigger button on non-iOS vs iOS) cannot be validated via `npm test` today.
5. **Deduction (Comprehensive Strategy)**:
   - Backend API contracts, database persistence, session state transitions, and concurrency MUST be verified through a new dedicated 4-tier test suite: `tests/test_before_leaving_mode.py`.
   - Frontend verification must be standardized by introducing a lightweight component testing suite (Vitest + Testing Library) or simulated E2E contract tests.
   - The 52 existing backend tests constitute the non-negotiable regression safety net.

---

## 3. Caveats

1. [Empirical] **Pytest in CI**: Since `pytest` is not invoked in `.github/workflows/ci.yml` and `pytest` / `pytest-asyncio` are missing from `requirements.txt`, developers relying solely on GitHub Actions will not be notified of backend regression failures unless CI is updated.
2. [Documented] **SQLite Dialect Parity**: Tests use `aiosqlite` with SQLite, whereas production uses Supabase PostgreSQL (`asyncpg`). Schema migrations in `backend/database.py` must support both dialects (e.g., table creation and column addition).
3. [Empirical] **Telegram Client Mocking**: In testing frontend adaptive button placement (iOS context menu vs Desktop inline button), `window.Telegram.WebApp` and `navigator.userAgent` must be mocked deterministically to simulate both iOS and non-iOS runtime environments.

---

## 4. Conclusion & 4-Tier Test Plan

### 4.1 Backend Architecture Recommendations
To satisfy R1 and R2, the backend requires two database models in `backend/models.py`:
1. `BeforeLeavingTemplateItem`:
   - `id`: Integer PK
   - `user_id`: BigInteger FK (users.telegram_id, ondelete CASCADE)
   - `title`: String(500)
   - `order_index`: Integer default 0
   - `created_at`: DateTime
2. `BeforeLeavingSession`:
   - `id`: Integer PK
   - `user_id`: BigInteger FK (users.telegram_id, ondelete CASCADE)
   - `is_active`: Boolean default True
   - `started_at`: DateTime
   - `completed_at`: Optional DateTime
   - Relationship to `BeforeLeavingSessionItem`:
     - `id`: Integer PK
     - `session_id`: Integer FK (before_leaving_sessions.id, ondelete CASCADE)
     - `title`: String(500)
     - `is_completed`: Boolean default False
     - `completed_at`: Optional DateTime
     - `order_index`: Integer default 0

---

### 4.2 Comprehensive 4-Tier Test Plan: "Before Leaving" Mode

```
+---------------------------------------------------------------------------------------+
|                                4-TIER TEST SPECIFICATION                              |
+---------------------------------------------------------------------------------------+
|  Tier 1: Feature Coverage (Contracts & Happy Path)                                    |
|  Tier 2: Boundary & Corner Cases (Extreme, Zero, Concurrency, Re-lock)                 |
|  Tier 3: Cross-Feature Combinations (Polling Sync, Routines/Tasks Isolation, Midnight)|
|  Tier 4: Real-World Workload & Full User Journeys (iOS vs Desktop, App Crash Recovery)|
+---------------------------------------------------------------------------------------+
```

#### Tier 1: Feature Coverage (CRUD, State Machine & Placement)
- **Class**: `TestTier1BeforeLeavingFeatureCoverage`
- **Test Cases**:
  1. `test_template_crud_lifecycle`:
     - Create template items via `POST /api/before-leaving/template/items` (`"Выключить утюг"`, `"Взять ключи"`, `"Закрыть окна"`).
     - Query `GET /api/before-leaving/template`, assert correct titles, IDs, and order.
     - Update item title via `PATCH /api/before-leaving/template/items/{id}`.
     - Delete item via `DELETE /api/before-leaving/template/items/{id}` and assert list reflects deletion.
  2. `test_template_persistence_across_sessions`:
     - Populate template for User `50001`.
     - Re-instantiate DB session or query from isolated client request; verify all template items remain strictly persisted.
  3. `test_start_active_mode_session`:
     - With template items configured, call `POST /api/before-leaving/session/start`.
     - Verify response returns `session_id`, `is_active=True`, `is_unlocked=False`, and snapshot of checklist items with `is_completed=False`.
     - Verify `GET /api/before-leaving/session/current` reflects active session.
  4. `test_checklist_item_toggle_progress`:
     - Toggle item 1: `PATCH /api/before-leaving/session/items/{item_id}/toggle?completed=true`.
     - Assert item becomes `is_completed=True`, session remaining `is_active=True`, `is_unlocked=False`.
  5. `test_complete_all_items_unlocks_mode`:
     - Toggle all items in session to `is_completed=True`.
     - Assert session state transitions to `is_unlocked=True` and `is_active=False` (or completed status allowing exit).
     - Verify completion timestamp is recorded.
  6. `test_adaptive_button_placement_contract`:
     - Contract validation: endpoint or frontend property verification ensuring client knows layout rules:
       - iOS platform -> profile bubble popover menu action.
       - Non-iOS platform -> inline button adjacent to profile bubble.

---

#### Tier 2: Boundary & Corner Cases
- **Class**: `TestTier2BeforeLeavingBoundaries`
- **Test Cases**:
  1. `test_start_session_with_empty_template`:
     - Attempt `POST /api/before-leaving/session/start` when user has 0 template items.
     - Verify API returns `400 Bad Request` with descriptive message (`"Шаблон пуст. Настройте список перед запуском"`).
  2. `test_single_item_template_lifecycle`:
     - Template with exactly 1 item (`"Взять телефон"`).
     - Start session -> 1 unchecked item (`is_unlocked=False`).
     - Check single item -> immediately becomes `is_unlocked=True`.
  3. `test_large_checklist_stress_50_items`:
     - Template with 50 distinct items.
     - Session instantiation clones all 50 items with ordered indices.
     - Batch progress updates; assert database latency < 50ms and zero payload truncation.
  4. `test_rapid_concurrent_checklist_item_toggles`:
     - Concurrently send 10 asynchronous requests toggling items in an active session (`asyncio.gather`).
     - Assert zero `500 Internal Server Error`, zero `MultipleResultsFound`, and exact completion count rollup.
  5. `test_unchecking_item_re_locks_interface`:
     - All 3 items checked -> session reaches `is_unlocked=True`.
     - User unchecks 1 item -> session status reverts to `is_unlocked=False`!
     - Verifies UI blocking cannot be bypassed if any item is unchecked.
  6. `test_duplicate_item_titles_handling`:
     - Template contains identical titles (e.g., `"Проверить свет"` for kitchen and bedroom).
     - Verify distinct item IDs prevent collision during toggle operations.
  7. `test_unicode_and_emoji_titles_persistence`:
     - Items with emojis (`"🔑 Ключи"`, `"🔌 Утюг"`, `"🪟 Окна"`, `"💊 Витамины"`) and special characters.
     - Assert exact string encoding and zero normalization corruption.

---

#### Tier 3: Cross-Feature Combinations
- **Class**: `TestTier3BeforeLeavingCrossFeature`
- **Test Cases**:
  1. `test_active_session_resilience_to_18s_background_polling`:
     - Start "Before Leaving" mode, complete 2 of 4 items.
     - Simulate multiple 18s dashboard background polling requests (`GET /api/dashboard/today`).
     - Assert dashboard response is valid AND active session remains intact without item reset.
  2. `test_routines_and_tasks_independence`:
     - Verify that toggling items in "Before Leaving" session does NOT inadvertently affect routine streaks, one-time task completion, or daily counters in `DaySummary`.
  3. `test_tenant_isolation_between_distinct_users`:
     - User A (`60001`) starts session with 3 items.
     - User B (`60002`) queries `GET /api/before-leaving/session/current`.
     - Assert User B receives `null` / no active session; User B cannot read or toggle User A's items.
  4. `test_midnight_day_rollover_during_active_mode`:
     - User activates mode at 23:58.
     - Scheduler executes midnight rollover (`check_user_reminders_and_rollover`).
     - Assert active session is not corrupted or prematurely terminated by day rollover.
  5. `test_template_modification_does_not_mutate_active_session`:
     - Start session with items A, B.
     - While session is active, user edits template (adds C, deletes A).
     - Assert active session retains snapshot items A, B until current session is finished.

---

#### Tier 4: Real-World Workload & User Journeys
- **Class**: `TestTier4BeforeLeavingRealWorldWorkload`
- **Test Cases**:
  1. `test_app_restart_crash_recovery_journey`:
     - User starts "Before Leaving" session and checks 2 items.
     - Client app crashes / page refreshed / Telegram Mini App closed and reopened.
     - Initial app boot queries `GET /api/before-leaving/session/current`.
     - Active session is returned; frontend immediately restores fullscreen blocking view with the 2 checked items preserved. User cannot bypass checklist via refresh.
  2. `test_full_journey_ios_simulation`:
     - Simulated client headers/init-data for iOS Telegram WebApp.
     - Verification that profile bubble context menu trigger initiates session.
     - Sequential completion of items -> unlock -> session finalization via `POST /api/before-leaving/session/finish`.
  3. `test_full_journey_desktop_simulation`:
     - Simulated desktop client width / headers.
     - Verification that inline button initiates session.
     - Navigation locked during session -> full completion -> exit.

---

### 4.3 Recommended Frontend Test Setup (Vitest + Testing Library)
To resolve the frontend test void, the following minimal setup should be added:
1. **Packages to install**:
   ```bash
   cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. **Add Script to `frontend/package.json`**:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```
3. **Frontend Test Suite**: `frontend/src/components/__tests__/BeforeLeaving.test.jsx`
   - Test 1: `renders inline button on Desktop and non-iOS WebApp`.
   - Test 2: `hides inline button and attaches to profile bubble context menu on iOS`.
   - Test 3: `entering Before Leaving mode renders full-screen blocking overlay`.
   - Test 4: `dock navigation is hidden/disabled while checklist has unchecked items`.
   - Test 5: `unlock animation and exit button appear only when all items are checked`.

---

## 5. Verification Method

### 5.1 Verification Commands

1. **Verify Baseline Tests (Zero Regressions)**:
   ```bash
   .venv/bin/pytest tests/ -v
   ```
   *Expected Result*: Exactly 52 tests collected, 52 passed, 0 failures.

2. **Verify New "Before Leaving" Test Suite**:
   ```bash
   .venv/bin/pytest tests/test_before_leaving_mode.py -v
   ```
   *Expected Result*: All 4 tiers (18+ new tests) pass with 100% success rate.

3. **Verify Combined Full Regression Suite**:
   ```bash
   .venv/bin/pytest tests/ -v --tb=short
   ```
   *Expected Result*: 70+ passed, 0 failed, 0 errors.

4. **Verify Frontend Build & Linter**:
   ```bash
   cd /Users/artstrelani/Documents/TaskerBot/frontend
   npm run lint
   npm run build
   ```
   *Expected Result*: `oxlint` reports 0 errors; `vite build` completes with exit code 0.

5. **Verify Python Syntax**:
   ```bash
   python3 -m py_compile main.py backend/*.py backend/*/*.py tests/*.py
   ```
   *Expected Result*: Clean compile with exit code 0.

---

### 5.2 Invalidation Conditions
The test plan and implementation will be considered invalidated if:
1. Any of the existing 52 tests in `test_numeric_tasks_persistence.py`, `test_numeric_challenge_stress.py`, or `test_non_numeric_regressions_stress.py` fail.
2. Background 18-second polling resets or unmounts the active "Before Leaving" checklist.
3. An active session can be closed or bypassed without checking all items (e.g., via page reload or browser back navigation).
4. On iOS Telegram WebApp, the button appears inline instead of in the profile bubble context menu, or vice versa on Desktop.
