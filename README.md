# Field Reservations Application

A modern field reservation system built with Next.js, Supabase, and SendGrid.

## Quick Start

1. Install global CLI tools:
   ```powershell
   powershell -ExecutionPolicy Bypass -File install-cli-tools.ps1
   ```

2. Install project dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` with your actual values.

4. Initialize Supabase:
   ```bash
   supabase init
   ```

5. Run development server:
   ```bash
   pnpm dev
   ```

## CLI Tools Installation Notes

- **Supabase CLI**: Install using their standalone installer from https://supabase.com/docs/guides/cli
- **SendGrid CLI**: The npm package is deprecated. Use the SendGrid API directly.
- **GitHub CLI**: Install from https://cli.github.com/

## Project Structure

See `CLAUDE.md` for detailed information about specialized agents and project architecture.

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests
- `pnpm test:e2e` - Run end-to-end tests