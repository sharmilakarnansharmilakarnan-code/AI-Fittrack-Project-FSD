# AI-FitTrack - API Testing Guide (Thunder Client)

> **AI-FitTrack is a backend-focused REST API application that can be independently tested using Thunder Client. React is a client application for consuming and demonstrating the APIs.**

The backend has **27 endpoints**. Everything in this document is a plain REST request: if the `client/` folder is deleted, every request below still works. `thunder-tests/` contains a ready-made Thunder Client collection with the requests, bodies and status-code checks of section 5, and `server/tests/api.integration.js` runs a similar scenario automatically (`npm run test:api`).

---

## 1. Before you start

1. **MongoDB must be running** (local `mongod`, or an Atlas connection string in `MONGO_URI`).
2. Configure and start the backend:
   ```bash
   cd server
   cp .env.example .env      # fill MONGO_URI, JWT_SECRET, GEMINI_API_KEY (see README)
   npm install
   npm run dev               # -> "MongoDB connected" and "AI FitTrack API listening on port 5000"
   ```
3. **Create the first admin.** Registering through the API always creates the role `user` (nobody can register as admin), so the first admin is created from the command line:
   ```bash
   npm run create-admin -- "Administrator" admin@example.com "ChangeMe@12345"
   ```
   (or set `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`). If the email already exists, that user is promoted to admin. Admins can then promote others with `PUT /api/admin/users/:id/role`.
4. Only the AI endpoints (`POST /api/ai/recommendation` and `GET /api/ai/fitness-insights`) need a real `GEMINI_API_KEY`; everything else works without it.

### Roles

| Role | How you get it | What it may do |
|---|---|---|
| `user` | Default for every registration | Own profile, workouts, goals, progress, attendance, AI recommendation and AI fitness insights |
| `admin` | `npm run create-admin`, or another admin | Everything a user can, plus the five `/api/admin/*` endpoints (statistics, list / view users, change roles, delete users) |

The role is read from the database on every request, so a promotion or demotion takes effect immediately. Private records (workouts, goals, attendance) can only be read by their owner - not even by an admin.

---

## 2. Thunder Client setup

### 2.1 Environment variables
Create a Thunder Client environment (or import `thunder-tests/AI-FitTrack.thunder-environment.json`) with these variables:

| Variable | Value | Notes |
|---|---|---|
| `baseUrl` | `http://localhost:5000` | Backend URL |
| `password` | `Pass@1234` | Password used for the two test users |
| `userEmail` | `rahul@example.com` | Test user 1 |
| `user2Email` | `priya@example.com` | Test user 2 (deleted again at the end of the run) |
| `adminEmail` | `admin@example.com` | Must match the admin you created in step 1.3 |
| `adminPassword` | `ChangeMe@12345` | Must match the admin you created in step 1.3 |
| `workoutDate` | `2026-09-18` | Any date in the past or today (YYYY-MM-DD) |

Variables that are **filled in automatically** by the collection's tests (`set-env-var`): `userId, user2Id, adminId, userToken, user2Token, adminToken, workoutId, goalId`.
Re-running the whole flow needs fresh e-mails (or an empty database): the flow deletes user 2 at the end, but user 1 stays registered.

### 2.2 Headers
- Every request with a body: `Content-Type: application/json`
- Every protected request: `Authorization: Bearer {{userToken}}` (or `{{adminToken}}` / `{{user2Token}}` as noted per request).

### 2.3 Import the ready-made collection (optional)
Thunder Client -> Collections -> menu -> **Import** -> `thunder-tests/AI-FitTrack.thunder-collection.json`, then Env -> Import -> `thunder-tests/AI-FitTrack.thunder-environment.json`, select that environment, and run the collection in order (78 requests in 8 phase folders, each with a status-code test; login / creation requests save tokens and ids for the next ones).
The collection is generated from the same table as section 5. It could not be imported into Thunder Client itself while it was generated (no Thunder Client was available), so if the import is rejected, create the requests by hand from section 5 - the table lists every method, URL, token, body and expected status.

---

## 3. Conventions

**Success** `{ "success": true, "message": "...", "data": { ... } }`
**Error** `{ "success": false, "message": "...", "errors": [ ... ] }` (`errors` only for validation failures)

