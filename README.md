# AI-FitTrack - Fitness Tracking and Gym Management API

> **AI-FitTrack is a backend-focused REST API application that can be independently tested using Thunder Client. React is a client application for consuming and demonstrating the APIs.**

---

## Overview

AI-FitTrack lets members register, log workouts, set fitness goals, follow their progress, record gym visits and get a personalized AI fitness recommendation and AI fitness insights from Google Gemini. Admins can see system statistics and manage users.

The **backend is the product**: a Node.js / Express / MongoDB REST API with 28 endpoints, JWT authentication, role-based access control, request validation and centralized JSON error handling. Every endpoint can be tested on its own with **Thunder Client**, Postman or curl - see [`API_TESTING.md`](API_TESTING.md) and the ready-made collection in [`thunder-tests/`](thunder-tests). The React app in `client/` only consumes these APIs; if it is deleted the backend keeps working unchanged.

Google Gemini is used **only on the server** (`@google/genai`); the API key never reaches the browser.

---

## Features

| Area | What it does |
|---|---|
| **Authentication** | Register, login, JWT (`Authorization: Bearer <token>`), passwords hashed with bcryptjs |
| **Roles** | `user` and `admin`. Registration always creates `user`; the role is read from the database on every request |
| **Fitness profile** | Name plus age, height, weight, experience level and fitness goal - the information the AI recommendation needs |
| **Workouts** | Create, list, get, update, delete (own workouts only); search by name / category / date |
| **Fitness goals** | Create, list, get, update, delete. Progress and status are **calculated by the server** - from your workouts and gym visits, or from a value you report |
| **Progress** | Totals, average duration, calories, category distribution, workout frequency, streaks, consistency and weekly buckets - calculated with MongoDB aggregation |
| **Attendance** | Gym check-in / check-out and your visit history |
| **AI recommendation** | One endpoint: your fitness profile + active goals + recent workouts + progress -> Gemini -> personalized plan |
| **Admin** | System statistics, list / view users, change roles, delete users (with their data) |
| **AI Fitness Insights** | Separate endpoint: total workouts + average workout duration + total calories burned (calculated by the server) -> Gemini -> performance analysis, improvement suggestions, motivational advice, fitness progress summary |
| **Health** | `GET /api/health` reports server, database and Gemini configuration |

---

## Technology Stack

**Backend** (`server/`): Node.js **20+**, Express 4, MongoDB + Mongoose 8, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, **`@google/genai`** (Gemini), Nodemon (dev). Tests use Node's built-in test runner (no extra packages).

**Frontend** (`client/`, optional): React 19, Vite 8, React Router 7, Axios, hand-written CSS.

---

## Architecture

```
        React client  /  Thunder Client  /  Postman  /  curl
                               |
                               |  HTTP / REST (JSON, Bearer JWT)
                               v
                       Express.js (server.js)
                               |
     CORS -> JSON body -> database-available check -> Routes
                               |
        authenticate (JWT) -> authorize("admin") -> validation
                               |
                               v
                          Controllers   (thin)
                               |
                               v
                          Services      (business rules)
                               |
                               v
                     Mongoose models -> MongoDB

   AI flow:  aiController -> recommendationService -> geminiService -> @google/genai -> Google Gemini
   Insights: aiController -> insightsService (+ progressService) -> geminiService -> @google/genai -> Google Gemini
```

JWT verification exists in one place (`middleware/authMiddleware.js`). Errors are thrown as `AppError` (or come from Mongoose / Gemini) and are turned into one JSON error format by `middleware/errorMiddleware.js`. Request bodies and query strings are checked and whitelisted by `middleware/validate.js` before a controller runs.

### Project structure

