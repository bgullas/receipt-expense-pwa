/**
 * Cloudflare Worker — Xero token exchange proxy
 *
 * Xero's token endpoint blocks browser (CORS) requests.
 * This worker runs server-side and relays the token exchange,
 * adding CORS headers so the browser can receive the response.
 *
 * Secrets set in Cloudflare dashboard (or wrangler secret put):
 *   XERO_CLIENT_ID
 *   XERO_CLIENT_SECRET
 */

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const ALLOWED_ORIGIN = 'https://bgullas.github.io'

function cors(response, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
  if (response instanceof Response) {
    const r = new Response(response.body, response)
    Object.entries(headers).forEach(([k, v]) => r.headers.set(k, v))
    return r
  }
  return new Response(JSON.stringify(response), { status, headers })
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    const url = new URL(request.url)

    // ── POST /xero/token ──────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/xero/token') {
      try {
        // Parse incoming params from the browser
        const incoming = new URLSearchParams(await request.text())

        // Build the request to Xero — inject server-side credentials
        const body = new URLSearchParams()
        for (const [k, v] of incoming) body.set(k, v)
        body.set('client_id',     env.XERO_CLIENT_ID)
        body.set('client_secret', env.XERO_CLIENT_SECRET)

        const xeroRes = await fetch(XERO_TOKEN_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })

        const data = await xeroRes.json()
        return cors({ ...data }, xeroRes.status)
      } catch (err) {
        return cors({ error: 'proxy_error', error_description: err.message }, 500)
      }
    }

    // ── Health check ──────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return cors({ ok: true })
    }

    return cors({ error: 'not_found' }, 404)
  },
}
