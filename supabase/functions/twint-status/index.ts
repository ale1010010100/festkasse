// Fragt den Stand einer TWINT-Zahlung bei Payrexx ab.
// Die App ruft das alle paar Sekunden auf, solange der QR-Code angezeigt wird.
import { adminClient, callerId, cors, HttpError, json, loadOrderForCaller, settleOrder } from "../_shared/payrexx.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = adminClient();
    const userId = await callerId(req, db);
    if (!userId) throw new HttpError(401, "Nicht angemeldet");
    const { order_id } = await req.json();
    const { order, club } = await loadOrderForCaller(db, order_id, userId);
    const status = await settleOrder(db, order, club.id);
    return json({ status });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
