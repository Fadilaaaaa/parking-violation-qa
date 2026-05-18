# Playwright E2E Tests

Automated tests for Parking Violation Portal using [Playwright](https://playwright.dev/).

## Structure

```
tests/
├── helpers/
│   └── api.js                    # Shared login & request helpers
├── api/
│   ├── auth.spec.js              # Authentication (login, tokens, 401s)
│   ├── authorization.spec.js     # Role & ownership access control
│   ├── fine-calculation.spec.js  # Fine formula: time & repeat multipliers
│   ├── payment.spec.js           # Payment success, failure, retry, idempotency
│   ├── rule-versions.spec.js     # Rule versioning & past-violation isolation
│   └── audit-and-transactions.spec.js  # Audit trail & transaction history
└── ui/
    ├── officer-flows.spec.js     # Officer UI: submit violation, rule versions
    └── member-flows.spec.js      # Member UI: view invoices, pay, history
```

## Setup

Requires Node.js 18+. App must be running at `localhost:3030` (web) and `localhost:8090` (API).

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

## Running Tests

```bash
# Run all tests
npm test

# Run only API tests
npx playwright test --project=api

# Run only UI tests
npx playwright test --project=ui

# Run with browser visible (headed mode)
npm run test:headed

# Run a specific file
npx playwright test tests/api/fine-calculation.spec.js

# Open interactive UI mode
npm run test:ui

# View HTML report after run
npm run test:report
```

## Why Playwright for API tests?

Playwright's `request` context gives the same ergonomics as a browser test — `beforeAll`, `expect`, structured test output — but hits the API directly without a browser. This means API and UI tests live in the same framework, same report, and the same CI step.

## Key test files and what they cover

| File | Critical findings covered |
|---|---|
| `fine-calculation.spec.js` | CRITICAL-01 (night multiplier), CRITICAL-02 (repeat multiplier) |
| `authorization.spec.js` | CRITICAL-03 (cross-member data access) |
| `payment.spec.js` | CRITICAL-04 (payment idempotency / 409) |
| `rule-versions.spec.js` | CRITICAL-05 (past violation repricing) |
| `audit-and-transactions.spec.js` | MAJOR-03, MAJOR-04 |

## Reset database between runs

```bash
docker compose down -v && docker compose up
```

Some tests are order-dependent (e.g. repeat multiplier tests assume a fresh plate with no prior violations). A clean DB seed ensures consistent results.
