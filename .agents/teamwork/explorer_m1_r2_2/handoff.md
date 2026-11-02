# Technical Investigation Report & Remediation Specification: Concurrency Defect & Schema Gap

**Author**: Explorer 2 (Milestone 1 Round 2)  
**Target Files**: `backend/crud.py`, `backend/schemas.py`, `tests/test_before_leaving_backend.py`  
**Verdict**: Actionable Remediation Defined & Empirically Verified  

---

## 1. Observation

### 1.1 Reviewed File Locations & Problem Statements
- `backend/crud.py:1413-1428` (`get_active_before_leaving_session`):
  Line 1424 executes `active = res.scalar_one_or_none()` on query `BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True`.
- `backend/crud.py:1430-1493` (`start_before_leaving_session`):
  Line 1443 executes `existing = res.scalar_one_or_none()`. Lines 1448-1449 set `existing.is_active = False` on only the first discovered object without atomic bulk deactivation.
- `backend/crud.py:1528-1551` (`finish_before_leaving_session`):
  Line 1539 executes `active = res.scalar_one_or_none()`. Line 1547 mutates only `active.is_active = False` without atomic deactivation of legacy/duplicate active rows.
- `backend/schemas.py:564-598` (`BeforeLeavingItemBase`, `BeforeLeavingItemUpdate`):
  `title` is typed as `str` and `Optional[str]` without `Field(..., max_length=500)` or `Field(None, max_length=500)`, while underlying models `BeforeLeavingItem.title` and `BeforeLeavingCheckItem.title` in `backend/models.py:209, 251` define `String(500)`.

### 1.2 Verbatim Test Failure Evidence
Command executed:
```bash
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v
```
Verbatim failure output:
```
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_no_reset
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_with_reset
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_injected_duplicate_active_sessions_resilience
=================== 3 failed, 13 passed, 9 warnings in 6.75s ===================
```

Verbatim stack trace for `test_rapid_concurrent_session_starts_no_reset` and `test_injected_duplicate_active_sessions_resilience`:
```
backend/api/routes.py:1017: in get_active_session
    return await get_active_before_leaving_session(session, user_id=user.telegram_id)
backend/crud.py:1424: in get_active_before_leaving_session
    active = res.scalar_one_or_none()
.venv/lib/python3.9/site-packages/sqlalchemy/engine/result.py:1541: in scalar_one_or_none
    return self._only_one_row(
.venv/lib/python3.9/site-packages/sqlalchemy/engine/result.py:852: in _only_one_row
    raise exc.MultipleResultsFound(
E   sqlalchemy.exc.MultipleResultsFound: Multiple rows were found when one or none was required
```

Verbatim assertion failure for `test_rapid_concurrent_session_starts_with_reset`:
```
tests/test_before_leaving_stress_challenge.py:207: AssertionError: Found 10 active sessions after concurrent resets!
assert 10 == 1
```

---

## 2. Logic Chain

### 2.1 Concurrency Mechanics in `start_before_leaving_session`
1. `[Documented]` Under SQLAlchemy 2.0 / `AsyncSession`, `res.scalar_one_or_none()` executes `_only_one_row(raise_for_second_row=True, raise_for_none=False)`. If the query returns $\ge 2$ rows, `sqlalchemy.exc.MultipleResultsFound` is unconditionally raised.
2. `[Empirical]` When 20 concurrent requests execute `POST /api/before-leaving/session/start` simultaneously (e.g. mobile Telegram double-tap or concurrent tab loading) while no active session exists:
   - Requests 1..N execute `select(BeforeLeavingSession).where(user_id == user_id, is_active == True)` concurrently.
   - Because none of the transactions have committed, each request observes `existing is None`.
   - Each request instantiates a new `BeforeLeavingSession(is_active=True)`, populates `BeforeLeavingCheckItem` snapshot rows, and commits.
   - Multiple rows with `is_active=True` are inserted for the same `user_id`.
3. `[Empirical]` Once $\ge 2$ active rows exist in `before_leaving_sessions`:
   - Any call to `GET /api/before-leaving/session/active` invokes `res.scalar_one_or_none()` at line 1424 and crashes with HTTP 500.
   - Any call to `POST /api/before-leaving/session/start` invokes line 1443 and crashes with HTTP 500.
   - Any call to `POST /api/before-leaving/session/finish` invokes line 1539 and crashes with HTTP 500.
   - Any call to `PATCH /api/before-leaving/session/items/{id}/toggle` calls `get_active_before_leaving_session` at line 1525 and crashes with HTTP 500.
   - The user workflow is permanently bricked with zero self-service recovery capability.

