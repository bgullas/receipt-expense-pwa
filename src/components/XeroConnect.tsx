import { useEffect, useState } from 'react'
import { CheckCircle, Link, Unlink, Loader } from 'lucide-react'
import { getXeroConnectionStatus, getXeroAuthUrl, disconnectXero } from '../services/api'
import type { XeroConnection } from '../types'

export default function XeroConnect() {
  const [conn, setConn] = useState<XeroConnection>({ connected: false })
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const status = await getXeroConnectionStatus()
      setConn(status)
    } catch {
      setConn({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // re-check when the OAuth popup closes and returns focus
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const connect = () => {
    window.open(getXeroAuthUrl(), '_blank', 'width=600,height=700')
  }

  const disconnect = async () => {
    await disconnectXero()
    setConn({ connected: false })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 text-sm">
        <Loader size={16} className="animate-spin" /> Checking connection…
      </div>
    )
  }

  if (conn.connected) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
        <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-800">Connected to Xero</p>
          {conn.orgName && <p className="text-xs text-green-600 truncate">{conn.orgName}</p>}
        </div>
        <button
          onClick={disconnect}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
        >
          <Unlink size={13} /> Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
      <p className="text-sm text-blue-800 font-medium">
        Connect your Xero account to sync expenses automatically.
      </p>
      <button
        onClick={connect}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#13B5EA] text-white font-semibold text-sm hover:bg-[#0fa8db] transition-colors"
      >
        <Link size={16} /> Connect Xero
      </button>
    </div>
  )
}
