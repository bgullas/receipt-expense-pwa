const express = require('express')
const axios = require('axios')
const { ensureValidToken } = require('./auth')

const router = express.Router()

const QB_API = process.env.QB_API_BASE ?? 'https://quickbooks.api.intuit.com'

// Map app category names to QuickBooks account names
const CATEGORY_TO_QB_ACCOUNT = {
  'Advertising':              'Advertising',
  'Auto':                     'Automobile',
  'Bank Charges':             'Bank Charges',
  'Entertainment':            'Entertainment',
  'Equipment':                'Equipment Rental',
  'Insurance':                'Insurance',
  'Meals':                    'Meals and Entertainment',
  'Office Supplies':          'Office Supplies',
  'Other Business Expenses':  'Other Business Expenses',
  'Professional Fees':        'Professional Fees',
  'Rent':                     'Rent or Lease',
  'Software':                 'Computer and Internet Expenses',
  'Travel':                   'Travel',
  'Utilities':                'Utilities',
}

const PAYMENT_METHOD_MAP = {
  'Cash':        'Cash',
  'Credit Card': 'American Express',
  'Debit Card':  'Debit',
  'Check':       'Check',
  'Other':       'Cash',
}

router.post('/submit', async (req, res) => {
  const { expense } = req.body
  if (!expense) return res.status(400).json({ message: 'expense is required' })

  try {
    const token = await ensureValidToken()

    const { extracted } = expense
    const accountName = CATEGORY_TO_QB_ACCOUNT[extracted.category] ?? 'Other Business Expenses'
    const paymentMethodRef = PAYMENT_METHOD_MAP[extracted.paymentMethod] ?? 'Cash'

    // Fetch the account ID for the expense category
    const accountQuery = await axios.get(
      `${QB_API}/v3/company/${token.realmId}/query?query=${encodeURIComponent(`SELECT Id FROM Account WHERE Name = '${accountName}' MAXRESULTS 1`)}`,
      { headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' } }
    )
    const accountId = accountQuery.data?.QueryResponse?.Account?.[0]?.Id ?? '1'

    const lineItems = extracted.lineItems.length > 0
      ? extracted.lineItems.map((item, i) => ({
          Id: String(i + 1),
          Amount: item.amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: accountId, name: accountName },
            BillableStatus: 'NotBillable',
          },
          Description: item.description,
        }))
      : [{
          Id: '1',
          Amount: extracted.total,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: accountId, name: accountName },
            BillableStatus: 'NotBillable',
          },
          Description: extracted.vendor || 'Expense',
        }]

    const purchasePayload = {
      AccountRef: { value: '35', name: paymentMethodRef }, // default checking account; will resolve dynamically below
      PaymentType: extracted.paymentMethod === 'Check' ? 'Check' : 'Cash',
      TxnDate: extracted.date,
      PrivateNote: extracted.notes || undefined,
      Line: lineItems,
      EntityRef: undefined,
    }

    // Try to find a payment account matching the method
    try {
      const payQuery = await axios.get(
        `${QB_API}/v3/company/${token.realmId}/query?query=${encodeURIComponent(`SELECT Id, Name FROM Account WHERE AccountType = 'Bank' OR AccountType = 'Credit Card' MAXRESULTS 5`)}`,
        { headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' } }
      )
      const accounts = payQuery.data?.QueryResponse?.Account ?? []
      if (accounts.length > 0) {
        const isCreditCard = extracted.paymentMethod === 'Credit Card'
        const match = accounts.find(a => isCreditCard ? a.AccountType === 'Credit Card' : a.AccountType === 'Bank') ?? accounts[0]
        purchasePayload.AccountRef = { value: match.Id, name: match.Name }
        purchasePayload.PaymentType = isCreditCard ? 'CreditCard' : 'Cash'
      }
    } catch { /* use defaults */ }

    const { data: createData } = await axios.post(
      `${QB_API}/v3/company/${token.realmId}/purchase`,
      purchasePayload,
      { headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' } }
    )

    res.json({ purchaseId: createData.Purchase?.Id ?? 'unknown' })
  } catch (err) {
    console.error('QB submit error:', err.response?.data ?? err.message)
    res.status(500).json({ message: err.response?.data?.Fault?.Error?.[0]?.Message ?? err.message ?? 'Submission failed' })
  }
})

module.exports = router
