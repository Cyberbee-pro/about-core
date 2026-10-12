# about-core Working Structure

## Repository Overview
`about-core` is a complete Express + TypeScript API backend for a portfolio site with MongoDB/Mongoose, Cloudinary media uploads, and full integration test coverage (85 tests passing, verified 2026-10-10).

## Directory Structure

```
.
├── .agents/                    # Agent-side working documents
│   ├── working.md              # This file — repo working structure
│   ├── API_HANDOFF.md          # Complete API specification (authoritative, no changes needed)
│   ├── architecture-spec.md    # Architecture specification
│   └── context.md              # Context document
├── .env                        # Environment variables (local dev)
├── .env.example                # Environment variable template
├── package.json                # Dependencies and scripts
├── package-lock.json           # Lockfile
├── tsconfig.json               # TypeScript strict configuration
├── jest.config.ts              # Jest test configuration
├── vercel.json                 # Vercel deployment config
├── api/                        # Vercel serverless entry point
│   └── index.ts                # Exports Express app
├── tests/                      # Jest integration test suite (85 tests)
│   ├── api.test.ts             # 85 integration tests covering API + middleware
│   ├── models.test.ts          # Mongoose schema validation tests
│   ├── db.test.ts              # Database connection config tests
│   └── uploadNaming.test.ts    # Cloudinary sequential naming tests
├── src/                        # Source code
│   ├── server.ts               # Main entry point — mounts routes, middleware, health checks
│   ├── models/                  # Mongoose schemas & models
│   │   ├── Project.ts          # Core project document (title, slug, category, description, image, status, tags, versions, 3D model, contributors, socialLinks)
│   │   ├── SiteConfig.ts       # Site-wide config (resumeDriveUrl, statusMessage, bioSummary)
│   │   ├── Skill.ts            # Skill model (name, logoUrl, featured, weight)
│   │   ├── LogEntry.ts         # Request log entry (timestamp, level, method, endpoint, statusCode, ip, message, metadata, stack)
│   │   ├── Experience.ts       # Experience organization (organization, tag, type, iconUrl, positions)
│   │   ├── Certificate.ts      # Certificate model
│   │   ├── Achievement.ts      # Achievement model
│   │   └── index.ts            # Barrel export of all models
│   ├── routes/                 # Express route definitions
│   │   ├── projectRoutes.ts    # CRUD + versions for projects (public + admin protected)
│   │   ├── configRoutes.ts     # Site config GET/PUT (public read, admin write)
│   │   └── logRoutes.ts        # Admin request logs with pagination/filtering
│   ├── controllers/            # Route controllers (business logic)
│   │   ├── projectController.ts # Project CRUD, version creation
│   │   ├── configController.ts  # Site config get/update
│   │   └── logController.ts     # Admin logs query with date/month/year/level/pagination filters
│   ├── middlewares/            # Express middleware (order-dependent)
│   │   ├── authMiddleware.ts   # ADMIN_SECRET Bearer / x-admin-token auth (401 on fail, 500 if not configured)
│   │   ├── dbLoggerMiddleware.ts # Intercepts request finish → creates LogEntry in MongoDB (never disrupts response)
│   │   ├── errorMiddleware.ts  # Centralized error handler: 404, Mongoose duplicate key (409), validation (400), cast (400)
│   │   └── uploadMiddleware.ts # Multer memory storage + Cloudinary processing for image/video/model uploads
│   ├── config/                 # Cloudinary & DB configuration
│   │   ├── db.ts               # MongoDB connection with caching (MONGO_URI required, dbName: about_core)
│   │   └── cloudinary.ts       # Cloudinary config (cloud_name, api_key, api_secret, secure: true)
│   └── types/                  # Type declarations
│       └── express.d.ts        # Custom Express type extensions
```

## API Endpoints (from API_HANDOFF.md — reference only)

### Public Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /health | Liveness: `{ status, uptime, timestamp }` |
| GET | /api/v1/health | Service health + version metadata: `{ status, service, version, timestamp }` |
| GET | /api/v1/projects | List visible projects; accepts `category`, `featured`, `tag` query filters |
| GET | /api/v1/projects/categories | Distinct categories from visible projects |
| GET | /api/v1/projects/:slug | Fetch one project by slug (invisible → 404 for unauthenticated) |
| GET | /api/v1/config | Get site-wide config (creates default on first read) |

### Protected (Admin) Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | /api/v1/projects | Create project (multipart, media upload) |
| PUT | /api/v1/projects/:id | Update project by MongoDB ObjectId |
| DELETE | /api/v1/projects/:id | Delete project by ObjectId (does NOT delete Cloudinary assets) |
| POST | /api/v1/projects/:slug/versions | Append version to project by slug |
| PUT | /api/v1/config | Update site config (upsert if no record) |
| GET | /api/v1/admin/logs | Browse persisted request logs with date/level filters and pagination |

