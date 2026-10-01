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
| Health | `GET /health`, `GET /api/v1/health` | Liveness/service metadata. |
| Projects | `GET /api/v1/projects`, `GET /categories`, `GET /:slug` | Public reads exclude `invisible` projects. List filtering supports `category`, `featured`, and `tag`. |
| Project admin | `POST /api/v1/projects`, `PUT /:id`, `DELETE /:id`, `POST /:id/versions` | Protected by `ADMIN_SECRET`; create/update support multipart media. |
| Site config | `GET /api/v1/config`, `PUT /api/v1/config` | Read creates a default config document if none exists; update is protected. |
| Admin logs | `GET /api/v1/admin/logs` | Protected; filters by date/month/year/level and supports pagination. |

Protected requests accept either `Authorization: Bearer <ADMIN_SECRET>` or
`x-admin-token: <ADMIN_SECRET>`.

## Data and Media Flow

- `Project` holds normalized category and tags, visibility/status, links,
  contributors, optional media, 3D-model settings, and embedded version
  history. Valid statuses are `invisible`, `planning`, `work_in_progress`,
  `delay_hold`, and `active`.
- `SiteConfig` stores the resume URL, status message, and bio summary.
- `LogEntry` stores every completed request in MongoDB. Statuses map to
  `INFO`, `WARN` (4xx), or `ERROR` (5xx), with timing and optional error data.
- Media is accepted in memory via Multer fields `image`, `videoDemo`, and
  `threeDModel`, then streamed to Cloudinary as image, video, and raw assets.
- Upload folders are `portfolio/projects/<slug>/{images,videos,models}`;
  profile fallback folders are `portfolio/profile/<type>`.
- Upload public IDs are sequential (`<slug>_1`, `<slug>_2`, ...). Cloudinary
  Search results are cached per request; if Search fails, timestamp-based IDs
  are used as a safe fallback.

## Project Layout

- `src/config/`: MongoDB connection reuse and Cloudinary configuration.
- `src/models/`: `Project`, `SiteConfig`, and `LogEntry` schemas.
- `src/controllers/`: request validation and business logic.
- `src/routes/`: public and protected route wiring.
- `src/middlewares/`: authentication, database logging, errors, and uploads.
- `tests/`: Jest/Supertest tests with mocked Mongoose and Cloudinary services.

## Engineering Constraints

- TypeScript is strict; do not introduce `any`.
- Route/controller errors must reach the centralized error middleware.
- Keep request logging in `dbLoggerMiddleware`/`LogEntry`; avoid `console.log`.
- Do not write runtime files; use MongoDB and Cloudinary for persistence.
- Preserve Mongoose validation and lowercase/trim normalization for categories
  and slugs.

## Commands and Configuration

- `npm run dev` — start the TypeScript development server.
- `npm run build` — type-check and compile to `dist/`.
- `npm test` — run Jest serially.
- `npm run test:coverage` — collect coverage.

Required environment variables are documented in `.env.example`:
`MONGO_URI`, `ADMIN_SECRET`, `CLIENT_ORIGIN`, and the three Cloudinary
credentials. `PORT` defaults to `5000`.

## Current Work State

The MVP API, schemas, middleware, and integration tests are implemented. The
active uncommitted work is refining Cloudinary sequential public-ID naming and
its coverage in `tests/uploadNaming.test.ts` and `tests/api.test.ts`.
