# Hackathon Product Sheet

**Project (working name)**: Instant Attribution & Micropayments Engine

> Note on naming: any long-term product brand is intentionally kept out of
> this document and every other public-facing artifact in the repo. Refer
> to the work by its working name or descriptive terms only.

**Working thesis**: a system that routes economic value to the people who drive
measurable traffic, beginning with online referral events and recency-aware
micropayments.

## Hackathon focus

Online traffic only. Timestamped attribution, simple recency logic, and instant
stablecoin micropayments.

### What is deliberately out of scope

Brick-and-mortar geofencing, social graph logic, complex probabilistic
attribution, and any full long-term product experience.

### Why this wedge matters

It tests the trust layer: transparent attribution plus immediate payout. If
creators value that loop, it can later support more sophisticated product
mechanics.

### Definition of done

A working demo that shows link click, event logging, attribution calculation,
payout initiation, and a visible audit trail.

## 1. Product framing

- **Problem**: Influencers can drive meaningful traffic, but attribution is
  often simplistic and payouts are delayed, opaque, or too expensive to settle
  at very small amounts.
- **Solution**: Track referral interactions with timestamps, apply a transparent
  attribution rule, and settle value instantly through a stablecoin payout rail.
- **Primary user**: Creators who want fast, understandable compensation for
  measurable traffic events.
- **Secondary user**: Merchants or brands that want a lightweight way to reward
  creators without waiting for batch affiliate settlements.

## 2. MVP flow

1. An influencer receives a unique campaign link.
2. A user clicks one or more influencer links over time.
3. Each click and downstream landing event is recorded with a timestamp.
4. When the qualifying event occurs, the attribution engine applies a simple
   policy such as last valid click or recency-weighted split.
5. The payout engine computes the micropayment amount and sends the stablecoin
   transfer.
6. The dashboard shows the event timeline, attribution logic, and payout result.

## 3. Architecture

Intentionally minimal: event capture, attribution logic, payout execution, and
a visible audit trail.

### Architecture notes

- **Event API** — receives click, landing, and optional conversion events. In
  the hackathon version this can be authenticated by a lightweight merchant
  token or demo-only key.
- **Event store** — persists raw timestamped interactions so attribution is
  explainable rather than magical.
- **Attribution engine** — starts simple. Recommended default: recency-weighted
  attribution within a short window. Safe fallback: last valid click wins.
- **Payout engine** — consumes an attribution decision, turns it into one or
  more payouts, and records payment status for the dashboard.
- **Dashboard** — must make the system feel fair: who got credit, why they got
  credit, how much was paid, and whether settlement succeeded.

## 4. Data model

| Entity | Purpose | Minimum fields |
|---|---|---|
| Influencer | Creator that can receive payouts | `id`, `display_name`, `wallet_address`, `status` |
| CampaignLink | Unique referral surface tied to one creator | `id`, `influencer_id`, `merchant_domain`, `target_url`, `created_at` |
| UserEvent | Timestamped user interaction | `id`, `anonymous_user_id`, `campaign_link_id`, `event_type`, `occurred_at` |
| AttributionDecision | Resolved logic for a qualifying event | `id`, `subject_id`, `method`, `window_start`, `window_end`, `rationale` |
| AttributionShare | Split of value across one or more creators | `id`, `decision_id`, `influencer_id`, `weight`, `amount_usd` |
| Payout | Settlement record for a creator | `id`, `decision_id`, `recipient_wallet`, `status`, `tx_hash` |

## 5. API surface

Smallest endpoint set that supports a credible demo. Clarity over completeness.

| Endpoint | Purpose | Inputs |
|---|---|---|
| `POST /influencers` | Create or register an influencer profile | `display_name`, `wallet_address` |
| `POST /campaign-links` | Create a unique trackable link | `influencer_id`, `merchant_domain`, `target_url` |
| `POST /events` | Record a click, landing, or conversion event | `anonymous_user_id`, `campaign_link_id`, `event_type`, `occurred_at` |
| `POST /attribution/resolve` | Resolve attribution for a qualifying event | `subject_id`, `method` |
| `POST /payouts` | Trigger payout(s) from an attribution decision | `decision_id` |
| `GET /dashboard/timeline/{subject_id}` | Event timeline + attribution rationale | path param |
| `GET /dashboard/payouts/{decision_id}` | Payout records + transaction status | path param |
| `GET /health` | Health check | none |

## 6. Attribution policy

- **Recommended demo policy**: recency-weighted attribution inside a short
  lookback window. Example: if two eligible influencer interactions occurred
  before the qualifying event, the more recent interaction receives the larger
  share.
- **Safe fallback**: last valid click wins. Simpler, less differentiated. Use
  only if time becomes the binding constraint.
- **Minimum safeguards**: reject exact duplicate events, ignore events outside
  the lookback window, keep the rationale object visible in the dashboard.

## 7. Demo script

1. **Open with the problem**: creators drive traffic, but attribution is
   simplistic and payouts delayed.
2. **Show the setup**: two influencers have unique links; a user interacts with
   both over time.
3. **Show the timeline**: raw events with timestamps so the audience sees the
   evidence.
4. **Run attribution**: resolve who gets credit and show the exact logic used.
5. **Trigger payment**: send or simulate the micropayment; display status
   immediately.
6. **Close with the thesis**: this is the trust layer for creator commerce —
   transparent attribution plus instant payout.

## 8. Guardrails

- Do not add the full future-product feature set to the hackathon build.
- Do not move into brick-and-mortar attribution in this version.
- Do not add unnecessary social, identity, or dashboard complexity.
- Keep the demo loop clear: link, event, attribution, payment, audit trail.
- Do not introduce long-term brand names or brand positioning into any
  public-facing artifact (README, dashboard copy, status reports, API
  descriptions).

## 9. Connection to the broader product vision

This hackathon artifact is intentionally narrower than the longer-term
product it points at. It proves the online trust layer: creators value
transparent attribution and instant payout. If that behavior is validated,
the same credibility can later support more complex mechanics around social
shopping and physical-store traffic.

The long-term productization — including any brand name — is deliberately
kept out of this repo. Treat everything here as the neutral "Instant
Attribution & Micropayments Engine" until product leadership decides
otherwise.