| Status | Meaning here |
|---|---|
| 200 / 201 | OK / created |
| 400 | Validation failed, invalid ObjectId, missing fitness information for the AI, business rule on input |
| 401 | Missing / malformed / invalid / expired JWT, wrong credentials |
| 403 | Authenticated but not allowed (not an admin, or someone else's record) |
| 404 | Not found (also unknown routes) |
| 409 | Conflict: duplicate e-mail, already checked in / not checked in |
| 429 / 500 / 502 / 504 | Gemini rate limit / not configured or rejected / failed / timeout |
| 503 | MongoDB not connected (every route except `/api/health` answers this immediately) |

- **Dates are UTC.** `date` values are `YYYY-MM-DD`.
- **Pagination:** list endpoints accept `?page=` (default 1) and `?limit=` (default 20, max 100) and return `data.pagination`.
- **IDs** are MongoDB ObjectIds (24 hex characters); anything else returns 400.
- **Ownership:** you can only read or change your own workouts, goals and attendance. Another user's record returns 403.
- Unknown fields in a request body are ignored (this stops clients from setting `role`, `user`, `progress`, `status` ...).

---

## 4. Test order

Run in this order (a letter suffix marks an extra or negative check, **NEG** = the request is *supposed* to fail). Each row is one request. `{{...}}` are Thunder Client variables.

### PHASE 1 - SERVER

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 1 | **GET** `/api/health`<br>Health check | - |  | **200**<br>`data.server` = `running`; `data.database` = `connected` |
| 1a | **GET** `/api/does-not-exist`<br>NEG: unknown route | - |  | **404** |

### PHASE 2 - AUTH AND PROFILE

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 2 | **POST** `/api/auth/register`<br>Register user (Rahul) | - | `{"name": "Rahul", "email": "{{userEmail}}", "password": "{{password}}"}` | **201**<br>`data.user.role` = `user`; saves `userId` |
| 2a | **POST** `/api/auth/register`<br>NEG: duplicate registration | - | `{"name": "Rahul", "email": "{{userEmail}}", "password": "{{password}}"}` | **409** |
| 2b | **POST** `/api/auth/register`<br>NEG: invalid email | - | `{"name": "Rahul Kumar", "email": "not-an-email", "password": "{{password}}"}` | **400** |
| 2c | **POST** `/api/auth/register`<br>NEG: invalid (short) password | - | `{"name": "Rahul Kumar", "email": "short@example.com", "password": "123"}` | **400** |
| 2d | **POST** `/api/auth/register`<br>Register user 2 (Priya) - tries role=admin, must stay 'user' | - | `{"name": "Priya", "email": "{{user2Email}}", "password": "{{password}}", "role": "admin"}` | **201**<br>`data.user.role` = `user`; saves `user2Id` |
| 3 | **POST** `/api/auth/login`<br>Login user | - | `{"email": "{{userEmail}}", "password": "{{password}}"}` | **200**<br>saves `userToken` |
| 3a | **POST** `/api/auth/login`<br>NEG: login with the wrong password | - | `{"email": "{{userEmail}}", "password": "Wrong@123"}` | **401** |
| 3b | **POST** `/api/auth/login`<br>Login user 2 | - | `{"email": "{{user2Email}}", "password": "{{password}}"}` | **200**<br>saves `user2Token` |
| 3c | **POST** `/api/auth/login`<br>Login ADMIN (created with npm run create-admin) | - | `{"email": "{{adminEmail}}", "password": "{{adminPassword}}"}` | **200**<br>`data.user.role` = `admin`; saves `adminToken` |
| 3d | **GET** `/api/auth/profile`<br>Admin profile (saves the admin id) | admin |  | **200**<br>saves `adminId` |
| 4 | **GET** `/api/auth/profile`<br>Get profile | user (Rahul) |  | **200**<br>`data.user.role` = `user` |
| 4a | **GET** `/api/auth/profile`<br>NEG: profile without JWT (protected route) | - |  | **401** |
| 4b | **GET** `/api/auth/profile`<br>NEG: profile with an invalid JWT | invalid token |  | **401** |
| 4c | **PUT** `/api/auth/profile`<br>Update fitness profile (role in the body is ignored) | user (Rahul) | `{"age": 28, "heightCm": 172, "weightKg": 68.5, "experienceLevel": "intermediate", "fitnessGoal": "Build endurance", "role": "admin"}` | **200**<br>`data.user.role` = `user`; `data.user.fitnessProfile.experienceLevel` = `Intermediate` |
| 4d | **PUT** `/api/auth/profile`<br>NEG: invalid age | user (Rahul) | `{"age": 5}` | **400** |

### PHASE 3 - WORKOUTS

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 5 | **POST** `/api/workouts`<br>Create workout | user (Rahul) | `{"workoutName": "Morning Running", "category": "Cardio", "duration": 30, "caloriesBurned": 250, "workoutDate": "{{workoutDate}}"}` | **201**<br>saves `workoutId` |
| 5a | **POST** `/api/workouts`<br>NEG: invalid workout (duration 0) | user (Rahul) | `{"workoutName": "Bad", "category": "Cardio", "duration": 0, "caloriesBurned": 10, "workoutDate": "{{workoutDate}}"}` | **400** |
| 5b | **POST** `/api/workouts`<br>NEG: invalid category | user (Rahul) | `{"workoutName": "Bad", "category": "Zumba", "duration": 10, "caloriesBurned": 10, "workoutDate": "{{workoutDate}}"}` | **400** |
| 6 | **GET** `/api/workouts`<br>Get workouts | user (Rahul) |  | **200** |
| 7 | **GET** `/api/workouts/{{workoutId}}`<br>Get workout by ID | user (Rahul) |  | **200** |
| 7a | **GET** `/api/workouts/{{workoutId}}`<br>NEG: another user's workout | user 2 (Priya) |  | **403** |
| 7b | **GET** `/api/workouts/not-an-id`<br>NEG: invalid ObjectId | user (Rahul) |  | **400** |
| 7c | **GET** `/api/workouts/64b7f0c2a1b2c3d4e5f60718`<br>NEG: unknown workout id | user (Rahul) |  | **404** |
| 8 | **GET** `/api/workouts/search?query=running`<br>Search workout by name | user (Rahul) |  | **200** |
| 8a | **GET** `/api/workouts/search?category=cardio`<br>Search workout by category | user (Rahul) |  | **200** |
| 8b | **GET** `/api/workouts/search?date={{workoutDate}}`<br>Search workout by date | user (Rahul) |  | **200** |
| 9 | **PUT** `/api/workouts/{{workoutId}}`<br>Update workout | user (Rahul) | `{"duration": 40, "caloriesBurned": 300}` | **200** |
| 9a | **PUT** `/api/workouts/{{workoutId}}`<br>NEG: another user updates the workout | user 2 (Priya) | `{"duration": 5}` | **403** |
| 10 | **DELETE** `/api/workouts/{{workoutId}}`<br>Delete workout | user (Rahul) |  | **200** |
| 10a | **GET** `/api/workouts/{{workoutId}}`<br>NEG: deleted workout -> 404 | user (Rahul) |  | **404** |
| 10b | **POST** `/api/workouts`<br>Create workout 1 (for progress / AI) | user (Rahul) | `{"workoutName": "Morning Run", "category": "Cardio", "duration": 30, "caloriesBurned": 250, "workoutDate": "{{workoutDate}}"}` | **201** |
| 10c | **POST** `/api/workouts`<br>Create workout 2 (for progress / AI) | user (Rahul) | `{"workoutName": "Evening Strength", "category": "Strength", "duration": 45, "caloriesBurned": 320, "workoutDate": "{{workoutDate}}"}` | **201** |

### PHASE 4 - GOALS

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 11 | **POST** `/api/goals`<br>Create goal (manual; `progress` in the body is ignored) | user (Rahul) | `{"title": "Run 10 times", "targetValue": 10, "currentValue": 3, "unit": "runs", "targetDate": "2040-12-31", "progress": 100}` | **201**<br>`data.goal.progress` = `30`; `data.goal.status` = `active`; saves `goalId` |
| 11a | **POST** `/api/goals`<br>Create goal calculated from your workouts | user (Rahul) | `{"title": "Log 2 workouts", "metric": "workouts", "targetValue": 2, "startDate": "2020-01-01", "targetDate": "2040-12-31"}` | **201**<br>`data.goal.status` = `completed` |
| 11b | **POST** `/api/goals`<br>NEG: targetValue 0 | user (Rahul) | `{"title": "Bad goal", "targetValue": 0, "targetDate": "2040-12-31"}` | **400** |
| 12 | **GET** `/api/goals`<br>Get goals | user (Rahul) |  | **200** |
| 12a | **GET** `/api/goals/{{goalId}}`<br>Get goal by ID | user (Rahul) |  | **200** |
| 12b | **GET** `/api/goals/{{goalId}}`<br>NEG: another user reads the goal | user 2 (Priya) |  | **403** |
| 13 | **PUT** `/api/goals/{{goalId}}`<br>Update goal progress (currentValue 5 -> 50%) | user (Rahul) | `{"currentValue": 5}` | **200**<br>`data.goal.progress` = `50` |
| 13a | **PUT** `/api/goals/{{goalId}}`<br>NEG: client tries to set status 'completed' | user (Rahul) | `{"status": "completed"}` | **400** |
| 13b | **PUT** `/api/goals/{{goalId}}`<br>NEG: another user edits the goal | user 2 (Priya) | `{"title": "hijack"}` | **403** |
| 14 | **DELETE** `/api/goals/{{goalId}}`<br>Delete goal | user (Rahul) |  | **200** |
| 14a | **GET** `/api/goals/{{goalId}}`<br>NEG: deleted goal -> 404 | user (Rahul) |  | **404** |

### PHASE 5 - PROGRESS

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 15 | **GET** `/api/progress/summary`<br>Progress summary | user (Rahul) |  | **200**<br>`data.summary.totals.workouts` = `2` |
| 16 | **GET** `/api/progress/weekly?weeks=4`<br>Weekly progress | user (Rahul) |  | **200** |
| 16a | **GET** `/api/progress/weekly?weeks=0`<br>NEG: weeks=0 | user (Rahul) |  | **400** |
| 16b | **GET** `/api/progress/summary`<br>NEG: progress without JWT | - |  | **401** |

### PHASE 6 - ATTENDANCE

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 17 | **POST** `/api/attendance/check-out`<br>NEG: check out while not checked in | user (Rahul) |  | **409** |
| 17a | **POST** `/api/attendance/check-in`<br>Check in | user (Rahul) |  | **201**<br>`data.attendance.isOpen` = `true` |
| 17b | **POST** `/api/attendance/check-in`<br>NEG: check in again (already checked in) | user (Rahul) |  | **409** |
| 18 | **GET** `/api/attendance`<br>Attendance history (shows the open visit) | user (Rahul) |  | **200** |
| 18a | **POST** `/api/attendance/check-out`<br>Check out | user (Rahul) |  | **200**<br>`data.attendance.isOpen` = `false` |
| 18b | **GET** `/api/attendance`<br>NEG: attendance without JWT | - |  | **401** |
| 18c | **GET** `/api/progress/summary`<br>Progress now counts the gym visit | user (Rahul) |  | **200**<br>`data.summary.attendance.visitsLast30Days` = `1` |

### PHASE 7 - AI RECOMMENDATION AND AI FITNESS INSIGHTS

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 19 | **POST** `/api/ai/recommendation`<br>AI recommendation (uses your saved profile, goals, workouts and progress) | user (Rahul) | `{}` | **200**<br>Needs a valid GEMINI_API_KEY |
| 19a | **POST** `/api/ai/recommendation`<br>AI recommendation with values in the body | user (Rahul) | `{"age": 22, "fitnessGoal": "Weight Loss", "experienceLevel": "Beginner"}` | **200**<br>Needs a valid GEMINI_API_KEY |
| 19b | **POST** `/api/ai/recommendation`<br>NEG: invalid age | user (Rahul) | `{"age": 5}` | **400** |
| 19c | **POST** `/api/ai/recommendation`<br>NEG: user 2 has no fitness profile and sends nothing | user 2 (Priya) | `{}` | **400** |
| 19d | **POST** `/api/ai/recommendation`<br>NEG: AI recommendation without JWT | - | `{}` | **401** |
| 19e | **GET** `/api/ai/fitness-insights`<br>AI Fitness Insights for a user with workouts | user (Rahul) | - | **200**<br>`data.statistics` (`totalWorkouts`, `averageWorkoutDuration`, `totalCaloriesBurned`) + `data.insights` (4 sections). Needs a valid GEMINI_API_KEY |
| 19f | **GET** `/api/ai/fitness-insights`<br>New user with zero workouts | user 2 (Priya) | - | **200**<br>Zero statistics, `data.insights: null`, message "No workout history is available yet..."; Gemini is not called |
| 19g | **GET** `/api/ai/fitness-insights`<br>NEG: without JWT | - | - | **401** |

### PHASE 8 - ADMIN

| # | Request | Token | Body | Expected |
|---|---|---|---|---|
| 20 | **GET** `/api/admin/stats`<br>Admin: system statistics | admin |  | **200** |
| 20a | **GET** `/api/admin/stats`<br>NEG: normal user calls admin statistics | user (Rahul) |  | **403** |
| 20b | **GET** `/api/admin/stats`<br>NEG: admin statistics without JWT | - |  | **401** |
| 21 | **GET** `/api/admin/users?q=example.com`<br>Admin: list users (search by e-mail) | admin |  | **200** |
| 21a | **GET** `/api/admin/users`<br>NEG: normal user lists users | user (Rahul) |  | **403** |
| 22 | **GET** `/api/admin/users/{{user2Id}}`<br>Admin: get user with data counts | admin |  | **200** |
| 22a | **GET** `/api/admin/users/64b7f0c2a1b2c3d4e5f60718`<br>NEG: unknown user | admin |  | **404** |
| 22b | **GET** `/api/admin/users/xyz`<br>NEG: invalid user id | admin |  | **400** |
| 23 | **PUT** `/api/admin/users/{{user2Id}}/role`<br>Admin: make user 2 an admin | admin | `{"role": "admin"}` | **200**<br>`data.user.role` = `admin` |
| 23a | **GET** `/api/admin/stats`<br>User 2 can now call admin routes (role is read from the database) | user 2 (Priya) |  | **200** |
| 23b | **PUT** `/api/admin/users/{{user2Id}}/role`<br>Admin: back to a normal user | admin | `{"role": "user"}` | **200** |
| 23c | **PUT** `/api/admin/users/{{user2Id}}/role`<br>NEG: invalid role | admin | `{"role": "superuser"}` | **400** |
| 23d | **PUT** `/api/admin/users/{{user2Id}}/role`<br>NEG: normal user changes a role | user (Rahul) | `{"role": "admin"}` | **403** |
| 23e | **PUT** `/api/admin/users/{{adminId}}/role`<br>NEG: admin changes their own role | admin | `{"role": "user"}` | **400** |
| 24 | **DELETE** `/api/admin/users/{{user2Id}}`<br>Admin: delete user 2 (with their data) | admin |  | **200** |
| 24a | **GET** `/api/admin/users/{{user2Id}}`<br>NEG: deleted user -> 404 | admin |  | **404** |
| 24b | **DELETE** `/api/admin/users/{{userId}}`<br>NEG: normal user deletes a user | user (Rahul) |  | **403** |

### Negative-test checklist (all included in the table above)

| Case | Step(s) |
|---|---|
| Duplicate registration / invalid e-mail / invalid password | 2a, 2b, 2c |
| Registering as admin is impossible | 2d |
| Missing JWT / invalid JWT / wrong password | 4a, 4b, 3a, 16b, 18b, 19d, 20b |
| Unauthorized access to another user's data | 7a, 9a (workout), 12b, 13b (goal) |
| Non-admin calling admin APIs | 20a, 21a, 23d, 24b |
| Invalid ObjectId / unknown id | 7b, 7c, 22a, 22b |
| Missing or invalid input | 4d, 5a, 5b, 11b, 13a, 16a, 19b, 19c, 23c |
| Duplicate check-in / check-out without check-in | 17b, 17 |
| Unknown route (JSON 404) | 1a |
| Gemini failure | Set an invalid `GEMINI_API_KEY` (or stop the internet) and repeat step 19 or 19e: a JSON error (500 / 502 / 504), never a crash. Without any key: `500` with the message "Gemini API key is not configured ..." |
| MongoDB failure | Stop `mongod` while the server runs, then call any endpoint: `503` immediately; `GET /api/health` answers `503` with `"database": "disconnected"` |

---

## 5. Endpoint reference

Access levels: **public** = no token; **any** = any valid JWT (ownership rules explained per endpoint); **admin** = admin only. All bodies are JSON. `Authorization: Bearer <token>` is required for everything except the three public endpoints.

### Server

#### GET `/api/health` - Health check

- **Authorization:** None (public)
- **Headers:** -
- **Body:** none
- **Expected response:** `200` - `data`: `server: "running"`, `database: "connected"`, `gemini: "configured" | "not_configured"`, `uptimeSeconds`, `timestamp`
- **Error cases:** `503` MongoDB is not connected: `success:false`, and `data.database` is `disconnected` / `connecting` (the server itself is still `running`)
- **Notes:** Never needs a login and never touches the database - it only reads the connection state.

### Authentication and fitness profile

#### POST `/api/auth/register` - Register

- **Authorization:** None (public)
- **Headers:** `Content-Type: application/json`
- **Body:**

```json
{ "name": "Rahul", "email": "rahul@example.com", "password": "Pass@1234" }
```

- **Expected response:** `201` - `data.user` (`id, name, email, role, fitnessProfile, createdAt, updatedAt`) and `data.token`. `role` is always `user`.
- **Error cases:** `400` Validation failed (name < 2 chars, invalid email, password < 6 chars or not text); `409` Email already registered
- **Notes:** A `role` field in the body is ignored: nobody can register as admin. Create the first admin with `npm run create-admin`.

#### POST `/api/auth/login` - Login

- **Authorization:** None (public)
- **Headers:** `Content-Type: application/json`
- **Body:**

```json
{ "email": "rahul@example.com", "password": "Pass@1234" }
```

- **Expected response:** `200` - `data.user` and `data.token` (JWT)
- **Error cases:** `400` Validation failed (invalid email / password not text); `401` Invalid email or password.

#### GET `/api/auth/profile` - Get my profile

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.user` with `role` and `fitnessProfile`; never a password
- **Error cases:** `401` Missing / malformed / invalid / expired JWT

#### PUT `/api/auth/profile` - Update my name / fitness profile

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "age": 28, "heightCm": 172, "weightKg": 68.5, "experienceLevel": "Intermediate", "fitnessGoal": "Build endurance" }
```

- **Expected response:** `200` - `data.user` with the saved `fitnessProfile`
- **Error cases:** `400` Validation: age whole number 10-100, heightCm 50-260, weightKg 20-400, experienceLevel Beginner/Intermediate/Advanced (any letter case), fitnessGoal 2-100 chars, name 2-60 chars; or an empty body; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Every field is optional but at least one is required. `email`, `password` and `role` cannot be changed here (they are ignored). The fitness profile is what `POST /api/ai/recommendation` uses.

### Workouts

#### POST `/api/workouts` - Create workout

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "workoutName": "Morning Running", "category": "Cardio", "duration": 30, "caloriesBurned": 250, "workoutDate": "2026-09-18" }
```

- **Expected response:** `201` - `data.workout` (owner = the JWT user; a `user` in the body is ignored)
- **Error cases:** `400` Validation: name 2-100 chars, category one of Cardio/Strength/Flexibility/Balance/Sports/HIIT/Yoga/Other, duration > 0, calories >= 0, valid date; `401` Missing / malformed / invalid / expired JWT

#### GET `/api/workouts` - List own workouts

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `page`, `limit` (1-100, default 20)
- **Body:** none
- **Expected response:** `200` - `data.workouts` (newest first), `data.pagination`
- **Error cases:** `400` Invalid page / limit; `401` Missing / malformed / invalid / expired JWT

#### GET `/api/workouts/search` - Search own workouts

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `query` (name or category, partial), `workoutName` (alias `name`), `category` (exact, case-insensitive), `date` (YYYY-MM-DD, UTC day) - combined with AND
- **Body:** none
- **Expected response:** `200` - `data.workouts`
- **Error cases:** `400` Invalid date, non-text or over-long parameter (e.g. `?query[$ne]=x`); `401` Missing / malformed / invalid / expired JWT

#### GET `/api/workouts/:id` - Get workout

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.workout`
- **Error cases:** `403` Workout belongs to another user; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT

