#!/usr/bin/env bash
set -euo pipefail

docker rm -f klecx-verify-pg >/dev/null 2>&1 || true
docker run -d --rm --name klecx-verify-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=klecx_ci \
  -p 55432:5432 postgres:16-alpine >/dev/null
trap 'docker rm -f klecx-verify-pg >/dev/null 2>&1 || true' EXIT
until docker exec klecx-verify-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

export DATABASE_URL="postgresql://postgres:postgres@localhost:55432/klecx_ci"
export APP_URL="http://localhost:3000"
export AUTH_SECRET="ci-dummy-auth-secret-min-32-chars-long!"   # needed until Step 1.3 removes it
export GEMINI_API_KEY="ci-dummy-key-0000"
export RESEND_API_KEY="re_ci_dummy"
export EMAIL_FROM="Klecx <ci@example.com>"

npx prisma validate
npx prisma migrate deploy
npm run lint
npm run check:tokens
npm run typecheck
npm test -- --ci
npm run build
npm audit --omit=dev --audit-level=high

docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest detect --source /repo -v
echo "✅ verify passed"
