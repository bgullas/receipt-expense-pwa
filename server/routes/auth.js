const express = require('express')
const axios = require('axios')

const router = express.Router()

const XERO_AUTH_BASE  = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL  = 'https://identity.xero.com/connect/token'
const XERO_REVOKE_URL = 'https://identity.xero.com/connect/revocation'
const XERO_CONN_URL   = 'https://api.xero.com/connections'
const SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access'

// In-memory store — swap for a DB in production
const tokenStore = {}

function getRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/xero/callback`
}

function basicAuth() {
  return Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')
}

// ── Connect ──────────────────────────────────────────────────────────────────
router.get('/xero/connect', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.XERO_CLIENT_ID,
    redirect_uri:  getRedirectUri(req),
    scope:         SCOPES,
    state:         'blugraph-expense-app',
  })
  res.redirect(`${XERO_AUTH_BASE}?${params}`)
})

// ── OAuth callback ────────────────────────────────────────────────────────────
router.get('/xero/callback', async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).send('Missing code')

  try {
    // Exchange code for tokens
    const { data: tokens } = await axios.post(
      XERO_TOKEN_URL,
      new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: getRedirectUri(req),
      }),
      {
        headers: {
          Authorization:  `Basic ${basicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    // Get connected tenants (orgs)
    const { data: connections } = await axios.get(XERO_CONN_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const tenant = connections[0] // use first connected org

    tokenStore.current = {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      tenantId:     tenant.tenantId,
      orgName:      tenant.tenantName,
      expiresAt:    Date.now() + tokens.expires_in * 1000,
    }

    // Close popup and signal the parent window
    res.send(`
      <html><body>
        <script>
          window.opener && window.opener.dispatchEvent(new Event('focus'));
          window.close();
        </script>
        <p>Connected to Xero! You can close this window.</p>
      </body></html>
    `)
  } catch (err) {
    console.error('Xero auth error:', err.response?.data ?? err.message)
    res.status(500).send('Authentication failed. Please try again.')
  }
})

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/xero/status', (req, res) => {
  if (!tokenStore.current) return res.json({ connected: false })
  res.json({
    connected: true,
    orgName:   tokenStore.current.orgName,
    tenantId:  tokenStore.current.tenantId,
  })
})

// ── Disconnect ────────────────────────────────────────────────────────────────
router.post('/xero/disconnect', async (req, res) => {
  if (!tokenStore.current) return res.json({ ok: true })
  try {
    await axios.post(
      XERO_REVOKE_URL,
      new URLSearchParams({ token: tokenStore.current.refreshToken }),
      {
        headers: {
          Authorization:  `Basic ${basicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
  } catch { /* ignore revoke errors */ }
  delete tokenStore.current
  res.json({ ok: true })
})

// ── Token refresh helper (used by other routes) ───────────────────────────────
async function ensureValidToken() {
  const t = tokenStore.current
  if (!t) throw new Error('Not connected to Xero')
  if (Date.now() < t.expiresAt - 60_000) return t

  const { data } = await axios.post(
    XERO_TOKEN_URL,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: t.refreshToken,
    }),
    {
      headers: {
        Authorization:  `Basic ${basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  tokenStore.current = {
    ...t,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? t.refreshToken,
    expiresAt:    Date.now() + data.expires_in * 1000,
  }
  return tokenStore.current
}

module.exports = { router, ensureValidToken, tokenStore }