### Authentication
- All protected routes use static secret `ADMIN_SECRET`
- `Authorization: Bearer <ADMIN_SECRET>` or `x-admin-token: <ADMIN_SECRET>`
- Missing/invalid → 401; no `ADMIN_SECRET` → 500

### Media Uploads
- Multipart fields: `image`, `videoDemo`, `threeDModel`
- 100 MB per file limit, MIME/extension validation
- Uploaded to Cloudinary: image, video, or raw resource types
- Folders: `portfolio/projects/<slug>/images`, `videos`, `models`
- Version uploads include sanitized version-tag directory

### Error Codes
- 400: missing required input, invalid project ID, Mongoose validation/cast failure
- 401: missing or invalid admin secret
- 404: unknown route/resource, missing project, public attempt to read invisible project
- 409: duplicate key (commonly duplicate slug)
- 500: unexpected/server configuration errors

## Environment Variables

| Variable | Required? | Default/Description |
|---|---|---|
| `PORT` | No | 5000 |
| `NODE_ENV` | No | development/production/test |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `CLIENT_ORIGIN` | No | Comma-separated CORS origins |
| `ADMIN_SECRET` | Yes (protected routes) | Static secret for admin auth |
| `CLOUDINARY_CLOUD_NAME` | Yes (media uploads) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes (media uploads) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes (media uploads) | Cloudinary API secret |

## Test Suite

- **85 integration tests** passing (verified 2026-10-10)
- Test files: `tests/api.test.ts`, `tests/models.test.ts`, `tests/db.test.ts`, `tests/uploadNaming.test.ts`
- Test framework: Jest with `supertest` for HTTP integration
- MongoDB: `mongodb-memory-server` for in-memory testing during CI
- All models validated via `document.validate()` and `document.validateSync()` (no live DB required)
- Mocked dependencies: Mongoose models, db config, Cloudinary

## Key Model Schemas

### Project (src/models/Project.ts)
- `title`, `slug`, `category`, `description` — required
- `featured` boolean (default false)
- `tags` string array
- `status` enum: `invisible` | `planning` | `work_in_progress` | `delay_hold` | `active` (default `planning`)
- `image` required URL
- `videoDemo`, `threeDModel` (fileUrl, initialRotation, enableExplodedView)
- `contributors`, `socialLinks`, `deployedLink`, `githubLink`
- `versions` nested array with versionTag, releaseDate, changelog, isLatest
- Mongoose timestamps `createdAt`, `updatedAt`

### SiteConfig (src/models/SiteConfig.ts)
- `resumeDriveUrl` required string
- `statusMessage` default: `"Building systems..."`
- `bioSummary` required string
- Mongoose timestamps

### Skill (src/models/Skill.ts)
- `name` required, unique, trimmed
- `logoUrl` required string
- `featured` boolean (default false)
- `weight` number (default 0)

### LogEntry (src/models/LogEntry.ts)
- `level` enum: `INFO` | `WARN` | `ERROR`
- `method`, `endpoint`, `statusCode`, `ip`, `message` required
- `metadata` optional Record, `stack` optional

### Experience (src/models/Experience.ts)
- `organization`, `tag`, `type` required
- `iconUrl` required (Cloudinary path)
- `positions` nested array with positionTag, title, description, mediaUrls, certificateUrls, isCurrent

## Key Middlewares (execution order in server.ts)

1. `cors` — origin from `CLIENT_ORIGIN` or `*`
2. `express.json()` + `express.urlencoded({ extended: true })`
3. `dbLoggerMiddleware` — intercepts `response.finish` → creates `LogEntry` in MongoDB
4. Health checks (`/health`, `/api/v1/health`)
5. Feature routes: `/api/v1/projects`, `/api/v1/config`, `/api/v1/admin/logs`
6. `notFoundMiddleware` — 404 JSON response
7. `errorMiddleware` — centralized error handling (404/409/400/500)

## Key Routes

### projectRoutes.ts
- Public: `GET /`, `GET /categories`, `GET /:slug`
- Admin-protected (authMiddleware): `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:slug/versions`

### configRoutes.ts
- Public: `GET /`
- Admin-protected: `PUT /`

### logRoutes.ts
- Admin-protected: `GET /`

## Verification Commands

```bash
# Confirm API_HANDOFF.md is intact (read-only check)
read .agents/API_HANDOFF.md | head -1

# Confirm working.md has content
read .agents/working.md | wc -l

# Run test suite to verify no regressions
cd /data/programing/My sites and stuff/Portfolio/about-core && npm test
# Expected: All 85 tests pass
```