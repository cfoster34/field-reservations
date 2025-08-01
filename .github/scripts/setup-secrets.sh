#!/bin/bash

# GitHub Secrets Setup Script
# This script helps set up required secrets for GitHub Actions

echo "Setting up GitHub Secrets for CI/CD Pipeline"
echo "============================================"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed. Please install it first:"
    echo "https://cli.github.com/manual/installation"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Please authenticate with GitHub CLI first:"
    echo "Run: gh auth login"
    exit 1
fi

# Get repository name
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Setting secrets for repository: $REPO"

# Function to set secret
set_secret() {
    local name=$1
    local prompt=$2
    
    echo ""
    echo -n "$prompt: "
    read -s value
    echo ""
    
    if [ -n "$value" ]; then
        echo "$value" | gh secret set "$name" --repo="$REPO"
        echo "✓ $name set successfully"
    else
        echo "✗ Skipping $name (no value provided)"
    fi
}

echo ""
echo "Please provide values for the following secrets:"
echo "(Press Enter to skip any secret)"

# Supabase
set_secret "SUPABASE_URL" "Supabase URL"
set_secret "SUPABASE_ANON_KEY" "Supabase Anonymous Key"
set_secret "SUPABASE_SERVICE_ROLE_KEY" "Supabase Service Role Key"
set_secret "SUPABASE_PROJECT_REF" "Supabase Project Reference"
set_secret "SUPABASE_ACCESS_TOKEN" "Supabase Access Token"

# Stripe
set_secret "STRIPE_SECRET_KEY" "Stripe Secret Key (Production)"
set_secret "STRIPE_PUBLISHABLE_KEY" "Stripe Publishable Key (Production)"
set_secret "STRIPE_TEST_SECRET_KEY" "Stripe Secret Key (Test)"
set_secret "STRIPE_TEST_PUBLISHABLE_KEY" "Stripe Publishable Key (Test)"
set_secret "STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret"

# SendGrid
set_secret "SENDGRID_API_KEY" "SendGrid API Key"

# Monitoring
set_secret "SENTRY_DSN" "Sentry DSN"
set_secret "SENTRY_AUTH_TOKEN" "Sentry Auth Token"
set_secret "SENTRY_ORG" "Sentry Organization"
set_secret "SENTRY_PROJECT" "Sentry Project"

# Vercel
set_secret "VERCEL_TOKEN" "Vercel Token"
set_secret "VERCEL_ORG_ID" "Vercel Organization ID"
set_secret "VERCEL_PROJECT_ID" "Vercel Project ID"

# Notifications
set_secret "SLACK_WEBHOOK_URL" "Slack Webhook URL"
set_secret "DISCORD_WEBHOOK" "Discord Webhook URL"

# Analytics
set_secret "DD_API_KEY" "Datadog API Key"
set_secret "DD_APP_KEY" "Datadog Application Key"
set_secret "PERCY_TOKEN" "Percy Token"
set_secret "CODECOV_TOKEN" "Codecov Token"

# AWS (for backups)
set_secret "AWS_ACCESS_KEY_ID" "AWS Access Key ID"
set_secret "AWS_SECRET_ACCESS_KEY" "AWS Secret Access Key"
set_secret "BACKUP_BUCKET" "S3 Backup Bucket Name"

# GitHub PAT for automated PRs
set_secret "PAT_TOKEN" "GitHub Personal Access Token (with repo scope)"

# Testing
set_secret "SNYK_TOKEN" "Snyk Token"

echo ""
echo "✅ Secret setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure branch protection rules"
echo "2. Set up environments in GitHub Settings"
echo "3. Configure Vercel project settings"
echo "4. Set up monitoring dashboards"
echo ""