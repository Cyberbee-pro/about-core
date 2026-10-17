# about-core API and Frontend Handoff Specification

This document serves as the authoritative, comprehensive API reference for developers building or maintaining the portfolio's public viewer (web/Android) and administrative frontends against `about-core`. It reflects the full implemented backend surface including all routes, parameters, data models, file uploads, authentication rules, and error behaviors.

---

## 1. Architecture & Service Overview

`about-core` is an Express + strict TypeScript REST API backed by MongoDB/Mongoose and Cloudinary. It provides portfolio content and configuration to client applications, accepts authenticated administrative mutations, handles multi-format file uploads (images, videos, and raw 3D models), and records request telemetry in MongoDB.

### High-Level Request Pipeline

```
HTTP Request
  │
  ▼
[cors() - Dynamic Multi-Origin Validator from CLIENT_ORIGIN]
  │
  ▼
[express.json() & express.urlencoded()]
  │
  ▼
[express.static('public')]  ──► Evangelion / MAGI Dashboard (GET /, GET /index.html)
  │
  ▼
[dbLoggerMiddleware]        ──► Intercepts all requests, persists metadata to LogEntry
  │
  ▼
[Routing Layer]             ──► /health, /api/v1/*
  │
  ├── [authMiddleware]       ──► Protected routes verify ADMIN_SECRET
  ├── [uploadMiddleware]     ──► Multer memory storage + Cloudinary upload streaming
  └── [Controllers]          ──► Mongoose queries & business logic
  │
  ▼
[notFoundMiddleware (404)]  ──► Unmatched endpoints
  │
  ▼
[errorMiddleware (500/400/403/409)] ──► Centralized error, CORS, CastError, and Duplicate Key handling
```

---

## 2. Base URL & Common Conventions

- **Base URL**: Deploy domain origin followed by `/api/v1` (e.g., `https://api.yourdomain.com/api/v1` or `http://localhost:5000/api/v1`).
- **CORS & Allowed Origins**:
  - Validated via a dynamic validator function. Requests without an `Origin` header (such as curl, mobile apps, Postman, or server-to-server) are allowed.
  - Allowed origins are parsed from the `CLIENT_ORIGIN` environment variable (comma-separated, e.g., `http://localhost:3000,https://core.shibraj.dev,https://client.shibraj.dev,https://shibraj.dev`).
  - Defaults to `["https://core.shibraj.dev", "https://client.shibraj.dev", "https://shibraj.dev", "http://localhost:3000"]` if `CLIENT_ORIGIN` is not configured.
  - Wildcard `*` in `CLIENT_ORIGIN` dynamically reflects the requesting origin with credentials enabled.
  - Trailing slashes in origins are normalized automatically.
  - **Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
  - **Allowed Headers**: `Content-Type`, `Authorization`, `x-admin-token`.
  - **Credentials**: `true` (`Access-Control-Allow-Credentials: true`).
  - **Rejected Origins**: Return HTTP `403 Forbidden` with `{ "success": false, "message": "Not allowed by CORS" }`.
- **Response Format**: All responses are JSON.
  - **Success (Single Resource)**:
    ```json
    { "success": true, "data": { ... } }
    ```
  - **Success (List / Collection)**:
    ```json
    { "success": true, "count": 2, "data": [ ... ] }
    ```
  - **Success with Mutation Message**:
    ```json
    { "success": true, "message": "...", "data": { ... } }
    ```
  - **Paginated Collection** (e.g., Logs):
    ```json
    { "success": true, "count": 50, "total": 120, "page": 1, "totalPages": 3, "data": [ ... ] }
    ```
  - **Error Response**:
    ```json
    { "success": false, "message": "Descriptive error message", "errors": { ... } }
    ```
- **Identifiers**: Resources are identified by MongoDB `ObjectId` (24 hex characters) or unique URL-safe `slug` strings (for projects) and lowercase strings (for experience organizations).
- **Date Format**: ISO 8601 strings (e.g., `"2026-10-17T09:42:00.000Z"`).

---

## 3. Complete Endpoint Reference Table