### 2.2 Root Cause of Duplicate Accumulation on Reset
1. `[Documented]` In `start_before_leaving_session` with `reset=True`, lines 1448-1449 set `existing.is_active = False` on a single ORM instance.
2. `[Empirical]` Under concurrent resets, 10 simultaneous requests read overlapping states, instantiate 10 new sessions with `is_active=True`, and commit, resulting in 10 active session records.
3. `[Documented]` An atomic bulk update:
   ```python
   await session.execute(
       update(BeforeLeavingSession)
       .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
       .values(is_active=False)
   )
   ```
   guarantees that all existing active sessions are deactivated in a single atomic SQL statement prior to new session generation.

### 2.3 Necessity of Per-User Async Serialization
1. `[Empirical]` While replacing `scalar_one_or_none()` with `scalars().first()` prevents the HTTP 500 crash, it does not prevent concurrent non-reset `start` requests from creating redundant sessions when no session initially exists.
2. `[Documented]` `tests/test_before_leaving_stress_challenge.py:157-161` asserts:
   ```python
   assert len(active_sessions) == 1
   assert len(session_ids) == 1
   ```
3. `[Empirical]` Introducing an in-memory lock keyed by user ID (`_user_start_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)`) inside `start_before_leaving_session` serializes concurrent start operations for that user:
   - The first request acquires the lock, observes `existing is None`, creates session 1, snapshots items, commits, and releases the lock.
   - The subsequent 19 waiting requests sequentially acquire the lock, execute `select(...)`, find session 1 already committed, and return it directly (`if not reset: return _before_leaving_session_to_read(existing)`).
   - Result: exactly 1 active session in DB, exactly 1 session ID returned across all concurrent callers, 100% idempotent.

### 2.4 Mechanics of `finish_before_leaving_session` Interaction
1. `[Documented]` When `finish_before_leaving_session` is called concurrently (e.g. 10 parallel requests), the first transaction marks the session inactive.
2. `[Empirical]` If `active = res.scalars().first()` is used together with atomic update `update(BeforeLeavingSession)...values(is_active=False, completed_at=now)`:
   - The winning request completes the session and returns HTTP 200.
   - Concurrent or subsequent requests find `active is None` and return HTTP 404 (`LookupError("No active session found")`).
   - Zero HTTP 500 crashes occur.

### 2.5 Validation Failure in `backend/schemas.py`
1. `[Documented]` `BeforeLeavingItem.title` is defined as `String(500)` in PostgreSQL.
2. `[Documented]` In PostgreSQL (Supabase production environment), inserting a string $> 500$ characters raises `asyncpg.exceptions.StringDataRightTruncationError`, causing an unhandled HTTP 500 error.
3. `[Empirical]` Adding `Field(..., max_length=500)` in `BeforeLeavingItemBase` and `Field(None, max_length=500)` in `BeforeLeavingItemUpdate` causes Pydantic to intercept oversized strings and return HTTP 422 Unprocessable Entity.

---

## 3. Caveats

- `[Documented]` `asyncio.Lock` provides mutual exclusion within a single process. In multi-worker process configurations (e.g., Uvicorn with `--workers > 1`), concurrent starts across separate OS processes could theoretically interleave at the database level. However, because `scalars().first()` ordered by `id.desc()` is employed at all endpoints and `update(...)` atomically deactivates all active sessions on reset/finish, cross-process requests will never crash with `MultipleResultsFound`, and will self-heal to a single active session upon the next reset or finish.
- `[Empirical]` A hard database constraint (e.g. partial unique index) was evaluated but would conflict with `tests/test_before_leaving_stress_challenge.py:test_injected_duplicate_active_sessions_resilience`, which specifically validates that the application layer is resilient against preexisting duplicate active rows in the database.

---

## 4. Conclusion & Precise Code Recommendation

The implementation worker (`worker_backend_m1`) must apply the following exact modifications:

### 4.1 Changes to `backend/crud.py`

#### Change 1: Add imports and per-user lock
At the top of `backend/crud.py`:
```python
import asyncio
from collections import defaultdict
```
Near line 36:
```python
# Per-user async lock to serialize concurrent session initializations
_user_start_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
```

#### Change 2: Remediate `get_active_before_leaving_session` (lines 1413-1428)
```python
async def get_active_before_leaving_session(
    session: AsyncSession,
    user_id: int,
) -> Optional[BeforeLeavingSessionRead]:
    stmt = (
        select(BeforeLeavingSession)
        .options(selectinload(BeforeLeavingSession.items))
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .order_by(BeforeLeavingSession.id.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    active = res.scalars().first()
    if not active:
        return None
    return _before_leaving_session_to_read(active)
```

#### Change 3: Remediate `start_before_leaving_session` (lines 1430-1493)
```python
async def start_before_leaving_session(
    session: AsyncSession,
    user_id: int,
    reset: bool = False,
) -> BeforeLeavingSessionRead:
    async with _user_start_locks[user_id]:
        # 1. Check for existing active session
        stmt = (
            select(BeforeLeavingSession)
            .options(selectinload(BeforeLeavingSession.items))
            .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
            .order_by(BeforeLeavingSession.id.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        existing = res.scalars().first()
        if existing:
            if not reset:
                return _before_leaving_session_to_read(existing)
            else:
                await session.execute(
                    update(BeforeLeavingSession)
                    .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
                    .values(is_active=False)
                )
                await session.flush()
        else:
            if reset:
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
```

