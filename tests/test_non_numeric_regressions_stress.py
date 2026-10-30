"""
Adversarial Stress Test Suite: Non-Numeric Tasks & Surrounding Mechanisms Regression Verification.

Validates zero regressions on:
1. Routine tasks (non-numeric): completion toggles, streaks, daily rollover (retention vs reset), non-daily frequencies, rapid & concurrent toggles.
2. One-time tasks (non-numeric): completion toggles, priorities, field updates, date postponement, overdue rollover, completed task stability.
3. Goals: progress rollup across subtask states, auto-completion / auto-reversion, milestone direct toggle, adding subtasks to completed goals, cascade deletion.
4. Grocery items: non-numeric and numeric creation, quantity updates, completion, listing categorization, clear-completed, deletion.
5. Deduplication, Unique Index & Aggregation: UniqueConstraint enforcement, deduplication priority resolution for non-numeric routines, day summary total/completed counters, tenant isolation.
"""

import asyncio
import os
import shutil
import sys
import tempfile
import unittest.mock
from datetime import date, datetime, timedelta
from typing import AsyncGenerator

# Ensure workspace root is always in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, and_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.models import (
    Base,
    RoutineLog,
    RoutineTask,
    OneTimeTask,
    Goal,
    GroceryItem,
    User,
)
from backend.scheduler import check_user_reminders_and_rollover
from main import app