| Method | Path | Access | Content-Type | Summary / Description |
| :--- | :--- | :--- | :--- | :--- |
| **Health & Dashboard** | | | | |
| `GET` | `/` or `/index.html` | Public | `text/html` | Evangelion / MAGI System (EVA-0) styled HTML Health Dashboard. |
| `GET` | `/health` | Public | `application/json` | Basic service liveness check (`status`, `uptime`, `timestamp`). |
| `GET` | `/api/v1/health` | Public | `application/json` | Pure JSON service telemetry: DB state, heap memory, version, and env. |
| **Projects** | | | | |
| `GET` | `/api/v1/projects` | Public | `application/json` | List visible projects (`status != 'invisible'`). Supports category, featured, and tag filters. |
| `GET` | `/api/v1/projects/categories` | Public | `application/json` | Distinct categories across all visible projects. |
| `GET` | `/api/v1/projects/:slug` | Public* | `application/json` | Get single project by slug. Invisible items return 404 unless admin authenticated. |
| `POST` | `/api/v1/projects` | Admin | JSON / Multipart | Create a new project. Accepts file uploads for `image`, `videoDemo`, and `threeDModel`. |
| `PUT` | `/api/v1/projects/:id` | Admin | JSON / Multipart | Update project fields by MongoDB ObjectId. Accepts file uploads. |
| `DELETE` | `/api/v1/projects/:id` | Admin | `application/json` | Delete project by MongoDB ObjectId. |
| `POST` | `/api/v1/projects/:slug/versions` | Admin | JSON / Multipart | Append a version release to a project found by slug. Accepts file uploads. |
| **Skills** | | | | |
| `GET` | `/api/v1/skills` | Public | `application/json` | List all skills sorted by `{ weight: 1, name: 1 }`. |
| `GET` | `/api/v1/skills/:id` | Public | `application/json` | Get single skill by MongoDB ObjectId. |
| `POST` | `/api/v1/skills` | Admin | JSON / Multipart | Create a skill. Accepts image upload on `logoUrl`. Unique name. |
| `PUT` | `/api/v1/skills/:id` | Admin | JSON / Multipart | Update skill by MongoDB ObjectId. Accepts image upload on `logoUrl`. |
| `DELETE` | `/api/v1/skills/:id` | Admin | `application/json` | Delete skill by MongoDB ObjectId. |
| **Certificates** | | | | |
| `GET` | `/api/v1/certificates` | Public | `application/json` | List all certificates sorted by `{ weight: 1, title: 1 }`. |
| `GET` | `/api/v1/certificates/:id` | Public | `application/json` | Get single certificate by MongoDB ObjectId. |
| `POST` | `/api/v1/certificates` | Admin | JSON / Multipart | Create a certificate. Accepts media upload on `mediaUrl`. Unique title. |
| `PUT` | `/api/v1/certificates/:id` | Admin | JSON / Multipart | Update certificate by MongoDB ObjectId. Accepts media upload on `mediaUrl`. |
| `DELETE` | `/api/v1/certificates/:id` | Admin | `application/json` | Delete certificate by MongoDB ObjectId. |
| **Achievements** | | | | |
| `GET` | `/api/v1/achievements` | Public | `application/json` | List all achievements sorted by `{ weight: 1, title: 1 }`. |
| `GET` | `/api/v1/achievements/:id` | Public | `application/json` | Get single achievement by MongoDB ObjectId. |
| `POST` | `/api/v1/achievements` | Admin | `application/json` | Create an achievement. Unique title. |
| `PUT` | `/api/v1/achievements/:id` | Admin | `application/json` | Update achievement by MongoDB ObjectId. |
| `DELETE` | `/api/v1/achievements/:id` | Admin | `application/json` | Delete achievement by MongoDB ObjectId. |
| **Experiences** | | | | |
| `GET` | `/api/v1/experiences` | Public | `application/json` | List all experience organizations sorted by `{ weight: 1, organization: 1 }`. |
| `GET` | `/api/v1/experiences/:id` | Public | `application/json` | Get single experience by MongoDB ObjectId. |
| `POST` | `/api/v1/experiences` | Admin | JSON / Multipart | Create an experience organization. Accepts uploads for `iconUrl`, `mediaUrls`, `certificateUrls`. |
| `POST` | `/api/v1/experiences/:organization/positions` | Admin | JSON / Multipart | Append a promotion/role position to an organization. Supports file uploads and single-truth `isCurrent`. |
| `PUT` | `/api/v1/experiences/:id` | Admin | JSON / Multipart | Update experience by MongoDB ObjectId. Accepts uploads. |
| `DELETE` | `/api/v1/experiences/:id` | Admin | `application/json` | Delete experience by MongoDB ObjectId. |
| **Site Configuration** | | | | |
| `GET` | `/api/v1/config` | Public | `application/json` | Get global site config (name, profile picture, history, job titles, bio, resume). |
| `POST` | `/api/v1/config` | Admin | JSON / Multipart | Create initial site config. Accepts image upload on `pfp`, `pfpUrl`, or `image`. |
| `PUT` | `/api/v1/config` | Admin | JSON / Multipart | Update or upsert site config. Handles new avatar uploads (appends to history) or reusing historical avatars. |
| **Admin Request Logs** | | | | |
| `GET` | `/api/v1/admin/logs` | Admin | `application/json` | Query and filter persisted HTTP request logs with date/level filters and pagination. |

---

## 4. Detailed API Specifications by Resource

### 4.1 Health & Dashboard

#### `GET /` and `GET /index.html`
- **Access**: Public
- **Description**: Serves static HTML Evangelion MAGI system dashboard directly from `public/index.html`.

#### `GET /health`
- **Access**: Public
- **Response**: `200 OK`
```json
{
  "status": "healthy",
  "uptime": 124.52,
  "timestamp": "2026-10-17T09:42:00.000Z"
}
```

