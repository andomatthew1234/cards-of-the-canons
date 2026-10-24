import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminPageHeader, AdminPanel, ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { formatAdminDate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { adminFunctionsAvailable } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { manageAccount, type AccountAdminAction } from '../../lib/accounts'

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { accounts, orders, loading, busy, runAction } = useAdminData()
  const [pendingAction, setPendingAction] = useState<AccountAdminAction | null>(null)
  if (loading) return <LoadingState label="Loading customer…" />
  const account = accounts.find((item) => item.uid === id)
  if (!account) return <EmptyState title="Customer not found" description="The account may no longer exist or the link is invalid." action={<Link className="button secondary" to="/admin/customers"><ArrowLeft /> Back to customers</Link>} />
  const customerOrders = orders.filter((order) => order.userId === account.uid)
  const self = account.uid === user?.uid
  // Only the caller's own account is hidden from this screen; owner and
  // last-owner protection for every other account is decided on the server.
  const protectedAccount = self
  const canRevokeAdmin = adminFunctionsAvailable && !self && account.admin && !account.owner
  const actionDescription = pendingAction === 'delete'
    ? (adminFunctionsAvailable ? 'This permanently deletes the customer account and its private profile.' : 'This permanently blocks private site access for this account.')
    : pendingAction === 'revokeAdmin' ? 'This removes administrator access immediately. The account keeps its orders and profile.'
      : pendingAction === 'disable' ? 'This blocks the customer from accessing private site features until access is restored.' : 'This restores access to private site features.'
  const execute = async () => {
    if (!pendingAction) return
    const action = pendingAction
    const label = action === 'enable' ? 'restored' : action === 'disable' ? 'disabled' : action === 'delete' ? 'deleted' : 'revoked'
    const success = await runAction(`account-${account.uid}`, () => manageAccount(account.uid, action), `Account ${label}.`)
    if (success) { setPendingAction(null); if (action === 'delete') navigate('/admin/customers', { replace: true }) }
  }
  return <>
    <PageMeta title={`${account.displayName || account.email || 'Customer'} — Admin`} description="Review and manage a customer account." />
    <AdminPageHeader title={account.displayName || 'Customer account'} description={account.email || 'No email address is recorded.'} breadcrumbs={[{ label: 'Customers', to: '/admin/customers' }, { label: account.displayName || account.email || account.uid }]} actions={<div className="admin-page-actions"><StatusBadge tone={account.disabled ? 'danger' : 'positive'}>{account.disabled ? 'Disabled' : 'Active'}</StatusBadge>{account.owner && <StatusBadge tone="info">Owner</StatusBadge>}{account.admin && <StatusBadge tone="info">Administrator</StatusBadge>}</div>} />
    <div className="admin-detail-grid"><div className="admin-editor-main"><AdminPanel title="Account details"><dl className="admin-detail-list"><div><dt>Name</dt><dd>{account.displayName || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{account.email || 'Not provided'}</dd></div><div><dt>User ID</dt><dd className="admin-code">{account.uid}</dd></div><div><dt>Sign-in method</dt><dd>{account.providers.join(', ') || 'Email and password'}</dd></div><div><dt>Email verification</dt><dd>{account.emailVerified ? 'Verified' : 'Not verified'}</dd></div><div><dt>Created</dt><dd>{account.createdAt ? formatAdminDate(account.createdAt) : 'Unavailable'}</dd></div><div><dt>Last sign-in</dt><dd>{account.lastSignInAt ? formatAdminDate(account.lastSignInAt) : 'Unavailable'}</dd></div></dl></AdminPanel>
      <AdminPanel title="Orders" description={`${customerOrders.length} order${customerOrders.length === 1 ? '' : 's'} linked to this account.`}>{customerOrders.length ? <div className="admin-compact-list">{customerOrders.map((order) => <Link key={order.id} to={`/admin/orders/${encodeURIComponent(order.id)}`}><span><strong>Order #{order.id}</strong><small>{formatAdminDate(order.createdAt)}</small></span><StatusBadge tone={order.status === 'paid' || order.status === 'fulfilled' ? 'positive' : 'neutral'}>{order.status.replace('_', ' ')}</StatusBadge></Link>)}</div> : <EmptyState title="No orders" description="This customer has no stored orders." />}</AdminPanel></div>
      <aside className="admin-editor-aside"><AdminPanel title="Account access" description="These actions are available only to authorised administrators."><div className="admin-form-stack"><div className="admin-security-note"><ShieldAlert /><p>Administrator access is enforced securely on the server.</p></div><button className="button secondary grow" disabled={protectedAccount || busy === `account-${account.uid}`} onClick={() => setPendingAction(account.disabled ? 'enable' : 'disable')}>{account.disabled ? 'Restore access' : 'Disable access'}</button>{canRevokeAdmin && <button className="button secondary grow" disabled={busy === `account-${account.uid}`} onClick={() => setPendingAction('revokeAdmin')}>Revoke administrator</button>}<button className="button danger-button grow" disabled={protectedAccount || busy === `account-${account.uid}`} onClick={() => setPendingAction('delete')}>Delete account</button>{protectedAccount && <p className="admin-help">Your own account cannot be changed from this screen. Owner and last-owner accounts are protected by the server and can only be changed by another owner.</p>}</div></AdminPanel></aside></div>
    <ConfirmDialog open={Boolean(pendingAction)} title={`${pendingAction === 'delete' ? 'Delete' : pendingAction === 'disable' ? 'Disable' : pendingAction === 'revokeAdmin' ? 'Revoke administrator access for' : 'Restore'} ${account.displayName || account.email || 'account'}?`} description={actionDescription} confirmLabel={pendingAction === 'delete' ? 'Delete account' : pendingAction === 'disable' ? 'Disable access' : pendingAction === 'revokeAdmin' ? 'Revoke administrator' : 'Restore access'} busy={busy === `account-${account.uid}`} onCancel={() => setPendingAction(null)} onConfirm={() => void execute()} />
  </>
}
