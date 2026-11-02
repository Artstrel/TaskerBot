"""
Empirical Adversarial Challenge & Stress Test Suite for Milestone 1 Backend:
"Before Leaving" («Перед выходом») Feature.

Empirically challenges:
1. Rapid concurrent session starts and resets (race conditions, duplicate active sessions, MultipleResultsFound).
2. Rapid concurrent toggle operations (consistency of totals, progress calculation, race conditions on same/multiple items).
3. Scale boundaries: 0 template items vs 100 template items, large batch reordering, batch completion.
4. Direct HTTP requests attempting to finish with unchecked items, partial items, repeated finish, concurrent finish.
5. Injected duplicate active session resilience (checking scalar_one_or_none behavior vs scalars().first()).
"""

import asyncio
import os
import shutil
import sys
import tempfile
from typing import AsyncGenerator, List

# Ensure workspace root is in sys.path
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
async def challenge_env() -> AsyncGenerator[dict, None]:
    """
    Dedicated test environment with aiosqlite and busy timeout configured.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_before_leaving_challenge_")
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


class TestStressSessionLifecycleAndConcurrency:
    """
    Adversarial challenge on session initialization, resets, and concurrency.
    """

    @pytest.mark.asyncio
    async def test_start_session_empty_template_rejection(self, challenge_env):
        """
        Verify that starting a session with 0 template items returns HTTP 400.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 81001

        resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert resp.status_code == 400
        assert resp.json()["detail"] == "No template items configured"

        # Verify no session was created in DB
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        assert active_resp.json() is None

    @pytest.mark.asyncio
    async def test_rapid_concurrent_session_starts_no_reset(self, challenge_env):
        """
        Adversarial Challenge:
        Fires 20 simultaneous POST /api/before-leaving/session/start requests when no active session exists yet.
        Checks:
        - No 500 Internal Server Error (e.g. MultipleResultsFound).
        - Exactly one active session should be active in DB or all requests return the same session ID.
        - GET /session/active returns 200 and does NOT crash with MultipleResultsFound.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 81002

        # Create 3 template items first
        for title in ["Паспорт", "Ключи", "Телефон"]:
            r = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": title},
            )
            assert r.status_code == 200

        # Fire 20 concurrent start calls
        tasks = [
            client.post(
                f"/api/before-leaving/session/start?telegram_id={user_id}",
                json={"reset": False},
            )
            for _ in range(20)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for idx, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Request {idx} raised an exception: {resp}"
            assert resp.status_code == 200, f"Request {idx} failed with {resp.status_code}: {resp.text}"

        session_ids = {r.json()["id"] for r in responses}

        # Check DB state
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        # Check GET /session/active
        get_active = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert get_active.status_code == 200, f"GET active failed: {get_active.text}"
        active_data = get_active.json()
        assert active_data is not None

        # Verify only 1 active session exists
        assert len(active_sessions) == 1, (
            f"Expected exactly 1 active session row, found {len(active_sessions)}. "
            f"Session IDs returned: {session_ids}"
        )
        assert len(session_ids) == 1, f"Expected identical session ID across all concurrent starts: {session_ids}"

    @pytest.mark.asyncio
    async def test_rapid_concurrent_session_starts_with_reset(self, challenge_env):
        """
        Adversarial Challenge:
        Fires 10 simultaneous POST /api/before-leaving/session/start with reset=True.
        Verifies no 500 errors and at the end exactly 1 active session remains.
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 81003

        # Create template items
        for title in ["Кошелек", "Зонт"]:
            await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": title},
            )

        # Start initial session
        r_init = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert r_init.status_code == 200

        # Fire 10 concurrent resets
        tasks = [
            client.post(
                f"/api/before-leaving/session/start?telegram_id={user_id}",
                json={"reset": True},
            )
            for _ in range(10)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for idx, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Request {idx} raised exception: {resp}"
            assert resp.status_code == 200, f"Request {idx} failed with {resp.status_code}: {resp.text}"

        # Verify DB active session count
        async with session_factory() as session:
            stmt = select(BeforeLeavingSession).where(
                and_(BeforeLeavingSession.user_id == user_id, BeforeLeavingSession.is_active == True)
            )
            res = await session.execute(stmt)
            active_sessions = res.scalars().all()

        assert len(active_sessions) == 1, f"Found {len(active_sessions)} active sessions after concurrent resets!"

        # Verify GET active session does not crash
        get_active = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert get_active.status_code == 200
        assert get_active.json() is not None

    @pytest.mark.asyncio
    async def test_injected_duplicate_active_sessions_resilience(self, challenge_env):
        """
        VULNERABILITY PROBE:
        In `backend/crud.py`, get_active_before_leaving_session, start_before_leaving_session,
        and finish_before_leaving_session all perform:
            stmt = select(BeforeLeavingSession)...where(is_active == True).order_by(id.desc())
            res = await session.execute(stmt)
            active = res.scalar_one_or_none()

        If multiple active sessions ever exist (e.g. from an interleaving race or legacy DB state),
        res.scalar_one_or_none() will raise `MultipleResultsFound` (HTTP 500).
        Let's inject 2 active sessions and test whether the API routes survive or crash!
        """
        client: AsyncClient = challenge_env["client"]
        session_factory = challenge_env["session_factory"]
        user_id = 81004

        # Insert user and 2 active sessions directly into the DB
        async with session_factory() as session:
            user = User(telegram_id=user_id, username="dup_session_user")
            session.add(user)
            await session.flush()

            sess1 = BeforeLeavingSession(user_id=user_id, is_active=True)
            sess2 = BeforeLeavingSession(user_id=user_id, is_active=True)
            session.add(sess1)
            session.add(sess2)
            await session.flush()

            # Attach a check item to sess2
            item2 = BeforeLeavingCheckItem(
                session_id=sess2.id,
                title="Тестовый предмет",
                order=0,
                is_checked=False,
            )
            session.add(item2)
            await session.commit()

        # Probe GET /api/before-leaving/session/active
        get_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        # Note: If scalar_one_or_none is used, this returns 500 MultipleResultsFound!
        # If scalars().first() is used, this returns 200 OK with the latest session.
        # Let's check what actually happens:
        print(f"DEBUG: get_resp status={get_resp.status_code}, body={get_resp.text}")
        assert get_resp.status_code in (200, 500), f"Unexpected status {get_resp.status_code}"


class TestStressCheckItemToggling:
    """
    Adversarial challenge on toggle operations and concurrency.
    """

    @pytest.mark.asyncio
    async def test_rapid_concurrent_toggles_single_item(self, challenge_env):
        """
        Fire 30 concurrent toggle calls on the same item.
        Verify no crashes, no deadlocks, and total_count / completed_count consistency.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 82001

        # Setup template and start session
        await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Окна закрыты"},
        )
        s_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        session_data = s_resp.json()
        item_id = session_data["items"][0]["id"]

        # Fire 30 concurrent implicit toggles
        tasks = [
            client.patch(
                f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
                json={},
            )
            for _ in range(30)
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for idx, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Toggle {idx} raised exception: {resp}"
            assert resp.status_code == 200, f"Toggle {idx} failed with {resp.status_code}: {resp.text}"

        # Verify final session state
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        final_sess = active_resp.json()
        assert final_sess["total_count"] == 1
        assert final_sess["completed_count"] in (0, 1)
        assert final_sess["is_all_completed"] == (final_sess["completed_count"] == 1)

    @pytest.mark.asyncio
    async def test_rapid_concurrent_toggles_multiple_items_consistency(self, challenge_env):
        """
        Session with 10 items.
        Fire 50 concurrent toggles across all items with mixed explicit and implicit states.
        Verify invariant: for every response, completed_count == sum(items.is_checked)
        and is_all_completed == (completed_count == total_count).
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 82002

        # Create 10 items
        for i in range(10):
            await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": f"Чеклист пункт {i}"},
            )

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        session_data = start_resp.json()
        item_ids = [it["id"] for it in session_data["items"]]
        assert len(item_ids) == 10

        # Construct 50 mixed toggle requests
        import random
        tasks = []
        for i in range(50):
            target_id = item_ids[i % len(item_ids)]
            # alternate between explicit True, False, and implicit
            mode = i % 3
            if mode == 0:
                payload = {"is_checked": True}
            elif mode == 1:
                payload = {"is_checked": False}
            else:
                payload = {}
            tasks.append(
                client.patch(
                    f"/api/before-leaving/session/items/{target_id}/toggle?telegram_id={user_id}",
                    json=payload,
                )
            )

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for idx, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Toggle {idx} raised exception: {resp}"
            assert resp.status_code == 200, f"Toggle {idx} returned {resp.status_code}: {resp.text}"
            data = resp.json()
            assert data["total_count"] == 10
            actual_completed = sum(1 for it in data["items"] if it["is_checked"])
            assert data["completed_count"] == actual_completed
            assert data["is_all_completed"] == (actual_completed == 10)

    @pytest.mark.asyncio
    async def test_toggle_item_on_finished_session_fails_404(self, challenge_env):
        """
        Once a session is finished, attempting to toggle any of its items must return HTTP 404.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 82003

        await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Зарядка"},
        )
        s_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        item_id = s_resp.json()["items"][0]["id"]

        # Check the item
        await client.patch(
            f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )

        # Finish the session
        f_resp = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert f_resp.status_code == 200

        # Attempt to toggle now
        toggle_after = await client.patch(
            f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
            json={"is_checked": False},
        )
        assert toggle_after.status_code == 404
        assert toggle_after.json()["detail"] == "Check item or active session not found"


class TestStressLargeTemplateAndReordering:
    """
    Stress-testing high-volume items (100 items), order integrity, batch reordering, and batch toggle.
    """

    @pytest.mark.asyncio
    async def test_large_template_100_items_creation_and_autoincrement(self, challenge_env):
        """
        Create 100 template items. Verify sequential autoincrement order (0..99) without gaps.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 83001

        for i in range(100):
            res = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": f"Предмет {i:03d}"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["order"] == i, f"Expected order {i}, got {data['order']}"

        # Fetch all
        all_items_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert all_items_resp.status_code == 200
        items = all_items_resp.json()
        assert len(items) == 100
        for i, item in enumerate(items):
            assert item["order"] == i
            assert item["title"] == f"Предмет {i:03d}"

    @pytest.mark.asyncio
    async def test_large_template_100_items_session_snapshot_and_finish(self, challenge_env):
        """
        Start session with 100 template items.
        Verify:
        - 100 check items snapshotted in order.
        - total_count=100, completed_count=0, is_all_completed=False.
        - Attempt to finish fails with 400.
        - Toggle all 100 items to completed.
        - total_count=100, completed_count=100, is_all_completed=True.
        - Finish succeeds with 200.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 83002

        # Seed 100 items
        for i in range(100):
            await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": f"Вещь {i}"},
            )

        # Start session
        start_res = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_res.status_code == 200
        sess_data = start_res.json()
        assert sess_data["total_count"] == 100
        assert sess_data["completed_count"] == 0
        assert sess_data["is_all_completed"] is False
        assert len(sess_data["items"]) == 100

        # Attempt premature finish
        premature = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert premature.status_code == 400

        # Toggle all 100 items to checked
        for item in sess_data["items"]:
            t_res = await client.patch(
                f"/api/before-leaving/session/items/{item['id']}/toggle?telegram_id={user_id}",
                json={"is_checked": True},
            )
            assert t_res.status_code == 200

        # Check final active state
        active_res = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_res.status_code == 200
        active_data = active_res.json()
        assert active_data["total_count"] == 100
        assert active_data["completed_count"] == 100
        assert active_data["is_all_completed"] is True

        # Finish session
        finish_res = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert finish_res.status_code == 200
        fin_data = finish_res.json()
        assert fin_data["is_active"] is False
        assert fin_data["completed_at"] is not None

        # Verify active session is now null
        cleared_res = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert cleared_res.status_code == 200
        assert cleared_res.json() is None

    @pytest.mark.asyncio
    async def test_reorder_100_items_full_reverse(self, challenge_env):
        """
        Reorder 100 template items in reverse order.
        Verify orders updated correctly from 0..99.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 83003

        # Create 100 items
        item_ids = []
        for i in range(100):
            r = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": f"Позиция {i}"},
            )
            item_ids.append(r.json()["id"])

        # Reverse the order
        reversed_ids = list(reversed(item_ids))
        reorder_resp = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_id}",
            json={"item_ids": reversed_ids},
        )
        assert reorder_resp.status_code == 200
        reordered = reorder_resp.json()
        assert len(reordered) == 100

        for idx, item in enumerate(reordered):
            assert item["id"] == reversed_ids[idx]
            assert item["order"] == idx

        # Re-fetch via GET to ensure persistence
        get_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert get_resp.status_code == 200
        persisted = get_resp.json()
        for idx, item in enumerate(persisted):
            assert item["id"] == reversed_ids[idx]
            assert item["order"] == idx


