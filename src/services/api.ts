import type { ExtractedExpense, Expense } from '../types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Request failed')
  }
  return res.json()
}

export async function extractReceiptData(imageBase64: string): Promise<ExtractedExpense> {
  return request('/ocr/extract', {
    method: 'POST',
    body: JSON.stringify({ image: imageBase64 }),
  })
}

export async function submitExpenseToXero(expense: Expense): Promise<{ purchaseId: string }> {
  return request('/expenses/submit', {
    method: 'POST',
    body: JSON.stringify({ expense }),
  })
}

export async function getXeroConnectionStatus(): Promise<{ connected: boolean; orgName?: string; tenantId?: string }> {
  return request('/auth/xero/status')
}

export function getXeroAuthUrl(): string {
  return `${BASE}/auth/xero/connect`
}

export async function disconnectXero(): Promise<void> {
  return request('/auth/xero/disconnect', { method: 'POST' })
}
