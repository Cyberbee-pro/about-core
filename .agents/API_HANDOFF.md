# about-core API and frontend handoff

This document is for developers building or maintaining the portfolio's public viewer and admin frontends against `about-core`. It describes the API implemented in this repository. The repository contains the backend only; frontend routes, components, and deployment configuration live elsewhere.

## What this service does

`about-core` is an Express + strict TypeScript API backed by MongoDB/Mongoose. It supplies project content and site configuration to the public portfolio and Android client, accepts protected CMS changes from the admin UI, stores uploaded media in Cloudinary, and records completed HTTP requests in MongoDB. Vercel's `api/index.ts` exports the Express app; local development starts through `src/server.ts`.

The main flow is:

1. CORS, JSON/form parsers, and request logging middleware run for every request.
2. Health checks or `/api/v1` routes handle the request.
3. Admin mutations pass `authMiddleware`; uploads additionally pass Multer and Cloudinary processing.
4. Controllers read/write MongoDB and return JSON. Errors flow through centralized 404/error handlers.
5. On response finish, logging middleware attempts to save request metadata and status in `LogEntry`. Logging failures do not replace the response.

## Base URL and conventions

Use the deployed API origin configured for the frontend, followed by `/api/v1`. Local default is `http://localhost:5000`.

Successful resource responses generally use `{ "success": true, "data": ... }`; list responses also include `count`. Failures use `{ "success": false, "message": "..." }`, with validation errors optionally in `errors`. Dates serialize as ISO strings. Project IDs are MongoDB ObjectIds and project slugs are stable URL-safe strings.

Public reads are intended for viewer clients. Admin reads/mutations should be called by the admin app with the admin credential. Do not embed `ADMIN_SECRET` in a publicly delivered viewer bundle.

## Endpoint reference

### Health

| Method and path | Access | Purpose / response |
| --- | --- | --- |
| `GET /health` | Public | Liveness: `{ status, uptime, timestamp }`. |
| `GET /api/v1/health` | Public | Service health and version metadata: `{ status, service, version, timestamp }`. |

### Projects

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/projects` | Public | List visible projects; accepts `category`, `featured`, and `tag` query filters. |
| `GET /api/v1/projects/categories` | Public | Distinct categories from visible projects. Register this literal path before slug matching in clients. |
| `GET /api/v1/projects/:slug` | Public, with admin-auth bypass for invisible items | Fetch one project by slug. Invisible projects return 404 to unauthenticated callers. |
| `POST /api/v1/projects` | Admin | Create a project. JSON or multipart form; multipart can upload media. |
| `PUT /api/v1/projects/:id` | Admin | Update supplied project fields by MongoDB ObjectId. Omitted fields remain unchanged. |
| `DELETE /api/v1/projects/:id` | Admin | Delete by MongoDB ObjectId. This does not delete Cloudinary assets. |
| `POST /api/v1/projects/:slug/versions` | Admin | Append a version to a project found by slug. Multipart upload fields are accepted. |

#### List and detail behavior

`GET /projects` excludes records whose status is `invisible`, sorts featured first and then by `startDate` descending, and returns:

```json
{ "success": true, "count": 1, "data": [{ "_id": "...", "title": "...", "slug": "..." }] }
```

Filters:

- `category=<value>`: lowercased and trimmed exact category match.
- `featured=true|false`: when present, matches the boolean interpretation (`true` only matches the string `true`).
- `tag=<value>`: lowercased and trimmed tag match.

There is no pagination on the project list currently. Categories returns `{ success, count, data: string[] }`, also omitting invisible projects. Detail returns `{ success, data: project }`. A missing slug, including an invisible project for a public caller, returns 404. The detail route itself does not require auth; when a valid admin token is supplied the middleware marks the request so an invisible project can be fetched.

#### Create/update project fields

The `Project` document includes:

- `title` (required string), `slug` (required unique string; create derives it from title when omitted), `category` (required, lowercased/trimmed), `description` (required string), `image` (required URL or uploaded image URL).
- `featured` boolean (default false), `tags` string array, `startDate` (defaults to now on create), optional `endDate`.
- `status`: `invisible`, `planning`, `work_in_progress`, `delay_hold`, or `active` (default `planning`). All except `invisible` appear in public list/category results.
- `contributors`: `{ name, profilePicUrl, profileLink? }[]`.
- `socialLinks`: `{ platform, url }[]`.
- Optional `videoDemo`, `deployedLink`, `githubLink`.
- Optional `threeDModel`: `{ fileUrl, initialRotation: [number, number, number], enableExplodedView }`.
- `versions`: `{ versionTag, releaseDate, changelog: string[], image?, videoDemo?, demoUrl?, threeDFileUrl?, isLatest }[]`.
- Mongoose timestamps `createdAt` and `updatedAt`.

For JSON, send arrays/objects as JSON values. For multipart form data, send nested arrays/objects as JSON-encoded strings (e.g. `contributors`, `socialLinks`, `versions`, `threeDModel`). `tags` may be a JSON array string or comma-separated string. The create controller requires title, image, category, and description. On update, only recognized supplied fields are changed; send an empty string for `endDate` to clear it. Update takes the database `_id`, while detail and version creation use `slug`.

#### Version creation

Send `versionTag` (required; e.g. `v1.0.0`), and optional `releaseDate`, `changelog` array, `image`, `videoDemo`, `demoUrl`, `threeDFileUrl`, `isLatest`; `threeDModel` may alternatively contain `fileUrl`. If `isLatest` is true, existing versions are marked not latest before append. The route appends rather than replacing a version. A multipart model upload is processed into `threeDModel.fileUrl`; the controller uses that URL as `threeDFileUrl` if the explicit field was not supplied. Response is `201 { success, message, data: updatedProject }`.

### Skills

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/skills` | Public | List all skills, sorted by `{ weight: 1, name: 1 }`. Returns `{ success, count, data: Skill[] }`. |
| `GET /api/v1/skills/:id` | Public | Fetch one skill by MongoDB ObjectId. Missing ID returns 404. |
| `POST /api/v1/skills` | Admin | Create a skill. Duplicate name returns 409 Conflict. Returns `201 { success, data: Skill }`. |
| `PUT /api/v1/skills/:id` | Admin | Update skill by MongoDB ObjectId. Duplicate name check excludes current ID. Returns 404 if missing, 200 on success. |
| `DELETE /api/v1/skills/:id` | Admin | Delete skill by MongoDB ObjectId. Returns 404 if missing, 200 on success. |

