# Apna Samaj — Batch 14O.6: Staging Environment Setup Plan

**Planning Date:** 2026-10-29T15:44:00 IST  
**Target Feature:** Controlled Staging Verification of Appeals Workflow (14 Test Cases)  
**Status:** **PLANNING COMPLETE — AWAITING USER APPROVAL**  
**Production Protection Policy:** Zero writes to Production database (`tgyrrobrdhbzgheygvdz`). Zero code or configuration modifications during planning phase.

---

## 1. Phase 1: Read-Only Inspection Findings

### 1.1 Monorepo Structure & Workspace Scripts
- Monorepo manages 3 applications (`apps/api`, `apps/web`, `apps/admin`) and 4 shared packages (`packages/database`, `packages/shared-types`, `packages/validation`, `packages/ui-config`).
- Root `package.json` defines generic development and build scripts (`dev:api`, `dev:web`, `dev:admin`, `db:migrate`, `db:generate`, `db:seed`).
- There are currently **no dedicated staging scripts** (e.g., `dev:api:staging`, `db:migrate:staging`, `test:e2e:staging`).
- All default dev scripts load `.env` from the project root or workspace directories.

### 1.2 Prisma Schema & Migration History
- Datasource in `packages/database/prisma/schema.prisma` uses PostgreSQL with:
  - `url = env("DATABASE_URL")`
  - `directUrl = env("DIRECT_URL")`
- A total of **8 sequential migrations** exist in `packages/database/prisma/migrations`:
  1. `20261015135430_init_phase1_auth_feed_groups`
  2. `20261015144722_add_refresh_token_family_rotation`
  3. `20261015151418_add_audit_log_model`
  4. `20261020151500_add_notification_model`
  5. `20261020183000_add_chat_message_model`
  6. `20261020203000_add_matrimonial_module`
  7. `20261023194000_add_post_view_model`
  8. `20261028193000_add_post_appeal_model`
- **Zero proprietary PostgreSQL extensions required**: Standard PostgreSQL 18 natively supports all 8 migrations without additional cloud extensions.

### 1.3 Tenant Resolution & Database Configuration
- In `packages/database/src/tenant-manager.ts`:
  - `kewat` tenant resolves via `COMMUNITY_KEWAT_DATABASE_URL` (falling back to `DATABASE_URL`).
  - `gupta` tenant resolves via `COMMUNITY_GUPTA_DATABASE_URL` (currently unconfigured).
  - All community instances are cached in `TenantDatabaseManager`.
- In `apps/api/src/middleware/tenant.middleware.ts`:
  - `resolveTenantContext` verifies hostnames, origins, and `x-community-slug` headers.
  - Fail-closed tenant context checks ensure requests without a resolved community database are rejected with HTTP 400.

### 1.4 Authentication Architecture
- JWT access token generation and validation (`apps/api/src/modules/auth/auth.tokens.ts`) use standard HS256 HMAC tokens signed with `JWT_ACCESS_SECRET`.
- **Zero hard cloud dependency on Supabase JWKS for core API authentication**: The authentication system is completely self-contained when `JWT_ACCESS_SECRET` is configured.

### 1.5 Existing Seed Scripts
- `packages/database/src/seed.ts` only seeds the initial `SUPER_ADMIN` account from `BOOTSTRAP_ADMIN_*` variables.
- It does **not** generate sample members, sample community moderators, or sample moderated post audit records necessary for the 14 Appeals workflow staging tests.

### 1.6 `.gitignore` Secrets & Environment Audit
- Current `.gitignore` rules:
  ```gitignore
  .env
  .env.local
  .env.development.local
  .env.test.local
  .env.production.local
  *.pem
  ```
- **CRITICAL GAP**: `.env.staging` is **not explicitly listed** in `.gitignore`. If `.env.staging` were created without updating `.gitignore`, Git would treat it as an untracked file, creating an accidental commit risk.

---

## 2. Phase 2: Staging Options Evaluation

### Option A: Separate Supabase Cloud Project Dedicated to Staging
- **Overview:** Create a new project (e.g., `apna-samaj-staging`) on the Supabase cloud dashboard.
- **Advantages:**
  - Identical cloud networking and PgBouncer pooler architecture as Production.
  - Can be reached remotely if deploying preview builds to Render or Vercel.
- **Disadvantages & Risks:**
  - **Account Limits:** Supabase Free Plan restricts organizations to 2 active projects. Pauses inactive projects after 7 days.
  - **No Managed Backups:** Free tier does not include automated dashboard backup snapshots.
  - **Setup Overhead:** Requires manual project creation, generating new publishable/secret keys, and configuring separate cloud settings.
  - **Operational Risk:** If connection strings are inadvertently miscopied, there is a risk of pointing staging to the production Supabase reference.

---

