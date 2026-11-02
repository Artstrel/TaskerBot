# Challenger 1 Handoff Report: Milestone 1 Backend Verification

**Formal Verdict**: `REQUEST_CHANGES`
**Overall Risk Assessment**: `CRITICAL`

---

## 1. Observation

### 1.1 Scope and Challenged Artifacts
Challenger 1 executed empirical stress, concurrency, and boundary testing against the Milestone 1 Backend implementation committed by `worker_backend_m1`:
- Target source files: `backend/models.py`, `backend/schemas.py`, `backend/crud.py`, `backend/api/routes.py`
- Test suite created: `tests/test_before_leaving_stress_challenge.py` (16 adversarial test cases across 5 test classes)
- Baseline regression test: `tests/` (66 existing tests)

### 1.2 Empirical Test Execution & Verbatim Results

#### Command 1: Full Adversarial Stress Suite Run
```bash
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v
```
**Verbatim Output Summary**:
```
============================= test session starts ==============================
collected 16 items

tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_start_session_empty_template_rejection PASSED [  6%]
tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_no_reset FAILED [ 12%]
tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_with_reset FAILED [ 18%]
tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_injected_duplicate_active_sessions_resilience FAILED [ 25%]
tests/test_before_leaving_stress_challenge.py::TestStressCheckItemToggling::test_rapid_concurrent_toggles_single_item PASSED [ 31%]
tests/test_before_leaving_stress_challenge.py::TestStressCheckItemToggling::test_rapid_concurrent_toggles_multiple_items_consistency PASSED [ 37%]
tests/test_before_leaving_stress_challenge.py::TestStressCheckItemToggling::test_toggle_item_on_finished_session_fails_404 PASSED [ 43%]
tests/test_before_leaving_stress_challenge.py::TestStressLargeTemplateAndReordering::test_large_template_100_items_creation_and_autoincrement PASSED [ 50%]
tests/test_before_leaving_stress_challenge.py::TestStressLargeTemplateAndReordering::test_large_template_100_items_session_snapshot_and_finish PASSED [ 56%]
tests/test_before_leaving_stress_challenge.py::TestStressLargeTemplateAndReordering::test_reorder_100_items_full_reverse PASSED [ 62%]
tests/test_before_leaving_stress_challenge.py::TestStressFinishConstraintsAndDirectHttpAttacks::test_finish_rejected_with_unchecked_items PASSED [ 68%]
tests/test_before_leaving_stress_challenge.py::TestStressFinishConstraintsAndDirectHttpAttacks::test_finish_when_no_active_session_returns_404 PASSED [ 75%]
tests/test_before_leaving_stress_challenge.py::TestStressFinishConstraintsAndDirectHttpAttacks::test_repeated_and_concurrent_finish_calls PASSED [ 81%]
tests/test_before_leaving_stress_challenge.py::TestStressBoundariesAndCrossTenantAttacks::test_template_title_boundaries_and_special_chars PASSED [ 87%]
tests/test_before_leaving_stress_challenge.py::TestStressBoundariesAndCrossTenantAttacks::test_delete_template_item_with_active_session_snapshot_preserved PASSED [ 93%]
tests/test_before_leaving_stress_challenge.py::TestStressBoundariesAndCrossTenantAttacks::test_cross_tenant_adversarial_tampering PASSED [100%]

=================================== FAILURES ===================================
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_no_reset
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_rapid_concurrent_session_starts_with_reset
FAILED tests/test_before_leaving_stress_challenge.py::TestStressSessionLifecycleAndConcurrency::test_injected_duplicate_active_sessions_resilience
=================== 3 failed, 13 passed, 9 warnings in 6.33s ===================
```

#### Verbatim Crash Stack Trace:
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

---

## 2. Logic Chain

### 2.1 Concurrency Race on Session Start
1. In `backend/crud.py:start_before_leaving_session` (lines 1435-1444):
   ```python
   stmt = (
       select(BeforeLeavingSession)
       .options(selectinload(BeforeLeavingSession.items))
       .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
       .order_by(BeforeLeavingSession.id.desc())
   )
   res = await session.execute(stmt)
   existing = res.scalar_one_or_none()
   ```
2. When 20 concurrent requests hit `POST /api/before-leaving/session/start` simultaneously (simulating rapid user double-clicks or multiple tabs/devices), multiple workers execute `select(...)` before any has committed a new row.
3. Multiple workers evaluate `existing is None` and concurrently insert rows into `before_leaving_sessions` with `is_active=True`.
4. As a result, multiple active session rows exist in the database for the same user.

