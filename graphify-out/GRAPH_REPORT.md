# Graph Report - about-core  (2026-11-28)

## Corpus Check
- 83 files · ~110,520 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: .example 1, (none) 1)

## Summary
- 1014 nodes · 1669 edges · 68 communities (59 shown, 9 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dbe1a233`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- uploadMiddleware.ts
- projectController.ts
- Security Checklist
- Test-Driven Development Workflow
- Test-Driven Development Workflow
- Coding Standards & Best Practices
- Cloud Security Checklist
- Plankton Code Quality Skill
- compilerOptions
- tester.sh
- Backend Development Patterns
- about-core API and Frontend Handoff Specification
- integrationValidationClearing.test.ts
- authMiddleware
- escapeRegex
- urlValidation.test.ts
- Project.ts
- models.test.ts
- Code Health MCP (CodeScene)
- server.ts
- Experience.ts
- 4.2.1 Tagged Image Galleries (`/gallery`)
- configController.ts
- Documentation Lookup (Context7)
- Verification Phases
- devDependencies
- API & Database Interaction Guide (`api_working.md`)
- 4.2 Projects (`/api/v1/projects`)
- Cloudinary Media Storage Architecture
- TDD Evidence Report: CRUD API Endpoints & Test Validation
- 2. API Endpoints Specification
- package.json
- api.test.ts
- uploadNaming.test.ts
- dependencies
- mongoose
- urlValidation.test.ts
- 4.6 Experiences (`/api/v1/experiences`)
- 4.9 People (`/api/v1/people`)
- 4.9 People API (`/api/v1/people`)
- 3. Global Interceptors & DB Hooks
- scripts
- ts-node@^10.9.2
- certificateRoutes.ts
- express
- ts-node-dev@^2.0.0
- tsc-alias@^1.9.7
- 4. Detailed API Specifications by Resource
- 4.6 Experiences API (`/api/v1/experiences`)
- integrationValidationClearing.test.ts
- gallery.test.ts
- 4.3 Skills (`/api/v1/skills`)
- 4.4 Certificates (`/api/v1/certificates`)
- 4.5 Achievements (`/api/v1/achievements`)
- 4. Endpoint Database Interactions
- 4.3 Skills API (`/api/v1/skills`)
- 4.4 Certificates API (`/api/v1/certificates`)
- @types/express@^5.0.0
- about-core (Headless CMS API)
- 4.7 Site Configuration API (`/api/v1/config`)
- express.d.ts
- 4.7 Site Configuration (`/api/v1/config`)
- jest
- reviews
- vercel.json
- rules.md
- @types/supertest@^6.0.2
- typescript@^5.7.3

## God Nodes (most connected - your core abstractions)
1. `authMiddleware()` - 46 edges
2. `isValidHttpUrl()` - 34 edges
3. `escapeRegex()` - 26 edges
4. `express` - 26 edges
5. `mongoose` - 26 edges
6. `compilerOptions` - 26 edges
7. `cleanupUploadedVersionMedia()` - 25 edges
8. `formatProjectResponse()` - 21 edges
9. `tester.sh script` - 20 edges
10. `4.2 Projects API (`/api/v1/projects`)` - 19 edges

## Surprising Connections (you probably didn't know these)
- `3.1 Every Request: Automatic DB Audit Logging (`dbLoggerMiddleware`)` --references--> `dbLoggerMiddleware()`  [INFERRED]
  .agents/api_working.md → src/middlewares/dbLoggerMiddleware.ts
- ``GET /health`` --references--> `dbLoggerMiddleware()`  [INFERRED]
  .agents/api_working.md → src/middlewares/dbLoggerMiddleware.ts
- `Algorithm for Resume PDF (`getNextResumePublicId`)` --references--> `getNextResumePublicId()`  [INFERRED]
  .agents/cloudinary.md → src/middlewares/uploadMiddleware.ts
- `Algorithm for General Media (`getUniquePublicId`)` --references--> `getUniquePublicId()`  [INFERRED]
  .agents/cloudinary.md → src/middlewares/uploadMiddleware.ts
- `3.4 Multipart Upload Middleware DB Query (`processExperienceUploads`)` --references--> `processExperienceUploads()`  [INFERRED]
  .agents/api_working.md → src/middlewares/uploadMiddleware.ts

## Import Cycles
- None detected.

## Communities (68 total, 9 thin omitted)

### Community 0 - "uploadMiddleware.ts"
Cohesion: 0.09
Nodes (34): 3.5 Multipart Upload Middleware DB Query (`processMediaUploads`) for Project Versions, attachRollbackOnFailure(), CloudinarySearchResource, CloudinarySearchResult, CloudinaryUploadOptions, contributorUploadFields, deriveCertPublicId(), deriveContributorName (+26 more)

### Community 1 - "projectController.ts"
Cohesion: 0.13
Nodes (48): addProjectGallery(), addProjectVersion(), addVersionGallery(), createProject(), deleteProject(), deleteProjectGalleryImage(), deleteProjectVersion(), deleteVersionGalleryImage() (+40 more)

### Community 2 - "Security Checklist"
Cohesion: 0.04
Nodes (48): 10. Dependency Security, 1. Secrets Management, 2. Input Validation, 3. SQL Injection Prevention, 4. Authentication & Authorization, 5. XSS Prevention, 6. CSRF Protection, 7. Rate Limiting (+40 more)

### Community 3 - "Test-Driven Development Workflow"
Cohesion: 0.04
Nodes (47): 1. Tests BEFORE Code, 2. Coverage Requirements, 3. Test Types, 4. Git Checkpoints, API Integration Test Pattern, Best Practices, Bun Native Test Pattern (`bun:test`), CI/CD Integration (+39 more)

### Community 4 - "Test-Driven Development Workflow"
Cohesion: 0.04
Nodes (47): 1. Tests BEFORE Code, 2. Coverage Requirements, 3. Test Types, 4. Git Checkpoints, API Integration Test Pattern, Best Practices, Bun Native Test Pattern (`bun:test`), CI/CD Integration (+39 more)

### Community 5 - "Coding Standards & Best Practices"
Cohesion: 0.05
Nodes (41): 1. Long Functions, 1. Readability First, 2. Deep Nesting, 2. KISS (Keep It Simple, Stupid), 3. DRY (Don't Repeat Yourself), 3. Magic Numbers, 4. YAGNI (You Aren't Gonna Need It), API Design Standards (+33 more)

### Community 6 - "Cloud Security Checklist"
Cohesion: 0.06
Nodes (33): 1. IAM & Access Control, 2. Secrets Management, 3. Network Security, 4. Logging & Monitoring, 5. CI/CD Pipeline Security, 6. Cloudflare & CDN Security, 7. Backup & Disaster Recovery, Automated Backups (+25 more)

### Community 7 - "Plankton Code Quality Skill"
Cohesion: 0.07
Nodes (28): Avoiding Hook Conflicts, CI Integration Pattern, Complementary, Not Overlapping, Config Protection (Defense Against Rule-Gaming), Config Tamper Guard, Configuration Reference, Copyable Hook Profile, ECC v1.8 Additions (+20 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): compilerOptions, alwaysStrict, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module (+20 more)

### Community 9 - "tester.sh"
Cohesion: 0.15
Nodes (23): check(), cld_version(), cldlist(), cleanup(), die(), eff(), fill_cap(), gcount() (+15 more)

### Community 10 - "Backend Development Patterns"
Cohesion: 0.08
Nodes (25): API Design Patterns, Authentication & Authorization, Backend Development Patterns, Background Jobs & Queues, Cache-Aside Pattern, Caching Strategies, Centralized Error Handler, Database Patterns (+17 more)

### Community 11 - "about-core API and Frontend Handoff Specification"
Cohesion: 0.09
Nodes (22): 1. Architecture & Service Overview, 2. Base URL & Common Conventions, 3. Complete Endpoint Reference Table, 5. Authentication, 6. Media Uploads & Cloudinary Directory Structure, 7.1 Project (`Project`), 7.2 Skill (`Skill`), 7.3 Certificate (`Certificate`) (+14 more)

### Community 12 - "integrationValidationClearing.test.ts"
Cohesion: 0.16
Nodes (10): IPerson, IPersonDocument, Person, PersonSchema, app, CloudinaryMockCallback, CloudinaryMockOptions, mockCloudinary (+2 more)

### Community 13 - "authMiddleware"
Cohesion: 0.17
Nodes (20): 4.2 Projects API (`/api/v1/projects`), `DELETE /api/v1/projects/:id`, `DELETE /api/v1/projects/:slug/gallery/:imageId`, `DELETE /api/v1/projects/:slug/versions/:versionId`, `DELETE /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`, `GET /api/v1/admin/projects`, `GET /api/v1/projects`, `GET /api/v1/projects/categories` (+12 more)

### Community 14 - "escapeRegex"
Cohesion: 0.11
Nodes (28): createAchievement(), deleteAchievement(), getAchievementById(), getAchievements(), updateAchievement(), addExperiencePosition(), createExperience(), deleteExperience() (+20 more)

### Community 15 - "urlValidation.test.ts"
Cohesion: 0.13
Nodes (17): createSkill(), deleteSkill(), getSkillById(), getSkills(), updateSkill(), skillUploadFields, ISkill, Skill (+9 more)

### Community 16 - "Project.ts"
Cohesion: 0.15
Nodes (13): 2.2 Projects (`/api/v1/projects`), clearLegacyContributors(), GalleryImageSchema, IContributor, IGalleryImage, IProject, IProjectVersion, Project (+5 more)

### Community 17 - "models.test.ts"
Cohesion: 0.19
Nodes (10): 3.2 Server Initialization: Schema Migration (`migrateSiteConfigResumeUrl`), Achievement, AchievementSchema, IAchievement, IPfpItem, ISiteConfig, migrateSiteConfigResumeUrl(), PfpItemSchema (+2 more)

### Community 18 - "Code Health MCP (CodeScene)"
Cohesion: 0.12
Nodes (15): 1. Connect the MCP server, 2. Call standalone tools only, 3. Interpret scores (1–10), 4. Run the feedback loop, Code Health MCP (CodeScene), Example: AGENTS.md enforcement block, Example: anti-patterns vs correct loop, Example: Flask maintainability improvement (+7 more)

### Community 19 - "server.ts"
Cohesion: 0.15
Nodes (12): Project Layout, Key Middlewares Pipeline (Execution Order in `server.ts`), getHealth(), CustomError, errorMiddleware(), notFoundMiddleware(), router, router (+4 more)

### Community 20 - "Experience.ts"
Cohesion: 0.14
Nodes (12): Experience, ExperiencePositionSchema, ExperienceSchema, ExperienceTag, ExperienceType, IExperience, CloudinaryMockCallback, CloudinaryMockOptions (+4 more)

### Community 21 - "4.2.1 Tagged Image Galleries (`/gallery`)"
Cohesion: 0.14
Nodes (14): 4.2.1 Tagged Image Galleries (`/gallery`), Caption Constraints, Data Contract & Subdocument Schema (`GalleryImage`), `DELETE /api/v1/projects/:slug/gallery/:imageId`, `DELETE /api/v1/projects/:slug/versions/:versionId/gallery/:imageId`, `GET /api/v1/admin/projects`, `POST /api/v1/projects/:slug/gallery`, `POST /api/v1/projects/:slug/versions/:versionId/gallery` (+6 more)

### Community 22 - "configController.ts"
Cohesion: 0.45
Nodes (10): createSiteConfig(), getSiteConfig(), parseJobTitles(), updateSiteConfig(), uploadResume(), validateSiteConfigPayload(), cleanupUploadedResume(), hasUploadedResumeFile() (+2 more)

### Community 23 - "Documentation Lookup (Context7)"
Cohesion: 0.14
Nodes (13): Best Practices, Core Concepts, Documentation Lookup (Context7), Example: Next.js middleware, Example: Prisma query, Example: Supabase auth methods, Examples, How it works (+5 more)

### Community 24 - "Verification Phases"
Cohesion: 0.15
Nodes (12): Continuous Mode, Integration with Hooks, Output Format, Phase 1: Build Verification, Phase 2: Type Check, Phase 3: Lint Check, Phase 4: Test Suite, Phase 5: Security Scan (+4 more)

### Community 25 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, mongodb-memory-server@^11.3.0, ts-jest@^29.2.5, tsconfig-paths@^4.2.0, @types/cors@^2.8.17, @types/jest@^29.5.14, @types/node@^22.10.7, mongodb-memory-server (+5 more)

### Community 26 - "API & Database Interaction Guide (`api_working.md`)"
Cohesion: 0.22
Nodes (8): 1. Architecture & Database Lifecycle, 2.1 Collection Schemas & Indexes, 2.2 Global URL Validation Rules, 2. Data Models & Schema Architecture, 5. Cloudinary & Database Consistency Safeguards, 6. Summary Matrix, API & Database Interaction Guide (`api_working.md`), Table of Contents

### Community 27 - "4.2 Projects (`/api/v1/projects`)"
Cohesion: 0.20
Nodes (10): 4.2 Projects (`/api/v1/projects`), `DELETE /api/v1/projects/:id`, `DELETE /api/v1/projects/:slug/versions/:versionId`, `GET /api/v1/projects`, `GET /api/v1/projects/categories`, `GET /api/v1/projects/:slug`, `POST /api/v1/projects`, `POST /api/v1/projects/:slug/versions` (+2 more)

### Community 28 - "Cloudinary Media Storage Architecture"
Cohesion: 0.13
Nodes (15): 1. Cloudinary Directory Tree Diagram, 2. Mermaid Structural Visualization, 3. Directory & Public ID Mapping Table, 4. Unique Suffix Naming & Cloudinary Upload Configuration, 5.1 Architecture & In-Memory Streaming, 5.2 File Limits & MIME Validation, 5.3 Special Sanitization Rules, 5.4 Gallery Upload Pipeline & Constraints (+7 more)

### Community 29 - "TDD Evidence Report: CRUD API Endpoints & Test Validation"
Cohesion: 0.20
Nodes (9): 1. Source Plan, 2. User Journeys, 3. Task Report, 4. Test Specification, 5. Verification Commands for the User, Task 1: TypeScript Diagnostics & Model Validation, Task 2: RED Phase Reproduction, Task 3: GREEN Phase Implementation (+1 more)

### Community 30 - "2. API Endpoints Specification"
Cohesion: 0.04
Nodes (44): Agent Identity & Workspace Orchestration, 1.1 `Project.ts`, 1.2 `SiteConfig.ts`, 1.3 `Skill.ts`, 1.4 `Certificate.ts`, 1.5 `Achievement.ts`, 1.6 `Experience.ts`, 1.7 `LogEntry.ts` (+36 more)

### Community 31 - "package.json"
Cohesion: 0.20
Nodes (9): author, description, @types/multer@^1.4.12, keywords, license, main, name, version (+1 more)

### Community 32 - "api.test.ts"
Cohesion: 0.25
Nodes (6): app, { app: expressApp }, CloudinaryMockCallback, CloudinaryMockOptions, CloudinaryTestDouble, mockCloudinary

### Community 33 - "uploadNaming.test.ts"
Cohesion: 0.38
Nodes (6): getNextResumePublicId(), sanitizeResumeFilename(), sanitizeResumeUrl(), stripExtension(), CloudinarySearchTestDouble, mockCloudinary

### Community 34 - "dependencies"
Cohesion: 0.20
Nodes (9): dependencies, cloudinary@^2.5.1, cors@^2.8.5, express@^4.21.2, mongoose@^8.9.5, multer@^1.4.5-lts.1, cloudinary, cors (+1 more)

### Community 35 - "mongoose"
Cohesion: 0.29
Nodes (8): dotenv@^16.4.7, dotenv, mongoose, ClearLegacyResult, renameContributorsCollection(), RenameResult, connectDB(), disconnectDB()

### Community 36 - "urlValidation.test.ts"
Cohesion: 0.40
Nodes (3): INVALID_URL_PAYLOADS, mockDestroy, mockUploadCalls

### Community 37 - "4.6 Experiences (`/api/v1/experiences`)"
Cohesion: 0.25
Nodes (8): 4.6 Experiences (`/api/v1/experiences`), `DELETE /api/v1/experiences/:id`, `GET /api/v1/experiences`, `GET /api/v1/experiences/:id`, `POST /api/v1/experiences`, `POST /api/v1/experiences/:organization/positions`, `PUT /api/v1/experiences/:id`, IExperiencePosition

### Community 38 - "4.9 People (`/api/v1/people`)"
Cohesion: 0.25
Nodes (8): 4.9 People (`/api/v1/people`), Contributors Collection Migration Script, `DELETE /api/v1/people/:id`, `GET /api/v1/people`, `GET /api/v1/people/:id`, Legacy Contributor Cleanup Script, `POST /api/v1/people`, `PUT /api/v1/people/:id`

### Community 39 - "4.9 People API (`/api/v1/people`)"
Cohesion: 0.25
Nodes (8): 4.9 People API (`/api/v1/people`), Contributors Collection Migration Script (`scripts/rename-contributors-collection.ts`), `DELETE /api/v1/people/:id`, `GET /api/v1/people`, `GET /api/v1/people/:id`, Legacy Contributor Cleanup Script (`scripts/clear-legacy-contributors.ts`), `POST /api/v1/people`, `PUT /api/v1/people/:id`

### Community 40 - "3. Global Interceptors & DB Hooks"
Cohesion: 0.50
Nodes (4): 3.1 Every Request: Automatic DB Audit Logging (`dbLoggerMiddleware`), 3.3 Mongoose Document Pre-init Hook, 3.4 Multipart Upload Middleware DB Query (`processExperienceUploads`), 3. Global Interceptors & DB Hooks

### Community 41 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, clear-legacy-contributors, dev, rename-contributors-collection, start, test, test:coverage

### Community 43 - "certificateRoutes.ts"
Cohesion: 0.36
Nodes (7): createCertificate(), deleteCertificate(), getCertificateById(), getCertificates(), updateCertificate(), certificateUploadFields, router

### Community 44 - "express"
Cohesion: 0.22
Nodes (11): express, getAdminLogs(), LogQueryFilter, dbLoggerMiddleware(), ILogEntry, LogEntry, LogEntrySchema, LogLevel (+3 more)

### Community 47 - "4. Detailed API Specifications by Resource"
Cohesion: 0.29
Nodes (7): 4.1 Health & Dashboard, 4.8 Admin Request Logs (`/api/v1/admin/logs`), 4. Detailed API Specifications by Resource, `GET /` and `GET /index.html`, `GET /api/v1/admin/logs`, `GET /api/v1/health`, `GET /health`

### Community 48 - "4.6 Experiences API (`/api/v1/experiences`)"
Cohesion: 0.29
Nodes (7): 4.6 Experiences API (`/api/v1/experiences`), `DELETE /api/v1/experiences/:id`, `GET /api/v1/experiences`, `GET /api/v1/experiences/:id`, `POST /api/v1/experiences`, `POST /api/v1/experiences/:organization/positions`, `PUT /api/v1/experiences/:id`

### Community 49 - "integrationValidationClearing.test.ts"
Cohesion: 0.15
Nodes (10): Certificate, CertificateSchema, ICertificate, CloudinaryMockCallback, CloudinaryMockOptions, mockCloudinary, mockDestroy, mockUploadCalls (+2 more)

### Community 50 - "gallery.test.ts"
Cohesion: 0.22
Nodes (7): supertest@^7.0.0, supertest, app, { app: expressApp }, CloudinaryMockCallback, CloudinaryMockOptions, mockCloudinary

### Community 51 - "4.3 Skills (`/api/v1/skills`)"
Cohesion: 0.33
Nodes (6): 4.3 Skills (`/api/v1/skills`), `DELETE /api/v1/skills/:id`, `GET /api/v1/skills`, `GET /api/v1/skills/:id`, `POST /api/v1/skills`, `PUT /api/v1/skills/:id`

### Community 52 - "4.4 Certificates (`/api/v1/certificates`)"
Cohesion: 0.33
Nodes (6): 4.4 Certificates (`/api/v1/certificates`), `DELETE /api/v1/certificates/:id`, `GET /api/v1/certificates`, `GET /api/v1/certificates/:id`, `POST /api/v1/certificates`, `PUT /api/v1/certificates/:id`

### Community 53 - "4.5 Achievements (`/api/v1/achievements`)"
Cohesion: 0.33
Nodes (6): 4.5 Achievements (`/api/v1/achievements`), `DELETE /api/v1/achievements/:id`, `GET /api/v1/achievements`, `GET /api/v1/achievements/:id`, `POST /api/v1/achievements`, `PUT /api/v1/achievements/:id`

### Community 54 - "4. Endpoint Database Interactions"
Cohesion: 0.17
Nodes (12): 4.1 System & Health, 4.5 Achievements API (`/api/v1/achievements`), 4.8 Admin Logs API (`/api/v1/admin/logs`), 4. Endpoint Database Interactions, `DELETE /api/v1/achievements/:id`, `GET /api/v1/achievements`, `GET /api/v1/achievements/:id`, `GET /api/v1/admin/logs` (+4 more)

### Community 55 - "4.3 Skills API (`/api/v1/skills`)"
Cohesion: 0.33
Nodes (6): 4.3 Skills API (`/api/v1/skills`), `DELETE /api/v1/skills/:id`, `GET /api/v1/skills`, `GET /api/v1/skills/:id`, `POST /api/v1/skills`, `PUT /api/v1/skills/:id`

### Community 56 - "4.4 Certificates API (`/api/v1/certificates`)"
Cohesion: 0.33
Nodes (6): 4.4 Certificates API (`/api/v1/certificates`), `DELETE /api/v1/certificates/:id`, `GET /api/v1/certificates`, `GET /api/v1/certificates/:id`, `POST /api/v1/certificates`, `PUT /api/v1/certificates/:id`

### Community 58 - "about-core (Headless CMS API)"
Cohesion: 0.33
Nodes (5): about-core (Headless CMS API), API Structure, Architecture Overview, Local Setup, Tech Stack

### Community 59 - "4.7 Site Configuration API (`/api/v1/config`)"
Cohesion: 0.40
Nodes (5): 4.7 Site Configuration API (`/api/v1/config`), `GET /api/v1/config`, `POST /api/v1/config`, `POST /api/v1/config/resume`, `PUT /api/v1/config`

### Community 60 - "express.d.ts"
Cohesion: 0.40
Nodes (4): ApiResponse, Express, Request, UploadedMediaAsset

### Community 61 - "4.7 Site Configuration (`/api/v1/config`)"
Cohesion: 0.50
Nodes (4): 4.7 Site Configuration (`/api/v1/config`), `GET /api/v1/config`, `POST /api/v1/config`, `PUT /api/v1/config`

### Community 62 - "jest"
Cohesion: 0.50
Nodes (3): config, jest@^29.7.0, jest

## Knowledge Gaps
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `4.6 Experiences (`/api/v1/experiences`)` connect `4.6 Experiences (`/api/v1/experiences`)` to `4. Detailed API Specifications by Resource`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `authMiddleware()` (e.g. with ``DELETE /api/v1/achievements/:id`` and ``DELETE /api/v1/certificates/:id``) actually correct?**
  _`authMiddleware()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Should `uploadMiddleware.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09365079365079365 - nodes in this community are weakly interconnected._
- **Why does `4. Detailed API Specifications by Resource` connect `4. Detailed API Specifications by Resource` to `4.6 Experiences (`/api/v1/experiences`)`, `4.9 People (`/api/v1/people`)`, `about-core API and Frontend Handoff Specification`, `4.3 Skills (`/api/v1/skills`)`, `4.4 Certificates (`/api/v1/certificates`)`, `4.5 Achievements (`/api/v1/achievements`)`, `4.2.1 Tagged Image Galleries (`/gallery`)`, `4.2 Projects (`/api/v1/projects`)`, `4.7 Site Configuration (`/api/v1/config`)`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `isValidHttpUrl()` (e.g. with `2.2 Global URL Validation Rules` and ``PUT /api/v1/projects/:id``) actually correct?**
  _`isValidHttpUrl()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `projectController.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13306122448979593 - nodes in this community are weakly interconnected._
- **Why does `IExperiencePosition` connect `4.6 Experiences (`/api/v1/experiences`)` to `Experience.ts`, `escapeRegex`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._