```
AI-FitTrack/
├── README.md
├── API_TESTING.md                 Thunder Client guide + reference for every endpoint
├── thunder-tests/                 Importable Thunder Client collection + environment
├── .gitignore
├── server/
│   ├── server.js                  App setup, routers, /api/health, startup
│   ├── package.json
│   ├── .env.example
│   ├── config/        db.js, validateEnv.js
│   ├── models/        User, Workout, FitnessGoal, Attendance
│   ├── routes/        auth, workout, goal, progress, attendance, ai, admin
│   ├── controllers/   one per route file (thin)
│   ├── services/      jwt, password, gemini, goal, progress, attendance, recommendation, insights, admin
│   ├── middleware/    authMiddleware, validate, dbConnectionMiddleware, errorMiddleware
│   ├── utils/         response, AppError, asyncHandler, pagination, dateUtils, progressCalc, ids, text
│   ├── scripts/       createAdmin.js
│   └── tests/         unit tests (npm test) + API tests (npm run test:api)
└── client/                        Optional React (Vite) frontend
```

---

## Database (MongoDB / Mongoose)

| Model | Fields | Relationship |
|---|---|---|
| `User` | `name`, `email` (unique), `password` (hash, never returned), `role` (`user` / `admin`, default `user`), `fitnessProfile` { `age`, `heightCm`, `weightKg`, `experienceLevel`, `fitnessGoal` }, timestamps | |
| `Workout` | `workoutName`, `category`, `duration` (> 0), `caloriesBurned` (>= 0), `workoutDate` | `user` -> User |
| `FitnessGoal` | `title`, `description`, `metric`, `targetValue`, `currentValue`, `unit`, `startDate`, `targetDate`, `status`, `progress` (server-calculated) | `user` -> User |
| `Attendance` | `checkInTime`, `checkOutTime`, `durationMinutes`, `isOpen` (one open visit per user - unique index) | `user` -> User |

```
User --< Workout        User --< FitnessGoal        User --< Attendance
```

Every model is used by at least one active API. Accounts created before roles existed have no `role` field and are treated as `user`.

---

## Authentication and authorization

- `POST /api/auth/register` (role is always `user`; a `role` in the body is ignored), `POST /api/auth/login` (returns a JWT), `GET` / `PUT /api/auth/profile`.
- Protected routes need `Authorization: Bearer <JWT>`; a missing, malformed, invalid or expired token returns 401.
- The first admin is created from the command line, not through the API: `npm run create-admin -- "Name" admin@example.com "Password"` (an existing user with that email is promoted). Admins can then promote others with `PUT /api/admin/users/:id/role`.
- Route pattern: `authenticate -> authorize("admin") -> validation -> controller`.

| Capability | user | admin |
|---|:-:|:-:|
| Own profile, workouts, goals, progress, attendance, AI recommendation, AI fitness insights | yes | yes |
| `/api/admin/*` (statistics, list / view / delete users, change roles) | - | yes |