#### PUT `/api/workouts/:id` - Update workout

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "duration": 40, "caloriesBurned": 300 }
```

- **Expected response:** `200` - `data.workout`
- **Error cases:** `400` Validation / empty body; `403` Not the owner; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Any of `workoutName, category, duration, caloriesBurned, workoutDate`.

#### DELETE `/api/workouts/:id` - Delete workout

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - Deleted
- **Error cases:** `403` Not the owner; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT

### Fitness goals

#### POST `/api/goals` - Create goal

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "title": "Run 10 times", "metric": "workouts", "targetValue": 10, "startDate": "2026-09-01", "targetDate": "2026-12-31" }
```

- **Expected response:** `201` - `data.goal` with server-calculated `currentValue`, `progress` (0-100) and `status`
- **Error cases:** `400` Validation; targetValue <= 0; targetDate before startDate; `401` Missing / malformed / invalid / expired JWT
- **Notes:** `metric`: `manual` (default - you send `currentValue`), or calculated from your data between `startDate` and `targetDate`: `workouts` (count), `workout_minutes`, `calories`, `visits` (gym check-ins). `progress`, `status` and `user` in the body are ignored. `startDate` defaults to today.

#### GET `/api/goals` - List my goals

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `status` (active, completed, cancelled, expired), `page`, `limit`
- **Body:** none
- **Expected response:** `200` - `data.goals` (progress recalculated), `data.pagination`
- **Error cases:** `400` Invalid filter; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Goals are private: even an admin only sees their own.

