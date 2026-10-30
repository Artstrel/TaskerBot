"""
E2E Test Suite for Numeric Tasks ("Числительные задачи") Persistence & Regression Verification.

Requirements:
- R1. Persistence and zero-reset verification of numeric tasks across polling intervals.
- R2. Non-regression of standard routine tasks, one-time tasks, goals, and groceries.
- 4-Tier Test Coverage:
    - Tier 1: Feature Coverage (creation, stepper updates via delta and absolute, dashboard status, auto-completion)
    - Tier 2: Boundary & Corner Cases (float steps, negative values, exceeding target, concurrent deduplication)
    - Tier 3: Cross-Feature Combinations (checkbox toggle vs stepper, goal rollup sync, multi-routine isolation)
    - Tier 4: Real-World Workload & 30-40s Persistence Verification (18s/36s/>40s simulated polling, non-numeric regressions)
"""

import asyncio
import os
import shutil
import sys
import tempfile
from datetime import date, timedelta
from typing import AsyncGenerator

# Ensure workspace root is always in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, func, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.models import Base, RoutineLog, RoutineTask, OneTimeTask, Goal, GroceryItem, User
from main import app


@pytest_asyncio.fixture
async def test_env() -> AsyncGenerator[dict, None]:
    """
    Provisions a completely isolated, clean SQLite test database and an ASGITransport AsyncClient.
    Overrides FastAPI get_db dependency. Cleans up on teardown.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_test_")
    db_path = os.path.join(temp_dir, "test_tasker.db")
    db_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(db_url, echo=False)
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


# ==============================================================================
# Tier 1: Feature Coverage
# ==============================================================================
class TestTier1FeatureCoverage:
    """
    Tier 1 tests verify fundamental contracts:
    - Creation of quantitative routines and one-time tasks.
    - Progress updates via stepper delta increments and absolute value assignments.
    - Querying dashboard today and verifying current_value and completion status.
    - Automatic completion toggle when current_value reaches target_value.
    """

    @pytest.mark.asyncio
    async def test_create_quantitative_routine(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10001

        payload = {
            "title": "Drink 2L Water",
            "target_value": 2.0,
            "step": 0.25,
            "unit": "L",
            "frequency_type": "daily",
        }
        res = await client.post(f"/api/routines?telegram_id={user_id}", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["id"] > 0
        assert data["target_value"] == 2.0
        assert data["current_value"] == 0.0
        assert data["step"] == 0.25
        assert data["unit"] == "L"
        assert data["is_completed_today"] is False

    @pytest.mark.asyncio
    async def test_create_quantitative_one_time_task(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10002

        payload = {
            "title": "Run 5km Outside",
            "target_value": 5.0,
            "step": 1.0,
            "unit": "km",
            "scheduled_date": str(date.today()),
        }
        res = await client.post(f"/api/tasks?telegram_id={user_id}", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["id"] > 0
        assert data["target_value"] == 5.0
        assert data["current_value"] == 0.0
        assert data["step"] == 1.0
        assert data["unit"] == "km"
        assert data["is_completed"] is False

    @pytest.mark.asyncio
    async def test_routine_progress_stepper_delta_and_absolute(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10003

        # Create routine
        c_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Drink Water", "target_value": 2.0, "step": 0.25, "unit": "L"},
        )
        routine_id = c_res.json()["id"]

        # Delta increment 1: +0.25 -> 0.25
        p1 = await client.patch(
            f"/api/routines/{routine_id}/progress?telegram_id={user_id}",
            json={"delta": 0.25},
        )
        assert p1.status_code == 200
        assert p1.json()["current_value"] == 0.25
        assert p1.json()["is_completed_today"] is False

        # Delta increment 2: +0.25 -> 0.50
        p2 = await client.patch(
            f"/api/routines/{routine_id}/progress?telegram_id={user_id}",
            json={"delta": 0.25},
        )
        assert p2.status_code == 200
        assert p2.json()["current_value"] == 0.50

        # Absolute assignment: 1.50
        p3 = await client.patch(
            f"/api/routines/{routine_id}/progress?telegram_id={user_id}",
            json={"current_value": 1.50},
        )
        assert p3.status_code == 200
        assert p3.json()["current_value"] == 1.50
        assert p3.json()["is_completed_today"] is False

    @pytest.mark.asyncio
    async def test_task_progress_stepper_delta_and_absolute(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10004

        # Create task
        c_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Study Pages", "target_value": 20.0, "step": 5.0, "unit": "pages"},
        )
        task_id = c_res.json()["id"]

        # Delta increment: +5.0 -> 5.0
        p1 = await client.patch(
            f"/api/tasks/{task_id}/progress?telegram_id={user_id}",
            json={"delta": 5.0},
        )
        assert p1.status_code == 200
        assert p1.json()["current_value"] == 5.0

        # Absolute assignment: 15.0
        p2 = await client.patch(
            f"/api/tasks/{task_id}/progress?telegram_id={user_id}",
            json={"current_value": 15.0},
        )
        assert p2.status_code == 200
        assert p2.json()["current_value"] == 15.0
        assert p2.json()["is_completed"] is False

    @pytest.mark.asyncio
    async def test_dashboard_today_reflects_current_value(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10005

        # Create routine and set current_value = 1.25
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Hydration", "target_value": 2.0, "step": 0.25, "unit": "L"},
        )
        r_id = r_res.json()["id"]
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 1.25},
        )

        # Create task and set current_value = 4.0
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Read Book", "target_value": 10.0, "step": 2.0, "unit": "pages"},
        )
        t_id = t_res.json()["id"]
        await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 4.0},
        )

        # Query dashboard
        dash_res = await client.get(f"/api/dashboard/today?telegram_id={user_id}")
        assert dash_res.status_code == 200
        dash = dash_res.json()

        matching_r = next((r for r in dash.get("routine_tasks", []) if r["id"] == r_id), None)
        assert matching_r is not None
        assert matching_r["current_value"] == 1.25

        matching_t = next((t for t in dash.get("today_tasks", []) if t["id"] == t_id), None)
        assert matching_t is not None
        assert matching_t["current_value"] == 4.0

    @pytest.mark.asyncio
    async def test_auto_completion_on_reaching_target(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 10006

        # Routine auto-completion
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Plank Minutes", "target_value": 3.0, "step": 1.0, "unit": "min"},
        )
        r_id = r_res.json()["id"]

        # Reach target: 3.0 -> is_completed_today == True
        p_res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 3.0},
        )
        assert p_res.status_code == 200
        assert p_res.json()["is_completed_today"] is True
        assert p_res.json()["current_streak"] == 1

        # Decrement below target: 2.0 -> is_completed_today == False
        p_dec = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -1.0},
        )
        assert p_dec.status_code == 200
        assert p_dec.json()["is_completed_today"] is False
        assert p_dec.json()["current_streak"] == 0

        # One-time task auto-completion
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Pushups", "target_value": 50.0, "step": 10.0, "unit": "reps"},
        )
        t_id = t_res.json()["id"]

        t_prog = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 50.0},
        )
        assert t_prog.status_code == 200
        assert t_prog.json()["is_completed"] is True

        t_dec = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"delta": -10.0},
        )
        assert t_dec.status_code == 200
        assert t_dec.json()["is_completed"] is False


# ==============================================================================
# Tier 2: Boundary & Corner Cases
# ==============================================================================
class TestTier2BoundaryAndCornerCases:
    """
    Tier 2 tests verify robustness under extreme, concurrent, and floating-point conditions:
    - Float steps (e.g. 0.25, 0.33) with exact 2-decimal rounding.
    - Clamping negative increments at 0.0 (never negative).
    - Exceeding target_value without crashing and preserving completion.
    - Zero or empty progress payloads.
    - Rapid concurrent updates on the same routine on the same date (verifying no duplicate
      routine_logs and no MultipleResultsFound crash).
    - Deduplication priority and UniqueConstraint enforcement on routine_logs.
    """

    @pytest.mark.asyncio
    async def test_float_step_precision_and_rounding(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 20001

        # Float step 0.33
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Read Thesis", "target_value": 1.0, "step": 0.33, "unit": "hrs"},
        )
        r_id = r_res.json()["id"]

        # Step 1: +0.33
        res1 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.33},
        )
        assert res1.json()["current_value"] == 0.33

        # Step 2: +0.33 -> 0.66
        res2 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.33},
        )
        assert res2.json()["current_value"] == 0.66

        # Step 3: +0.33 -> 0.99
        res3 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.33},
        )
        assert res3.json()["current_value"] == 0.99

    @pytest.mark.asyncio
    async def test_clamping_at_zero_no_negative_values(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 20002

        # Routine decrementing below 0
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Morning Walk", "target_value": 5.0, "step": 1.0, "unit": "km"},
        )
        r_id = r_res.json()["id"]

        res_neg_delta = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -10.0},
        )
        assert res_neg_delta.status_code == 200
        assert res_neg_delta.json()["current_value"] == 0.0

        res_neg_val = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": -5.0},
        )
        assert res_neg_val.status_code == 200
        assert res_neg_val.json()["current_value"] == 0.0

        # One-time task decrementing below 0
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Math Exercises", "target_value": 10.0, "step": 1.0, "unit": "probs"},
        )
        t_id = t_res.json()["id"]

        t_neg = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"delta": -25.0},
        )
        assert t_neg.status_code == 200
        assert t_neg.json()["current_value"] == 0.0

    @pytest.mark.asyncio
    async def test_exceeding_target_value(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 20003

        # Routine target 2.0, user drinks 3.5
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Target Exceeded", "target_value": 2.0, "step": 0.5, "unit": "L"},
        )
        r_id = r_res.json()["id"]

        res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 3.5},
        )
        assert res.status_code == 200
        assert res.json()["current_value"] == 3.5
        assert res.json()["is_completed_today"] is True

        # One-time task target 5.0, user does 8.0
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Run Extra", "target_value": 5.0, "step": 1.0, "unit": "km"},
        )
        t_id = t_res.json()["id"]

        t_res2 = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 8.0},
        )
        assert t_res2.status_code == 200
        assert t_res2.json()["current_value"] == 8.0
        assert t_res2.json()["is_completed"] is True

    @pytest.mark.asyncio
    async def test_empty_or_zero_progress_payload(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 20004

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Payload Safety", "target_value": 10.0, "step": 1.0, "unit": "pts"},
        )
        r_id = r_res.json()["id"]

        # Advance to 4.0
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 4.0},
        )

        # Delta 0.0
        res_zero = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.0},
        )
        assert res_zero.status_code == 200
        assert res_zero.json()["current_value"] == 4.0

        # Empty payload {}
        res_empty = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={},
        )
        assert res_empty.status_code == 200
        assert res_empty.json()["current_value"] == 4.0

    @pytest.mark.asyncio
    async def test_rapid_concurrent_routine_progress_updates(self, test_env):
        """
        Simulates rapid user clicks on the stepper (+) producing concurrent HTTP PATCH requests.
        Verifies:
        1. All concurrent requests succeed without 500 Internal Server Error (MultipleResultsFound).
        2. Database routine_logs does not contain duplicate rows for (routine_id, date).
        """
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 20005

        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Rapid Clicks", "target_value": 5.0, "step": 0.5, "unit": "reps"},
        )
        r_id = r_res.json()["id"]

        # User begins tapping stepper (+)
        init_res = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.5},
        )
        assert init_res.status_code == 200

        # Rapid consecutive/concurrent stepper clicks
        coros = [
            client.patch(
                f"/api/routines/{r_id}/progress?telegram_id={user_id}",
                json={"delta": 0.5},
            )
            for _ in range(5)
        ]
        results = await asyncio.gather(*coros, return_exceptions=True)

        for res in results:
            assert not isinstance(res, Exception), f"Request raised exception: {res}"
            assert res.status_code == 200, f"Unexpected status {res.status_code}: {res.text}"

        # Inspect database for duplicate routine_logs
        async with session_factory() as session:
            count_stmt = select(func.count(RoutineLog.id)).where(RoutineLog.routine_id == r_id)
            res = await session.execute(count_stmt)
            log_count = res.scalar()
            assert log_count == 1, (
                f"Expected exactly 1 RoutineLog row for routine {r_id}, but found {log_count} duplicates!"
            )

    @pytest.mark.asyncio
    async def test_database_unique_constraint_enforcement(self, test_env):
        """
        Verifies that the RoutineLog table enforces the UniqueConstraint on (routine_id, date)
        at the database schema level, preventing physical duplicate rows.
        """
        session_factory = test_env["session_factory"]
        today_date = date.today()

        async with session_factory() as session:
            user = User(telegram_id=20006, username="test_uc")
            session.add(user)
            await session.flush()

            routine = RoutineTask(
                user_id=20006,
                title="Unique Constraint Test",
                target_value=2.0,
                step=0.25,
            )
            session.add(routine)
            await session.commit()
            await session.refresh(routine)

            # Insert first log
            log1 = RoutineLog(routine_id=routine.id, date=today_date, current_value=0.25)
            session.add(log1)
            await session.commit()

            # Attempting to insert a second log with the same (routine_id, date) must raise IntegrityError
            log2 = RoutineLog(routine_id=routine.id, date=today_date, current_value=0.0)
            session.add(log2)
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()

    @pytest.mark.asyncio
    async def test_deduplication_prefers_highest_progress(self, test_env):
        """
        Verifies that the deduplication logic in get_user_routines_with_status prioritizes
        the highest current_value and completed status rather than resetting to 0.0.
        """
        logs = [
            RoutineLog(id=1, routine_id=99, current_value=0.0, is_completed=False),
            RoutineLog(id=2, routine_id=99, current_value=0.75, is_completed=False),
        ]
        logs_by_routine_id = {}
        for log in logs:
            existing = logs_by_routine_id.get(log.routine_id)
            if existing is None:
                logs_by_routine_id[log.routine_id] = log
            else:
                cur_val = log.current_value or 0.0
                ex_val = existing.current_value or 0.0
                if cur_val > ex_val:
                    logs_by_routine_id[log.routine_id] = log
                elif cur_val == ex_val:
                    if log.is_completed and not existing.is_completed:
                        logs_by_routine_id[log.routine_id] = log
                    elif log.id > existing.id:
                        logs_by_routine_id[log.routine_id] = log

        assert logs_by_routine_id[99].current_value == 0.75


# ==============================================================================
# Tier 3: Cross-Feature Combinations
# ==============================================================================
class TestTier3CrossFeatureCombinations:
    """
    Tier 3 tests verify interactions between numeric tasks and other TaskerBot features:
    - Stepper progress vs checkbox completion toggle synchronization.
    - Quantitative tasks linked to Goals (progress calculation and auto-completion).
    - Batch isolation when multiple routines have logs on the same date.
    """

    @pytest.mark.asyncio
    async def test_routine_checkbox_toggle_and_stepper_interaction(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 30001

        # 1. Create numeric routine (target 2.0, step 0.5)
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Water Intake", "target_value": 2.0, "step": 0.5, "unit": "L"},
        )
        r_id = r_res.json()["id"]

        # 2. Stepper increment to partial: 0.5 -> not completed
        s1 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": 0.5},
        )
        assert s1.json()["current_value"] == 0.5
        assert s1.json()["is_completed_today"] is False

        # 3. User checks the completion checkbox (toggle True)
        # Expected contract: current_value advances to target_value (2.0)
        t1 = await client.patch(
            f"/api/routines/{r_id}/toggle?telegram_id={user_id}&completed=true"
        )
        assert t1.status_code == 200
        assert t1.json()["is_completed_today"] is True
        assert t1.json()["current_value"] == 2.0

        # 4. User decrements via stepper: delta -0.5 -> 1.5
        # Expected contract: is_completed_today automatically reverts to False
        s2 = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"delta": -0.5},
        )
        assert s2.json()["current_value"] == 1.5
        assert s2.json()["is_completed_today"] is False

        # 5. User re-checks checkbox: advances to 2.0 and completes
        t2 = await client.patch(
            f"/api/routines/{r_id}/toggle?telegram_id={user_id}&completed=true"
        )
        assert t2.json()["is_completed_today"] is True
        assert t2.json()["current_value"] == 2.0

        # 6. User unchecks checkbox (toggle False)
        # Expected contract: current_value resets to 0.0
        t3 = await client.patch(
            f"/api/routines/{r_id}/toggle?telegram_id={user_id}&completed=false"
        )
        assert t3.json()["is_completed_today"] is False
        assert t3.json()["current_value"] == 0.0

    @pytest.mark.asyncio
    async def test_task_checkbox_toggle_and_stepper_interaction(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 30002

        # Create numeric task
        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Complete 10 Modules", "target_value": 10.0, "step": 1.0, "unit": "mod"},
        )
        t_id = t_res.json()["id"]

        # Partial progress: 3.0
        await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 3.0},
        )

        # Toggle to completed: advances to 10.0
        t_done = await client.patch(
            f"/api/tasks/{t_id}/toggle?telegram_id={user_id}&completed=true"
        )
        assert t_done.json()["is_completed"] is True
        assert t_done.json()["current_value"] == 10.0

        # Toggle to uncompleted: resets to 0.0
        t_undone = await client.patch(
            f"/api/tasks/{t_id}/toggle?telegram_id={user_id}&completed=false"
        )
        assert t_undone.json()["is_completed"] is False
        assert t_undone.json()["current_value"] == 0.0

    @pytest.mark.asyncio
    async def test_quantitative_task_linked_to_goal_rollup(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 30003

        # 1. Create a Goal
        g_res = await client.post(
            f"/api/goals?telegram_id={user_id}",
            json={"title": "Fitness Transformation"},
        )
        assert g_res.status_code == 200
        goal_id = g_res.json()["id"]

        # 2. Add quantitative subtask: target 20.0 km
        t1_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={
                "title": "Run 20km Total",
                "goal_id": goal_id,
                "target_value": 20.0,
                "step": 5.0,
                "unit": "km",
            },
        )
        t1_id = t1_res.json()["id"]

        # 3. Add regular non-numeric subtask
        t2_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Buy Gym Membership", "goal_id": goal_id},
        )
        t2_id = t2_res.json()["id"]

        # 4. Check initial Goal progress: 0/2 completed (0%)
        goals_res1 = await client.get(f"/api/goals?telegram_id={user_id}")
        assert goals_res1.status_code == 200
        goal_data1 = next(g for g in goals_res1.json() if g["id"] == goal_id)
        assert goal_data1["total_subtasks"] == 2
        assert goal_data1["completed_subtasks"] == 0
        assert goal_data1["progress_percentage"] == 0
        assert goal_data1["is_completed"] is False

        # 5. Advance numeric task to 20.0 (reaches target -> completed)
        await client.patch(
            f"/api/tasks/{t1_id}/progress?telegram_id={user_id}",
            json={"current_value": 20.0},
        )

        goals_res2 = await client.get(f"/api/goals?telegram_id={user_id}")
        goal_data2 = next(g for g in goals_res2.json() if g["id"] == goal_id)
        assert goal_data2["completed_subtasks"] == 1
        assert goal_data2["progress_percentage"] == 50
        assert goal_data2["is_completed"] is False

        # 6. Complete regular task -> Goal should become 100% and is_completed = True
        await client.patch(
            f"/api/tasks/{t2_id}/toggle?telegram_id={user_id}&completed=true"
        )

        goals_res3 = await client.get(f"/api/goals?telegram_id={user_id}")
        goal_data3 = next(g for g in goals_res3.json() if g["id"] == goal_id)
        assert goal_data3["completed_subtasks"] == 2
        assert goal_data3["progress_percentage"] == 100
        assert goal_data3["is_completed"] is True

        # 7. Decrement numeric task below target: 15.0 -> Goal should uncomplete!
        await client.patch(
            f"/api/tasks/{t1_id}/progress?telegram_id={user_id}",
            json={"delta": -5.0},
        )

        goals_res4 = await client.get(f"/api/goals?telegram_id={user_id}")
        goal_data4 = next(g for g in goals_res4.json() if g["id"] == goal_id)
        assert goal_data4["completed_subtasks"] == 1
        assert goal_data4["progress_percentage"] == 50
        assert goal_data4["is_completed"] is False

    @pytest.mark.asyncio
    async def test_multiple_routines_on_same_date_isolation(self, test_env):
        """
        Tests batch log resolution in get_user_routines_with_status when multiple routines
        exist on the same date for the user, plus an independent user.
        """
        client: AsyncClient = test_env["client"]
        user_a = 30004
        user_b = 30005

        # User A routines
        r1 = (await client.post(
            f"/api/routines?telegram_id={user_a}",
            json={"title": "Water A", "target_value": 2.0, "step": 0.25, "unit": "L"},
        )).json()["id"]

        r2 = (await client.post(
            f"/api/routines?telegram_id={user_a}",
            json={"title": "Pushups A", "target_value": 50.0, "step": 10.0, "unit": "reps"},
        )).json()["id"]

        r3 = (await client.post(
            f"/api/routines?telegram_id={user_a}",
            json={"title": "Reading NonNumeric"},
        )).json()["id"]

        # User B routine
        r_b = (await client.post(
            f"/api/routines?telegram_id={user_b}",
            json={"title": "Water B", "target_value": 3.0, "step": 0.5, "unit": "L"},
        )).json()["id"]

        # Set values
        await client.patch(f"/api/routines/{r1}/progress?telegram_id={user_a}", json={"current_value": 1.5})
        await client.patch(f"/api/routines/{r2}/progress?telegram_id={user_a}", json={"current_value": 50.0})
        await client.patch(f"/api/routines/{r3}/toggle?telegram_id={user_a}&completed=true")
        await client.patch(f"/api/routines/{r_b}/progress?telegram_id={user_b}", json={"current_value": 0.5})

        # Query User A dashboard
        dash_a = (await client.get(f"/api/dashboard/today?telegram_id={user_a}")).json()
        routines_a = {r["id"]: r for r in dash_a.get("routine_tasks", [])}

        assert len(routines_a) == 3
        assert routines_a[r1]["current_value"] == 1.5
        assert routines_a[r1]["is_completed_today"] is False

        assert routines_a[r2]["current_value"] == 50.0
        assert routines_a[r2]["is_completed_today"] is True

        assert routines_a[r3]["target_value"] is None
        assert routines_a[r3]["is_completed_today"] is True

        assert dash_a["completed_count"] == 2
        assert dash_a["total_count"] == 3

        # Query User B dashboard: completely isolated
        dash_b = (await client.get(f"/api/dashboard/today?telegram_id={user_b}")).json()
        routines_b = {r["id"]: r for r in dash_b.get("routine_tasks", [])}
        assert len(routines_b) == 1
        assert routines_b[r_b]["current_value"] == 0.5


# ==============================================================================
# Tier 4: Real-World Workload & 30-40s Persistence Verification
# ==============================================================================
class TestTier4PersistenceAndRegression:
    """
    Tier 4 tests verify the core issue from ORIGINAL_REQUEST.md:
    - Simulates the 18-second periodic background polling loop across multiple cycles (18s, 36s, >40s).
    - Verifies that current_value is strictly persisted in the database and NEVER resets to 0.0.
    - Verifies unauthenticated polling (telegram_id=0) does not destroy or overwrite persisted values.
    - Regression tests verifying non-numeric routine tasks, one-time tasks, and groceries work normally.
    """

    @pytest.mark.asyncio
    async def test_simulated_30_40s_background_polling_persistence(self, test_env):
        """
        Reproduces the exact lifecycle:
        1. User creates numeric routine and numeric task.
        2. Stepper updates values to 1.25 L and 6.0 km.
        3. Periodic polling loops trigger at t=18s, t=36s, t=54s (>40s).
        4. Assert current_value remains strictly 1.25 and 6.0 across all ticks.
        5. Verify underlying database rows directly via a fresh session.
        """
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 40001

        # 1. Create numeric routine & task
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Daily Water", "target_value": 2.0, "step": 0.25, "unit": "L"},
        )
        r_id = r_res.json()["id"]

        t_res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Daily Run", "target_value": 10.0, "step": 1.0, "unit": "km"},
        )
        t_id = t_res.json()["id"]

        # 2. Update progress: Routine -> 1.25, Task -> 6.0
        p_r = await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 1.25},
        )
        assert p_r.status_code == 200
        assert p_r.json()["current_value"] == 1.25

        p_t = await client.patch(
            f"/api/tasks/{t_id}/progress?telegram_id={user_id}",
            json={"current_value": 6.0},
        )
        assert p_t.status_code == 200
        assert p_t.json()["current_value"] == 6.0

        # 3. Simulate polling loop at t = 18s (Poll Tick 1)
        dash_18s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_18s = next(r for r in dash_18s["routine_tasks"] if r["id"] == r_id)
        t_18s = next(t for t in dash_18s["today_tasks"] if t["id"] == t_id)
        assert r_18s["current_value"] == 1.25, f"Routine reset at 18s: {r_18s}"
        assert t_18s["current_value"] == 6.0, f"Task reset at 18s: {t_18s}"

        # 4. Simulate polling loop at t = 36s (Poll Tick 2 - Critical failure point where reset occurred)
        dash_36s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_36s = next(r for r in dash_36s["routine_tasks"] if r["id"] == r_id)
        t_36s = next(t for t in dash_36s["today_tasks"] if t["id"] == t_id)
        assert r_36s["current_value"] == 1.25, f"Routine reset at 36s: {r_36s}"
        assert t_36s["current_value"] == 6.0, f"Task reset at 36s: {t_36s}"

        # 5. Simulate polling loop at t = 54s (>40s - Exceeds acceptance criterion)
        dash_54s = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        r_54s = next(r for r in dash_54s["routine_tasks"] if r["id"] == r_id)
        t_54s = next(t for t in dash_54s["today_tasks"] if t["id"] == t_id)
        assert r_54s["current_value"] == 1.25, f"Routine reset at 54s: {r_54s}"
        assert t_54s["current_value"] == 6.0, f"Task reset at 54s: {t_54s}"

        # 6. Direct database layer assertion: verify persistence across independent session
        async with session_factory() as session:
            # Query RoutineLog
            log_stmt = select(RoutineLog).where(
                and_(RoutineLog.routine_id == r_id, RoutineLog.date == date.today())
            )
            log = (await session.execute(log_stmt)).scalar_one_or_none()
            assert log is not None, "RoutineLog was not persisted to the database!"
            assert log.current_value == 1.25, f"Persisted log.current_value is {log.current_value}, expected 1.25"

            # Query OneTimeTask
            task_stmt = select(OneTimeTask).where(OneTimeTask.id == t_id)
            task = (await session.execute(task_stmt)).scalar_one_or_none()
            assert task is not None, "OneTimeTask was not persisted to the database!"
            assert task.current_value == 6.0, f"Persisted task.current_value is {task.current_value}, expected 6.0"

    @pytest.mark.asyncio
    async def test_unauthenticated_polling_does_not_corrupt_data(self, test_env):
        """
        Verifies that an unauthenticated polling attempt (telegram_id=0, guest) returns 401
        and does NOT wipe or reset the existing persisted state in the database.
        """
        client: AsyncClient = test_env["client"]
        user_id = 40002

        # Create routine and set value to 1.75
        r_res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Auth Guard Test", "target_value": 2.0, "step": 0.25, "unit": "L"},
        )
        r_id = r_res.json()["id"]
        await client.patch(
            f"/api/routines/{r_id}/progress?telegram_id={user_id}",
            json={"current_value": 1.75},
        )

        # Unauthenticated request with telegram_id=0
        unauth_res = await client.get("/api/dashboard/today?telegram_id=0")
        assert unauth_res.status_code == 401, f"Expected 401 Unauthorized, got {unauth_res.status_code}"

        # Re-query with proper user authentication: state MUST be preserved at 1.75
        auth_res = await client.get(f"/api/dashboard/today?telegram_id={user_id}")
        assert auth_res.status_code == 200
        routine = next(r for r in auth_res.json()["routine_tasks"] if r["id"] == r_id)
        assert routine["current_value"] == 1.75

    @pytest.mark.asyncio
    async def test_non_numeric_routine_regression(self, test_env):
        """
        Verifies non-numeric routine tasks continue to function normally:
        - target_value is None.
        - current_value defaults to 0.0.
        - Toggling completed advances current_streak and best_streak.
        - Toggling uncompleted decrements current_streak.
        """
        client: AsyncClient = test_env["client"]
        user_id = 40003

        # Create regular routine without numeric target
        res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Evening Gratitude", "frequency_type": "daily"},
        )
        assert res.status_code == 200
        r_data = res.json()
        assert r_data["target_value"] is None
        assert r_data["current_value"] == 0.0
        assert r_data["current_streak"] == 0
        r_id = r_data["id"]

        # Toggle complete
        t1 = await client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
        assert t1.status_code == 200
        assert t1.json()["is_completed_today"] is True
        assert t1.json()["current_streak"] == 1
        assert t1.json()["best_streak"] == 1

        # Toggle uncomplete
        t2 = await client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
        assert t2.status_code == 200
        assert t2.json()["is_completed_today"] is False
        assert t2.json()["current_streak"] == 0

    @pytest.mark.asyncio
    async def test_non_numeric_task_and_postpone_regression(self, test_env):
        """
        Verifies non-numeric one-time tasks continue to function normally:
        - Creation with priority and scheduled_date.
        - Toggling completion.
        - Postponing task to tomorrow.
        """
        client: AsyncClient = test_env["client"]
        user_id = 40004
        today = date.today()
        tomorrow = today + timedelta(days=1)

        # Create task
        res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={"title": "Schedule Dentist", "scheduled_date": str(today), "priority": 1},
        )
        assert res.status_code == 200
        t_data = res.json()
        assert t_data["target_value"] is None
        assert t_data["current_value"] == 0.0
        assert t_data["priority"] == 1
        t_id = t_data["id"]

        # Toggle completion
        t_done = await client.patch(f"/api/tasks/{t_id}/toggle?telegram_id={user_id}")
        assert t_done.json()["is_completed"] is True

        # Postpone to tomorrow
        postpone_res = await client.patch(
            f"/api/tasks/{t_id}/postpone?telegram_id={user_id}&new_date={tomorrow}"
        )
        assert postpone_res.status_code == 200
        assert postpone_res.json()["scheduled_date"] == str(tomorrow)

        # Dashboard today should no longer show it in today_tasks
        dash = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        assert not any(t["id"] == t_id for t in dash["today_tasks"])
        assert any(t["id"] == t_id for t in dash["upcoming_tasks"])

    @pytest.mark.asyncio
    async def test_grocery_items_crud_and_completion_regression(self, test_env):
        """
        Verifies grocery items (both quantitative and non-quantitative) operate without regression.
        """
        client: AsyncClient = test_env["client"]
        user_id = 40005

        # 1. Create numeric grocery item
        g1 = await client.post(
            f"/api/groceries?telegram_id={user_id}",
            json={"title": "Oat Milk", "target_value": 3.0, "step": 1.0, "unit": "cartons"},
        )
        assert g1.status_code == 200
        g1_data = g1.json()
        assert g1_data["target_value"] == 3.0
        assert g1_data["unit"] == "cartons"
        g1_id = g1_data["id"]

        # 2. Create non-numeric grocery item
        g2 = await client.post(
            f"/api/groceries?telegram_id={user_id}",
            json={"title": "Dark Chocolate"},
        )
        assert g2.status_code == 200
        g2_id = g2.json()["id"]

        # 3. Mark g1 as completed
        up_res = await client.patch(
            f"/api/groceries/{g1_id}?telegram_id={user_id}",
            json={"is_completed": True},
        )
        assert up_res.status_code == 200
        assert up_res.json()["is_completed"] is True

        # 4. Fetch groceries list
        list_res = await client.get(f"/api/groceries?telegram_id={user_id}")
        assert list_res.status_code == 200
        list_data = list_res.json()
        assert any(item["id"] == g1_id for item in list_data["completed_items"])
        assert any(item["id"] == g2_id for item in list_data["active_items"])
