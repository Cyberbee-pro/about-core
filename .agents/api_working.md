# API & Database Interaction Guide (`api_working.md`)

This document provides a comprehensive technical reference for how every API endpoint in **about-core** interacts with MongoDB via Mongoose. It details database models, schema relationships, query filters, projections, sort orders, atomic mutations, pre-request middleware queries, and background database logging.

---

## Table of Contents

1. [Architecture & Database Lifecycle](#1-architecture--database-lifecycle)
2. [Data Models & Schema Architecture](#2-data-models--schema-architecture)
3. [Global Interceptors & DB Hooks](#3-global-interceptors--db-hooks)
4. [Endpoint Database Interactions](#4-endpoint-database-interactions)
   - [4.1 System & Health](#41-system--health)
   - [4.2 Projects API (`/api/v1/projects`)](#42-projects-api-apiv1projects)
   - [4.3 Skills API (`/api/v1/skills`)](#43-skills-api-apiv1skills)
   - [4.4 Certificates API (`/api/v1/certificates`)](#44-certificates-api-apiv1certificates)
   - [4.5 Achievements API (`/api/v1/achievements`)](#45-achievements-api-apiv1achievements)
   - [4.6 Experiences API (`/api/v1/experiences`)](#46-experiences-api-apiv1experiences)
   - [4.7 Site Configuration API (`/api/v1/config`)](#47-site-configuration-api-apiv1config)
   - [4.8 Admin Logs API (`/api/v1/admin/logs`)](#48-admin-logs-api-apiv1adminlogs)
   - [4.9 Contributors API (`/api/v1/contributors`)](#49-contributors-api-apiv1contributors)
5. [Cloudinary & Database Consistency Safeguards](#5-cloudinary--database-consistency-safeguards)
6. [Summary Matrix](#6-summary-matrix)

---

## 1. Architecture & Database Lifecycle

- **Database Engine:** MongoDB Atlas
- **Object Data Modeling (ODM):** Mongoose (`v8.9.5`)
- **Database Name:** `about_core`
- **Serverless Optimization (`src/config/db.ts`):** Connection caching via `cachedConnection` and `isConnected` prevents connection pooling exhaustion across Vercel serverless function invocations:
  ```typescript
  if (isConnected && mongoose.connection.readyState === 1 && cachedConnection) {
    return cachedConnection;
  }
  ```
- **Error Normalization (`src/middlewares/errorMiddleware.ts`):** Mongoose errors are intercepted and translated into HTTP status codes:
  - `E11000` (Duplicate Key) $\rightarrow$ `409 Conflict`
  - `ValidationError` $\rightarrow$ `400 Bad Request` with structured error field map
  - `CastError` (Malformed `ObjectId`) $\rightarrow$ `400 Bad Request` (`"Invalid identifier format"`)

---

## 2. Data Models & Schema Architecture

The database contains **8 core collections**:

```
                       +-------------------+
                       |    SiteConfig     |
                       | (Singleton Doc)   |
                       +-------------------+
                                 |
                                 |
+-------------------+  skills[]  |  skills[]  +---------------------+
|      Project      | >----------+----------< |     Experience      |
|-------------------| (ObjectId)   (ObjectId) |---------------------|
| - slug (unique)   |                         | - organization      |
| - versions[]      |                         | - positions[]       |
+-------------------+                         +---------------------+
       ^       ^
       |       | contributors.contributor (ObjectId)
       +-------+-----------------------------+
                                             |
+-------------------+  +-------------------+ | +--------------------+
|       Skill       |  |    Certificate    | | |    Contributor     |
|-------------------|  |-------------------| | |--------------------|
| - name (unique)   |  | - title           | | | - name (unique)    |
| - type (enum)     |  | - organization    | | | - profilePicUrl    |
+-------------------+  +-------------------+ | | - profileLink      |
                                             | +--------------------+
+-------------------+  +-------------------+ |
|    Achievement    |  |     LogEntry      | |
|-------------------|  |-------------------| |
| - title           |  | - timestamp (idx) | |
| - date            |  | - level (enum)    | |
+-------------------+  +-------------------+ |
                                             |
                                             v
```

### 2.1 Collection Schemas & Indexes

| Collection | Schema File | Key Indexes & Constraints | Key Relations / Subdocuments |
| :--- | :--- | :--- | :--- |
| `projects` | `src/models/Project.ts` | `slug` (Unique, Lowercase)<br>`timestamps: true` | `skills`: `Types.ObjectId[]` referencing `Skill`<br>`contributors`: join subdocuments referencing `Contributor` (`{ contributor: ObjectId, role?: string }`, `_id: false`)<br>`versions`: subdocuments (with metadata fields, `contributors`, `socialLinks`, `gallery`)<br>`gallery`: subdocuments (`IGalleryImage[]`) |
| `contributors` | `src/models/Contributor.ts` | `name` (Unique, Trimmed, case-insensitive)<br>`timestamps: true` | Referenced by `Project.contributors` and `Version.contributors` |
| `skills` | `src/models/Skill.ts` | `name` (Unique, Trimmed)<br>`type` enum (`tool`, `language`, `framework`)<br>`timestamps: true` | Referenced by `Project` and `Experience` |
| `certificates` | `src/models/Certificate.ts` | `timestamps: true`<br>Case-insensitive title uniqueness enforced in controller | Self-contained |
| `achievements` | `src/models/Achievement.ts` | `timestamps: true`<br>Case-insensitive title uniqueness enforced in controller | Self-contained |
| `experiences` | `src/models/Experience.ts` | `tag` enum (`focus`, `extracurricular`)<br>`type` enum (`internship`, `contract`, `freelance`, `full_time`, `part_time`, `club`, `volunteering`)<br>`timestamps: true` | `skills`: `Types.ObjectId[]` referencing `Skill`<br>`positions`: subdocuments |
| `siteconfigs` | `src/models/SiteConfig.ts` | Singleton document model<br>`timestamps: true` | `pfpHistory`: subdocuments array (`IPfpItem[]`) |
| `logentries` | `src/models/LogEntry.ts` | `timestamp` (Indexed, Descending)<br>`level` enum (`INFO`, `WARN`, `ERROR`)<br>`timestamps: false` | Self-contained (writes raw request metadata and stack traces) |

### 2.2 Global URL Validation Rules

Every URL string field written to the database (on create or update, when provided and non-empty) is strictly validated via WHATWG `new URL` (`isValidHttpUrl` in `src/utils/stringUtils.ts`).
- **Protocols Enforced:** Must strictly use absolute `http:` or `https:` protocols.
- **Rejected Schemes & Formats:** Dangerous schemes (`javascript:`, `data:`, `vbscript:`, `file:`, `ftp:`), protocol-relative URLs (`//host`), relative paths, embedded whitespace, and control characters (`\x00-\x1f`, `\x7f`) return `400 Bad Request` naming the invalid field.
- **Audited & Validated Fields Across Collections:**
  - `Contributor`: `profilePicUrl`, `profileLink` (create & update)
  - `Project`: `image`, `videoDemo`, `deployedLink`, `githubLink`, `threeDModel.fileUrl`, `socialLinks[].url` (create & update)
  - `Version`: `image`, `videoDemo`, `demoUrl`, `threeDFileUrl`, `deployedLink`, `githubLink`, `socialLinks[].url` (`POST /:slug/versions` & `PUT /:slug/versions/:versionId`)
  - `Skill`: `logoUrl` (create & update)
  - `Certificate`: `mediaUrl`, `link` (create & update)
  - `Experience`: `iconUrl`, `positions[].mediaUrls`, `positions[].certificateUrls` (create, update, & `addExperiencePosition`)
  - `SiteConfig`: `pfpUrl`, `resumeUrl` (create & update)
  - `Gallery`: `galleryImage` URL strings on `PUT /gallery/:imageId`, and item URLs on `POST /gallery`
- **Clearing Semantics:** An empty string (`""`) continues to clear optional fields without triggering URL validation.
- **Upload Safety & Consistency:** Uploaded multipart files via Cloudinary middleware receive trusted `https://res.cloudinary.com/...` delivery URLs. If a multipart request includes an invalid URL field alongside uploaded files, all newly uploaded assets from that request are rolled back before returning `400 Bad Request`.

---

## 3. Global Interceptors & DB Hooks

### 3.1 Every Request: Automatic DB Audit Logging (`dbLoggerMiddleware`)
Every single HTTP request to the application (including 404s, CORS rejections, public health checks, and admin mutations) triggers an asynchronous write to MongoDB on the HTTP response `finish` event:
- **Target Collection:** `logentries`
- **Mongoose Call:** `LogEntry.create({...})`
- **Computed Fields:**
  - `level`: `"ERROR"` if `res.statusCode >= 500`, `"WARN"` if `res.statusCode >= 400`, else `"INFO"`.
  - `endpoint`: `req.originalUrl || req.url`
  - `ip`: Extracted from `x-forwarded-for`, `req.socket.remoteAddress`, or `req.ip`.
  - `metadata`: `{ durationMs, query: req.query, userAgent, ...res.locals.logMetadata }`
  - `stack`: `res.locals.errorStack` (if an unhandled error was trapped).
- **Failure Resilience:** The write is wrapped in a try/catch swallow block so logging failures never disrupt API responses or crash serverless lambdas.

### 3.2 Server Initialization: Schema Migration (`migrateSiteConfigResumeUrl`)
When the server boots in non-test mode (`src/server.ts`), it triggers an automated migration:
- **Target Collection:** `siteconfigs`
- **MongoDB Operation:**
  ```typescript
  SiteConfig.collection.updateMany(
    {
      $or: [{ resumeUrl: { $exists: false } }, { resumeUrl: null }, { resumeUrl: "" }],
      resumeDriveUrl: { $exists: true, $ne: "" },
    },
    [
      { $set: { resumeUrl: "$resumeDriveUrl" } },
      { $unset: "resumeDriveUrl" }
    ]
  )
  ```
- **Fallback:** If pipeline update fails, it falls back to a cursor-based scan (`cursor.hasNext()`) updating and unsetting documents individually.

### 3.3 Mongoose Document Pre-init Hook
On `SiteConfigSchema.pre("init")`, raw MongoDB documents missing `resumeUrl` copy `resumeDriveUrl` on document instantiation to ensure backward compatibility for legacy records.

### 3.4 Multipart Upload Middleware DB Query (`processExperienceUploads`)
When uploading media files (`iconUrl`, `mediaUrls`, `certificateUrls`) for experiences via `POST /api/v1/experiences/:organization/positions` or `PUT /api/v1/experiences/:id`, the upload middleware queries MongoDB before the controller executes:
- **Trigger:** If `req.body.organization` or `req.body.tag` is absent.
- **Query:**
  ```typescript
  Experience.findOne(
    rawParamOrg
      ? { organization: { $regex: new RegExp(`^${escapeRegex(rawParamOrg)}$`, "i") } }
      : { _id: req.params.id }
  )
  ```
- **Purpose:** Resolves the experience's category tag (`focus` vs `extracurricular`) and organization slug so Cloudinary assets are placed into the exact folder path: `portfolio/experiences/{tag}/{orgSlug}/{media|certificates|icons}`.

### 3.5 Multipart Upload Middleware DB Query (`processMediaUploads`) for Project Versions
When uploading media files (`image`, `videoDemo`, `threeDModel`) for project versions via `PUT /api/v1/projects/:slug/versions/:versionId`, the upload middleware queries MongoDB before the controller executes:
- **Trigger:** If `req.body.versionTag` is not provided in the request body.
- **Query:**
  ```typescript
  Project.findOne({ slug: rawSlug.toLowerCase().trim() })
  ```
- **Purpose:** Resolves the existing version's stored `versionTag` from the subdocument matching `req.params.versionId`. The tag is sanitized via `sanitizeVersionTag` (preserving dots for semver such as `v1.0.0`, replacing slashes and spaces with hyphens, neutralizing `..` path traversals, stripping boundary dots/hyphens, and truncating to 64 characters) and targets `portfolio/projects/{slug}/{safeVersionTag}/[images|videos|models]`. If the versionId is invalid (`400`) or the project/version is missing (`404`) or the sanitized tag is empty (`400`), the request halts with an error and never falls back to `misc`.

---

## 4. Endpoint Database Interactions

### 4.1 System & Health

#### `GET /health`
- **Scope:** Public
- **DB Interaction:** None directly. Only logged via `dbLoggerMiddleware` $\rightarrow$ `LogEntry.create()`.

#### `GET /api/v1/health`
- **Scope:** Public
- **DB Interaction:** Reads `mongoose.connection.readyState === 1` to report `"connected"` vs `"disconnected"`. No collection queries executed.

---

### 4.2 Projects API (`/api/v1/projects`)

#### `GET /api/v1/projects`
- **Scope:** Public
- **Target Model:** `Project`
- **DB Operation:** `Project.find(filter).sort({ featured: -1, startDate: -1 }).lean()`
- **Query Filter Logic:**
  - Default: `{ status: { $ne: "invisible" } }` (hides drafts/archived)
  - `?category=<category>` $\rightarrow$ `filter.category = category.toLowerCase().trim()`
  - `?featured=<true|false>` $\rightarrow$ `filter.featured = featured === "true"`
  - `?tag=<tag>` $\rightarrow$ `filter.tags = { $regex: new RegExp(`^${escapeRegex(tag.trim())}$`, "i") }` (case-insensitive regex match)
- **Query Parameter Validation:** `category`, `featured`, `tag`, `status` are validated as strings (arrays coerced to `param[0]`; unexpected array shapes return `400 Bad Request`).
- **Sorting:** Featured projects first (`featured: -1`), then newest start date (`startDate: -1`).
- **Read Mode:** `.lean()` (returns plain JS objects for optimal memory/speed).
- **Response Format Guarantee:** Processed through shared `formatProjectResponse` helper ensuring `gallery: []` on the project root and on each version in `versions` when none is stored in MongoDB.

#### `GET /api/v1/projects/categories`
- **Scope:** Public
- **Target Model:** `Project`
- **DB Operation:** `Project.distinct("category", { status: { $ne: "invisible" } })`
- **Purpose:** Retrieves a deduplicated array of category strings for public navigation filters.

#### `GET /api/v1/projects/:slug`
- **Scope:** Public / Admin Hybrid
- **Target Model:** `Project`
- **DB Operation:** `Project.findOne({ slug: req.params.slug.toLowerCase().trim() }).lean()`
- **Visibility Gatekeeper:** If `project.status === "invisible"` and `!req.adminAuthenticated`, returns `404 Not Found` to prevent leakage of unpublished work.
- **Response Format Guarantee:** Guarantees `gallery: []` on project and on each version via `formatProjectResponse`.

#### `POST /api/v1/projects`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** `image`, `videoDemo`, `threeDModel`, and optional `galleryImages` (up to 10 files) with `galleryMeta` (JSON string array of `{ tags, caption }`)
- **Target Model:** `Project`
- **DB Operation:** `Project.create({...})`
- **Key Fields Processed:**
  - `slug`: Extracted from body or auto-derived from `title.toLowerCase().replace(/[^a-z0-9]+/g, "-")`.
  - `skills`: Stringified array or JSON parsed into `Types.ObjectId[]`.
  - `tags`: Normalized to lowercase trimmed strings.
  - `status`: Default `"planning"`.
  - `gallery`: Creation-time gallery items parsed and validated (max 30 items).
  - `versions`: Explicitly ignored if sent in the payload; every newly created project always starts with `versions: []`. Version releases must be appended via `POST /api/v1/projects/:slug/versions`.
- **Rollback Hook:** On failure (`400`, `409`, `500`), calls `cleanupUploadedVersionMedia(req)` destroying all uploaded gallery and project assets in Cloudinary.
- **DB Error Handling:** Duplicate slug triggers Mongo Error 11000 $\rightarrow$ translated to `409 Conflict`.

#### `PUT /api/v1/projects/:id`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.id)`.
- **Target Model:** `Project`
- **DB Operation:** `Project.findByIdAndUpdate(id, updatePayload, { new: true, runValidators: true })`
- **Behavior:** Updates provided fields (including nested objects such as `threeDModel`, `contributors`, `socialLinks`, and `skills`). Explicitly excludes and ignores any `gallery` and `versions` fields sent in the payload so project updates can never overwrite or clear gallery items or version releases. Returns updated document with `gallery: []` guaranteed.

#### `DELETE /api/v1/projects/:id`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.id)`.
- **Target Model:** `Project`
- **DB Operation:** `Project.findByIdAndDelete(id)`
- **Returns:** `200 OK` on success, `404 Not Found` if the document does not exist.

#### `POST /api/v1/projects/:slug/versions`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** Version-specific assets (`image`, `videoDemo`, `threeDModel`, and optional `galleryImages` up to 10 files with `galleryMeta`). Folder: `portfolio/projects/{slug}/{safeVersionTag}/[images|videos|models|gallery]` (dots preserved in version tag, e.g. `v1.0.0`).
- **Target Model:** `Project`
- **Changelog Parsing:** Uses shared `parseChangelog` helper supporting real arrays, JSON-array strings (`'["a","b"]'`), or repeated multipart fields (`changelog=one`). Entries are trimmed, empty ones dropped, and non-string entries return `400 Bad Request`. Omitted, empty string, or `[]` default to `[]`.
- **DB Operations (Two-step):**
  1. `const project = await Project.findOne({ slug })`
  2. If `isLatest === true`, resets existing versions: `project.versions.forEach(v => v.isLatest = false)`
  3. Validates creation-time gallery items (max 30 items)
  4. `project.versions.push(newVersion)`
  5. `await project.save()`
- **Rollback Hook:** On error (`400`, `404`, `500`), calls `cleanupUploadedVersionMedia(req)` to destroy just-uploaded Cloudinary assets using their exact `resource_type` (`image`, `video`, `raw`).
- **Returns:** Updated project document with newly appended version history entry.

#### `PUT /api/v1/projects/:slug/versions/:versionId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.versionId)` and `req.params.slug`.
- **Target Model:** `Project`
- **Changelog Parsing:** Uses shared `parseChangelog` helper. An omitted changelog leaves existing entries unchanged. An explicit empty string `""` or empty array `[]` clears the changelog to `[]`.
- **Gallery Protection:** Does not mutate the version's `gallery` array; gallery modifications must use the dedicated version gallery endpoints.
- **DB Operations:**
  1. `const project = await Project.findOne({ slug })`
  2. Subdocument lookup: `project.versions.find(v => String(v._id) === versionId)`
  3. Case-insensitive JS duplicate check: ensures no other version in `project.versions` shares `trimmedTag.toLowerCase()` (renaming to self allowed).
  4. Updates modified fields (`versionTag`, `releaseDate`, `changelog`, `demoUrl`, `image`, `videoDemo`, `threeDFileUrl`), clearing fields set to `""`.
  5. Single-truth `isLatest`: if `true`, resets all versions in `project.versions` to `false`, sets current version to `true`. If `false`, leaves project without a latest version.
  6. `await project.save()` (runs schema validators).
- **Rollback Hook:** On error (`400`, `404`, `409`, `500`), calls `cleanupUploadedVersionMedia(req)` to destroy just-uploaded Cloudinary assets using their exact `resource_type` (`image`, `video`, `raw`).
- **Returns:** Updated project document (`200 OK`).

#### `POST /api/v1/projects/:slug/gallery`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Project slug existence; accepts either multipart file field `galleryImages` (1-10 files) aligned with `galleryMeta` (JSON string array), OR JSON body `{ items: [...] }` with http/https URLs. Cannot provide both or neither (`400`). Enforces max 30 items total per project (`400`).
- **Target Model:** `Project`
- **DB Operations:** Atomic append using `$push`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug },
    { $push: { gallery: { $each: newItems } } },
    { new: true, runValidators: true }
  )
  ```
- **Rollback Hook:** On failure (`400`, `404`, `500`), calls `cleanupUploadedVersionMedia(req)` destroying all uploaded gallery files in Cloudinary (`resource_type: "image"`).
- **Returns:** `201 Created` with updated project data (`gallery: []` guaranteed).

#### `PUT /api/v1/projects/:slug/gallery/order`
- **Scope:** Protected (`authMiddleware`)
- **Route Precedence:** Registered before `/gallery/:imageId` to prevent route shadowing.
- **Validation:** Body must contain `{ order: string[] }` containing every existing gallery item `_id` exactly once; duplicate, extra, or missing IDs return `400 Bad Request`.
- **Target Model:** `Project`
- **DB Operations:** Load document, validate full ID equality, reorder in-place, and persist via `project.save()`.
- **Returns:** `200 OK` with updated project data.

#### `PUT /api/v1/projects/:slug/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:imageId` ObjectId format (`400`), project and image existence (`404`).
- **Payload:** JSON or multipart with optional `tags`, `caption`, and optional single file field `galleryImage`.
- **Target Model:** `Project`
- **DB Operations:** Atomic positional update:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "gallery._id": imageId },
    { $set: updateFields },
    { new: true, runValidators: true }
  )
  ```
- **Asset Retention:** Replacing an image updates the URL in MongoDB and keeps the old Cloudinary asset.
- **Rollback Hook:** On failure, newly uploaded replacement file is destroyed in Cloudinary.
- **Returns:** `200 OK` with updated project data.

#### `DELETE /api/v1/projects/:slug/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:imageId` ObjectId format (`400`), project and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic removal using `$pull`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug },
    { $pull: { gallery: { _id: imageId } } },
    { new: true }
  )
  ```
- **Asset Retention:** Cloudinary asset is intentionally retained (consistent with project deletion).
- **Returns:** `200 OK` with updated project data.

#### `POST /api/v1/projects/:slug/versions/:versionId/gallery`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` ObjectId format (`400`), project and version existence (`404`). Enforces max 30 items per version (`400`).
- **Folder Structure:** `portfolio/projects/<slug>/<sanitizedVersionTag>/gallery/<slug>_<n>`.
- **Target Model:** `Project`
- **DB Operations:** Atomic append to the nested version's gallery array using positional operator:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId },
    { $push: { "versions.$.gallery": { $each: newItems } } },
    { new: true, runValidators: true }
  )
  ```
- **Rollback Hook:** On failure (`400`, `404`, `500`), destroys newly uploaded files in Cloudinary.
- **Returns:** `201 Created` with updated project data.

#### `PUT /api/v1/projects/:slug/versions/:versionId/gallery/order`
- **Scope:** Protected (`authMiddleware`)
- **Route Precedence:** Registered before `/gallery/:imageId`.
- **Validation:** Body must contain `{ order: string[] }` containing every existing version gallery item `_id` exactly once (`400` otherwise).
- **Target Model:** `Project`
- **DB Operations:** Finds project and version, validates IDs, reorders version `gallery` array in memory, and persists via `project.save()`.
- **Returns:** `200 OK` with updated project data.

#### `PUT /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` and `:imageId` ObjectId format (`400`), project, version, and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic positional mutation using `arrayFilters`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId, "versions.gallery._id": imageId },
    { $set: updateFields }, // sets "versions.$[v].gallery.$[g].url", etc.
    {
      arrayFilters: [{ "v._id": versionId }, { "g._id": imageId }],
      new: true,
      runValidators: true,
    }
  )
  ```
- **Asset Retention:** Old asset retained on Cloudinary when URL is replaced.
- **Rollback Hook:** On failure, newly uploaded replacement file is destroyed in Cloudinary.
- **Returns:** `200 OK` with updated project data.

#### `DELETE /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` and `:imageId` ObjectId format (`400`), project, version, and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic removal from nested version gallery using positional `$pull`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId },
    { $pull: { "versions.$.gallery": { _id: imageId } } },
    { new: true }
  )
  ```
- **Asset Retention:** Cloudinary asset is intentionally retained.
- **Returns:** `200 OK` with updated project data.

#### `DELETE /api/v1/projects/:slug/versions/:versionId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.versionId)` and `req.params.slug`.
- **Target Model:** `Project`
- **DB Operations:**
  1. `const project = await Project.findOne({ slug })`
  2. Finds version index: `project.versions.findIndex(v => String(v._id) === versionId)`
  3. `project.versions.splice(index, 1)`
  4. `await project.save()`
- **Behavior:** Cloudinary assets are intentionally kept (no destroy calls, consistent with project deletion). Deleting latest version does NOT promote another version.
- **Returns:** Updated project document (`200 OK`).

#### `POST /api/v1/projects/:slug/gallery`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Project slug existence; accepts either multipart file field `galleryImages` (1-10 files) aligned with `galleryMeta` (JSON string array), OR JSON body `{ items: [...] }` with http/https URLs. Cannot provide both or neither (`400`). Enforces max 30 items total per project (`400`).
- **Target Model:** `Project`
- **DB Operations:** Atomic append using `$push`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug },
    { $push: { gallery: { $each: newItems } } },
    { new: true, runValidators: true }
  )
  ```
- **Rollback Hook:** On failure (`400`, `404`, `500`), calls `cleanupUploadedVersionMedia(req)` destroying all uploaded gallery files in Cloudinary (`resource_type: "image"`).
- **Returns:** `201 Created` with updated project data (`gallery: []` guaranteed).

#### `PUT /api/v1/projects/:slug/gallery/order`
- **Scope:** Protected (`authMiddleware`)
- **Route Precedence:** Registered before `/gallery/:imageId` to prevent route shadowing.
- **Validation:** Body must contain `{ order: string[] }` containing every existing gallery item `_id` exactly once; duplicate, extra, or missing IDs return `400 Bad Request`.
- **Target Model:** `Project`
- **DB Operations:** Load document, validate full ID equality, reorder in-place, and persist via `project.save()`.
- **Returns:** `200 OK` with updated project data.

#### `PUT /api/v1/projects/:slug/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:imageId` ObjectId format (`400`), project and image existence (`404`).
- **Payload:** JSON or multipart with optional `tags`, `caption`, and optional single file field `galleryImage`.
- **Target Model:** `Project`
- **DB Operations:** Atomic positional update:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "gallery._id": imageId },
    { $set: updateFields },
    { new: true, runValidators: true }
  )
  ```
- **Asset Retention:** Replacing an image updates the URL in MongoDB and keeps the old Cloudinary asset.
- **Rollback Hook:** On failure, newly uploaded replacement file is destroyed in Cloudinary.
- **Returns:** `200 OK` with updated project data.

#### `DELETE /api/v1/projects/:slug/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:imageId` ObjectId format (`400`), project and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic removal using `$pull`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug },
    { $pull: { gallery: { _id: imageId } } },
    { new: true }
  )
  ```
- **Asset Retention:** Cloudinary asset is intentionally retained (consistent with project deletion).
- **Returns:** `200 OK` with updated project data.

#### `POST /api/v1/projects/:slug/versions/:versionId/gallery`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` ObjectId format (`400`), project and version existence (`404`). Enforces max 30 items per version (`400`).
- **Folder Structure:** `portfolio/projects/<slug>/<sanitizedVersionTag>/gallery/<slug>_<n>`.
- **Target Model:** `Project`
- **DB Operations:** Atomic append to the nested version's gallery array using positional operator:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId },
    { $push: { "versions.$.gallery": { $each: newItems } } },
    { new: true, runValidators: true }
  )
  ```
- **Rollback Hook:** On failure (`400`, `404`, `500`), destroys newly uploaded files in Cloudinary.
- **Returns:** `201 Created` with updated project data.

#### `PUT /api/v1/projects/:slug/versions/:versionId/gallery/order`
- **Scope:** Protected (`authMiddleware`)
- **Route Precedence:** Registered before `/gallery/:imageId`.
- **Validation:** Body must contain `{ order: string[] }` containing every existing version gallery item `_id` exactly once (`400` otherwise).
- **Target Model:** `Project`
- **DB Operations:** Finds project and version, validates IDs, reorders version `gallery` array in memory, and persists via `project.save()`.
- **Returns:** `200 OK` with updated project data.

#### `PUT /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` and `:imageId` ObjectId format (`400`), project, version, and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic positional mutation using `arrayFilters`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId, "versions.gallery._id": imageId },
    { $set: updateFields }, // sets "versions.$[v].gallery.$[g].url", etc.
    {
      arrayFilters: [{ "v._id": versionId }, { "g._id": imageId }],
      new: true,
      runValidators: true,
    }
  )
  ```
- **Asset Retention:** Old asset retained on Cloudinary when URL is replaced.
- **Rollback Hook:** On failure, newly uploaded replacement file is destroyed in Cloudinary.
- **Returns:** `200 OK` with updated project data.

#### `DELETE /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Validates `:versionId` and `:imageId` ObjectId format (`400`), project, version, and image existence (`404`).
- **Target Model:** `Project`
- **DB Operations:** Atomic removal from nested version gallery using positional `$pull`:
  ```typescript
  await Project.findOneAndUpdate(
    { slug, "versions._id": versionId },
    { $pull: { "versions.$.gallery": { _id: imageId } } },
    { new: true }
  )
  ```
- **Asset Retention:** Cloudinary asset is intentionally retained.
- **Returns:** `200 OK` with updated project data.

#### `GET /api/v1/admin/projects`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Project`
- **DB Operation:** `Project.find(filter).sort({ featured: -1, startDate: -1 }).lean()`
- **Query Filter Logic:**
  - Default: `{}` (fetches all projects without any status restriction, fully exposing `invisible`, `planning`, `active`, etc.)
  - `?status=<status>` $\rightarrow$ `filter.status = status.toLowerCase().trim()` (explicit status filter)
  - `?category=<category>` $\rightarrow$ `filter.category = category.toLowerCase().trim()`
  - `?featured=<true|false>` $\rightarrow$ `filter.featured = featured === "true"`
  - `?tag=<tag>` $\rightarrow$ `filter.tags = { $regex: new RegExp(`^${escapeRegex(tag.trim())}$`, "i") }` (case-insensitive regex match)
- **Query Parameter Validation:** `category`, `featured`, `tag`, `status` are validated as strings (arrays coerced to `param[0]`; unexpected array shapes return `400 Bad Request`).
- **Sorting:** Featured projects first (`featured: -1`), then newest start date (`startDate: -1`).
- **Read Mode:** `.lean()` (returns plain JS objects for optimal memory/speed).
- **Response Shape:**
  ```json
  {
    "success": true,
    "count": 3,
    "data": [...]
  }
  ```

---

### 4.3 Skills API (`/api/v1/skills`)

#### `GET /api/v1/skills`
- **Scope:** Public
- **Target Model:** `Skill`
- **DB Operation:** `Skill.find(filter).sort({ weight: 1, name: 1 })`
- **Query Filter Logic:**
  - `?type=<tool|language|framework>`: Filtered against `ALLOWED_SKILL_TYPES`.
- **Sorting:** Ascending weight (`weight: 1`), then alphabetical by name (`name: 1`).

#### `GET /api/v1/skills/:id`
- **Scope:** Public
- **Target Model:** `Skill`
- **DB Operation:** `Skill.findById(req.params.id)`

#### `POST /api/v1/skills`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Upload:** `logoUrl` uploaded to Cloudinary (`portfolio/skills/{skillName}`).
- **Target Model:** `Skill`
- **DB Operations:**
  1. **Duplicate Check:**
     ```typescript
     Skill.findOne({
       name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
     })
     ```
     Returns `409 Conflict` if name exists (case-insensitive).
  2. **Create:**
     ```typescript
     Skill.create({ name: trimmedName, type, logoUrl, featured, weight })
     ```

#### `PUT /api/v1/skills/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Skill`
- **DB Operations:**
  1. **Duplicate Check (if name updated):**
     ```typescript
     Skill.findOne({
       name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") },
       _id: { $ne: req.params.id }
     })
     ```
  2. **Update:**
     ```typescript
     Skill.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
     ```

#### `DELETE /api/v1/skills/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Skill`
- **DB Operation:** `Skill.findByIdAndDelete(req.params.id)`

---

### 4.4 Certificates API (`/api/v1/certificates`)

#### `GET /api/v1/certificates`
- **Scope:** Public
- **Target Model:** `Certificate`
- **DB Operation:** `Certificate.find().sort({ weight: 1, title: 1 })`

#### `GET /api/v1/certificates/:id`
- **Scope:** Public
- **Target Model:** `Certificate`
- **DB Operation:** `Certificate.findById(req.params.id)`

#### `POST /api/v1/certificates`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Upload:** `mediaUrl` uploaded to Cloudinary (`portfolio/certificate/{org}_{title}_{year}`).
- **Target Model:** `Certificate`
- **DB Operations:**
  1. **Case-Insensitive Uniqueness Check:**
     ```typescript
     Certificate.findOne({
       title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") }
     })
     ```
     Returns `409 Conflict` if duplicate title exists.
  2. **Create:**
     ```typescript
     Certificate.create({ title, description, link, mediaUrl, organization, weight })
     ```

#### `PUT /api/v1/certificates/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Certificate`
- **DB Operations:**
  1. **Collision Check:**
     ```typescript
     Certificate.findOne({
       title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") },
       _id: { $ne: req.params.id }
     })
     ```
  2. **Update:**
     ```typescript
     Certificate.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
     ```

#### `DELETE /api/v1/certificates/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Certificate`
- **DB Operation:** `Certificate.findByIdAndDelete(req.params.id)`

---

### 4.5 Achievements API (`/api/v1/achievements`)

#### `GET /api/v1/achievements`
- **Scope:** Public
- **Target Model:** `Achievement`
- **DB Operation:** `Achievement.find().sort({ weight: 1, title: 1 })`

#### `GET /api/v1/achievements/:id`
- **Scope:** Public
- **Target Model:** `Achievement`
- **DB Operation:** `Achievement.findById(req.params.id)`

#### `POST /api/v1/achievements`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Achievement`
- **DB Operations:**
  1. **Case-Insensitive Duplicate Check:**
     ```typescript
     Achievement.findOne({
       title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") }
     })
     ```
  2. **Create:**
     ```typescript
     Achievement.create({ title: trimmedTitle, detail, date, weight })
     ```

#### `PUT /api/v1/achievements/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Achievement`
- **DB Operations:**
  1. **Collision Check:**
     ```typescript
     Achievement.findOne({
       title: { $regex: new RegExp(`^${escapeRegex(trimmedTitle)}$`, "i") },
       _id: { $ne: req.params.id }
     })
     ```
  2. **Update:**
     ```typescript
     Achievement.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
     ```

#### `DELETE /api/v1/achievements/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Achievement`
- **DB Operation:** `Achievement.findByIdAndDelete(req.params.id)`

---

### 4.6 Experiences API (`/api/v1/experiences`)

#### `GET /api/v1/experiences`
- **Scope:** Public
- **Target Model:** `Experience`
- **DB Operation:** `Experience.find().sort({ weight: 1, organization: 1 })`

#### `GET /api/v1/experiences/:id`
- **Scope:** Public
- **Target Model:** `Experience`
- **DB Operation:** `Experience.findById(req.params.id)`

#### `POST /api/v1/experiences`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** `iconUrl`, `mediaUrls` (max 10), `certificateUrls` (max 10)
- **Target Model:** `Experience`
- **DB Operations:**
  1. **Organization Uniqueness Check:**
     ```typescript
     Experience.findOne({
       organization: { $regex: new RegExp(`^${escapeRegex(trimmedOrg)}$`, "i") }
     })
     ```
     Returns `409 Conflict` on duplicate organization name.
  2. **Payload Processing:**
     - Parsed `positions` array merges newly uploaded Cloudinary media and certificate URLs into `positions[0]`.
     - `skills` are parsed into `Types.ObjectId[]`.
  3. **Create:**
     ```typescript
     Experience.create({ organization, tag, type, iconUrl, skills, weight, positions })
     ```

#### `PUT /api/v1/experiences/:id`
- **Scope:** Protected (`authMiddleware`)
- **Pre-middleware DB Operation:** `processExperienceUploads` runs `Experience.findOne({ _id: req.params.id })` if `organization` or `tag` is not in request body.
- **Target Model:** `Experience`
- **DB Operations:**
  1. **Organization Collision Check:**
     ```typescript
     Experience.findOne({
       organization: { $regex: new RegExp(`^${escapeRegex(trimmedOrg)}$`, "i") },
       _id: { $ne: req.params.id }
     })
     ```
  2. **Update:**
     ```typescript
     Experience.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
     ```

#### `DELETE /api/v1/experiences/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Experience`
- **DB Operation:** `Experience.findByIdAndDelete(req.params.id)`

#### `POST /api/v1/experiences/:organization/positions`
- **Scope:** Protected (`authMiddleware`)
- **Pre-middleware DB Operation:** `processExperienceUploads` queries `Experience.findOne({ organization: ... })` to resolve tag and folder destination for uploaded media/certificates.
- **Target Model:** `Experience`
- **DB Operations (Multi-step atomic workflow):**
  1. **Find Document:**
     ```typescript
     const existingExperience = await Experience.findOne({
       organization: { $regex: new RegExp(`^${escapeRegex(organization)}$`, "i") }
     });
     ```
  2. **Reset Active Position (Conditional):** If the new position has `isCurrent === true`, all other positions for this organization are reset so only one role remains current:
     ```typescript
     await Experience.updateMany(
       { _id: existingExperience._id },
       { $set: { "positions.$[].isCurrent": false } }
     );
     ```
  3. **Push New Position Subdocument:**
     ```typescript
     const updatedExperience = await Experience.findByIdAndUpdate(
       existingExperience._id,
       { $push: { positions: newPosition } },
       { new: true, runValidators: true }
     );
     ```

---

### 4.7 Site Configuration API (`/api/v1/config`)

The `SiteConfig` model manages global metadata as a **singleton document** in the `siteconfigs` collection.

#### `GET /api/v1/config`
- **Scope:** Public
- **Target Model:** `SiteConfig`
- **DB Operation:** `SiteConfig.findOne()`
- **Fallback Logic:** If `resumeUrl` is missing on legacy records, copies `resumeDriveUrl` in memory before sending response.

#### `POST /api/v1/config`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `SiteConfig`
- **DB Operations:**
  1. **Singleton Enactment:**
     ```typescript
     const existing = await SiteConfig.findOne();
     ```
     If document exists, returns `409 Conflict` (`"Site configuration already exists. Use PUT to update."`) and cleans up any newly uploaded Cloudinary PDF.
  2. **Create:**
     ```typescript
     SiteConfig.create({
       name,
       pfpUrl,
       pfpPublicId,
       resumeUrl,
       resumePublicId,
       pfpHistory: [{ url: pfpUrl, publicId: pfpPublicId, uploadedAt: new Date() }],
       jobTitles,
       statusMessage,
       bioSummary
     })
     ```

#### `PUT /api/v1/config`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** Supports uploading a new profile picture (`pfp`, `pfpUrl`, `image`) or resume PDF (`resume`, `resumeFile`, `resumePdf`, `pdf`).
- **Target Model:** `SiteConfig`
- **DB Operations:**
  1. **Find Current Document:**
     ```typescript
     const existingConfig = await SiteConfig.findOne();
     ```
  2. **PFP Carousel & History Validation:**
     - If a **new file** is uploaded, it is prepended to `pfpHistory` using `$position: 0`.
     - If **selecting from history** without re-uploading, strictly validates that `pfpUrl` and `pfpPublicId` exist in `existingConfig.pfpHistory` (prevents arbitrary URLs without valid Cloudinary tracking).
  3. **Atomic Upsert:**
     ```typescript
     const updateOps = {
       $set: setFields,
       ...(newHistoryItem ? {
         $push: {
           pfpHistory: { $each: [newHistoryItem], $position: 0 }
         }
       } : {})
     };
     await SiteConfig.findOneAndUpdate({}, updateOps, {
       new: true,
       upsert: true,
       runValidators: true
     });
     ```

#### `POST /api/v1/config/resume`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Upload:** Dedicated endpoint for resume PDF uploads (`resume`, `resumeFile`, `resumePdf`, `pdf`).
- **Target Model:** `SiteConfig`
- **DB Operation:**
  ```typescript
  SiteConfig.findOneAndUpdate(
    {},
    { $set: { resumeUrl, resumePublicId } },
    { new: true }
  )
  ```
- **Error Behavior:** If no configuration document exists in the database, returns `404 Not Found` and triggers Cloudinary cleanup of the uploaded PDF asset.

---

### 4.8 Admin Logs API (`/api/v1/admin/logs`)

#### `GET /api/v1/admin/logs`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `LogEntry`
- **DB Operations:** Parallelized query using `Promise.all`:
  1. `LogEntry.countDocuments(filter)`
  2. `LogEntry.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limitNum).lean()`
- **Query Filters:**
  - `?level=<INFO|WARN|ERROR>` $\rightarrow$ `filter.level = level`
  - `?date=YYYY-MM-DD` $\rightarrow$ `filter.timestamp = { $gte: "YYYY-MM-DDT00:00:00.000Z", $lte: "YYYY-MM-DDT23:59:59.999Z" }`
  - `?month=YYYY-MM` $\rightarrow$ Computes first millisecond to last millisecond of the given month.
  - `?year=YYYY` $\rightarrow$ Computes `YYYY-01-01T00:00:00.000Z` to `YYYY-12-31T23:59:59.999Z`.
- **Pagination:**
  - `page`: Default 1
  - `limit`: Default 50 (capped at 500)
  - `skip = (page - 1) * limit`
- **Sorting:** Chronologically descending (`timestamp: -1`).
- **Response Shape:**
  ```json
  {
    "success": true,
    "count": 50,
    "total": 1284,
    "page": 1,
    "totalPages": 26,
    "data": [...]
  }
  ```

---

### 4.9 Contributors API (`/api/v1/contributors`)

#### `GET /api/v1/contributors`
- **Scope:** Public
- **Target Model:** `Contributor`
- **DB Operations:**
  ```typescript
  const query = Contributor.find();
  query.collation({ locale: "en", strength: 2 });
  const contributors = await query.sort({ name: 1 });
  ```
- **Sorting:** Case-insensitively ascending by `name`.

#### `GET /api/v1/contributors/:id`
- **Scope:** Public
- **Target Model:** `Contributor`
- **DB Operation:** `Contributor.findById(id)`
- **Validation:** Validates 24-character hex `ObjectId` (`400 Bad Request` if invalid). Returns `404 Not Found` if missing.

#### `POST /api/v1/contributors`
- **Scope:** Protected (`authMiddleware`)
- **Content-Type:** JSON or Multipart (`profilePicUrl` file field or URL text field).
- **Target Model:** `Contributor`
- **DB Operations:**
  1. Case-insensitive duplicate check on `name`:
     ```typescript
     const existing = await Contributor.findOne({
       name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") }
     });
     ```
     Returns `409 Conflict` if duplicate.
  2. Create contributor:
     ```typescript
     const contributor = await Contributor.create({ name, profilePicUrl, profileLink });
     ```
- **Rollback:** If validation fails or database error occurs after file upload, the uploaded picture is rolled back via `cleanupUploadedVersionMedia(req)` with `{ resource_type: "image" }`.

#### `PUT /api/v1/contributors/:id`
- **Scope:** Protected (`authMiddleware`)
- **Content-Type:** JSON or Multipart (optional `profilePicUrl` file replacement).
- **Target Model:** `Contributor`
- **DB Operations:**
  1. Partial validation of fields. Empty string `""` clears `profileLink`.
  2. Duplicate name check excluding current contributor `_id != id` (`409 Conflict`).
  3. `Contributor.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })`.
- **Cloudinary Asset Retention:** Replacing a profile picture keeps the existing Cloudinary asset (consistent with project edits).

#### `DELETE /api/v1/contributors/:id`
- **Scope:** Protected (`authMiddleware`)
- **Target Model:** `Contributor`, `Project`
- **DB Operations:**
  1. Reference Check across projects and versions:
     ```typescript
     const matchingProjects = await Project.find({
       $or: [
         { "contributors.contributor": id },
         { "versions.contributors.contributor": id },
       ]
     });
     ```
  2. If in use, rejects deletion with `409 Conflict` reporting exact project and version usage counts (e.g. `"Cannot delete contributor: referenced by 1 project(s) and 2 project version(s)"`).
  3. If unused, deletes contributor via `Contributor.findByIdAndDelete(id)`. Cloudinary assets are retained.

#### Legacy Contributor Cleanup Script (`scripts/clear-legacy-contributors.ts`)
- **NPM Script:** `npm run clear-legacy-contributors`
- **Behavior:** Reads all projects and version subdocuments for legacy embedded contributors (`{ name, profilePicUrl }` lacking `contributor` ObjectId reference).
- **Dry-run Mode (Default):** Prints affected project slugs, version tags, and legacy contributor names without modifying database documents.
- **Apply Mode (`--apply`):** Clears the legacy contributor arrays and saves affected documents.
- **Execution Rule:** Never invoked at server boot; manual CLI maintenance tool only.

---

## 5. Cloudinary & Database Consistency Safeguards

Because file uploads occur during the Express middleware pipeline **before** the database write occurs in the controller, network interruptions or MongoDB validation errors could leave orphaned assets in Cloudinary. The codebase implements rollback mechanisms:

```
[Incoming Request with File]
            |
            v
[uploadMiddleware]  ---> Uploads asset to Cloudinary (receives publicId)
            |
            v
[Controller Execution]
      /           \
  [DB Success]  [DB Error / Validation Failure]
      |                    |
      v                    v
  Commit DB       [cleanupUploadedResume]
  Return 200/201  Calls cloudinary.uploader.destroy(publicId)
                  Preserves original DB error / status code
```

- **Protected Assets:** When updating SiteConfig with a new profile picture, previous images are **retained** in `pfpHistory` to facilitate carousel rollback and prevent broken avatar links across client platforms.
- **Resume Cleanup (`cleanupUploadedResume`):** If `POST /api/v1/config`, `PUT /api/v1/config`, or `POST /api/v1/config/resume` fails due to:
  1. Duplicate configuration (`409 Conflict`)
  2. Validation error (`400 Bad Request`)
  3. Database failure (`500 Internal Server Error`)
  
  The newly uploaded PDF asset is deleted from Cloudinary using `cloudinary.uploader.destroy(resumePublicId)`, keeping storage clean and synchronized with database state.
- **Version Media Cleanup (`cleanupUploadedVersionMedia`):** If `POST /api/v1/projects/:slug/versions` or `PUT /api/v1/projects/:slug/versions/:versionId` fails due to validation error (`400`), missing project/version (`404`), duplicate tag collision (`409`), or database failure (`500`), newly uploaded assets recorded in `req.uploadedMediaAssets` are immediately destroyed via `cloudinary.uploader.destroy(publicId, { resource_type: asset.resourceType })`, ensuring images, videos, and raw 3D models are rolled back with their exact respective resource types.
- **Gallery Upload Rollback (`cleanupUploadedVersionMedia`):** If adding or updating gallery images on a project (`POST /api/v1/projects`, `POST /api/v1/projects/:slug/gallery`, `PUT /api/v1/projects/:slug/gallery/:imageId`) or version (`POST /api/v1/projects/:slug/versions`, `POST /api/v1/projects/:slug/versions/:versionId/gallery`, `PUT /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`) fails due to validation errors, invalid file MIME types, batch size >10, exceeding 30 gallery items cap, missing project/version, or database failure, all newly uploaded gallery assets are rolled back and destroyed via `cleanupUploadedVersionMedia(req)` with `{ resource_type: "image" }`. Successful mutations and deletions keep Cloudinary assets intact.
- **URL Validation Upload Rollback:** If any multipart mutation (such as creating/updating a project version, contributor, experience, site config, or gallery image) successfully processes uploaded files to Cloudinary but subsequently fails due to an invalid URL string in an accompanying field (e.g., malformed `demoUrl`, `deployedLink`, `profileLink`, `resumeUrl`, etc.), all newly uploaded assets from that request are immediately rolled back and destroyed from Cloudinary (`cleanupUploadedVersionMedia`, `cleanupUploadedResume`, or `destroyCloudinaryAsset`), ensuring no orphaned files persist in cloud storage.

---

## 6. Summary Matrix

| Method | Route | Auth | Target Model | DB Methods / Actions | Filter / Key Parameters |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ALL` | *All Endpoints* | Public / Admin | `LogEntry` | `create()` | Logs request time, level, method, endpoint, status, IP, and duration |
| `GET` | `/health` | Public | None | Connection readyState check | None |
| `GET` | `/api/v1/health` | Public | None | Connection readyState check | None |
| `GET` | `/api/v1/projects` | Public | `Project` | `find().sort().lean()` | `status != invisible`, `category`, `featured`, `tag` (guarantees `gallery: []`) |
| `GET` | `/api/v1/projects/categories` | Public | `Project` | `distinct()` | Categories where `status != invisible` |
| `GET` | `/api/v1/projects/:slug` | Public* | `Project` | `findOne().lean()` | By `slug`; rejects `invisible` if not admin (guarantees `gallery: []`) |
| `GET` | `/api/v1/admin/projects` | Admin | `Project` | `find().sort().lean()` | No status filter (includes `invisible`/drafts); optional `status`, `category`, `featured`, `tag` (guarantees `gallery: []`) |
| `POST` | `/api/v1/projects` | Admin | `Project` | `create()` | Creates project, normalizes tags/skills, verifies unique slug, creation-time gallery (ignores `versions`, starts with `versions: []`) |
| `PUT` | `/api/v1/projects/:id` | Admin | `Project` | `findByIdAndUpdate()` | Partial update by `_id`, runs validators (ignores `gallery` and `versions`) |
| `DELETE` | `/api/v1/projects/:id` | Admin | `Project` | `findByIdAndDelete()` | Removes project by `_id` |
| `POST` | `/api/v1/projects/:slug/versions` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | Appends version; resets `isLatest` if new is latest, creation-time gallery |
| `PUT` | `/api/v1/projects/:slug/versions/:versionId` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | In-place update of version; tag duplicate check; single-truth `isLatest`; upload cleanup on failure (ignores `gallery`) |
| `DELETE` | `/api/v1/projects/:slug/versions/:versionId` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | Removes version from `versions` array; Cloudinary assets kept |
| `POST` | `/api/v1/projects/:slug/gallery` | Admin | `Project` | `findOneAndUpdate()` | Atomic `$push` `$each` new gallery items (max 30 items) |
| `PUT` | `/api/v1/projects/:slug/gallery/order` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | Reorders project gallery items by full array of `_id`s |
| `PUT` | `/api/v1/projects/:slug/gallery/:imageId` | Admin | `Project` | `findOneAndUpdate()` | Atomic positional `$set` on `gallery._id` (tags, caption, file) |
| `DELETE` | `/api/v1/projects/:slug/gallery/:imageId` | Admin | `Project` | `findOneAndUpdate()` | Atomic `$pull` from `gallery` by `_id`; assets kept |
| `POST` | `/api/v1/projects/:slug/versions/:versionId/gallery` | Admin | `Project` | `findOneAndUpdate()` | Atomic `$push` `$each` to `versions.$.gallery` (max 30 items) |
| `PUT` | `/api/v1/projects/:slug/versions/:versionId/gallery/order` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | Reorders version gallery items by full array of `_id`s |
| `PUT` | `/api/v1/projects/:slug/versions/:versionId/gallery/:imageId` | Admin | `Project` | `findOneAndUpdate()` | Atomic positional `$set` on `versions.$[v].gallery.$[g]` with `arrayFilters` |
| `DELETE` | `/api/v1/projects/:slug/versions/:versionId/gallery/:imageId` | Admin | `Project` | `findOneAndUpdate()` | Atomic `$pull` from `versions.$.gallery` by `_id`; assets kept |
| `GET` | `/api/v1/contributors` | Public | `Contributor` | `find().collation().sort()` | Sorted case-insensitively by `name: 1` |
| `GET` | `/api/v1/contributors/:id` | Public | `Contributor` | `findById()` | By `_id` |
| `POST` | `/api/v1/contributors` | Admin | `Contributor` | `findOne()` $\rightarrow$ `create()` | Multipart pic or URL; case-insensitive duplicate check on `name`; rollback on failure |
| `PUT` | `/api/v1/contributors/:id` | Admin | `Contributor` | `findOne()` $\rightarrow$ `findByIdAndUpdate()` | Duplicate check excluding self; replaces pic keeping old Cloudinary asset; clears link with `""` |
| `DELETE` | `/api/v1/contributors/:id` | Admin | `Contributor` | `Project.find()` $\rightarrow$ `findByIdAndDelete()` | Rejects with 409 if referenced in project or version with count; deletes and keeps Cloudinary asset |
| `GET` | `/api/v1/skills` | Public | `Skill` | `find().sort()` | Optional `type` filter; sorted by `weight: 1, name: 1` |
| `GET` | `/api/v1/skills/:id` | Public | `Skill` | `findById()` | By `_id` |
| `POST` | `/api/v1/skills` | Admin | `Skill` | `findOne()` $\rightarrow$ `create()` | Case-insensitive duplicate check on `name` |
| `PUT` | `/api/v1/skills/:id` | Admin | `Skill` | `findOne()` $\rightarrow$ `findByIdAndUpdate()` | Duplicate check excluding self; updates by `_id` |
| `DELETE` | `/api/v1/skills/:id` | Admin | `Skill` | `findByIdAndDelete()` | Removes skill by `_id` |
| `GET` | `/api/v1/certificates` | Public | `Certificate` | `find().sort()` | Sorted by `weight: 1, title: 1` |
| `GET` | `/api/v1/certificates/:id` | Public | `Certificate` | `findById()` | By `_id` |
| `POST` | `/api/v1/certificates` | Admin | `Certificate` | `findOne()` $\rightarrow$ `create()` | Case-insensitive duplicate check on `title` |
| `PUT` | `/api/v1/certificates/:id` | Admin | `Certificate` | `findOne()` $\rightarrow$ `findByIdAndUpdate()` | Duplicate check excluding self; updates by `_id` |
| `DELETE` | `/api/v1/certificates/:id` | Admin | `Certificate` | `findByIdAndDelete()` | Removes certificate by `_id` |
| `GET` | `/api/v1/achievements` | Public | `Achievement` | `find().sort()` | Sorted by `weight: 1, title: 1` |
| `GET` | `/api/v1/achievements/:id` | Public | `Achievement` | `findById()` | By `_id` |
| `POST` | `/api/v1/achievements` | Admin | `Achievement` | `findOne()` $\rightarrow$ `create()` | Case-insensitive duplicate check on `title` |
| `PUT` | `/api/v1/achievements/:id` | Admin | `Achievement` | `findOne()` $\rightarrow$ `findByIdAndUpdate()` | Duplicate check excluding self; updates by `_id` |
| `DELETE` | `/api/v1/achievements/:id` | Admin | `Achievement` | `findByIdAndDelete()` | Removes achievement by `_id` |
| `GET` | `/api/v1/experiences` | Public | `Experience` | `find().sort()` | Sorted by `weight: 1, organization: 1` |
| `GET` | `/api/v1/experiences/:id` | Public | `Experience` | `findById()` | By `_id` |
| `POST` | `/api/v1/experiences` | Admin | `Experience` | `findOne()` $\rightarrow$ `create()` | Case-insensitive check on `organization`; attaches media to position |
| `PUT` | `/api/v1/experiences/:id` | Admin | `Experience` | `findOne()` (pre-check) $\rightarrow$ `findByIdAndUpdate()` | Pre-middleware lookup for org/tag; collision check on org; updates by `_id` |
| `DELETE` | `/api/v1/experiences/:id` | Admin | `Experience` | `findByIdAndDelete()` | Removes experience by `_id` |
| `POST` | `/api/v1/experiences/:organization/positions` | Admin | `Experience` | `findOne()` $\rightarrow$ `updateMany()` $\rightarrow$ `findByIdAndUpdate()` | Looks up experience, resets existing `isCurrent: false` if needed, pushes position |
| `GET` | `/api/v1/config` | Public | `SiteConfig` | `findOne()` | Singleton retrieval; legacy migration fallback |
| `POST` | `/api/v1/config` | Admin | `SiteConfig` | `findOne()` $\rightarrow$ `create()` | Enforces singleton (rejects if exists with 409); creates initial history |
| `PUT` | `/api/v1/config` | Admin | `SiteConfig` | `findOne()` $\rightarrow$ `findOneAndUpdate()` | Validates PFP against history; `$push` new PFP to index 0; upserts config |
| `POST` | `/api/v1/config/resume` | Admin | `SiteConfig` | `findOneAndUpdate()` | Updates `resumeUrl` & `resumePublicId`; cleans up Cloudinary on failure |
| `GET` | `/api/v1/admin/logs` | Admin | `LogEntry` | `countDocuments()`, `find().sort().skip().limit().lean()` | Filter by `level`, `date`, `month`, `year`; paginated |