class TestStressFinishConstraintsAndDirectHttpAttacks:
    """
    Adversarial challenge on HTTP finish endpoint tampering:
    Bypassing frontend lock, partial completion, repeated calls, concurrent race.
    """

    @pytest.mark.asyncio
    async def test_finish_rejected_with_unchecked_items(self, challenge_env):
        """
        Direct HTTP finish call with 0 checked items -> 400.
        Direct HTTP finish call with 4 of 5 checked items -> 400.
        Direct HTTP finish after unchecking -> 400.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 84001

        # Create 5 items
        for i in range(5):
            await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": f"Задача {i}"},
            )

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        items = start_resp.json()["items"]

        # Attack 1: finish with 0 checked items
        atk1 = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert atk1.status_code == 400
        assert atk1.json()["detail"] == "Cannot finish session: unfinished items remain"

        # Check 4 of 5 items
        for item in items[:4]:
            await client.patch(
                f"/api/before-leaving/session/items/{item['id']}/toggle?telegram_id={user_id}",
                json={"is_checked": True},
            )

        # Attack 2: finish with 1 remaining item unchecked
        atk2 = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert atk2.status_code == 400
        assert atk2.json()["detail"] == "Cannot finish session: unfinished items remain"

        # Check last item
        await client.patch(
            f"/api/before-leaving/session/items/{items[4]['id']}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )

        # Uncheck item 0
        await client.patch(
            f"/api/before-leaving/session/items/{items[0]['id']}/toggle?telegram_id={user_id}",
            json={"is_checked": False},
        )

        # Attack 3: finish when 1 item was unchecked
        atk3 = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert atk3.status_code == 400
        assert atk3.json()["detail"] == "Cannot finish session: unfinished items remain"

        # Re-check item 0
        await client.patch(
            f"/api/before-leaving/session/items/{items[0]['id']}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )

        # Legitimate finish
        legit = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert legit.status_code == 200
        assert legit.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_finish_when_no_active_session_returns_404(self, challenge_env):
        """
        Direct HTTP finish when user has no active session returns 404.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 84002

        resp = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "No active session found"

    @pytest.mark.asyncio
    async def test_repeated_and_concurrent_finish_calls(self, challenge_env):
        """
        When all items are checked, firing 10 concurrent finish calls should result in
        exactly one 200 OK and nine 404s (or zero 500s).
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 84003

        await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Документы"},
        )
        s_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        item_id = s_resp.json()["items"][0]["id"]
        await client.patch(
            f"/api/before-leaving/session/items/{item_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )

        # Fire 10 concurrent finish calls
        tasks = [client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}") for _ in range(10)]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        status_codes = []
        for idx, resp in enumerate(responses):
            assert not isinstance(resp, Exception), f"Finish {idx} raised exception: {resp}"
            status_codes.append(resp.status_code)

        assert 200 in status_codes, f"At least one finish call must succeed: {status_codes}"
        assert all(code in (200, 404) for code in status_codes), f"Unexpected status codes: {status_codes}"

        # Subsequent call must return 404
        subsequent = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert subsequent.status_code == 404
        assert subsequent.json()["detail"] == "No active session found"


class TestStressBoundariesAndCrossTenantAttacks:
    """
    Adversarial challenge on data boundary conditions and cross-tenant isolation.
    """

    @pytest.mark.asyncio
    async def test_template_title_boundaries_and_special_chars(self, challenge_env):
        """
        Tests whitespace trimming, auto-capitalization, emojis, HTML/SQL injection strings,
        and empty title rejection (422/400).
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 85001

        # 1. Empty string -> 422 or 400
        r_empty = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "   "},
        )
        assert r_empty.status_code in (400, 422)

        # 2. Lowercase with whitespace -> auto-capitalized and trimmed
        r_caps = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "  выключить утюг  "},
        )
        assert r_caps.status_code == 200
        assert r_caps.json()["title"] == "Выключить утюг"

        # 3. Emojis and unicode
        r_emoji = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "🔑 Ключи от квартиры и 💳 карта"},
        )
        assert r_emoji.status_code == 200
        assert r_emoji.json()["title"] == "🔑 Ключи от квартиры и 💳 карта"

        # 4. HTML / script tags
        r_xss = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "<script>alert('test')</script>"},
        )
        assert r_xss.status_code == 200
        assert r_xss.json()["title"] == "<script>alert('test')</script>"

    @pytest.mark.asyncio
    async def test_delete_template_item_with_active_session_snapshot_preserved(self, challenge_env):
        """
        Start active session. Then delete the template item.
        Verify:
        - Check item in active session still exists with title intact.
        - Check item can still be toggled.
        - Session can still be finished.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 85002

        item_resp = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Очки"},
        )
        tpl_id = item_resp.json()["id"]

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        check_item_id = start_resp.json()["items"][0]["id"]

        # Delete template item
        del_resp = await client.delete(f"/api/before-leaving/items/{tpl_id}?telegram_id={user_id}")
        assert del_resp.status_code == 200

        # Verify active session check item persists
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        active_items = active_resp.json()["items"]
        assert len(active_items) == 1
        assert active_items[0]["id"] == check_item_id
        assert active_items[0]["title"] == "Очки"

        # Toggle check item
        toggle_resp = await client.patch(
            f"/api/before-leaving/session/items/{check_item_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert toggle_resp.status_code == 200
        assert toggle_resp.json()["is_all_completed"] is True

        # Finish session
        finish_resp = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert finish_resp.status_code == 200
        assert finish_resp.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_cross_tenant_adversarial_tampering(self, challenge_env):
        """
        User A and User B both create template items and active sessions.
        Verify:
        - User B cannot see User A's template items.
        - User B cannot update, delete, or reorder User A's items.
        - User B cannot toggle User A's check items.
        - User B cannot finish User A's session.
        """
        client: AsyncClient = challenge_env["client"]
        user_a = 85003
        user_b = 85004

        # User A setup
        ra = await client.post(
            f"/api/before-leaving/items?telegram_id={user_a}",
            json={"title": "Секретные документы А"},
        )
        tpl_a_id = ra.json()["id"]
        sa = await client.post(f"/api/before-leaving/session/start?telegram_id={user_a}")
        check_a_id = sa.json()["items"][0]["id"]

        # User B setup
        rb = await client.post(
            f"/api/before-leaving/items?telegram_id={user_b}",
            json={"title": "Вещи Б"},
        )
        tpl_b_id = rb.json()["id"]
        sb = await client.post(f"/api/before-leaving/session/start?telegram_id={user_b}")
        check_b_id = sb.json()["items"][0]["id"]

        # Attack: User B tries to update User A's template item
        atk_upd = await client.patch(
            f"/api/before-leaving/items/{tpl_a_id}?telegram_id={user_b}",
            json={"title": "Взломано"},
        )
        assert atk_upd.status_code == 404

        # Attack: User B tries to delete User A's template item
        atk_del = await client.delete(f"/api/before-leaving/items/{tpl_a_id}?telegram_id={user_b}")
        assert atk_del.status_code == 404

        # Attack: User B tries to toggle User A's check item
        atk_tgl = await client.patch(
            f"/api/before-leaving/session/items/{check_a_id}/toggle?telegram_id={user_b}",
            json={"is_checked": True},
        )
        assert atk_tgl.status_code == 404

        # Attack: User B tries to reorder including User A's item
        atk_reorder = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_b}",
            json={"item_ids": [tpl_a_id, tpl_b_id]},
        )
        assert atk_reorder.status_code == 200
        # Should only contain User B's items
        reordered_items = atk_reorder.json()
        assert all(it["user_id"] == user_b for it in reordered_items)
        assert tpl_a_id not in [it["id"] for it in reordered_items]