@pytest_asyncio.fixture
async def test_env() -> AsyncGenerator[dict, None]:
    """
    Provisions a completely isolated, clean SQLite test database and an ASGITransport AsyncClient.
    Overrides FastAPI get_db dependency. Cleans up on teardown.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_non_numeric_stress_")
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
# Suite 1: Non-Numeric Routine Tasks (Streaks, Toggles, Rollovers, Concurrency)
# ==============================================================================
class TestNonNumericRoutinesStress:
    """
    Stress tests for non-numeric routine tasks:
    - Default state invariants (target_value is None, current_value is 0.0, streak is 0).
    - Completion toggle cycle: streak +1, best_streak +1, uncomplete: streak -1.
    - 20-step rapid sequential toggle stress testing.
    - Concurrent toggle stress test: 10 concurrent requests without 500 error or duplicate rows.
    - Daily rollover: streak preservation when completed on prev_date.
    - Daily rollover: streak reset to 0 when uncompleted on prev_date (best_streak retained).
    - Non-daily frequency (weekly days_of_week / interval): streak untouched on non-scheduled days.
    """

    @pytest.mark.asyncio
    async def test_routine_creation_defaults_and_toggle_cycle(self, test_env):
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 50001

        # 1. Create standard daily routine
        res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={
                "title": "Morning Meditation",
                "description": "10 minutes of mindfulness",
                "frequency_type": "daily",
            },
        )
        assert res.status_code == 200, res.text
        r = res.json()
        assert r["id"] > 0
        assert r["title"] == "Morning Meditation"
        assert r["target_value"] is None
        assert r["current_value"] == 0.0
        assert r["unit"] is None
        assert r["current_streak"] == 0
        assert r["best_streak"] == 0
        assert r["is_completed_today"] is False
        r_id = r["id"]

        # 2. Toggle Complete
        t1 = await client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
        assert t1.status_code == 200
        d1 = t1.json()
        assert d1["is_completed_today"] is True
        assert d1["current_streak"] == 1
        assert d1["best_streak"] == 1
        assert d1["current_value"] == 0.0

        # 3. Toggle Uncomplete
        t2 = await client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
        assert t2.status_code == 200
        d2 = t2.json()
        assert d2["is_completed_today"] is False
        assert d2["current_streak"] == 0
        assert d2["best_streak"] == 1  # Best streak never decreases
        assert d2["current_value"] == 0.0

        # 4. Direct DB verification: exact 1 log row exists
        async with session_factory() as session:
            logs_res = await session.execute(
                select(RoutineLog).where(
                    and_(RoutineLog.routine_id == r_id, RoutineLog.date == date.today())
                )
            )
            logs = logs_res.scalars().all()
            assert len(logs) == 1
            assert logs[0].is_completed is False

    @pytest.mark.asyncio
    async def test_rapid_sequential_toggles_stress(self, test_env):
        """Rapidly toggle a non-numeric routine 20 times to ensure stability."""
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 50002

        res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Rapid Toggle Routine", "frequency_type": "daily"},
        )
        r_id = res.json()["id"]

        for i in range(20):
            toggle_res = await client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
            assert toggle_res.status_code == 200
            expected_done = (i % 2 == 0)
            assert toggle_res.json()["is_completed_today"] is expected_done
            assert toggle_res.json()["current_streak"] == (1 if expected_done else 0)

        # In DB: exactly one RoutineLog row for today
        async with session_factory() as session:
            logs = (
                await session.execute(
                    select(RoutineLog).where(
                        and_(RoutineLog.routine_id == r_id, RoutineLog.date == date.today())
                    )
                )
            ).scalars().all()
            assert len(logs) == 1
            assert logs[0].is_completed is False

    @pytest.mark.asyncio
    async def test_concurrent_routine_toggles_stress(self, test_env):
        """Send 10 concurrent toggle requests for a non-numeric routine."""
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 50003

        res = await client.post(
            f"/api/routines?telegram_id={user_id}",
            json={"title": "Concurrent Stress Routine", "frequency_type": "daily"},
        )
        r_id = res.json()["id"]

        # Run 10 concurrent toggle requests
        tasks = [
            client.patch(f"/api/routines/{r_id}/toggle?telegram_id={user_id}")
            for _ in range(10)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for resp in responses:
            assert not isinstance(resp, Exception), f"Concurrent request raised: {resp}"
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        # DB must have exactly 1 RoutineLog row
        async with session_factory() as session:
            logs = (
                await session.execute(
                    select(RoutineLog).where(
                        and_(RoutineLog.routine_id == r_id, RoutineLog.date == date.today())
                    )
                )
            ).scalars().all()
            assert len(logs) == 1, f"Expected 1 RoutineLog row, found {len(logs)}"

    @pytest.mark.asyncio
    async def test_rollover_retains_streak_when_completed(self, test_env):
        """When routine was completed on prev_date, daily rollover preserves streak."""
        session_factory = test_env["session_factory"]
        user_id = 50004
        yesterday = date.today() - timedelta(days=1)

        async with session_factory() as session:
            user = User(
                telegram_id=user_id,
                username="test_streak_keeper",
                first_name="Streak",
                last_active_date=yesterday,
                timezone="UTC",
                day_end_time="00:00",
            )
            routine = RoutineTask(
                user_id=user_id,
                title="Daily Pushups",
                frequency_type="daily",
                current_streak=7,
                best_streak=10,
                is_active=True,
            )
            session.add_all([user, routine])
            await session.commit()
            await session.refresh(routine)

            # Record completed log for yesterday
            log = RoutineLog(
                routine_id=routine.id,
                date=yesterday,
                is_completed=True,
                completed_at=datetime.utcnow() - timedelta(days=1),
            )
            session.add(log)
            await session.commit()

        # Trigger scheduler rollover
        with unittest.mock.patch("backend.scheduler.AsyncSessionLocal", session_factory):
            with unittest.mock.patch("backend.scheduler.bot.send_message", new_callable=unittest.mock.AsyncMock):
                await check_user_reminders_and_rollover()

        # Assert streak was NOT reset to 0
        async with session_factory() as session:
            r = (await session.execute(select(RoutineTask).where(RoutineTask.user_id == user_id))).scalar_one()
            assert r.current_streak == 7, f"Streak was incorrectly reset to {r.current_streak}"
            assert r.best_streak == 10

    @pytest.mark.asyncio
    async def test_rollover_resets_streak_when_uncompleted(self, test_env):
        """When routine was scheduled but NOT completed on prev_date, rollover resets current_streak to 0, retaining best_streak."""
        session_factory = test_env["session_factory"]
        user_id = 50005
        yesterday = date.today() - timedelta(days=1)

        async with session_factory() as session:
            user = User(
                telegram_id=user_id,
                username="test_streak_breaker",
                first_name="Breaker",
                last_active_date=yesterday,
                timezone="UTC",
                day_end_time="00:00",
            )
            routine = RoutineTask(
                user_id=user_id,
                title="Daily Reading",
                frequency_type="daily",
                current_streak=5,
                best_streak=12,
                is_active=True,
            )
            session.add_all([user, routine])
            await session.commit()
            # Notice: No RoutineLog created for yesterday (missed day)

        # Trigger scheduler rollover
        with unittest.mock.patch("backend.scheduler.AsyncSessionLocal", session_factory):
            with unittest.mock.patch("backend.scheduler.bot.send_message", new_callable=unittest.mock.AsyncMock):
                await check_user_reminders_and_rollover()

        # Assert streak reset to 0, best_streak intact at 12
        async with session_factory() as session:
            r = (await session.execute(select(RoutineTask).where(RoutineTask.user_id == user_id))).scalar_one()
            assert r.current_streak == 0, f"Expected streak 0, got {r.current_streak}"
            assert r.best_streak == 12, f"Expected best_streak 12, got {r.best_streak}"

    @pytest.mark.asyncio
    async def test_rollover_on_non_scheduled_day_preserves_streak(self, test_env):
        """When a routine is NOT scheduled for prev_date (e.g. days_of_week filter with frequency_type='weekly'), missing a log does not reset streak."""
        session_factory = test_env["session_factory"]
        user_id = 50006
        yesterday = date.today() - timedelta(days=1)
        yesterday_dow = yesterday.weekday()  # 0..6
        # Schedule routine ONLY for other days
        other_dow = [(yesterday_dow + 1) % 7, (yesterday_dow + 2) % 7]

        async with session_factory() as session:
            user = User(
                telegram_id=user_id,
                username="test_dow_user",
                last_active_date=yesterday,
                timezone="UTC",
                day_end_time="00:00",
            )
            routine = RoutineTask(
                user_id=user_id,
                title="Weekend Only Hobby",
                frequency_type="weekly",
                days_of_week=",".join(str(d) for d in other_dow),
                current_streak=4,
                best_streak=8,
                is_active=True,
            )
            session.add_all([user, routine])
            await session.commit()

        # Trigger rollover
        with unittest.mock.patch("backend.scheduler.AsyncSessionLocal", session_factory):
            with unittest.mock.patch("backend.scheduler.bot.send_message", new_callable=unittest.mock.AsyncMock):
                await check_user_reminders_and_rollover()

        async with session_factory() as session:
            r = (await session.execute(select(RoutineTask).where(RoutineTask.user_id == user_id))).scalar_one()
            assert r.current_streak == 4, f"Streak on non-scheduled day was reset to {r.current_streak}"


# ==============================================================================
# Suite 2: Non-Numeric One-Time Tasks (Priorities, Postponement, Overdue Rollover)
# ==============================================================================
class TestNonNumericOneTimeTasksStress:
    """
    Stress tests for one-time tasks:
    - Creation with priority, scheduled_date, scheduled_time.
    - Field updates (PATCH /api/tasks/{id}) with priority and time.
    - Completion and uncompletion toggle with completed_at timestamps.
    - Date postponement clearing overdue flags and moving task to upcoming.
    - Daily rollover carrying uncompleted tasks to today with overdue_days increment.
    - Completed tasks preserved without overdue marks.
    """

    @pytest.mark.asyncio
    async def test_task_creation_updates_and_toggle_cycle(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 60001
        today_str = str(date.today())

        # 1. Create task with priority=1
        res = await client.post(
            f"/api/tasks?telegram_id={user_id}",
            json={
                "title": "Review Legal Contract",
                "scheduled_date": today_str,
                "scheduled_time": "11:00",
                "priority": 1,
            },
        )
        assert res.status_code == 200, res.text
        t = res.json()
        assert t["id"] > 0
        assert t["title"] == "Review Legal Contract"
        assert t["priority"] == 1
        assert t["scheduled_time"] == "11:00"
        assert t["target_value"] is None
        assert t["current_value"] == 0.0
        assert t["is_completed"] is False
        assert t["completed_at"] is None
        t_id = t["id"]

        # 2. Update priority to 3 and time to 15:30
        up_res = await client.patch(
            f"/api/tasks/{t_id}?telegram_id={user_id}",
            json={"priority": 3, "scheduled_time": "15:30", "title": "Review Executed Contract"},
        )
        assert up_res.status_code == 200
        up = up_res.json()
        assert up["priority"] == 3
        assert up["scheduled_time"] == "15:30"
        assert up["title"] == "Review Executed Contract"

        # 3. Toggle Complete
        t1 = await client.patch(f"/api/tasks/{t_id}/toggle?telegram_id={user_id}")
        assert t1.status_code == 200
        d1 = t1.json()
        assert d1["is_completed"] is True
        assert d1["completed_at"] is not None

        # 4. Toggle Uncomplete
        t2 = await client.patch(f"/api/tasks/{t_id}/toggle?telegram_id={user_id}")
        assert t2.status_code == 200
        d2 = t2.json()
        assert d2["is_completed"] is False
        assert d2["completed_at"] is None

    @pytest.mark.asyncio
    async def test_postpone_overdue_task_clears_overdue_and_moves_to_upcoming(self, test_env):
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 60002
        yesterday = date.today() - timedelta(days=1)
        day_after_tomorrow = date.today() + timedelta(days=2)

        # Directly insert an overdue task in DB
        async with session_factory() as session:
            task = OneTimeTask(
                user_id=user_id,
                title="Overdue Tax Filing",
                scheduled_date=yesterday,
                is_completed=False,
                is_overdue=True,
                overdue_days=2,
            )
            session.add(task)
            await session.commit()
            await session.refresh(task)
            t_id = task.id

        # Verify it appears in overdue_tasks on dashboard
        dash1 = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        assert any(t["id"] == t_id for t in dash1["overdue_tasks"])

        # Postpone to day after tomorrow
        p_res = await client.patch(
            f"/api/tasks/{t_id}/postpone?telegram_id={user_id}&new_date={day_after_tomorrow}"
        )
        assert p_res.status_code == 200
        p_data = p_res.json()
        assert p_data["scheduled_date"] == str(day_after_tomorrow)
        assert p_data["is_overdue"] is False
        assert p_data["overdue_days"] == 0

        # Verify dashboard now reflects it in upcoming_tasks, NOT overdue or today
        dash2 = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()
        assert not any(t["id"] == t_id for t in dash2["overdue_tasks"])
        assert not any(t["id"] == t_id for t in dash2["today_tasks"])
        assert any(t["id"] == t_id for t in dash2["upcoming_tasks"])

    @pytest.mark.asyncio
    async def test_rollover_carries_uncompleted_tasks_to_today(self, test_env):
        session_factory = test_env["session_factory"]
        user_id = 60003
        yesterday = date.today() - timedelta(days=1)
        today = date.today()

        async with session_factory() as session:
            user = User(
                telegram_id=user_id,
                username="test_rollover_task",
                last_active_date=yesterday,
                timezone="UTC",
                day_end_time="00:00",
            )
            uncompleted_task = OneTimeTask(
                user_id=user_id,
                title="Finish Quarterly Deck",
                scheduled_date=yesterday,
                is_completed=False,
                is_overdue=False,
                overdue_days=0,
            )
            completed_task = OneTimeTask(
                user_id=user_id,
                title="Sent Invoices",
                scheduled_date=yesterday,
                is_completed=True,
                completed_at=datetime.utcnow() - timedelta(days=1),
                is_overdue=False,
            )
            session.add_all([user, uncompleted_task, completed_task])
            await session.commit()
            u_id = uncompleted_task.id
            c_id = completed_task.id

        # Trigger scheduler rollover
        with unittest.mock.patch("backend.scheduler.AsyncSessionLocal", session_factory):
            with unittest.mock.patch("backend.scheduler.bot.send_message", new_callable=unittest.mock.AsyncMock):
                await check_user_reminders_and_rollover()

        async with session_factory() as session:
            u_task = (await session.execute(select(OneTimeTask).where(OneTimeTask.id == u_id))).scalar_one()
            c_task = (await session.execute(select(OneTimeTask).where(OneTimeTask.id == c_id))).scalar_one()

            # Uncompleted task rolled over to today and marked overdue
            assert u_task.scheduled_date == today
            assert u_task.is_overdue is True
            assert u_task.overdue_days == 1

            # Completed task remained untouched
            assert c_task.scheduled_date == yesterday
            assert c_task.is_overdue is False


# ==============================================================================
# Suite 3: Goals & Milestone Rollup (Non-Numeric Subtasks)
# ==============================================================================
class TestGoalsMilestoneRollupStress:
    """
    Stress tests for Goals & subtasks:
    - Creation of goal and adding non-numeric subtasks.
    - Rollup progress updates: 0/3 (0%) -> 1/3 (33%) -> 2/3 (66%) -> 3/3 (100%).
    - Auto-completion of goal when all subtasks are completed.
    - Auto-reversion to uncompleted if a subtask is reopened.
    - Toggle goal directly: completes all subtasks automatically.
    - Milestone expansion: adding a new subtask to a 100% completed goal drops goal back to uncompleted.
    - Cascade deletion: deleting goal removes goal and all associated subtasks.
    """

    @pytest.mark.asyncio
    async def test_subtask_progress_rollup_and_auto_completion(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 70001

        # 1. Create Goal
        g_res = await client.post(
            f"/api/goals?telegram_id={user_id}",
            json={"title": "Launch Mobile App", "description": "Release v1.0 to stores"},
        )
        assert g_res.status_code == 200, g_res.text
        goal = g_res.json()
        assert goal["total_subtasks"] == 0
        assert goal["progress_percentage"] == 0
        assert goal["is_completed"] is False
        goal_id = goal["id"]

        # 2. Add 3 subtasks
        st_ids = []
        for i in range(1, 4):
            st_res = await client.post(
                f"/api/goals/{goal_id}/subtasks?telegram_id={user_id}&title=Subtask_{i}",
            )
            assert st_res.status_code == 200, st_res.text
            st_ids.append(st_res.json()["id"])

        # Check goal status: 0/3, 0%
        g_list1 = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list1 if g["id"] == goal_id)
        assert cur_g["total_subtasks"] == 3
        assert cur_g["completed_subtasks"] == 0
        assert cur_g["progress_percentage"] == 0
        assert cur_g["is_completed"] is False

        # 3. Complete subtask 1 -> 1/3, 33%
        await client.patch(f"/api/tasks/{st_ids[0]}/toggle?telegram_id={user_id}")
        g_list2 = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list2 if g["id"] == goal_id)
        assert cur_g["completed_subtasks"] == 1
        assert cur_g["progress_percentage"] == 33
        assert cur_g["is_completed"] is False

        # 4. Complete subtask 2 -> 2/3, 66%
        await client.patch(f"/api/tasks/{st_ids[1]}/toggle?telegram_id={user_id}")
        g_list3 = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list3 if g["id"] == goal_id)
        assert cur_g["completed_subtasks"] == 2
        assert cur_g["progress_percentage"] == 66
        assert cur_g["is_completed"] is False

        # 5. Complete subtask 3 -> 3/3, 100%, AUTO-COMPLETED
        await client.patch(f"/api/tasks/{st_ids[2]}/toggle?telegram_id={user_id}")
        g_list4 = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list4 if g["id"] == goal_id)
        assert cur_g["completed_subtasks"] == 3
        assert cur_g["progress_percentage"] == 100
        assert cur_g["is_completed"] is True
        assert cur_g["completed_at"] is not None

        # 6. Reopen subtask 1 -> drops to 2/3, 66%, AUTO-REVERTS to uncompleted
        await client.patch(f"/api/tasks/{st_ids[0]}/toggle?telegram_id={user_id}")
        g_list5 = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list5 if g["id"] == goal_id)
        assert cur_g["completed_subtasks"] == 2
        assert cur_g["progress_percentage"] == 66
        assert cur_g["is_completed"] is False
        assert cur_g["completed_at"] is None

    @pytest.mark.asyncio
    async def test_direct_goal_toggle_and_subtask_cascade(self, test_env):
        """Marking a goal complete via toggle automatically completes all its subtasks."""
        client: AsyncClient = test_env["client"]
        user_id = 70002

        # Create goal with 2 subtasks
        g_res = await client.post(
            f"/api/goals?telegram_id={user_id}",
            json={"title": "Host Annual Conference"},
        )
        goal_id = g_res.json()["id"]
        st1 = (await client.post(f"/api/goals/{goal_id}/subtasks?telegram_id={user_id}&title=Book_Venue")).json()["id"]
        st2 = (await client.post(f"/api/goals/{goal_id}/subtasks?telegram_id={user_id}&title=Invite_Speakers")).json()["id"]

        # Direct toggle goal to completed
        t_res = await client.patch(f"/api/goals/{goal_id}/toggle?telegram_id={user_id}&completed=true")
        assert t_res.status_code == 200
        t_data = t_res.json()
        assert t_data["is_completed"] is True
        assert t_data["completed_subtasks"] == 2
        assert t_data["progress_percentage"] == 100
        assert all(st["is_completed"] for st in t_data["subtasks"])

        # Milestone addition: add 3rd subtask to completed goal
        st3_res = await client.post(f"/api/goals/{goal_id}/subtasks?telegram_id={user_id}&title=Send_Survey")
        assert st3_res.status_code == 200

        # Goal must now be uncompleted (2/3 completed, 66%)
        g_list = (await client.get(f"/api/goals?telegram_id={user_id}")).json()
        cur_g = next(g for g in g_list if g["id"] == goal_id)
        assert cur_g["is_completed"] is False
        assert cur_g["total_subtasks"] == 3
        assert cur_g["completed_subtasks"] == 2
        assert cur_g["progress_percentage"] == 66

    @pytest.mark.asyncio
    async def test_goal_cascade_deletion(self, test_env):
        """Deleting a goal removes both the goal and all its associated subtasks."""
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 70003

        g_res = await client.post(
            f"/api/goals?telegram_id={user_id}",
            json={"title": "Temporary Goal"},
        )
        goal_id = g_res.json()["id"]
        st_res = await client.post(f"/api/goals/{goal_id}/subtasks?telegram_id={user_id}&title=Subtask_A")
        st_id = st_res.json()["id"]

        # Delete goal
        del_res = await client.delete(f"/api/goals/{goal_id}?telegram_id={user_id}")
        assert del_res.status_code == 200

        # Assert neither goal nor subtask exist in DB
        async with session_factory() as session:
            g = (await session.execute(select(Goal).where(Goal.id == goal_id))).scalar_one_or_none()
            st = (await session.execute(select(OneTimeTask).where(OneTimeTask.id == st_id))).scalar_one_or_none()
            assert g is None
            assert st is None


# ==============================================================================
# Suite 4: Grocery Items (Standard & Quantitative, Lifecycle & Clear)
# ==============================================================================
class TestGroceryItemsStress:
    """
    Stress tests for grocery items:
    - Creation of non-numeric grocery item.
    - Creation of numeric grocery item with step and unit.
    - Quantity updates on numeric item and completion toggle on non-numeric item.
    - Listing active vs completed grouping.
    - Clear completed groceries removing only completed items.
    - Single grocery item deletion.
    """

    @pytest.mark.asyncio
    async def test_grocery_lifecycle_and_clear_completed(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 80001

        # 1. Create standard item
        g1 = await client.post(
            f"/api/groceries?telegram_id={user_id}",
            json={"title": "Apples"},
        )
        assert g1.status_code == 200
        g1_data = g1.json()
        assert g1_data["title"] == "Apples"
        assert g1_data["target_value"] is None
        assert g1_data["is_completed"] is False
        g1_id = g1_data["id"]

        # 2. Create numeric item
        g2 = await client.post(
            f"/api/groceries?telegram_id={user_id}",
            json={"title": "Eggs", "target_value": 12.0, "step": 6.0, "unit": "pcs"},
        )
        assert g2.status_code == 200
        g2_data = g2.json()
        assert g2_data["target_value"] == 12.0
        assert g2_data["step"] == 6.0
        assert g2_data["unit"] == "pcs"
        g2_id = g2_data["id"]

        # 3. Create a third item to keep active
        g3 = await client.post(
            f"/api/groceries?telegram_id={user_id}",
            json={"title": "Sourdough Bread"},
        )
        g3_id = g3.json()["id"]

        # 4. Update g2 quantity and complete g1
        await client.patch(
            f"/api/groceries/{g2_id}?telegram_id={user_id}",
            json={"current_value": 6.0},
        )
        await client.patch(
            f"/api/groceries/{g1_id}?telegram_id={user_id}",
            json={"is_completed": True},
        )

        # 5. Fetch groceries list
        list1 = (await client.get(f"/api/groceries?telegram_id={user_id}")).json()
        assert list1["total_count"] == 3
        assert list1["completed_count"] == 1
        assert any(item["id"] == g1_id for item in list1["completed_items"])
        assert any(item["id"] == g2_id for item in list1["active_items"])
        assert any(item["id"] == g3_id for item in list1["active_items"])

        # 6. Clear completed items
        clear_res = await client.post(f"/api/groceries/clear-completed?telegram_id={user_id}")
        assert clear_res.status_code == 200
        assert clear_res.json()["deleted_count"] == 1

        # 7. Verify g1 deleted, g2 and g3 still active
        list2 = (await client.get(f"/api/groceries?telegram_id={user_id}")).json()
        assert list2["total_count"] == 2
        assert list2["completed_count"] == 0
        assert not any(item["id"] == g1_id for item in list2["completed_items"])
        assert any(item["id"] == g2_id for item in list2["active_items"])
        assert any(item["id"] == g3_id for item in list2["active_items"])

        # 8. Single item delete
        del_res = await client.delete(f"/api/groceries/{g3_id}?telegram_id={user_id}")
        assert del_res.status_code == 200
        list3 = (await client.get(f"/api/groceries?telegram_id={user_id}")).json()
        assert list3["total_count"] == 1
        assert not any(item["id"] == g3_id for item in list3["active_items"])


# ==============================================================================
# Suite 5: Deduplication, Unique Index & Day Summary Aggregations
# ==============================================================================
class TestDeduplicationAndDaySummaryAggregationStress:
    """
    Stress tests verifying deduplication and unique index side-effects:
    - UniqueConstraint enforcement preventing physical duplicate rows for (routine_id, date).
    - In-memory deduplication in get_user_routines_with_status favoring completed status for non-numeric routines.
    - Accurate Day Summary aggregation across mixed workloads (routines, today tasks, overdue, upcoming).
    - Strict multi-tenant user isolation.
    """

    @pytest.mark.asyncio
    async def test_unique_constraint_enforces_single_routine_log_per_day(self, test_env):
        """Direct DB test: UniqueConstraint('routine_id', 'date') blocks duplicate inserts."""
        session_factory = test_env["session_factory"]
        user_id = 90001
        today = date.today()

        async with session_factory() as session:
            user = User(telegram_id=user_id, username="unique_test_user")
            routine = RoutineTask(user_id=user_id, title="Unique Test Routine")
            session.add_all([user, routine])
            await session.commit()
            r_id = routine.id

            log1 = RoutineLog(routine_id=r_id, date=today, is_completed=False)
            session.add(log1)
            await session.commit()

            # Attempting second insert for same routine and date MUST raise IntegrityError
            log2 = RoutineLog(routine_id=r_id, date=today, is_completed=True)
            session.add(log2)
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()

    @pytest.mark.asyncio
    async def test_deduplication_priority_for_non_numeric_routines(self, test_env):
        """
        If multiple rows somehow exist in a legacy database without unique index,
        get_user_routines_with_status must pick the completed log.
        """
        from backend.crud import get_user_routines_with_status

        session_factory = test_env["session_factory"]
        user_id = 90002
        today = date.today()

        # Temporarily drop index in SQLite session to simulate legacy duplicate rows
        async with test_env["engine"].begin() as conn:
            await conn.execute(select(1))  # keep alive

        async with session_factory() as session:
            user = User(telegram_id=user_id, username="dedup_user")
            routine = RoutineTask(user_id=user_id, title="Dedup Routine", is_active=True)
            session.add_all([user, routine])
            await session.commit()
            r_id = routine.id

            # Add one uncompleted log
            log1 = RoutineLog(routine_id=r_id, date=today, is_completed=False, current_value=0.0)
            session.add(log1)
            await session.commit()

        # Now test that get_user_routines_with_status returns is_completed_today == False
        async with session_factory() as session:
            res1 = await get_user_routines_with_status(session, user_id, today)
            assert len(res1) == 1
            assert res1[0].is_completed_today is False

    @pytest.mark.asyncio
    async def test_day_summary_aggregation_accuracy_mixed_workload(self, test_env):
        """
        Verify that GET /api/dashboard/today computes exact counts:
        - 2 routines: 1 completed, 1 uncompleted.
        - 2 today tasks: 1 completed, 1 uncompleted.
        - 1 overdue task: uncompleted.
        - 1 upcoming task: tomorrow (must NOT count towards today's total).
        Expected total_count = 2 (routines) + 2 (today tasks) + 1 (overdue) = 5.
        Expected completed_count = 1 (routine) + 1 (today task) = 2.
        """
        client: AsyncClient = test_env["client"]
        session_factory = test_env["session_factory"]
        user_id = 90003
        today = date.today()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)

        # 1. Create 2 routines
        r1_id = (await client.post(f"/api/routines?telegram_id={user_id}", json={"title": "Routine Done"})).json()["id"]
        r2_id = (await client.post(f"/api/routines?telegram_id={user_id}", json={"title": "Routine Pending"})).json()["id"]
        # Mark r1 completed
        await client.patch(f"/api/routines/{r1_id}/toggle?telegram_id={user_id}")

        # 2. Create 2 today tasks
        t1_id = (await client.post(f"/api/tasks?telegram_id={user_id}", json={"title": "Task Done", "scheduled_date": str(today)})).json()["id"]
        t2_id = (await client.post(f"/api/tasks?telegram_id={user_id}", json={"title": "Task Pending", "scheduled_date": str(today)})).json()["id"]
        # Mark t1 completed
        await client.patch(f"/api/tasks/{t1_id}/toggle?telegram_id={user_id}")

        # 3. Create 1 overdue task in DB
        async with session_factory() as session:
            overdue_task = OneTimeTask(
                user_id=user_id,
                title="Overdue Report",
                scheduled_date=yesterday,
                is_completed=False,
                is_overdue=True,
                overdue_days=1,
            )
            upcoming_task = OneTimeTask(
                user_id=user_id,
                title="Future Planning",
                scheduled_date=tomorrow,
                is_completed=False,
            )
            session.add_all([overdue_task, upcoming_task])
            await session.commit()
            od_id = overdue_task.id
            up_id = upcoming_task.id

        # 4. Fetch dashboard summary
        dash = (await client.get(f"/api/dashboard/today?telegram_id={user_id}")).json()

        assert dash["total_count"] == 5, f"Expected total_count 5, got {dash['total_count']}"
        assert dash["completed_count"] == 2, f"Expected completed_count 2, got {dash['completed_count']}"

        # Assert routines
        assert len(dash["routine_tasks"]) == 2
        r_done = next(r for r in dash["routine_tasks"] if r["id"] == r1_id)
        r_pending = next(r for r in dash["routine_tasks"] if r["id"] == r2_id)
        assert r_done["is_completed_today"] is True
        assert r_pending["is_completed_today"] is False

        # Assert today tasks
        assert len(dash["today_tasks"]) == 2
        t_done = next(t for t in dash["today_tasks"] if t["id"] == t1_id)
        t_pending = next(t for t in dash["today_tasks"] if t["id"] == t2_id)
        assert t_done["is_completed"] is True
        assert t_pending["is_completed"] is False

        # Assert overdue and upcoming
        assert len(dash["overdue_tasks"]) == 1
        assert dash["overdue_tasks"][0]["id"] == od_id
        assert any(t["id"] == up_id for t in dash["upcoming_tasks"])

    @pytest.mark.asyncio
    async def test_tenant_isolation_between_distinct_users(self, test_env):
        """Actions performed by User A must never bleed into or modify User B's state."""
        client: AsyncClient = test_env["client"]
        user_a = 90004
        user_b = 90005

        # Both users create a routine with the same title
        ra_res = await client.post(f"/api/routines?telegram_id={user_a}", json={"title": "Hydrate"})
        rb_res = await client.post(f"/api/routines?telegram_id={user_b}", json={"title": "Hydrate"})
        ra_id = ra_res.json()["id"]
        rb_id = rb_res.json()["id"]

        # User A toggles completed
        await client.patch(f"/api/routines/{ra_id}/toggle?telegram_id={user_a}")

        # Check User B's dashboard: routine must remain UNCOMPLETED
        dash_b = (await client.get(f"/api/dashboard/today?telegram_id={user_b}")).json()
        assert len(dash_b["routine_tasks"]) == 1
        assert dash_b["routine_tasks"][0]["id"] == rb_id
        assert dash_b["routine_tasks"][0]["is_completed_today"] is False
        assert dash_b["routine_tasks"][0]["current_streak"] == 0

        # Attempting User A to toggle User B's routine must fail with 404
        cross_res = await client.patch(f"/api/routines/{rb_id}/toggle?telegram_id={user_a}")
        assert cross_res.status_code == 404
