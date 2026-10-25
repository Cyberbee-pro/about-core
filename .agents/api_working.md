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

The database contains **7 core collections**:

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

+-------------------+  +-------------------+  +---------------------+
|       Skill       |  |    Certificate    |  |     Achievement     |
|-------------------|  |-------------------|  |---------------------|
| - name (unique)   |  | - title           |  | - title             |
| - type (enum)     |  | - organization    |  | - date              |
+-------------------+  +-------------------+  +---------------------+

                       +-------------------+
                       |     LogEntry      |
                       |-------------------|
                       | - timestamp (idx) |
                       | - level (enum)    |
                       +-------------------+
```

### 2.1 Collection Schemas & Indexes

| Collection | Schema File | Key Indexes & Constraints | Key Relations / Subdocuments |
| :--- | :--- | :--- | :--- |
| `projects` | `src/models/Project.ts` | `slug` (Unique, Lowercase)<br>`timestamps: true` | `skills`: `Types.ObjectId[]` referencing `Skill`<br>`contributors`: subdocuments<br>`versions`: subdocuments |
| `skills` | `src/models/Skill.ts` | `name` (Unique, Trimmed)<br>`type` enum (`tool`, `language`, `framework`)<br>`timestamps: true` | Referenced by `Project` and `Experience` |
| `certificates` | `src/models/Certificate.ts` | `timestamps: true`<br>Case-insensitive title uniqueness enforced in controller | Self-contained |
| `achievements` | `src/models/Achievement.ts` | `timestamps: true`<br>Case-insensitive title uniqueness enforced in controller | Self-contained |
| `experiences` | `src/models/Experience.ts` | `tag` enum (`focus`, `extracurricular`)<br>`type` enum (`internship`, `contract`, `freelance`, `full_time`, `part_time`, `club`, `volunteering`)<br>`timestamps: true` | `skills`: `Types.ObjectId[]` referencing `Skill`<br>`positions`: subdocuments |
| `siteconfigs` | `src/models/SiteConfig.ts` | Singleton document model<br>`timestamps: true` | `pfpHistory`: subdocuments array (`IPfpItem[]`) |
| `logentries` | `src/models/LogEntry.ts` | `timestamp` (Indexed, Descending)<br>`level` enum (`INFO`, `WARN`, `ERROR`)<br>`timestamps: false` | Self-contained (writes raw request metadata and stack traces) |

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
  - `?tag=<tag>` $\rightarrow$ `filter.tags = tag.toLowerCase().trim()`
- **Sorting:** Featured projects first (`featured: -1`), then newest start date (`startDate: -1`).
- **Read Mode:** `.lean()` (returns plain JS objects for optimal memory/speed).

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

#### `POST /api/v1/projects`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** `image`, `videoDemo`, `threeDModel`
- **Target Model:** `Project`
- **DB Operation:** `Project.create({...})`
- **Key Fields Processed:**
  - `slug`: Extracted from body or auto-derived from `title.toLowerCase().replace(/[^a-z0-9]+/g, "-")`.
  - `skills`: Stringified array or JSON parsed into `Types.ObjectId[]`.
  - `tags`: Normalized to lowercase trimmed strings.
  - `status`: Default `"planning"`.
- **DB Error Handling:** Duplicate slug triggers Mongo Error 11000 $\rightarrow$ translated to `409 Conflict`.

#### `PUT /api/v1/projects/:id`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.id)`.
- **Target Model:** `Project`
- **DB Operation:** `Project.findByIdAndUpdate(id, updatePayload, { new: true, runValidators: true })`
- **Behavior:** Updates provided fields (including nested objects such as `threeDModel`, `contributors`, `socialLinks`, and `skills`). Returns updated document.

#### `DELETE /api/v1/projects/:id`
- **Scope:** Protected (`authMiddleware`)
- **Validation:** Verifies `Types.ObjectId.isValid(req.params.id)`.
- **Target Model:** `Project`
- **DB Operation:** `Project.findByIdAndDelete(id)`
- **Returns:** `200 OK` on success, `404 Not Found` if the document does not exist.

#### `POST /api/v1/projects/:slug/versions`
- **Scope:** Protected (`authMiddleware`)
- **Multipart Uploads:** Version-specific assets (`image`, `videoDemo`, `threeDModel`).
- **Target Model:** `Project`
- **DB Operations (Two-step):**
  1. `const project = await Project.findOne({ slug })`
  2. If `isLatest === true`, resets existing versions: `project.versions.forEach(v => v.isLatest = false)`
  3. `project.versions.push(newVersion)`
  4. `await project.save()`
- **Returns:** Updated project document with newly appended version history entry.

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

---

## 6. Summary Matrix

| Method | Route | Auth | Target Model | DB Methods / Actions | Filter / Key Parameters |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ALL` | *All Endpoints* | Public / Admin | `LogEntry` | `create()` | Logs request time, level, method, endpoint, status, IP, and duration |
| `GET` | `/health` | Public | None | Connection readyState check | None |
| `GET` | `/api/v1/health` | Public | None | Connection readyState check | None |
| `GET` | `/api/v1/projects` | Public | `Project` | `find().sort().lean()` | `status != invisible`, `category`, `featured`, `tag` |
| `GET` | `/api/v1/projects/categories` | Public | `Project` | `distinct()` | Categories where `status != invisible` |
| `GET` | `/api/v1/projects/:slug` | Public* | `Project` | `findOne().lean()` | By `slug`; rejects `invisible` if not admin |
| `POST` | `/api/v1/projects` | Admin | `Project` | `create()` | Creates project, normalizes tags/skills, verifies unique slug |
| `PUT` | `/api/v1/projects/:id` | Admin | `Project` | `findByIdAndUpdate()` | Partial update by `_id`, runs validators |
| `DELETE` | `/api/v1/projects/:id` | Admin | `Project` | `findByIdAndDelete()` | Removes project by `_id` |
| `POST` | `/api/v1/projects/:slug/versions` | Admin | `Project` | `findOne()` $\rightarrow$ `save()` | Appends version; resets `isLatest` if new is latest |
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
