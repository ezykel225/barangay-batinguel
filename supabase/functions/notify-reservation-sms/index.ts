import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Texts a resident when an official approves or declines their covered
// court reservation, so they don't have to keep checking the site.
//
// Provider: IPROG SMS (https://sms.iprogtech.com). Set the API token as
// an Edge Function secret named IPROG_SMS_API_TOKEN — Supabase Dashboard
// -> Edge Functions -> Manage secrets. Nothing else needs configuring.
//
// This function NEVER returns a non-2xx for a delivery problem. A failed
// text must not look like a failed approval — the reservation is already
// updated by the time we get here. Instead it always answers 200 with
// { sent: true } or { sent: false, reason }, and the dashboard tells the
// official to phone the resident instead. Only a malformed request (400)
// or a bug in this handler (500) is an error.

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
    const { contact_number, full_name, status, preferred_date, preferred_time } =
      await req.json()

    if (!contact_number || !status) {
      return json({ error: "contact_number and status are required" }, 400)
    }

    const apiToken = Deno.env.get("IPROG_SMS_API_TOKEN")
    if (!apiToken) {
      console.warn("IPROG_SMS_API_TOKEN is not set — skipping SMS")
      return json({
        sent: false,
        reason: "IPROG_SMS_API_TOKEN is not set. Add it under Edge Functions -> Manage secrets.",
      })
    }

    const phoneNumber = normalizePhilippineNumber(contact_number)
    if (!phoneNumber) {
      console.warn("Unusable contact number, skipping SMS")
      return json({
        sent: false,
        reason: "That contact number is not a recognisable Philippine mobile number.",
      })
    }

    const name = full_name || "Resident"
    const when = [preferred_date, preferred_time].filter(Boolean).join(" at ")

    const message =
      status === "approved"
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