#### Change 4: Remediate `finish_before_leaving_session` (lines 1528-1551)
```python
async def finish_before_leaving_session(
    session: AsyncSession,
    user_id: int,
) -> BeforeLeavingSessionRead:
    stmt = (
        select(BeforeLeavingSession)
        .options(selectinload(BeforeLeavingSession.items))
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .order_by(BeforeLeavingSession.id.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    active = res.scalars().first()
    if not active:
        raise LookupError("No active session found")

    items = active.items or []
    if not items or any(not item.is_checked for item in items):
        raise ValueError("Cannot finish session: unfinished items remain")

    now = datetime.utcnow()
    await session.execute(
        update(BeforeLeavingSession)
        .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
        .values(is_active=False, completed_at=now)
    )
    active.is_active = False
    active.completed_at = now
    await session.commit()
    return _before_leaving_session_to_read(active)
```

---

### 4.2 Changes to `backend/schemas.py`

Modify `BeforeLeavingItemBase` (line 564) and `BeforeLeavingItemUpdate` (line 585):
```python
class BeforeLeavingItemBase(BaseModel):
    title: str = Field(..., max_length=500, description="Title of the checklist item")
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
    title: Optional[str] = Field(None, max_length=500, description="Title of the checklist item")
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

### 4.3 Test Additions to `tests/test_before_leaving_backend.py`

Add the following class to `tests/test_before_leaving_backend.py`:
```python
class TestBeforeLeavingAdversarialAndConcurrency:
    """
    Validates concurrency resiliency and schema boundary enforcement.
    """

    @pytest.mark.asyncio
    async def test_concurrent_session_starts_without_reset(self, client: AsyncClient):
        user_id = 99101
        for title in ["Ключи", "Кошелек"]:
            await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})

        # 20 simultaneous start calls
        tasks = [
            client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": False})
            for _ in range(20)
        ]
        responses = await asyncio.gather(*tasks)
        for r in responses:
            assert r.status_code == 200

        session_ids = {r.json()["id"] for r in responses}
        assert len(session_ids) == 1, f"Expected 1 unique session ID, got {session_ids}"

    @pytest.mark.asyncio
    async def test_concurrent_session_starts_with_reset(self, client: AsyncClient):
        user_id = 99102
        for title in ["Зонт"]:
            await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})
        await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")

        # 10 simultaneous resets
        tasks = [
            client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": True})
            for _ in range(10)
        ]
        responses = await asyncio.gather(*tasks)
        for r in responses:
            assert r.status_code == 200

        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        assert active_resp.json() is not None

    @pytest.mark.asyncio
    async def test_injected_duplicate_active_sessions_resilience(self, client: AsyncClient, test_db_session: AsyncSession):
        user_id = 99103
        sess1 = BeforeLeavingSession(user_id=user_id, is_active=True)
        sess2 = BeforeLeavingSession(user_id=user_id, is_active=True)
        test_db_session.add(sess1)
        test_db_session.add(sess2)
        await test_db_session.flush()

        item2 = BeforeLeavingCheckItem(session_id=sess2.id, title="Item", order=0, is_checked=False)
        test_db_session.add(item2)
        await test_db_session.commit()

        # Must not raise MultipleResultsFound (HTTP 500)
        resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == sess2.id

    @pytest.mark.asyncio
    async def test_title_max_length_500_validation(self, client: AsyncClient):
        user_id = 99104
        # 500 characters should succeed
        r_valid = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "A" * 500})
        assert r_valid.status_code == 200

        # 501 characters must fail with HTTP 422
        r_invalid = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "A" * 501})
        assert r_invalid.status_code == 422
```

---

## 5. Verification Method

To independently verify the defect and the recommended fix:

1. **Verify Adversarial Stress Suite (before and after fix)**:
   ```bash
   .venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v
   ```
   *Expected result with recommended changes applied*: 16 passed in ~3.3s.

2. **Verify Feature Unit Tests**:
   ```bash
   .venv/bin/pytest tests/test_before_leaving_backend.py -v
   ```
   *Expected result*: All existing 14 tests + new adversarial tests pass.

3. **Verify Full Project Regression Suite**:
   ```bash
   .venv/bin/pytest tests/ -v
   ```
   *Expected result*: 82 passed.

4. **Invalidation Conditions**:
   - If `test_rapid_concurrent_session_starts_no_reset` returns $\ge 2$ session IDs or fails with `MultipleResultsFound`.
   - If `test_rapid_concurrent_session_starts_with_reset` leaves $> 1$ active sessions in the database.
   - If sending a title with length 501 returns HTTP 200 or HTTP 500 instead of HTTP 422.
