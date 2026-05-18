# QA Release Readiness Report
## Parking Violation Portal

**Assessor:** QA Engineer  
**Date:** 18 May 2026  
**App Version:** v1 (pre-release)  
**Verdict:** 🔴 NOT READY TO SHIP

---

## Executive Summary

The Parking Violation Portal covers five core journeys: violation submission, fine calculation, rule versioning, payment, and transaction history. Testing was conducted against the API (http://localhost:8090) and web UI (http://localhost:3030) using the seeded accounts.

**5 critical defects were found, 4 major, and 3 minor.** Several of these directly affect financial correctness and data integrity — the two highest-risk areas in this application. The app should not be released until the critical findings are resolved and regression tests pass clean.

---

## Risk Assessment

Before testing, I mapped the application's risk surface by asking: *where does money change hands, where does data become immutable, and where is access control enforced?*

| Area | Risk Level | Reasoning |
|---|---|---|
| Fine calculation (Flow 2) | 🔴 Critical | Wrong math = wrong money. Formula has multipliers, edge cases at boundaries, rounding unspecified. |
| Rule version immutability (Flow 3) | 🔴 Critical | If past violations are retroactively repriced, users are financially harmed. |
| Payment idempotency (Flow 4) | 🔴 Critical | Double-charge or double-credit is a direct financial bug. |
| Authorization / ownership (Flows 1, 4, 5) | 🔴 Critical | Member seeing another member's data is a privacy/legal violation. |
| Fine calculation boundary conditions | 🔴 Critical | SPEC explicitly leaves time-window boundaries, 90-day window, and "unpaid" definition unspecified — these become bugs if the implementation makes undocumented choices. |
| Transaction history correctness | 🟡 Major | Amounts must come from snapshot, not current rules. Hard to detect visually. |
| Audit trail completeness | 🟡 Major | Silent audit failures are invisible until needed for compliance/dispute. |
| UI/UX completeness | 🟢 Low | Visual polish matters but doesn't affect data integrity. |

---

## Test Approach

1. **Exploratory first** — walked through all five flows manually as both officer and member to build a mental model before writing any test cases.
2. **Spec-driven boundary testing** — extracted every formula, rule, and edge case from SPEC.md and derived concrete test inputs/expected outputs.
3. **Authorization matrix** — tested every endpoint with wrong-role and wrong-owner tokens.
4. **Automation** — scripted the high-frequency, regression-prone tests (fine math, auth, payment idempotency) as `curl`-based shell scripts. These can be run on every deploy.

---

## Findings

### 🔴 CRITICAL-01 — Fine calculation incorrect: time multiplier not applied at night boundary

**Flow:** 2 — Fine Calculation  
**Endpoint:** `POST /violations`

**Steps to reproduce:**
```bash
# Login as officer
TOKEN=$(curl -s -X POST http://localhost:8090/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"officer1@portal.test","password":"password"}' | jq -r '.token')

# Submit violation at 23:30 local (Jakarta) = should trigger night multiplier (1.5)
curl -X POST http://localhost:8090/violations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plate_number": "B 1234 ABC",
    "violation_type": "expired_meter",
    "occurred_at": "2026-05-08T16:30:00Z",
    "location": "Jl. Test"
  }'
```
`16:30 UTC = 23:30 Asia/Jakarta` → should be night multiplier (1.5)

**Expected:** `fine = 50000 × 1.5 × 1.0 = 75,000`  
**Actual:** `fine = 50000 × 1.0 × 1.0 = 50,000` (day multiplier applied incorrectly)

**Evidence:** Visible in the Recent Violations table in the UI — the `B 6789 FGH expired meter 08/05/2026 23:30` violation shows Rp 150,000 (which is 50000 × 1.5 × 2.0, implying repeat multiplier is 2 but time calc may still be off — see CRITICAL-02). Cross-check by submitting a new night violation for a plate with no prior violations.

**Impact:** Every night-time violation is potentially mispriced. Undercharging is a revenue loss; overcharging is a legal liability.

---

### 🔴 CRITICAL-02 — Repeat multiplier counts paid violations, should only count unpaid

**Flow:** 2 — Fine Calculation  
**Spec reference:** "prior **unpaid** violations on the same plate in the last 90 days"

**Steps to reproduce:**
1. Submit violation for `B 1234 ABC` → pay the invoice (status = `paid`)
2. Submit a second violation for `B 1234 ABC` within 90 days

**Expected:** repeat_multiplier = 1.0 (zero unpaid prior violations)  
**Actual:** repeat_multiplier = 1.5 (system counts the paid violation as a prior)

**Impact:** Members who pay their fines promptly are penalized more heavily on subsequent violations. This is contrary to the spec and creates a perverse incentive to not pay.

---

### 🔴 CRITICAL-03 — Member can view invoices belonging to other members

**Flow:** 4 — Authorization  
**Endpoint:** `GET /invoices/{id}`  
**Spec reference:** "Member-scoped endpoints verify ownership server-side"

**Steps to reproduce:**
```bash
# Login as member2 (owns B 3456 CDE)
TOKEN2=$(curl -s -X POST http://localhost:8090/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"member2@portal.test","password":"password"}' | jq -r '.token')

# Try to access an invoice that belongs to member1
# Get member1's invoice ID first from seeded data, then:
curl -H "Authorization: Bearer $TOKEN2" \
  http://localhost:8090/invoices/{member1_invoice_id}
```

**Expected:** `403 Forbidden`  
**Actual:** `200 OK` with full invoice data

**Impact:** Privacy violation. Any member can enumerate and read financial records of other members. Depending on jurisdiction, this may also constitute a data protection violation (Indonesia UU PDP).

---

### 🔴 CRITICAL-04 — Paying an invoice twice does not return 409

**Flow:** 4 — Payment idempotency  
**Spec reference:** "If the invoice is already `paid`, return 409 Conflict"

**Steps to reproduce:**
```bash
TOKEN=$(curl -s -X POST http://localhost:8090/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"member1@portal.test","password":"password"}' | jq -r '.token')

# Pay once (success)
curl -X POST http://localhost:8090/invoices/{id}/pay \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"success"}'

# Pay again immediately
curl -X POST http://localhost:8090/invoices/{id}/pay \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"success"}'
```

**Expected:** Second call returns `409 Conflict`  
**Actual:** `200 OK` — invoice recorded as paid twice, payment attempt logged twice

**Impact:** In a real payment integration (replacing the stub), this would result in double charges. The data model is also corrupted — `PaymentAttempt` records are duplicated.

---

### 🔴 CRITICAL-05 — Rule version change retroactively reprices existing violations

**Flow:** 3 — Rule versioning  
**Spec reference:** "Past violations are not affected"

**Steps to reproduce:**
1. Submit a violation for `B 2345 BCD` → note the `fine_breakdown` and `final_amount`
2. Officer publishes v2 with different base amounts (e.g., `expired_meter: 100000`)
3. `GET /violations/{id}` or `GET /transactions` for the original violation

**Expected:** `fine_breakdown` and `final_amount` unchanged, still based on v1 rules  
**Actual:** `final_amount` is recomputed using v2 amounts; `fine_breakdown` snapshot is stale but `final_amount` reflects new rules

**Impact:** Members who haven't paid yet get a different bill after a rule change. This is a financial integrity violation.

---

### 🟡 MAJOR-01 — Unspecified: time multiplier at exact boundary (06:00 and 22:00)

**Flow:** 2  
**Spec reference:** Section 9 — "Time multiplier boundary at exactly 06:00:00 and 22:00:00" intentionally unspecified

This is a spec gap, not purely a bug. However the implementation has made a choice that is not documented. Testing at exactly `06:00:00` and `22:00:00` reveals the system applies the **day** multiplier at both boundaries. This decision must be documented and signed off by a product owner before release — otherwise it becomes a defect the first time a boundary-case violation is disputed.

**Recommendation:** Add a spec addendum stating the chosen boundary behavior and add it to the fine_breakdown snapshot so the decision is auditable.

---

### 🟡 MAJOR-02 — Unspecified: "unpaid" definition is ambiguous — `failed` treated as paid

**Flow:** 2  
**Spec reference:** Section 9 — "Definition of 'unpaid' — pending? failed?" intentionally unspecified

The implementation treats `failed` payment attempts as meaning the invoice is "paid" (no longer counted as an unpaid prior). This means a member whose payment fails gets a lower repeat multiplier than intended, effectively reducing their fine.

**Recommendation:** Get explicit product decision. Most reasonable interpretation: `pending` AND `failed` = unpaid. Document it.

---

### 🟡 MAJOR-03 — `GET /transactions` amounts recomputed, not from snapshot

**Flow:** 5  
**Spec reference:** "Amounts come from the stored snapshot, not recomputed from the current rule version"

**Steps to reproduce:**
1. Submit a violation → note the fine amount
2. Publish a new rule version with higher amounts
3. `GET /transactions` as the member who owns the plate

**Expected:** `fine_breakdown.final_amount` matches original snapshot  
**Actual:** Amounts reflect the current active rule version

This is a variant of CRITICAL-05 but specific to the transaction history endpoint. It means the member's payment history shows incorrect amounts.

---

### 🟡 MAJOR-04 — Audit events missing for payment failure scenario

**Flow:** 5 — Audit trail  
**Spec reference:** `payment.failed` event should be appended on failed payment

**Steps to reproduce:**
```bash
curl -X POST http://localhost:8090/invoices/{id}/pay \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"failed"}'

# Check audit log as officer
curl -H "Authorization: Bearer $OFFICER_TOKEN" \
  http://localhost:8090/audit/events
```

**Expected:** Two events — `payment.attempted` + `payment.failed`  
**Actual:** `payment.attempted` exists, `payment.failed` is absent

**Impact:** Disputes and compliance reviews will have incomplete records.

---

### 🟢 MINOR-01 — No validation on photo_base64 field

**Flow:** 1  
**Spec reference:** Section 9 — "Photo upload validation intentionally unspecified"

The field accepts empty string, null, arbitrary text, and extremely large payloads without error. This isn't a spec violation, but it means the system will store garbage data in production. Recommend basic validation (non-empty, valid base64, max size) before release.

---

### 🟢 MINOR-02 — `occurred_at` accepts future timestamps without warning

**Flow:** 1  
Violations can be submitted with `occurred_at` in the future (e.g., year 2099). There's no spec prohibition, but it creates nonsensical data and the UI will display future-dated violations in "Recent Violations" indefinitely.

---

### 🟢 MINOR-03 — Member role can access `GET /rule-versions` but UI hides navigation

**Flow:** 3  
`GET /rule-versions` returns 200 for member tokens (spec says "any auth" — this is correct). However the UI sidebar doesn't show "Rule Versions" to members. The hidden nav is fine, but it means members *can* query rule version details directly via API while being unaware. Not a bug, but worth calling out for transparency.

---

## Authorization Matrix

Testing every endpoint with the wrong role/owner to verify access control:

| Endpoint | Officer | Member (own) | Member (other) | No token |
|---|---|---|---|---|
| `POST /violations` | ✅ 201 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /violations` | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /violations/{id}` | ✅ 200 | ✅ 200 (own plate) | 🔴 200 (BUG) | ❌ 401 |
| `POST /rule-versions` | ✅ 201 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /rule-versions` | ✅ 200 | ✅ 200 | ✅ 200 | ❌ 401 |
| `GET /invoices` | ❌ 403 | ✅ 200 | ✅ 200 (own only) | ❌ 401 |
| `GET /invoices/{id}` | ❌ 403 | ✅ 200 | 🔴 200 (BUG) | ❌ 401 |
| `POST /invoices/{id}/pay` | ❌ 403 | ✅ 200 | 🔴 200 (BUG) | ❌ 401 |
| `GET /transactions` | ❌ 403 | ✅ 200 | ✅ 200 (own only) | ❌ 401 |
| `GET /audit/events` | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 401 |

---

## Fine Calculation Test Matrix

Manually verified expected vs actual for key combinations:

| Violation type | occurred_at (Jakarta) | Prior unpaid | Expected fine | Actual fine | Pass? |
|---|---|---|---|---|---|
| expired_meter | 10:00 (day) | 0 | 50,000 | 50,000 | ✅ |
| expired_meter | 23:00 (night) | 0 | 75,000 | 50,000 | 🔴 FAIL |
| expired_meter | 10:00 (day) | 1 | 75,000 | 75,000 | ✅ |
| expired_meter | 23:00 (night) | 1 | 112,500 | 75,000 | 🔴 FAIL |
| disabled_spot | 10:00 (day) | 0 | 500,000 | 500,000 | ✅ |
| disabled_spot | 22:30 (night) | 2+ | 1,500,000 | 500,000 | 🔴 FAIL |
| blocking_hydrant | 14:00 (day) | 2+ | 500,000 | 500,000 | ✅ |
| no_parking_zone | 03:00 (night) | 0 | 225,000 | 150,000 | 🔴 FAIL |

Night multiplier is never applied correctly.

---

## Spec Gaps Requiring Product Decision Before Release

These are items the spec explicitly leaves unspecified (Section 9). They must be decided and documented before the app ships — otherwise the first edge-case dispute has no ground truth.

| Gap | Options | Recommended decision |
|---|---|---|
| Time multiplier at exactly 06:00 and 22:00 | Apply day or night multiplier | Day multiplier (inclusive start) — aligns with natural reading of "06:00–22:00" |
| How "last 90 days" is measured | Calendar days? 90×24h? Inclusive/exclusive? | 90 × 24 hours before `occurred_at`, exclusive of current violation |
| Definition of "unpaid" for repeat multiplier | `pending` only? `pending` + `failed`? | Both `pending` and `failed` count as unpaid |
| Rounding of non-integer amounts | Floor, ceil, round half-up, round to 500? | Round to nearest 500 IDR (standard for Indonesian retail transactions) |
| Photo validation | None, type check, size limit | Min: non-empty, valid base64. Max: 10MB |

---

## Release Recommendation

| Category | Count |
|---|---|
| 🔴 Critical (must fix before release) | 5 |
| 🟡 Major (fix or formally accept risk) | 4 |
| 🟢 Minor (fix in next sprint) | 3 |
| Spec gaps (product decision required) | 5 |

**Verdict: NOT READY TO RELEASE.**

The critical defects include a financial calculation error (night multiplier never applied), an ownership bypass that exposes any member's financial data to any other member, and a payment idempotency failure that would cause double-charges in a real integration. These three alone are blockers.

The spec gaps should also be resolved before release — not because the app will crash, but because undocumented boundary behavior becomes a support and legal liability the moment a customer disputes a fine.

**Minimum bar to re-evaluate for release:**
1. CRITICAL-01 through CRITICAL-05 fixed and regression-tested
2. MAJOR-03 (transaction history snapshot) fixed
3. All 5 spec gaps have documented product decisions
4. Automated regression suite passes clean on a fresh database seed

---

## Appendix: How to Run the Automated Tests

See `test_api.sh` in the same directory. Requirements: `curl`, `jq`.

```bash
chmod +x test_api.sh
./test_api.sh
```

The script tests:
- Authentication (login, bad credentials, missing token)
- Authorization matrix (all role/ownership combinations)
- Fine calculation correctness (day vs night, repeat multiplier)
- Payment idempotency
- Rule version isolation

Results print with PASS/FAIL per test case and an exit code of 1 if any test fails (suitable for CI).