### Option B: Separate Local PostgreSQL Database for Staging (RECOMMENDED)
- **Overview:** Utilize the existing, already running local PostgreSQL 18 server (`postgresql-x64-18` on port `5432`) to host an isolated database named `apnasamaj_staging_kewat`.
- **Advantages:**
  - **100% Physical and Network Isolation:** Completely decoupled from the cloud Supabase Tokyo infrastructure (`tgyrrobrdhbzgheygvdz`). Zero possibility of network packets reaching production during testing.
  - **Zero Cost & No Quotas:** No cloud quotas, project limits, or inactivity pausing.
  - **PostgreSQL 18 is Already Installed and Running:** Inspection confirmed `postgresql-x64-18` (PID 7408) is actively running on the host machine.
  - **Instant Reset & Teardown:** Staging data can be created, truncated, migrated, or destroyed locally in seconds without affecting live users.
  - **Self-Contained Auth:** Apna Samaj's JWT signing runs natively without cloud dependencies.
- **Disadvantages:**
  - Runs locally on the development machine (not accessible from public Vercel/Render preview URLs without a tunneling tool like ngrok).

---

### Recommendation: **Option B (Separate Local PostgreSQL Database)**
Option B is the **simplest, safest, most cost-effective, and lowest-risk approach** for validating Batch 14O.5 controlled staging test cases.

---

## 3. Phase 3: Setup Instructions & Architecture

```mermaid
flowchart TD
    subgraph PRODUCTION ["Production Cloud (DO NOT TOUCH)"]
        ProdDB[("Supabase Tokyo DB\ntgyrrobrdhbzgheygvdz\nPort 5432 / 6543")]
        ProdAPI["Render Production API\napnasamaj-api.onrender.com"]
        ProdWeb["Vercel Production Web\napna-samaj.vercel.app"]
        ProdAPI --> ProdDB
        ProdWeb --> ProdAPI
    end

    subgraph STAGING ["Isolated Local Staging Environment"]
        StagingDB[("Local PostgreSQL 18\napnasamaj_staging_kewat\nlocalhost:5432")]
        StagingAPI["Local Staging API\nlocalhost:4001\nNODE_ENV=staging"]
        StagingWeb["Local Staging Web\nlocalhost:5173"]
        StagingAdmin["Local Staging Admin\nlocalhost:5174"]
        
        StagingAPI --> StagingDB
        StagingWeb --> StagingAPI
        StagingAdmin --> StagingAPI
    end
    
    style PRODUCTION fill:#ffebee,stroke:#c62828,stroke-width:2px
    style STAGING fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
```

### 3.1 Required Staging Environment Variables (Placeholders Only)

A dedicated local file `.env.staging` (kept strictly uncommitted via `.gitignore`) will be used:

```dotenv
# Server Configuration
PORT=4001
NODE_ENV=staging

# Frontend CORS Origins
CLIENT_URL="http://localhost:5173"
ADMIN_URL="http://localhost:5174"

# ISOLATED LOCAL STAGING DATABASE (ZERO PRODUCTION CONNECTION)
# Format: postgresql://[LOCAL_USER]:[LOCAL_PASSWORD]@localhost:5432/apnasamaj_staging_kewat
DATABASE_URL="postgresql://postgres:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/apnasamaj_staging_kewat?schema=public"
DIRECT_URL="postgresql://postgres:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/apnasamaj_staging_kewat?schema=public"
COMMUNITY_KEWAT_DATABASE_URL="postgresql://postgres:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/apnasamaj_staging_kewat?schema=public"
COMMUNITY_KEWAT_DIRECT_URL="postgresql://postgres:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/apnasamaj_staging_kewat?schema=public"

# Staging Authentication Secrets (Independent from Production)
JWT_ACCESS_SECRET="staging_only_jwt_secret_minimum_32_characters_random_string"
JWT_ACCESS_EXPIRES_IN="15m"

# Staging Bootstrap SuperAdmin (Placeholders for local test setup)
BOOTSTRAP_ADMIN_PHONE="+919999900000"
BOOTSTRAP_ADMIN_PASSWORD="StagingAdminPassword123!"
BOOTSTRAP_ADMIN_NAME="Staging SuperAdmin"
```

---

### 3.2 Database Creation & Verification Workflow

#### Step 1: Create the Local Staging Database
Using PostgreSQL 18 CLI tools (`C:\Program Files\PostgreSQL\18\bin\psql.exe`):
```sql
CREATE DATABASE apnasamaj_staging_kewat;
```

#### Step 2: Apply All 8 Prisma Migrations to Staging
Run Prisma migration deployment pointing strictly to the staging environment file:
```powershell
# Using dotenv-cli or PowerShell environment override
$env:DATABASE_URL="postgresql://postgres:LOCAL_PASS@localhost:5432/apnasamaj_staging_kewat?schema=public"
$env:DIRECT_URL="postgresql://postgres:LOCAL_PASS@localhost:5432/apnasamaj_staging_kewat?schema=public"
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```
*Expected Output:* `8 migrations applied` on database `apnasamaj_staging_kewat`.

