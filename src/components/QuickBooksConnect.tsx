import { useEffect, useState } from 'react'
import { CheckCircle, Link, Unlink, Loader } from 'lucide-react'
import { getQBConnectionStatus, getQBAuthUrl, disconnectQB } from '../services/api'
import type { QBConnection } from '../types'

export default function QuickBooksConnect() {
  const [conn, setConn] = useState<QBConnection>({ connected: false })
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const status = await getQBConnectionStatus()
      setConn(status)
    } catch {
      setConn({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // re-check when window regains focus (e.g. after OAuth popup)
    const handler = () => refresh()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [])

  const connect = () => {
    window.open(getQBAuthUrl(), '_blank', 'width=600,height=700')
  }

  const disconnect = async () => {
    await disconnectQB()
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
          <p className="text-sm font-semibold text-green-800">Connected to QuickBooks</p>
          {conn.companyName && <p className="text-xs text-green-600 truncate">{conn.companyName}</p>}
        </div>
        <button onClick={disconnect} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
          <Unlink size={13} /> Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4 rounded-xl bg-blue-50 border border-blue-200">
      <p className="text-sm text-blue-800 font-medium">Connect your QuickBooks account to sync expenses automatically.</p>
      <button
        onClick={connect}
        className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors"
      >
        <Link size={16} /> Connect QuickBooks
      </button>
    </div>
  )
}
