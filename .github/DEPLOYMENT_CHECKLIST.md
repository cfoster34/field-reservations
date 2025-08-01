# Deployment Checklist

This checklist should be reviewed before each deployment to production.

## Pre-Deployment

### Code Review
- [ ] All code changes have been reviewed by at least 2 team members
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets or API keys
- [ ] All TODO comments have been addressed or ticketed

### Testing
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] Visual regression tests reviewed
- [ ] Performance tests meet thresholds
- [ ] Security scan shows no critical vulnerabilities

### Database
- [ ] Database migrations tested in staging
- [ ] Rollback plan documented for migrations
- [ ] Database backups are current
- [ ] No destructive migrations without data backup

### Dependencies
- [ ] No security vulnerabilities in dependencies
- [ ] All dependencies are production-ready (no alpha/beta versions)
- [ ] License compliance verified
- [ ] Bundle size within acceptable limits

## Deployment Process

### Environment Variables
- [ ] All required environment variables configured in Vercel
- [ ] Secrets rotated if necessary
- [ ] Environment-specific values verified (prod vs staging)

### Feature Flags
- [ ] New features behind feature flags if needed
- [ ] Feature flag configuration reviewed
- [ ] Rollback plan includes feature flag changes

### Monitoring
- [ ] Error tracking configured in Sentry
- [ ] Performance monitoring enabled
- [ ] Alerts configured for critical metrics
- [ ] Custom dashboards updated if needed

### Communication
- [ ] Release notes prepared
- [ ] Stakeholders notified of deployment window
- [ ] Support team briefed on changes
- [ ] Customer-facing changelog updated

## Post-Deployment

### Verification
- [ ] Smoke tests pass on production
- [ ] Critical user flows tested manually
- [ ] API health checks passing
- [ ] No increase in error rate

### Monitoring
- [ ] Error rates normal
- [ ] Performance metrics acceptable
- [ ] No unusual database activity
- [ ] Payment processing functioning

### Documentation
- [ ] API documentation updated
- [ ] Internal wiki updated
- [ ] Runbooks updated for new features
- [ ] Known issues documented

### Rollback Readiness
- [ ] Rollback procedure documented
- [ ] Team knows how to initiate rollback
- [ ] Previous stable version identified
- [ ] Database rollback plan ready

## Sign-offs

- [ ] Engineering Lead: _____________
- [ ] Product Manager: _____________
- [ ] QA Lead: _____________
- [ ] DevOps: _____________

## Notes

Add any deployment-specific notes here:

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Version**: _______________