#### `GET /api/v1/health`
- **Access**: Public
- **Response**: `200 OK`
```json
{
  "status": "healthy",
  "service": "about-core",
  "version": "1.0.0",
  "timestamp": "2026-10-17T09:42:00.000Z",
  "dbStatus": "connected",
  "memoryUsageMB": 38,
  "nodeVersion": "v20.18.0",
  "env": "production"
}
```

---

### 4.2 Projects (`/api/v1/projects`)

#### `GET /api/v1/projects`
- **Access**: Public
- **Query Parameters**:
  - `category` (optional, string): Case-insensitive exact match.
  - `featured` (optional, `"true"` | `"false"`): Strict boolean comparison (`true` matches only `"true"`).
  - `tag` (optional, string): Case-insensitive match against elements in `tags`.
- **Sorting**: Featured items first (`featured: -1`), then newest start date descending (`startDate: -1`).
- **Behavior**: Excludes all projects where `status == "invisible"`.
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "670fa123456789abcdef0001",
      "title": "Portfolio Core",
      "slug": "portfolio-core",
      "category": "backend",
      "description": "Headless portfolio CMS API",
      "featured": true,
      "tags": ["express", "typescript", "mongodb"],
      "skills": ["670fa123456789abcdef0010"],
      "startDate": "2026-01-01T00:00:00.000Z",
      "status": "active",
      "image": "https://res.cloudinary.com/.../image_1.jpg",
      "videoDemo": "https://res.cloudinary.com/.../video_1.mp4",
      "contributors": [
        {
          "name": "Cyberbee",
          "profilePicUrl": "https://res.cloudinary.com/.../pfp.jpg",
          "profileLink": "https://github.com/cyberbee"
        }
      ],
      "socialLinks": [
        { "platform": "GitHub", "url": "https://github.com/cyberbee/about-core" }
      ],
      "threeDModel": {
        "fileUrl": "https://res.cloudinary.com/.../model_1.glb",
        "initialRotation": [0, 0, 0],
        "enableExplodedView": false
      },
      "versions": [],
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `GET /api/v1/projects/categories`
- **Access**: Public
- **Description**: Returns all distinct category names among visible projects.
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 3,
  "data": ["backend", "frontend", "mobile"]
}
```

#### `GET /api/v1/projects/:slug`
- **Access**: Public (with admin bypass)
- **Path Parameters**: `:slug` (string, case-insensitive)
- **Auth Bypass**: If project has `status: "invisible"`:
  - Calling without admin auth returns `404 Not Found`.
  - Calling with valid `Authorization: Bearer <ADMIN_SECRET>` or `x-admin-token: <ADMIN_SECRET>` returns `200 OK` with the project document.
- **Response**: `200 OK` `{ "success": true, "data": { ...project } }`

#### `POST /api/v1/projects`
- **Access**: Admin (Requires `ADMIN_SECRET`)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**:
  - `image` (max 1 file, image MIME): Uploaded to `portfolio/projects/<slug>/images/<slug>_<n>`
  - `videoDemo` (max 1 file, video MIME): Uploaded to `portfolio/projects/<slug>/videos/<slug>_<n>`
  - `threeDModel` (max 1 file, `.glb`/`.gltf`/octet-stream): Uploaded to `portfolio/projects/<slug>/models/<slug>_<n>`
- **Fields**:
  - `title` (required, string)
  - `category` (required, string)
  - `description` (required, string)
  - `image` (required, string URL or file upload)
  - `slug` (optional string; auto-derived from `title` if omitted)
  - `featured` (optional boolean, default `false`)
  - `status` (optional enum: `"invisible"` | `"planning"` | `"work_in_progress"` | `"delay_hold"` | `"active"`, default `"planning"`)
  - `startDate` (optional Date/ISO string, default `Date.now()`)
  - `endDate` (optional Date/ISO string)
  - `tags` (optional string array, JSON string array, or comma-separated string)
  - `skills` (optional array of `Skill` ObjectIds, JSON array string, or comma-separated string)
  - `contributors` (optional array of `{ name, profilePicUrl, profileLink? }`, JSON string in multipart)
  - `socialLinks` (optional array of `{ platform, url }`, JSON string in multipart)
  - `videoDemo` (optional string URL or file upload)
  - `deployedLink` (optional string URL)
  - `githubLink` (optional string URL)
  - `threeDModel` (optional object `{ fileUrl, initialRotation: [x,y,z], enableExplodedView }`, JSON string in multipart, or file upload)
  - `versions` (optional array of `IProjectVersion`, JSON string in multipart)
- **Response**: `201 Created`
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": { ...createdProject }
}
```

#### `PUT /api/v1/projects/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Upload Fields**: `image`, `videoDemo`, `threeDModel`
- **Behavior**: Partial update of supplied fields. Empty string for `endDate` clears the date.
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Project updated successfully",
  "data": { ...updatedProject }
}
```

#### `DELETE /api/v1/projects/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

