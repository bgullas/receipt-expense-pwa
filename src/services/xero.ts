/**
 * Xero OAuth 2.0 PKCE flow + API calls — runs entirely in the browser.
 * No backend / client secret needed.
 *
 * NOTE on Xero OCR: Xero's receipt scanning is a UI-only feature in their
 * mobile app and is not exposed via their REST API. We use Claude vision for
 * OCR and attach the receipt image to the Xero transaction after creation.
 */

const XERO_AUTH_BASE = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONN_URL  = 'https://api.xero.com/connections'
const XERO_API       = 'https://api.xero.com/api.xro/2.0'
// Granular scopes for apps created after 2 March 2026
// Only request scopes the Web app type supports at the OAuth level
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.contacts',          // create / find vendors
  'accounting.banktransactions',  // create spend (expense) transactions
  'accounting.attachments',       // attach receipt images
  'accounting.settings.read',     // read chart of accounts
].join(' ')

// Hardcoded to avoid any dynamic-construction mismatches.
// Must match EXACTLY what is registered in developer.xero.com → your app → Redirect URIs.
const REDIRECT_URI = 'https://bgullas.github.io/receipt-expense-pwa/'

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEYS = {
  accessToken:  'xero_access_token',
  refreshToken: 'xero_refresh_token',
  expiresAt:    'xero_expires_at',
  tenantId:     'xero_tenant_id',
  orgName:      'xero_org_name',
  verifier:     'xero_pkce_verifier',
  clientId:     'xero_client_id',
  accounts:     'xero_accounts_cache',
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface XeroAccount {
  AccountID:   string
  Code:        string
  Name:        string
  Type:        string
  Description: string
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function randomBase64Url(len = 64): string {
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Credentials ───────────────────────────────────────────────────────────────
const BUILT_IN_CLIENT_ID     = import.meta.env.VITE_XERO_CLIENT_ID     ?? ''
const BUILT_IN_CLIENT_SECRET = import.meta.env.VITE_XERO_CLIENT_SECRET ?? ''

export function getClientId(): string {
  return localStorage.getItem(KEYS.clientId) || BUILT_IN_CLIENT_ID
}
export function setClientId(id: string) { localStorage.setItem(KEYS.clientId, id) }

function getBasicAuth(): string {
  const id     = getClientId()
  const secret = BUILT_IN_CLIENT_SECRET
  return btoa(`${id}:${secret}`)
}

function tokenHeaders(useBasicAuth: boolean): HeadersInit {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(useBasicAuth && BUILT_IN_CLIENT_SECRET
      ? { Authorization: `Basic ${getBasicAuth()}` }
      : {}),
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
/** Returns the full OAuth URL that will be used — for debugging/display */
export async function buildXeroAuthUrl(): Promise<{ url: string; clientId: string; redirectUri: string }> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Xero Client ID not configured')

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

  return {
    url:         `${XERO_AUTH_BASE}?${params}`,
    clientId,
    redirectUri: REDIRECT_URI,
  }
}

export async function startXeroAuth() {
  const { url, clientId, redirectUri } = await buildXeroAuthUrl()
  console.debug('[Xero OAuth] client_id   :', clientId)
  console.debug('[Xero OAuth] redirect_uri:', redirectUri)
  window.location.href = url
}

export async function handleXeroCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code   = params.get('code')
  const state  = params.get('state')
  if (!code || state !== 'xero-auth') return false

  const verifier = sessionStorage.getItem(KEYS.verifier)
  if (!verifier) throw new Error('PKCE verifier missing — please try connecting again')

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: tokenHeaders(true),
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     getClientId(),
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(`Token exchange failed: ${errBody?.error_description ?? res.status}`)
  }
  const tokens = await res.json()

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

  window.history.replaceState({}, '', window.location.pathname)
  return true
}

export function getXeroStatus(): { connected: boolean; orgName?: string; tenantId?: string } {
  const token = localStorage.getItem(KEYS.accessToken)
  if (!token) return { connected: false }
  return {
    connected: true,
    orgName:  localStorage.getItem(KEYS.orgName)  ?? undefined,
    tenantId: localStorage.getItem(KEYS.tenantId) ?? undefined,
  }
}

export function disconnectXero() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  sessionStorage.removeItem(KEYS.verifier)
}

// ── Token management ──────────────────────────────────────────────────────────
async function getValidToken(): Promise<{ accessToken: string; tenantId: string }> {
  const expiresAt = Number(localStorage.getItem(KEYS.expiresAt) ?? 0)
  let accessToken = localStorage.getItem(KEYS.accessToken) ?? ''

  if (Date.now() > expiresAt - 60_000) {
    const refreshToken = localStorage.getItem(KEYS.refreshToken)
    if (!refreshToken) throw new Error('Not connected to Xero')
    const res = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: tokenHeaders(true),
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     getClientId(),
      }),
    })
    if (!res.ok) throw new Error('Xero session expired — please reconnect in Settings')
    const tokens = await res.json()
    accessToken = tokens.access_token
    localStorage.setItem(KEYS.accessToken,  accessToken)
    localStorage.setItem(KEYS.refreshToken, tokens.refresh_token ?? refreshToken)
    localStorage.setItem(KEYS.expiresAt,    String(Date.now() + tokens.expires_in * 1000))
  }

  return { accessToken, tenantId: localStorage.getItem(KEYS.tenantId) ?? '' }
}

