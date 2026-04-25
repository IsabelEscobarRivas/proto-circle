# Dev-Server Multiplicity — Architect Update

**Date:** Apr 24, 2026 (PDT) · report 19:25, diagnosis 19:43
**Status:** Resolved on dev workstation · no code change applied
**Scope:** User-visible bug report — Campaign Pool balance card not refreshing after attribution payout.
**Cross-reference:** [`07-campaign-pool-architect-update.md`](./07-campaign-pool-architect-update.md) §"Architect sign-off" Caveat #1.

---

## TL;DR for the architect

A demo-test user reported that the Campaign Pool card stopped reflecting deductions after the attribution-payout step. The reported symptom was real; the code was not. **Two `next dev` processes were running simultaneously** (`:3000` PID 33133, `:3001` PID 38808), each holding its own in-memory pool through its own `globalThis.__protoCircleCampaign__`. Whichever server the browser was not anchored to was the one whose pool diverged.

Killed both, started exactly one. Verified end-to-end against a fresh single process: $10.00 → $9.99 → $9.98 → $9.78 cleanly. No code change applied. Two diagnostic `console.log` lines were added to `app/api/payouts/route.ts` during triage and have been left in place pending your call.

---

## Why both halves of the user's request returned "code is fine"

The bug report asked for two confirmations:

1. **Is `refreshPool()` called after `POST /api/payouts`?** Yes. Already wired at `app/demo/page.tsx:415`, awaited before polling starts.
2. **Is `deductFromPool()` actually returning `true` before Circle calls?** Yes. The diagnostic `console.log` printed:

   ```
   [payouts][AODf3_cdatAs] pid=43239 pool BEFORE check = $9.9800  existing_payouts=no
   [payouts][AODf3_cdatAs] pid=43239 total=$0.2000 deductFromPool=true pool BEFORE=$9.9800 pool AFTER=$9.7800
    POST /api/payouts 201 in 1345ms
    GET /api/campaigns/demo 200 in 10ms
   ```

Both code paths behave correctly. The discrepancy lived between processes, not between functions.

---

## Why this matters architecturally

This bug is an empirical confirmation of a hazard already documented in doc 07 and accepted in your sign-off:

| Hazard | Doc 07 caveat | This bug's relation |
|---|---|---|
| In-memory pool is process-local | #1 — "single Node process, $0.01 granularity, demo audience" | Bug exhibits the **multi-process extension** of the same hazard. |
| Singleton pinned to `globalThis` | Architect rationale was "protects against per-route module duplication in dev" | Confirmed: the pin worked exactly where it was supposed to, and is still not a defence against multi-process. By design. |
| Click handlers set `setPool` from response, attribution path uses GET | Documented as a perf optimisation in doc 07 | Surface effect: clicks looked fine even when state had diverged; attribution exposed the divergence. |

Nothing in the model is broken. The model is **correct under its stated invariants**, and the operational footgun (multiple dev servers) violated those invariants without warning.

---

## Why two servers were running

Most likely: editor reload or HMR survived an earlier session that started a second `next dev` against the same workspace. Next.js port-bumps automatically (3000 → 3001) when the first port is busy at startup, so the second process came up silently next to the first one rather than failing to start. Both then served identical code from the same checkout, and SQLite (file-backed) gave the *illusion* of shared state. The in-memory pool was the one piece of state that didn't survive the per-process boundary.

This is a generic Node-singleton hazard. The same shape would bite us under cluster mode, blue/green deploys, edge-runtime route handlers, or any future move to a serverless deploy target where every cold start gets a fresh `globalThis`.

---

## What changed (very little)

| File | Change | Why |
|---|---|---|
| `app/api/payouts/route.ts` | +5 lines: two `console.log`s printing `pid`, `existing_payouts`, `deductFromPool` result, pool before/after | User explicitly requested logs to verify deduction |
| Process tree | Killed `next dev` PIDs 33132/33133 and 38807/38808; started one `next dev` on `:3000` (PID 43239) | Restored the single-process invariant the in-memory model assumes |

No application code was modified. No file under `lib/`, `app/api/campaigns/**`, or `app/demo/page.tsx` was touched.

---

## Verification

Single fresh server. Full pipeline run:

| Step | Action | `GET /api/campaigns/demo` |
|---|---|---|
| A | Initial state | $10.00 |
| D₁ | Click A micropayment | $9.99 |
| D₂ | Click B micropayment | $9.98 |
| E | GET pool after both clicks | $9.98 |
| G | `POST /api/payouts` ($0.06 + $0.14 split) | — |
| H | GET pool after payouts | $9.78 (literal: `9.780000000000001`, rounded by UI) |

Backend log for step G is the snippet quoted above. Two Circle transactions initiated, both reached `sending` synchronously and `complete` shortly after.

---

## Hardening options (no code change yet — your call)

| # | Option | Cost | What it buys | Recommendation |
|---|---|---|---|---|
| 1 | `predev` script that kills anything on `:3000`/`:3001` before `npm run dev` | Trivial — one line in `package.json` | Eliminates the operational footgun on workstations | Cheapest defence; no semantic change |
| 2 | Show `process.pid` in the demo header (or in `GET /api/campaigns/demo` response) | Small — one fetch + one Pill | Makes process-affinity divergence visible at a glance | Optional; useful debug aid |
| 3 | Move pool to SQLite (`campaigns(pool_balance_usd)` row + `BEGIN IMMEDIATE` on deduction) | Moderate — schema migration, locking, refund semantics | Removes the in-memory model entirely; survives restarts and multi-process | Already on your open-decisions list (doc 07 Review #1) |
| 4 | Leave as-is | Zero | Demo continues to work on a single dev server; recurrence depends on operator discipline | Defensible for hackathon scope |

I'd suggest #1 as the only no-cost change worth making now, and treating #3 as an actual milestone if/when this graduates beyond demo. #2 is nice-to-have.

---

## Outstanding question for you

The two diagnostic `console.log` lines in `app/api/payouts/route.ts` were added during triage. They're useful — every payout call now prints `pid`, deduction result, and balance delta — but they're also noise on a clean log. Three reasonable choices:

1. **Strip them** — restore the pre-diagnosis file exactly.
2. **Keep them as-is** — accept the noise as ongoing operational telemetry.
3. **Convert to a small `lib/log.ts` with a `DEBUG_POOL` env switch** — gives us the visibility on demand without printing every call.

No default action; I'll proceed on your direction.

---

## Process notes

- Diagnosis took ~18 minutes from bug report to green verification, almost all of it spent confirming the negative ("code is fine") rather than finding the positive ("two processes"). The `lsof` check that exposed the duplicate servers was the single useful step.
- The diagnostic logs were paste-ready answers to the user's two specific questions; both came back clean, which was itself the diagnostic signal that the bug had to be elsewhere.
- No commits were made for this change. The current `da555fc` HEAD is unchanged; the `console.log` lines are local-only until you decide their fate.
