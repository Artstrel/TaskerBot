# Worker Round 2 Dispatch — Milestone 1 Backend Remediation

## Objective
Apply the verified concurrency and schema remediation to `backend/crud.py` and `backend/schemas.py`.

## Input Information
- Authoritative Request: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Specification: `/Users/artstrelani/Documents/TaskerBot/PROJECT.md`
- Gate Failure: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/orchestrator/GATE_STATUS.md`
- Explorer 1 Remediation Report: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m1_r2_1/handoff.md`
- Explorer 3 Patch: `/Users/artstrelani/Documents/TaskerBot/.agents/teamwork/explorer_m1_r2_3/remediation.patch`
- Stress Test Suite: `tests/test_before_leaving_stress_challenge.py`
- Boundary Test Suite: `tests/test_before_leaving_challenger_2.py`
- Feature Test Suite: `tests/test_before_leaving_backend.py`

## File Ownership
- Exclusively owns:
  - `backend/crud.py`
  - `backend/schemas.py`
- Must NOT touch: `frontend/` files.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Remediation Tasks
1. In `backend/crud.py`:
   - Implement `_before_leaving_locks: Dict[int, asyncio.Lock] = {}` and `_get_before_leaving_lock(user_id: int) -> asyncio.Lock`.
   - Wrap `start_before_leaving_session` in `async with _get_before_leaving_lock(user_id):`.
   - Replace `scalar_one_or_none()` with `scalars().first()` in `get_active_before_leaving_session`, `start_before_leaving_session`, and `finish_before_leaving_session`.
   - In `start_before_leaving_session`: perform atomic SQL update on existing active sessions when resetting or when duplicates exist:
     ```python
     await session.execute(
         update(BeforeLeavingSession)
         .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
         .values(is_active=False)
     )
     await session.flush()
     ```
   - In `finish_before_leaving_session`:
     Deactivate all active sessions atomically upon complete checklist:
     ```python
     await session.execute(
         update(BeforeLeavingSession)
         .where(and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True))
         .values(is_active=False, completed_at=now)
     )
     ```
2. In `backend/schemas.py`:
   - Add `max_length=500` to `title` in `BeforeLeavingItemBase`:
     `title: str = Field(..., max_length=500)`
   - Add `max_length=500` to `title` in `BeforeLeavingItemUpdate`:
     `title: Optional[str] = Field(None, max_length=500)`

## Verification Requirements
Execute and verify:
1. `.venv/bin/pytest tests/test_before_leaving_stress_challenge.py -v` (all 16 tests MUST pass)
2. `.venv/bin/pytest tests/test_before_leaving_challenger_2.py -v` (all 12 tests MUST pass)
3. `.venv/bin/pytest tests/test_before_leaving_backend.py -v` (all 14 tests MUST pass)
4. `.venv/bin/pytest tests/ -v` (all 94 tests across tests/ MUST pass without regression)
Document all commands and verbatim test outputs in `handoff.md`.