#### `POST /api/v1/projects/:slug/versions`
- **Access**: Admin
- **Path Parameters**: `:slug` (string)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**: `image`, `videoDemo`, `threeDModel`
- **Folder Structure**: `portfolio/projects/<slug>/<sanitized-version-tag>/[images|videos|models]/`
- **Body Fields**:
  - `versionTag` (required, string, e.g. `"v1.2.0"`)
  - `releaseDate` (optional Date/ISO string, default `Date.now()`)
  - `changelog` (optional string array, default `[]`)
  - `image` (optional string URL or file upload)
  - `videoDemo` (optional string URL or file upload)
  - `demoUrl` (optional string URL)
  - `threeDFileUrl` (optional string URL or file upload on `threeDModel`)
  - `isLatest` (optional boolean, default `false`)
- **Single-Truth**: If `isLatest` is `true`, all previous versions in this project are automatically updated to `isLatest: false`.
- **Response**: `201 Created`
```json
{
  "success": true,
  "message": "Version added successfully",
  "data": { ...updatedProject }
}
```

---

### 4.3 Skills (`/api/v1/skills`)

#### `GET /api/v1/skills`
- **Access**: Public
- **Sorting**: `{ weight: 1, name: 1 }`
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "670fa123456789abcdef0010",
      "name": "TypeScript",
      "logoUrl": "https://res.cloudinary.com/.../typescript.jpg",
      "featured": true,
      "weight": 1,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `GET /api/v1/skills/:id`
- **Access**: Public
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "data": { ...skill } }`

#### `POST /api/v1/skills`
- **Access**: Admin
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Field**: `logoUrl` (max 1 file)
  - Streamed to `portfolio/skills/<derived-skill-name>/<derived-skill-name>`
- **Fields**:
  - `name` (required, string, trimmed; unique case-insensitive)
  - `logoUrl` (string URL or file upload)
  - `featured` (optional boolean, default `false`)
  - `weight` (optional number, default `0`)
- **Response**: `201 Created` `{ "success": true, "data": { ...createdSkill } }`
- **Errors**: `400` if name missing; `409` if duplicate name exists.

#### `PUT /api/v1/skills/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Field**: `logoUrl`
- **Fields**: Partial update of `name`, `logoUrl`, `featured`, `weight`. Unique name check excludes current `:id`.
- **Response**: `200 OK` `{ "success": true, "data": { ...updatedSkill } }`

#### `DELETE /api/v1/skills/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "message": "Skill deleted successfully" }`

---

### 4.4 Certificates (`/api/v1/certificates`)

#### `GET /api/v1/certificates`
- **Access**: Public
- **Sorting**: `{ weight: 1, title: 1 }`
- **Response**: `200 OK` `{ "success": true, "count": 1, "data": [ ...certificates ] }`

#### `GET /api/v1/certificates/:id`
- **Access**: Public
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "data": { ...certificate } }`

#### `POST /api/v1/certificates`
- **Access**: Admin
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Field**: `mediaUrl` (max 1 file)
  - Streamed to `portfolio/certificate/<org>_<title>_<year>`
- **Fields**:
  - `title` (required, string, trimmed; unique case-insensitive)
  - `description` (optional string, default `""`)
  - `organization` (required, string, trimmed)
  - `mediaUrl` (string URL or file upload)
  - `link` (optional string URL)
  - `weight` (optional number, default `0`)
- **Response**: `201 Created` `{ "success": true, "data": { ...createdCert } }`
- **Errors**: `400` if title missing; `409` if duplicate title exists.

#### `PUT /api/v1/certificates/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Field**: `mediaUrl`
- **Fields**: Partial update of `title`, `description`, `organization`, `mediaUrl`, `link`, `weight`.
- **Response**: `200 OK` `{ "success": true, "data": { ...updatedCert } }`

#### `DELETE /api/v1/certificates/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "message": "Certificate deleted successfully" }`

---

### 4.5 Achievements (`/api/v1/achievements`)

#### `GET /api/v1/achievements`
- **Access**: Public
- **Sorting**: `{ weight: 1, title: 1 }`
- **Response**: `200 OK` `{ "success": true, "count": 1, "data": [ ...achievements ] }`

#### `GET /api/v1/achievements/:id`
- **Access**: Public
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "data": { ...achievement } }`

#### `POST /api/v1/achievements`
- **Access**: Admin
- **Content-Type**: `application/json`
- **Fields**:
  - `title` (required, string, trimmed; unique case-insensitive)
  - `detail` (required, string)
  - `date` (required, string, e.g. `"October 2024"`)
  - `weight` (optional number, default `0`)
- **Response**: `201 Created` `{ "success": true, "data": { ...createdAchievement } }`

#### `PUT /api/v1/achievements/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Content-Type**: `application/json`
- **Fields**: Partial update of `title`, `detail`, `date`, `weight`.
- **Response**: `200 OK` `{ "success": true, "data": { ...updatedAchievement } }`

