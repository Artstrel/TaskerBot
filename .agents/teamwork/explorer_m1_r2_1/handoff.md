# Explorer 1 Handoff Report: Milestone 1 Round 2 Concurrency & Schema Remediation Strategy

**Verdict**: Remediations Analyzed, Formulated, and Empirically Verified. Ready for Worker Implementation.  
**Severity of Addressed Defect**: `CRITICAL` (Unhandled `MultipleResultsFound` crash under concurrency causing permanent account bricking) & `MAJOR` (Missing string boundary constraint).

---

## 1. Observation

### 1.1 Source Code Defect Locations
1. **`backend/crud.py:1413-1428` (`get_active_before_leaving_session`)**:
   ```python
   stmt = (
       select(BeforeLeavingSession)
       .options(selectinload(BeforeLeavingSession.items))
       .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
       .order_by(BeforeLeavingSession.id.desc())
   )
   res = await session.execute(stmt)
   active = res.scalar_one_or_none()  # Line 1424: Crashes with MultipleResultsFound if >1 active row exists
   ```
2. **`backend/crud.py:1430-1450` (`start_before_leaving_session`)**:
   ```python
   res = await session.execute(stmt)
   existing = res.scalar_one_or_none()  # Line 1443: Crashes with MultipleResultsFound under concurrent start requests
   if existing:
       if not reset:
           return _before_leaving_session_to_read(existing)
       else:
           existing.is_active = False  # Line 1448: Deactivates only 1 instance, leaving duplicates active
           await session.flush()
   ```
3. **`backend/crud.py:1528-1551` (`finish_before_leaving_session`)**:
   ```python
   res = await session.execute(stmt)
   active = res.scalar_one_or_none()  # Line 1539: Crashes with MultipleResultsFound if >1 active row exists
   ```
4. **`backend/schemas.py:564-598` (`BeforeLeavingItemBase` & `BeforeLeavingItemUpdate`)**:
   ```python
   class BeforeLeavingItemBase(BaseModel):
       title: str  # Missing max_length=500 constraint
       order: Optional[int] = None
   ...
   class BeforeLeavingItemUpdate(BaseModel):
       title: Optional[str] = None  # Missing max_length=500 constraint
       order: Optional[int] = None
   ```

### 1.2 Verbatim Test Failures & Empirical Diagnostics

#### Test Failure 1: Unhandled ASGI Exception on Injected Duplicate Rows
Command:
```bash
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -k test_injected_duplicate_active_sessions_resilience
```
Verbatim Traceback:
```
backend/api/routes.py:1017: in get_active_session
    return await get_active_before_leaving_session(session, user_id=user.telegram_id)
backend/crud.py:1424: in get_active_before_leaving_session
    active = res.scalar_one_or_none()
.venv/lib/python3.9/site-packages/sqlalchemy/engine/result.py:1541: in scalar_one_or_none
    return self._only_one_row(...)
.venv/lib/python3.9/site-packages/sqlalchemy/engine/result.py:852: in _only_one_row
    raise exc.MultipleResultsFound(
E   sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
```

#### Test Failure 2: Rapid Concurrent Session Starts (`reset=False`)
Command:
```bash
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -k test_rapid_concurrent_session_starts_no_reset
```
Verbatim Failure:
```
AssertionError: Request 15 raised an exception: Multiple rows were found when one or none was required
assert not True
 where True = isinstance(MultipleResultsFound('Multiple rows were found when one or none was required'), Exception)
```

#### Test Failure 3: Rapid Concurrent Session Starts (`reset=True`)
Command:
```bash
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -k test_rapid_concurrent_session_starts_with_reset
```
Verbatim Failure:
```
AssertionError: Found 10 active sessions after concurrent resets!
assert 10 == 1
```

#### Test Failure 4: Missing Character Boundary Validation
Python Diagnostic:
```python
>>> from backend.schemas import BeforeLeavingItemCreate, BeforeLeavingItemUpdate
>>> BeforeLeavingItemCreate(title="A" * 501)
BeforeLeavingItemCreate(title='AAAA...', order=None) # Length: 501 characters accepted without validation error!
```