#### GET `/api/goals/:id` - Get goal

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.goal` (recalculated)
- **Error cases:** `403` Someone else's goal; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT

#### PUT `/api/goals/:id` - Update goal / progress

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "currentValue": 5 }  or  { "status": "cancelled" }
```

- **Expected response:** `200` - `data.goal`
- **Error cases:** `400` Validation; `currentValue` on a calculated goal; status other than `active`/`cancelled`; `403` Not the owner; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Editable: `title, description, targetValue, currentValue (manual goals only), unit, targetDate, status`. Reaching the target completes the goal automatically; a passed `targetDate` expires it.

#### DELETE `/api/goals/:id` - Delete goal

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - Deleted
- **Error cases:** `403` Not the owner; `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `401` Missing / malformed / invalid / expired JWT

### Progress

#### GET `/api/progress/summary` - Progress summary

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.summary`: `totals` (workouts, totalDuration, averageDuration, totalCalories), `categoryDistribution`, `frequency` (last7Days, last30Days, workoutsPerWeek), `streak` (current, longest, lastWorkoutDay), `consistency`, `attendance.visitsLast30Days`
- **Error cases:** `401` Missing / malformed / invalid / expired JWT
- **Notes:** Everything is calculated (MongoDB aggregation) from your own workouts and gym visits. The current streak stays alive if the last workout was yesterday; it is 0 after a missed full day.

