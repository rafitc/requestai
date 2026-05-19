# RequestAi

Turn any API documentation — OpenAPI, Swagger, Postman, HAR, GraphQL SDL, Markdown, HTML — into ready-to-import collections for Postman, Bruno, Hoppscotch, and Thunder Client.

Paste a URL, hit generate, download. Powered by a configurable AI backend (Claude or OpenAI). Email-OTP and Google sign-in, credit-metered usage, Razorpay payments.

## How it works

```
       ┌──────────────┐     URL / upload     ┌──────────────┐
       │   next-web   │ ───────────────────► │ express-api  │
       │  (frontend)  │ ◄─────────────────── │   (server)   │
       └──────────────┘   collection JSON    └──────┬───────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          ▼                         ▼                         ▼
                  ┌──────────────┐         ┌──────────────┐           ┌──────────────┐
                  │   pg-boss    │         │ AiService    │           │  Postgres    │
                  │   (queue)    │         │ Claude/OpenAI│           │   (Drizzle)  │
                  └──────────────┘         └──────────────┘           └──────────────┘
```

The frontend submits a source (URL or file) and selected target platforms. The API runs a **preflight** to classify the doc and reject anything it can't read (JS-rendered SPAs, AsyncAPI, encrypted PDFs). On success it enqueues a `generate-collection` job that runs through _ingest → AI → validate → export → store_. The frontend polls job status, then offers per-platform downloads.

## Tech stack

| Layer      | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Monorepo   | Turborepo + pnpm workspaces                                             |
| Frontend   | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (dark theme by default) |
| Backend    | Express 5, Better Auth (OTP + Google), pg-boss for jobs                 |
| Database   | PostgreSQL via Drizzle ORM                                              |
| Validation | Zod (shared between FE/BE via `@requestai/api-types`)                   |
| AI         | Anthropic Claude _or_ OpenAI — selected via env, not by users           |
| Payments   | Razorpay (one-time credit packs, international payments enabled)        |
| Email      | nodemailer (SMTP) for transactional; Mailgun support included           |

Node 22.x and pnpm 9+ required (`.nvmrc` is checked in).

## Repository layout

```
requestai/
├── apps/
│   ├── next-web/                 # Frontend (port 4020)
│   └── express-api-server/       # API + workers (port 3020)
├── packages/
│   ├── api-types/                # Shared Zod schemas
│   ├── better-auth/              # Auth instance + plugins (OTP, Google, signup-grant hook)
│   ├── database/                 # Drizzle schemas + client + migrations
│   ├── email-templates/          # React Email templates
│   ├── eslint-config/            # Shared ESLint config
│   └── typescript-config/        # Shared tsconfig presets
├── tooling/                      # Monorepo utilities
└── turbo.json
```

## Getting started

### Prerequisites

