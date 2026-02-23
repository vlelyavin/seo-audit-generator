# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack SEO/Web Audit Tool that crawls websites and analyzes 20+ SEO metrics with real-time progress reporting. Built with a hybrid backend architecture combining Python FastAPI for audit processing and Next.js API routes for authentication and database operations.

**Tech Stack:**

- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- Backend: Python FastAPI + Next.js API Routes
- Database: SQLite + Prisma ORM
- Authentication: NextAuth v5 (Google OAuth + Credentials)
- Internationalization: next-intl (Ukrainian, Russian, English)
- Real-time: Server-Sent Events (SSE) with polling fallback

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
npm run dev        # Development server (http://localhost:3000)
npm run build      # Production build
npm run start      # Production server
npm run lint       # ESLint
```

### Backend (FastAPI)

```bash
# From project root
uvicorn app.main:app --reload  # Development (http://localhost:8000)
# Production uses systemd service (seo-audit.service)
```

### Database (Prisma)

```bash
cd frontend
npx prisma generate           # Generate Prisma Client
npx prisma migrate dev        # Run migrations (development)
npx prisma migrate deploy     # Run migrations (production)
npx prisma studio             # Open Prisma Studio GUI
npx tsx prisma/seed.ts        # Seed database
```

## Git Workflow

**Solo project — branches for safety, not collaboration.**

### Rules

1. `master` is always deployable. Never commit directly to it.
2. One branch per task/phase.
3. Commit frequently on the branch — messy is fine.
4. **Push only `master` to remote** after all phases of a plan are complete.

### Per-Phase Flow

```bash
# Before starting a phase
git checkout -b phase-1-realtime-refresh

# Work, commit as you go
git add -A && git commit -m "phase 1: add polling for indexing stats"

# When phase is done and working — stay on branch, move to next phase prompt
# Do NOT push yet
```

### After ALL Phases Complete

```bash
# Merge each phase branch into master
git checkout master
git merge phase-1-realtime-refresh
git merge phase-2-bing-flow
# ... etc

# Push once
git push origin master

# Clean up local branches
git branch -d phase-1-realtime-refresh
git branch -d phase-2-bing-flow
```

### Commit Messages

Keep it simple: `"phase N: short description of what changed"`

Examples:

- `"phase 1: add polling for indexing stats"`
- `"phase 2: bing key upload modal + verification"`
- `"phase 3: run now button with job status UI"`

### What NOT to Do

- Commit directly to `master`
- Push branches to remote (local only)
- Squash/rebase (merge is fine for solo)
- Create PRs

## Architecture Overview

### Dual Backend Architecture

This project uses **two separate backends** that work together:

#### 1. FastAPI Backend (Python) - `/app/`

**Purpose:** Web crawling and SEO analysis

- Crawls websites using Playwright (headless browser)
- Runs 20+ SEO analyzers in parallel
- Generates reports (HTML/PDF/DOCX)
- Streams real-time progress via Server-Sent Events (SSE)
- **No database** - uses in-memory storage during audits

**Entry point:** `/app/main.py`

#### 2. Next.js Backend (TypeScript) - `/frontend/src/app/api/`

**Purpose:** Authentication, database, and business logic

- Handles user authentication (NextAuth v5)
- Manages database operations (Prisma + SQLite)
- Enforces plan-based rate limiting
- Proxies audit requests to FastAPI
- Serves the React frontend

### Request Flow

```
User Browser
    ↓
Next.js API Route (/api/audit/start)
    ↓
Validate: Authentication + Plan Limits
    ↓
Create Audit record in database
    ↓
Proxy request → FastAPI (/api/audit)
    ↓
FastAPI: Background task (crawl + analyze)
    ↓
SSE Progress Stream → Browser
    ↓
Results saved: In-memory (FastAPI) + Database (Next.js)
```

### Directory Structure

```
/app/                           # FastAPI backend
├── main.py                     # FastAPI routes & audit orchestration
├── crawler.py                  # WebCrawler (async BFS with Playwright)
├── models.py                   # Pydantic data models
├── config.py                   # Settings (MAX_PAGES, timeouts, etc.)
├── analyzers/                  # 20+ SEO analyzer modules
│   ├── base.py                # BaseAnalyzer abstract class
│   ├── meta_tags.py
│   ├── headings.py
│   └── ... (20+ more)
├── locales/                    # Backend i18n JSON files
└── templates/                  # Jinja2 report templates

/frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/          # Locale-prefixed routes
│   │   └── api/               # Next.js API routes
│   ├── components/            # React components
│   ├── hooks/                 # Custom hooks (useAuditProgress)
│   ├── lib/                   # Utilities (auth, API client, Prisma)
│   ├── providers/             # React context (Session, Theme)
│   └── types/                 # TypeScript definitions
├── prisma/                    # Database schema & migrations
├── messages/                  # Frontend i18n JSON files
└── public/                    # Static assets
```

## Key Patterns & Conventions

### 1. Analyzer Pattern (Backend)

All SEO analyzers follow a consistent pattern:

```python
# Located in: /app/analyzers/
from analyzers.base import BaseAnalyzer, AnalyzerResult

