import { Plus, Shield, Users as UsersIcon } from 'lucide-react'
import Card from '../components/ui/Card'

const users = [
  { name: 'J. Dispatcher', email: 'j.dispatcher@orcaaviation.com', role: 'Dispatcher', status: 'Active' },
  { name: 'A. Mwangi', email: 'a.mwangi@orcaaviation.com', role: 'Dispatcher', status: 'Active' },
  { name: 'S. Otieno', email: 's.otieno@orcaaviation.com', role: 'Administrator', status: 'Active' },
  { name: 'K. Njoroge', email: 'k.njoroge@orcaaviation.com', role: 'Dispatcher', status: 'Inactive' },
]

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-textprimary">Users</h1>
          <p className="text-textsecondary text-sm mt-1">Manage dispatcher and administrator accounts.</p>
        </div>
        <button className="bg-primary hover:bg-[#1850E0] text-white font-semibold rounded-lg px-5 py-2.5 flex items-center gap-2 transition w-fit">
          <Plus size={16} /> Add User
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-textsecondary text-xs border-b border-borderc">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Email</th>
                <th className="px-5 py-2 font-medium">Role</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-borderc last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-semibold text-textprimary flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-dark text-white flex items-center justify-center text-[11px] font-bold">
                      {u.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    {u.name}
                  </td>
                  <td className="px-5 py-3 text-textsecondary">{u.email}</td>
                  <td className="px-5 py-3 text-textprimary">
                    <span className="inline-flex items-center gap-1.5">
                      {u.role === 'Administrator' ? <Shield size={13} className="text-primary" /> : <UsersIcon size={13} className="text-textsecondary" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.status === 'Active' ? 'bg-success/10 text-success' : 'bg-textsecondary/10 text-textsecondary'}`}>
                      {u.status}
                    </span>
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
