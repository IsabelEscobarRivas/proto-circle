#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Skewed attribution demo scenario (~70/30 split)
#
# Purpose
#   Drive the existing HTTP API (no code changes) through a click → click →
#   conversion → resolve attribution path that showcases the recency-weighted
#   engine producing a visibly unequal split on stage.
#
# Policy (PM, Apr 23, 2026)
#   - Demo scenarios MUST use two distinct creator wallet addresses.
#   - Neither creator address may be the platform wallet
#     (0x9919d90b8debbfa5d126aad522935966b2deac3a on Arc Testnet).
#   - The script refuses to run if either rule is violated.
#
# How the split is produced
#   The engine's per-click raw weight is 1 / (age_hours + 1). Given ages
#   a_A = 2.5h and a_B = 0.5h, the normalized weights are ~0.300 and ~0.700.
#   To get a different skew, override CLICK_A_HOURS_AGO / CLICK_B_HOURS_AGO.
#
# Prerequisites
#   - Dev server running on $APP_BASE_URL (default http://localhost:3000).
#   - Two distinct creator wallet addresses exported as:
#         CREATOR_A_WALLET=0x...
#         CREATOR_B_WALLET=0x...
#     Neither may equal the platform wallet.
#
# Usage
#   CREATOR_A_WALLET=0xabc... CREATOR_B_WALLET=0xdef... \
#     scripts/demo-skewed-attribution.sh
#
#   Optional overrides:
#     APP_BASE_URL           (default http://localhost:3000)
#     AMOUNT_USD             (default 0.20)
#     CLICK_A_HOURS_AGO      (default 2.5)
#     CLICK_B_HOURS_AGO      (default 0.5)
#     RUN_PAYOUTS            (default 0; set to 1 to also POST /api/payouts)
#
# This script does NOT create wallets, modify production code, or write
# secrets. It only exercises existing public endpoints.
# ----------------------------------------------------------------------------

set -euo pipefail

BASE_URL="${APP_BASE_URL:-http://localhost:3000}"
AMOUNT_USD="${AMOUNT_USD:-0.20}"
CLICK_A_HOURS_AGO="${CLICK_A_HOURS_AGO:-2.5}"
CLICK_B_HOURS_AGO="${CLICK_B_HOURS_AGO:-0.5}"
RUN_PAYOUTS="${RUN_PAYOUTS:-0}"
PLATFORM_WALLET_LOWER="0x9919d90b8debbfa5d126aad522935966b2deac3a"

die() { echo "ERROR: $*" >&2; exit 2; }
lc() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

# -------- guards ------------------------------------------------------------

: "${CREATOR_A_WALLET:?CREATOR_A_WALLET is required (0x-prefixed 40-hex)}"
: "${CREATOR_B_WALLET:?CREATOR_B_WALLET is required (0x-prefixed 40-hex)}"

A_LC=$(lc "$CREATOR_A_WALLET")
B_LC=$(lc "$CREATOR_B_WALLET")

[[ "$A_LC" =~ ^0x[0-9a-f]{40}$ ]] || die "CREATOR_A_WALLET is not a valid 0x-prefixed 40-char hex address: $CREATOR_A_WALLET"
[[ "$B_LC" =~ ^0x[0-9a-f]{40}$ ]] || die "CREATOR_B_WALLET is not a valid 0x-prefixed 40-char hex address: $CREATOR_B_WALLET"
[[ "$A_LC" != "$B_LC" ]] || die "CREATOR_A_WALLET and CREATOR_B_WALLET must be distinct."
[[ "$A_LC" != "$PLATFORM_WALLET_LOWER" ]] || die "CREATOR_A_WALLET must not be the platform wallet."
[[ "$B_LC" != "$PLATFORM_WALLET_LOWER" ]] || die "CREATOR_B_WALLET must not be the platform wallet."

command -v curl >/dev/null  || die "curl is required."
command -v python3 >/dev/null || die "python3 is required."

if ! curl -sS -m 3 "$BASE_URL/api/health" >/dev/null; then
  die "Dev server not reachable at $BASE_URL. Start it with 'npm run dev' first."
fi

# -------- helpers -----------------------------------------------------------

jq_get() {
  # usage: jq_get '<json>' '<python-dotted-path>'
  python3 -c 'import sys,json; d=json.loads(sys.argv[1])
p=sys.argv[2].split(".")
for k in p:
    if k.isdigit(): d=d[int(k)]
    else: d=d[k]
print(d)' "$1" "$2"
}

iso_hours_ago() {
  # Emit ISO-8601 UTC timestamp for (now - $1 hours). Portable across macOS/Linux.
  python3 -c 'import sys,datetime;h=float(sys.argv[1]);print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=h)).isoformat().replace("+00:00","Z"))' "$1"
}

post() {
  curl -sS -X POST "$BASE_URL$1" -H 'Content-Type: application/json' -d "$2"
}

# -------- scenario ---------------------------------------------------------

echo "=== Skewed attribution demo scenario ==="
echo "Base URL           : $BASE_URL"
echo "Creator A wallet   : $A_LC"
echo "Creator B wallet   : $B_LC"
echo "Amount             : $AMOUNT_USD USDC"
echo "Click A hours ago  : $CLICK_A_HOURS_AGO (older → lower weight)"
echo "Click B hours ago  : $CLICK_B_HOURS_AGO (newer → higher weight)"
echo "Run payouts        : $RUN_PAYOUTS"
echo ""

