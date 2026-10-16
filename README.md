# Apna Samaj

A modern community platform built as a TypeScript monorepo with React, Vite, Material UI, Express, and PostgreSQL (Prisma).

## Monorepo Architecture

```text
├── apps/
│   ├── web/         # Member Portal (React + Vite + TypeScript + MUI)
│   ├── admin/       # Admin Management Portal (React + Vite + TypeScript + MUI)
│   ├── api/         # Core Backend Service (Node.js + Express + TypeScript)
│   └── mobile/      # [Reserved] React Native Mobile App
└── packages/
    ├── database/    # Prisma Schema & Client Export
    ├── shared-types/# Universal TypeScript Models & DTOs
    ├── validation/  # Shared Zod Schemas
    └── ui-config/   # Shared Material UI Themes & Tokens
```

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Generate Prisma Client (local types only):
   ```bash
   npx prisma generate --schema=packages/database/prisma/schema.prisma
   ```

3. Run in development:
   - Web App: `npm run dev:web`
   - Admin App: `npm run dev:admin`
   - API Server: `npm run dev:api`

4. Typecheck & Build:
   - Typecheck: `npm run typecheck`
   - Build: `npm run build`
