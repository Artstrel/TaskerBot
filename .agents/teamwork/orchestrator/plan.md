# Plan — TaskerBot "Before Leaving" Mode

## Objectives
Implement and verify production-ready "Before Leaving" («Перед выходом») functionality:
1. R1: Template configuration interface for items and tasks with backend DB persistence.
2. R2: Active "Before Leaving" mode with full-screen blocking checklist, navigation lock, state persistence, and unlock on completion.
3. R3: Adaptive launch button: iOS Telegram WebApp profile bubble context menu; same line as profile bubble elsewhere.
4. Comprehensive automated testing (backend API tests, component/E2E UI tests, zero regressions).

## Execution Phases
- **Phase 0: Architecture & Codebase Survey**
  - Dispatch 3 parallel Explorers:
    - Explorer 1: Backend data models, endpoints, DB migrations, persistence patterns.
    - Explorer 2: Frontend components, navigation stack, profile bubble context menu, Telegram SDK detection, responsive layout.
    - Explorer 3: Test runner, existing test suites, frontend test setup, mocks, test fixtures.
  - Synthesize reports and create `PROJECT.md` with Feature Inventory, Milestones, and Interface Contracts.
- **Phase 1: Dual Track Execution**
  - Track A: E2E Testing Track (`TEST_INFRA.md`, test cases Tiers 1-4).
  - Track B: Implementation Track across scoped milestones.
- **Phase 2: Milestone Iteration Loops**
  - Milestone 1: Backend API & DB models for template and active mode.
  - Milestone 2: Frontend template configuration & adaptive launch button.
  - Milestone 3: Fullscreen blocking checklist & synchronization.
  - Milestone 4 (Final): 100% E2E test pass (Tiers 1-4) + Tier 5 adversarial hardening.
- **Phase 3: Independent Verification & Final Gate**
  - Reviewers, Challengers, and Forensic Auditor verification.
  - Final Handoff to Sentinel.
