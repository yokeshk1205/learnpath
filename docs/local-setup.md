# Run LearnPath on your computer

These steps set up a cloned LearnPath checkout on Windows, macOS, or Linux. PostgreSQL, the API, the web app, and the ML service run on your computer. Docker is optional.

## Install prerequisites

- Git
- Node.js 22.18 or later and npm 10 or later
- PostgreSQL 16 or later, running locally
- Python 3.11 or 3.12 (with `venv` and `pip`)

Clone your GitHub project, open a terminal in the repository root (the directory containing the root `package.json`), then run:

```sh
npm ci
npm run setup:local
npm run setup:python
```

`setup:local` creates a private `.env` and generates a new random access-token secret if this checkout does not already contain `.env` or `.env.local`. It preserves either existing file. The root `.gitignore` excludes both, so machine-specific credentials stay out of Git. `setup:python` creates `.venv` and installs the pinned ML dependencies; the app invokes this interpreter directly, so you do not need to activate it.

## Connect your local PostgreSQL

Create an empty database and a PostgreSQL login for this local project. pgAdmin works on all three operating systems. Connect as your local PostgreSQL administrator, open its Query Tool, and run the following after replacing the example password with your own:

```sql
CREATE ROLE learnpath LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE learnpath OWNER learnpath;
```

If the role or database already exists on your computer, keep it and use its existing login details; do not run the creation statements again. The migration runner builds LearnPath's schema inside the configured database. It does not create PostgreSQL server roles or databases.

Open `.env` in the repository root and replace `DATABASE_URL` with this PostgreSQL login. For example:

```dotenv
DATABASE_URL=postgresql://learnpath:YOUR_PASSWORD@127.0.0.1:5432/learnpath
DATABASE_SSL=false
```

Use the port PostgreSQL actually listens on. If your password contains characters such as `@`, `:`, `/`, `#`, or `%`, URL-encode those characters in the URL. You can put the private value in `.env.local` instead; it takes precedence over `.env`. An environment variable supplied by your shell takes precedence over both files.

Check the connection, then apply schema migrations:

```sh
npm run db:check
npm run db:migrate
```

`db:check` only opens a connection and checks whether migrations are present. `db:migrate` applies pending, checksummed SQL migrations. Existing applied migrations cannot be silently rewritten. For a new, empty database it creates LearnPath's tables and course data from the migration files.

## Start the application

Run all three application services from the repository root:

```sh
npm run dev:local
```

This first checks PostgreSQL, then starts the web app, API, and ML service together. Leave this terminal running and open [http://localhost:5173](http://localhost:5173). Press `Ctrl+C` to stop the development services. The app uses ports 5173 (web), 4000 (API), and 8000 (ML) by default; set `WEB_PORT`, `API_PORT`, or `ML_PORT` in your private `.env` files if those ports are already in use. Match `WEB_ORIGIN` to the web origin if you move the web app to a non-default address.

To use the sample learner profiles after migrations:

```sh
npm run demo:seed
```

Seeding is optional. It writes the five demonstration accounts and their example progress to the configured database. Use a local demo database rather than a shared or production database.

## Visual Studio Code

Open the cloned repository folder in VS Code. In **Terminal → Run Task**, choose:

1. **LearnPath: Configure local environment**
2. **LearnPath: Install Python dependencies**
3. **LearnPath: Run database migrations**
4. **LearnPath: Run full stack**

The first task preserves an existing `.env`; edit its `DATABASE_URL` for the computer before migrating. PostgreSQL itself should already be installed and running. The tasks no longer depend on a Windows PostgreSQL installation directory.

## Optional PostgreSQL with Docker

If Docker Desktop or Docker Engine with the Compose plugin is available, the repository also has a PostgreSQL container:

```sh
docker compose up -d postgres
npm run db:migrate
npm run dev:local
```

In `.env`, point `DATABASE_URL` at `127.0.0.1:5432` with the `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` values used when the container was first created. Existing container volumes retain their original database credentials even if `.env` changes; update them through PostgreSQL or use a fresh development volume. The regular `dev:local` command uses the Python ML service on the host. For a fully containerized stack, use `docker compose up --build` and supply a strong `AUTH_ACCESS_TOKEN_SECRET` in the private `.env` first.

## Other useful commands

```sh
npm run build
npm run typecheck
npm test
npm run test:ml
npm run db:status
```

Use `npm run demo:seed` only when the configured database is your local demonstration database. The PostgreSQL content audits also use the connection in `.env` and are read-only. Never add `.env` or `.env.local` to Git.

## Troubleshooting

- **Connection refused:** Start PostgreSQL and check the host and port in `DATABASE_URL`.
- **Password authentication failed:** Use the PostgreSQL role and password created on this computer. URL-encode reserved password characters.
- **Database does not exist:** Create it in pgAdmin or PostgreSQL, then retry the migration command.
- **Port already in use:** Set the corresponding `WEB_PORT`, `API_PORT`, or `ML_PORT`, and update `WEB_ORIGIN` if the browser port changes.
- **Python 3.11 or 3.12 is missing:** Install one and rerun `npm run setup:python`; `PYTHON` can name a non-default interpreter path.
- **Setup says an environment already exists:** The setup command intentionally preserves your private configuration. Edit `.env` or `.env.local` directly.

Connection errors name the failed PostgreSQL condition without printing the database URL or its password.