Fields:
- `name` (required unique string, trimmed).
- `logoUrl` (required string; Cloudinary path e.g. `portfolio/skills/{name}/{name}.jpg`).
- `featured` (boolean, default `false`).
- `weight` (number, default `0`).

### Certificates

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/certificates` | Public | List all certificates, sorted by `{ weight: 1, title: 1 }`. Returns `{ success, count, data: Certificate[] }`. |
| `GET /api/v1/certificates/:id` | Public | Fetch one certificate by MongoDB ObjectId. Missing ID returns 404. |
| `POST /api/v1/certificates` | Admin | Create a certificate. Duplicate title returns 409 Conflict. Returns `201 { success, data: Certificate }`. |
| `PUT /api/v1/certificates/:id` | Admin | Update certificate by MongoDB ObjectId. Returns 404 if missing, 409 if duplicate title, 200 on success. |
| `DELETE /api/v1/certificates/:id` | Admin | Delete certificate by MongoDB ObjectId. Returns 404 if missing, 200 on success. |

Fields:
- `title` (required string, trimmed).
- `description` (required string).
- `link` (optional string URL).
- `mediaUrl` (required string; Cloudinary path e.g. `portfolio/certificate/{org_title_year}.jpg`).
- `organization` (required string, trimmed).
- `weight` (number, default `0`).

### Achievements

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/achievements` | Public | List all achievements, sorted by `{ weight: 1, title: 1 }`. Returns `{ success, count, data: Achievement[] }`. |
| `GET /api/v1/achievements/:id` | Public | Fetch one achievement by MongoDB ObjectId. Missing ID returns 404. |
| `POST /api/v1/achievements` | Admin | Create an achievement. Duplicate title returns 409 Conflict. Returns `201 { success, data: Achievement }`. |
| `PUT /api/v1/achievements/:id` | Admin | Update achievement by MongoDB ObjectId. Returns 404 if missing, 409 if duplicate title, 200 on success. |
| `DELETE /api/v1/achievements/:id` | Admin | Delete achievement by MongoDB ObjectId. Returns 404 if missing, 200 on success. |

Fields:
- `title` (required string, trimmed).
- `date` (required string, e.g. `"Month Year"`).
- `detail` (required string).
- `weight` (number, default `0`).

