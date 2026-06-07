/**
 * Xero OAuth 2.0 PKCE flow + API calls — runs entirely in the browser.
 * No backend / client secret needed.
 */

const XERO_AUTH_BASE  = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL  = 'https://identity.xero.com/connect/token'
const XERO_CONN_URL   = 'https://api.xero.com/connections'
const XERO_API        = 'https://api.xero.com/api.xro/2.0'
const SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access'

const REDIRECT_URI = `${window.location.origin}${import.meta.env.BASE_URL}`

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEYS = {
  accessToken:  'xero_access_token',
  refreshToken: 'xero_refresh_token',
  expiresAt:    'xero_expires_at',
  tenantId:     'xero_tenant_id',
  orgName:      'xero_org_name',
  verifier:     'xero_pkce_verifier',
  clientId:     'xero_client_id',
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function randomBase64Url(len = 64): string {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sha256Base64Url(plain: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getClientId(): string {
  return localStorage.getItem(KEYS.clientId) ?? ''
}

export function setClientId(id: string) {
  localStorage.setItem(KEYS.clientId, id)
}

/** Redirect the browser to Xero's login/consent page */
export async function startXeroAuth() {
  const clientId = getClientId()
  if (!clientId) throw new Error('Xero Client ID not set — add it in Settings first')

  const verifier  = randomBase64Url()
  const challenge = await sha256Base64Url(verifier)
  sessionStorage.setItem(KEYS.verifier, verifier)

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    state:                 'xero-auth',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  })
  window.location.href = `${XERO_AUTH_BASE}?${params}`
}

/** Call this on page load if ?code= is in the URL (OAuth callback) */
export async function handleXeroCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code   = params.get('code')
  const state  = params.get('state')
  if (!code || state !== 'xero-auth') return false

  const verifier = sessionStorage.getItem(KEYS.verifier)
  if (!verifier) throw new Error('PKCE verifier missing — please try connecting again')

  const clientId = getClientId()

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     clientId,
    code_verifier: verifier,
  })

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error('Token exchange failed — please try again')
  const tokens = await res.json()

  // Get the connected tenant (organisation)
  const connRes = await fetch(XERO_CONN_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const connections = await connRes.json()
  const tenant = connections[0]

  localStorage.setItem(KEYS.accessToken,  tokens.access_token)
  localStorage.setItem(KEYS.refreshToken, tokens.refresh_token)
  localStorage.setItem(KEYS.expiresAt,    String(Date.now() + tokens.expires_in * 1000))
  localStorage.setItem(KEYS.tenantId,     tenant.tenantId)
  localStorage.setItem(KEYS.orgName,      tenant.tenantName)
  sessionStorage.removeItem(KEYS.verifier)

  // Clean the URL so the code doesn't linger
  window.history.replaceState({}, '', window.location.pathname)
  return true
}

export function getXeroStatus(): { connected: boolean; orgName?: string; tenantId?: string } {
  const token = localStorage.getItem(KEYS.accessToken)
  if (!token) return { connected: false }
  return {
    connected: true,
    orgName:   localStorage.getItem(KEYS.orgName) ?? undefined,
    tenantId:  localStorage.getItem(KEYS.tenantId) ?? undefined,
  }
}

export function disconnectXero() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  sessionStorage.removeItem(KEYS.verifier)
}

async function getValidToken(): Promise<{ accessToken: string; tenantId: string }> {
  const expiresAt = Number(localStorage.getItem(KEYS.expiresAt) ?? 0)
  let accessToken = localStorage.getItem(KEYS.accessToken) ?? ''

  if (Date.now() > expiresAt - 60_000) {
    // Refresh
    const refreshToken = localStorage.getItem(KEYS.refreshToken)
    if (!refreshToken) throw new Error('Not connected to Xero')
    const res = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     getClientId(),
      }),
    })
    if (!res.ok) throw new Error('Xero session expired — please reconnect')
    const tokens = await res.json()
    accessToken = tokens.access_token
    localStorage.setItem(KEYS.accessToken,  accessToken)
    localStorage.setItem(KEYS.refreshToken, tokens.refresh_token ?? refreshToken)
    localStorage.setItem(KEYS.expiresAt,    String(Date.now() + tokens.expires_in * 1000))
  }

  return {
    accessToken,
    tenantId: localStorage.getItem(KEYS.tenantId) ?? '',
  }
}

