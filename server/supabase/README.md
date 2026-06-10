# Supabase Setup

1. Open the Supabase project.
2. Go to SQL Editor.
3. Paste and run `schema.sql`.
4. Copy `server/.env.example` to `server/.env`.
5. Set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
6. Start the server.

The first server start will create a clean JCoins state with only:

- admin account
- default settings and ranks
- empty students, teachers, subjects, sections, attendance, activities, transactions, shop, and requests

Default admin login:

- username: `admin`
- password: `admin123!`

The admin must change the password on first login.
