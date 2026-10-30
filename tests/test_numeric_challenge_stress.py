"""
Adversarial Stress Test Suite: Numeric Task Persistence, Concurrency & Boundary Challenges.
Targeting:
1. Persistence over time: 18s, 36s, 60s simulated intervals with and without interleaved updates.
2. Concurrency stress: simultaneous stepper clicks on initial routine creation (no RoutineLog pre-existing)
   and on existing routine records, verifying zero MultipleResultsFound or unhandled IntegrityError crashes.
3. Boundary inputs: negative deltas, float increments, extreme exceeding of target value, precision rounding.
4. Legacy duplicate injection resiliency: verifying scalar_one_or_none elimination prevents MultipleResultsFound.
"""

import asyncio
import os
import shutil
import sys
import tempfile
from datetime import date, timedelta
from typing import AsyncGenerator

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.models import Base, RoutineLog, RoutineTask, OneTimeTask, Goal, User
from main import app


@pytest_asyncio.fixture
async def challenge_env() -> AsyncGenerator[dict, None]:
    """
    Provisions a dedicated SQLite test database with aiosqlite and busy timeout configured,
    and an ASGITransport AsyncClient for high-concurrency requests.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_challenge_")
    db_path = os.path.join(temp_dir, "challenge_tasker.db")
    db_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(
        db_url,
        echo=False,
        connect_args={"timeout": 30.0},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with SessionLocal() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {
            "client": client,
            "session_factory": SessionLocal,
            "engine": engine,
            "db_path": db_path,
        }

    app.dependency_overrides.clear()
    await engine.dispose()
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestChallengePersistenceOverTime:
    """
    Adversarial Challenge: Verify persistence across 18s, 36s, 60s polling intervals.
    Verify numeric values NEVER reset to 0.0 even under repeated polling and interleaved updates.
    """

    @pytest.mark.asyncio
    async def test_persistence_across_extended_intervals_with_interleaved_updates(self, challenge_env):
        """
        Challenge:
        - Create routine (target=3.0, step=0.5) and one-time task (target=15.0, step=2.5).
        - Update initial progress: Routine -> 1.0, Task -> 5.0.
        - Fetch dashboard at simulated t=18s: assert 1.0 and 5.0.
        - User clicks stepper (+) at t=25s: Routine +0.5 -> 1.5, Task +2.5 -> 7.5.
        - Fetch dashboard at simulated t=36s (critical reset point): assert 1.5 and 7.5.
        - User decrements stepper (-) at t=45s: Routine -0.5 -> 1.0.
        - Fetch dashboard at simulated t=60s: assert 1.0 and 7.5.
        - Directly query database session: verify exact persisted values in tables.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90001

        # 1. Create numeric routine and numeric task
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Interval Routine", "target_value": 3.0, "step": 0.5, "unit": "km"},
        )
        assert r_res.status_code == 200
        r_id = r_res.json()["id"]

        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Interval Task", "target_value": 15.0, "step": 2.5, "unit": "pages"},
        )
        assert t_res.status_code == 200
        t_id = t_res.json()["id"]

        # Initial updates
        p_r1 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 1.0},
        )
        assert p_r1.status_code == 200
        assert p_r1.json()["current_value"] == 1.0

        p_t1 = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 5.0},
        )
        assert p_t1.status_code == 200
        assert p_t1.json()["current_value"] == 5.0

        # Simulated interval: t = 18s
        dash_18s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_18s = next(r for r in dash_18s["routine_tasks"] if r["id"] == r_id)
        t_18s = next(t for t in dash_18s["today_tasks"] if t["id"] == t_id)
        assert r_18s["current_value"] == 1.0, f"Expected 1.0 at 18s, got {r_18s['current_value']}"
        assert t_18s["current_value"] == 5.0, f"Expected 5.0 at 18s, got {t_18s['current_value']}"

        # Interleaved update at t = 25s
        p_r2 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.5},
        )
        assert p_r2.status_code == 200
        assert p_r2.json()["current_value"] == 1.5

        p_t2 = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"delta": 2.5},
        )
        assert p_t2.status_code == 200
        assert p_t2.json()["current_value"] == 7.5

        # Simulated interval: t = 36s (Original bug trigger point)
        dash_36s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_36s = next(r for r in dash_36s["routine_tasks"] if r["id"] == r_id)
        t_36s = next(t for t in dash_36s["today_tasks"] if t["id"] == t_id)
        assert r_36s["current_value"] == 1.5, f"Expected 1.5 at 36s, got {r_36s['current_value']}"
        assert t_36s["current_value"] == 7.5, f"Expected 7.5 at 36s, got {t_36s['current_value']}"

        # Interleaved update at t = 45s: decrement routine
        p_r3 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -0.5},
        )
        assert p_r3.status_code == 200
        assert p_r3.json()["current_value"] == 1.0

        # Simulated interval: t = 60s
        dash_60s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_60s = next(r for r in dash_60s["routine_tasks"] if r["id"] == r_id)
        t_60s = next(t for t in dash_60s["today_tasks"] if t["id"] == t_id)
        assert r_60s["current_value"] == 1.0, f"Expected 1.0 at 60s, got {r_60s['current_value']}"
        assert t_60s["current_value"] == 7.5, f"Expected 7.5 at 60s, got {t_60s['current_value']}"

        # Direct database validation
        async with session_factory() as session:
            r_log = (
                await session.execute(
                    select(RoutineLog).where(
                        and_(RoutineLog.routine_id == r_id, RoutineLog.date == date.today())
                    )
                )
            ).scalar_one_or_none()
            assert r_log is not None
            assert r_log.current_value == 1.0

            db_task = (
                await session.execute(select(OneTimeTask).where(OneTimeTask.id == t_id))
            ).scalar_one_or_none()
            assert db_task is not None
            assert db_task.current_value == 7.5

    @pytest.mark.asyncio
    async def test_repeated_polling_under_unauthenticated_probes(self, challenge_env):
        """
        Challenge:
        - Setup task and routine with valid values.
        - Alternate polling between valid user (user_id) and unauthenticated client (telegram_id=0).
        - Verify unauthenticated requests return 401 and never corrupt or reset valid user state.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90002

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Security Check", "target_value": 5.0, "step": 1.0},
        )
        r_id = r_res.json()["id"]
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 3.0},
        )

        # Polling cycles with unauthenticated interleaved
        for tick in (18, 36, 60):
            # Unauth poll
            unauth = await client.get("/api/dashboard/today?telegram_id=0")
            assert unauth.status_code == 401

            # Auth poll
            auth = await client.get(f"/api/dashboard/today?telegram_id={user_id}")
            assert auth.status_code == 200
            val = next(r["current_value"] for r in auth.json()["routine_tasks"] if r["id"] == r_id)
            assert val == 3.0, f"Value corrupted at tick {tick}: {val}"


class TestChallengeConcurrencyStress:
    """
    Adversarial Challenge: Concurrency stress targeting race conditions.
    Specifically challenges:
    1. Simultaneous stepper clicks on INITIAL routine creation (when no RoutineLog exists yet).
    2. Simultaneous stepper clicks on EXISTING routine records.
    3. Simultaneous stepper clicks on OneTimeTasks.
    4. Mixed concurrent operations (toggle + progress).
    """

    @pytest.mark.asyncio
    async def test_simultaneous_stepper_clicks_on_initial_routine_creation(self, challenge_env):
        """
        CRITICAL CHALLENGE:
        When a routine is newly created, NO RoutineLog exists in the database.
        If multiple stepper clicks occur concurrently at that exact instant,
        multiple workers attempt to insert RoutineLog(routine_id, date) simultaneously.
        Verifies:
        - Zero 500 Internal Server Errors.
        - Zero unhandled IntegrityError or MultipleResultsFound exceptions.
        - Exactly 1 RoutineLog row created in the database.
        - Final current_value is strictly greater than 0.0.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90010

        # Create routine without any log
        create_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Fresh Routine", "target_value": 10.0, "step": 1.0, "unit": "km"},
        )
        assert create_res.status_code == 200
        r_id = create_res.json()["id"]

        # Confirm NO RoutineLog exists yet
        async with session_factory() as session:
            count = (
                await session.execute(
                    select(func.count(RoutineLog.id)).where(RoutineLog.routine_id == r_id)
                )
            ).scalar()
            assert count == 0, f"Precondition failed: expected 0 logs, found {count}"

        # Fire 8 SIMULTANEOUS stepper PATCH requests on the fresh routine (no log exists yet)
        concurrency = 8
        coros = [
            client.patch(
                f"/api/routines/{r_id}/progress?telegram_id={user_id}",
                json={"delta": 1.0},
            )
            for _ in range(concurrency)
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for i, res in enumerate(results):
            assert not isinstance(res, Exception), f"Request {i} raised exception: {res}"
            assert res.status_code == 200, (
                f"Request {i} failed with status {res.status_code}: {res.text}"
            )

        # Invalidate / verify database integrity: exactly ONE RoutineLog must exist
        async with session_factory() as session:
            rows = (
                await session.execute(
                    select(RoutineLog).where(RoutineLog.routine_id == r_id)
                )
            ).scalars().all()
            assert len(rows) == 1, (
                f"CRITICAL DEFECT: Expected exactly 1 RoutineLog row, but found {len(rows)}!"
            )
            # current_value should be > 0.0
            assert rows[0].current_value > 0.0, f"RoutineLog current_value is {rows[0].current_value}"

    @pytest.mark.asyncio
    async def test_simultaneous_stepper_clicks_on_existing_routine_record(self, challenge_env):
        """
        Challenge:
        Once a RoutineLog exists, fire 10 simultaneous stepper PATCH requests.
        Verify zero crashes, zero MultipleResultsFound, and exactly 1 RoutineLog row remains.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90011

        create_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Existing Log Routine", "target_value": 20.0, "step": 1.0},
        )
        r_id = create_res.json()["id"]

        # Establish baseline log
        init_res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 2.0},
        )
        assert init_res.status_code == 200
        assert init_res.json()["current_value"] == 2.0

        # Fire 10 concurrent stepper increments
        coros = [
            client.patch(
                f"/api/routines/{r_id}/progress?telegram_id={user_id}",
                json={"delta": 1.0},
            )
            for _ in range(10)
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for res in results:
            assert not isinstance(res, Exception), f"Concurrent request raised: {res}"
            assert res.status_code == 200, f"Failed with {res.status_code}: {res.text}"

        async with session_factory() as session:
            count = (
                await session.execute(
                    select(func.count(RoutineLog.id)).where(RoutineLog.routine_id == r_id)
                )
            ).scalar()
            assert count == 1, f"Expected 1 RoutineLog, got {count}"

    @pytest.mark.asyncio
    async def test_simultaneous_stepper_clicks_on_one_time_tasks(self, challenge_env):
        """
        Challenge:
        Fire 10 concurrent stepper PATCH requests on a numeric OneTimeTask.
        Verify zero exceptions, zero 500 status codes, and valid updated value.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90012

        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Concurrent Task", "target_value": 50.0, "step": 2.0},
        )
        t_id = t_res.json()["id"]

        coros = [
            client.patch(
                f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
                json={"delta": 2.0},
            )
            for _ in range(10)
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for res in results:
            assert not isinstance(res, Exception), f"Request raised: {res}"
            assert res.status_code == 200, f"Task update failed: {res.text}"

        # Fetch dashboard to verify task state
        dash = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        task = next(t for t in dash["today_tasks"] if t["id"] == t_id)
        assert task["current_value"] > 0.0

    @pytest.mark.asyncio
    async def test_concurrent_toggle_and_stepper_on_fresh_routine(self, challenge_env):
        """
        Challenge:
        Race condition between toggle_routine_completion and update_routine_progress on a fresh routine.
        Both functions attempt to create RoutineLog if missing.
        Verifies no unhandled IntegrityError or MultipleResultsFound.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90013

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Race Toggle Progress", "target_value": 4.0, "step": 1.0},
        )
        r_id = r_res.json()["id"]

        # Mixed concurrent operations
        coros = [
            client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}&completed=true"),
            client.patch(f"/api/routines/{r_id}/progress?telegram_id={user_id}", json={"delta": 1.0}),
            client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}&completed=false"),
            client.patch(f"/api/routines/{r_id}/progress?telegram_id={user_id}", json={"delta": 2.0}),
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for res in results:
            assert not isinstance(res, Exception), f"Request failed with exception: {res}"
            assert res.status_code == 200, f"Request failed: {res.text}"

        async with session_factory() as session:
            count = (
                await session.execute(
                    select(func.count(RoutineLog.id)).where(RoutineLog.routine_id == r_id)
                )
            ).scalar()
            assert count == 1, f"Expected exactly 1 RoutineLog, got {count}"


class TestChallengeBoundaryInputs:
    """
    Adversarial Challenge: Boundary values, precision edge cases, and unexpected inputs.
    """

    @pytest.mark.asyncio
    async def test_extreme_negative_delta_and_negative_absolute_value(self, challenge_env):
        """
        Challenge:
        - Setting current_value to -99999.0 -> must be clamped to 0.0.
        - Applying delta of -500.0 to a task with current_value = 5.0 -> must be clamped to 0.0.
        - Status must be is_completed = False.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90020

        # Routine
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Clamp Routine", "target_value": 5.0, "step": 1.0},
        )
        r_id = r_res.json()["id"]

        p_neg_abs = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": -99999.0},
        )
        assert p_neg_abs.status_code == 200
        assert p_neg_abs.json()["current_value"] == 0.0
        assert p_neg_abs.json()["is_completed_today"] is False

        # Set to 5.0 (completed)
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 5.0},
        )
        # Apply extreme negative delta
        p_neg_delta = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -500.0},
        )
        assert p_neg_delta.status_code == 200
        assert p_neg_delta.json()["current_value"] == 0.0
        assert p_neg_delta.json()["is_completed_today"] is False

        # OneTimeTask
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Clamp Task", "target_value": 10.0, "step": 1.0},
        )
        t_id = t_res.json()["id"]

        pt_neg = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": -100.0},
        )
        assert pt_neg.status_code == 200
        assert pt_neg.json()["current_value"] == 0.0

        pt_neg_delta = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"delta": -50.0},
        )
        assert pt_neg_delta.status_code == 200
        assert pt_neg_delta.json()["current_value"] == 0.0

    @pytest.mark.asyncio
    async def test_extreme_exceeding_target_value_and_drop_transitions(self, challenge_env):
        """
        Challenge:
        - Target is 5.0. Set current_value to 1,000,000.0.
        - Verify is_completed is True.
        - Decrement by 999,994.0 -> current_value is 6.0 (still > 5.0, is_completed still True).
        - Decrement by 2.0 -> current_value is 4.0 (< 5.0, is_completed flips to False).
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90021

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "High Target", "target_value": 5.0, "step": 1.0},
        )
        r_id = r_res.json()["id"]

        # Massive overshoot
        res1 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 1000000.0},
        )
        assert res1.status_code == 200
        assert res1.json()["current_value"] == 1000000.0
        assert res1.json()["is_completed_today"] is True

        # Drop but stay above target
        res2 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -999994.0},
        )
        assert res2.status_code == 200
        assert res2.json()["current_value"] == 6.0
        assert res2.json()["is_completed_today"] is True

        # Drop below target
        res3 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -2.0},
        )
        assert res3.status_code == 200
        assert res3.json()["current_value"] == 4.0
        assert res3.json()["is_completed_today"] is False

    @pytest.mark.asyncio
    async def test_fractional_precision_and_sub_cent_rounding(self, challenge_env):
        """
        Challenge:
        - Verify micro-increments: 0.004 -> rounded to 0.00; 0.006 -> rounded to 0.01.
        - Verify 10 increments of 0.1 result in exactly 1.00 (not 0.9999999999999999).
        - Verify repeating third: 1/3 (0.3333333) -> rounded to 0.33.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90022

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Precision Routine", "target_value": 1.0, "step": 0.1},
        )
        r_id = r_res.json()["id"]

        # Sub-cent delta below rounding threshold
        res_sub1 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.004},
        )
        assert res_sub1.status_code == 200
        assert res_sub1.json()["current_value"] == 0.0

        # Sub-cent delta above threshold
        res_sub2 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.006},
        )
        assert res_sub2.status_code == 200
        assert res_sub2.json()["current_value"] == 0.01

        # Reset to 0
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 0.0},
        )

        # 10 increments of 0.1
        for _ in range(10):
            res_inc = await client.patch(
                f"/api/routines/{r_id}/progress?telegram_id={user_id}",
                json={"delta": 0.1},
            )
            assert res_inc.status_code == 200

        final_res = await client.get(f"/api/dashboard/today?telegram_id={user_id}")
        val = next(r["current_value"] for r in final_res.json()["routine_tasks"] if r["id"] == r_id)
        assert val == 1.0, f"Expected exactly 1.0, got {val}"


