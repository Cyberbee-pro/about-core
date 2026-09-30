# System Architecture
This workspace contains a multi-client headless CMS architecture:
*   **about-core (Backend):** Node.js, Express, TypeScript, MongoDB. Handles CMS logic, custom daily JSON/MongoDB logging, and Cloudinary media uploads (images, .glb files, videos).
*   **About-me (Web Client):** Next.js App Router portfolio using Tailwind CSS and React Three Fiber (for exploded 3D model views).
*   **About-client (Mobile Client):** Native Kotlin Android app consuming the Express API.

# Current State
Initializing the `about-core` directory structure and strict Mongoose schemas.