#### GET `/api/progress/weekly` - Weekly progress

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `weeks` 1-52 (default 8)
- **Body:** none
- **Expected response:** `200` - `data.weekly`: Mon-Sun buckets (UTC), oldest first, empty weeks included
- **Error cases:** `400` weeks out of range; `401` Missing / malformed / invalid / expired JWT

### Attendance (gym check-in)

#### POST `/api/attendance/check-in` - Check in to the gym

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `201` - `data.attendance` (`isOpen: true`, `checkInTime`)
- **Error cases:** `409` You are already checked in; `401` Missing / malformed / invalid / expired JWT
- **Notes:** One open visit per user (also enforced by a unique database index). A visit that was never checked out for more than 12 hours is treated as abandoned and does not block a new check-in.

#### POST `/api/attendance/check-out` - Check out

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.attendance` with `checkOutTime` and `durationMinutes`
- **Error cases:** `409` You are not checked in; `401` Missing / malformed / invalid / expired JWT

#### GET `/api/attendance` - My attendance history

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `from`, `to` (YYYY-MM-DD, inclusive), `page`, `limit`
- **Body:** none
- **Expected response:** `200` - `data.attendance` (newest first), `data.currentVisit` (the open visit or `null`), `data.pagination`
- **Error cases:** `400` Invalid date / page / limit; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Always the caller's own history.

### AI recommendation (Google Gemini, server-side)

#### POST `/api/ai/recommendation` - Personalized recommendation

- **Authorization:** JWT (any logged-in user)
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{}   or   { "age": 22, "fitnessGoal": "Weight Loss", "experienceLevel": "Beginner" }
```

