# E2E Test Infra: TaskerBot "Before Leaving" Mode

## Test Philosophy
- Opaque-box, requirement-driven, validating behavior against user requirements in `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Zero-regression policy against existing 52-test suite (`tests/test_numeric_tasks_persistence.py`, `tests/test_numeric_challenge_stress.py`, `tests/test_non_numeric_regressions_stress.py`).

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross) | Tier 4 (Workload) |
|---|---------|-------------|:-----------------:|:-----------------:|:--------------:|:-----------------:|
| 1 | Template CRUD | R1 (Template config) | 5 | 5 | ✓ | ✓ |
| 2 | Template Reordering | R1 (Ordering) | 5 | 5 | ✓ | ✓ |
| 3 | Active Session Start & Snapshotting | R2 (Start mode) | 5 | 5 | ✓ | ✓ |
| 4 | Checkbox Interaction & DB Sync | R2 (Checklist sync) | 5 | 5 | ✓ | ✓ |
| 5 | Fullscreen Navigation Hard-Lock | R2 (Navigation lock) | 5 | 5 | ✓ | ✓ |
| 6 | Finish Validation & Unlock Transition | R2 (Unlock on 100%) | 5 | 5 | ✓ | ✓ |
| 7 | Session Persistence Across Reloads | R2 (State persistence) | 5 | 5 | ✓ | ✓ |
| 8 | Adaptive Button Placement (iOS vs Desktop) | R3 (Placement) | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Backend Test Runner**: `.venv/bin/pytest tests/ -v`
- **Harness**: Ephemeral SQLite DB with `aiosqlite` and `ASGITransport(app=app)`, zero external network dependencies.
- **Frontend Verification**: Production build verification `npm --prefix frontend run build` + lint check `npm --prefix frontend run lint` + simulated UI contract/E2E test suite.
- **Pass/Fail Semantics**: Exit code 0, 100% test pass, zero regressions.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | Standard Morning Departure | F1, F3, F4, F5, F6, F7 | User sets 4 items, starts mode, checks items one by one, exits upon completion cleanly |
| 2 | Mid-Session Interruption & Browser Refresh | F3, F4, F5, F7 | User checks 2 of 4 items, reloads page; UI immediately restores locked overlay with 2 items checked |
| 3 | Concurrent Template Modification | F1, F3, F4 | User has active session with 3 items; template item is edited/deleted in background; active session snapshot remains intact |
| 4 | iOS Telegram Context Menu Launch | F7, F8, F5 | Simulated Telegram iOS environment; trigger appears in profile bubble menu; opens lock; BackButton locked |
| 5 | Premature Escape Prevention Stress | F4, F5, F6 | User attempts to call finish endpoint or press Escape/back while 1 item unchecked; server and UI reject escape |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature
- Tier 2: ≥5 boundary/edge test cases per feature
- Tier 3: Pairwise combinations of state transitions (start, toggle, reload, finish, template edit)
- Tier 4: ≥5 realistic full user journey workloads
- Baseline Regression: 52/52 existing tests pass
