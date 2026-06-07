import { useEffect, useState, useCallback } from 'react'
import {
  Send, Edit2, ChevronDown, ChevronUp, Plus, Trash2,
  AlertCircle, Loader, CheckCircle, Store, Calendar,
  DollarSign, Tag, CreditCard, FileText,
} from 'lucide-react'
import type { ExtractedExpense, LineItem } from '../types'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../types'
import { getExpenseAccounts, getXeroStatus } from '../services/xero'
import type { XeroAccount } from '../services/xero'

interface Props {
  data: ExtractedExpense
  imageBase64?: string
  onConfirm: (data: ExtractedExpense, accountId: string) => void
  onCancel: () => void
  isSubmitting: boolean
}

// ── Field row for the read-back summary ──────────────────────────────────────
function Row({
  icon: Icon, label, value, highlight = false
}: {
  icon: React.ElementType; label: string; value: string; highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-sm font-semibold truncate ${highlight ? 'text-[#13B5EA]' : 'text-gray-900'}`}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

export default function ReceiptConfirm({ data, imageBase64, onConfirm, onCancel, isSubmitting }: Props) {
  const [editing, setEditing]           = useState(false)
  const [form, setForm]                 = useState<ExtractedExpense>(data)
  const [showLineItems, setShowLineItems] = useState(false)

  const [accounts, setAccounts]         = useState<XeroAccount[]>([])
  const [accountId, setAccountId]       = useState('')
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [accountsError, setAccountsError]     = useState<string | null>(null)

  const xeroConnected = getXeroStatus().connected

  // Load Xero accounts when component mounts (if connected)
  useEffect(() => {
    if (!xeroConnected) return
    setAccountsLoading(true)
    getExpenseAccounts()
      .then(accts => {
        setAccounts(accts)
        if (accts.length > 0) setAccountId(accts[0].AccountID)
      })
      .catch(e => setAccountsError(e.message))
      .finally(() => setAccountsLoading(false))
  }, [xeroConnected])

  const update = <K extends keyof ExtractedExpense>(key: K, value: ExtractedExpense[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const updateLineItem = (i: number, patch: Partial<LineItem>) =>
    setForm(f => {
      const items = [...f.lineItems]
      items[i] = { ...items[i], ...patch }
      if ('quantity' in patch || 'unitPrice' in patch)
        items[i].amount = +(items[i].quantity * items[i].unitPrice).toFixed(2)
      return { ...f, lineItems: items }
    })

  const handleConfirm = useCallback(() => {
    onConfirm(form, accountId)
  }, [form, accountId, onConfirm])

  // ── Read-back summary view ───────────────────────────────────────────────
  const Summary = () => (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Extracted Details</p>
        {form.confidence > 0 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            form.confidence >= 0.85 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {Math.round(form.confidence * 100)}% confidence
          </span>
        )}
      </div>
      <div className="px-4">
        <Row icon={Store}      label="Vendor"         value={form.vendor} />
        <Row icon={Calendar}   label="Date"           value={form.date} />
        <Row icon={DollarSign} label="Total"          value={`${form.currency} ${form.total.toFixed(2)}`} highlight />
        {form.tax > 0 && (
          <Row icon={DollarSign} label="Tax"          value={`${form.currency} ${form.tax.toFixed(2)}`} />
        )}
        <Row icon={Tag}        label="Category"       value={form.category} />
        <Row icon={CreditCard} label="Payment Method" value={form.paymentMethod} />
        {form.notes && (
          <Row icon={FileText} label="Notes"          value={form.notes} />
        )}
      </div>
      {form.lineItems.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            onClick={() => setShowLineItems(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            <span className="font-medium">{form.lineItems.length} line item{form.lineItems.length !== 1 ? 's' : ''}</span>
            {showLineItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showLineItems && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              {form.lineItems.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate flex-1 mr-2">{item.description}</span>
                  <span className="text-gray-900 font-medium flex-shrink-0">${item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Edit form ────────────────────────────────────────────────────────────
  const EditForm = () => {
    const inp = (label: string, key: keyof ExtractedExpense, type = 'text') => (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
        <input
          type={type}
          value={String(form[key])}
          onChange={e => update(key, (type === 'number' ? +e.target.value : e.target.value) as ExtractedExpense[typeof key])}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#13B5EA] text-sm"
        />
      </div>
    )
    return (
      <div className="flex flex-col gap-4">
        {inp('Vendor', 'vendor')}
        <div className="grid grid-cols-2 gap-3">
          {inp('Date', 'date', 'date')}
          {inp('Total', 'total', 'number')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {inp('Subtotal', 'subtotal', 'number')}
          {inp('Tax', 'tax', 'number')}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</label>
          <select value={form.category} onChange={e => update('category', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#13B5EA] text-sm">
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Method</label>
          <select value={form.paymentMethod} onChange={e => update('paymentMethod', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#13B5EA] text-sm">
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#13B5EA] text-sm resize-none" />
        </div>

        {/* Line items */}
        <div>
          <button type="button" onClick={() => setShowLineItems(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-3">
            {showLineItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Line Items ({form.lineItems.length})
          </button>
          {showLineItems && (
            <div className="flex flex-col gap-2">
              {form.lineItems.map((item, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input type="text" value={item.description} placeholder="Description"
                      onChange={e => updateLineItem(i, { description: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#13B5EA]" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }))}
                      className="text-red-400 hover:text-red-600 px-1"><Trash2 size={16} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" value={item.quantity} min="1" onChange={e => updateLineItem(i, { quantity: +e.target.value })}
                      placeholder="Qty" className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#13B5EA]" />
                    <input type="number" value={item.unitPrice} min="0" step="0.01" onChange={e => updateLineItem(i, { unitPrice: +e.target.value })}
                      placeholder="Unit $" className="px-2 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#13B5EA]" />
                    <div className="px-2 py-2 rounded-lg bg-gray-100 text-sm text-gray-700 font-medium flex items-center">
                      ${item.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setForm(f => ({ ...f, lineItems: [...f.lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }] }))}
                className="flex items-center gap-2 text-[#13B5EA] text-sm font-medium">
                <Plus size={16} /> Add line item
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Account head selector ────────────────────────────────────────────────
  const AccountSelector = () => {
    if (!xeroConnected) return (
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
        Connect Xero in Settings to select an account head and sync expenses.
      </div>
    )
    if (accountsLoading) return (
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl text-gray-500 text-sm">
        <Loader size={14} className="animate-spin" /> Loading Xero accounts…
      </div>
    )
    if (accountsError) return (
      <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <AlertCircle size={14} /> {accountsError}
      </div>
    )
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Xero Account Head
        </label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full px-3 py-3 rounded-xl border-2 border-[#13B5EA] bg-white focus:outline-none focus:ring-2 focus:ring-[#13B5EA]/30 text-sm font-medium text-gray-900"
        >
          {accounts.map(a => (
            <option key={a.AccountID} value={a.AccountID}>
              {a.Code ? `${a.Code} · ` : ''}{a.Name}
            </option>
          ))}
        </select>
        {accounts.find(a => a.AccountID === accountId)?.Description && (
          <p className="text-xs text-gray-500 px-1">
            {accounts.find(a => a.AccountID === accountId)?.Description}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-28">
      {/* Low confidence warning */}
      {form.confidence > 0 && form.confidence < 0.8 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          Low confidence ({Math.round(form.confidence * 100)}%) — please review all fields carefully.
        </div>
      )}

      {/* Read-back summary / edit form */}
      {editing ? <EditForm /> : <Summary />}

      {/* Toggle edit */}
      <button
        type="button"
        onClick={() => setEditing(v => !v)}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        {editing
          ? <><CheckCircle size={16} className="text-green-600" /> Done editing</>
          : <><Edit2 size={16} /> Edit extracted fields</>
        }
      </button>

      {/* Account head selector */}
      <AccountSelector />

      {/* Receipt image thumbnail */}
      {imageBase64 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
          <img src={`data:image/jpeg;base64,${imageBase64}`} alt="Receipt"
            className="w-12 h-12 object-cover rounded-lg flex-shrink-0 border border-gray-200" />
          <div>
            <p className="text-sm font-medium text-gray-700">Receipt image</p>
            <p className="text-xs text-gray-400">Will be attached to the Xero transaction</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex gap-3 max-w-md mx-auto">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || (xeroConnected && !accountId)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#13B5EA] text-white font-semibold hover:bg-[#0fa8db] transition-colors disabled:opacity-60"
        >
          {isSubmitting
            ? <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Sending…</>
            : <><Send size={18} /> Confirm & Send to Xero</>
          }
        </button>
      </div>
    </div>
  )
}