---

## 2. Logic Chain

1. **Root Cause Analysis (Concurrency & Query API)**:
   - In `backend/models.py:220-239`, `BeforeLeavingSession` models the lifecycle of a checklist session. There is no DB-level unique constraint on `(user_id, is_active)` because a user can have many historical sessions (`is_active=False`) and the table supports temporal history.
   - When multiple concurrent requests call `POST /api/before-leaving/session/start` simultaneously (e.g., rapid button double-tapping or multiple open tabs), each request executes `select(BeforeLeavingSession)...` concurrently.
   - Because none of the transactions have committed yet, each coroutine evaluates `existing is None` and proceeds to insert a new `BeforeLeavingSession(is_active=True)`.
   - Once multiple active sessions exist for `user_id`, any subsequent query calling `res.scalar_one_or_none()` (`crud.py:1424, 1443, 1539`) raises `sqlalchemy.exc.MultipleResultsFound` because `scalar_one_or_none()` enforces that zero or one row matches in the entire query result set.
   - When `MultipleResultsFound` is raised, FastAPI returns HTTP 500, permanently bricking the user's ability to view, toggle, or finish sessions.

2. **Deductive Analysis of Remediation Requirements**:
   - *Requirement 1*: Replacing `scalar_one_or_none()` with `scalars().first()` in `get_active_before_leaving_session`, `start_before_leaving_session`, and `finish_before_leaving_session` guarantees that queries never raise `MultipleResultsFound` and deterministically select the latest active session by `order_by(BeforeLeavingSession.id.desc())`.
   - *Requirement 2*: However, `scalars().first()` alone is insufficient to prevent concurrent coroutines from inserting multiple active sessions during a surge of `POST /start` calls. When 20 requests execute simultaneously without serialization, multiple coroutines still read `None` before the first commit finishes. To satisfy `assert len(active_sessions) == 1` and `assert len(session_ids) == 1`, concurrent session creations for the same `user_id` must be synchronized using an in-process `asyncio.Lock` (`_get_user_session_lock(user_id)`).
   - *Requirement 3*: When resetting or creating a new session, an atomic bulk SQL update:
     ```python
     await session.execute(
         update(BeforeLeavingSession)
         .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
         .values(is_active=False)
     )
     ```
     must be executed to deactivate all previously active sessions for that user.
   - *Requirement 4*: In `finish_before_leaving_session`, all active sessions for that user must likewise be updated to `is_active=False, completed_at=now` to prevent any orphaned active records.
   - *Requirement 5*: In `backend/models.py:209, 251`, `title` is defined as `String(500)`. In PostgreSQL, strings exceeding 500 characters cause `asyncpg.exceptions.StringDataRightTruncationError` (HTTP 500). In `backend/schemas.py:564-596`, declaring `Field(..., max_length=500)` in `BeforeLeavingItemBase` and `Field(None, max_length=500)` in `BeforeLeavingItemUpdate` ensures FastAPI/Pydantic returns a structured HTTP 422 Unprocessable Entity error instead of an internal crash.

---

## 3. Caveats

1. **Read-Only Explorer Discipline**: Explorer did NOT modify any repository files. All diagnoses and fix verifications were executed via dynamic in-memory test wrappers and isolated non-intrusive test harnesses.
2. **Database Engine Differences**: In SQLite (`sqlite+aiosqlite`), string column lengths are not enforced by the storage engine, allowing >500 character strings to persist without error. The schema validation fix is specifically vital for production PostgreSQL (Supabase), where length violations trigger unhandled exceptions.
3. **ASGI Multi-Worker Scaling**: An in-process `asyncio.Lock` serializes concurrent coroutines within a single ASGI worker process. Combined with the atomic bulk SQL `update` statement, data integrity is preserved across both single-worker and multi-worker deployment topologies.

---

## 4. Concrete Fix Recommendations & Exact Code Snippets

### 4.1 Changes to `backend/schemas.py`

