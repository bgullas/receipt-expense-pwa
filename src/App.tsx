import { useState, useCallback } from 'react'
import { Receipt, List, Settings } from 'lucide-react'
import CameraCapture from './components/CameraCapture'
import ReceiptForm from './components/ReceiptForm'
import ExpenseList from './components/ExpenseList'
import QuickBooksConnect from './components/QuickBooksConnect'
import { extractReceiptData, submitExpenseToQB } from './services/api'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Expense, ExtractedExpense } from './types'

type Tab = 'capture' | 'history' | 'settings'
type CaptureStep = 'camera' | 'processing' | 'form'

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function App() {
  const [tab, setTab] = useState<Tab>('capture')
  const [step, setStep] = useState<CaptureStep>('camera')
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [currentData, setCurrentData] = useState<ExtractedExpense | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [expenses, setExpenses] = useLocalStorage<Expense[]>('expenses', [])

  const handleCapture = useCallback(async (base64: string) => {
    setCurrentImage(base64)
    setStep('processing')
    setProcessingError(null)
    try {
      const data = await extractReceiptData(base64)
      setCurrentData(data)
      setStep('form')
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : 'Failed to process receipt')
      setStep('camera')
    }
  }, [])

  const handleSubmit = useCallback(async (data: ExtractedExpense) => {
    if (!currentImage) return
    const expense: Expense = {
      id: generateId(),
      receiptImage: currentImage,
      extracted: data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    setExpenses(prev => [...prev, expense])
    setIsSubmitting(true)

    try {
      const result = await submitExpenseToQB(expense)
      setExpenses(prev =>
        prev.map(e => e.id === expense.id
          ? { ...e, status: 'synced', qbPurchaseId: result.purchaseId, syncedAt: new Date().toISOString() }
          : e
        )
      )
    } catch (err) {
      setExpenses(prev =>
        prev.map(e => e.id === expense.id
          ? { ...e, status: 'error', errorMessage: err instanceof Error ? err.message : 'Sync failed' }
          : e
        )
      )
    } finally {
      setIsSubmitting(false)
      setCurrentImage(null)
      setCurrentData(null)
      setStep('camera')
      setTab('history')
    }
  }, [currentImage, setExpenses])

  const handleCancel = useCallback(() => {
    setCurrentImage(null)
    setCurrentData(null)
    setStep('camera')
    setProcessingError(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }, [setExpenses])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Receipt size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Expense Tracker</h1>
            <p className="text-xs text-gray-500">Powered by QuickBooks</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-6 overflow-y-auto">
        {tab === 'capture' && (
          <div className="flex flex-col items-center gap-6">
            {step === 'camera' && (
              <>
                <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-900">Capture Receipt</h2>
                  <p className="text-sm text-gray-500 mt-1">Take a photo or upload an image — AI will extract the details</p>
                </div>
                {processingError && (
                  <div className="w-full max-w-sm px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {processingError}
                  </div>
                )}
                <CameraCapture onCapture={handleCapture} />
              </>
            )}

            {step === 'processing' && (
              <div className="flex flex-col items-center justify-center gap-6 py-16">
                {currentImage && (
                  <img
                    src={`data:image/jpeg;base64,${currentImage}`}
                    alt="Processing"
                    className="w-40 h-40 object-cover rounded-2xl shadow-lg opacity-70"
                  />
                )}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                  <p className="font-semibold text-gray-800">Analysing receipt…</p>
                  <p className="text-sm text-gray-500">AI is extracting expense details</p>
                </div>
              </div>
            )}

            {step === 'form' && currentData && (
              <>
                <div className="w-full text-center">
                  <h2 className="text-xl font-bold text-gray-900">Review & Edit</h2>
                  <p className="text-sm text-gray-500 mt-1">Check the extracted details before sending</p>
                </div>
                {currentImage && (
                  <img
                    src={`data:image/jpeg;base64,${currentImage}`}
                    alt="Receipt"
                    className="w-28 h-28 object-cover rounded-2xl shadow-md border border-gray-200"
                  />
                )}
                <div className="w-full">
                  <ReceiptForm
                    data={currentData}
                    onSubmit={handleSubmit}
                    onCancel={handleCancel}
                    isSubmitting={isSubmitting}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Expense History</h2>
            <ExpenseList expenses={expenses} onDelete={handleDelete} />
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">QuickBooks</h3>
              <QuickBooksConnect />
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Data</h3>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Total expenses</p>
                  <p className="text-sm text-gray-500">{expenses.length} recorded</p>
                </div>
                <button
                  onClick={() => { if (confirm('Delete all expenses? This cannot be undone.')) setExpenses([]) }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">About</h3>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm text-gray-500 space-y-1">
                <p>Receipt Expense Tracker v1.0</p>
                <p>Blugraph · {new Date().getFullYear()}</p>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 px-4 py-2 sticky bottom-0 z-20">
        <div className="flex">
          {([
            { id: 'capture', icon: Receipt, label: 'Capture' },
            { id: 'history', icon: List,    label: 'History' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setTab(id); if (id === 'capture') { setStep('camera'); setCurrentImage(null); setCurrentData(null) } }}
              className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                tab === id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.5 : 1.8} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