echo "--- 1. Create influencers ---"
INF_A_JSON=$(post /api/influencers "{\"display_name\":\"Demo Creator A (older click)\",\"wallet_address\":\"$A_LC\"}")
INF_B_JSON=$(post /api/influencers "{\"display_name\":\"Demo Creator B (newer click)\",\"wallet_address\":\"$B_LC\"}")
INF_A_ID=$(jq_get "$INF_A_JSON" "influencer.id")
INF_B_ID=$(jq_get "$INF_B_JSON" "influencer.id")
echo "Influencer A id = $INF_A_ID"
echo "Influencer B id = $INF_B_ID"

echo "--- 2. Create campaign links ---"
LINK_A_JSON=$(post /api/campaign-links "{\"influencer_id\":\"$INF_A_ID\",\"merchant_domain\":\"demo-skewed-merchant.example\",\"target_url\":\"https://demo-skewed-merchant.example/products/sku-a\"}")
LINK_B_JSON=$(post /api/campaign-links "{\"influencer_id\":\"$INF_B_ID\",\"merchant_domain\":\"demo-skewed-merchant.example\",\"target_url\":\"https://demo-skewed-merchant.example/products/sku-b\"}")
LINK_A_ID=$(jq_get "$LINK_A_JSON" "link.id")
LINK_B_ID=$(jq_get "$LINK_B_JSON" "link.id")
echo "Link A id = $LINK_A_ID"
echo "Link B id = $LINK_B_ID"

echo "--- 3. Invent a subject and post two spaced clicks + a conversion ---"
SUBJECT="anon_demo_skewed_$(date -u +%Y%m%d_%H%M%S)"
CLICK_A_ISO=$(iso_hours_ago "$CLICK_A_HOURS_AGO")
CLICK_B_ISO=$(iso_hours_ago "$CLICK_B_HOURS_AGO")
NOW_ISO=$(iso_hours_ago 0)
echo "Subject            : $SUBJECT"
echo "Click A occurred_at: $CLICK_A_ISO"
echo "Click B occurred_at: $CLICK_B_ISO"
echo "Conversion         : $NOW_ISO  ($AMOUNT_USD USDC)"

CLICK_A_EVT=$(post /api/events "{\"anonymous_user_id\":\"$SUBJECT\",\"event_type\":\"click\",\"campaign_link_id\":\"$LINK_A_ID\",\"occurred_at\":\"$CLICK_A_ISO\"}")
CLICK_B_EVT=$(post /api/events "{\"anonymous_user_id\":\"$SUBJECT\",\"event_type\":\"click\",\"campaign_link_id\":\"$LINK_B_ID\",\"occurred_at\":\"$CLICK_B_ISO\"}")
CONV_EVT=$(post /api/events "{\"anonymous_user_id\":\"$SUBJECT\",\"event_type\":\"conversion\",\"amount_usd\":$AMOUNT_USD,\"occurred_at\":\"$NOW_ISO\",\"metadata\":{\"order_id\":\"demo-skewed-$(date -u +%s)\",\"merchant_domain\":\"demo-skewed-merchant.example\"}}")
CONV_ID=$(jq_get "$CONV_EVT" "event.id")
echo "Conversion event id = $CONV_ID"

echo "--- 4. Resolve attribution (recency_weighted, 30-day lookback) ---"
DEC_JSON=$(post /api/attribution/resolve "{\"subject_id\":\"$SUBJECT\",\"conversion_event_id\":\"$CONV_ID\",\"method\":\"recency_weighted\",\"amount_usd\":$AMOUNT_USD,\"lookback_days\":30}")
DEC_ID=$(jq_get "$DEC_JSON" "decision.id")
echo "Decision id = $DEC_ID"
echo ""
echo "Rationale (per-influencer):"
python3 -c '
import sys, json
d = json.loads(sys.argv[1])
rat = d["rationale"]
for p in rat["per_influencer"]:
    print(f"  {p[\"display_name\"]:<38}  weight={p[\"normalized_weight\"]:.4f}  amount=${p[\"amount_usd\"]:.2f}  wallet={p[\"wallet_address\"]}")
' "$DEC_JSON"

if [[ "$RUN_PAYOUTS" == "1" ]]; then
  echo ""
  echo "--- 5. Execute payouts (RUN_PAYOUTS=1) ---"
  PAY_JSON=$(post /api/payouts "{\"decision_id\":\"$DEC_ID\"}")
  echo "$PAY_JSON" | python3 -m json.tool
  echo ""
  echo "Poll status in the dashboard at: $BASE_URL/dashboard/payouts/$DEC_ID"
else
  echo ""
  echo "--- 5. Payouts NOT executed (RUN_PAYOUTS != 1) ---"
  echo "To complete the pipeline run:"
  echo "  curl -sS -X POST $BASE_URL/api/payouts -H 'Content-Type: application/json' \\"
  echo "    -d '{\"decision_id\":\"$DEC_ID\"}'"
  echo "or set RUN_PAYOUTS=1 and re-run this script with fresh IDs."
fi

echo ""
echo "Dashboard deep links:"
echo "  Timeline : $BASE_URL/dashboard/timeline/$SUBJECT"
echo "  Payouts  : $BASE_URL/dashboard/payouts/$DEC_ID"
echo ""
echo "Done."
