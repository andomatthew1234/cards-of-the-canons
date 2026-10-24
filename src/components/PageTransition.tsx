import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const routeRef = useRef<HTMLDivElement>(null)
  const announcementRef = useRef<HTMLDivElement>(null)
  const previousPath = useRef(pathname)
  const previousIndex = useRef<number | null>(null)
  const historyIndex = typeof window.history.state?.idx === 'number' ? window.history.state.idx : null
  const routeChanged = previousPath.current !== pathname
  const direction = historyIndex !== null && previousIndex.current !== null && historyIndex < previousIndex.current ? 'back' : 'forward'
  const accountDestinationChanged = routeChanged && previousPath.current.startsWith('/account') && pathname.startsWith('/account')

  useLayoutEffect(() => {
    let observer: MutationObserver | null = null
    let fallbackTimer = 0

    if (routeChanged) {
      const route = routeRef.current
      const focusAndAnnounce = (focusTarget: HTMLElement, label: string) => {
        const hadTabIndex = focusTarget.hasAttribute('tabindex')
        if (!hadTabIndex) focusTarget.setAttribute('tabindex', '-1')
        focusTarget.focus({ preventScroll: true })
        if (announcementRef.current) announcementRef.current.textContent = `${label} opened`
        if (!hadTabIndex) {
          focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true })
        }
      }

      const focusHeading = () => {
        const heading = route?.querySelector<HTMLElement>('h1')
        if (!heading) return false
        observer?.disconnect()
        window.clearTimeout(fallbackTimer)
        focusAndAnnounce(heading, heading.textContent?.trim() || document.title || 'Page')
        return true
      }

      if (!focusHeading() && route) {
        observer = new MutationObserver(focusHeading)
        observer.observe(route, { childList: true, subtree: true })
        fallbackTimer = window.setTimeout(() => {
          observer?.disconnect()
          focusAndAnnounce(route, document.title || 'Page')
        }, 5_000)
      }
    }
    previousPath.current = pathname
    previousIndex.current = historyIndex
    return () => {
      observer?.disconnect()
      window.clearTimeout(fallbackTimer)
    }
  }, [historyIndex, pathname, routeChanged])

  return <>
    <div ref={announcementRef} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
    <div className={`page-transition-frame${accountDestinationChanged ? ` account-destination-transition account-destination-transition-${direction}` : ''}`}>
      <div
        ref={routeRef}
        className={`page-transition${routeChanged && !accountDestinationChanged ? ` page-transition-slide-${direction}` : ''}`}
        data-route={pathname}
        key={pathname}
      >
        {children}
      </div>
    </div>
  </>
}
