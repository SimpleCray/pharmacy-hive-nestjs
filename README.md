# Pharmacy Hive (NestJS)

NestJS port of the Pharmacy Hive backend (originally Express + Sequelize). Same behavior: syncs **Jotform** submissions to **Monday.com** boards via OAuth, BullMQ background jobs, and a Monday custom recipe — including file-column uploads.

## ORM decision: Sequelize (kept)

We kept **Sequelize** (via `@nestjs/sequelize` + `sequelize-typescript`) instead of switching to TypeORM:

- Existing models, the 4 migrations, paranoid soft-delete, and `countSubscriptions` logic port **1:1** — lowest risk/effort.
- Switching to TypeORM would be a pure rewrite (models, migrations, query semantics) with no functional gain for this app.

Models moved from `Model.init(...)` to `sequelize-typescript` decorators (`@Table`/`@Column`); table names are pinned (`Users`, `MondaySubscriptions`, `SyncedFormSubmissions`) so the existing database and migrations work unchanged.

## Stack

- **NestJS 11** (Express platform)
- **TypeScript**
- **@nestjs/sequelize** + **sequelize-typescript** — MySQL (SQLite in test)
- **@nestjs/bullmq** + **Redis** — background jobs (queue name `sync-data`, unchanged)
- **@nestjs/config** + **Joi** — env validation
- **@nestjs/schedule** — daily cron (replaces node-cron)
- **monday-sdk-js**, **axios**, **winston**, **AppSignal**

## Run

```bash
npm install
cp .env.example .env   # fill in values
npm run db:migrate     # optional; app also syncs models on boot
npm run start:dev
```

Production: `npm run build` then `npm run start:prod`.

## How the Express app maps to NestJS

| Express | NestJS |
| --- | --- |
| `index.ts` + `app.ts` | `src/main.ts` (bootstrap) + `src/app.module.ts` |
| `routers/*.router.ts` | `@Controller`/`@Get`/`@Post` in each module |
| `controllers/*.controller.ts` | controllers in `src/modules/*` (HTTP) + `FormService` (sync logic) |
| `services/*.service.ts` (static) | `@Injectable()` providers (DI) |
| `middlewares/authentication.middleware.ts` | `common/guards/monday-auth.guard.ts` |
| `middlewares/jotform-webhook-secret.middleware.ts` | `common/guards/jotform-webhook-secret.guard.ts` |
| `middlewares/jotform-webhook.middleware.ts` (multer) | `NoFilesInterceptor()` on the webhook route |
| `models/*.model.ts` (Sequelize init) | `models/*.model.ts` (sequelize-typescript) |
| `queue/queue.ts` Worker | `modules/form/sync.processor.ts` (`@Processor`) |
| `services/queue.service.ts` | `modules/queue/queue.service.ts` |
| `config/env.config.ts` validate | `config/env.validation.ts` (Joi) + `ConfigModule` |
| node-cron midnight job | `modules/tasks/tasks.service.ts` (`@Cron`) |
| `scripts/*` | `src/scripts/*` (retrigger uses a Nest application context) |

## Routes (unchanged paths)

- `GET /` , `GET /health`
- `GET /api/auth`, `GET /api/auth/callback`
- `POST /api/fields/form-list`, `POST /api/fields/form-questions` (Monday JWT)
- `GET /api/actions/test`, `POST /api/actions/sync-submission-to-monday` (Monday JWT)
- `POST /api/subscriptions/form-submit/subscribe` / `unsubscribe` (Monday JWT)
- `POST /api/webhooks/form-submission?secret=APP_SECRET`
- `GET /api/queue/metrics`, `GET /api/queue/jobs/:jobId` (Monday JWT)
- `/admin/queues` — Bull Board (dev or `ENABLE_QUEUE_BOARD=true`; `?secret=APP_SECRET`)

## Notes

- `SequelizeModule` is configured with `synchronize: true` to mirror the Express app's `sequelize.sync({ force: false })` on boot. For production with migrations, set it to `false` in `src/app.module.ts`.
- The winston logger and `extractErrorInfo`/`extractMondayErrorMessage` helpers are reused as-is under `src/common/logger`.
- `src/config/database.config.js` is shared with `sequelize-cli` (see `.sequelizerc`).
