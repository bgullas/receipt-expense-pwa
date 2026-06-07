import { useEffect, useState } from 'react'
import { CheckCircle, Link, Unlink, Loader, AlertCircle } from 'lucide-react'
import {
  startXeroAuth,
  getXeroStatus,
  disconnectXero,
  getClientId,
  handleXeroCallback,
} from '../services/xero'

const HAS_BUILT_IN_CLIENT_ID = Boolean(import.meta.env.VITE_XERO_CLIENT_ID)

interface Props {
  onConnected?: () => void
}

export default function XeroConnect({ onConnected }: Props) {
  const [status, setStatus] = useState(getXeroStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle OAuth callback on mount (Xero redirects back with ?code=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') && params.get('state') === 'xero-auth') {
      setLoading(true)
      handleXeroCallback()
        .then(ok => { if (ok) { setStatus(getXeroStatus()); onConnected?.() } })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [onConnected])

  const handleConnect = async () => {
    if (!getClientId()) { setError('No Xero Client ID configured'); return }
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
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
      <p className="text-sm text-blue-800 font-medium">
        Connect your Xero account to automatically sync expenses.
      </p>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <button
        onClick={handleConnect}
        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#13B5EA] text-white font-semibold hover:bg-[#0fa8db] transition-colors"
      >
        <Link size={18} /> Connect Xero
      </button>

      {HAS_BUILT_IN_CLIENT_ID && (
        <p className="text-xs text-blue-600 text-center">
          Blugraph app · ready to authorise
        </p>
      )}
    </div>
  )
}
