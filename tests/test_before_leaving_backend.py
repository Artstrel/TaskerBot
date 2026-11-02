"""
Automated Backend Test Suite for Before Leaving («Перед выходом») Feature.

Validates:
1. Template item CRUD, validation, order auto-increment, updates, and deletion.
2. Batch reordering and order persistence across queries.
3. Session lifecycle:
   - Empty template start rejection (HTTP 400)
   - Snapshotting template items into check items
   - Active session recovery across queries
   - In-flight session resumption vs reset flag
   - Isolation of active session from post-start template modifications
4. Check item toggles:
   - Explicit and implicit toggle
   - Timestamp recording (checked_at)
   - Progress counts (total_count, completed_count, is_all_completed)
5. Strict completion constraints:
   - Premature finish rejection (HTTP 400)
   - Successful finish upon 100% completion (is_active=False, completed_at set)
   - Active session clears to null
6. Multi-tenant isolation:
   - Strict segregation between distinct telegram user IDs
"""

import os
import shutil
import sys
import tempfile
from typing import AsyncGenerator

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.database import get_db
from backend.models import Base
from main import app


@pytest_asyncio.fixture
async def test_env() -> AsyncGenerator[dict, None]:
    """
    Provisions a completely isolated SQLite test database and an ASGITransport AsyncClient.
    Overrides FastAPI get_db dependency. Cleans up on teardown.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_before_leaving_test_")
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


class TestBeforeLeavingTemplateCRUD:
    @pytest.mark.asyncio
    async def test_template_item_creation_and_autoincrement_order(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90001

        # 1. Create first item
        resp1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "  ключи от дома  "},
        )
        assert resp1.status_code == 200, resp1.text
        data1 = resp1.json()
        assert data1["id"] > 0
        assert data1["title"] == "Ключи от дома"  # capitalized and stripped
        assert data1["order"] == 0

        # 2. Create second item (order should auto-increment to 1)
        resp2 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "телефон"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["title"] == "Телефон"
        assert data2["order"] == 1

        # 3. Create third item with explicit order 10
        resp3 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "паспорт", "order": 10},
        )
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert data3["title"] == "Паспорт"
        assert data3["order"] == 10

        # 4. List items and verify ascending order
        list_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) == 3
        assert [it["title"] for it in items] == ["Ключи от дома", "Телефон", "Паспорт"]
        assert [it["order"] for it in items] == [0, 1, 10]

    @pytest.mark.asyncio
    async def test_template_item_empty_title_validation(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90002

        # Empty string
        resp = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": ""},
        )
        assert resp.status_code in (400, 422)

        # Whitespace only
        resp_ws = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "   "},
        )
        assert resp_ws.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_template_item_update_and_persistence(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90003

        # Create
        create_res = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "кошелек"},
        )
        item_id = create_res.json()["id"]

        # Patch title and order
        patch_res = await client.patch(
            f"/api/before-leaving/items/{item_id}?telegram_id={user_id}",
            json={"title": "бумажник и карточки", "order": 5},
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["title"] == "Бумажник и карточки"
        assert updated["order"] == 5

        # Verify via get
        list_res = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        items = list_res.json()
        assert len(items) == 1
        assert items[0]["title"] == "Бумажник и карточки"
        assert items[0]["order"] == 5

        # Empty title update fails
        fail_res = await client.patch(
            f"/api/before-leaving/items/{item_id}?telegram_id={user_id}",
            json={"title": "   "},
        )
        assert fail_res.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_template_item_deletion(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90004

        create_res = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "зонт"},
        )
        item_id = create_res.json()["id"]

        # Delete
        del_res = await client.delete(f"/api/before-leaving/items/{item_id}?telegram_id={user_id}")
        assert del_res.status_code == 200
        assert del_res.json() == {"status": "deleted"}

        # Subsequent delete returns 404
        del_again = await client.delete(f"/api/before-leaving/items/{item_id}?telegram_id={user_id}")
        assert del_again.status_code == 404

        # List is empty
        list_res = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert list_res.json() == []

    @pytest.mark.asyncio
    async def test_batch_reordering(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90005

        r1 = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "item 1"})
        r2 = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "item 2"})
        r3 = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "item 3"})

        id1, id2, id3 = r1.json()["id"], r2.json()["id"], r3.json()["id"]

        # Reorder to [id3, id1, id2]
        reorder_resp = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_id}",
            json={"item_ids": [id3, id1, id2]},
        )
        assert reorder_resp.status_code == 200
        items = reorder_resp.json()
        assert [it["id"] for it in items] == [id3, id1, id2]
        assert [it["order"] for it in items] == [0, 1, 2]

        # Verify on subsequent GET
        list_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        items_persisted = list_resp.json()
        assert [it["id"] for it in items_persisted] == [id3, id1, id2]
        assert [it["order"] for it in items_persisted] == [0, 1, 2]


class TestBeforeLeavingSessionLifecycle:
    @pytest.mark.asyncio
    async def test_start_session_with_empty_template_fails_400(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90010

        resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert resp.status_code == 400
        assert "No template items configured" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_start_session_snapshots_template_items(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90011

        # Populate template
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Ключи"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Телефон"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Очки"})

        # Start session
        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_resp.status_code == 200
        session_data = start_resp.json()
        assert session_data["is_active"] is True
        assert session_data["total_count"] == 3
        assert session_data["completed_count"] == 0
        assert session_data["is_all_completed"] is False
        assert len(session_data["items"]) == 3
        assert [it["title"] for it in session_data["items"]] == ["Ключи", "Телефон", "Очки"]
        assert all(it["is_checked"] is False for it in session_data["items"])

        # GET /session/active returns identical session
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        active_data = active_resp.json()
        assert active_data["id"] == session_data["id"]
        assert active_data["total_count"] == 3

    @pytest.mark.asyncio
    async def test_resuming_active_session_vs_reset(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90012

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Пункт 1"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Пункт 2"})

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        session_id_1 = start_resp.json()["id"]
        item_id_1 = start_resp.json()["items"][0]["id"]

        # Check item 1
        toggle_resp = await client.patch(
            f"/api/before-leaving/session/items/{item_id_1}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert toggle_resp.status_code == 200
        assert toggle_resp.json()["completed_count"] == 1

        # Call start without reset -> should return the same session with completed_count == 1
        resume_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert resume_resp.status_code == 200
        resume_data = resume_resp.json()
        assert resume_data["id"] == session_id_1
        assert resume_data["completed_count"] == 1

        # Call start with reset=True -> should create a new session
        reset_resp = await client.post(
            f"/api/before-leaving/session/start?telegram_id={user_id}",
            json={"reset": True},
        )
        assert reset_resp.status_code == 200
        reset_data = reset_resp.json()
        assert reset_data["id"] != session_id_1
        assert reset_data["completed_count"] == 0

    @pytest.mark.asyncio
    async def test_template_alterations_do_not_affect_active_session_snapshot(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90013

        t1 = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Шаблон 1"})
        t2 = await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Шаблон 2"})
        t1_id = t1.json()["id"]

        # Start session
        session_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert session_resp.json()["total_count"] == 2

        # Delete template item 1 and add template item 3
        await client.delete(f"/api/before-leaving/items/{t1_id}?telegram_id={user_id}")
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Шаблон 3"})

        # Active session should still contain exactly 2 items: "Шаблон 1" and "Шаблон 2"
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        active = active_resp.json()
        assert active["total_count"] == 2
        assert [it["title"] for it in active["items"]] == ["Шаблон 1", "Шаблон 2"]


class TestBeforeLeavingCheckItemToggling:
    @pytest.mark.asyncio
    async def test_toggle_check_items_and_progress_calculation(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90020

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item A"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item B"})

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        items = start_resp.json()["items"]
        check_id_a, check_id_b = items[0]["id"], items[1]["id"]

        # 1. Toggle Item A (implicit toggle -> True)
        tog_a = await client.patch(f"/api/before-leaving/session/items/{check_id_a}/toggle?telegram_id={user_id}")
        assert tog_a.status_code == 200
        data_a = tog_a.json()
        assert data_a["completed_count"] == 1
        assert data_a["is_all_completed"] is False
        item_a = next(it for it in data_a["items"] if it["id"] == check_id_a)
        assert item_a["is_checked"] is True
        assert item_a["checked_at"] is not None

        # 2. Toggle Item A again (implicit toggle -> False)
        tog_a2 = await client.patch(f"/api/before-leaving/session/items/{check_id_a}/toggle?telegram_id={user_id}")
        assert tog_a2.status_code == 200
        data_a2 = tog_a2.json()
        assert data_a2["completed_count"] == 0
        item_a2 = next(it for it in data_a2["items"] if it["id"] == check_id_a)
        assert item_a2["is_checked"] is False
        assert item_a2["checked_at"] is None

        # 3. Explicit set Item A = True and Item B = True -> is_all_completed = True
        await client.patch(
            f"/api/before-leaving/session/items/{check_id_a}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        tog_all = await client.patch(
            f"/api/before-leaving/session/items/{check_id_b}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        data_all = tog_all.json()
        assert data_all["completed_count"] == 2
        assert data_all["total_count"] == 2
        assert data_all["is_all_completed"] is True

    @pytest.mark.asyncio
    async def test_toggle_nonexistent_item_returns_404(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90021

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item A"})
        await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")

        resp = await client.patch(
            f"/api/before-leaving/session/items/999999/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert resp.status_code == 404


class TestBeforeLeavingFinishAndConstraints:
    @pytest.mark.asyncio
    async def test_finish_rejected_when_checklist_incomplete(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90030

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item 1"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item 2"})

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        item_id_1 = start_resp.json()["items"][0]["id"]

        # Only 1 of 2 checked
        await client.patch(
            f"/api/before-leaving/session/items/{item_id_1}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )

        # Attempt to finish -> 400 Bad Request
        finish_resp = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert finish_resp.status_code == 400
        assert "Cannot finish session: unfinished items remain" in finish_resp.json()["detail"]

        # Session remains active
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        assert active_resp.json()["is_active"] is True

    @pytest.mark.asyncio
    async def test_finish_succeeds_when_all_completed(self, test_env):
        client: AsyncClient = test_env["client"]
        user_id = 90031

        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item 1"})
        await client.post(f"/api/before-leaving/items?telegram_id={user_id}", json={"title": "Item 2"})

        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        item_id_1 = start_resp.json()["items"][0]["id"]
        item_id_2 = start_resp.json()["items"][1]["id"]

        # Check both
        await client.patch(f"/api/before-leaving/session/items/{item_id_1}/toggle?telegram_id={user_id}", json={"is_checked": True})
        await client.patch(f"/api/before-leaving/session/items/{item_id_2}/toggle?telegram_id={user_id}", json={"is_checked": True})

        # Finish session -> 200 OK
        finish_resp = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert finish_resp.status_code == 200
        finished_data = finish_resp.json()
        assert finished_data["is_active"] is False
        assert finished_data["completed_at"] is not None
        assert finished_data["is_all_completed"] is True

        # Subsequent GET /session/active returns null
        active_resp = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_resp.status_code == 200
        assert active_resp.json() is None

        # Subsequent finish call returns 404 (no active session)
        second_finish = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert second_finish.status_code == 404


class TestBeforeLeavingMultiTenantIsolation:
    @pytest.mark.asyncio
    async def test_cross_tenant_isolation(self, test_env):
        client: AsyncClient = test_env["client"]
        user_a = 90041
        user_b = 90042

        # User A creates template items and starts session
        r_a = await client.post(f"/api/before-leaving/items?telegram_id={user_a}", json={"title": "User A Item"})
        item_a_id = r_a.json()["id"]

        sess_a = await client.post(f"/api/before-leaving/session/start?telegram_id={user_a}")
        check_item_a_id = sess_a.json()["items"][0]["id"]

        # User B queries template items -> empty
        list_b = await client.get(f"/api/before-leaving/items?telegram_id={user_b}")
        assert list_b.json() == []

        # User B queries active session -> null
        active_b = await client.get(f"/api/before-leaving/session/active?telegram_id={user_b}")
        assert active_b.json() is None

        # User B cannot update or delete User A's template item
        patch_b = await client.patch(
            f"/api/before-leaving/items/{item_a_id}?telegram_id={user_b}",
            json={"title": "Hacked Title"},
        )
        assert patch_b.status_code == 404

        del_b = await client.delete(f"/api/before-leaving/items/{item_a_id}?telegram_id={user_b}")
        assert del_b.status_code == 404

        # User B cannot toggle User A's check item
        toggle_b = await client.patch(
            f"/api/before-leaving/session/items/{check_item_a_id}/toggle?telegram_id={user_b}",
            json={"is_checked": True},
        )
        assert toggle_b.status_code == 404

        # User B cannot finish User A's session
        finish_b = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_b}")
        assert finish_b.status_code == 404

        # User A's state is completely uncorrupted
        active_a = await client.get(f"/api/before-leaving/session/active?telegram_id={user_a}")
        assert active_a.json()["items"][0]["is_checked"] is False
