import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  const previousIndex = useRef<number | null>(null)
  const historyIndex = typeof window.history.state?.idx === 'number' ? window.history.state.idx : null
  const routeChanged = previousPath.current !== pathname
  const direction = historyIndex !== null && previousIndex.current !== null && historyIndex < previousIndex.current ? 'back' : 'forward'
  const accountDestinationChanged = routeChanged && previousPath.current.startsWith('/account') && pathname.startsWith('/account')

  useLayoutEffect(() => {
    previousPath.current = pathname
    previousIndex.current = historyIndex
  }, [historyIndex, pathname])

  return <div className={`page-transition-frame${accountDestinationChanged ? ` account-destination-transition account-destination-transition-${direction}` : ''}`}><div className={`page-transition${routeChanged && !accountDestinationChanged ? ` page-transition-slide-${direction}` : ''}`} data-route={pathname} key={pathname}>{children}</div></div>
}