function xeroHeaders(token: { accessToken: string; tenantId: string }, contentType = 'application/json') {
  return {
    Authorization:    `Bearer ${token.accessToken}`,
    'Xero-Tenant-Id': token.tenantId,
    'Content-Type':   contentType,
    Accept:           'application/json',
  }
}

// ── Chart of accounts ─────────────────────────────────────────────────────────
/** Returns expense-class accounts from Xero, cached in localStorage for 24h */
export async function getExpenseAccounts(): Promise<XeroAccount[]> {
  const cached = localStorage.getItem(KEYS.accounts)
  if (cached) {
    const { ts, data } = JSON.parse(cached)
    // cache valid for 24 hours
    if (Date.now() - ts < 24 * 60 * 60 * 1000) return data
  }

  const token = await getValidToken()
  const res = await fetch(
    `${XERO_API}/Accounts?where=Class%3D%3D%22EXPENSE%22&order=Name`,
    { headers: xeroHeaders(token) }
  )
  if (!res.ok) throw new Error('Could not load Xero accounts')
  const data = await res.json()
  const accounts: XeroAccount[] = data?.Accounts ?? []
  localStorage.setItem(KEYS.accounts, JSON.stringify({ ts: Date.now(), data: accounts }))
  return accounts
}

// ── Submit expense ────────────────────────────────────────────────────────────
export async function submitExpenseToXero(
  extracted: import('../types').ExtractedExpense,
  accountId: string,
  imageBase64?: string,
): Promise<string> {
  const token = await getValidToken()
  const h = xeroHeaders(token)

  // 1. Find or create contact (vendor)
  let contactId: string | undefined
  try {
    const vendor = extracted.vendor.replace(/"/g, '\\"')
    const r = await fetch(
      `${XERO_API}/Contacts?where=Name%3D%3D%22${encodeURIComponent(vendor)}%22`,
      { headers: h }
    )
    const d = await r.json()
    contactId = d?.Contacts?.[0]?.ContactID
    if (!contactId) {
      const cr = await fetch(`${XERO_API}/Contacts`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ Contacts: [{ Name: extracted.vendor || 'Unknown Vendor' }] }),
      })
      contactId = (await cr.json())?.Contacts?.[0]?.ContactID
    }
  } catch { /* proceed without contact */ }

  // 2. Find a bank/card account to debit
  let bankAccountId: string | undefined
  try {
    const r = await fetch(`${XERO_API}/Accounts?where=Type%3D%3D%22BANK%22`, { headers: h })
    const d = await r.json()
    const accounts = d?.Accounts ?? []
    const isCard = extracted.paymentMethod === 'Credit Card'
    bankAccountId =
      accounts.find((a: { BankAccountType: string }) =>
        isCard ? a.BankAccountType === 'CREDITCARD' : a.BankAccountType !== 'CREDITCARD'
      )?.AccountID ?? accounts[0]?.AccountID
  } catch { /* use Xero default */ }

  // 3. Build line items using the selected account
  const lineItems = extracted.lineItems.length > 0
    ? extracted.lineItems.map(item => ({
        Description: item.description,
        Quantity:    item.quantity,
        UnitAmount:  item.unitPrice,
        AccountID:   accountId,
        TaxType:     'NONE',
      }))
    : [{
        Description: extracted.vendor || extracted.notes || 'Expense',
        Quantity:    1,
        UnitAmount:  extracted.subtotal || extracted.total,
        AccountID:   accountId,
        TaxType:     'NONE',
      }]

  // 4. Create BankTransaction (SPEND)
  const res = await fetch(`${XERO_API}/BankTransactions`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      BankTransactions: [{
        Type:      'SPEND',
        Date:      extracted.date,
        Reference: extracted.notes || extracted.vendor || '',
        ...(contactId     && { Contact:     { ContactID: contactId } }),
        ...(bankAccountId && { BankAccount: { AccountID: bankAccountId } }),
        LineItems: lineItems,
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(
      err?.Elements?.[0]?.ValidationErrors?.[0]?.Message ?? 'Xero submission failed'
    )
  }
  const txnId = (await res.json())?.BankTransactions?.[0]?.BankTransactionID

  // 5. Attach receipt image to the transaction
  if (imageBase64 && txnId) {
    try {
      const binary = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))
      await fetch(
        `${XERO_API}/BankTransactions/${txnId}/Attachments/receipt.jpg`,
        {
          method:  'PUT',
          headers: {
            Authorization:    `Bearer ${token.accessToken}`,
            'Xero-Tenant-Id': token.tenantId,
            'Content-Type':   'image/jpeg',
          },
          body: binary,
        }
      )
    } catch { /* attachment failure is non-fatal */ }
  }

  return txnId ?? 'unknown'
}
