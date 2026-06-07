import { useState, useCallback, useEffect } from 'react'
import { Receipt, List, Settings } from 'lucide-react'
import CameraCapture from './components/CameraCapture'
import ReceiptConfirm from './components/ReceiptConfirm'
import ExpenseList from './components/ExpenseList'
import XeroConnect from './components/XeroConnect'
import { extractReceiptWithClaude, getAnthropicKey, setAnthropicKey, ANTHROPIC_KEY_STORAGE } from './services/claude'
import { submitExpenseToXero, handleXeroCallback } from './services/xero'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Expense, ExtractedExpense } from './types'

type Tab = 'capture' | 'history' | 'settings'
type CaptureStep = 'camera' | 'processing' | 'confirm'

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function App() {
  const [tab, setTab]   = useState<Tab>('capture')
  const [step, setStep] = useState<CaptureStep>('camera')

  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [currentData, setCurrentData]   = useState<ExtractedExpense | null>(null)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [anthropicKey, setAnthropicKeyState] = useState(getAnthropicKey)

  const [expenses, setExpenses] = useLocalStorage<Expense[]>('expenses', [])

  // Handle Xero OAuth callback when the page loads with ?code=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') && params.get('state') === 'xero-auth') {
      handleXeroCallback().catch(console.error)
    }
  }, [])

  // ── Step 1: photo captured → run OCR ──────────────────────────────────────
  const handleCapture = useCallback(async (base64: string) => {
    setCurrentImage(base64)
    setStep('processing')
    setProcessingError(null)
    try {
      const data = await extractReceiptWithClaude(base64)
      setCurrentData(data)
      setStep('confirm')
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : 'Failed to process receipt')
      setStep('camera')
    }
  }, [])

  // ── Step 2: user confirms → submit to Xero ────────────────────────────────
  const handleConfirm = useCallback(async (data: ExtractedExpense, accountId: string) => {
    const expense: Expense = {
      id: generateId(),
      receiptImage: currentImage ?? undefined,
      extracted: data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    setExpenses(prev => [...prev, expense])
    setIsSubmitting(true)

    try {
      const purchaseId = await submitExpenseToXero(data, accountId, currentImage ?? undefined)
      setExpenses(prev =>
        prev.map(e => e.id === expense.id
          ? { ...e, status: 'synced', xeroPurchaseId: purchaseId, syncedAt: new Date().toISOString() }
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

  const goCapture = () => {
    setTab('capture')
    setStep('camera')
    setCurrentImage(null)
    setCurrentData(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#13B5EA] rounded-xl flex items-center justify-center">
            <Receipt size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Expense Tracker</h1>
            <p className="text-xs text-gray-500">Powered by Xero</p>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-6 overflow-y-auto">

        {/* Capture tab */}
        {tab === 'capture' && (
          <div className="flex flex-col items-center gap-6">

            {step === 'camera' && (
              <>
                <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-900">Capture Receipt</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Take a photo or upload — AI extracts the details for review
                  </p>
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
                  <div className="w-10 h-10 border-4 border-[#13B5EA]/30 border-t-[#13B5EA] rounded-full animate-spin" />
                  <p className="font-semibold text-gray-800">Reading receipt…</p>
                  <p className="text-sm text-gray-500">AI is extracting expense details</p>
                </div>
              </div>
            )}

            {step === 'confirm' && currentData && (
              <>
                <div className="w-full text-center">
                  <h2 className="text-xl font-bold text-gray-900">Review & Confirm</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Verify the details, select an account head, then send to Xero
                  </p>
                </div>
                <div className="w-full">
                  <ReceiptConfirm
                    data={currentData}
                    imageBase64={currentImage ?? undefined}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    isSubmitting={isSubmitting}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-gray-900">Expense History</h2>
            <ExpenseList expenses={expenses} onDelete={id => setExpenses(prev => prev.filter(e => e.id !== id))} />
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold text-gray-900">Settings</h2>

            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Xero</h3>
              <XeroConnect />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI — Receipt Scanning</h3>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3">
                <p className="text-sm text-gray-600">
                  Anthropic API key for AI receipt scanning.
                  Get one at{' '}
                  <span className="font-semibold text-[#13B5EA]">console.anthropic.com</span>
                </p>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={e => {
                    setAnthropicKeyState(e.target.value)
                    setAnthropicKey(e.target.value)
                    localStorage.setItem(ANTHROPIC_KEY_STORAGE, e.target.value)
                  }}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#13B5EA]"
                />
                {anthropicKey
                  ? <p className="text-xs text-green-600 font-medium">✓ API key saved locally on this device</p>
                  : <p className="text-xs text-amber-600">No key set — receipt scanning won't work</p>
                }
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</h3>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Total expenses</p>
                  <p className="text-sm text-gray-500">{expenses.length} recorded locally</p>
                </div>
                <button
                  onClick={() => { if (confirm('Delete all local expenses?')) setExpenses([]) }}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">About</h3>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm text-gray-500 space-y-1">
                <p>Receipt Expense Tracker v1.0</p>
                <p>Blugraph · {new Date().getFullYear()}</p>
                <p className="text-xs pt-1 text-gray-400">All data stored locally on this device. No server.</p>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
      <nav className="bg-white border-t border-gray-200 px-4 py-2 sticky bottom-0 z-20">
        <div className="flex">
          {([
            { id: 'capture',  icon: Receipt,  label: 'Capture'  },
            { id: 'history',  icon: List,     label: 'History'  },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => id === 'capture' ? goCapture() : setTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                tab === id ? 'text-[#13B5EA]' : 'text-gray-400 hover:text-gray-600'
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
