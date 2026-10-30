# Отчет об исследовании проблемы персистентности числовых задач (Survey & Root Cause Report)

## 1. Observation (Прямые наблюдения)

### 1.1. Модель данных и отсутствие ограничений целостности
В файле `backend/models.py` сущность `RoutineLog` (строки 91–105) определена следующим образом:
```python
class RoutineLog(Base):
    __tablename__ = "routine_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("routine_tasks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[dt_date] = mapped_column(Date, index=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    completed_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)
```
- В таблице `routine_logs` **отсутствует ограничение уникальности** (`UniqueConstraint("routine_id", "date")`) или составной первичный ключ по паре `(routine_id, date)`.
- В схеме базы данных `backend/database.py` (строки 52–76) в списке миграций также нет создания уникального индекса/констрейнта на `(routine_id, date)`.

### 1.2. Фактическое состояние базы данных (Supabase PostgreSQL)
Прямой запрос к рабочей базе данных показал наличие дублирующихся записей для активной рутины пользователя `1069647428` ("Выпить 2 литра воды 💧", `target_value=2.0`, `step=0.25`, `unit='л'`) на дату `2026-10-30`:
- **Дубликаты в `routine_logs`:**
  - `Log id=25, routine_id=3, date=2026-10-30, is_completed=False, completed_at=None, cur_val=0.25`
  - `Log id=26, routine_id=3, date=2026-10-30, is_completed=False, completed_at=None, cur_val=0.0`
- Запрос `SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1` вернул:
  `[(3, datetime.date(2026, 10, 30), 2)]`.

### 1.3. Сбой выборки одиночной записи в CRUD-слое
В файле `backend/crud.py` во всех функциях манипуляции состоянием рутины используется метод `scalar_one_or_none()`:
- `update_routine_progress` (строки 456–460):
  ```python
  log_stmt = select(RoutineLog).where(
      and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
  )
  log_res = await session.execute(log_stmt)
  log = log_res.scalar_one_or_none()
  ```
- `toggle_routine_completion` (строки 391–395):
  ```python
  log_stmt = select(RoutineLog).where(
      and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
  )
  log_res = await session.execute(log_stmt)
  log = log_res.scalar_one_or_none()
  ```
- `update_routine` (строки 334–338):
  ```python
  log_stmt = select(RoutineLog).where(
      and_(RoutineLog.routine_id == routine_id, RoutineLog.date == target_date)
  )
  log_res = await session.execute(log_stmt)
  log = log_res.scalar_one_or_none()
  ```

При выполнении тестового HTTP-запроса `PATCH /api/routines/3/progress?telegram_id=1069647428` с телом `{"current_value": 0.5, "delta": 0.25}` воспроизведено фатальное исключение:
```
sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
  File "backend/api/routes.py", line 570, in update_routine_progress_endpoint
  File "backend/crud.py", line 460, in update_routine_progress
    log = log_res.scalar_one_or_none()
```
Запрос падает с кодом **HTTP 500 Internal Server Error**, и транзакция отката прерывает сохранение любого нового значения.

### 1.4. Пакетная вычитка статуса рутин
В `backend/crud.py` в функции `get_user_routines_with_status` (строки 356–372):
```python
    routine_ids = [r.id for r in routines]
    logs_by_routine_id = {}
    if routine_ids:
        log_stmt = select(RoutineLog).where(
            and_(RoutineLog.routine_id.in_(routine_ids), RoutineLog.date == target_date)
        )
        log_res = await session.execute(log_stmt)
        for log in log_res.scalars().all():
            logs_by_routine_id[log.routine_id] = log
```
При наличии двух записей (id=25 с `0.25` и id=26 с `0.0`) итерация по не отсортированному списку перезаписывает `logs_by_routine_id[3]` записью с бóльшим id (`log id=26`), возвращая на фронтенд статус `current_value: 0.0`.

