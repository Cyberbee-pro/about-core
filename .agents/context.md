# about-core: Current Repository Context

## Purpose
`about-core` is the serverless-ready, headless CMS API for the shibraj.dev
portfolio. It serves two clients:

- the Next.js web portfolio;
- the native Kotlin Android client.

The API is built with Node.js, Express 4, strict TypeScript, MongoDB/Mongoose,
Multer, and Cloudinary. It is designed for Vercel-compatible execution: no
application state or request logs are written to the local filesystem.

## Implemented API

`src/server.ts` configures CORS, JSON and URL-encoded parsers, MongoDB request
logging, health checks, routes, and centralized error handling.

| Scope | Routes | Notes |
| --- | --- | --- |
| Health | `GET /health`, `GET /api/v1/health` | Liveness/service metadata (`dbStatus`, `uptime`, `memoryUsageMB`). |
| Projects | `GET /api/v1/projects`, `GET /categories`, `GET /:slug` | Public reads exclude `invisible` projects. List filtering supports `category`, `featured`, and `tag`. |
| Project admin | `POST /api/v1/projects`, `PUT /:id`, `DELETE /:id`, `POST /:slug/versions` | Protected by `ADMIN_SECRET`; create/update support multipart media. |
| Skills | `GET /api/v1/skills`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | Public reads sorted by `{ weight: 1, name: 1 }`; mutations protected by `ADMIN_SECRET` with 409 duplicate name validation. |
| Certificates | `GET /api/v1/certificates`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | Public reads sorted by `{ weight: 1, title: 1 }`; mutations protected with 409 duplicate title validation. |
| Achievements | `GET /api/v1/achievements`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | Public reads sorted by `{ weight: 1, title: 1 }`; mutations protected with 409 duplicate title validation. |
| Experiences | `GET /api/v1/experiences`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` | Public reads sorted by `{ weight: 1, organization: 1 }`; mutations protected with 409 duplicate organization validation. |
| Site config | `GET /api/v1/config`, `PUT /api/v1/config` | Read creates a default config document if none exists; update is protected. |
| Admin logs | `GET /api/v1/admin/logs` | Protected; filters by date/month/year/level and supports pagination. |

Protected requests accept either `Authorization: Bearer <ADMIN_SECRET>` or
`x-admin-token: <ADMIN_SECRET>`.

## Data and Media Flow

- `Project` holds normalized category and tags, visibility/status, links,
  contributors, optional media, 3D-model settings, and embedded version
  history. Valid statuses are `invisible`, `planning`, `work_in_progress`,
  `delay_hold`, and `active`. References `Skill` via ObjectId array.
- `Skill` stores skill `name` (unique, trimmed), `logoUrl`, `featured` (boolean),
  and `weight` (number).
- `Certificate` stores `title` (trimmed), `description`, optional `link`,
  `mediaUrl` (Cloudinary path), `organization`, and `weight`.
- `Achievement` stores `title` (trimmed), `date` (e.g. "Month Year"), `detail`,
  and `weight`.
- `Experience` stores `organization` (trimmed), `tag` (`focus` | `extracurricular`),
  `type` (`internship` | `contract` | `freelance` | `full_time` | `part_time` | `club` | `volunteering`),
  `iconUrl`, `skills` (refs to `Skill`), `weight`, and nested `positions` array
  (`positionTag`, `title`, `description`, `startDate`, optional `endDate`, `mediaUrls`,
  `certificateUrls`, `isCurrent`). Supports `POST /api/v1/experiences/:organization/positions`
  to append new promotion/position records with multipart `mediaUrls` and `certificateUrls` streaming,
  looking up the experience by case-insensitive organization name and automatically toggling
  older positions to `isCurrent: false` when the new position is active.
- `SiteConfig` stores the resume URL, status message, and bio summary.
- `LogEntry` stores every completed request in MongoDB. Statuses map to
  `INFO`, `WARN` (4xx), or `ERROR` (5xx), with timing and optional error data.
- Media is accepted in memory via Multer fields `image`, `videoDemo`, `threeDModel`,
  `logoUrl`, `iconUrl`, `mediaUrls`, and `certificateUrls`, then streamed to Cloudinary
  as image, video, and raw assets.
- Upload folders:
  - Projects: `portfolio/projects/<slug>/{images,videos,models}`; profile fallback: `portfolio/profile/<type>`.
  - Skills: `portfolio/skills/{skill_name}/{skill_name}`.
  - Certificates: `portfolio/certificate/{org_title_year}`.
  - Experiences: `portfolio/experiences/{tag}/{organization}/{icons,media,certificates}`.
- Upload public IDs are sequential (`<slug>_1`, `<slug>_2`, ...). Cloudinary
  Search results are cached per request; if Search fails, timestamp-based IDs
  are used as a safe fallback.

## Project Layout

- `src/config/`: MongoDB connection reuse (`db.ts`) and Cloudinary configuration (`cloudinary.ts`).
- `src/models/`: `Project`, `Skill`, `Certificate`, `Achievement`, `Experience`, `SiteConfig`, and `LogEntry` schemas.
- `src/controllers/`: request validation and business logic (`projectController`, `skillController`, `certificateController`, `achievementController`, `experienceController`, `configController`, `logController`).
- `src/routes/`: public and protected route wiring for all feature resources.
- `src/middlewares/`: authentication (`authMiddleware`), database logging (`dbLoggerMiddleware`), errors (`errorMiddleware`), and uploads (`uploadMiddleware`).
- `tests/`: 8 Jest/Supertest suites covering all models, middleware, connection pooling, upload naming, and CRUD integration endpoints.

## Engineering Constraints

- TypeScript is strict; do not introduce `any`.
- Path aliases: `@/*` maps to `src/*` across both `src/` and `tests/`. Do not use relative imports (`../`, `./`) across modules.
- Route/controller errors must reach the centralized error middleware.
- Keep request logging in `dbLoggerMiddleware`/`LogEntry`; avoid `console.log`.
- Do not write runtime files; use MongoDB and Cloudinary for persistence.
- Preserve Mongoose validation and lowercase/trim normalization for categories,
  slugs, titles, and organizations.

## Commands and Configuration

- `npm run dev` — start the TypeScript development server.
- `npm run build` — type-check and compile to `dist/`.
- `npm test` — run Jest serially. **All 8 test suites and 116 tests pass**.
- `npm run test:coverage` — collect coverage.

Required environment variables are documented in `.env.example`:
`MONGO_URI`, `ADMIN_SECRET`, `CLIENT_ORIGIN`, and the three Cloudinary
credentials. `PORT` defaults to `5000`.

## Current Work State

The complete CMS API including Projects, Skills, Certificates, Achievements,
Experiences (with single position append `POST /api/v1/experiences/:organization/positions`),
Site Config, Request Logging, and Media Uploads is implemented, typed with strict
TypeScript, fully refactored with `@/*` path aliases, and verified. All 8 test suites
(116 tests) pass. Evidence reports and TDD artifacts are preserved in `.agents/tdd/`.