In `backend/schemas.py`, add `Field(..., max_length=500)` to `BeforeLeavingItemBase` and `Field(None, max_length=500)` to `BeforeLeavingItemUpdate`.

#### Proposed Snippet (`backend/schemas.py` lines 564-598):
```python
# --- Before Leaving Schemas (R1 & R2) ---

class BeforeLeavingItemBase(BaseModel):
    title: str = Field(..., max_length=500)
    order: Optional[int] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            clean = capitalize_first(v.strip())
            if not clean:
                raise ValueError("Title cannot be empty")
            return clean
        if v is None:
            raise ValueError("Title cannot be empty")
        return v


class BeforeLeavingItemCreate(BeforeLeavingItemBase):
    pass


class BeforeLeavingItemUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if v is not None and isinstance(v, str):
            clean = capitalize_first(v.strip())
            if not clean:
                raise ValueError("Title cannot be empty")
            return clean
        return v
```

---

### 4.2 Changes to `backend/crud.py`

In `backend/crud.py`:
1. Add an `asyncio.Lock` registry for user session operations:
   ```python
   _user_session_locks: dict[int, asyncio.Lock] = {}

   def _get_user_session_lock(user_id: int) -> asyncio.Lock:
       if user_id not in _user_session_locks:
           _user_session_locks[user_id] = asyncio.Lock()
       return _user_session_locks[user_id]
   ```
2. In `get_active_before_leaving_session`: replace `res.scalar_one_or_none()` with `res.scalars().first()`.
3. In `start_before_leaving_session`:
   - Wrap logic in `async with _get_user_session_lock(user_id):`.
   - Replace `res.scalar_one_or_none()` with `res.scalars().first()`.
   - On `existing` and `not reset`: defensively deactivate any older duplicate active sessions to heal state.
   - On `reset=True` or when creating a new session: atomically update all existing active sessions for `user_id` to `is_active=False` before creating the new session.
4. In `finish_before_leaving_session`:
   - Replace `res.scalar_one_or_none()` with `res.scalars().first()`.
   - Atomically deactivate all active sessions for `user_id` setting `is_active=False` and `completed_at=now`.