### Experiences

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/experiences` | Public | List all experience organizations, sorted by `{ weight: 1, organization: 1 }`. Returns `{ success, count, data: Experience[] }`. |
| `GET /api/v1/experiences/:id` | Public | Fetch one experience by MongoDB ObjectId. Missing ID returns 404. |
| `POST /api/v1/experiences` | Admin | Create an experience document. Duplicate organization returns 409 Conflict. Returns `201 { success, data: Experience }`. |
| `POST /api/v1/experiences/:organization/positions` | Admin | Append a single position/promotion to an existing experience without overwriting existing history. Looks up experience via case-insensitive organization regex. Supports multipart uploads for `mediaUrls` and `certificateUrls`. Returns `200 { success, message, data: Experience }`. |
| `PUT /api/v1/experiences/:id` | Admin | Update experience by MongoDB ObjectId. Returns 404 if missing, 409 if duplicate organization, 200 on success. |
| `DELETE /api/v1/experiences/:id` | Admin | Delete experience by MongoDB ObjectId. Returns 404 if missing, 200 on success. |

Fields:
- `organization` (required string, trimmed).
- `tag` (required enum: `"focus"` | `"extracurricular"`).
- `type` (required enum: `"internship"` | `"contract"` | `"freelance"` | `"full_time"` | `"part_time"` | `"club"` | `"volunteering"`).
- `iconUrl` (required string).
- `skills` (ObjectId array, ref to `Skill`).
- `weight` (number, default `0`).
- `positions` (array of position subdocuments):
  - `positionTag` (required string, e.g. `"Initial Hire"`, `"Senior Role Promotion"`).
  - `title` (required string).
  - `description` (required string).
  - `startDate` (required Date/ISO string).
  - `endDate` (optional Date/ISO string).
  - `mediaUrls` (optional string array).
  - `certificateUrls` (optional string array).
  - `isCurrent` (boolean, default `false`).

#### Appending Positions (`POST /api/v1/experiences/:organization/positions`)
- Path parameter: `:organization` (case-insensitive string matching the unique organization name, e.g. `/experiences/gcsrm/positions` or `/experiences/Tech%20Corp/positions`).
- Accepts `req.body.position` formatted as JSON object, JSON-stringified object, or directly at top level of `req.body`.
- Accepts multipart files on fields `mediaUrls` and `certificateUrls`. These are streamed to Cloudinary folders:
  - Media: `portfolio/experiences/{tag}/{organization}/media/experience_media_{num}`
  - Certificates: `portfolio/experiences/{tag}/{organization}/certificates/experience_certificate_{num}`
- **Active Role Single-Truth**: When `isCurrent` is `true` on the new position, all existing positions within the experience document are automatically updated to `isCurrent: false`.
- Appends the new position using `$push` without overwriting earlier career positions.
- Missing organization returns `404 Not Found` with `{ success: false, message: "Experience not found for organization: <organization>" }`. Unauthenticated access returns `401 Unauthorized`.

### Site configuration

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/config` | Public | Get site-wide resume link, status message, and bio summary. Creates a default record on first read if none exists. |
| `PUT /api/v1/config` | Admin | Update any supplied config fields. |

Fields: `resumeDriveUrl`, `statusMessage`, and `bioSummary`, all strings. GET returns `{ success: true, data: config }`. PUT returns `{ success, message, data }`; it upserts if there is no record.