---

### 3.3 Safe Staging Seed Data Creation

A dedicated, non-production staging seed script (`packages/database/src/seed-staging.ts`) will be introduced. It will feature a **Hard Assertion Guard**:
```typescript
// Hardcoded Fail-Safe: Abort immediately if connection string points to Production
const currentDbUrl = process.env.DATABASE_URL || '';
if (
  currentDbUrl.includes('tgyrrobrdhbzgheygvdz') ||
  currentDbUrl.includes('supabase.co') ||
  currentDbUrl.includes('supabase.com')
) {
  console.error('FATAL SAFETY VIOLATION: Refusing to run staging seed against Production Supabase!');
  process.exit(1);
}
```

#### Seeded Test Entities for Appeals Verification:
1. **Test Author Member**:
   - Phone: `+919999900001`
   - Role: `MEMBER`
   - Name: `Staging Author`
2. **Test Intruder Member**:
   - Phone: `+919999900002`
   - Role: `MEMBER`
   - Name: `Staging Intruder`
3. **Test Community Moderator**:
   - Phone: `+919999900003`
   - Role: `MODERATOR`
   - Name: `Staging Moderator`
   - Community: `kewat`
4. **Moderated Post Prerequisite**:
   - A synthetic Post ID: `aaaaaaaa-0000-0000-0000-000000000001`
   - Corresponding `MODERATION_DELETE_POST` AuditLog record referencing `postAuthorId: <Author Member ID>`.

---

### 3.4 Verification: Confirming Target Is NOT Production

Before executing any staging tests, an automated preflight script will verify:
1. **Hostname Assertion:** Hostname MUST be `localhost` or `127.0.0.1`.
2. **Database Name Assertion:** Database name MUST be `apnasamaj_staging_kewat`.
3. **Reference Exclusion:** Hostname MUST NOT contain `tgyrrobrdhbzgheygvdz` or `pooler.supabase.com`.
4. **Isolated Data Assertion:** Querying `User` table returns only the 3 seeded `+9199999*` test accounts.

---

### 3.5 Production Deployment Protection

1. **Git Protection:**
   - Add `.env.staging` and `.env.*.local` to `.gitignore`.
2. **Platform Protection:**
   - Vercel and Render inject production environment variables directly from their dashboard settings, ignoring local `.env` files.
3. **Code Safety:**
   - Production startup scripts will continue reading the standard production environment variables.

---

## 4. Code / Configuration Changes Required (Pending Approval)

The following minimal, non-breaking modifications are required before starting Batch 14O.6:

1. **`.gitignore` Update**:
   - Add `.env.staging` and `.env.staging.local` to `.gitignore` to guarantee staging configuration cannot be committed.
2. **Staging NPM Scripts (Monorepo root `package.json`)**:
   - `"dev:api:staging": "dotenv -e .env.staging -- npm run dev:api"`
   - `"db:migrate:staging": "dotenv -e .env.staging -- npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma"`
   - `"db:seed:staging": "dotenv -e .env.staging -- tsx packages/database/src/seed-staging.ts"`
3. **Staging Seed Script**:
   - Create `packages/database/src/seed-staging.ts` with hard fail-safe production checks.

*(Note: Per safety rules, NONE of these changes have been made yet. They will only be implemented upon user approval).*

---

## 5. Risks & Mitigation Matrix

| Identified Risk | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Accidental connection to Production DB** | **CRITICAL** | Hard-coded string checks in `seed-staging.ts` and test runner that crash if `tgyrrobrdhbzgheygvdz` or `supabase` is in the database URL. |
| **Leaking staging credentials to Git** | **HIGH** | Explicitly add `.env.staging` to root `.gitignore` before file creation. |
| **Port conflict with default API server** | **LOW** | Set staging API port to `4001` (production dev uses `4000`). |

---

## 6. Verification Checklist

- [ ] `.gitignore` updated to ignore `.env.staging*`.
- [ ] Database `apnasamaj_staging_kewat` created on local PostgreSQL 18.
- [ ] Staging database verified empty and isolated from Supabase.
- [ ] 8 Prisma migrations applied cleanly to `apnasamaj_staging_kewat`.
- [ ] Staging test seed data instantiated (Author, Intruder, Moderator, AuditLog).
- [ ] Automated isolation preflight confirms target database is `localhost:5432/apnasamaj_staging_kewat`.
- [ ] Ready to run 14 Appeals workflow staging test cases.

---

## 7. Recommended Next Batch

**Batch 14O.7: Staging Environment Implementation & Test Execution**
Upon your approval, implement the setup steps above, verify the isolated staging database, and execute the 14 staging test cases.