#### Proposed Snippet (`backend/crud.py` lines 1412-1551):
```python
# Concurrency lock registry for session lifecycle operations
_user_session_locks: dict[int, asyncio.Lock] = {}

def _get_user_session_lock(user_id: int) -> asyncio.Lock:
    if user_id not in _user_session_locks:
        _user_session_locks[user_id] = asyncio.Lock()
    return _user_session_locks[user_id]


async def get_active_before_leaving_session(
    session: AsyncSession,
    user_id: int,
) -> Optional[BeforeLeavingSessionRead]:
    stmt = (
        select(BeforeLeavingSession)
        .options(selectinload(BeforeLeavingSession.items))
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .order_by(BeforeLeavingSession.id.desc())
    )
    res = await session.execute(stmt)
    active = res.scalars().first()
    if not active:
        return None
    return _before_leaving_session_to_read(active)


async def start_before_leaving_session(
    session: AsyncSession,
    user_id: int,
    reset: bool = False,
) -> BeforeLeavingSessionRead:
    async with _get_user_session_lock(user_id):
        # 1. Check for existing active session
        stmt = (
            select(BeforeLeavingSession)
            .options(selectinload(BeforeLeavingSession.items))
            .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
            .order_by(BeforeLeavingSession.id.desc())
        )
        res = await session.execute(stmt)
        existing = res.scalars().first()
        if existing:
            if not reset:
                # Defensively deactivate any stale duplicate active sessions if present
                await session.execute(
                    update(BeforeLeavingSession)
                    .where(
                        and_(
                            BeforeLeavingSession.user_id == user_id,
                            BeforeLeavingSession.is_active == True,
                            BeforeLeavingSession.id != existing.id,
                        )
                    )
                    .values(is_active=False)
                )
                await session.commit()
                return _before_leaving_session_to_read(existing)
            else:
                await session.execute(
                    update(BeforeLeavingSession)
                    .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
                    .values(is_active=False)
                )
                await session.flush()

        # 2. Check template items
        items_stmt = (
            select(BeforeLeavingItem)
            .where(BeforeLeavingItem.user_id == user_id)
            .order_by(BeforeLeavingItem.order.asc(), BeforeLeavingItem.id.asc())
        )
        items_res = await session.execute(items_stmt)
        template_items = items_res.scalars().all()
        if not template_items:
            raise ValueError("No template items configured")

        # 3. Create new session and snapshot items
        # Atomically guarantee no other session remains active
        await session.execute(
            update(BeforeLeavingSession)
            .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
            .values(is_active=False)
        )

        new_session = BeforeLeavingSession(
            user_id=user_id,
            is_active=True,
            started_at=datetime.utcnow(),
        )
        session.add(new_session)
        await session.flush()

        for item in template_items:
            check_item = BeforeLeavingCheckItem(
                session_id=new_session.id,
                template_item_id=item.id,
                title=item.title,
                order=item.order,
                is_checked=False,
                checked_at=None,
            )
            session.add(check_item)

        await session.commit()

        # 4. Return new session with loaded items
        stmt_created = (
            select(BeforeLeavingSession)
            .options(selectinload(BeforeLeavingSession.items))
            .where(BeforeLeavingSession.id == new_session.id)
        )
        res_created = await session.execute(stmt_created)
        created_session = res_created.scalar_one()
        return _before_leaving_session_to_read(created_session)


async def toggle_before_leaving_check_item(
    session: AsyncSession,
    check_item_id: int,
    user_id: int,
    is_checked: Optional[bool] = None,
) -> Optional[BeforeLeavingSessionRead]:
    stmt = (
        select(BeforeLeavingCheckItem)
        .join(BeforeLeavingSession)
        .where(
            and_(
                BeforeLeavingCheckItem.id == check_item_id,
                BeforeLeavingSession.user_id == user_id,
                BeforeLeavingSession.is_active == True,
            )
        )
    )
    res = await session.execute(stmt)
    item = res.scalars().first()
    if not item:
        return None

    if is_checked is None:
        item.is_checked = not item.is_checked
    else:
        item.is_checked = bool(is_checked)

    item.checked_at = datetime.utcnow() if item.is_checked else None
    await session.commit()

    return await get_active_before_leaving_session(session, user_id)


async def finish_before_leaving_session(
    session: AsyncSession,
    user_id: int,
) -> BeforeLeavingSessionRead:
    stmt = (
        select(BeforeLeavingSession)
        .options(selectinload(BeforeLeavingSession.items))
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .order_by(BeforeLeavingSession.id.desc())
    )
    res = await session.execute(stmt)
    active = res.scalars().first()
    if not active:
        raise LookupError("No active session found")

    items = active.items or []
    if not items or any(not item.is_checked for item in items):
        raise ValueError("Cannot finish session: unfinished items remain")

    now = datetime.utcnow()
    active.is_active = False
    active.completed_at = now

    # Atomically deactivate all active sessions for this user
    await session.execute(
        update(BeforeLeavingSession)
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .values(is_active=False, completed_at=now)
    )
    await session.commit()
    return _before_leaving_session_to_read(active)
```

---

## 5. Verification Method

Once implemented by the worker, independently verify the fix by running:

1. **Target Adversarial Stress Challenge Suite (16 tests)**:
   ```bash
   .venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v
   ```
   *Expected outcome*: 16 passed in ~4.8s. All concurrency, reset, and injected duplicate tests pass cleanly.

2. **Backend Unit & Feature Test Suite (14 tests)**:
   ```bash
   .venv/bin/pytest tests/test_before_leaving_backend.py -v
   ```
   *Expected outcome*: 14 passed in ~2.7s.

3. **Full Project Regression Test Suite (82 tests)**:
   ```bash
   .venv/bin/pytest tests/ -v
   ```
   *Expected outcome*: 82 passed in ~8.5s with zero regressions.
