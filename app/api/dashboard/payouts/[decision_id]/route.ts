import { getDb, type AttributionDecision } from "@/lib/db";
import { notFound, ok, serverError } from "@/lib/http";
import { refreshPayouts } from "@/lib/payouts-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ decision_id: string }> },
) {
  const { decision_id } = await params;
  const db = getDb();
  const decision = db
    .prepare("SELECT * FROM attribution_decisions WHERE id = ?")
    .get(decision_id) as AttributionDecision | undefined;
  if (!decision) return notFound(`Decision ${decision_id} not found.`);

  const rationale = JSON.parse(decision.rationale_json);

  try {
    const payouts = await refreshPayouts(decision_id);
    return ok({ decision, rationale, payouts });
  } catch (e) {
    return serverError("Failed to refresh payouts.", (e as Error).message);
  }
}
