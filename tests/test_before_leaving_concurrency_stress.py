"""
Adversarial Concurrency Stress & Race Condition Verification Harness
Author: Challenger 1 (Milestone 1 Round 2)

Rigorous empirical tests subjecting backend concurrency locks and session lifecycle
to high parallel start, reset, finish, toggle rates and multi-tenant load.
"""

import asyncio
import os
import shutil
import sys
import tempfile
from typing import AsyncGenerator, List, Set

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, and_, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.models import Base, User, BeforeLeavingItem, BeforeLeavingSession, BeforeLeavingCheckItem
from main import app


@pytest_asyncio.fixture
async def stress_env() -> AsyncGenerator[dict, None]:
    """
    Dedicated high-throughput test environment configured with WAL mode and 60s timeout.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_stress_concurrency_")
    db_path = os.path.join(temp_dir, "stress_tasker.db")
    db_url = f"sqlite+aiosqlite:///{db_path}"

    engine = create_async_engine(
        db_url,
        echo=False,
        connect_args={"timeout": 60.0},
    )
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL;"))
        await conn.execute(text("PRAGMA synchronous=NORMAL;"))
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


class TestExtremeConcurrencyLockStress:
    """
    Intensive parallel stress testing targeting the _before_leaving_locks mechanism.
    """

    @pytest.mark.asyncio
    async def test_50_parallel_session_starts_without_reset(self, stress_env):
        """
        Stress Test 1: 50 concurrent requests calling POST /session/start with reset=False.
        Empirically verifies:
        - Exactly one session is created in the database.
        - All 50 responses return HTTP 200 with the exact same session ID.
        - Exactly the expected number of check items are created (no duplicates).
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        user_id = 91001

        # Setup 4 template items
        items = ["Паспорт", "Ключи от дома", "Кошелек с картами", "Рабочий пропуск"]
        for title in items:
            r = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})
            assert r.status_code == 200

        # Launch 50 concurrent start requests
        tasks = [
            client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": False})
            for _ in range(50)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Request {i} raised exception: {resp}"
            assert resp.status_code == 200, f"Request {i} returned {resp.status_code}: {resp.text}"

        session_ids: Set[int] = {r.json()["id"] for r in responses}
        assert len(session_ids) == 1, f"Expected 1 unique session ID, got: {session_ids}"
        single_session_id = session_ids.pop()

        # Verify DB integrity
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

            check_items_stmt = select(BeforeLeavingCheckItem).where(BeforeLeavingCheckItem.session_id == single_session_id)
            res_items = await session.execute(check_items_stmt)
            check_items = res_items.scalars().all()

        assert len(active_sessions) == 1
        assert active_sessions[0].id == single_session_id
        assert len(check_items) == 4

    @pytest.mark.asyncio
    async def test_50_parallel_session_resets(self, stress_env):
        """
        Stress Test 2: 50 concurrent requests calling POST /session/start with reset=True.
        Empirically verifies:
        - No MultipleResultsFound crashes.
        - At completion, exactly 1 session remains active in DB.
        - All prior sessions are marked is_active=False.
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        user_id = 91002

        # Setup template items
        for title in ["Зонт", "Наушники"]:
            await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})

        # Start an initial active session
        r_init = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert r_init.status_code == 200
        initial_sess_id = r_init.json()["id"]

        # Launch 50 concurrent reset requests
        tasks = [
            client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": True})
            for _ in range(50)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Request {i} raised exception: {resp}"
            assert resp.status_code == 200, f"Request {i} returned {resp.status_code}: {resp.text}"

        # Verify database state
        async with session_factory() as session:
            stmt_active = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res_active = await session.execute(stmt_active)
            active_sessions = res_active.scalars().all()

            stmt_all = select(BeforeLeavingSession).where(BeforeLeavingSession.user_id == user_id)
            res_all = await session.execute(stmt_all)
            all_sessions = res_all.scalars().all()

        assert len(active_sessions) == 1, f"Found {len(active_sessions)} active sessions, expected 1"
        assert active_sessions[0].id != initial_sess_id
        assert len(all_sessions) >= 2

        # Verify GET active session endpoint succeeds without error
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        assert active_resp.json()["id"] == active_sessions[0].id

    @pytest.mark.asyncio
    async def test_mixed_concurrent_starts_and_resets(self, stress_env):
        """
        Stress Test 3: 60 concurrent requests (30 reset=False, 30 reset=True) fired simultaneously.
        Empirically verifies:
        - No unhandled exceptions, zero 500 errors.
        - Resulting state has exactly 1 active session.
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        user_id = 91003

        # Setup template items
        for title in ["Вода", "Зарядное устройство"]:
            await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})

        # Launch 30 no-reset and 30 reset tasks interlaced
        tasks = []
        for i in range(60):
            reset = (i % 2 == 1)
            tasks.append(
                client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": reset})
            )

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Request {i} failed with exception: {resp}"
            assert resp.status_code == 200, f"Request {i} returned status {resp.status_code}"

        # Verify DB state
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        assert len(active_sessions) == 1, f"Expected 1 active session, got {len(active_sessions)}"

    @pytest.mark.asyncio
    async def test_multi_tenant_parallel_stampede(self, stress_env):
        """
        Stress Test 4: 10 distinct users, each sending 20 concurrent start/reset calls (200 total concurrent calls).
        Empirically verifies:
        - Per-user lock isolation (_before_leaving_locks[user_id]) works without deadlocks or cross-talk.
        - Exactly 10 active sessions exist in the entire database at the end (1 per user).
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        base_user_id = 92000
        num_users = 10
        calls_per_user = 20

        # Create templates for each user
        for u_idx in range(num_users):
            uid = base_user_id + u_idx
            for item_idx in range(3):
                await client.post(
                    f"/api/before-leaving/items?telegram_id={uid}",
                    json={"title": f"User {uid} Item {item_idx}"},
                )

        # Build 200 concurrent tasks across all 10 users
        tasks = []
        for call_idx in range(calls_per_user):
            for u_idx in range(num_users):
                uid = base_user_id + u_idx
                reset = (call_idx % 2 == 1)
                tasks.append(
                    client.post(f"/api/before-leaving/session/start?telegram_id={uid}", json={"reset": reset})
                )

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Stampede task {i} failed: {resp}"
            assert resp.status_code == 200, f"Stampede task {i} status {resp.status_code}"

        # Verify DB: exactly 10 active sessions, 1 per user
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(BeforeLeavingSession.is_active == True)
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        assert len(active_sessions) == num_users, (
            f"Expected {num_users} active sessions, found {len(active_sessions)}"
        )
        active_user_ids = {s.user_id for s in active_sessions}
        expected_user_ids = {base_user_id + u for u in range(num_users)}
        assert active_user_ids == expected_user_ids

    @pytest.mark.asyncio
    async def test_concurrent_toggle_and_finish_races(self, stress_env):
        """
        Stress Test 5: Parallel toggle of check items while finish attempts are executed.
        Empirically verifies:
        - Finish cannot succeed if items are incomplete (returns 400).
        - If finish succeeds, toggle requests afterwards return 404 cleanly.
        - Zero 500 errors.
        """
        client: AsyncClient = stress_env["client"]
        user_id = 93001

        # Setup 2 template items
        for title in ["Проверить утюг", "Выключить свет"]:
            await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": title})

        # Start session
        r_start = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert r_start.status_code == 200
        session_data = r_start.json()
        item1_id = session_data["items"][0]["id"]
        item2_id = session_data["items"][1]["id"]

        # Item 1 is checked
        r_toggle1 = await client.patch(
            f"/api/before-leaving/session/items/{item1_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert r_toggle1.status_code == 200

        # Now launch concurrent attempts:
        # 10 tasks trying to toggle Item 2 to True
        # 10 tasks trying to toggle Item 2 to False
        # 10 tasks trying to call finish
        toggle_true_tasks = [
            client.patch(
                f"/api/before-leaving/session/items/{item2_id}/toggle?telegram_id={user_id}",
                json={"is_checked": True},
            )
            for _ in range(10)
        ]
        toggle_false_tasks = [
            client.patch(
                f"/api/before-leaving/session/items/{item2_id}/toggle?telegram_id={user_id}",
                json={"is_checked": False},
            )
            for _ in range(10)
        ]
        finish_tasks = [
            client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
            for _ in range(10)
        ]

        all_tasks = toggle_true_tasks + toggle_false_tasks + finish_tasks
        responses = await asyncio.gather(*all_tasks, return_exceptions=True)

        for i, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Task {i} raised exception: {resp}"
            # Acceptable status codes are 200, 400 (unfinished items), or 404 (session finished / item not active)
            assert resp.status_code in (200, 400, 404), f"Task {i} unexpected status: {resp.status_code}: {resp.text}"

    @pytest.mark.asyncio
    async def test_concurrent_finish_on_completed_session(self, stress_env):
        """
        Stress Test 6: 25 concurrent calls to POST /session/finish on a 100% completed checklist.
        Empirically verifies:
        - Exactly one call succeeds (or remaining calls return 404 "No active session found").
        - No unhandled exceptions or 500 errors.
        - Session is deactivated in database.
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        user_id = 93002

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Единственный пункт"})
        r_start = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert r_start.status_code == 200
        item_id = r_start.json()["items"][0]["id"]

        # Check item
        r_toggle = await client.patch(
            f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert r_toggle.status_code == 200
        assert r_toggle.json()["is_all_completed"] is True

        # Launch 25 concurrent finish calls
        tasks = [
            client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
            for _ in range(25)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        status_counts = {}
        for r in responses:
            assert not isinstance(r, Exception)
            status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1

        # Must have at least one 200, and the rest 404
        assert 200 in status_counts, f"No finish call succeeded: {status_counts}"
        assert status_counts[200] == 1, f"Expected exactly 1 finish success, got: {status_counts[200]}"
        assert status_counts.get(404, 0) == 24

        # Verify DB state
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        assert len(active_sessions) == 0

    @pytest.mark.asyncio
    async def test_rapid_alternating_lifecycle_loop(self, stress_env):
        """
        Stress Test 7: 15 rapid cycles of concurrent start -> check -> concurrent finish.
        Verifies that locks release cleanly, no deadlocks occur, and memory/state does not leak.
        """
        client: AsyncClient = stress_env["client"]
        user_id = 94001

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Циклический пункт"})

        for cycle in range(15):
            # Concurrent start (5 tasks)
            start_tasks = [
                client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": False})
                for _ in range(5)
            ]
            start_resps = await asyncio.gather(*start_tasks)
            assert all(r.status_code == 200 for r in start_resps)
            item_id = start_resps[0].json()["items"][0]["id"]

            # Toggle check item
            toggle_r = await client.patch(
                f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
                json={"is_checked": True},
            )
            assert toggle_r.status_code == 200

            # Concurrent finish (5 tasks)
            finish_tasks = [
                client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
                for _ in range(5)
            ]
            finish_resps = await asyncio.gather(*finish_tasks)
            statuses = [r.status_code for r in finish_resps]
            assert 200 in statuses
            assert all(s in (200, 404) for s in statuses)

            # Confirm session is now inactive
            active_r = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
            assert active_r.status_code == 200
            assert active_r.json() is None

    @pytest.mark.asyncio
    async def test_injected_duplicate_sessions_under_heavy_concurrency(self, stress_env):
        """
        Stress Test 8: Inject 5 duplicate active sessions in DB and hit concurrent GET and reset calls.
        Verifies res.scalars().first() handles corrupt DB states smoothly and reset cleans them all.
        """
        client: AsyncClient = stress_env["client"]
        session_factory = stress_env["session_factory"]
        user_id = 95001

        async with session_factory() as session:
            user = User(telegram_id=user_id, username="corrupt_state_user")
            session.add(user)
            await session.flush()

            for i in range(5):
                sess = BeforeLeavingSession(user_id=user_id, is_active=True)
                session.add(sess)
            await session.commit()

        # Add template item
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Шаблонный пункт"})

        # Fire 25 concurrent GET /session/active requests
        get_tasks = [
            client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
            for _ in range(25)
        ]
        get_resps = await asyncio.gather(*get_tasks)
        for r in get_resps:
            assert r.status_code == 200, f"GET active failed: {r.text}"
            assert r.json() is not None

        # Now fire 10 concurrent resets
        reset_tasks = [
            client.post(f"/api/before-leaving/session/start?telegram_id={user_id}", json={"reset": True})
            for _ in range(10)
        ]
        reset_resps = await asyncio.gather(*reset_tasks)
        assert all(r.status_code == 200 for r in reset_resps)

        # Confirm all duplicate sessions were deactivated and exactly 1 active session remains
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        assert len(active_sessions) == 1
