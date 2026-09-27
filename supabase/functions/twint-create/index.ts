// Erstellt für eine offene Bestellung eine TWINT-Zahlung bei Payrexx.
// Aufruf aus der App: supabase.functions.invoke('twint-create', { body: { order_id } })
import {
  adminClient, callerId, clubCredentials, cors, HttpError, json, loadOrderForCaller, payrexx,
} from "../_shared/payrexx.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = adminClient();
    const userId = await callerId(req, db);
    if (!userId) throw new HttpError(401, "Nicht angemeldet");
    const { order_id } = await req.json();
    const { order, event, club } = await loadOrderForCaller(db, order_id, userId);

    if (order.method !== "twint") throw new HttpError(400, "Keine TWINT-Bestellung");
    if (order.status !== "pending") return json({ status: order.status });
    if (order.payrexx_link) return json({ status: "pending", link: order.payrexx_link });

    const creds = await clubCredentials(db, club.id);
    const appUrl = Deno.env.get("APP_URL") ?? "";
    const gw = await payrexx(creds, "POST", "Gateway/", {
      amount: order.total_cents,
      currency: "CHF",
      pm: ["twint"],
      referenceId: order.id,
      purpose: `${event.name} · Bestellung ${order.no}`,
      skipResultPage: 1,
      successRedirectUrl: appUrl ? `${appUrl}/danke.html` : undefined,
      failedRedirectUrl: appUrl ? `${appUrl}/danke.html?fehler=1` : undefined,
      cancelRedirectUrl: appUrl ? `${appUrl}/danke.html?abgebrochen=1` : undefined,
    });

    await db.from("orders")
      .update({ payrexx_gateway_id: gw.id, payrexx_link: gw.link })
      .eq("id", order.id);

    return json({ status: "pending", link: gw.link });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