Workouts, goals and attendance are private: they can only be read or changed by their owner (an admin cannot read another user's goals or workouts through the API). The owner of a new record is always the authenticated user; ids, roles, progress and status sent by a client are not trusted (request bodies are whitelisted and unknown fields dropped).

---

## API endpoints (28)

Base URL `http://localhost:5000`. Bodies, headers, responses and error cases for every endpoint are in [`API_TESTING.md`](API_TESTING.md).

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Server + database + Gemini status (200, or 503 if MongoDB is down) |
| POST | `/api/auth/register` | public | Register (role `user`) |
| POST | `/api/auth/login` | public | Login, returns JWT |
| GET | `/api/auth/profile` | user | My profile |
| PUT | `/api/auth/profile` | user | Update name / fitness profile |
| POST | `/api/workouts` | user | Create workout |
| GET | `/api/workouts` | user | List own workouts (`page`, `limit`) |
| GET | `/api/workouts/search` | user | Search (`query`, `workoutName`, `category`, `date`) |
| GET | `/api/workouts/:id` | user | Get workout |
| PUT | `/api/workouts/:id` | user | Update workout |
| DELETE | `/api/workouts/:id` | user | Delete workout |
| POST | `/api/goals` | user | Create goal |
| GET | `/api/goals` | user | List own goals (`status`, `page`, `limit`) |
| GET | `/api/goals/:id` | user | Get goal |
| PUT | `/api/goals/:id` | user | Update goal / progress |
| DELETE | `/api/goals/:id` | user | Delete goal |
| GET | `/api/progress/summary` | user | Progress summary |
| GET | `/api/progress/weekly` | user | Weekly progress (`weeks`) |
| POST | `/api/attendance/check-in` | user | Check in to the gym |
| POST | `/api/attendance/check-out` | user | Check out |
| GET | `/api/attendance` | user | My attendance history |
| POST | `/api/ai/recommendation` | user | AI recommendation |
| GET | `/api/ai/fitness-insights` | user | AI Fitness Insights |
| GET | `/api/admin/stats` | admin | System statistics |
| GET | `/api/admin/users` | admin | List users (`q`, `role`) |
| GET | `/api/admin/users/:id` | admin | User details with data counts |
| PUT | `/api/admin/users/:id/role` | admin | Change role |
| DELETE | `/api/admin/users/:id` | admin | Delete user and their data |

### Workouts
Category is one of Cardio, Strength, Flexibility, Balance, Sports, HIIT, Yoga, Other; duration > 0; calories >= 0. Search matches only the caller's workouts; `query` matches name or category (partial, case-insensitive), `category` is an exact (case-insensitive) match, `date` is a UTC calendar day; input is matched literally (no regex injection).

### Fitness goals
`metric` is `manual` (you report `currentValue`) or calculated from stored data between `startDate` and `targetDate`: `workouts` (count), `workout_minutes`, `calories` or `visits` (gym check-ins). The server calculates `progress` (0-100) every time a goal is read or changed: it completes the goal at 100% and expires it after the target date. A `progress`, `status` or `user` sent by a client is ignored.

### Progress
`GET /api/progress/summary` returns totals (workouts, duration, average duration, calories), category distribution, frequency (last 7 / 30 days, workouts per week), current and longest streak (the current streak stays alive until a full day is missed), 30-day consistency and gym visits in the last 30 days. `GET /api/progress/weekly?weeks=8` returns Monday-Sunday buckets (UTC), empty weeks included. Everything is calculated with MongoDB aggregation from the caller's own data.

### Attendance
`POST /api/attendance/check-in` opens a visit, `POST /api/attendance/check-out` closes it and records the duration, `GET /api/attendance` returns the history (newest first) plus the currently open visit. One open visit per user is enforced by a unique database index, so simultaneous requests cannot both succeed; a visit that was never checked out for more than 12 hours is treated as abandoned and does not block the next check-in.

### AI recommendation
`POST /api/ai/recommendation` - body optional: `{ age, fitnessGoal, experienceLevel }`. Whatever is not sent comes from the saved fitness profile; all three must be known, otherwise the answer is `400` and lists the missing fields. The server then gathers the caller's active goals, last 5 workouts and progress numbers and sends them to Gemini. **Name, email and ids are never sent.** The answer contains `input`, `basedOn` (how many workouts / goals were used) and `recommendation`: `workoutPlan`, `weeklySchedule`, `suitableExercises`, `trainingTips`, `safetyRecommendations`, `motivationalMessage`, `disclaimer`. A system instruction forbids medical diagnosis and asks for safety guidance; the structure of the answer is requested through the prompt and returned as Gemini produces it.

`services/geminiService.js` uses **`@google/genai`** (`GoogleGenAI` client, `client.models.generateContent({ model, contents, config })`) with a system instruction, JSON output, temperature 0.7 and an abort signal (`GEMINI_TIMEOUT_MS`). Model: `GEMINI_MODEL` (default `gemini-2.5-flash`), used by both AI features. A missing key never crashes the server: the endpoint answers with a clear JSON error. Errors: key missing / rejected / model not found -> 500, rate limit -> 429, invalid request / upstream error / network / invalid answer -> 502, timeout -> 504; upstream error text is logged on the server and never sent to clients.

### AI Fitness Insights
`GET /api/ai/fitness-insights` - a separate AI capability from the recommendation above. **Authentication:** `Authorization: Bearer <JWT>`. No body and no query parameters: the server calculates the statistics from the **authenticated user's own workouts** (a `userId` in the URL is ignored), using the same `progressService` calculation as the Progress page.

- **Input (statistics):** Total Workouts (`totalWorkouts`), Average Workout Duration in minutes (`averageWorkoutDuration`), Total Calories Burned (`totalCaloriesBurned`). Gemini also receives your last 5 workouts (category, minutes, calories, date), recent activity numbers (streak, workouts per week, consistency), and your fitness goal and experience level if saved. **Name, email, ids, age, height, weight and workout names are never sent.**
- **AI output (`data.insights`):** `performanceAnalysis` (Performance Analysis), `improvementSuggestions` (Improvement Suggestions, 3-5 items), `motivationalAdvice` (Motivational Advice), `fitnessProgressSummary` (Fitness Progress Summary). The answer is validated; a wrong structure gives a clean `502` instead of a crash.
- **Gemini model:** `gemini-2.5-flash` (from `GEMINI_MODEL`, the same setting the recommendation uses).
- **Response:** `{ "success": true, "message": "...", "data": { "statistics": { "totalWorkouts": 5, "averageWorkoutDuration": 40, "totalCaloriesBurned": 1200 }, "insights": { "performanceAnalysis": "...", "improvementSuggestions": ["...", "..."], "motivationalAdvice": "...", "fitnessProgressSummary": "..." } } }`
- **No workouts yet:** `200` with zero statistics and `"insights": null` (and the message "No workout history is available yet..."); Gemini is **not** called.
- **Errors:** `401` no/invalid JWT; `429` rate limit; `500` key missing / rejected; `502` Gemini failed or answered with an invalid structure; `503` Gemini temporarily unavailable (retried up to 3 times first); `504` timeout. Same retry/timeout behavior as the recommendation (`services/geminiService.js`).
- **Frontend:** the sidebar item **AI Fitness Insights** opens `/fitness-insights`.

### Admin
`GET /api/admin/stats` (users by role, new users, workouts, goals by status, visits, who is checked in), `GET /api/admin/users` (search `q`, filter `role`, paginated, no passwords), `GET /api/admin/users/:id` (with counts), `PUT /api/admin/users/:id/role`, `DELETE /api/admin/users/:id` (deletes the user's workouts, goals and attendance first; not transactional). An admin cannot change or delete their own account.

### Health
`GET /api/health` needs no login and never touches the database - it reads the connection state. It returns `data.server` (`running`), `data.database` (`connected` / `disconnected` / ...), `data.gemini` (`configured` / `not_configured`), `uptimeSeconds` and `timestamp`: **200** when MongoDB is connected, **503** (`success: false`) when it is not. While MongoDB is down every other route also answers 503 immediately.

---

## Response and error format

```json
{ "success": true,  "message": "...", "data": { } }
{ "success": false, "message": "...", "errors": [ "..." ] }
```

| Status | When |
|---|---|
| 400 | Validation failed, invalid ObjectId, missing fitness information for the AI, malformed JSON |
| 401 | Missing / malformed / invalid / expired JWT, wrong credentials |
| 403 | Not an admin, or someone else's record |
| 404 | Not found / unknown route |
| 409 | Duplicate e-mail, already checked in, not checked in |
| 429 / 500 / 502 / 504 | Gemini rate limit / not configured or rejected / failed / timeout |
| 503 | MongoDB unavailable |

Stack traces, secrets, connection strings and upstream error text are never sent to clients; unexpected errors return a generic 500.

---

## Environment variables

Copy `server/.env.example` to `server/.env`.

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGO_URI` | **Required.** MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/ai-fittrack` |
| `JWT_SECRET` | **Required.** Long random secret |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `GEMINI_API_KEY` | Gemini API key - only the AI endpoints (`POST /api/ai/recommendation`, `GET /api/ai/fitness-insights`) need it |
| `GEMINI_MODEL` | Gemini model (default `gemini-2.5-flash`) |
| `GEMINI_TIMEOUT_MS` | Gemini timeout (default 30000) |
| `CLIENT_ORIGIN` | Comma-separated allowed CORS origins (default `http://localhost:5173`) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Only for `npm run create-admin` |
| `TEST_BASE_URL`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | Only for `npm run test:api` |

The server refuses to start (with a clear message) if `MONGO_URI` or `JWT_SECRET` is missing or a placeholder, and exits with a hint if MongoDB cannot be reached. A missing `GEMINI_API_KEY` only prints a warning. Frontend (`client/.env`): `VITE_API_BASE_URL=http://localhost:5000/api`.

---

## Installation and running

Prerequisites: **Node.js 20.19+ (or 22.12+)**, npm, and a running MongoDB (local `mongod` or Atlas) - MongoDB is not started by the project.

```bash
# Backend
cd AI-FitTrack/server
cp .env.example .env            # then fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run create-admin -- "Administrator" admin@example.com "ChangeMe@12345"   # once
npm run dev                     # development (nodemon)   |   npm start  (plain node)

# Frontend (optional) - second terminal
cd AI-FitTrack/client
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173
```

There is no root `package.json`; backend and frontend are installed separately.

---

## Testing

| Command (in `server/`) | What it runs |
|---|---|
| `npm test` | 43 tests: 20 unit tests (validation layer, dates, streaks, weekly buckets, goal progress) + 23 offline tests of AI Fitness Insights and the unchanged recommendation endpoint (`tests/insights.test.js`: real routes/JWT/controllers/services with a fake database and fake Gemini SDK, incl. 503 / 429 / timeout / invalid JSON / zero workouts / user isolation). No MongoDB, internet or Gemini key needed |
| `npm run test:api` | 45 HTTP tests against the **running** backend and its MongoDB: health, registration, login, protected routes, profile, workout CRUD + search + ownership, goal CRUD + server-calculated progress, progress, attendance, AI recommendation (a real answer **or** a clean JSON error; never a crash), admin authorization. Set `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (an admin from `create-admin`) to also run the admin tests (otherwise 3 are skipped); the test users are deleted at the end |

**Thunder Client:** follow [`API_TESTING.md`](API_TESTING.md) (environment variables, roles, the 8-phase test order with negative tests, and for each endpoint the method, URL, headers, body, expected response and error cases) or import `thunder-tests/AI-FitTrack.thunder-collection.json` and `thunder-tests/AI-FitTrack.thunder-environment.json` (81 requests with status checks; ids and tokens are chained automatically). The collection could not be imported into Thunder Client while it was generated; if the import fails use the tables in `API_TESTING.md`.

---

## React client

The client only consumes the REST API (one Axios instance adds the JWT; nothing is mocked; every rule is enforced by the backend). Pages: Login, Register, Dashboard, Workout log / add / edit / detail, Goals, Progress, Attendance (check in / out), AI recommendation, AI Fitness Insights, Profile (fitness profile), and Admin (statistics, users, roles, delete - admin only). The role-based menu is a convenience; the API answers 403 to anything not allowed.

---

## Security

- Never commit `.env` (`.gitignore` excludes it); `.env.example` is the safe template. If a key or secret was ever shared or committed, rotate it.
- Passwords are hashed (bcryptjs, 10 rounds) and never returned; JWTs are HS256 with an expiry, the algorithm is pinned on verification.
- Admin routes pass `authenticate` and `authorize("admin")` before anything else; roles are read from the database on every request; nobody can register as admin or change their own role.
- Ownership checks on every private record; ObjectIds and all query parameters are validated (operator injection such as `?query[$ne]=x` is rejected); user text is matched literally in searches.
- The Gemini key stays on the server; AI prompts contain user text only as JSON data and no personal identifiers.
- CORS is limited to `CLIENT_ORIGIN`; errors never expose stack traces, secrets or connection strings.

---

## Verification status and limitations

**Verified in this delivery (without MongoDB, Gemini or npm access):**
- Every server file passes a syntax check; `npm test` passes (20 tests).
- The real routes, middleware, controllers, services and models were run end to end in one process against **in-memory stand-ins** for Express, Mongoose, JWT, bcrypt and the Gemini SDK: the shipped `npm run test:api` suite passed (45 tests, also with no Gemini key and with a failing Gemini), the exact 78-request Thunder order (before insights was added) passed, and about 125 further checks covered authorization on all 27 routes, ownership, validation, races (simultaneous check-ins), database-down behaviour, Gemini failures and the admin cascade delete. The server startup path was exercised too: normal start, missing Gemini key (starts with a warning), missing `JWT_SECRET` / `MONGO_URI` (exits with a clear message) and unreachable MongoDB (exits with a hint).
- The route table and `API_TESTING.md` list exactly the same 27 endpoints and access levels; all 24 API calls made by the React client map to real routes; an audit found no unused files, imports, exports, models, environment variables or npm packages.
- The React client parses and bundles (esbuild) with every local import resolved.

**AI Fitness Insights (added later) - verified:** `tests/insights.test.js` (23 tests, part of `npm test`) runs the real route, JWT middleware, controller, `progressService`, `insightsService` and `geminiService` against a fake database and a fake Gemini SDK: correct statistics (5 workouts / 40 min / 1200 kcal), the four AI sections, `gemini-2.5-flash` as the model, fenced JSON, zero workouts (Gemini not called), user isolation, no personal data in the prompt, Gemini 503 (retry, then clean 503), 500, 429, timeout, permanent 403, wrong-structure and non-JSON answers, and the unchanged `POST /api/ai/recommendation`. The React client builds (`npm run build`) and lints with 0 warnings. **Not verified here:** a real Gemini call, a real MongoDB (run `npm run test:api`), and how the new page looks in a browser.

**Not verified - please check on your machine:** `npm install`, a run against a real MongoDB (the stand-ins approximate Mongoose, they are not Mongoose - run `npm run test:api` to confirm), real Gemini calls, the React build / rendering in a browser, and Thunder Client's import of the collection.

**Known limitations:** deleting a user is not transactional; there is no rate limiting on the AI endpoint; an admin cannot see another user's workouts or goals through the API (by design); accounts with the old `trainer` role (from the previous, larger version) must be changed to `user` or `admin` in the database.

---

## Troubleshooting

- **Server exits at startup:** the console message says whether `MONGO_URI` / `JWT_SECRET` is missing or MongoDB is unreachable. `ECONNREFUSED`: start `mongod` (try `127.0.0.1` instead of `localhost`). Atlas: allow your IP.
- **`503` on every route / `/api/health` shows `disconnected`:** MongoDB is not connected; it recovers when MongoDB is back.
- **`403` on `/api/admin/*`:** the token belongs to a normal user - create an admin with `npm run create-admin`.
- **AI `400` "Fitness information is missing":** save your fitness profile (`PUT /api/auth/profile`) or send `age`, `fitnessGoal`, `experienceLevel` in the request body.
- **AI `500` "Gemini API key is not configured":** set `GEMINI_API_KEY` in `server/.env` and restart. Other Gemini errors are listed above; only the AI endpoint is affected.
- **CORS error in the browser:** add the frontend origin to `CLIENT_ORIGIN` and restart the server.