#### `DELETE /api/v1/achievements/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "message": "Achievement deleted successfully" }`

---

### 4.6 Experiences (`/api/v1/experiences`)

#### `GET /api/v1/experiences`
- **Access**: Public
- **Sorting**: `{ weight: 1, organization: 1 }`
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "670fa123456789abcdef0020",
      "organization": "Google Developer Student Clubs",
      "tag": "focus",
      "type": "club",
      "iconUrl": "https://res.cloudinary.com/.../experience_icon.jpg",
      "skills": ["670fa123456789abcdef0010"],
      "weight": 1,
      "positions": [
        {
          "_id": "670fa123456789abcdef0021",
          "position": "Tech Lead",
          "description": "Leading technical workshops and projects",
          "startDate": "2025-08-01T00:00:00.000Z",
          "isCurrent": true,
          "mediaUrls": ["https://res.cloudinary.com/.../experience_media_1.jpg"],
          "certificateUrls": []
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `GET /api/v1/experiences/:id`
- **Access**: Public
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "data": { ...experience } }`

#### `POST /api/v1/experiences`
- **Access**: Admin
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**:
  - `iconUrl` (max 1 file) ──► `portfolio/experiences/<tag>/<orgSlug>/icons/experience_icon`
  - `mediaUrls` (max 10 files) ──► `portfolio/experiences/<tag>/<orgSlug>/media/experience_media_<n>`
  - `certificateUrls` (max 10 files) ──► `portfolio/experiences/<tag>/<orgSlug>/certificates/experience_certificate_<n>`
- **Fields**:
  - `organization` (required, string, trimmed; unique case-insensitive)
  - `tag` (required enum: `"focus"` | `"extracurricular"`, default `"focus"`)
  - `type` (required enum: `"internship"` | `"contract"` | `"freelance"` | `"full_time"` | `"part_time"` | `"club"` | `"volunteering"`, default `"full_time"`)
  - `iconUrl` (string URL or file upload)
  - `skills` (optional array of `Skill` ObjectIds, JSON string array, or comma-separated string)
  - `weight` (optional number, default `0`)
  - `positions` (optional array of `IExperiencePosition`, JSON string in multipart):
    - `position` (required string)
    - `description` (required string)
    - `startDate` (required Date/ISO string)
    - `endDate` (optional Date/ISO string)
    - `isCurrent` (boolean, default `false`)
    - `mediaUrls` (optional string array)
    - `certificateUrls` (optional string array)
  - *Note*: Uploaded `mediaUrls` and `certificateUrls` attach to `positions[0]`, or automatically construct an initial position if none is provided.
- **Response**: `201 Created` `{ "success": true, "data": { ...createdExperience } }`

#### `POST /api/v1/experiences/:organization/positions`
- **Access**: Admin
- **Path Parameters**: `:organization` (case-insensitive string matching organization name, URL decoded)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**: `mediaUrls` (max 10), `certificateUrls` (max 10)
- **Position Payload**: Accepts `req.body.position` (object or JSON string) or flat top-level properties:
  - `position` (or `title` / `positionTag`): string (required, default `"Role"`)
  - `description`: string (default `""`)
  - `startDate`: Date/ISO string (default `Date.now()`)
  - `endDate`: optional Date/ISO string
  - `isCurrent`: boolean (default `false`)
  - `mediaUrls`: string array (plus any uploaded `mediaUrls` files)
  - `certificateUrls`: string array (plus any uploaded `certificateUrls` files)
- **Active Role Single-Truth**: When `isCurrent` is `true`, all existing positions in this organization are automatically set to `isCurrent: false`.
- **Behavior**: Appends the new position using `$push` without overwriting historical positions.
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Position added successfully",
  "data": { ...updatedExperience }
}
```
- **Errors**: `404 Not Found` if organization does not exist.

#### `PUT /api/v1/experiences/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Content-Type**: `application/json` or `multipart/form-data`
- **Upload Fields**: `iconUrl`, `mediaUrls`, `certificateUrls`
- **Fields**: Partial update of `organization`, `tag`, `type`, `iconUrl`, `skills`, `weight`, `positions`.
- **Response**: `200 OK` `{ "success": true, "data": { ...updatedExperience } }`

#### `DELETE /api/v1/experiences/:id`
- **Access**: Admin
- **Path Parameters**: `:id` (MongoDB ObjectId)
- **Response**: `200 OK` `{ "success": true, "message": "Experience deleted successfully" }`

---

### 4.7 Site Configuration (`/api/v1/config`)

#### `GET /api/v1/config`
- **Access**: Public
- **Behavior**: Fetches the global configuration document.
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "670fa123456789abcdef0030",
    "name": "Cyberbee",
    "pfpUrl": "https://res.cloudinary.com/.../pfp_1729000000000.jpg",
    "pfpPublicId": "portfolio/site_config/pfp_1729000000000",
    "pfpHistory": [
      {
        "url": "https://res.cloudinary.com/.../pfp_1729000000000.jpg",
        "publicId": "portfolio/site_config/pfp_1729000000000",
        "uploadedAt": "2026-10-17T09:42:00.000Z"
      }
    ],
    "jobTitles": ["Full Stack Engineer", "Systems Architect"],
    "resumeDriveUrl": "https://drive.google.com/file/d/.../view",
    "statusMessage": "Building next-gen systems",
    "bioSummary": "Software engineer passionate about scalable architectures and 3D web experiences.",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-10-17T09:42:00.000Z"
  }
}
```
- **Uninitialized State**: Returns `404 Not Found` with `{ "success": false, "message": "Site configuration not found" }` if no config has been created yet.

#### `POST /api/v1/config`
- **Access**: Admin
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**: `pfp`, `pfpUrl`, or `image` (max 1 file)
  - Streamed to `portfolio/site_config/pfp_<timestamp>`
- **Fields**:
  - `name` (required, string, trimmed)
  - `jobTitles` (required, string array, JSON array string, or comma-separated string; min 1 item)
  - `resumeDriveUrl` (required, string, trimmed)
  - `statusMessage` (required, string, trimmed)
  - `bioSummary` (required, string, trimmed)
  - `pfpUrl` and `pfpPublicId`: Optional strings; if provided directly without file upload, both must be supplied together.
- **Behavior**:
  - Rejects with `409 Conflict` if site configuration already exists (advises using `PUT`).
  - If a profile picture is supplied, initializes `pfpHistory` with `[{ url, publicId, uploadedAt }]`.
- **Response**: `201 Created`
```json
{
  "success": true,
  "message": "Site configuration created successfully",
  "data": { ...createdConfig }
}
```

#### `PUT /api/v1/config`
- **Access**: Admin
- **Content-Type**: `application/json` or `multipart/form-data`
- **Multipart Upload Fields**: `pfp`, `pfpUrl`, or `image` (max 1 file)
- **Fields**:
  - `name` (required, string, trimmed)
  - `jobTitles` (required, string array, JSON array string, or comma-separated string; min 1 item)
  - `resumeDriveUrl` (required, string, trimmed)
  - `statusMessage` (required, string, trimmed)
  - `bioSummary` (required, string, trimmed)
- **Profile Picture Workflows**:
  - **Option 1: Upload New Avatar** (Multipart):
    - Upload on `pfp`, `pfpUrl`, or `image`.
    - Uploaded to `portfolio/site_config/pfp_<timestamp>`.
    - Automatically prepends the new avatar item to `pfpHistory` at index 0 (`$position: 0`).
    - Updates active `pfpUrl` and `pfpPublicId`.
  - **Option 2: Revert to / Select Historical Avatar** (JSON or Multipart without file):
    - Supply `pfpPublicId` (and optionally `pfpUrl`) matching an entry in `pfpHistory`.
    - The server validates against existing `pfpHistory`.
    - Updates active `pfpUrl` and `pfpPublicId` without duplicating history entries.
  - **Option 3: Retain Current Avatar**:
    - Omit file and avatar fields; current avatar is preserved.
- **Response**: `200 OK`
```json
{
  "success": true,
  "message": "Site configuration updated successfully",
  "data": { ...updatedConfig }
}
```

---

### 4.8 Admin Request Logs (`/api/v1/admin/logs`)

#### `GET /api/v1/admin/logs`
- **Access**: Admin
- **Query Parameters**:
  - `date` (optional, `"YYYY-MM-DD"`): Exact UTC day range filter (`00:00:00.000` to `23:59:59.999`).
  - `month` (optional, `"YYYY-MM"`): UTC month range filter (`date` takes precedence).
  - `year` (optional, `"YYYY"`): UTC full year range filter (`month` takes precedence).
  - `level` (optional, `"INFO"` | `"WARN"` | `"ERROR"`):
    - `INFO`: 2xx and 3xx responses
    - `WARN`: 4xx responses
    - `ERROR`: 5xx responses
  - `page` (optional number, default `1`): 1-indexed page.
  - `limit` (optional number, default `50`, clamped `1..500`).
- **Sorting**: Newest first (`timestamp: -1`).
- **Response**: `200 OK`
```json
{
  "success": true,
  "count": 50,
  "total": 120,
  "page": 1,
  "totalPages": 3,
  "data": [
    {
      "_id": "670fa123456789abcdef0090",
      "timestamp": "2026-10-17T09:42:00.000Z",
      "level": "INFO",
      "method": "GET",
      "endpoint": "/api/v1/projects",
      "statusCode": 200,
      "ip": "::1",
      "message": "GET /api/v1/projects 200 - 15ms",
      "metadata": {},
      "stack": null
    }
  ]
}
```

---

## 5. Authentication

All admin endpoints (mutations and log queries) are protected by a shared static secret:

```http
Authorization: Bearer <ADMIN_SECRET>
```
or
```http
x-admin-token: <ADMIN_SECRET>
```

### Security Rules
- If `ADMIN_SECRET` is not set on the server, protected routes return `500 Internal Server Error`.
- Requests missing or supplying an invalid secret return `401 Unauthorized` with `{ "success": false, "message": "Unauthorized: Invalid or missing admin credentials" }`.
- The `GET /api/v1/projects/:slug` endpoint is accessible publicly, but will dynamically check for admin credentials. If valid credentials are supplied, it allows viewing `invisible` draft projects.
- **Frontend Security**: Never bundle `ADMIN_SECRET` in client-facing viewer code or public environment variables. Only the administrative dashboard may supply this token.

---

## 6. Media Uploads & Cloudinary Directory Structure

All media uploads are buffered in memory (100 MB file size limit) via Multer, validated for MIME types/extensions, and uploaded to Cloudinary:

- **Allowed Images**: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`.
- **Allowed Videos**: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`.
- **Allowed 3D Models**: Extension `.glb` or `.gltf`, MIME `model/gltf-binary`, `model/gltf+json`, `application/octet-stream`.

### Cloudinary Folder Mapping

| Resource / Route | Multipart Field(s) | Destination Cloudinary Folder | Public ID Format |
| :--- | :--- | :--- | :--- |
| **Projects** | `image` | `portfolio/projects/<slug>/images` | `<slug>_<n>` (e.g., `portfolio-core_1`) |
| | `videoDemo` | `portfolio/projects/<slug>/videos` | `<slug>_<n>` |
| | `threeDModel` | `portfolio/projects/<slug>/models` | `<slug>_<n>` |
| **Project Versions** | `image`, `videoDemo`, `threeDModel` | `portfolio/projects/<slug>/<sanitizedVersionTag>/[images\|videos\|models]` | `<slug>_<n>` |
| **Skills** | `logoUrl` | `portfolio/skills/<derivedSkillName>` | `<derivedSkillName>` |
| **Certificates** | `mediaUrl` | `portfolio/certificate` | `<org>_<title>_<year>` |
| **Experiences** | `iconUrl` | `portfolio/experiences/<tag>/<orgSlug>/icons` | `experience_icon` |
| | `mediaUrls` | `portfolio/experiences/<tag>/<orgSlug>/media` | `experience_media_<n>` |
| | `certificateUrls` | `portfolio/experiences/<tag>/<orgSlug>/certificates` | `experience_certificate_<n>` |
| **Site Config** | `pfp`, `pfpUrl`, `image` | `portfolio/site_config` | `pfp_<timestamp>` |

- **Sequential Naming**: Assets using `<base>_<n>` query existing files via the Cloudinary Search API and pick `<base>_<max+1>` (cached per request). If the Search API is unavailable, it falls back to timestamp-based naming (`<base>_<timestamp>`).

---

## 7. Data Models & TypeScript Types

### 7.1 Project (`Project`)
```ts
export type ProjectStatus = "invisible" | "planning" | "work_in_progress" | "delay_hold" | "active";