- **Expected response:** `200` - `data.input` (age, fitnessGoal, experienceLevel used), `data.basedOn` (`recentWorkouts`, `activeGoals` counts) and `data.recommendation` (`workoutPlan, weeklySchedule, suitableExercises, trainingTips, safetyRecommendations, motivationalMessage, disclaimer`)
- **Error cases:** `400` Invalid age / level, or fitness information missing: the answer lists the missing fields in `errors`; `429` Gemini rate limit; `500` Gemini key missing / rejected / model not found; `502` Gemini failed or answered with invalid JSON; `504` Gemini timeout; `401` Missing / malformed / invalid / expired JWT
- **Notes:** `age`, `fitnessGoal` and `experienceLevel` are all optional in the body: whatever is not sent comes from your saved fitness profile (`PUT /api/auth/profile`); all three must be known. Gemini also receives your active goals (title, progress), your last 5 workouts and your progress numbers (streak, frequency, gym visits). Name, email and ids are never sent. A missing `GEMINI_API_KEY` returns a clear 500 JSON error and never crashes the server.

#### GET `/api/ai/fitness-insights` - AI Fitness Insights
- **Access:** user (JWT). The statistics are calculated from your own workouts only.
- **Headers:** `Authorization: Bearer {{token}}`
- **Body / query:** none (a `userId` in the URL is ignored)
- **Gemini model:** `gemini-2.5-flash` (`GEMINI_MODEL`)
- **Expected response:** `200` - `data.statistics` (`totalWorkouts`, `averageWorkoutDuration` in minutes, `totalCaloriesBurned`) and `data.insights` (`performanceAnalysis`, `improvementSuggestions` (array), `motivationalAdvice`, `fitnessProgressSummary`). With zero workouts: `200`, zero statistics, `data.insights: null`, Gemini not called.
- **Error cases:** `401` Missing / invalid JWT; `429` Gemini rate limit; `500` Gemini key missing / rejected; `502` Gemini failed or answered with an invalid structure; `503` Gemini temporarily unavailable (after 3 attempts); `504` Gemini timeout
- **Notes:** Gemini receives the three statistics, your last 5 workouts (category, minutes, calories, date), recent activity numbers, and your fitness goal / experience level. Name, email, ids, age, height, weight and workout names are never sent.

