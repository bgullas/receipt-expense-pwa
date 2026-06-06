import { useState } from 'react'
import { Send, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { ExtractedExpense, LineItem } from '../types'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../types'

interface Props {
  data: ExtractedExpense
  imageBase64?: string
  onSubmit: (data: ExtractedExpense) => void
  onCancel: () => void
  isSubmitting: boolean
}

export default function ReceiptForm({ data, onSubmit, onCancel, isSubmitting }: Props) {
  const [form, setForm] = useState<ExtractedExpense>(data)
  const [showLineItems, setShowLineItems] = useState(form.lineItems.length > 0)

  const update = <K extends keyof ExtractedExpense>(key: K, value: ExtractedExpense[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const updateLineItem = (i: number, patch: Partial<LineItem>) =>
    setForm(f => {
      const items = [...f.lineItems]
      items[i] = { ...items[i], ...patch }
      if ('quantity' in patch || 'unitPrice' in patch) {
        items[i].amount = +(items[i].quantity * items[i].unitPrice).toFixed(2)
      }
      return { ...f, lineItems: items }
    })

  const addLineItem = () =>
    setForm(f => ({
      ...f,
      lineItems: [...f.lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }],
    }))

  const removeLineItem = (i: number) =>
    setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }))

  const field = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )

  const input = (
    key: keyof ExtractedExpense,
    type: string = 'text',
    extra?: React.InputHTMLAttributes<HTMLInputElement>,
  ) => (
    <input
      type={type}
      value={String(form[key])}
      onChange={e => update(key, (type === 'number' ? +e.target.value : e.target.value) as ExtractedExpense[typeof key])}
      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
      {...extra}
    />
  )

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSubmit(form) }}
      className="flex flex-col gap-5 pb-24"
    >
      {/* Confidence badge */}
      {form.confidence < 0.85 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          Low confidence extraction — please review all fields carefully.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {field('Vendor / Merchant',
          <input
            type="text"
            value={form.vendor}
            onChange={e => update('vendor', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 col-span-2"
            placeholder="Vendor name"
            required
          />
        )}
        {field('Date', input('date', 'date'))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {field('Subtotal ($)', input('subtotal', 'number', { step: '0.01', min: '0' }))}
        {field('Tax ($)', input('tax', 'number', { step: '0.01', min: '0' }))}
        {field('Total ($)',
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.total}
            onChange={e => update('total', +e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-blue-400 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-semibold"
            required
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {field('Category',
          <select
            value={form.category}
            onChange={e => update('category', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
        {field('Payment Method',
          <select
            value={form.paymentMethod}
            onChange={e => update('paymentMethod', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        )}
      </div>

      {field('Notes',
        <textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 resize-none"
          placeholder="Optional notes..."
        />
      )}

      {/* Line items */}
      <div>
        <button
          type="button"
          onClick={() => setShowLineItems(v => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          {showLineItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Line Items ({form.lineItems.length})
        </button>

        {showLineItems && (
          <div className="mt-3 flex flex-col gap-3">
            {form.lineItems.map((item, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => updateLineItem(i, { description: e.target.value })}
                    placeholder="Description"
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button type="button" onClick={() => removeLineItem(i)} className="text-red-400 hover:text-red-600 px-1">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={item.quantity} min="1" step="1"
                    onChange={e => updateLineItem(i, { quantity: +e.target.value })}
                    placeholder="Qty" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input type="number" value={item.unitPrice} min="0" step="0.01"
                    onChange={e => updateLineItem(i, { unitPrice: +e.target.value })}
                    placeholder="Unit $" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-gray-700 font-medium flex items-center">
                    ${item.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={addLineItem} className="flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-700">
              <Plus size={16} /> Add line item
            </button>
          </div>
        )}
      </div>

      {/* Action buttons pinned to bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2"><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Sending…</span>
          ) : (
            <><Send size={18} /> Send to Xero</>
          )}
        </button>
      </div>
    </form>
  )
}
