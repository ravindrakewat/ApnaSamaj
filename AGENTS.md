# AGENTS.md — Agent & Assistant Guidelines

## Apna Samaj Project Continuity

Welcome to the Apna Samaj monorepo (`https://github.com/ravindrakewat/ApnaSamaj.git`).

To maintain seamless continuity across different workstations, laptops, and Antigravity sessions, all AI coding assistants and autonomous agents must adhere to the following protocol:

### 1. Preflight Routine (Before Starting Any Task)
1. **Read Engineering History:** Always read [`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md) to understand current architecture, confirmed commit history, completed modules, and current in-progress work.
2. **Inspect Working Tree:** Run `git status --short`, `git branch --show-current`, and `git rev-parse HEAD` before touching any code.
3. **Check Latest Batch Report:** Read the latest batch report (e.g., `BATCH_15D_2_...`) to align with existing implementations and test suites.
4. **Identify Next Batch:** Confirm that your planned task matches the next scheduled batch identified in Section F of `docs/PROJECT_HISTORY.md`.

### 2. Multi-Tenant Architectural Invariants
All code modifications must strictly preserve the platform's multi-tenant security architecture:
- **Explicit Tenant Context:** Requests must provide tenant identity via header `x-community-slug`, subdomain, or path.
- **Tenant-Scoped DB Only:** All queries must execute via `req.db` and be guarded with `assertDb(req.db)`.
- **No Default Fallbacks:** Never silently fall back to a central or default database if tenant resolution fails.
- **SUPER_ADMIN Boundaries:** `SUPER_ADMIN` privileges must never bypass physical tenant database isolation.
- **Private Group Privacy:** Posts and rosters of private/secret groups must be accessible exclusively to active members.
- **Zero Sensitive Data Exposure:** Password hashes, reset tokens, auth tokens, and private contact info must never be exposed in API responses.

### 3. Git & Deployment Safety Rules
- **Never Stage or Commit Without Review:** Do not execute `git add .` or commit files without an explicit batch audit and clear staging allowlist.
- **Never Push or Deploy Without Explicit User Request:** Do not run `git push`, `git fetch`, `git pull`, or deploy commands unless explicitly instructed by the user.
- **Zero Secrets Policy:** Never write, log, or commit `.env` values, API keys, JWT secrets, database connection strings, or personal sensitive information.

### 4. Post-Batch Completion Routine (At the End of Every Batch)
1. **Run Verification:** Execute relevant test suites, typechecks (`npm run typecheck`), and builds (`npm run build`).
2. **Generate Batch Report:** Document all changes, security checks, and test results in `BATCH_<ID>_<NAME>_REPORT.md`.
3. **Update Project History:** Update [`docs/PROJECT_HISTORY.md`](docs/PROJECT_HISTORY.md) Section E (Batch History) and Section F (Current Work) with the latest verified results, git status, and next recommended batch.

