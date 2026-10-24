import { LoaderCircle, RefreshCw } from 'lucide-react'

export function CatalogueLoading() {
  return <div className="catalogue-state" role="status" aria-live="polite"><LoaderCircle className="spin" aria-hidden="true" /><div><h2>Loading the collection</h2><p>Gathering the latest available products…</p></div></div>
}

export function CatalogueUnavailable({ retry }: { retry: () => void }) {
  return <div className="catalogue-state error" role="alert"><div><h2>The collection is temporarily unavailable</h2><p>We could not load the latest products. Please try again.</p></div><button type="button" className="button secondary" onClick={retry}><RefreshCw aria-hidden="true" /> Try again</button></div>
}

export function CatalogueEmpty() {
  return <div className="catalogue-state"><div><h2>The collection is being prepared</h2><p>There are no products available to browse right now. Please check back soon.</p></div></div>
}
