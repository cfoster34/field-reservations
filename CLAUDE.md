# Field Reservations Project - Claude Code Configuration

## Project Overview
This is a field reservations application built with:
- **Frontend**: Next.js (React) with TypeScript
- **Backend**: Vercel Serverless functions (Next.js API routes)
- **Database/Auth**: Supabase (Postgres, Auth, Storage)
- **Email**: SendGrid API
- **Deployment**: Serverless via Vercel

## Specialized Agents

### 1. Project Initialization Agent
**Purpose**: Sets up project structure and dependencies
**Commands**:
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
pnpm install
```

### 2. Database & Schema Agent
**Purpose**: Manages Supabase database operations
**Tools**: Supabase CLI
**Commands**:
```bash
supabase init
supabase migration new <migration_name>
supabase db push
supabase gen types typescript --local > src/types/database.types.ts
```
**Tasks**:
- Design database schemas for fields, reservations, users
- Create and manage migrations
- Set up Row Level Security (RLS) policies
- Configure real-time subscriptions

### 3. Authentication & Security Agent
**Purpose**: Implements secure authentication
**Tools**: Supabase Auth, dotenv-cli
**Commands**:
```bash
dotenv -e .env.local -- <command>
```
**Tasks**:
- Configure Supabase Auth providers
- Implement email/password and OAuth flows
- Manage RLS policies for data security
- Secure environment variable handling

### 4. API & Backend Agent
**Purpose**: Creates serverless API endpoints
**Location**: `src/app/api/`
**Tasks**:
- RESTful endpoints for fields and reservations
- Authentication middleware integration
- Data validation and sanitization
- Error handling and logging

### 5. Frontend/UI Agent
**Purpose**: Develops responsive user interfaces
**Libraries**: React, Chakra UI, Tailwind CSS, React Query
**Commands**:
```bash
pnpm add @chakra-ui/react @emotion/react @emotion/styled framer-motion
pnpm add @tanstack/react-query
```
**Tasks**:
- Mobile-first responsive design
- Field booking interface
- Admin management dashboard
- Real-time updates integration

### 6. Email & Notifications Agent
**Purpose**: Manages transactional emails
**Tools**: SendGrid CLI and API
**Commands**:
```bash
sg-cli config set --api-key <key>
```
**Tasks**:
- Reservation confirmation emails
- Reminder notifications
- Admin alerts
- Email template management

### 7. Testing & Quality Assurance Agent
**Purpose**: Ensures code quality
**Tools**: Jest, Playwright, ESLint
**Commands**:
```bash
pnpm test
pnpm test:e2e
pnpm lint
```
**Coverage Target**: >90%

### 8. Deployment & CI/CD Agent
**Purpose**: Automates deployment pipeline
**Tools**: Vercel CLI, GitHub Actions
**Commands**:
```bash
vercel
vercel --prod
vercel logs
```
**Tasks**:
- Automatic deployments on push
- Preview deployments for PRs
- Environment variable management

### 9. Monitoring & Maintenance Agent
**Purpose**: Production monitoring
**Tools**: Sentry CLI, Vercel Analytics
**Commands**:
```bash
sentry-cli releases new
sentry-cli releases finalize
```
**Tasks**:
- Error tracking and alerting
- Performance monitoring
- Usage analytics

## Standard Commands to Run

### Before Committing
```bash
pnpm lint
pnpm typecheck
pnpm test
```

### Development
```bash
pnpm dev
```

### Building
```bash
pnpm build
```

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENDGRID_API_KEY`
- `SENTRY_DSN`

## Project Structure
```
field-reservations/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── (auth)/
│   │   └── (dashboard)/
│   ├── components/
│   ├── lib/
│   │   ├── supabase/
│   │   └── sendgrid/
│   ├── types/
│   └── utils/
├── tests/
├── .env.local
└── package.json
```