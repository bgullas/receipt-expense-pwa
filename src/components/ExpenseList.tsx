import { CheckCircle, Clock, AlertCircle, ExternalLink, Trash2 } from 'lucide-react'
import type { Expense } from '../types'
import dayjs from 'dayjs'

interface Props {
  expenses: Expense[]
  onDelete: (id: string) => void
}

const STATUS_CONFIG = {
  synced:  { icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50',  label: 'Synced' },
  pending: { icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Pending' },
  draft:   { icon: Clock,        color: 'text-gray-500',   bg: 'bg-gray-50',   label: 'Draft' },
  error:   { icon: AlertCircle,  color: 'text-red-600',    bg: 'bg-red-50',    label: 'Error' },
}

export default function ExpenseList({ expenses, onDelete }: Props) {
  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="text-5xl mb-4">🧾</div>
        <p className="text-lg font-medium">No expenses yet</p>
        <p className="text-sm">Capture a receipt to get started</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {expenses.slice().reverse().map(exp => {
        const cfg = STATUS_CONFIG[exp.status]
        const Icon = cfg.icon
        return (
          <div key={exp.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              {exp.receiptImage && (
                <img
                  src={`data:image/jpeg;base64,${exp.receiptImage}`}
                  alt="Receipt thumbnail"
                  className="w-14 h-14 object-cover rounded-xl flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 truncate">{exp.extracted.vendor || 'Unknown vendor'}</p>
                  <p className="font-bold text-gray-900 flex-shrink-0">${exp.extracted.total.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{dayjs(exp.extracted.date).format('MMM D, YYYY')}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500">{exp.extracted.category}</span>
                </div>
                <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                  <Icon size={11} />
                  {cfg.label}
                  {exp.status === 'synced' && exp.qbPurchaseId && (
                    <a
                      href={`https://qbo.intuit.com/app/expense?txnId=${exp.qbPurchaseId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 hover:opacity-70"
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                {exp.errorMessage && (
                  <p className="text-xs text-red-600 mt-1 truncate">{exp.errorMessage}</p>
                )}
              </div>
              <button
                onClick={() => onDelete(exp.id)}
                className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Delete expense"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
