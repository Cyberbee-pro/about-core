# TDD Evidence Report: CRUD API Endpoints & Test Validation

## 1. Source Plan
- Reference: `resolve-npm-test-errors-plan.md`
- Governed by: `.agents/skills/tdd-workflow.md`

## 2. User Journeys
1. **Public Reading**: As a public portfolio visitor, I want to fetch all skills, achievements, certificates, and experiences, so that I can view the owner's credentials and work history.
2. **Resource Lookup**: As a client app or viewer, I want to fetch a single item by ID, so that I can inspect detailed metadata without error.
3. **Admin Mutation & Conflict Prevention**: As an authenticated admin, I want to create, update, and delete skills, achievements, certificates, and experiences, with unique validation returning HTTP 409 on duplicate names, titles, or organizations.
4. **Security Gate**: As a security gatekeeper, I want unauthenticated or unauthorized mutation attempts to be rejected with HTTP 401 Unauthorized.

## 3. Task Report

### Task 1: TypeScript Diagnostics & Model Validation
- **Summary**: Resolved 49 compilation errors in TypeScript 5.7+ across `src/server.ts`, `tests/models.test.ts`, and controller handlers.
- **Validation Command**: `npx tsc --noEmit`
- **Result**: Exit code 0, 0 errors.

### Task 2: RED Phase Reproduction
- **Summary**: Configured valid unit and integration test suites with `beforeEach` mock resetting to properly handle Jest's `resetMocks: true` setting. Corrected invalid test assertions (object instead of array on single creations) and attached required admin tokens. Ran test suites to establish clean RED failure state against the incomplete controllers.
- **Validation Command**: `npx jest tests/skills-tests.test.ts tests/achievements-tests.test.ts tests/certificates-tests.test.ts tests/experiences-tests.test.ts`
- **RED Evidence**: 4 suites failed, 12 failed tests, 12 passed tests.
  - Failures: Missing `GET /:id` (404), unhandled duplicate conflict (returned 201 instead of 409), invalid Experience field assignments.
- **Git Checkpoint**: `eafee9c` ("test: add reproducer for CRUD API endpoints and validation")

### Task 3: GREEN Phase Implementation
- **Summary**: Implemented canonical controllers and routes for Skills, Achievements, Certificates, and Experiences matching their Mongoose schemas, handling duplicate detection with HTTP 409, and providing `GET /:id`.
- **Validation Command**: `npm test`
- **GREEN Evidence**: 8 test suites passed, 109 tests passed, 0 failed.

## 4. Test Specification

| # | What is guaranteed | Test Target | Test Type | Result | Evidence |
|---|--------------------|-------------|-----------|--------|----------|
| 1 | GET `/api/v1/skills` returns all skills sorted by weight and name | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 2 | GET `/api/v1/skills/:id` returns single skill or 404 | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 3 | POST `/api/v1/skills` creates skill when admin token present | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 4 | POST `/api/v1/skills` rejects duplicate name with HTTP 409 | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 5 | PUT `/api/v1/skills/:id` updates skill with validation | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 6 | DELETE `/api/v1/skills/:id` deletes skill when authenticated | `tests/skills-tests.test.ts` | Integration | PASS | `npm test` |
| 7 | GET `/api/v1/achievements` returns all achievements | `tests/achievements-tests.test.ts` | Integration | PASS | `npm test` |
| 8 | GET `/api/v1/achievements/:id` returns single achievement or 404 | `tests/achievements-tests.test.ts` | Integration | PASS | `npm test` |
| 9 | POST `/api/v1/achievements` rejects duplicate title with HTTP 409 | `tests/achievements-tests.test.ts` | Integration | PASS | `npm test` |
| 10 | GET `/api/v1/certificates` returns all certificates | `tests/certificates-tests.test.ts` | Integration | PASS | `npm test` |
| 11 | GET `/api/v1/certificates/:id` returns single certificate or 404 | `tests/certificates-tests.test.ts` | Integration | PASS | `npm test` |
| 12 | POST `/api/v1/certificates` rejects duplicate title with HTTP 409 | `tests/certificates-tests.test.ts` | Integration | PASS | `npm test` |
| 13 | GET `/api/v1/experiences` returns all experiences | `tests/experiences-tests.test.ts` | Integration | PASS | `npm test` |
| 14 | GET `/api/v1/experiences/:id` returns single experience or 404 | `tests/experiences-tests.test.ts` | Integration | PASS | `npm test` |
| 15 | POST `/api/v1/experiences` creates experience matching canonical schema | `tests/experiences-tests.test.ts` | Integration | PASS | `npm test` |
| 16 | POST `/api/v1/experiences` rejects duplicate organization with HTTP 409 | `tests/experiences-tests.test.ts` | Integration | PASS | `npm test` |
| 17 | DELETE on protected routes without auth returns HTTP 401 | `tests/api.test.ts` | Integration | PASS | `npm test` |
| 18 | Mongoose models validate fields and default values | `tests/models.test.ts` | Unit | PASS | `npm test` |

## 5. Verification Commands for the User
```bash
# Type check:
npx tsc --noEmit

# Run all test suites:
npm test

# Stage and commit:
git add src/ .agents/tdd/
git commit -m "fix: resolve controller typing, routing, and CRUD API test failures"
```