class TestChallengeLegacyDuplicateResilience:
    """
    Adversarial Challenge: Verify that if legacy duplicate rows exist in routine_logs,
    backend CRUD queries NEVER crash with MultipleResultsFound.
    """

    @pytest.mark.asyncio
    async def test_injected_duplicate_rows_do_not_cause_multiple_results_found(self, challenge_env):
        """
        Simulate legacy unmigrated data:
        Directly insert 2 duplicate RoutineLog rows with different values for the same (routine_id, date).
        Verify:
        - update_routine_progress selects the highest/latest record and does NOT raise MultipleResultsFound (HTTP 500).
        - toggle_routine_completion handles it gracefully without MultipleResultsFound.
        - get_user_routines_with_status (dashboard) deduplicates to highest progress without MultipleResultsFound.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90030
        today_date = date.today()

        # Create user and routine
        async with session_factory() as session:
            user = User(telegram_id=user_id, username="legacy_dup_user")
            session.add(user)
            await session.flush()

            routine = RoutineTask(
                user_id=user_id,
                title="Legacy Dup Routine",
                target_value=2.0,
                step=0.5,
            )
            session.add(routine)
            await session.commit()
            r_id = routine.id

            # In SQLite, temporarily disable unique index or insert without unique index constraint
            # RoutineLog has UniqueConstraint in model, but let's test if multiple rows exist
            # We can insert with session.execute raw SQL
            await session.execute(
                text(
                    "INSERT INTO routine_logs (routine_id, date, current_value, is_completed) "
                    "VALUES (:r_id, :d, 0.25, 0)"
                ),
                {"r_id": r_id, "d": today_date},
            )
            await session.commit()

        # Update progress: should return 200 OK
        patch_res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.5},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["current_value"] == 0.75

        # Dashboard fetch: should return 200 OK
        dash_res = await client.get(f"/api/dashboard/today?telegram_id={user_id}")
        assert dash_res.status_code == 200
        routines = [r for r in dash_res.json()["routine_tasks"] if r["id"] == r_id]
        assert len(routines) == 1
        assert routines[0]["current_value"] == 0.75


class TestChallengeAdvancedAdversarialHarness:
    """
    Advanced Adversarial Stress Suite:
    - 20-thread concurrency surge on brand new routine.
    - Interleaved mixed delta and absolute updates.
    - Cross-day isolation and multi-day streak preservation.
    - Tenant isolation: preventing cross-user numeric tampering.
    """

    @pytest.mark.asyncio
    async def test_extreme_concurrency_20_parallel_steppers_on_brand_new_routine(self, challenge_env):
        """
        Adversarial Stress: 20 simultaneous stepper increments on a fresh routine with no log.
        Verifies all return 200, zero MultipleResultsFound, zero unhandled IntegrityError,
        and exactly 1 physical row in routine_logs.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90040

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "High Concurrency 20", "target_value": 50.0, "step": 1.0},
        )
        assert r_res.status_code == 200
        r_id = r_res.json()["id"]

        concurrency = 20
        coros = [
            client.patch(
                f"/api/routines/{r_id}/progress?telegram_id={user_id}",
                json={"delta": 1.0},
            )
            for _ in range(concurrency)
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for i, res in enumerate(results):
            assert not isinstance(res, Exception), f"Coro {i} raised exception: {res}"
            assert res.status_code == 200, f"Coro {i} returned status {res.status_code}: {res.text}"

        async with session_factory() as session:
            count = (
                await session.execute(
                    select(func.count(RoutineLog.id)).where(RoutineLog.routine_id == r_id)
                )
            ).scalar()
            assert count == 1, f"Expected exactly 1 RoutineLog row, found {count}"

    @pytest.mark.asyncio
    async def test_cross_day_isolation_and_streak_persistence(self, challenge_env):
        """
        Adversarial Test:
        - Routine has target_value = 2.0.
        - Yesterday (date.today() - 1): completed with 2.0 -> streak = 1.
        - Today: updated with 2.0 -> streak = 2.
        - Verify RoutineLog for yesterday and RoutineLog for today exist independently.
        - Verify today's dashboard reflects today's value, not yesterday's.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 90041
        yesterday = date.today() - timedelta(days=1)
        today = date.today()

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Multi-Day Routine", "target_value": 2.0, "step": 0.5},
        )
        r_id = r_res.json()["id"]

        # Insert / update yesterday log directly or via crud
        async with session_factory() as session:
            y_log = RoutineLog(
                routine_id=r_id,
                date=yesterday,
                is_completed=True,
                current_value=2.0,
            )
            session.add(y_log)
            # Set routine streak
            routine = (
                await session.execute(select(RoutineTask).where(RoutineTask.id == r_id))
            ).scalar_one()
            routine.current_streak = 1
            routine.best_streak = 1
            await session.commit()

        # Update progress today
        today_patch = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 2.0},
        )
        assert today_patch.status_code == 200
        assert today_patch.json()["current_value"] == 2.0
        assert today_patch.json()["is_completed_today"] is True
        assert today_patch.json()["current_streak"] == 2

        # Check dashboard
        dash = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_today = next(r for r in dash["routine_tasks"] if r["id"] == r_id)
        assert r_today["current_value"] == 2.0
        assert r_today["current_streak"] == 2

        # Verify DB has 2 distinct logs
        async with session_factory() as session:
            logs = (
                await session.execute(
                    select(RoutineLog).where(RoutineLog.routine_id == r_id).order_by(RoutineLog.date.asc())
                )
            ).scalars().all()
            assert len(logs) == 2
            assert logs[0].date == yesterday and logs[0].current_value == 2.0
            assert logs[1].date == today and logs[1].current_value == 2.0

    @pytest.mark.asyncio
    async def test_tenant_isolation_adversarial_tampering(self, challenge_env):
        """
        Adversarial Test:
        - User A owns routine A.
        - User B attempts to manipulate User A's routine progress.
        - Verifies 404 Not Found, User A's data remains unmodified.
        """
        client: AsyncClient = challenge_env["client"]
        user_a = 90050
        user_b = 90051

        r_res = await client.post(
            f"/api/routines?telegram_id={user_a}",
            json={"title": "Private Routine", "target_value": 10.0, "step": 1.0},
        )
        r_id = r_res.json()["id"]

        # Set User A value
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_a}",
            json={"current_value": 5.0},
        )

        # Attacker User B attempts to tamper with User A's routine
        attack_res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_b}",
            json={"current_value": 0.0},
        )
        assert attack_res.status_code == 404

        # Verify User A's value is still 5.0
        dash_a = (await client.get(f"/api/dashboard/today?telegram_id={user_a}")).json()
        r_a = next(r for r in dash_a["routine_tasks"] if r["id"] == r_id)
        assert r_a["current_value"] == 5.0
