"""
Challenger 2 Empirical Adversarial Test Suite for Milestone 1 Backend:
- Extreme inputs & boundary tests (500-char strings, unicode, emojis, whitespace, negative/duplicate orders).
- Cross-user attacks & multi-tenant isolation tests (snooping, tampering, toggling, finishing, reordering).
- Template mutation & deletion during in-flight active sessions.
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
async def challenge_env() -> AsyncGenerator[dict, None]:
    """
    Provisions a completely isolated SQLite test database and an ASGITransport AsyncClient.
    Overrides FastAPI get_db dependency. Cleans up on teardown.
    """
    temp_dir = tempfile.mkdtemp(prefix="tasker_challenger2_test_")
    db_path = os.path.join(temp_dir, "test_tasker_challenge.db")
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


class TestExtremeInputsAndBoundaries:
    """Challenge 1: Stress testing boundary inputs, maximum string lengths, unicode, and emojis."""

    @pytest.mark.asyncio
    async def test_title_maximum_500_chars(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 70001

        # Title with exactly 500 characters
        exact_500_title = "П" + "а" * 498 + "с"
        assert len(exact_500_title) == 500

        resp = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": exact_500_title},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["title"] == exact_500_title
        assert len(data["title"]) == 500
        item_id = data["id"]

        # Verify session snapshot retains full 500 characters
        start_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_resp.status_code == 200, start_resp.text
        sess_data = start_resp.json()
        assert sess_data["items"][0]["title"] == exact_500_title
        assert len(sess_data["items"][0]["title"]) == 500

        # Verify toggle on 500-char item
        check_item_id = sess_data["items"][0]["id"]
        toggle_resp = await client.patch(
            f"/api/before-leaving/session/items/{check_item_id}/toggle?telegram_id={user_id}"
        )
        assert toggle_resp.status_code == 200
        assert toggle_resp.json()["items"][0]["title"] == exact_500_title

    @pytest.mark.asyncio
    async def test_oversized_titles_rejected_with_422(self, challenge_env):
        """
        Adversarial Boundary Test:
        Strings exceeding 500 characters (501, 1000, 10000 chars) must be strictly
        rejected with HTTP 422 Unprocessable Entity during both item creation and update.
        Response must include detailed Pydantic validation errors and never cause internal server errors (500).
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 700019

        # First, create a valid item for update tests
        valid_res = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Базовый предмет для проверки обновления"},
        )
        assert valid_res.status_code == 200
        item_id = valid_res.json()["id"]

        oversized_lengths = [501, 502, 1000, 10000]

        # 1. Probing creation with oversized strings
        for length in oversized_lengths:
            payload_ascii = "A" * length
            resp_ascii = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": payload_ascii},
            )
            assert resp_ascii.status_code == 422, f"Expected 422 for length {length}, got {resp_ascii.status_code}"
            err_data = resp_ascii.json()
            assert "detail" in err_data
            assert any(
                "cannot exceed 500 characters" in str(err.get("msg", ""))
                or err.get("type") in ("string_too_long", "value_error")
                for err in err_data["detail"]
            )

            # Probing unicode multi-byte string
            payload_unicode = "Я" * length
            resp_unicode = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": payload_unicode},
            )
            assert resp_unicode.status_code == 422
            assert "detail" in resp_unicode.json()

        # 2. Probing updates with oversized strings
        for length in oversized_lengths:
            payload = "U" * length
            resp_patch = await client.patch(
                f"/api/before-leaving/items/{item_id}?telegram_id={user_id}",
                json={"title": payload},
            )
            assert resp_patch.status_code == 422, f"Expected 422 for PATCH length {length}, got {resp_patch.status_code}"
            err_data = resp_patch.json()
            assert "detail" in err_data
            assert any(
                "cannot exceed 500 characters" in str(err.get("msg", ""))
                or err.get("type") in ("string_too_long", "value_error")
                for err in err_data["detail"]
            )

        # 3. Probing whitespace-padded boundaries
        # 500 chars with surrounding whitespace -> stripped to 500 chars -> should SUCCEED
        padded_500 = "   " + ("W" * 500) + "   "
        resp_padded_500 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": padded_500},
        )
        assert resp_padded_500.status_code == 200
        assert len(resp_padded_500.json()["title"]) == 500

        # 501 chars with surrounding whitespace -> stripped to 501 chars -> should FAIL with 422
        padded_501 = "   " + ("X" * 501) + "   "
        resp_padded_501 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": padded_501},
        )
        assert resp_padded_501.status_code == 422
        assert "detail" in resp_padded_501.json()

        # 4. Probing valid 500-char update -> should SUCCEED
        resp_up_500 = await client.patch(
            f"/api/before-leaving/items/{item_id}?telegram_id={user_id}",
            json={"title": "Z" * 500},
        )
        assert resp_up_500.status_code == 200
        assert resp_up_500.json()["title"] == "Z" * 500

    @pytest.mark.asyncio
    async def test_unicode_and_diverse_emojis(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 70002

        diverse_titles = [
            "🔑 Ключи от квартиры и гаража",
            "Загранпаспорт с визой 🛂",
            "📱💳🪪 Трио: телефон, карты, права",
            "👨‍👩‍👧‍👦 Семейный набор страховок",
            "🐕‍🦺 Поводок и намордник для собаки",
            "⚡️ Зарядное устройство и пауэрбанк",
            "🇷🇺 Внутренний паспорт РФ",
            "«Выключить утюг и перекрыть газ!»",
            "关闭电源并锁好门 (Китайский)",
            "財布と鍵とスマホ (Японский)",
            "تأكد من إغلاق النوافذ (Арабский RTL)",
            "चाबी और बटुआ (Хинди)",
            "L'ordinateur portable & café au lait",
        ]

        created_ids = []
        for title in diverse_titles:
            resp = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": title},
            )
            assert resp.status_code == 200, f"Failed on title '{title}': {resp.text}"
            item = resp.json()
            # Title should preserve content (first letter capitalized if applicable, or preserved)
            assert len(item["title"]) > 0
            created_ids.append(item["id"])

        # Check list persistence
        list_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) == len(diverse_titles)

        # Start session and verify snapshots
        sess_resp = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert sess_resp.status_code == 200
        sess = sess_resp.json()
        assert sess["total_count"] == len(diverse_titles)
        assert len(sess["items"]) == len(diverse_titles)

    @pytest.mark.asyncio
    async def test_empty_and_whitespace_title_rejection(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 70003

        # Standard whitespace and empty strings must be rejected
        invalid_titles = [
            "",
            "   ",
            "\t\n\r",
            "   \n  \t  ",
        ]

        for inv in invalid_titles:
            resp = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": inv},
            )
            assert resp.status_code in (400, 422), f"Expected rejection for '{repr(inv)}', got {resp.status_code}"

        # Missing title field
        resp_missing = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={},
        )
        assert resp_missing.status_code == 422

        # Null title field
        resp_null = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": None},
        )
        assert resp_null.status_code == 422

    @pytest.mark.asyncio
    async def test_zero_width_space_boundary_observation(self, challenge_env):
        """
        Adversarial Boundary Probe:
        Python's str.strip() adheres to Unicode whitespace (category Zs), but does NOT strip
        Format characters like U+200B (Zero Width Space, category Cf).
        We probe whether U+200B passes validation or gets stored.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 700031

        zw_title = " \u200b\u200b "
        resp = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": zw_title},
        )
        # Record empirical behavior: Python strip leaves \u200b intact so it returns 200
        assert resp.status_code in (200, 400, 422)


    @pytest.mark.asyncio
    async def test_update_item_empty_title_rejection(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 70004

        # Create valid item
        res = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Валидный пункт"},
        )
        item_id = res.json()["id"]

        # Try updating with empty or whitespace
        for bad_title in ["", "    ", "\n"]:
            patch_resp = await client.patch(
                f"/api/before-leaving/items/{item_id}?telegram_id={user_id}",
                json={"title": bad_title},
            )
            assert patch_resp.status_code in (400, 422), f"Expected 400/422 on update with '{bad_title}', got {patch_resp.status_code}"

        # Ensure original title remained intact
        get_resp = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert get_resp.json()[0]["title"] == "Валидный пункт"

    @pytest.mark.asyncio
    async def test_order_boundaries_and_reorder_edge_cases(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 70005

        # Create with negative order
        res1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Отрицательный порядок", "order": -50},
        )
        assert res1.status_code == 200
        assert res1.json()["order"] == -50

        # Create with large order
        res2 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Большой порядок", "order": 1000000},
        )
        assert res2.status_code == 200
        assert res2.json()["order"] == 1000000

        # Auto-increment after negative and large order
        res3 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Авто порядок"},
        )
        assert res3.status_code == 200
        assert res3.json()["order"] == 1000001

        # Reorder with empty list
        reorder_empty = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_id}",
            json={"item_ids": []},
        )
        assert reorder_empty.status_code == 200

        # Reorder with non-existent item IDs
        reorder_nonexistent = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_id}",
            json={"item_ids": [999999, 888888]},
        )
        assert reorder_nonexistent.status_code == 200


class TestCrossUserAdversarialAttacks:
    """Challenge 2: Multi-tenant security isolation attacks between distinct users."""

    @pytest.mark.asyncio
    async def test_cross_user_template_tampering_attacks(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_a = 80001
        user_b = 80002

        # User A creates template items
        res_a1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_a}",
            json={"title": "Секретные ключи А"},
        )
        item_a1_id = res_a1.json()["id"]

        res_a2 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_a}",
            json={"title": "Кошелек А"},
        )
        item_a2_id = res_a2.json()["id"]

        # User B creates template item
        res_b1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_b}",
            json={"title": "Рюкзак Б"},
        )
        item_b1_id = res_b1.json()["id"]

        # Attack 1: User B tries to view items, should NOT see User A's items
        list_b = await client.get(f"/api/before-leaving/items?telegram_id={user_b}")
        items_b = list_b.json()
        assert len(items_b) == 1
        assert items_b[0]["id"] == item_b1_id
        assert all(it["id"] not in (item_a1_id, item_a2_id) for it in items_b)

        # Attack 2: User B tries to PATCH User A's template item
        patch_attack = await client.patch(
            f"/api/before-leaving/items/{item_a1_id}?telegram_id={user_b}",
            json={"title": "Взломанный заголовок"},
        )
        assert patch_attack.status_code == 404, "User B should receive 404 when attempting to PATCH User A's item"

        # Verify User A's item was not modified
        list_a = await client.get(f"/api/before-leaving/items?telegram_id={user_a}")
        assert list_a.json()[0]["title"] == "Секретные ключи А"

        # Attack 3: User B tries to DELETE User A's template item
        del_attack = await client.delete(
            f"/api/before-leaving/items/{item_a1_id}?telegram_id={user_b}"
        )
        assert del_attack.status_code == 404, "User B should receive 404 when attempting to DELETE User A's item"

        # Verify User A's item still exists
        list_a_after = await client.get(f"/api/before-leaving/items?telegram_id={user_a}")
        assert len(list_a_after.json()) == 2

        # Attack 4: User B tries to reorder User A's items under User B's account
        reorder_attack = await client.put(
            f"/api/before-leaving/items/reorder?telegram_id={user_b}",
            json={"item_ids": [item_a1_id, item_b1_id]},
        )
        assert reorder_attack.status_code == 200
        # User A's items should remain in original order
        list_a_final = await client.get(f"/api/before-leaving/items?telegram_id={user_a}")
        assert list_a_final.json()[0]["id"] == item_a1_id
        assert list_a_final.json()[0]["order"] == 0

    @pytest.mark.asyncio
    async def test_cross_user_active_session_attacks(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_a = 80010
        user_b = 80020

        # Setup User A with 2 items and start active session
        await client.post(
            f"/api/before-leaving/items?telegram_id={user_a}",
            json={"title": "Предмет А1"},
        )
        await client.post(
            f"/api/before-leaving/items?telegram_id={user_a}",
            json={"title": "Предмет А2"},
        )
        start_a = await client.post(f"/api/before-leaving/session/start?telegram_id={user_a}")
        assert start_a.status_code == 200
        sess_a = start_a.json()
        check_a1_id = sess_a["items"][0]["id"]
        check_a2_id = sess_a["items"][1]["id"]

        # Attack 1: User B tries to query active session before starting one
        sess_b_active = await client.get(f"/api/before-leaving/session/active?telegram_id={user_b}")
        assert sess_b_active.status_code == 200
        assert sess_b_active.json() is None, "User B should not see User A's active session"

        # Attack 2: User B tries to toggle User A's checklist item
        toggle_attack = await client.patch(
            f"/api/before-leaving/session/items/{check_a1_id}/toggle?telegram_id={user_b}",
            json={"is_checked": True},
        )
        assert toggle_attack.status_code == 404, "User B toggling User A's item must return 404"

        # Verify User A's item remains unchecked
        sess_a_check = await client.get(f"/api/before-leaving/session/active?telegram_id={user_a}")
        assert sess_a_check.json()["items"][0]["is_checked"] is False

        # Attack 3: User B tries to finish User A's session (when User B has no session)
        finish_attack = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_b}")
        assert finish_attack.status_code == 404, "User B finish without session must return 404"

        # Verify User A's session is still active
        sess_a_check2 = await client.get(f"/api/before-leaving/session/active?telegram_id={user_a}")
        assert sess_a_check2.json()["is_active"] is True

        # User B sets up their own template and starts their own active session
        await client.post(
            f"/api/before-leaving/items?telegram_id={user_b}",
            json={"title": "Предмет Б1"},
        )
        start_b = await client.post(f"/api/before-leaving/session/start?telegram_id={user_b}")
        assert start_b.status_code == 200
        sess_b = start_b.json()
        check_b1_id = sess_b["items"][0]["id"]

        # Attack 4: Now User B has an active session. User B attempts to toggle User A's check item Check_A1
        toggle_attack2 = await client.patch(
            f"/api/before-leaving/session/items/{check_a1_id}/toggle?telegram_id={user_b}",
            json={"is_checked": True},
        )
        assert toggle_attack2.status_code == 404, "Cross-session check item toggle must return 404"

        # Verify User A's item is STILL unchecked
        sess_a_check3 = await client.get(f"/api/before-leaving/session/active?telegram_id={user_a}")
        assert sess_a_check3.json()["items"][0]["is_checked"] is False
        # And User B's item is still unchecked
        sess_b_check = await client.get(f"/api/before-leaving/session/active?telegram_id={user_b}")
        assert sess_b_check.json()["items"][0]["is_checked"] is False

        # Attack 5: User B checks their own item and finishes their own session
        toggle_b = await client.patch(
            f"/api/before-leaving/session/items/{check_b1_id}/toggle?telegram_id={user_b}",
            json={"is_checked": True},
        )
        assert toggle_b.status_code == 200
        finish_b = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_b}")
        assert finish_b.status_code == 200
        assert finish_b.json()["is_active"] is False

        # Ensure User A's session was unaffected by User B finishing
        sess_a_final = await client.get(f"/api/before-leaving/session/active?telegram_id={user_a}")
        assert sess_a_final.json() is not None
        assert sess_a_final.json()["is_active"] is True
        assert sess_a_final.json()["total_count"] == 2
        assert sess_a_final.json()["completed_count"] == 0


class TestInFlightTemplateMutationResilience:
    """Challenge 3: Robustness against mutating/deleting template items while session is active."""

    @pytest.mark.asyncio
    async def test_delete_and_mutate_template_items_during_active_session(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 90001

        # 1. Setup template with 3 items
        r1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Загранпаспорт", "order": 0},
        )
        t1_id = r1.json()["id"]

        r2 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Кошелек с наличными", "order": 1},
        )
        t2_id = r2.json()["id"]

        r3 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Ключи от машины", "order": 2},
        )
        t3_id = r3.json()["id"]

        # 2. Start active session (snapshotting 3 items)
        start_res = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_res.status_code == 200
        sess_data = start_res.json()
        assert sess_data["is_active"] is True
        assert sess_data["total_count"] == 3
        check_items = sess_data["items"]
        c1_id = check_items[0]["id"]
        c2_id = check_items[1]["id"]
        c3_id = check_items[2]["id"]

        # 3. In-flight mutation: Delete template item T2
        del_res = await client.delete(f"/api/before-leaving/items/{t2_id}?telegram_id={user_id}")
        assert del_res.status_code == 200

        # Verify template now only has 2 items
        tpl_after_del = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert len(tpl_after_del.json()) == 2
        assert all(it["id"] != t2_id for it in tpl_after_del.json())

        # 4. In-flight mutation: Update template item T1 title and order
        patch_res = await client.patch(
            f"/api/before-leaving/items/{t1_id}?telegram_id={user_id}",
            json={"title": "Супер новый паспорт", "order": 99},
        )
        assert patch_res.status_code == 200

        # 5. In-flight addition: Add a new item T4 to template
        add_res = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Наушники с шумоподавлением"},
        )
        assert add_res.status_code == 200
        t4_id = add_res.json()["id"]

        # 6. Verify Active Session Integrity:
        # Session MUST still contain all 3 original check items with original titles
        active_sess_res = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_sess_res.status_code == 200
        active_sess = active_sess_res.json()
        assert active_sess["total_count"] == 3
        assert len(active_sess["items"]) == 3

        active_items_by_id = {it["id"]: it for it in active_sess["items"]}

        # Check item 1 retained original title "Загранпаспорт" (not "Супер новый паспорт")
        assert active_items_by_id[c1_id]["title"] == "Загранпаспорт"
        # Check item 2 is STILL present even though T2 was deleted from templates
        assert active_items_by_id[c2_id]["title"] == "Кошелек с наличными"
        # Check item 3 is present
        assert active_items_by_id[c3_id]["title"] == "Ключи от машины"

        # 7. Verify Check Item Toggling works smoothly on all items (including orphaned C2)
        # Toggle C2 (whose template was deleted)
        tog_c2 = await client.patch(
            f"/api/before-leaving/session/items/{c2_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert tog_c2.status_code == 200
        assert tog_c2.json()["completed_count"] == 1

        # Toggle C1 and C3
        await client.patch(
            f"/api/before-leaving/session/items/{c1_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        tog_c3 = await client.patch(
            f"/api/before-leaving/session/items/{c3_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert tog_c3.status_code == 200
        assert tog_c3.json()["is_all_completed"] is True
        assert tog_c3.json()["completed_count"] == 3

        # 8. Finish session smoothly
        finish_res = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert finish_res.status_code == 200
        assert finish_res.json()["is_active"] is False

        # Active session query now returns null
        assert (await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")).json() is None

        # 9. Next session start uses the NEW template snapshot (T1 updated, T3, T4)
        new_sess_res = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert new_sess_res.status_code == 200
        new_sess = new_sess_res.json()
        assert new_sess["total_count"] == 3
        new_titles = [it["title"] for it in new_sess["items"]]
        assert "Супер новый паспорт" in new_titles
        assert "Ключи от машины" in new_titles
        assert "Наушники с шумоподавлением" in new_titles
        assert "Кошелек с наличными" not in new_titles

    @pytest.mark.asyncio
    async def test_total_template_wipeout_during_active_session(self, challenge_env):
        """
        Adversarial Scenario:
        User starts active session, then deletes 100% of their template items.
        Active session must continue to function, allow item toggles, and finish successfully.
        Subsequent session start must then fail with 400 until new template items are added.
        """
        client: AsyncClient = challenge_env["client"]
        user_id = 90002

        # 1. Create 2 template items
        res1 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Пункт 1"},
        )
        t1_id = res1.json()["id"]
        res2 = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Пункт 2"},
        )
        t2_id = res2.json()["id"]

        # 2. Start active session
        sess_res = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert sess_res.status_code == 200
        check_items = sess_res.json()["items"]
        c1_id = check_items[0]["id"]
        c2_id = check_items[1]["id"]

        # 3. Wipe out ALL template items
        del1 = await client.delete(f"/api/before-leaving/items/{t1_id}?telegram_id={user_id}")
        assert del1.status_code == 200
        del2 = await client.delete(f"/api/before-leaving/items/{t2_id}?telegram_id={user_id}")
        assert del2.status_code == 200

        # Template is now empty
        assert (await client.get(f"/api/before-leaving/items?telegram_id={user_id}")).json() == []

        # 4. Active session remains fully operational
        active_res = await client.get(f"/api/before-leaving/session/active?telegram_id={user_id}")
        assert active_res.status_code == 200
        assert active_res.json()["total_count"] == 2

        # Toggle both items
        tog1 = await client.patch(
            f"/api/before-leaving/session/items/{c1_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert tog1.status_code == 200
        tog2 = await client.patch(
            f"/api/before-leaving/session/items/{c2_id}/toggle?telegram_id={user_id}",
            json={"is_checked": True},
        )
        assert tog2.status_code == 200
        assert tog2.json()["is_all_completed"] is True

        # Finish session
        fin_res = await client.post(f"/api/before-leaving/session/finish?telegram_id={user_id}")
        assert fin_res.status_code == 200
        assert fin_res.json()["is_active"] is False

        # 5. Subsequent start MUST fail with 400 because template is completely empty
        start_empty = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_empty.status_code == 400
        assert "No template items configured" in start_empty.json()["detail"]


class TestSecurityAndInjectionHardening:
    """Challenge 4: SQL injection probes, script tags (XSS storage), and invalid data types."""

    @pytest.mark.asyncio
    async def test_sql_injection_and_script_payloads(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 99001

        injection_payloads = [
            "'; DROP TABLE before_leaving_items; --",
            "' OR 1=1; --",
            "<script>alert('xss_attack')</script>",
            "UNION SELECT * FROM users --",
            "Robert'); DROP TABLE students;--",
        ]

        created_ids = []
        for payload in injection_payloads:
            res = await client.post(
                f"/api/before-leaving/items?telegram_id={user_id}",
                json={"title": payload},
            )
            assert res.status_code == 200, f"Payload failed: {payload}"
            created_ids.append(res.json()["id"])

        # Verify all items stored safely and table is intact
        list_res = await client.get(f"/api/before-leaving/items?telegram_id={user_id}")
        assert list_res.status_code == 200
        items = list_res.json()
        assert len(items) == len(injection_payloads)

        # Snapshot into session
        start_res = await client.post(f"/api/before-leaving/session/start?telegram_id={user_id}")
        assert start_res.status_code == 200
        sess_items = start_res.json()["items"]
        assert len(sess_items) == len(injection_payloads)

    @pytest.mark.asyncio
    async def test_invalid_data_types_and_schema_validation(self, challenge_env):
        client: AsyncClient = challenge_env["client"]
        user_id = 99002

        # Invalid order type
        bad_order = await client.post(
            f"/api/before-leaving/items?telegram_id={user_id}",
            json={"title": "Ключи", "order": "not-an-int"},
        )
        assert bad_order.status_code == 422

        # Invalid telegram_id type
        bad_telegram_id = await client.get(
            "/api/before-leaving/items?telegram_id=not-a-number"
        )
        assert bad_telegram_id.status_code == 422

        # Invalid reset type on session start
        bad_reset = await client.post(
            f"/api/before-leaving/session/start?telegram_id={user_id}",
            json={"reset": "definitely-not-bool"},
        )
        assert bad_reset.status_code == 422

        # Invalid toggle is_checked type
        bad_toggle = await client.patch(
            f"/api/before-leaving/session/items/1/toggle?telegram_id={user_id}",
            json={"is_checked": [1, 2, 3]},
        )
        assert bad_toggle.status_code == 422