class MyAnalyzer(BaseAnalyzer):
    analyzer_id = "my_analyzer"

    async def analyze(self, pages: List[PageData]) -> AnalyzerResult:
        issues = []
        # Analysis logic here
        return AnalyzerResult(
            status="OK" | "WARNING" | "ERROR",
            issues=issues,
            metadata={}
        )
```

**To add a new analyzer:**

1. Create file in `/app/analyzers/`
2. Extend `BaseAnalyzer` class
3. Implement `analyze()` method
4. Register in `/frontend/src/lib/constants.ts` (ANALYZERS list)
5. Add translations to all locale files (`/frontend/messages/`, `/app/locales/`)

### 2. API Route Pattern (Frontend)

All Next.js API routes follow authentication and error handling patterns:

```typescript
// Located in: /frontend/src/app/api/
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Business logic
  // ...

  // 3. Return response
  return NextResponse.json({ data });
}
```

**Key practices:**

- Always check `session?.user` for protected routes
- Enforce plan limits in `/api/audit/start`
- Use `fastapiFetch()` helper to proxy to FastAPI backend
- Return proper HTTP status codes (401, 403, 400, 500)

### 3. Real-Time Progress Pattern

The app uses **SSE (Server-Sent Events)** with **polling fallback**:

```typescript
// Custom hook: /frontend/src/hooks/use-audit-progress.ts
const { progress, connected, done } = useAuditProgress(fastApiId);

// Logic:
// 1. Attempt SSE connection to /api/audit/{id}/status
// 2. Retry up to 2 times with 2-second delays
// 3. Fall back to polling /api/audit/{id}/current-status every 2 seconds
// 4. Clean up EventSource and intervals on unmount
```

### 4. Internationalization (i18n)

**Frontend:** next-intl with locale-prefixed routes

```typescript
// Locales: en, uk (Ukrainian), ru (Russian)
// Routes: /en/dashboard, /uk/dashboard, /ru/dashboard

const t = useTranslations("namespace");
const locale = useLocale();
```

**Backend:** Custom i18n system

```python
# /app/i18n.py
translator = Translator(language="uk")
translated_text = translator.translate("key.path")
```

**Translation files:**

- Frontend: `/frontend/messages/{locale}.json`
- Backend: `/app/locales/{locale}.json`

### 5. Authentication & Authorization

**NextAuth v5 Configuration:** `/frontend/src/lib/auth.ts`

**Providers:**

- Google OAuth
- Credentials (email/password with bcrypt hashing)

**Session augmentation:**

- JWT includes: `id`, `role`, `planId`
- Roles: `"user"` (default) or `"admin"`

**Protected routes:**

```typescript
const session = await auth();
if (!session?.user) {
  redirect("/login");
}

