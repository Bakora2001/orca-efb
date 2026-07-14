import { useState, useEffect, useCallback } from 'react'
import { Users as UsersIcon, Plus, UserPlus, Mail, Clock, AlertCircle, RefreshCw, Shield, ShieldAlert, Loader2 } from 'lucide-react'
import Card from '../components/ui/Card'
import { users as usersApi, type ApiUser, getUser } from '../lib/api'
import { useUTCClock } from '../components/ui/useUTCClock'

export default function Users() {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const currentUser = getUser()
  const isAdmin = currentUser?.role === 'admin'
  const { timeString } = useUTCClock()

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      setError('Access Denied: Administrator privileges required.')
      return
    }
    
    setLoading(true)
    setError(null)
    try {
      const data = await usersApi.list()
      setUsers(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  if (!isAdmin) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
        <div className="w-16 h-16 bg-red-50 text-danger rounded-full flex items-center justify-center mb-6">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-black text-textprimary mb-2">Access Denied</h2>
        <p className="text-textsecondary text-sm">
          You do not have the required administrator privileges to view or manage user accounts.
          Please contact system support if you believe this is an error.
        </p>
      </div>
    )
  }

  const activeCount = users.filter((u) => u.is_active).length

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary tracking-tight">User Management</h1>
          <p className="text-textsecondary text-sm mt-0.5">
            Manage dispatchers, administrators, and system access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-textsecondary border border-borderc rounded-lg hover:border-primary hover:text-primary transition"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 transition text-sm">
            <UserPlus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={load} className="ml-auto text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* ── Summary & Table ── */}
      <Card className="p-0 overflow-hidden border-borderc shadow-sm">
        <div className="p-5 border-b border-borderc bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <UsersIcon size={16} className="text-primary" />
            <span className="font-semibold text-textprimary">Total Users: <span className="font-black ml-1">{loading ? '...' : users.length}</span></span>
            <span className="text-textsecondary mx-2">|</span>
            <span className="font-semibold text-emerald-600">Active: <span className="font-black ml-1">{loading ? '...' : activeCount}</span></span>
          </div>
          <div className="text-xs font-semibold text-textsecondary bg-white px-3 py-1.5 border border-borderc rounded-lg">
            System Time: {timeString} UTC
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="bg-white border-b border-borderc text-xs uppercase tracking-wider text-textsecondary font-bold">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Last Login</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderc">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Loader2 size={24} className="text-primary animate-spin mx-auto mb-2" />
                    <p className="text-textsecondary text-xs font-semibold">Loading users...</p>
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition bg-white">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                        {user.full_name ? user.full_name.charAt(0) : user.username.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-textprimary">{user.full_name || '—'}</p>
                        <p className="text-xs text-textsecondary font-mono flex items-center gap-1 mt-0.5">
                          <Mail size={10} />
                          {user.email || user.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`flex items-center gap-1.5 text-xs font-bold w-fit ${
                      user.role === 'admin' ? 'text-primary' : 'text-slate-600'
                    }`}>
                      {user.role === 'admin' && <Shield size={12} />}
                      {user.role === 'admin' ? 'Administrator' : 'Dispatcher'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.is_active 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {user.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {user.last_login ? (
                      <div className="text-xs text-textsecondary flex items-center gap-1.5">
                        <Clock size={12} />
                        {new Date(user.last_login).toLocaleString('en-GB', { 
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                          timeZone: 'UTC'
                        })} UTC
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold italic">Never</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button className="text-xs font-bold text-primary hover:text-primary-dark hover:underline transition px-2 py-1">
                      Edit
                    </button>
                    {user.id !== currentUser?.id && (
                      <button className={`text-xs font-bold ml-2 hover:underline transition px-2 py-1 ${
                        user.is_active ? 'text-danger hover:text-red-700' : 'text-emerald-600 hover:text-emerald-700'
                      }`}>
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
