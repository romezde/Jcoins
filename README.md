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

## Google Drive Grade Sync

The Grades screen always supports a local `.xlsx` download. Direct Google Drive sync is optional and uses backend-only Google credentials.

1. Enable the Google Sheets API and Google Drive API in Google Cloud.
2. For a normal personal My Drive, create OAuth credentials and a refresh token authorized for Google Drive and Google Sheets.
3. Create a Drive folder for JCoins grade sheets and copy its folder ID.
4. Add these values to `server/.env` locally and to the Render environment in production:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
GOOGLE_GRADE_FOLDER_ID=the-shared-folder-id
```

For a Google Workspace Shared Drive, service-account credentials may be used instead. Share that folder with the service-account email as Editor and set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

The first sync creates one native Google Sheet for the selected subject and section. Later syncs update that same file instead of creating duplicates.