function xeroHeaders(token: { accessToken: string; tenantId: string }) {
  return {
    Authorization:    `Bearer ${token.accessToken}`,
    'Xero-Tenant-Id': token.tenantId,
    'Content-Type':   'application/json',
    Accept:           'application/json',
  }
}

const CATEGORY_TO_ACCOUNT_CODE: Record<string, string> = {
  'Advertising':             '404',
  'Auto':                    '449',
  'Bank Charges':            '404',
  'Entertainment':           '420',
  'Equipment':               '404',
  'Insurance':               '478',
  'Meals':                   '420',
  'Office Supplies':         '460',
  'Other Business Expenses': '404',
  'Professional Fees':       '404',
  'Rent':                    '469',
  'Software':                '460',
  'Travel':                  '493',
  'Utilities':               '477',
}

export async function submitExpenseToXero(extracted: import('../types').ExtractedExpense): Promise<string> {
  const token = await getValidToken()
  const accountCode = CATEGORY_TO_ACCOUNT_CODE[extracted.category] ?? '404'
  const headers = xeroHeaders(token)

  // Find or create contact
  let contactId: string | undefined
  try {
    const r = await fetch(
      `${XERO_API}/Contacts?where=Name%3D%3D%22${encodeURIComponent(extracted.vendor)}%22`,
      { headers }
    )
    const data = await r.json()
    contactId = data?.Contacts?.[0]?.ContactID
    if (!contactId) {
      const cr = await fetch(`${XERO_API}/Contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ Contacts: [{ Name: extracted.vendor || 'Unknown Vendor' }] }),
      })
      const cd = await cr.json()
      contactId = cd?.Contacts?.[0]?.ContactID
    }
  } catch { /* proceed without contact */ }

  // Find a bank/credit card account
  let bankAccountId: string | undefined
  try {
    const r = await fetch(`${XERO_API}/Accounts?where=Type%3D%3D%22BANK%22`, { headers })
    const data = await r.json()
    const accounts = data?.Accounts ?? []
    const isCreditCard = extracted.paymentMethod === 'Credit Card'
    bankAccountId =
      accounts.find((a: { BankAccountType: string; AccountID: string }) =>
        isCreditCard ? a.BankAccountType === 'CREDITCARD' : a.BankAccountType !== 'CREDITCARD'
      )?.AccountID ?? accounts[0]?.AccountID
  } catch { /* use Xero default */ }

  const lineItems = extracted.lineItems.length > 0
    ? extracted.lineItems.map(item => ({
        Description: item.description,
        Quantity:    item.quantity,
        UnitAmount:  item.unitPrice,
        AccountCode: accountCode,
        TaxType:     'NONE',
      }))
    : [{
        Description: extracted.vendor || extracted.category || 'Expense',
        Quantity:    1,
        UnitAmount:  extracted.subtotal || extracted.total,
        AccountCode: accountCode,
        TaxType:     'NONE',
      }]

  const payload = {
    BankTransactions: [{
      Type:      'SPEND',
      Date:      extracted.date,
      Reference: extracted.notes || extracted.category,
      ...(contactId     && { Contact: { ContactID: contactId } }),
      ...(bankAccountId && { BankAccount: { AccountID: bankAccountId } }),
      LineItems: lineItems,
    }],
  }

  const res = await fetch(`${XERO_API}/BankTransactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json()
    const msg = err?.Elements?.[0]?.ValidationErrors?.[0]?.Message ?? 'Submission failed'
    throw new Error(msg)
  }
  const data = await res.json()
  return data?.BankTransactions?.[0]?.BankTransactionID ?? 'unknown'
}