### Admin (admin role only)

#### GET `/api/admin/stats` - System statistics

- **Authorization:** JWT - **admin only**
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.stats`: `users` (total, byRole, newInLast7Days), `workouts.total`, `goals.byStatus`, `attendance` (totalVisits, currentlyCheckedIn)
- **Error cases:** `403` Not an admin; `401` Missing / malformed / invalid / expired JWT

#### GET `/api/admin/users` - List users

- **Authorization:** JWT - **admin only**
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `q` (name / email, partial), `role` (`user` | `admin`), `page`, `limit`
- **Body:** none
- **Expected response:** `200` - `data.users` (safe objects, no passwords), `data.pagination`
- **Error cases:** `400` Invalid filter; `403` Not an admin; `401` Missing / malformed / invalid / expired JWT

#### GET `/api/admin/users/:id` - Get one user

- **Authorization:** JWT - **admin only**
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.user` with `counts` (workouts, goals, visits)
- **Error cases:** `400` `:id` is not a valid MongoDB ObjectId; `404` Not found; `403` Not an admin; `401` Missing / malformed / invalid / expired JWT

#### PUT `/api/admin/users/:id/role` - Change a user's role

- **Authorization:** JWT - **admin only**
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body:**

```json
{ "role": "admin" }
```

- **Expected response:** `200` - `data.user`
- **Error cases:** `400` Invalid role, invalid id, or changing your own role; `404` User not found; `403` Not an admin; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Takes effect immediately (the role is read from the database on every request).

