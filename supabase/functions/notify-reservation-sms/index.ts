import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Texts a resident when an official approves or declines their covered
// court reservation, so they don't have to keep checking the site.
//
// Provider: IPROG SMS (https://sms.iprogtech.com). Set the API token as
// an Edge Function secret named IPROG_SMS_API_TOKEN — Supabase Dashboard
// -> Edge Functions -> Manage secrets.
//
// ─── WHO MAY CALL THIS ────────────────────────────────────────────────
// Only a signed-in official. This matters more than it looks.
//
// Supabase's verify_jwt is ON, but that check is satisfied by the
// PUBLISHABLE key, which ships inside the JavaScript bundle and is
// public by design. So the platform gate alone lets any visitor call
// this function. The earlier version then read the recipient's number
// and the message text straight out of the request body — meaning
// anyone who viewed the page source could send SMS to any Philippine
// number, at ~PHP 1 each, billed to the barangay, with a message that
// looked like it came from the barangay.
//
// Two changes close that:
//
//   1. The caller's own JWT is verified here, and their profiles.role
//      must be 'official'. The publishable key carries no `sub`, so a
//      key-only request fails getUser() and never reaches the provider.
//
//   2. The request body now carries ONLY a reservation_id. Every value
//      that ends up in the message — name, number, date, time, and the
//      approved/declined wording — is read from the reservations row by
//      this function. The caller cannot choose the recipient, cannot
//      write the message, and cannot claim a status the database does
//      not already hold.
//
// Any official may call it, not only the Treasurer who performs the
// approval, so that a text which failed to arrive can be re-sent by
// whoever is at the desk. The reservation must already be approved or
// declined, so a re-send can only ever repeat something true.
//
// ─── WHY FAILURES ARE 200s ────────────────────────────────────────────
// This function NEVER returns a non-2xx for a delivery problem. A failed
// text must not look like a failed approval — the reservation is already
// updated by the time we get here. Instead it answers 200 with
// { sent: true } or { sent: false, reason }, and the dashboard tells the
// official to phone the resident instead. Only a bad request (400), an
// unauthorised caller (401/403), a missing reservation (404) or a bug in
// this handler (500) is an error.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

// IPROG expects a local mobile number (09XXXXXXXXX). Accepts anything the
// form might hold — +63 917..., 63917..., 0917 123 4567 — and normalizes.
const normalizePhilippineNumber = (raw: string): string | null => {
  const digits = String(raw).replace(/\D/g, "")

  if (digits.startsWith("63") && digits.length === 12) return "0" + digits.slice(2)
  if (digits.startsWith("09") && digits.length === 11) return digits
  if (digits.startsWith("9") && digits.length === 10) return "0" + digits

  return null
}

Deno.serve(async (req: Request) => {
  // Browsers send this before the real POST on any cross-origin call.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const { reservation_id } = await req.json()

    if (!reservation_id) {
      return json({ error: "reservation_id is required" }, 400)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "Not signed in." }, 401)
    }

    // Built with the publishable key but carrying the CALLER's token, so
    // every query below runs as that user and RLS applies to them. No
    // service-role key is used anywhere in this function — it has no
    // need to read anything its caller could not read themselves.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    )

    // AUTHENTICATION. A publishable-key-only request has no `sub` claim,
    // so this is where it stops.
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return json({ error: "Not signed in." }, 401)
    }

    // AUTHORIZATION. Being signed in is not enough — residents have
    // accounts too.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || profile?.role !== "official") {
      return json({ error: "Only barangay officials can send this notification." }, 403)
    }

    // Everything in the message comes from here, not from the caller.
    const { data: reservation, error: reservationError } = await supabase
      .from("reservations")
      .select("full_name, contact_number, preferred_date, preferred_time, status")
      .eq("id", reservation_id)
      .maybeSingle()

    if (reservationError) {
      console.error("Reservation lookup failed:", reservationError.message)
      return json({ error: "Could not read that reservation." }, 500)
    }

    if (!reservation) {
      return json({ error: "No such reservation." }, 404)
    }

    // A pending or cancelled booking has no outcome to announce. This
    // also means a re-send can only ever repeat what the database says.
    if (reservation.status !== "approved" && reservation.status !== "declined") {
      return json({
        sent: false,
        reason: `This reservation is ${reservation.status}, so there is no decision to text about.`,
      })
    }

    if (!reservation.contact_number) {
      return json({ sent: false, reason: "No contact number was given for this booking." })
    }

    const apiToken = Deno.env.get("IPROG_SMS_API_TOKEN")
    if (!apiToken) {
      console.warn("IPROG_SMS_API_TOKEN is not set — skipping SMS")
      return json({
        sent: false,
        reason: "IPROG_SMS_API_TOKEN is not set. Add it under Edge Functions -> Manage secrets.",
      })
    }

    const phoneNumber = normalizePhilippineNumber(reservation.contact_number)
    if (!phoneNumber) {
      console.warn("Unusable contact number, skipping SMS")
      return json({
        sent: false,
        reason: "That contact number is not a recognisable Philippine mobile number.",
      })
    }

    const name = reservation.full_name || "Resident"
    const when = [reservation.preferred_date, reservation.preferred_time]
      .filter(Boolean)
      .join(" at ")

    const message =
      reservation.status === "approved"
        ? `Hi ${name}, your Barangay Batinguel covered court reservation${when ? " on " + when : ""} has been APPROVED. See you there!`
        : `Hi ${name}, your Barangay Batinguel covered court reservation${when ? " on " + when : ""} was DECLINED. Please visit the barangay hall for details.`

    // The published examples disagree on whether IPROG reads these from
    // the query string or a JSON body, so send both. Whichever it reads,
    // the other is ignored — and the raw reply is logged below either way.
    const params = new URLSearchParams({
      api_token: apiToken,
      phone_number: phoneNumber,
      message,
    })

    const endpoint = `https://sms.iprogtech.com/api/v1/sms_messages?${params}`

    let providerResponse: Response
    try {
      providerResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: apiToken,
          phone_number: phoneNumber,
          message,
        }),
      })
    } catch (networkErr) {
      // Could not reach the provider at all.
      console.error("SMS provider unreachable:", String(networkErr))
      return json({ sent: false, reason: `Could not reach the SMS provider: ${networkErr}` })
    }

    // Read as text first. The previous Semaphore version called .json()
    // directly, so any non-JSON reply (an HTML error page, a plain string)
    // threw and surfaced as an opaque 500 with nothing in the logs.
    const rawBody = await providerResponse.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      // leave parsed null; rawBody is what we report and log
    }

    console.log(
      "IPROG SMS response",
      JSON.stringify({ http_status: providerResponse.status, body: parsed ?? rawBody }),
    )

    // IPROG answers 200 with its own `status` field, so an HTTP 200 alone
    // does not mean the message was accepted.
    const providerStatus =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).status : undefined
    const accepted =
      providerResponse.ok && (providerStatus === undefined || Number(providerStatus) === 200)

    if (!accepted) {
      return json({
        sent: false,
        reason: `SMS provider rejected the message (HTTP ${providerResponse.status}).`,
        detail: parsed ?? rawBody,
      })
    }

    return json({ sent: true, detail: parsed ?? rawBody })
  } catch (err) {
    console.error("notify-reservation-sms failed:", String(err))
    return json({ error: String(err) }, 500)
  }
})
