const express = require('express')
const axios = require('axios')

const router = express.Router()

const QB_AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
const SCOPES = 'com.intuit.quickbooks.accounting'

// In-memory token store — replace with a DB in production
const tokenStore = {}

function getRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/qb/callback`
}

router.get('/qb/connect', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: SCOPES,
    state: 'blugraph-expense-app',
  })
  res.redirect(`${QB_AUTH_BASE}?${params}`)
})

router.get('/qb/callback', async (req, res) => {
  const { code, realmId } = req.query
  if (!code || !realmId) return res.status(400).send('Missing code or realmId')

  try {
    const creds = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64')
    const { data } = await axios.post(QB_TOKEN_URL,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: getRedirectUri(req) }),
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
    )

    // Fetch company name
    let companyName = 'My Company'
    try {
      const infoRes = await axios.get(
        `${process.env.QB_API_BASE ?? 'https://quickbooks.api.intuit.com'}/v3/company/${realmId}/companyinfo/${realmId}`,
        { headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/json' } }
      )
      companyName = infoRes.data?.QueryResponse?.CompanyInfo?.[0]?.CompanyName ?? companyName
    } catch { /* non-fatal */ }

    tokenStore.current = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      realmId,
      companyName,
      expiresAt: Date.now() + data.expires_in * 1000,
    }

    // Close the popup and refresh the parent
    res.send(`<html><body><script>window.opener && window.opener.dispatchEvent(new Event('focus')); window.close();</script><p>Connected! You can close this window.</p></body></html>`)
  } catch (err) {
    console.error('QB auth error:', err.response?.data ?? err.message)
    res.status(500).send('Authentication failed. Please try again.')
  }
})

router.get('/qb/status', (req, res) => {
  if (!tokenStore.current) return res.json({ connected: false })
  res.json({
    connected: true,
    companyName: tokenStore.current.companyName,
    realmId: tokenStore.current.realmId,
  })
})

router.post('/qb/disconnect', async (req, res) => {
  if (!tokenStore.current) return res.json({ ok: true })
  try {
    const creds = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64')
    await axios.post(QB_REVOKE_URL,
      new URLSearchParams({ token: tokenStore.current.refreshToken }),
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
    )
  } catch { /* ignore revoke errors */ }
  delete tokenStore.current
  res.json({ ok: true })
})

// Middleware to refresh token if needed — call this in other routes
async function ensureValidToken() {
  const t = tokenStore.current
  if (!t) throw new Error('Not connected to QuickBooks')
  if (Date.now() < t.expiresAt - 60_000) return t

  const creds = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64')
  const { data } = await axios.post(QB_TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken }),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
  )
  tokenStore.current = {
    ...t,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? t.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenStore.current
}

module.exports = { router, ensureValidToken, tokenStore }
