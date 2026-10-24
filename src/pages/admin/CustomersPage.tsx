import { ArrowRight, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState, SearchField, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { PageMeta } from '../../components/PageMeta'

export function CustomersPage() {
  const { accounts, loading, errors, refresh } = useAdminData()
  const error = errors.accounts
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'disabled' | 'admin'>('all')
  const filtered = accounts.filter((account) => {
    const term = search.trim().toLowerCase()
    const statusMatch = status === 'all' || (status === 'active' && !account.disabled) || (status === 'disabled' && account.disabled) || (status === 'admin' && account.admin)
    return (!term || `${account.displayName ?? ''} ${account.email ?? ''} ${account.uid}`.toLowerCase().includes(term)) && statusMatch
  })
  if (loading) return <LoadingState label="Loading customer accounts…" />
  return <>
    <PageMeta title="Customers — Admin" description="Manage customer accounts." />
    <AdminPageHeader eyebrow="Customers" title="Customer accounts" description="Review sign-in information and manage access through protected account controls." />
    {error && <ErrorState message={error} onRetry={() => void refresh()} />}
    <AdminPanel className="admin-list-card"><div className="admin-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search name, email or ID…" label="Search customers" /><div className="admin-filters"><select aria-label="Filter customers by status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All accounts</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="admin">Administrators</option></select></div></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Customer</th><th>Sign-in method</th><th>Verification</th><th>Status</th><th>Role</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filtered.map((account) => <tr key={account.uid}><td><Link className="admin-cell-stack admin-strong-link" to={`/admin/customers/${encodeURIComponent(account.uid)}`}><strong>{account.displayName || 'Unnamed account'}</strong><small>{account.email || 'No email address'}</small></Link></td><td>{account.providers.join(', ') || 'Email and password'}</td><td>{account.emailVerified ? 'Verified' : 'Unverified'}</td><td><StatusBadge tone={account.disabled ? 'danger' : 'positive'}>{account.disabled ? 'Disabled' : 'Active'}</StatusBadge></td><td>{account.admin ? <StatusBadge tone="info">Administrator</StatusBadge> : 'Customer'}</td><td><Link className="text-button" aria-label={`Open ${account.displayName || account.email || 'customer'}`} to={`/admin/customers/${encodeURIComponent(account.uid)}`}><ArrowRight /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users />} title={accounts.length ? 'No matching customers' : 'No customer accounts'} description={accounts.length ? 'Try a different search or filter.' : 'Registered customer profiles will appear here.'} />}
      <footer className="admin-list-footer">Showing {filtered.length} of {accounts.length} accounts</footer>
    </AdminPanel>
  </>
}
