import { Activity, Eye, MonitorSmartphone, MousePointerClick, PackageSearch, RefreshCw, ShoppingCart, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminPageHeader, AdminPanel, EmptyState, ErrorState, LoadingState } from '../../admin/components'
import { useAdminData } from '../../admin/AdminContext'
import { dateValue, formatAdminDate } from '../../admin/utils'
import { PageMeta } from '../../components/PageMeta'
import { listAnalyticsEvents } from '../../lib/analytics'
import type { AnalyticsEvent } from '../../types'

type Range = 7 | 30 | 90

function ranked(values: string[], names?: Map<string, string>) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, count]) => ({ key, label: names?.get(key) ?? key, count }))
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AnalyticsPage() {
  const { products } = useAdminData()
  const [range, setRange] = useState<Range>(30)
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setEvents(await listAnalyticsEvents(range)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Analytics could not be loaded.') }
    finally { setLoading(false) }
  }, [range])

  useEffect(() => { void load() }, [load])

  const report = useMemo(() => {
    const pageViews = events.filter((event) => event.name === 'page_view')
    const productViews = events.filter((event) => event.name === 'view_product')
    const cartAdds = events.filter((event) => event.name === 'add_to_cart')
    const checkoutStarts = events.filter((event) => event.name === 'begin_checkout')
    const shopViews = events.filter((event) => event.name === 'view_shop')
    const landingViews = pageViews.filter((event) => event.isLanding)
    const productNames = new Map(products.map((product) => [product.id, product.name]))
    const chartDays = Math.min(range, 14)
    const trend = Array.from({ length: chartDays }, (_, index) => {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - (chartDays - index - 1))
      const key = dayKey(date)
      return { key, label: new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(date), count: pageViews.filter((event) => { const millis = dateValue(event.createdAt); return millis > 0 && dayKey(new Date(millis)) === key }).length }
    })
    return {
      pageViews: pageViews.length,
      sessions: new Set(events.map((event) => event.sessionId)).size,
      productViews: productViews.length,
      cartAdds: cartAdds.reduce((sum, event) => sum + (event.quantity ?? 1), 0),
      checkoutStarts: checkoutStarts.length,
      shopViews: shopViews.length,
      landingPages: ranked(landingViews.map((event) => event.path)),
      referrers: ranked(landingViews.map((event) => event.referrerHost || 'Direct / unknown')),
      topPages: ranked(pageViews.map((event) => event.path)),
      topProducts: ranked(productViews.map((event) => event.itemId).filter((value): value is string => Boolean(value)), productNames),
      devices: ranked(events.map((event) => event.device)),
      trend,
      trendMax: Math.max(1, ...trend.map((day) => day.count)),
    }
  }, [events, products, range])

  return <>
    <PageMeta title="Analytics — Admin" description="First-party storefront analytics." />
    <AdminPageHeader eyebrow="Website" title="Analytics" description="Privacy-conscious first-party activity recorded without personal details." actions={<div className="admin-page-actions"><label className="admin-range"><span className="sr-only">Reporting period</span><select value={range} onChange={(event) => setRange(Number(event.target.value) as Range)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw /> Refresh</button></div>} />
    <div className="admin-info-banner"><Activity /><span><strong>First-party reporting is active</strong><small>Only page paths, product IDs, event types, device category, referring hostname and a random per-tab session ID are stored. Names, email addresses, full referring URLs, query strings and account identifiers are not recorded.</small></span></div>
    {loading ? <LoadingState label="Loading analytics…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : events.length === 0 ? <AdminPanel><EmptyState icon={<Activity />} title="Recording is ready" description="No activity has been recorded for this period yet. New activity will appear here as visitors use the storefront." /></AdminPanel> : <>
      <section className="admin-analytics-stats"><article><span><Eye />Page views</span><strong>{report.pageViews.toLocaleString('en-AU')}</strong></article><article><span><Users />Sessions</span><strong>{report.sessions.toLocaleString('en-AU')}</strong></article><article><span><PackageSearch />Product views</span><strong>{report.productViews.toLocaleString('en-AU')}</strong></article><article><span><ShoppingCart />Items added</span><strong>{report.cartAdds.toLocaleString('en-AU')}</strong></article><article><span><MousePointerClick />Checkout starts</span><strong>{report.checkoutStarts.toLocaleString('en-AU')}</strong></article></section>
      <div className="admin-analytics-layout">
        <AdminPanel title="Page-view trend" description={`Daily storefront page views for the most recent ${report.trend.length} days.`}><div className="admin-bar-chart" role="img" aria-label="Daily page views">{report.trend.map((day) => <div key={day.key} className="admin-bar-column"><strong>{day.count || ''}</strong><span style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / report.trendMax) * 100)}%` }} /><small>{day.label}</small></div>)}</div></AdminPanel>
        <AdminPanel title="Device mix" description="Approximate category based only on viewport width."><div className="admin-ranked-list">{report.devices.map((item) => <div key={item.key}><span><MonitorSmartphone />{item.label}</span><strong>{item.count}</strong></div>)}</div></AdminPanel>
        <AdminPanel title="Most viewed pages" description="Query strings are deliberately excluded."><div className="admin-ranked-list">{report.topPages.length ? report.topPages.map((item) => <div key={item.key}><span>{item.label}</span><strong>{item.count}</strong></div>) : <p className="admin-inline-empty">No page views recorded.</p>}</div></AdminPanel>
        <AdminPanel title="Most viewed products" description="Based on recorded product-detail views."><div className="admin-ranked-list">{report.topProducts.length ? report.topProducts.map((item) => <div key={item.key}><span>{item.label}</span><strong>{item.count}</strong></div>) : <p className="admin-inline-empty">No product views recorded.</p>}</div></AdminPanel>
        <AdminPanel title="Landing pages" description="The first public page viewed in each anonymous browser tab."><div className="admin-ranked-list">{report.landingPages.length ? report.landingPages.map((item) => <div key={item.key}><span>{item.label}</span><strong>{item.count}</strong></div>) : <p className="admin-inline-empty">No landing activity recorded yet.</p>}</div></AdminPanel>
        <AdminPanel title="Acquisition sources" description="Referring hostname only; full URLs and query strings are never stored."><div className="admin-ranked-list">{report.referrers.length ? report.referrers.map((item) => <div key={item.key}><span>{item.label}</span><strong>{item.count}</strong></div>) : <p className="admin-inline-empty">No acquisition sources recorded yet.</p>}</div></AdminPanel>
      </div>
      <p className="admin-footnote">Showing up to 2,000 events from the selected period, including {report.shopViews.toLocaleString('en-AU')} shop or category views. Latest recorded activity: {formatAdminDate(events[0]?.createdAt)}. These figures are operational estimates and are not payment or accounting records.</p>
    </>}
  </>
}
