# JCoins Arena

A classroom JCoins economy app with admin, teacher, student, and display roles.

## Local Run

```powershell
npm install
npm run install:all
npm run dev
```

Open:

```text
http://localhost:5173
```

API:

```text
http://localhost:4000
```

## Environment

Backend:

```text
server/.env
```

Use `server/.env.example` as the template.

Frontend:

```text
client/.env
```

Use `client/.env.example` as the template. For local development, this can stay:

```env
VITE_API_URL=http://localhost:4000/api
```

For deployment, set it to the hosted backend URL, for example:

```env
VITE_API_URL=https://your-jcoins-api.onrender.com/api
```

## Supabase

Run this SQL in Supabase SQL Editor:

```text
server/supabase/schema.sql
```

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `server/.env`, the backend stores the app state in Supabase.

Check active storage:

```text
http://localhost:4000/api/health
```

Expected:

```json
{"ok":true,"storage":"supabase"}
```

## Clean Launch Data

The Supabase seed starts clean:

- admin account only
- default settings and ranks
- no students
- no teachers
- no subjects
- no sections
- no attendance, recitations, activities, or transactions

Default first login:

```text
username: admin
password: admin123!
```

The admin must change password on first login.
