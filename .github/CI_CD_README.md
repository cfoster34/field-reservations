# CI/CD Pipeline Documentation

## Overview

This repository uses a comprehensive CI/CD pipeline built with GitHub Actions and Vercel for automated testing, deployment, and monitoring.

## Pipeline Architecture

### Continuous Integration (CI)

The CI pipeline runs on every push and pull request:

1. **Security Scanning** - Trivy and npm audit
2. **Code Quality** - ESLint and TypeScript checking
3. **Unit & Integration Tests** - Jest with sharded execution
4. **E2E Tests** - Playwright across multiple browsers
5. **Visual Regression** - Percy for UI consistency
6. **Performance Tests** - Lighthouse CI
7. **Build Verification** - Next.js build check

### Continuous Deployment (CD)

Automated deployments with environment-specific configurations:

- **Preview Deployments** - Every PR gets a preview URL
- **Staging Deployments** - Automatic on merge to staging branch
- **Production Deployments** - Automatic on merge to main with approvals

### Release Management

- Semantic versioning with automated changelog
- GitHub Releases with artifacts
- Automated version bumping
- Release notes generation

## Workflows

### 1. CI Pipeline (`ci.yml`)

Runs on: Push to main/develop/staging, Pull requests

Features:
- Parallel test execution with sharding
- Code coverage reporting to Codecov
- Security vulnerability scanning
- Bundle size checking
- Cross-browser E2E testing

### 2. CD Pipeline (`cd.yml`)

Runs on: Push to main/staging, Manual dispatch

Features:
- Environment determination
- Database migration automation
- Vercel deployment
- Post-deployment health checks
- Monitoring setup
- Slack/Discord notifications

### 3. Preview Deployments (`preview-deploy.yml`)

Runs on: Pull requests

Features:
- Isolated Supabase preview branches
- Temporary preview URLs
- Lighthouse performance checks
- Automatic cleanup on PR close

### 4. Release Management (`release.yml`)

Runs on: Version tags, Manual dispatch

Features:
- Automated changelog generation
- Multi-platform artifact building
- Version bumping
- Production deployment
- Release notifications

### 5. Dependency Updates (`dependency-update.yml`)

Runs on: Weekly schedule, Manual dispatch

Features:
- Automated dependency updates
- Security vulnerability scanning
- PR creation with audit results
- Renovate bot integration

### 6. Monitoring (`monitoring.yml`)

Runs on: Every 5 minutes

Features:
- Health checks for all environments
- Performance monitoring
- Error rate tracking
- Database metrics
- Automatic incident creation

### 7. Rollback (`rollback.yml`)

Runs on: Manual dispatch

Features:
- Quick rollback to previous versions
- Database backup before rollback
- Health verification
- Incident report generation

## Environment Setup

### Required Secrets

Run the setup script to configure all required secrets:

```bash
bash .github/scripts/setup-secrets.sh
```

Key secrets include:
- Supabase credentials
- Stripe API keys
- SendGrid API key
- Monitoring tokens (Sentry, Datadog)
- Vercel deployment tokens
- Notification webhooks

### Environment Configuration

Three environments are configured:

1. **Production**
   - Protected with required reviewers
   - 5-minute deployment wait
   - Restricted to main branch

2. **Staging**
   - Single reviewer required
   - No wait time
   - Staging and release branches

3. **Preview**
   - No protection rules
   - Automatic for all PRs
   - Isolated database branches

### Branch Protection

Configure branch protection rules as documented in `.github/branch-protection.yml`:

- **main**: Strict protection, 2 reviewers, all checks required
- **staging**: Moderate protection, 1 reviewer
- **develop**: Light protection, basic checks

## Deployment Process

### Automatic Deployments

1. **Preview**: Created automatically for every PR
2. **Staging**: Deployed on merge to staging branch
3. **Production**: Deployed on merge to main branch

### Manual Deployments

```bash
# Deploy to preview
npm run deploy:preview

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

### Database Migrations

Migrations are automatically applied during deployment:

```bash
# Test migrations locally
npm run db:migrate:dry

# Apply migrations
npm run db:migrate

# Create backup
npm run db:backup
```

## Monitoring & Alerts

### Health Checks

- `/api/health` - Overall system health
- `/api/health/db` - Database connectivity
- `/api/health/cache` - Cache status
- `/api/health/payments` - Payment provider status

### Metrics Tracked

- Response times
- Error rates
- CPU/Memory usage
- Database connections
- Bundle size
- Lighthouse scores

### Alert Channels

- Slack: `#deployments` and `#alerts`
- Discord: Deployment notifications
- GitHub Issues: Automatic incident creation
- Email: Critical alerts

## Rollback Procedures

### Automatic Rollback

Triggered by:
- Failed health checks
- High error rates
- Performance degradation

### Manual Rollback

1. Go to Actions → Rollback Deployment
2. Select environment
3. Provide reason
4. Confirm rollback

The system will:
- Find last stable deployment
- Create database backup
- Deploy previous version
- Verify health
- Create incident report

## Security

### Vulnerability Scanning

- Trivy for container scanning
- npm audit for dependencies
- Snyk for continuous monitoring
- CodeQL for code analysis

### Secret Management

- All secrets in GitHub Secrets
- Environment-specific values
- Regular rotation schedule
- No secrets in code

## Performance

### Optimization Features

- Parallel test execution
- Build caching
- Incremental deployments
- CDN asset delivery
- Edge function deployment

### Performance Budgets

- Bundle size: < 500KB
- Lighthouse score: > 80
- Build time: < 5 minutes
- Deploy time: < 2 minutes

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node version (20.x required)
   - Clear cache and retry
   - Review error logs

2. **Test Failures**
   - Check for flaky tests
   - Review browser logs
   - Verify test data

3. **Deployment Issues**
   - Verify environment variables
   - Check Vercel status
   - Review deployment logs

### Support

- Engineering: `#engineering` Slack channel
- DevOps: `devops@fieldreservations.com`
- On-call: See PagerDuty schedule

## Best Practices

1. **Always create PRs** - Never push directly to protected branches
2. **Write tests** - Maintain > 80% coverage
3. **Update docs** - Keep documentation current
4. **Monitor deployments** - Watch metrics after deploy
5. **Communicate** - Notify team of major changes

## Resources

- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Vercel Documentation](https://vercel.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Internal Wiki](https://wiki.fieldreservations.com)