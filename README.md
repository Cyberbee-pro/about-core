# about-core (Headless CMS API)

The centralized backend API powering the [shibraj.dev](https://shibraj.dev) Next.js web portfolio and the native Kotlin Android client. 

Built for a serverless environment (Vercel), this API handles project versioning, dynamic 3D asset delivery (with exploded view toggles), and custom daily MongoDB request logging.

## Tech Stack
*   **Runtime & Framework:** Node.js, Express.js
*   **Language:** Strict TypeScript
*   **Database:** MongoDB Atlas (via Mongoose)
*   **Media Storage:** Cloudinary (Images, MP4 Videos, `.glb` / `.gltf` 3D Models)
*   **Authentication:** Custom Token / GitHub OAuth Gatekeeper

## Architecture Overview
*   **Unified Projects:** Projects contain their own tracking status (`planning`, `work_in_progress`, `active`), dynamic social links, and a nested version history array, eliminating the need for separate tracking collections.
*   **Serverless Logging:** Local file writing is bypassed for Vercel compatibility. All API hits and errors are intercepted by a custom middleware and saved as `LogEntry` documents in MongoDB, queryable by the admin dashboard.
*   **Category Management:** Categories are strictly normalized (lowercase/trim) to prevent fragmentation (e.g., preventing both `iot` and `i.o.t`).

## Local Setup

1. **Install Dependencies**
   ```bash
   npm install

```

2. **Environment Variables**
Create a `.env` file based on `.env.example`:
```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/about_core
CLIENT_ORIGIN=http://localhost:3000
ADMIN_SECRET=your_secure_admin_token

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

```


3. **Run the Development Server**
```bash
npm run dev

```



## API Structure

| Scope | Endpoints | Purpose |
| --- | --- | --- |
| **Public** | `GET /api/v1/projects` <br>

<br> `GET /api/v1/projects/:slug` <br>

<br> `GET /api/v1/projects/categories` <br>

<br> `GET /api/v1/config` | Fetch active projects, categories, and site configuration for public clients. |
| **Protected (Admin)** | `POST / PUT / DELETE /api/v1/projects` <br>

<br> `POST /api/v1/projects/:id/versions` <br>

<br> `PUT /api/v1/config` | Mutate project data, push versions, and handle multipart media uploads to Cloudinary. |
| **Logging (Admin)** | `GET /api/v1/admin/logs` | Query MongoDB system logs via `?date`, `?month`, or `?year` parameters. |