### Admin request logs

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/v1/admin/logs` | Admin | Browse persisted request logs with date/level filters and pagination. |

Query parameters:

- `date=YYYY-MM-DD`, or `month=YYYY-MM`, or `year=YYYY` (date takes precedence over month, month over year).
- `level=INFO|WARN|ERROR`.
- `page` defaults to `1`; `limit` defaults to `50`, is clamped to `1..500`.

Returns `{ success, count, total, page, totalPages, data: LogEntry[] }`, newest first. Logs have timestamp, level, method, endpoint, statusCode, ip, message, optional metadata and stack. Levels are INFO for 2xx/3xx, WARN for 4xx, ERROR for 5xx. Every request is eligible for logging, including health and admin requests.

## Authentication

All protected routes use the same static secret configured as `ADMIN_SECRET`. Provide exactly one of:

```http
Authorization: Bearer <ADMIN_SECRET>
```

or

```http
x-admin-token: <ADMIN_SECRET>
```

Missing/incorrect credentials return 401. If the server has no `ADMIN_SECRET`, protected routes return 500. The API has no login/session/OAuth exchange endpoint: the admin frontend's authentication mechanism must obtain/store this secret outside the public viewer client and attach it to protected calls. Never expose it in client-side environment variables that are bundled into public JavaScript.

## Media uploads

Create, update, and version routes accept multipart fields named `image`, `videoDemo`, and `threeDModel`, one file per field. The server buffers each upload in memory (100 MB per file limit), validates media MIME/extensions, then uploads to Cloudinary as image, video, or raw respectively. The returned secure Cloudinary URL is written into request data before the controller saves it.

For project routes, folders follow `portfolio/projects/<slug>/images`, `videos`, or `models`; version uploads include a sanitized version-tag directory. Asset public IDs are sequential per folder when Cloudinary search succeeds and timestamp-based if search fails. Do not assume a replaced/deleted asset is automatically removed from Cloudinary. For an admin edit that keeps existing media, omit that file field and preserve its URL in the data if sending a full representation is needed.

The upload middleware also has a profile-folder fallback for `/profile` paths, but this repository does not currently mount profile routes. Do not treat that as a supported endpoint.

## Frontend integration guidance

### Public viewer site

1. On page/app startup, request `GET /api/v1/config` for global bio/status/resume content.
2. Request `GET /api/v1/projects` for cards and `GET /api/v1/projects/categories` for category filters. Add `category`, `featured`, or `tag` query parameters as needed.
3. Request `GET /api/v1/projects/:slug` for a detail page, including media URLs, links, contributors, 3D model options, and version history.
4. Treat `invisible` as unavailable; it is excluded from list/category APIs and public detail responds 404.
5. Use `threeDModel.fileUrl`, `initialRotation`, and `enableExplodedView` to configure the 3D viewer. The backend stores these values; rendering is client responsibility.

### Admin site

1. Use the same public read APIs for project/config views; include auth on detail reads when inspecting invisible projects.
2. Add the admin header to create/update/delete, version, config update, and log requests.
3. Use `_id` for project update/delete and `slug` for detail/version routes. Refresh list/detail data after mutations from the returned `data`.
4. Use multipart requests when uploading files; do not manually set the multipart `Content-Type` boundary in browser `fetch` calls. Send JSON when no file is uploaded.
5. Use the logs endpoint to build the request log screen; paginate using returned page metadata and avoid requesting limits above 500.

Example browser request:

```ts
const response = await fetch(`${API_ORIGIN}/api/v1/projects?category=web`, {
  headers: { Accept: "application/json" },
});
if (!response.ok) throw new Error(`API request failed: ${response.status}`);
const result = await response.json();
```

For an admin request, add `Authorization: Bearer ${adminSecret}`. For `FormData`, append scalar values and JSON-stringify nested fields; append files under the exact field names above.

## Errors and operational notes

- `400`: missing required input, invalid project ID, or Mongoose validation/cast failure.
- `401`: missing or invalid admin secret.
- `404`: unknown route/resource, missing project, or public attempt to read an invisible project.
- `409`: duplicate key (e.g. duplicate slug, skill name, cert/achievement title, or experience organization).
- `500`: unexpected/server configuration errors.

All responses are JSON. Frontends should check `response.ok` and parse the error `message`; do not assume all failures share the same exact message. CORS origins are controlled by comma-separated `CLIENT_ORIGIN`; unset currently permits `*`. MongoDB (`MONGO_URI`) is required. Cloudinary credentials are required for media uploads. Local development uses `npm install`, configure environment variables, then `npm run dev`; `npm run build` compiles TypeScript.

## Data model / ownership summary

- MongoDB is authoritative for projects, skills, certificates, achievements, experiences, site config, and API logs.
- Cloudinary stores media bytes; MongoDB stores secure URLs and presentation metadata.
- `Project.versions` is embedded in its project; there is no independent version endpoint for listing/editing.
- There is no user/role collection or OAuth callback route implemented here despite historical references to an OAuth gatekeeper.
- The backend serves both the web portfolio and Kotlin app; client-specific presentation and caching belong to those clients.

## Source map for follow-up work

- App and route mounting: `src/server.ts`
- Route definitions: `src/routes/`
- Request/business behavior: `src/controllers/`
- Schemas: `src/models/`
- Authentication, upload, logging, errors: `src/middlewares/`
- Mongo and Cloudinary setup: `src/config/`
- API integration coverage: `tests/`
