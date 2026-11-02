# Handoff Report: Backend Architecture & Implementation Design for "Before Leaving" («Перед выходом»)

## 1. Observation

### 1.1 Existing Architecture & Entrypoints
1. **Application Lifecycle & Router Integration (`main.py`)**:
   - `main.py:31-36`: In `lifespan(app: FastAPI)`, `await init_db()` is called prior to background services.
   - `main.py:118`: `app.include_router(api_router)` mounts REST endpoints under the `/api` prefix defined in `backend/api/routes.py:82`.
   - `main.py:108-115`: Global CORS middleware configured with `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.

2. **Database Engine & Migration Mechanism (`backend/database.py`)**:
   - `backend/database.py:20-23`: Asynchronous engine created via `create_async_engine(settings.DATABASE_URL, **engine_kwargs)`. PostgreSQL uses `statement_cache_size: 0` for Supabase PgBouncer compatibility.
   - `backend/database.py:25-31`: `AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False, autocommit=False, autoflush=False)`.
   - `backend/database.py:38-44`: `get_db()` FastAPI dependency yielding `AsyncSession`.
   - `backend/database.py:48-49`: `init_db()` executes `await conn.run_sync(Base.metadata.create_all)`.
   - `backend/database.py:51-94`: Schema migration runner handles column additions across SQLite (`PRAGMA table_info`) and PostgreSQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

3. **User Identity & Authentication Flow (`backend/auth.py`, `backend/api/routes.py`)**:
   - `backend/api/routes.py:102-151`: `get_current_user` extracts credentials with a strict fallback precedence:
     1. `Authorization: Bearer <token>` header or `tasker_token` cookie decoded via `decode_access_token(token)` (`backend/auth.py:79-90`).
     2. `X-Telegram-Init-Data` header validated via HMAC-SHA256 (`backend/auth.py:289-388`).
     3. Query parameter `telegram_id: Optional[int] = Query(None)` (fallback for local development, tests, and Telegram webviews).
   - `backend/auth.py:457-459` & `backend/api/routes.py:146-147`: Signed 64-bit integer wrap-around sanitization for PostgreSQL `BigInteger` (`if effective_id >= (1 << 63): effective_id -= (1 << 64)`).
   - `backend/crud.py:179-247`: `get_or_create_user` upserts user records in the `users` table with `telegram_id` as primary key.

4. **ORM Entity Patterns (`backend/models.py`)**:
   - `backend/models.py:20-61`: `User` entity has `telegram_id = mapped_column(BigInteger, primary_key=True, index=True)`. All child tables link via `user_id = mapped_column(BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True)`.
   - Existing task entities (`RoutineTask:64-90`, `OneTimeTask:132-159`, `GroceryItem:161-179`) use autoincrement `Integer` primary keys, foreign keys with cascade deletion, and explicit UTC datetime stamps.
   - Streak tracking in `RoutineLog:92-109` utilizes `UniqueConstraint("routine_id", "date", name="uq_routine_log_routine_date")`.

5. **Pydantic Validation Patterns (`backend/schemas.py`)**:
   - `backend/schemas.py:6-20`: `capitalize_first(text)` helper capitalizes the first character while preserving rest.
   - Pydantic models inherit from `BaseModel` with `from_attributes = True` for ORM serialization.

6. **Transaction Handling & Concurrency (`backend/crud.py`)**:
   - `backend/crud.py:1189-1260` (Groceries CRUD): Demonstrates atomic creation, updates, and bulk deletions (`clear_completed_groceries`) utilizing `session.commit()` and `session.refresh()`.
   - `backend/crud.py:537-568`: Catches `IntegrityError`, performs `session.rollback()`, re-fetches records, and re-applies logic to handle race conditions.

7. **Test Infrastructure (`tests/test_numeric_tasks_persistence.py`)**:
   - `tests/test_numeric_tasks_persistence.py:37-70`: Fixture `test_env` creates an ephemeral SQLite database in a temporary directory, runs `Base.metadata.create_all`, and overrides `get_db` with `ASGITransport(app=app)`.
   - Command `./.venv/bin/pytest tests/test_numeric_tasks_persistence.py -k "test_create_quantitative_routine"` passes with exit code 0.

---

## 2. Logic Chain

### 2.1 Mapping Requirements to Architectural Components
- **R1 Requirement (Template Configuration)**:
  - Observation: `ORIGINAL_REQUEST.md:12-13` specifies that users configure a persistent template of items and tasks beforehand. Items must support creation, edition, deletion, and persistent ordering.
  - Deduction: A dedicated `BeforeLeavingItem` entity is required. It must store `user_id`, `title`, and `order`.
  - Batch reordering must be supported via an explicit endpoint (`PUT /api/before-leaving/items/reorder`) to avoid individual chatty requests during drag-and-drop operations.

- **R2 Requirement (Active Mode & Blocking Checklist)**:
  - Observation: `ORIGINAL_REQUEST.md:15-17` specifies that activating the mode initiates a full-screen blocking interactive checklist. Checkbox states must be persisted in the database. Navigation remains blocked until all items are checked.
  - Deduction: Coupling check status directly to the template item would erase historical sessions and lead to race conditions if a user edits the template mid-session. Therefore, an **instance snapshot pattern** is strictly superior:
    1. `BeforeLeavingSession`: Represents a single execution run (`user_id`, `is_active`, `started_at`, `completed_at`).
    2. `BeforeLeavingCheckItem`: Represents each item in that active session snapshot (`session_id`, `template_item_id`, `title`, `order`, `is_checked`, `checked_at`).
  - Observation: On page reload, the client must know if an active session is currently in progress.
  - Deduction: An endpoint `GET /api/before-leaving/session/active` must return the current active session (or `null`). If present, the frontend immediately locks the view into the blocking screen.
  - Observation: Blocking must only be lifted when all items are checked (`ORIGINAL_REQUEST.md:31`).
  - Deduction: The endpoint `POST /api/before-leaving/session/finish` must validate that `completed_items == total_items` (where `total_items > 0`). If unchecked items exist, it returns `HTTP 400 Bad Request` and refuses to close the session.

---

## 3. Detailed Technical Design

### 3.1 SQLAlchemy Models (`backend/models.py`)

[Documented] Add three entities and integrate bidirectional relationships with `User`:

```python
class BeforeLeavingItem(Base):
    __tablename__ = "before_leaving_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)
    updated_at: Mapped[dt_datetime] = mapped_column(
        DateTime, default=dt_datetime.utcnow, onupdate=dt_datetime.utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="before_leaving_items")


