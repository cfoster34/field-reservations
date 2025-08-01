Write-Host "Installing Field Reservations CLI Tools..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`nInstalling pnpm (package manager)..." -ForegroundColor Yellow
npm install -g pnpm

Write-Host "`nInstalling Vercel CLI..." -ForegroundColor Yellow
npm install -g vercel

Write-Host "`nInstalling Supabase CLI..." -ForegroundColor Yellow
npm install -g supabase

Write-Host "`nInstalling SendGrid CLI..." -ForegroundColor Yellow
npm install -g @sendgrid/cli

Write-Host "`nInstalling TypeScript..." -ForegroundColor Yellow
npm install -g typescript

Write-Host "`nInstalling Jest CLI..." -ForegroundColor Yellow
npm install -g jest

Write-Host "`nInstalling ESLint..." -ForegroundColor Yellow
npm install -g eslint

Write-Host "`nInstalling Sentry CLI..." -ForegroundColor Yellow
npm install -g @sentry/cli

Write-Host "`nInstalling dotenv-cli..." -ForegroundColor Yellow
npm install -g dotenv-cli

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "All CLI tools installed successfully!" -ForegroundColor Green
Write-Host "`nNote: You'll also need to install:" -ForegroundColor Cyan
Write-Host "- GitHub CLI: https://cli.github.com/" -ForegroundColor Cyan
Write-Host "- Playwright (project-specific): pnpm init playwright@latest" -ForegroundColor Cyan
Write-Host "`nRun 'pnpm install' to install project dependencies." -ForegroundColor Yellow