export interface ExtractedExpense {
  vendor: string
  date: string
  total: number
  tax: number
  subtotal: number
  currency: string
  category: string
  paymentMethod: string
  lineItems: LineItem[]
  notes: string
  confidence: number
}

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export type ExpenseStatus = 'draft' | 'pending' | 'synced' | 'error'

export interface Expense {
  id: string
  receiptImage?: string
  extracted: ExtractedExpense
  status: ExpenseStatus
  qbPurchaseId?: string
  createdAt: string
  syncedAt?: string
  errorMessage?: string
}

export interface QBConnection {
  connected: boolean
  companyName?: string
  realmId?: string
}

export const QB_CATEGORIES = [
  'Advertising',
  'Auto',
  'Bank Charges',
  'Entertainment',
  'Equipment',
  'Insurance',
  'Meals',
  'Office Supplies',
  'Other Business Expenses',
  'Professional Fees',
  'Rent',
  'Software',
  'Travel',
  'Utilities',
] as const

export const PAYMENT_METHODS = [
  'Cash',
  'Credit Card',
  'Debit Card',
  'Check',
  'Other',
] as const
