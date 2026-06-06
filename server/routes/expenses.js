const express = require('express')
const axios = require('axios')
const { ensureValidToken } = require('./auth')

const router = express.Router()

const XERO_API = 'https://api.xero.com/api.xro/2.0'

// Map app categories → Xero account codes (standard chart of accounts)
const CATEGORY_TO_ACCOUNT_CODE = {
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

function xeroHeaders(token) {
  return {
    Authorization:  `Bearer ${token.accessToken}`,
    'Xero-Tenant-Id': token.tenantId,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  }
}

router.post('/submit', async (req, res) => {
  const { expense } = req.body
  if (!expense) return res.status(400).json({ message: 'expense is required' })

  try {
    const token = await ensureValidToken()
    const { extracted } = expense
    const accountCode = CATEGORY_TO_ACCOUNT_CODE[extracted.category] ?? '404'

    // ── 1. Find or create a Contact (vendor) ────────────────────────────────
    let contactId
    try {
      const searchRes = await axios.get(
        `${XERO_API}/Contacts?where=Name%3D%3D%22${encodeURIComponent(extracted.vendor)}%22`,
        { headers: xeroHeaders(token) }
      )
      const existing = searchRes.data?.Contacts?.[0]
      if (existing) {
        contactId = existing.ContactID
      } else {
        const createRes = await axios.post(
          `${XERO_API}/Contacts`,
          { Contacts: [{ Name: extracted.vendor || 'Unknown Vendor' }] },
          { headers: xeroHeaders(token) }
        )
        contactId = createRes.data?.Contacts?.[0]?.ContactID
      }
    } catch { /* contact lookup failed — submit without contact */ }

    // ── 2. Find a bank/cash account to record the spend against ─────────────
    let bankAccountId
    try {
      const acctRes = await axios.get(
        `${XERO_API}/Accounts?where=Type%3D%3D%22BANK%22`,
        { headers: xeroHeaders(token) }
      )
      const accounts = acctRes.data?.Accounts ?? []
      const isCreditCard = extracted.paymentMethod === 'Credit Card'
      bankAccountId =
        accounts.find(a => isCreditCard
          ? a.BankAccountType === 'CREDITCARD'
          : a.BankAccountType !== 'CREDITCARD'
        )?.AccountID ?? accounts[0]?.AccountID
    } catch { /* use Xero's default */ }

    // ── 3. Build line items ──────────────────────────────────────────────────
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

    // ── 4. Create BankTransaction (SPEND) ────────────────────────────────────
    const payload = {
      BankTransactions: [{
        Type:        'SPEND',
        Date:        extracted.date,
        Reference:   extracted.notes || extracted.category,
        ...(contactId      && { Contact: { ContactID: contactId } }),
        ...(bankAccountId  && { BankAccount: { AccountID: bankAccountId } }),
        LineItems:   lineItems,
        ...(extracted.tax > 0 && {
          LineAmountTypes: 'Exclusive',
        }),
      }],
    }

    const { data } = await axios.post(
      `${XERO_API}/BankTransactions`,
      payload,
      { headers: xeroHeaders(token) }
    )

    const txn = data?.BankTransactions?.[0]
    res.json({ purchaseId: txn?.BankTransactionID ?? 'unknown' })
  } catch (err) {
    console.error('Xero submit error:', err.response?.data ?? err.message)
    const msg =
      err.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message ??
      err.message ?? 'Submission failed'
    res.status(500).json({ message: msg })
  }
})

module.exports = router