export interface IContributor {
  name: string;
  profilePicUrl: string;
  profileLink?: string;
}

export interface ISocialLink {
  platform: string;
  url: string;
}

export interface IProjectVersion {
  versionTag: string;
  releaseDate: Date;
  changelog: string[];
  image?: string;
  videoDemo?: string;
  demoUrl?: string;
  threeDFileUrl?: string;
  isLatest: boolean;
}

export interface IProject {
  _id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  featured: boolean;
  tags: string[];
  skills: string[]; // ObjectId ref to Skill
  startDate: Date;
  endDate?: Date;
  contributors: IContributor[];
  status: ProjectStatus;
  image: string;
  videoDemo?: string;
  socialLinks: ISocialLink[];
  threeDModel?: {
    fileUrl: string;
    initialRotation?: [number, number, number];
    enableExplodedView: boolean;
  };
  deployedLink?: string;
  githubLink?: string;
  versions: IProjectVersion[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.2 Skill (`Skill`)
```ts
export interface ISkill {
  _id: string;
  name: string;
  logoUrl: string;
  featured: boolean;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.3 Certificate (`Certificate`)
```ts
export interface ICertificate {
  _id: string;
  title: string;
  description: string;
  link?: string;
  mediaUrl: string;
  organization: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.4 Achievement (`Achievement`)
```ts
export interface IAchievement {
  _id: string;
  title: string;
  date: string; // e.g. "Month Year"
  detail: string;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.5 Experience (`Experience`)
```ts
export type ExperienceTag = "focus" | "extracurricular";
export type ExperienceType =
  | "internship"
  | "contract"
  | "freelance"
  | "full_time"
  | "part_time"
  | "club"
  | "volunteering";

export interface IExperiencePosition {
  _id?: string;
  position: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  mediaUrls?: string[];
  certificateUrls?: string[];
  isCurrent: boolean;
}

export interface IExperience {
  _id: string;
  organization: string;
  tag: ExperienceTag;
  type: ExperienceType;
  iconUrl: string;
  skills: string[]; // ObjectId ref to Skill
  weight: number;
  positions: IExperiencePosition[];
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.6 Site Configuration (`SiteConfig`)
```ts
export interface IPfpItem {
  url: string;
  publicId: string;
  uploadedAt: Date;
}

export interface ISiteConfig {
  _id: string;
  name: string;
  pfpUrl?: string;
  pfpPublicId?: string;
  pfpHistory: IPfpItem[];
  jobTitles: string[];
  resumeDriveUrl: string;
  statusMessage: string;
  bioSummary: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 7.7 Log Entry (`LogEntry`)
```ts
export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface ILogEntry {
  _id: string;
  timestamp: Date;
  level: LogLevel;
  method: string;
  endpoint: string;
  statusCode: number;
  ip: string;
  message: string;
  metadata?: Record<string, unknown>;
  stack?: string;
}
```

---

## 8. Errors & HTTP Status Codes

| Status Code | Meaning | Common Triggers |
| :--- | :--- | :--- |
| `200 OK` | Success | Successful read, update, or delete. |
| `201 Created` | Created | Successful project, skill, certificate, achievement, experience, version, or config creation. |
| `400 Bad Request` | Client Error | Missing required fields; malformed ObjectId format (`CastError`); invalid JSON; missing version tag; mismatched `pfpUrl` and `pfpPublicId`. |
| `401 Unauthorized` | Auth Failure | Missing or incorrect `ADMIN_SECRET` via `Authorization: Bearer` or `x-admin-token`. |
| `403 Forbidden` | Origin Forbidden | Request origin not allowed by CORS policy. |
| `404 Not Found` | Not Found | Route does not exist; resource ID does not exist; project slug not found; unauthenticated attempt to read an `invisible` project. |
| `409 Conflict` | Duplicate Key | Duplicate project slug; duplicate skill name; duplicate cert title; duplicate achievement title; duplicate experience organization; attempting to `POST /api/v1/config` when config already exists. |
| `500 Server Error` | Server Fault | Unconfigured `ADMIN_SECRET`; database connection failure; unhandled controller crash. |

---

## 9. Frontend Integration Guidance & Recipes

### 9.1 Public Viewer Client (Web / Android)

1. **Bootstrap**:
   - Call `GET /api/v1/config` to retrieve user name, avatar (`pfpUrl`), job titles, status message, and resume URL.
   - Call `GET /api/v1/health` if a connectivity/status banner is needed.
2. **Projects Grid & Filter**:
   - Fetch category tabs via `GET /api/v1/projects/categories`.
   - Fetch project cards via `GET /api/v1/projects`. Add query parameters (`?category=...&featured=true&tag=...`) based on user selection.
3. **Project Detail Page**:
   - Call `GET /api/v1/projects/:slug`.
   - Render 3D model using `threeDModel.fileUrl`, passing `initialRotation` and `enableExplodedView` to Three.js / `@react-three/fiber`.
   - Render version history list from `versions` array (sorted by `releaseDate` descending; highlight the item with `isLatest: true`).
4. **Skills & Badges**:
   - Call `GET /api/v1/skills` to populate the skills section or filter tags.
5. **Timeline / Experience**:
   - Call `GET /api/v1/experiences` to render career progression. Group roles by organization and sort nested `positions` by `startDate` descending.

### 9.2 Admin Dashboard

1. **Authentication Header**: Store `ADMIN_SECRET` in a secure session or storage outside of public code and include it on all mutation requests:
   ```ts
   const headers = {
     "Authorization": `Bearer ${adminSecret}`,
     "Accept": "application/json",
   };
   ```
2. **Submitting Multipart Data**:
   - When uploading files, do not manually specify `Content-Type: multipart/form-data`; let the browser or HTTP client supply the boundary.
   - Append simple fields as string scalars.
   - Stringify complex fields (arrays/objects like `tags`, `skills`, `contributors`, `socialLinks`, `positions`):
   ```ts
   const formData = new FormData();
   formData.append("title", "Next Gen UI");
   formData.append("category", "frontend");
   formData.append("description", "A modern dashboard");
   formData.append("tags", JSON.stringify(["react", "vite"]));
   formData.append("image", fileInput.files[0]);

   const res = await fetch(`${API_BASE}/projects`, {
     method: "POST",
     headers: { Authorization: `Bearer ${adminSecret}` },
     body: formData,
   });
   ```
3. **Site Config Management**:
   - To upload a new profile picture: send file in `pfp` or `image` field via `PUT /api/v1/config`.
   - To select an older profile picture from history: send JSON with `pfpPublicId` (and optionally `pfpUrl`) matching an entry in `pfpHistory`.
4. **Inspecting Server Logs**:
   - Paginate request logs with `GET /api/v1/admin/logs?page=1&limit=50`.
   - Filter errors using `?level=ERROR` or date ranges using `?date=2026-10-17`.
