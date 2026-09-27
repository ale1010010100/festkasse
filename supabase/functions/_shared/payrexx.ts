// Gemeinsame Hilfen für die Edge Functions (Deno)
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Prüft das Login des Aufrufers und gibt seine User-ID zurück. */
export async function callerId(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Lädt Bestellung + Event + Club und prüft, ob der Aufrufer sie bearbeiten darf. */
export async function loadOrderForCaller(db: SupabaseClient, orderId: string, userId: string) {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) throw new HttpError(404, "Bestellung nicht gefunden");
  const { data: event } = await db.from("events").select("*").eq("id", order.event_id).single();
  const { data: club } = await db.from("clubs").select("*").eq("id", event.club_id).single();
  let allowed = club.owner_id === userId;
  if (!allowed && order.helper_id) {
    const { data: helper } = await db.from("helpers").select("user_id, blocked").eq("id", order.helper_id).maybeSingle();
    allowed = !!helper && helper.user_id === userId && !helper.blocked;
  }
  if (!allowed) throw new HttpError(403, "Keine Berechtigung");
  return { order, event, club };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---------------------------------------------------------------------------
// Payrexx REST API
// ---------------------------------------------------------------------------

const API_BASE = Deno.env.get("PAYREXX_API_BASE") ?? "https://api.payrexx.com/v1.0";

function toForm(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => out.append(`${k}[]`, String(x)));
    else out.append(k, String(v));
  }
  return out.toString();
}

export async function payrexx(
  creds: { instance: string; secret: string },
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("instance", creds.instance);
  const res = await fetch(url, {
    method,
    headers: {
      "X-API-KEY": creds.secret,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? toForm(params) : undefined,
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { throw new HttpError(502, `Payrexx antwortet nicht wie erwartet (${res.status})`); }
  if (body.status !== "success") {
    throw new HttpError(502, `Payrexx: ${body.message ?? "unbekannter Fehler"}`);
  }
  return Array.isArray(body.data) ? body.data[0] : body.data;
}

export async function clubCredentials(db: SupabaseClient, clubId: string) {
  const { data } = await db.from("club_secrets").select("*").eq("club_id", clubId).maybeSingle();
  if (!data?.payrexx_instance || !data?.payrexx_secret) {
    throw new HttpError(400, "TWINT ist noch nicht eingerichtet. Der Verein muss unter Einstellungen die Payrexx-Zugangsdaten eintragen.");
  }
  return { instance: data.payrexx_instance as string, secret: data.payrexx_secret as string };
}

const PAID = ["confirmed"];
const FAILED = ["cancelled", "declined", "error", "expired"];

/** Sammelt alle Status-Werte eines Gateways (Gateway selbst + zugehörige Transaktionen). */
function gatewayStatuses(gw: any): string[] {
  const s: string[] = [];
  if (gw?.status) s.push(String(gw.status).toLowerCase());
  for (const inv of gw?.invoices ?? []) {
    for (const tr of inv?.transactions ?? []) if (tr?.status) s.push(String(tr.status).toLowerCase());
  }
  return s;
}

/**
 * Fragt den Stand der Zahlung direkt bei Payrexx ab (nie dem Webhook-Inhalt
 * vertrauen) und aktualisiert die Bestellung. Gibt den neuen Status zurück.
 */
export async function settleOrder(db: SupabaseClient, order: any, clubId: string): Promise<string> {
  if (order.status !== "pending" || !order.payrexx_gateway_id) return order.status;
  const creds = await clubCredentials(db, clubId);
  const gw = await payrexx(creds, "GET", `Gateway/${order.payrexx_gateway_id}/`);
  const statuses = gatewayStatuses(gw);
  let next: string | null = null;
  if (statuses.some((s) => PAID.includes(s))) next = "paid";
  else if (statuses.length && statuses.every((s) => FAILED.includes(s))) next = "failed";
  if (!next) return order.status;
  const { data } = await db.from("orders")
    .update({ status: next, paid_at: next === "paid" ? new Date().toISOString() : null })
    .eq("id", order.id).eq("status", "pending")
    .select("status").maybeSingle();
  return data?.status ?? next;
}