#### DELETE `/api/admin/users/:id` - Delete a user and their data

- **Authorization:** JWT - **admin only**
- **Headers:** `Authorization: Bearer <token>`
- **Body:** none
- **Expected response:** `200` - `data.deleted` = number of workouts, goals and visits removed with the user
- **Error cases:** `400` Invalid id, or deleting yourself; `404` User not found; `403` Not an admin; `401` Missing / malformed / invalid / expired JWT
- **Notes:** Not transactional: the user's workouts, goals and attendance are deleted first, then the account.

---

## 6. What was verified, and how

- **Route table:** the 27 endpoints above were checked against the routes the server actually registers (nothing documented that does not exist, nothing missing), including each endpoint's access level. Every endpoint is exercised by the flow in section 4.
- **Simulated end-to-end run:** the real routes, middleware, controllers, services and models were executed in one process against in-memory stand-ins for Express, Mongoose, JWT, bcrypt and the Gemini SDK: all 78 requests of section 4 returned the expected status (and saved ids) as documented, `server/tests/api.integration.js` passed (45 tests), and about 125 further checks covered authorization on every route, ownership, validation, races, database-down behaviour and Gemini failures.
- **Unit tests:** `cd server && npm test` (no MongoDB needed) covers the validation layer and the date / streak / weekly / goal-progress calculations.
- **NOT verified here:** a run against a real MongoDB and real Gemini, `npm install`, and the React build. The stand-ins approximate Mongoose (validation, unique indexes, updates and the aggregation pipelines this project uses) but are not the real library. Please run `npm run test:api` and section 4 once against your own MongoDB.
