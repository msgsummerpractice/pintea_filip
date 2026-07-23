# AirAssist

Greenfield workspace for a compensation case intake flow with a Django backend, React frontend, and PostgreSQL installed locally on the same machine used for development.

## Workspace Layout

- `documentation/`: approved design spec and implementation plan
- `backend/`: planned Django API workspace
- `frontend/`: planned React + Vite workspace

The frontend intake wizard is now UI-complete through mocked submission, while backend case creation is still partial. Frontend tests should continue to mock submit responses rather than depend on a live `/cases/` implementation.

## Development

1. Copy the example environment file as needed: `Copy-Item .env.example .env`
2. Install PostgreSQL 16 locally.
3. Create a local database named `airassist` and a local user that matches the values in `.env.example`.
4. Ensure PostgreSQL is listening on `localhost:5432`.

## Backend Commands

Run these after the `backend/` workspace is scaffolded:

- Install dependencies: `cd backend && uv sync`
- Apply migrations: `cd backend && uv run python manage.py migrate`
- Start the API server: `cd backend && uv run python manage.py runserver`
- Run backend tests: `cd backend && uv run pytest`

## Frontend Commands

Run these from the `frontend/` workspace:

- Install dependencies: `cd frontend && npm install`
- Start the frontend dev server: `cd frontend && npm run dev`
- Run frontend tests: `cd frontend && npm run test`
- Build the frontend bundle: `cd frontend && npm run build`

## Verification

- Confirm PostgreSQL is reachable on `localhost:5432` with the configured credentials.
- Confirm the backend and frontend commands below match the generated project structure once those workspaces are scaffolded.