- Node.js 22.x (`nvm use` will read `.nvmrc`)
- pnpm 9+
- PostgreSQL 14+ running locally (or any reachable instance)
- A local SMTP catch-all for dev — [Mailpit](https://mailpit.axllent.org/) is what the defaults assume (`localhost:1025`, web UI on `localhost:8025`)

### One-time setup

```bash
# Clone + install
git clone <repository-url>
cd requestai
pnpm install

# Copy the env template for the backend
cp apps/express-api-server/.env.example apps/express-api-server/.env.development.local
# Edit the file — at minimum set DATABASE_* and BETTER_AUTH_SECRET (>=64 chars).
# `openssl rand -hex 48` will produce a usable secret.

# Build all workspace packages (one-time; subsequent runs use turbo)
pnpm build

# Create the database, then run migrations
createdb requestai
pnpm --filter @requestai/database db:generate
pnpm --filter @requestai/database db:migrate
```

### Run it

```bash
# All apps + workers
pnpm dev

# Or run them individually
pnpm --filter @requestai/express-api-server dev   # API on http://localhost:3020
pnpm --filter @requestai/next-web dev             # Web on http://localhost:4020
```

Visit `http://localhost:4020` → sign up with any email → grab the OTP from Mailpit (`http://localhost:8025`) → land on the dashboard with **3 free credits**.

### Try the flow

1. Click **New collection**
2. Paste `https://petstore3.swagger.io/api/v3/openapi.json`
3. Pick platforms (Postman, Bruno, Hoppscotch, Thunder)
4. **Analyze source** → **Create collection**
5. Watch the job step through the progress bar
6. Open the collection → **Download Postman** → import in Postman

## Environment

The full set of env vars and what each does is documented inline in [`apps/express-api-server/.env.example`](apps/express-api-server/.env.example). The important groups:

| Group       | Variables                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | `NODE_ENV`, `SERVICE_NAME`, `PORT`, `HAS_CLUSTERING_ENABLED`                                                                                                                              |
| CORS        | `CORS_ALLOWED_ORIGINS`, `CORS_CREDENTIALS`                                                                                                                                                |
| Database    | `DATABASE_URL` _or_ `DATABASE_HOST/PORT/USER/USER_PASSWORD/NAME`; `DB_POOL_*`, `DB_SSL`                                                                                                   |
| Better Auth | `BETTER_AUTH_SECRET` (≥64 chars), `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_ENABLE_RESPONSE_ENVELOPE=false`, `GOOGLE_CLIENT_ID`/`SECRET`, `SIGNUP_CREDIT_GRANT` |
| AI          | `AI_DEFAULT_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_CLAUDE_MODEL`, `OPENAI_API_KEY`, `AI_OPENAI_MODEL`                                                                                        |
| Razorpay    | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`                                                                                                                                                   |
| Storage     | `STORAGE_DRIVER` (`local`/`s3`), `STORAGE_LOCAL_DIR`, `STORAGE_S3_*`                                                                                                                      |
| Email       | `EMAIL_SERVICE_TRANSACTIONAL_SMTP_*`, `EMAIL_DEV_REDIRECT_TO` (route every dev email to one inbox)                                                                                        |

The frontend reads `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_API_TIMEOUT` from [`apps/next-web/.env.development`](apps/next-web/.env.development).

## API surface

| Method | Path                                       | Description                                                    |
| ------ | ------------------------------------------ | -------------------------------------------------------------- |
| `*`    | `/api/auth/*`                              | Better Auth catch-all (sign-in, OTP, Google callback, session) |
| `GET`  | `/api/health`                              | Unversioned health check                                       |
| `POST` | `/api/v1/collections`                      | Run preflight, create row, enqueue generation job              |
| `POST` | `/api/v1/collections/preflight`            | Classify a source without committing                           |
| `GET`  | `/api/v1/collections`                      | List the caller's collections                                  |
| `GET`  | `/api/v1/collections/:id`                  | Detail (latest version + OpenAPI doc)                          |
| `GET`  | `/api/v1/collections/:id/download/:format` | Download `postman` / `bruno` / `hoppscotch` / `thunder`        |
| `GET`  | `/api/v1/jobs/:id`                         | Job status (polled by FE)                                      |
| `GET`  | `/api/v1/credits/balance`                  | Current credit balance                                         |
| `GET`  | `/api/v1/users/`                           | Current user profile                                           |

All `/api/v1/*` business endpoints return the response envelope `{isSuccess, httpStatusCode, meta, error, data}`. Better Auth endpoints return raw responses — required by the React auth client.

## Useful commands

| Command                                         | Description                                      |
| ----------------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                                      | Run every app in dev mode                        |
| `pnpm build`                                    | Build everything                                 |
| `pnpm lint`                                     | ESLint across the monorepo                       |
| `pnpm check-types`                              | TypeScript across the monorepo                   |
| `pnpm format`                                   | Prettier                                         |
| `pnpm --filter @requestai/database db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm --filter @requestai/database db:migrate`  | Apply pending migrations                         |
| `pnpm --filter @requestai/database db:studio`   | Open Drizzle Studio                              |

## Status

A working prototype. End-to-end signup → create → poll → download all functions; the generation worker is currently a stub that emits a canned OpenAPI document. See the project plan for the live punch list — high-priority next steps:

- **Real AI generation** — wire `AiService` (Claude + OpenAI) into the worker, swap the stub for `ingest → AI → validate → export → store`
- **Credit enforcement** — debit on success, refund on failure, refuse to enqueue at balance 0
- **Razorpay billing** — order create + webhook verify + credit ledger entry; buy-credits UI
- **Update / rename / delete / share** — dashboard row actions + a public `/share/:slug` viewer
- **File upload** — `.md`, `.pdf`, `.docx` ingest behind a magic-byte detector
- **Native exporters** — replace OpenAPI-fallback for Bruno / Hoppscotch / Thunder Client with each tool's native format

## License

MIT
