# about-core Working Structure

## Repository Overview
`about-core` is a serverless-ready Express 4 + TypeScript Headless CMS REST API for the [shibraj.dev](https://shibraj.dev) portfolio (powering both a Next.js web client and a native Kotlin Android client). It features MongoDB Atlas persistence via Mongoose, Cloudinary multi-format media streaming (images, videos, 3D GLB models, PDF resumes), custom MongoDB request telemetry logging (`LogEntry`), and full integration test coverage (10 test suites and 161 tests passing).

## Directory Structure

```
.
├── .agents/                                 # Agent orchestration & reference documentation
│   ├── working.md                           # This file — repository working structure & reference
│   ├── context.md                           # Context & domain overview
│   ├── architecture-spec.md                 # Complete schema & architectural specification
│   ├── API_HANDOFF.md                       # Comprehensive API specification for client engineers
│   ├── rules/
│   │   └── rules.md                         # Engineering & execution rules
│   ├── skills/                              # Agent engineering skills
│   │   ├── backend-patterns.md              # Express API & Mongoose patterns
│   │   ├── tdd-workflow.md                  # Test-driven development workflow
│   │   └── bettercode/                      # Code quality & security skills
│   └── tdd/                                 # Historical TDD test plans & evidence reports
├── api/                                     # Vercel serverless deployment entry point
│   └── index.ts                             # Exports Express application for Vercel Serverless Functions
├── dist/                                    # Compiled production output (tsc + tsc-alias resolved)
├── public/                                  # Static asset directory (served on / and /index.html)
│   ├── index.html                           # Evangelion / MAGI EVA-0 System Health Dashboard
│   ├── haz.svg                              # Hazard warning icon
│   ├── HEX_L.svg                            # Hexagonal dashboard decorative asset
│   └── HEX_R.svg                            # Hexagonal dashboard decorative asset
├── src/                                     # Application TypeScript source code
│   ├── server.ts                            # App initialization, CORS, static mounts, routes & error handling
│   ├── config/                              # Infrastructure connections
│   │   ├── db.ts                            # MongoDB connection management & pooling (cached connection)
│   │   └── cloudinary.ts                    # Cloudinary v2 SDK configuration (enforced HTTPS)
│   ├── models/                              # Mongoose schemas & TypeScript interfaces
│   │   ├── Project.ts                       # Core project schema (slug, tags, skills refs, 3D model, versions)
│   │   ├── SiteConfig.ts                    # Global configuration (name, pfp, pfpHistory, jobTitles, resume, bio)
│   │   ├── Skill.ts                         # Tech stack skills (name, logoUrl, featured, weight)
│   │   ├── Certificate.ts                   # Accreditations & certificates (title, org, mediaUrl, weight)
│   │   ├── Achievement.ts                   # Milestones & honors (title, date, detail, weight)
│   │   ├── Experience.ts                    # Work history (org, tag, type, iconUrl, skills, positions[])
│   │   ├── LogEntry.ts                      # Centralized MongoDB request log telemetry
│   │   └── index.ts                         # Barrel export for all 7 Mongoose models
│   ├── controllers/                         # Route handler controllers (business logic & validation)
│   │   ├── projectController.ts             # Project CRUD, filtering, version releases
│   │   ├── skillController.ts               # Skill CRUD with unique case-insensitive name validation
│   │   ├── certificateController.ts         # Certificate CRUD with unique title validation
│   │   ├── achievementController.ts         # Achievement CRUD with unique title validation
│   │   ├── experienceController.ts          # Experience CRUD & atomic position append with media uploads
│   │   ├── configController.ts              # Site config read, creation, avatar uploads & history rollback
│   │   └── logController.ts                 # Admin telemetry queries (date, month, year, level, pagination)
│   ├── routes/                              # Express route modules
│   │   ├── projectRoutes.ts                 # /api/v1/projects (public reads, admin mutations)
│   │   ├── skillRoutes.ts                   # /api/v1/skills (public reads, admin mutations)
│   │   ├── certificateRoutes.ts             # /api/v1/certificates (public reads, admin mutations)
│   │   ├── achievementRoutes.ts             # /api/v1/achievements (public reads, admin mutations)
│   │   ├── experienceRoutes.ts              # /api/v1/experiences (public reads, admin mutations, positions)
│   │   ├── configRoutes.ts                  # /api/v1/config (public read, admin write/update)
│   │   └── logRoutes.ts                     # /api/v1/admin/logs (admin protected log query)
│   ├── middlewares/                         # Express middleware pipeline
│   │   ├── authMiddleware.ts                # Bearer / x-admin-token authentication against ADMIN_SECRET
│   │   ├── dbLoggerMiddleware.ts            # Non-blocking response interception logging to MongoDB
│   │   ├── errorMiddleware.ts               # Centralized 404, 400, 403, 409, 500 error handler
│   │   └── uploadMiddleware.ts              # Multer in-memory buffering & Cloudinary streaming
│   ├── utils/                               # Helper utilities
│   │   └── stringUtils.ts                   # Regex special character escaping (ReDoS prevention)
│   └── types/                               # TypeScript type augmentations
│       └── express.d.ts                     # Express Request augmentation (adminAuthenticated, files)
├── tests/                                   # Jest + Supertest integration & unit test suite
│   ├── api.test.ts                          # Core API integration tests (health, projects, config, logs)
│   ├── cors.test.ts                         # Dynamic CORS origin parsing, preflights & blocking
│   ├── models.test.ts                       # Mongoose model validation & schema default tests
│   ├── uploadNaming.test.ts                 # Cloudinary sequential naming & cache fallback tests
│   ├── db.test.ts                           # Database connection caching & failure handling tests
│   ├── stringUtils.test.ts                  # Regex sanitization utility tests
│   ├── skills-tests.test.ts                 # Skill endpoints CRUD, sorting & duplicate checks
│   ├── certificates-tests.test.ts           # Certificate endpoints CRUD, sorting & duplicate checks
│   ├── experiences-tests.test.ts            # Experience endpoints, position append, media streaming
│   └── achievements-tests.test.ts           # Achievement endpoints CRUD, sorting & duplicate checks
├── .coderabbit.yaml                         # CodeRabbit review configuration
├── .env                                     # Local environment configuration (git-ignored)
├── .env.example                             # Environment variable template
├── .gitignore                               # Git ignore rules
├── agents.md                                # Root agent identity & orchestration instructions
├── cloudinary.md                            # Comprehensive Cloudinary folder hierarchy & upload specification
├── jest.config.ts                           # Jest test runner configuration (ts-jest, @/* path mappings)
├── package.json                             # Dependencies, scripts & engine specifications
├── package-lock.json                        # Dependency lockfile
├── README.md                                # Public project readme
├── tsconfig.json                            # Strict TypeScript compiler options & @/* path aliases
└── vercel.json                              # Vercel serverless function routing & rewrites
```

---

## API Endpoints Summary

### Public Endpoints
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` or `/index.html` | MAGI EVA-0 HTML System Dashboard (served from `public/`) |
| `GET` | `/health` | Basic service liveness: `{ status, uptime, timestamp }` |
| `GET` | `/api/v1/health` | Comprehensive API telemetry: `{ status, service, version, dbStatus, memoryUsageMB, nodeVersion, env }` |
| `GET` | `/api/v1/projects` | List visible projects (`status != 'invisible'`). Filters: `category`, `featured`, `tag` |
| `GET` | `/api/v1/projects/categories` | Distinct categories across visible projects |
| `GET` | `/api/v1/projects/:slug` | Fetch project by slug (invisible items return 404 unless admin authenticated) |
| `GET` | `/api/v1/skills` | List all skills sorted by `{ weight: 1, name: 1 }` |
| `GET` | `/api/v1/skills/:id` | Fetch single skill by ObjectId |
| `GET` | `/api/v1/certificates` | List all certificates sorted by `{ weight: 1, title: 1 }` |
| `GET` | `/api/v1/certificates/:id` | Fetch single certificate by ObjectId |
| `GET` | `/api/v1/achievements` | List all achievements sorted by `{ weight: 1, title: 1 }` |
| `GET` | `/api/v1/achievements/:id` | Fetch single achievement by ObjectId |
| `GET` | `/api/v1/experiences` | List all experiences sorted by `{ weight: 1, organization: 1 }` |
| `GET` | `/api/v1/experiences/:id` | Fetch single experience by ObjectId |
| `GET` | `/api/v1/config` | Get site-wide config (name, profile avatar, pfpHistory, job titles, bio, resume) |

### Protected (Admin) Endpoints
*Require `Authorization: Bearer <ADMIN_SECRET>` or `x-admin-token: <ADMIN_SECRET>`*

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/projects` | Create project (multipart: `image`, `videoDemo`, `threeDModel`) |
| `PUT` | `/api/v1/projects/:id` | Update project by MongoDB ObjectId |
| `DELETE` | `/api/v1/projects/:id` | Delete project by ObjectId (preserves Cloudinary assets) |
| `POST` | `/api/v1/projects/:slug/versions` | Append release version to project by slug (multipart media) |
| `POST` | `/api/v1/skills` | Create skill (multipart: `logoUrl`, unique name) |
| `PUT` | `/api/v1/skills/:id` | Update skill by ObjectId (multipart: `logoUrl`) |
| `DELETE` | `/api/v1/skills/:id` | Delete skill by ObjectId |
| `POST` | `/api/v1/certificates` | Create certificate (multipart: `mediaUrl`, unique title) |
| `PUT` | `/api/v1/certificates/:id` | Update certificate by ObjectId (multipart: `mediaUrl`) |
| `DELETE` | `/api/v1/certificates/:id` | Delete certificate by ObjectId |
| `POST` | `/api/v1/achievements` | Create achievement (unique title) |
| `PUT` | `/api/v1/achievements/:id` | Update achievement by ObjectId |
| `DELETE` | `/api/v1/achievements/:id` | Delete achievement by ObjectId |
| `POST` | `/api/v1/experiences` | Create experience (multipart: `iconUrl`, `mediaUrls`, `certificateUrls`) |
| `POST` | `/api/v1/experiences/:organization/positions` | Append promotion/role to organization with single-truth `isCurrent` |
| `PUT` | `/api/v1/experiences/:id` | Update experience by ObjectId (multipart uploads) |
| `DELETE` | `/api/v1/experiences/:id` | Delete experience by ObjectId |
| `POST` | `/api/v1/config` | Create initial site configuration (409 if already exists) |
| `PUT` | `/api/v1/config` | Update or upsert site config, handle new avatar upload, resume PDF upload (`resume_date_{num}.pdf`), or history rollback |
| `POST` | `/api/v1/config/resume` | Dedicated resume PDF upload endpoint saving `resumeUrl` directly to MongoDB |
| `GET` | `/api/v1/admin/logs` | Browse persisted request logs with date/month/year/level filters and pagination |

---

## Environment Variables

| Variable | Required | Default / Description |
|---|---|---|
| `PORT` | No | `5000` |
| `NODE_ENV` | No | `development` / `production` / `test` |
| `MONGO_URI` | Yes | MongoDB Atlas connection string (database: `about_core`) |
| `CLIENT_ORIGIN` | No | Comma-separated CORS origins (defaults to `https://core.shibraj.dev`, `https://client.shibraj.dev`, `https://shibraj.dev`, `http://localhost:3000`) |
| `ADMIN_SECRET` | Yes | Shared secret for all administrative mutations and log queries |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary account cloud name |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |

---

## Test Suite Overview

- **Status**: **10 test suites, 161 tests passing** (Jest serially executed with `--runInBand`).
- **In-Memory Testing**: Uses `mongodb-memory-server` for zero-dependency local and CI test runs.
- **Path Aliases**: `@/*` alias mapping verified across test and source files via `tsconfig-paths` and `jest.config.ts`.
- **Test File Map**:
  1. `tests/cors.test.ts` (9 tests) — Origin parsing, credentials, preflight OPTIONS, allowed/blocked behavior.
  2. `tests/api.test.ts` (24 tests) — Health checks, MAGI static dashboard, auth middleware, project, site config avatar and resume PDF flows.
  3. `tests/models.test.ts` (42 tests) — Schema constraints, defaults, and validations for all 7 Mongoose models (including resumeUrl on SiteConfig).
  4. `tests/uploadNaming.test.ts` (12 tests) — Cloudinary sequential ID derivation, resume PDF incremental naming, Search API queries, request-level caching, timestamp fallback.
  5. `tests/db.test.ts` (4 tests) — MongoDB connection pooling, cached readyState reuse, disconnection handling.
  6. `tests/stringUtils.test.ts` (3 tests) — Regex escaping for safe dynamic queries against ReDoS.
  7. `tests/skills-tests.test.ts` (11 tests) — Skill CRUD, weight/name sorting, duplicate name rejection.
  8. `tests/certificates-tests.test.ts` (14 tests) — Certificate CRUD, weight/title sorting, duplicate title rejection.
  9. `tests/experiences-tests.test.ts` (27 tests) — Experience CRUD, multi-position append, active role switching, media uploads.
  10. `tests/achievements-tests.test.ts` (15 tests) — Achievement CRUD, weight/title sorting, duplicate title rejection.

---

## Key Middlewares Pipeline (Execution Order in `server.ts`)

1. **`cors(...)`**: Dynamic origin validator parsing `CLIENT_ORIGIN`. Permits headless/curl requests without `Origin`, sets credentials to true, handles OPTIONS preflights, and returns 403 on disallowed origins.
2. **`express.json()` & `express.urlencoded({ extended: true })`**: Body parsers for JSON and form payloads.
3. **`express.static(path.join(process.cwd(), "public"))`**: Serves the Evangelion MAGI system dashboard directly from disk (mirrors Vercel Edge CDN).
4. **`dbLoggerMiddleware`**: Non-blocking response hook that intercepts `response.finish` and asynchronously creates a `LogEntry` in MongoDB with latency, IP, method, status code, and sanitized metadata.
5. **Health Routes**: `/health` (basic JSON) and `/api/v1/health` (detailed server and DB status).
6. **Feature Routes**: Mounted at `/api/v1/{projects, skills, certificates, achievements, experiences, config, admin/logs}`.
7. **`notFoundMiddleware`**: Centralized 404 handler returning structured JSON.
8. **`errorMiddleware`**: Centralized error handler converting Mongoose `CastError` (400), `ValidationError` (400), MongoDB duplicate key code `11000` (409), CORS errors (403), and unhandled exceptions (500).

---

## Media Upload Architecture

All media uploads are buffered in memory via Multer and streamed to Cloudinary using sequential naming and request-level memoization. Complete hierarchy, rules, and diagrams are documented in [`cloudinary.md`](../cloudinary.md).

---

## Verification Commands

```bash
# Typecheck TypeScript source
npx tsc --noEmit

# Compile to dist/ with path alias resolution
npm run build

# Run all 10 test suites (161 tests)
npm test

# Run tests with code coverage analysis
npm run test:coverage
```
