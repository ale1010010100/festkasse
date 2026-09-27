// Empfängt Meldungen von Payrexx («Webhook»).
// Der Inhalt der Meldung wird nicht geglaubt: Wir lesen nur die Bestell-ID
// heraus und fragen den Stand danach selbst bei Payrexx nach.
// Deploy mit:  supabase functions deploy payrexx-webhook --no-verify-jwt
import { adminClient, json, settleOrder } from "../_shared/payrexx.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readReferenceId(req: Request): Promise<string | null> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const b = await req.json().catch(() => ({}));
    return b?.transaction?.invoice?.referenceId ?? b?.transaction?.referenceId ?? null;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  return (form.get("transaction[invoice][referenceId]") ?? form.get("transaction[referenceId]")) as string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  try {
    const ref = await readReferenceId(req);
    if (!ref || !UUID.test(ref)) return json({ ok: true, ignored: true });
    const db = adminClient();
    const { data: order } = await db.from("orders").select("*").eq("id", ref).maybeSingle();
    if (!order) return json({ ok: true, ignored: true });
    const { data: event } = await db.from("events").select("club_id").eq("id", order.event_id).single();
    const status = await settleOrder(db, order, event.club_id);
    return json({ ok: true, status });
  } catch (e) {
    console.error("payrexx-webhook", e);
    // 200 zurückgeben, damit Payrexx nicht endlos wiederholt; der Status wird
    // zusätzlich von der App abgefragt.
    return json({ ok: false });
  }
});