### 2.2 Unhandled `MultipleResultsFound` Crash
1. In `backend/crud.py`, three core functions query active sessions:
   - `get_active_before_leaving_session` (line 1424): `active = res.scalar_one_or_none()`
   - `start_before_leaving_session` (line 1443): `existing = res.scalar_one_or_none()`
   - `finish_before_leaving_session` (line 1539): `active = res.scalar_one_or_none()`
2. In all three queries, `.order_by(BeforeLeavingSession.id.desc())` was explicitly specified, proving the intent was to retrieve the latest active session.
3. However, SQLAlchemy's `res.scalar_one_or_none()` method raises `sqlalchemy.exc.MultipleResultsFound` whenever more than one row matches the query.
4. Because the exception is unhandled, FastAPI returns `HTTP 500 Internal Server Error`, bricking the user's active session, active session query, and finish capability.
5. This is the exact identical defect previously identified and resolved in the TaskerBot codebase for routines (`test_numeric_challenge_stress.py:8, 592-604: "Legacy duplicate injection resiliency: verifying scalar_one_or_none elimination prevents MultipleResultsFound"`).

### 2.3 Reset Deactivation Incompleteness
1. In `start_before_leaving_session` (lines 1447-1449):
   ```python
   if existing:
       if not reset:
           return _before_leaving_session_to_read(existing)
       else:
           existing.is_active = False
           await session.flush()
   ```
2. When `reset=True`, only the single fetched instance has its `is_active` set to `False`. If duplicate active sessions existed, the remaining active sessions remain orphaned and active, continuing to trigger `MultipleResultsFound`.
3. An atomic SQL update:
   ```python
   await session.execute(
       update(BeforeLeavingSession)
       .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
       .values(is_active=False)
   )
   ```
   must be performed whenever resetting or starting a new session to guarantee at most one active session per user.

---

## 3. Robust Areas Verified (Passed)

The following stress and boundary criteria passed completely without error:
1. **Empty Template Rejection**: `POST /api/before-leaving/session/start` with 0 template items returns HTTP 400 (`"No template items configured"`).
2. **Rapid Concurrent Toggles**: 30 concurrent toggles on a single item and 50 mixed toggles across 10 items completed with zero deadlocks and 100% mathematical consistency of `total_count`, `completed_count`, and `is_all_completed`.
3. **Large Template Scale (100 items)**: Creating 100 template items preserved sequential order `0..99`. Session snapshotting preserved all 100 items. Batch reverse reordering of 100 items was completely persisted. Batch toggling all 100 items to completion and finishing functioned as specified.
4. **Direct HTTP Finish Attack Resistance**: Premature finish calls with 0/5, 4/5, or unchecking an item were reliably rejected with `HTTP 400 Bad Request` (`detail="Cannot finish session: unfinished items remain"`).
5. **Cross-Tenant Isolation**: Verified that User B cannot read, update, delete, reorder, toggle, or finish User A's template items or active sessions (all yield HTTP 404 or empty results).

---

## 4. Caveats

- Tested in SQLite asyncio environment (`aiosqlite` with `timeout=30.0`). Under PostgreSQL multi-worker connections in production, connection pooling will allow even higher concurrency, making the race condition even more prevalent without `scalars().first()` and atomic deactivation updates.

---

## 5. Conclusion & Actionable Fixes

**Verdict**: `REQUEST_CHANGES`

The backend worker must make the following targeted modifications in `backend/crud.py`:

1. **Replace `scalar_one_or_none()` with `scalars().first()`**:
   - `get_active_before_leaving_session` (line 1424):
     ```python
     # Replace:
     active = res.scalar_one_or_none()
     # With:
     active = res.scalars().first()
     ```
   - `start_before_leaving_session` (line 1443):
     ```python
     # Replace:
     existing = res.scalar_one_or_none()
     # With:
     existing = res.scalars().first()
     ```
   - `finish_before_leaving_session` (line 1539):
     ```python
     # Replace:
     active = res.scalar_one_or_none()
     # With:
     active = res.scalars().first()
     ```

2. **Atomic Session Deactivation on Start/Reset**:
   - In `start_before_leaving_session`:
     Before creating a new `BeforeLeavingSession` row, atomically deactivate all active sessions for the user:
     ```python
     await session.execute(
         update(BeforeLeavingSession)
         .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
         .values(is_active=False)
     )
     ```

---

## 6. Verification Method

To verify the fixes independently:
```bash
# 1. Run the challenger stress test suite (all 16 tests must pass)
.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v

# 2. Run the worker's unit tests
.venv/bin/pytest tests/test_before_leaving_backend.py -v

# 3. Run the full regression test suite (all 82 tests must pass)
.venv/bin/pytest tests/ -v
```