// Admin check
if (session.user.role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### 6. Database Schema (Prisma)

Located in: `/frontend/prisma/schema.prisma`

**Core models:**

- **User** - User accounts with role and plan
- **Plan** - Subscription tiers (auditsPerMonth, maxPages, whiteLabel)
- **Audit** - Audit records (linked to User via userId, linked to FastAPI via fastApiId)
- **BrandSettings** - White-label customization (companyName, logoUrl, colors)
- **Account** - OAuth provider accounts
- **Session** - NextAuth sessions

**Key relationships:**

- User ← (1:N) → Audit
- User ← (N:1) → Plan
- User ← (1:1) → BrandSettings

### 7. Styling Conventions

**Tailwind CSS v4** - utility-first approach

**Key conventions:**

- Pure neutral gray palette (no blue tints)
- Dark mode via `next-themes` (class strategy)
- Use `cn()` utility for conditional classes:

  ```typescript
  import { cn } from "@/lib/utils";

  className={cn(
    "px-4 py-2",
    isActive && "bg-blue-500"
  )}
  ```

## Important Files Reference

### Configuration

- [next.config.ts](frontend/next.config.ts) - Next.js config with next-intl plugin
- [tsconfig.json](frontend/tsconfig.json) - TypeScript config with path aliases (`@/`)
- [config.py](app/config.py) - FastAPI settings (MAX_PAGES, timeouts, etc.)
- [.env](frontend/.env) - Frontend env (Database URL, NextAuth secrets, FastAPI URL)
- [.env](.env) - Backend env (PageSpeed API key, crawl limits)

### Core Backend Files

- [main.py](app/main.py) - FastAPI app, routes, audit orchestration
- [crawler.py](app/crawler.py) - WebCrawler class (async BFS with Playwright)
- [models.py](app/models.py) - Pydantic models (AuditResult, PageData, etc.)
- [report_generator.py](app/report_generator.py) - Report generation (HTML/PDF/DOCX)

### Core Frontend Files

- [auth.ts](frontend/src/lib/auth.ts) - NextAuth configuration
- [middleware.ts](frontend/src/middleware.ts) - Locale routing middleware
- [api-client.ts](frontend/src/lib/api-client.ts) - FastAPI fetch helper (`fastapiFetch()`)
- [prisma.ts](frontend/src/lib/prisma.ts) - Prisma singleton
- [use-audit-progress.ts](frontend/src/hooks/use-audit-progress.ts) - Real-time progress hook

## Development Workflows

### Working with Audits

The audit lifecycle spans both backends:

1. **Start audit** - User submits form in Next.js frontend
2. **Validation** - `/api/audit/start` checks auth + plan limits
3. **Database record** - Next.js creates Audit in Prisma
4. **Proxy to FastAPI** - Request sent to `/api/audit` endpoint
5. **Background task** - FastAPI runs async crawling + analysis
6. **Real-time updates** - SSE streams progress to frontend
7. **Results storage** - In-memory (FastAPI) + Database (Next.js)

### Adding New Analyzers

Step-by-step workflow:

1. Create new file in `/app/analyzers/my_analyzer.py`
2. Extend `BaseAnalyzer` class
3. Implement `analyze()` method returning `AnalyzerResult`
4. Add analyzer ID to `/frontend/src/lib/constants.ts` (ANALYZERS array)
5. Add translation keys to all locale files:
   - `/frontend/messages/en.json` (under `analyzers.my_analyzer`)
   - `/frontend/messages/uk.json`
   - `/frontend/messages/ru.json`
   - `/app/locales/en.json`
   - `/app/locales/uk.json`
   - `/app/locales/ru.json`

### Translation Key Structure Rules

**CRITICAL:** Always follow the three-section structure for analyzer translations:

```
analyzer_content.{analyzer_name}/
├── issues/           # Issue messages shown to users
│   ├── {key}        # Main issue message
│   ├── {key}_details        # ❌ INCORRECT - don't add _details suffix here
│   └── {key}_recommendation # ❌ INCORRECT - don't add _recommendation suffix here
├── details/          # Detailed explanations (separate section)
│   └── {key}        # ✓ CORRECT - matches issue key name
└── recommendations/  # Fix suggestions (separate section)
    └── {key}        # ✓ CORRECT - matches issue key name
```

**Correct Pattern:**

```python
# In analyzer code (e.g., robots.py):
issues.append(self.create_issue(
    category="no_robots_txt",
    message=self.t("analyzer_content.robots.issues.no_robots_txt"),
    details=self.t("analyzer_content.robots.details.no_robots_txt"),  # ✓ CORRECT
    recommendation=self.t("analyzer_content.robots.recommendations.no_robots_txt"),  # ✓ CORRECT
))
```

**Incorrect Pattern (DO NOT USE):**

```python
# ❌ WRONG - don't suffix with _details or _recommendation in the issues section
details=self.t("analyzer_content.robots.issues.no_robots_txt_details"),  # ❌ WRONG
recommendation=self.t("analyzer_content.robots.issues.no_robots_txt_recommendation"),  # ❌ WRONG
```

**Key Naming Conventions:**

- `analyzer_content.{name}.issues.{key}` - Short issue message (e.g., "robots.txt missing: {count} pages")
- `analyzer_content.{name}.details.{key}` - Longer explanation of why this is a problem
- `analyzer_content.{name}.recommendations.{key}` - Specific steps to fix the issue
- `tables.{field_name}` - Table column headers (e.g., `tables.url`, `tables.problem`)
- Status labels go in issues section: `analyzer_content.{name}.issues.status_{label}`

**Reference Implementations:**

- ✓ [app/analyzers/schema.py](app/analyzers/schema.py) - Correct pattern (lines 111-112, 121-123)
- ✓ [app/analyzers/social_tags.py](app/analyzers/social_tags.py) - Correct pattern
- ⚠️ [app/analyzers/robots.py](app/analyzers/robots.py) - Used incorrect pattern (now fixed in translations)

### Modifying Subscription Plans

1. Update Prisma schema: `/frontend/prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name description`
3. Update seed data: `/frontend/prisma/seed.ts`
4. Re-seed database: `npx tsx prisma/seed.ts`
5. Update frontend constants if needed: `/frontend/src/lib/constants.ts`

## Deployment

**Production infrastructure:**

- **Nginx** reverse proxy (config: `nginx-seo-audit.conf`)
- **systemd services:**
  - `nextjs-seo-audit.service` - Next.js frontend + API
  - `seo-audit.service` - FastAPI backend
- **Deployment script:** `deploy.sh`
- **Next.js:** Standalone output mode enabled for containerization

**Environment separation:**

- Development: SQLite (`dev.db`)
- Production: Same schema, separate database file

## Testing

Currently no automated test suite. Manual testing via:

```bash
# Terminal 1: Start FastAPI
uvicorn app.main:app --reload

# Terminal 2: Start Next.js
cd frontend && npm run dev

# Browser: http://localhost:3000
```
