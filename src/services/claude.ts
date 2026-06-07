/**
 * Calls the Anthropic API directly from the browser.
 * The user's API key is stored in localStorage — never sent anywhere except api.anthropic.com.
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-4-8'

export const ANTHROPIC_KEY_STORAGE = 'anthropic_api_key'

const BUILT_IN_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''

export function getAnthropicKey(): string {
  return localStorage.getItem(ANTHROPIC_KEY_STORAGE) || BUILT_IN_KEY
}

export function setAnthropicKey(key: string) {
  localStorage.setItem(ANTHROPIC_KEY_STORAGE, key)
}

const EXTRACT_PROMPT = `Extract the expense data from this receipt image and return JSON matching this exact schema:
{
  "vendor": "merchant/vendor name",
  "date": "YYYY-MM-DD",
  "subtotal": number,
  "tax": number,
  "total": number,
  "currency": "USD",
  "category": "one of: Advertising|Auto|Bank Charges|Entertainment|Equipment|Insurance|Meals|Office Supplies|Other Business Expenses|Professional Fees|Rent|Software|Travel|Utilities",
  "paymentMethod": "one of: Cash|Credit Card|Debit Card|Check|Other",
  "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "amount": number }],
  "notes": "any useful info",
  "confidence": number between 0 and 1
}
Return ONLY valid JSON. No markdown, no explanation.`

export async function extractReceiptWithClaude(imageBase64: string): Promise<import('../types').ExtractedExpense> {
  const key = getAnthropicKey()
  if (!key) throw new Error('Anthropic API key not set — add it in Settings first')

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  const parsed = JSON.parse(text.trim())

  return {
    vendor:        parsed.vendor        ?? '',
    date:          parsed.date          ?? new Date().toISOString().slice(0, 10),
    subtotal:      parsed.subtotal      ?? 0,
    tax:           parsed.tax           ?? 0,
    total:         parsed.total         ?? 0,
    currency:      parsed.currency      ?? 'USD',
    category:      parsed.category      ?? 'Other Business Expenses',
    paymentMethod: parsed.paymentMethod ?? 'Credit Card',
    lineItems:     parsed.lineItems     ?? [],
    notes:         parsed.notes         ?? '',
    confidence:    parsed.confidence    ?? 0.8,
  }
}