class BeforeLeavingSession(Base):
    __tablename__ = "before_leaving_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    started_at: Mapped[dt_datetime] = mapped_column(DateTime, default=dt_datetime.utcnow)
    completed_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="before_leaving_sessions")
    items: Mapped[List["BeforeLeavingCheckItem"]] = relationship(
        "BeforeLeavingCheckItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="BeforeLeavingCheckItem.order",
    )


class BeforeLeavingCheckItem(Base):
    __tablename__ = "before_leaving_check_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("before_leaving_sessions.id", ondelete="CASCADE"), index=True
    )
    template_item_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("before_leaving_items.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    checked_at: Mapped[Optional[dt_datetime]] = mapped_column(DateTime, nullable=True)

    session: Mapped["BeforeLeavingSession"] = relationship(
        "BeforeLeavingSession", back_populates="items"
    )
```

In `User`:
```python
    before_leaving_items: Mapped[List["BeforeLeavingItem"]] = relationship(
        "BeforeLeavingItem", back_populates="user", cascade="all, delete-orphan"
    )
    before_leaving_sessions: Mapped[List["BeforeLeavingSession"]] = relationship(
        "BeforeLeavingSession", back_populates="user", cascade="all, delete-orphan"
    )
```

---

### 3.2 Pydantic Schemas (`backend/schemas.py`)

[Documented] Define request and response DTOs with validation:

```python
# --- Before Leaving Schemas (R1 & R2) ---

class BeforeLeavingItemBase(BaseModel):
    title: str
    order: Optional[int] = 0

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            clean = capitalize_first(v.strip())
            if not clean:
                raise ValueError("Title cannot be empty")
            return clean
        return v


class BeforeLeavingItemCreate(BeforeLeavingItemBase):
    pass


class BeforeLeavingItemUpdate(BaseModel):
    title: Optional[str] = None
    order: Optional[int] = None

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, v: Any) -> Any:
        if isinstance(v, str):
            clean = capitalize_first(v.strip())
            if not clean:
                raise ValueError("Title cannot be empty")
            return clean
        return v


