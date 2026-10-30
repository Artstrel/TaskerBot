# Test Suite Readiness Report (TEST_READY.md)

## 1. Overview
The comprehensive, opaque-box, requirement-driven E2E test suite for numeric tasks ("числительные задачи") persistence and regression verification has been implemented and verified.

- **Test Suite Location**: `tests/test_numeric_tasks_persistence.py`
- **Execution Command**:
  ```bash
  .venv/bin/pytest tests/test_numeric_tasks_persistence.py -v
  ```
- **Execution Time**: ~2.7 seconds
- **Pass Rate**: 100% (22/22 passed)

---

## 2. 4-Tier Test Coverage Breakdown

### Tier 1: Feature Coverage (6/6 Passed)
- `test_create_quantitative_routine`: Creation of routine with `target_value`, `step`, `unit`, default `current_value=0.0`, `is_completed_today=False`.
- `test_create_quantitative_one_time_task`: Creation of task with `target_value`, `step`, `unit`, default `current_value=0.0`, `is_completed=False`.
- `test_routine_progress_stepper_delta_and_absolute`: Progress updates via incremental stepper `delta` (+0.25, +0.25 -> 0.50) and absolute value assignment (1.50).
- `test_task_progress_stepper_delta_and_absolute`: Progress updates via incremental stepper `delta` (+5.0) and absolute value assignment (15.0).
- `test_dashboard_today_reflects_current_value`: Verification that `GET /api/dashboard/today` accurately reflects `current_value` across both routines and tasks.
- `test_auto_completion_on_reaching_target`: Auto-completion when `current_value >= target_value` and auto-uncompletion when decremented below target.

### Tier 2: Boundary & Corner Cases (7/7 Passed)
- `test_float_step_precision_and_rounding`: Exact 2-decimal precision handling for fractional steps (0.33 -> 0.66 -> 0.99) without floating-point artifacts.
- `test_clamping_at_zero_no_negative_values`: Verification that negative delta updates and negative absolute inputs are clamped to `0.0` for both routines and tasks.
- `test_exceeding_target_value`: Verifies values can safely exceed target (e.g. 3.5 / 2.0 L or 8.0 / 5.0 km) while preserving completion status.
- `test_empty_or_zero_progress_payload`: Verifies payload safety (`{"delta": 0.0}` or `{}`) retaining existing values without resetting.
- `test_rapid_concurrent_routine_progress_updates`: Verifies rapid concurrent stepper (+) clicks execute cleanly without 500 errors or duplicate rows in `routine_logs`.
- `test_database_unique_constraint_enforcement`: Direct database verification that `UniqueConstraint("routine_id", "date")` blocks physical duplicate rows.
- `test_deduplication_prefers_highest_progress`: Verifies deduplication logic in `get_user_routines_with_status` prioritizes highest progress and completion.

### Tier 3: Cross-Feature Combinations (4/4 Passed)
- `test_routine_checkbox_toggle_and_stepper_interaction`: Bidirectional sync between checkbox toggle (advancing to target_value on check, resetting to 0.0 on uncheck) and stepper adjustments.
- `test_task_checkbox_toggle_and_stepper_interaction`: Bidirectional sync between task checkbox toggle and stepper adjustments.
- `test_quantitative_task_linked_to_goal_rollup`: Goal progress calculation (`completed_subtasks`, `progress_percentage`, `is_completed`) rollup when numeric subtasks reach or fall below target.
- `test_multiple_routines_on_same_date_isolation`: Batch log query isolation across multiple user routines on the same date and tenant isolation between distinct users.

### Tier 4: Real-World Workload & 30–40s Persistence Verification (5/5 Passed)
- `test_simulated_30_40s_background_polling_persistence`: Simulates the periodic 18s polling loop across 18s (tick 1), 36s (tick 2 - original failure point), and 54s (>40s mark), asserting values remain strictly preserved (never resetting to 0.0) both in API responses and in underlying database tables.
- `test_unauthenticated_polling_does_not_corrupt_data`: Verifies unauthenticated polling (e.g. `telegram_id=0`) returns 401 Unauthorized without wiping or corrupting persisted database records.
- `test_non_numeric_routine_regression`: Non-numeric routines maintain proper streak increments, completion toggling, and dashboard serialization.
- `test_non_numeric_task_and_postpone_regression`: Non-numeric tasks maintain completion toggling, priority, and date postponement.
- `test_grocery_items_crud_and_completion_regression`: Grocery items (both quantitative and standard) create, update, and complete cleanly.

---

## 3. Discovered Implementation Defects (For Implementer Escalation)

1. **Concurrent Initial Log Creation Defect**:
   - **Location**: `backend/crud.py` (`update_routine_progress` lines 484–492 & 518).
   - **Observation**: If two concurrent requests arrive for a routine on a date when no `RoutineLog` exists yet, both coroutines see `log is None` and execute `session.add(RoutineLog(...))`. The second commit fails with unhandled `sqlalchemy.exc.IntegrityError: UNIQUE constraint failed: routine_logs.routine_id, routine_logs.date`.
   - **Recommendation**: Wrap `await session.commit()` in `try ... except IntegrityError:` to rollback the failed insert, re-query the existing log created by the concurrent request, and re-apply the update.
