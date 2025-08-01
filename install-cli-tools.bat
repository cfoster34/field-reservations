@echo off
echo Installing Field Reservations CLI Tools...
echo ========================================

echo Installing pnpm (package manager)...
call npm install -g pnpm

echo Installing Vercel CLI...
call npm install -g vercel

echo Installing Supabase CLI...
call npm install -g supabase

echo Installing SendGrid CLI...
call npm install -g @sendgrid/cli

echo Installing TypeScript...
call npm install -g typescript

echo Installing Jest CLI...
call npm install -g jest

echo Installing ESLint...
call npm install -g eslint

echo Installing Sentry CLI...
call npm install -g @sentry/cli

echo Installing dotenv-cli...
call npm install -g dotenv-cli

echo ========================================
echo All CLI tools installed successfully!
echo.
echo Note: You'll also need to install:
echo - GitHub CLI: https://cli.github.com/
echo - Playwright (project-specific): pnpm init playwright@latest
echo.
echo Run 'pnpm install' to install project dependencies.