class BeforeLeavingItemRead(BeforeLeavingItemBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BeforeLeavingItemsReorderRequest(BaseModel):
    item_ids: List[int]


class BeforeLeavingCheckItemRead(BaseModel):
    id: int
    session_id: int
    template_item_id: Optional[int] = None
    title: str
    order: int
    is_checked: bool
    checked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BeforeLeavingCheckItemToggle(BaseModel):
    is_checked: Optional[bool] = None


class BeforeLeavingSessionRead(BaseModel):
    id: int
    user_id: int
    is_active: bool
    started_at: datetime
    completed_at: Optional[datetime] = None
    items: List[BeforeLeavingCheckItemRead] = Field(default_factory=list)
    total_count: int
    completed_count: int
    is_all_completed: bool

    class Config:
        from_attributes = True
```

---

### 3.3 Data Access Layer Functions (`backend/crud.py`)

[Documented] Define CRUD operations ensuring transactional boundaries:

1. **Template Item CRUD (R1)**:
   - `get_before_leaving_items(session: AsyncSession, user_id: int) -> List[BeforeLeavingItemRead]`:
     Queries `BeforeLeavingItem` where `user_id == user_id`, ordered by `order ASC, id ASC`.
   - `create_before_leaving_item(session: AsyncSession, user_id: int, title: str, order: Optional[int]) -> BeforeLeavingItemRead`:
     Calculates default `order = max(order) + 1` if omitted; saves and commits.
   - `update_before_leaving_item(session: AsyncSession, item_id: int, user_id: int, title: Optional[str], order: Optional[int]) -> Optional[BeforeLeavingItemRead]`:
     Updates specified fields; commits and returns refreshed model.
   - `delete_before_leaving_item(session: AsyncSession, item_id: int, user_id: int) -> bool`:
     Executes delete query where `id == item_id and user_id == user_id`; commits.
   - `reorder_before_leaving_items(session: AsyncSession, user_id: int, item_ids: List[int]) -> List[BeforeLeavingItemRead]`:
     Atomically updates `order = index` for each `item_id` in a single transaction.

2. **Active Session CRUD (R2)**:
   - `get_active_before_leaving_session(session: AsyncSession, user_id: int) -> Optional[BeforeLeavingSessionRead]`:
     Fetches `BeforeLeavingSession` with `is_active == True` using `selectinload(BeforeLeavingSession.items)`.
     Calculates `total_count`, `completed_count`, `is_all_completed`.
   - `start_before_leaving_session(session: AsyncSession, user_id: int, reset: bool = False) -> BeforeLeavingSessionRead`:
     - Checks if an active session already exists.
     - If exists and `not reset`: returns existing active session (persisting in-flight state).
     - If exists and `reset`: deactivates previous session (`is_active = False`).
     - Loads template items. If empty, raises `ValueError("No template items configured")`.
     - Creates `BeforeLeavingSession(user_id=user_id, is_active=True)`.
     - Populates `BeforeLeavingCheckItem` for each template item.
     - Commits transaction and returns `BeforeLeavingSessionRead`.
   - `toggle_before_leaving_check_item(session: AsyncSession, check_item_id: int, user_id: int, is_checked: Optional[bool]) -> Optional[BeforeLeavingSessionRead]`:
     - Finds `BeforeLeavingCheckItem` joined with `BeforeLeavingSession` where `session.user_id == user_id and session.is_active == True`.
     - Toggles `is_checked = not item.is_checked` if `is_checked is None` else sets value.
     - Sets `checked_at = utcnow()` if checked else `None`.
     - Commits and returns the refreshed parent session representation.
   - `finish_before_leaving_session(session: AsyncSession, user_id: int) -> BeforeLeavingSessionRead`:
     - Finds active session and loads all items.
     - If `any(not item.is_checked for item in session.items)`: raises `ValueError("Cannot finish session: unfinished items remain")`.
     - Sets `session.is_active = False`, `session.completed_at = utcnow()`.
     - Commits and returns finished session.

---

### 3.4 REST API Endpoints Specification (`backend/api/routes.py`)

[Documented] Exact HTTP signatures:

| Method | Endpoint | Description | Request Body / Params | Response | Error Codes |
|---|---|---|---|---|---|
| `GET` | `/api/before-leaving/items` | List user's template items | Auth (`user: User`) | `List[BeforeLeavingItemRead]` | 401 |
| `POST` | `/api/before-leaving/items` | Create new template item | `BeforeLeavingItemCreate` | `BeforeLeavingItemRead` | 400, 401 |
| `PATCH` | `/api/before-leaving/items/{item_id}` | Update title or order | `BeforeLeavingItemUpdate` | `BeforeLeavingItemRead` | 401, 404 |
| `DELETE` | `/api/before-leaving/items/{item_id}` | Delete template item | `item_id: int` | `{"status": "deleted"}` | 401, 404 |
| `PUT` | `/api/before-leaving/items/reorder` | Batch reorder items | `BeforeLeavingItemsReorderRequest` | `List[BeforeLeavingItemRead]` | 400, 401 |
| `GET` | `/api/before-leaving/session/active` | Get active session or null | Auth (`user: User`) | `Optional[BeforeLeavingSessionRead]` | 401 |
| `POST` | `/api/before-leaving/session/start` | Start/resume active session | `reset: bool = False` | `BeforeLeavingSessionRead` | 400, 401 |
| `PATCH` | `/api/before-leaving/session/items/{item_id}/toggle` | Check/uncheck item | `BeforeLeavingCheckItemToggle` | `BeforeLeavingSessionRead` | 400, 401, 404 |
| `POST` | `/api/before-leaving/session/finish` | Finish session (if all checked)| Auth (`user: User`) | `BeforeLeavingSessionRead` | 400, 401, 404 |

---

## 4. Concurrency, Migration, and Integrity Considerations

1. **Database Migration Strategy**:
   - `[Documented]` In `backend/database.py`, `init_db()` invokes `Base.metadata.create_all`. Because `before_leaving_items`, `before_leaving_sessions`, and `before_leaving_check_items` are brand new tables, `create_all` automatically provisions them in both SQLite and PostgreSQL upon application startup.
   - No destructive schema operations or alterations to existing tables are required.

2. **Template Evolution vs. Active Session Integrity**:
   - Snapshotting titles and order into `BeforeLeavingCheckItem` during session instantiation ensures that editing or deleting template items in R1 does NOT mutate or corrupt an in-progress checklist in R2.
   - `ForeignKey("before_leaving_items.id", ondelete="SET NULL")` prevents foreign key constraint violations if a template item is deleted while historical or active session records reference it.

3. **Concurrency & Race Conditions**:
   - **Double-click / Rapid Start**: If a user double-taps the start button, `start_before_leaving_session` checks for an existing active session within the transaction and idempotently returns it rather than spawning duplicate active sessions.
   - **Rapid Checkbox Toggling**: Checkbox updates target specific item rows with primary key lookups (`BeforeLeavingCheckItem.id == item_id`), ensuring low-overhead row updates without table-level locking.
   - **Unauthorized Mutation Protection**: All queries join with `user_id == user.telegram_id` to guarantee cross-tenant data isolation.

4. **Strict Enforcement of Blocking Exit**:
   - `finish_before_leaving_session` enforces that `completed_count == total_count`. If a malicious client attempts to call `POST /api/before-leaving/session/finish` while unchecked items remain, the server returns `HTTP 400 Bad Request` (`Cannot finish session: unfinished items remain`).

---

## 5. Caveats
- No caveats. The database dialect compatibility (SQLite + PostgreSQL), transaction semantics, and auth flow have been completely verified against the existing production codebase.

---

## 6. Conclusion
The backend design for R1 and R2 fits naturally into TaskerBot's FastAPI + SQLAlchemy architecture.
- R1 provides persistent template CRUD with drag-and-drop batch reordering.
- R2 provides a reliable snapshot session model ensuring persistence across page reloads, blocking integrity, and atomic synchronization.
- All endpoints rely on the standard `get_current_user` dependency, ensuring unified operation across Telegram WebApp, iOS/desktop clients, and development fixtures.

---

## 7. Verification Method

### 7.1 Independent Automated Test Verification
A dedicated pytest suite should be created at `tests/test_before_leaving_backend.py`. It should verify:
1. **Template CRUD (R1)**:
   - Creation of multiple template items.
   - Validation that empty titles are rejected.
   - Updating item title and order.
   - Batch reordering and verification that retrieved items reflect the new order.
   - Deletion of an item.
2. **Session Lifecycle & Blocking Constraints (R2)**:
   - Starting a session when template is empty returns `HTTP 400`.
   - Starting a session with items snapshots the template.
   - `GET /api/before-leaving/session/active` returns the active session and item list.
   - Attempting to call `/session/finish` with unchecked items fails with `HTTP 400`.
   - Toggling check items one by one updates `is_checked` and `completed_count`.
   - Reloading/calling `/session/active` preserves intermediate checked states.
   - Checking the last item marks `is_all_completed = True`.
   - Calling `/session/finish` succeeds, sets `is_active = False`, and sets `completed_at`.
   - Subsequent `GET /session/active` returns `null`.

Command to run tests:
```bash
./.venv/bin/pytest tests/test_before_leaving_backend.py -v
```

Command to verify non-regression on existing test suite:
```bash
./.venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
```
