import { useEffect, useState } from 'react'
import { CheckCircle, Link, Unlink, Loader, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  startXeroAuth,
  getXeroStatus,
  disconnectXero,
  getClientId,
  handleXeroCallback,
} from '../services/xero'

interface Props {
  onConnected?: () => void
}

export default function XeroConnect({ onConnected }: Props) {
  const [status, setStatus]   = useState(getXeroStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const clientId   = getClientId()
  const redirectUri = 'https://bgullas.github.io/receipt-expense-pwa/'

  // Handle OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') && params.get('state') === 'xero-auth') {
      setLoading(true)
      handleXeroCallback()
        .then(ok => { if (ok) { setStatus(getXeroStatus()); onConnected?.() } })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }
    // Surface Xero error params in the URL (e.g. error=unauthorized_client)
    const urlError = params.get('error')
    const urlErrorDesc = params.get('error_description')
    if (urlError) {
      setError(`Xero error: ${urlError}${urlErrorDesc ? ` — ${urlErrorDesc}` : ''}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [onConnected])

  const handleConnect = async () => {
    setError(null)
    try { await startXeroAuth() } catch (e) { setError((e as Error).message) }
  }

  const handleDisconnect = () => { disconnectXero(); setStatus({ connected: false }) }

  if (loading) return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 text-sm">
      <Loader size={16} className="animate-spin" /> Connecting to Xero…
    </div>
  )

  if (status.connected) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
      <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-800">Connected to Xero</p>
        {status.orgName && <p className="text-xs text-green-600 truncate">{status.orgName}</p>}
      </div>
      <button onClick={handleDisconnect} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
        <Unlink size={13} /> Disconnect
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Connection failed</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Connect card */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <p className="text-sm text-blue-800 font-medium">
          Connect your Xero account to automatically sync expenses.
        </p>
        <button
          onClick={handleConnect}
          className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#13B5EA] text-white font-semibold hover:bg-[#0fa8db] transition-colors"
        >
          <Link size={18} /> Connect Xero
        </button>
      </div>

      {/* Debug inspector */}
      <button
        type="button"
        onClick={() => setShowDebug(v => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mx-auto"
      >
        {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Connection details
      </button>

      {showDebug && (
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-2 text-xs font-mono">
          <div>
            <span className="text-gray-400">client_id</span>
            <p className="text-green-400 break-all mt-0.5">{clientId || '(not set)'}</p>
          </div>
          <div>
            <span className="text-gray-400">redirect_uri</span>
            <p className="text-green-400 break-all mt-0.5">{redirectUri}</p>
          </div>
          <div className="mt-1 pt-2 border-t border-gray-700 text-gray-400">
            Verify both values match exactly in<br />
            <span className="text-yellow-400">developer.xero.com → your app → Configuration</span>
          </div>
        </div>
      )}
    </div>
  )
}