### 1.5. Подавление ошибок и оптимистичный тайм-аут во фронтенде
В `frontend/src/api.js` функция `updateRoutineProgress` (строки 1807–1846):
```javascript
export const updateRoutineProgress = async (routineId, { current_value, delta }) => {
  ...
  const mutationId = `progress_routine_${routineId}_${Date.now()}`;
  if (current_value !== undefined) {
    addPendingMutation({ id: mutationId, type: 'progress_routine', routineId, current_value, timestamp: Date.now() });
  }
  try {
    const res = await fetch(`${API_BASE}/routines/${routineId}/progress?telegram_id=${effectiveUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_value, delta }),
    });
    if (res.ok) {
      if (current_value !== undefined) removePendingMutation(mutationId);
      return await res.json();
    }
  } catch (e) {}

  if (current_value !== undefined) removePendingMutation(mutationId);
  const db = getLocalDb();
  ...
  return { id: routineId, current_value };
};
```
- При получении HTTP 500 блок `if (res.ok)` пропускается, исключение не выбрасывается (`catch (e) {}`).
- На строке 1828 безоговорочно вызывается `removePendingMutation(mutationId)`.
- В `removePendingMutation` (строки 856–875) удаленная мутация перемещается в `recentCompletedMutations` с TTL `RECENT_MUTATION_TTL = 5000` (5 секунд).

### 1.6. Фоновый опрос (Polling) и интервал сброса в 30–40 секунд
В `frontend/src/App.jsx` (строки 435–443):
```javascript
    // Background polling every 18 seconds while document is visible
    const pollInterval = setInterval(() => {
      if (isQuickAddOpenRef.current) return;
      if (Date.now() - getLastUserActionTime() < 4000) return;
      if (hasActivePendingMutations()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadData(false, true);
      }
    }, 18000);
