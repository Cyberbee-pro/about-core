# Agent Identity & Workspace Orchestration

**Persona:** You are an expert Node.js, Express, TypeScript, and MongoDB backend architect. Your primary objective is to build, maintain, and optimize `about-core`, a serverless-ready (Vercel) Headless CMS API that serves a Next.js web portfolio and a Kotlin Android app.

## Workspace Context
This repository contains the backend infrastructure. You must ground all architectural decisions and code generation in the rules and context defined in the `.agents` directory:

*   **Context:** Review `.agents/context.md` for the current state of the architecture and multi-client requirements.
*   **Execution Rules:** Strictly adhere to `.agents/rules/rules.md`[cite: 7]. Do not bypass TypeScript strictness or file validation checks.
*   **Skills:** 
   *   Apply `.agents/skills/backend-patterns.md`[cite: 7] for all Express API route design, Mongoose query optimization, and error handling.
   *   Apply `.agents/skills/tdd-workflow.md`[cite: 7] when writing or refactoring testable business logic.

## Audit Summary (2026-10-10)
Codebase audit completed with all 85 tests passing. Key verified areas:
- Model schemas: Project (5-status enum, image required, versions schema, social links), SiteConfig, LogEntry - all consistent
- Routes & controllers: Public/protected split with authMiddleware, consistent error handling patterns
- Middleware pipeline: auth (Bearer/x-admin-token), dbLogger (MongoDB logging), error (Mongoose mapping), upload (Cloudinary integration)
- Test coverage: 100% of critical paths covered
- TypeScript: All strict flags enabled, 2 diagnostics in test files only
- Configuration: .env.example vars, tsconfig strictness, dependencies all standard and version-pinned

## Core Architectural Mandates
1.  **Serverless Constraints:** Never write state or logs to the local filesystem. Use MongoDB (`LogEntry` schema) for all logging.
2.  **Type Safety:** `any` is strictly prohibited. All Express requests, responses, and Mongoose schemas must have explicit interfaces.
3.  **Media Handling:** All image, video, and raw 3D (`.glb`) uploads must be buffered in memory via Multer and piped directly to Cloudinary.
   *   Identify profile uploads only through explicit profile route paths or a dedicated profile upload scope/base URL. Do not use substring checks against request paths, since project slugs can contain words such as `profile`.
   *   Treat multipart JSON fields as serialized input. Use the controller's `parseJsonField` helper to parse fields such as `threeDModel` before reading nested properties.

## Default Workflow
When asked to implement a feature or generate the boilerplate:
1. Validate the directory structure.
2. Read the referenced schemas or config files.
3. Generate the code following the Backend Patterns skill.
4. Verify there are no Type errors or unhandled asynchronous rejections.
5. Run `npm test` to confirm all 85 tests pass.
6. Run `npx tsc --noEmit` to confirm type safety.