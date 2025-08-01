import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: process.env.npm_package_version || '0.1.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    buildTime: process.env.VERCEL_BUILD_TIME || new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
}