```
- Фоновый поллинг запускается каждые 18 секунд.
- При действии пользователя ставится задержка в 4 секунды (`getLastUserActionTime() < 4000`).
- Оптимистичная мутация держится в памяти ровно 5 секунд (`RECENT_MUTATION_TTL`).
- Следующий цикл поллинга (через 18–36 секунд) вызывает `loadData(false, true)` -> `GET /api/dashboard/today`.
- Бэкенд возвращает `current_value: 0.0`.
- Реактивное состояние заменяется данными с сервера. Суммарное время от клика пользователя до сброса визуального индикатора составляет ровно **30–40 секунд**.

---

## 2. Logic Chain (Логическая цепочка дефекта)

1. **Создание и фиксация числительной задачи:**
   Пользователь создает задачу/рутину с целевым числовым показателем (например, "Выпить 2 литра воды", `target_value=2.0`, `step=0.25`, `unit='л'`). Запись `RoutineTask` успешно сохраняется в БД.
2. **Инкремент значения пользователем:**
   В интерфейсе пользователь нажимает `+` (шаг +0.25).
   - В `TodayTab.jsx` оптимистично пересчитывается `computedNextVal = 0.25`.
   - Вызывается `updateRoutineProgress(routineId, { current_value: 0.25, delta: 0.25 })`.
3. **Гонка запросов и возникновение дубликата:**
   Поскольку в таблице `routine_logs` отсутствует `UniqueConstraint("routine_id", "date")`, при быстрых повторных кликах, параллельных запросах или переключении чекбокса одновременно со степпером два асинхронных вызова не видят существующую запись в `select(RoutineLog)` и оба выполняют `session.add(RoutineLog(...))`. В базу попадает запись №25 (`cur_val=0.25`) и запись №26 (`cur_val=0.0`).
4. **Необрабатываемый крэш CRUD-слоя:**
   Любой последующий вызов `update_routine_progress` пытается выполнить `scalar_one_or_none()` по фильтру `(routine_id, date)`. Наличие двух строк вызывает `sqlalchemy.exc.MultipleResultsFound`, приводя к `HTTP 500`. Новое значение в базу **не коммитится**.
5. **Маскировка ошибки во фронтенде:**
   `updateRoutineProgress` подавляет HTTP 500 в пустом `catch (e) {}`, не пробрасывает ошибку в вызывающий компонент и переводит мутацию в статус "завершенной" с TTL 5 секунд.
6. **Сброс до нуля через 30–40 секунд:**
   Таймер `pollInterval` в `App.jsx` срабатывает каждые 18 секунд. По истечении 4 секунд неактивности и 5 секунд TTL мутации `loadData` запрашивает `/api/dashboard/today`. Бэкенд через `get_user_routines_with_status` читает последнюю запись дубликата (id=26 со значением `0.0`) и отдает `0.0`. Интерфейс перезаписывает оптимистичное значение, возвращая индикатор в `0.0`.

---

## 3. Caveats (Ограничения и нюансы)

1. **Разовые задачи (`one_time_tasks`):**
   В отличие от `routine_tasks`, сущность `OneTimeTask` хранит `current_value` прямо в своей таблице, без связки с `RoutineLog`. Поэтому на разовых задачах ошибка `MultipleResultsFound` не возникает. Однако если `updateTaskProgress` завершается сетевым сбоем или 404, подавление ошибки в `api.js` ведет к аналогичному сбросу через 30–40 секунд.
2. **Синхронизация Telegram Bot Callback Handlers:**
   В `backend/bot/handlers.py` обработчик `cb_routine_prog` (строки 829–866) также вызывает `update_routine_progress`. При наличии дубликата в `routine_logs` он падает с необработанным исключением в логах бота, и сообщение не обновляется.
3. **Миграции Supabase/PostgreSQL:**
   Для устранения дефекта потребуется не только исправление в коде `backend/crud.py`, но и очистка существующих дубликатов в рабочей БД перед созданием уникального ограничения `uq_routine_logs_routine_date`.

---

## 4. Conclusion (Итоговое заключение)

Корневая причина дефекта:
1. **Отсутствие уникального ограничения `UniqueConstraint("routine_id", "date")`** в таблице `routine_logs` (`backend/models.py`), что привело к физическому образованию дублирующихся записей на одну и ту же дату в базе данных.
2. **Небезопасное использование `scalar_one_or_none()`** в `backend/crud.py` (`update_routine_progress`, `toggle_routine_completion`, `update_routine`), которое при наличии дубликатов падает с `sqlalchemy.exc.MultipleResultsFound` и возвращает HTTP 500, блокируя персистентность.
3. **Безусловная перезапись статуса в `get_user_routines_with_status`** последней прочитанной строкой (которая оказалась с `cur_val=0.0`).
4. **Тихое подавление сетевых ошибок в `frontend/src/api.js`** (`updateRoutineProgress`), из-за чего оптимистичное значение удерживается в UI только в течение 5 секунд TTL, после чего штатный 18-секундный фоновый поллер `App.jsx` перезаписывает экран нулем из базы данных через 30–40 секунд.

Рекомендуемые действия для исполнителя:
- В `backend/models.py` добавить `__table_args__ = (UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date"),)`.
- В `backend/database.py` предусмотреть миграцию: удаление дубликатов из `routine_logs` с сохранением максимального `current_value` / `completed_at` и создание уникального индекса.
- В `backend/crud.py` заменить опасные `scalar_one_or_none()` на выборку с сортировкой (`order_by(desc(RoutineLog.id)).limit(1)` или корректную дедупликацию).
- В `frontend/src/api.js` не удалять оптимистичную мутацию и выводить алерт/откат при `!res.ok`.

---

## 5. Verification Method (Метод независимой верификации)

### Шаг 1. Проверка наличия дубликатов в рабочей базе
Выполнить команду в виртуальном окружении проекта:
```bash
.venv/bin/python -c "
import asyncio
from sqlalchemy import text
from backend.database import AsyncSessionLocal

async def check():
    async with AsyncSessionLocal() as session:
        res = await session.execute(text('SELECT routine_id, date, count(*) FROM routine_logs GROUP BY routine_id, date HAVING count(*) > 1;'))
        print('Duplicates:', res.fetchall())

asyncio.run(check())
"
```
*Критерий:* Наличие записей вида `[(3, datetime.date(2026, 10, 30), 2)]`.

### Шаг 2. Воспроизведение ошибки 500 при сохранении прогресса
Выполнить команду вызова API через ASGI Transport:
```bash
.venv/bin/python -c "
import asyncio
from httpx import AsyncClient, ASGITransport
from main import app

async def test():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as ac:
        resp = await ac.patch('/api/routines/3/progress?telegram_id=1069647428', json={'current_value': 0.5, 'delta': 0.25})
        print('Status code:', resp.status_code)

asyncio.run(test())
"
```
*Критерий:* Ошибка `sqlalchemy.exc.MultipleResultsFound` и код ответа 500.

### Шаг 3. Проверка фонового поллинга в кодовой базе фронтенда
Открыть файл `frontend/src/App.jsx` на строке 436 и убедиться в наличии таймера `setInterval(..., 18000)`, дергающего `loadData(false, true)` при неактивности пользователя более 4 секунд.
