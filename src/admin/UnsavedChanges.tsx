import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'

type GuardId = symbol
interface GuardCoordinator {
  update: (id: GuardId, message: string) => void
  allowNextNavigation: (id: GuardId) => void
}

const UnsavedChangesContext = createContext<GuardCoordinator | null>(null)

/**
 * Coordinates every dirty editor with React Router's navigation lifecycle.
 * This catches Link/useNavigate transitions and browser Back/Forward before the
 * editor unmounts, while leaving the browser's native unload protection intact.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [guards, setGuards] = useState<Map<GuardId, string>>(() => new Map())
  const guardsRef = useRef(guards)
  const navigationBypassRef = useRef<Set<GuardId>>(new Set())
  const update = useCallback((id: GuardId, message: string) => {
    const current = guardsRef.current
    if (message ? current.get(id) === message : !current.has(id)) return
    const next = new Map(current)
    if (message) next.set(id, message)
    else next.delete(id)
    guardsRef.current = next
    setGuards(next)
  }, [])
  const activeMessage = Array.from(guards.values()).at(-1)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const bypassed = navigationBypassRef.current
    navigationBypassRef.current = new Set()
    if (`${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`
      === `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`) return false
    return Array.from(guardsRef.current.entries()).some(([id]) => !bypassed.has(id))
  })

  useEffect(() => {
    if (blocker.state !== 'blocked' || !activeMessage) return
    if (window.confirm(activeMessage)) blocker.proceed()
    else blocker.reset()
  }, [activeMessage, blocker])

  const value = useMemo<GuardCoordinator>(() => ({
    update,
    allowNextNavigation: (id) => {
      navigationBypassRef.current.add(id)
      // A no-op/same-location navigation never reaches useBlocker. Do not let
      // its one-shot bypass remain armed for a later, unrelated navigation.
      queueMicrotask(() => navigationBypassRef.current.delete(id))
    },
  }), [update])

  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>
}

export function useUnsavedChanges(dirty: boolean, message = 'Leave this page and discard your unsaved changes?') {
  const coordinator = useContext(UnsavedChangesContext)
  const id = useRef<GuardId>(Symbol('unsaved-editor'))

  useEffect(() => {
    if (!dirty || !coordinator) return
    coordinator.update(id.current, message)
    return () => coordinator.update(id.current, '')
  }, [coordinator, dirty, message])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  // Some focused component tests and embedded previews use a declarative
  // MemoryRouter without the application provider. Preserve link protection
  // there, while production navigation is handled once by the router blocker.
  useEffect(() => {
    if (!dirty || coordinator) return
    const guardLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      const leavesView = destination.origin === current.origin
        && `${destination.pathname}${destination.search}${destination.hash}` !== `${current.pathname}${current.search}${current.hash}`
      if (leavesView && !window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', guardLinks, true)
    return () => document.removeEventListener('click', guardLinks, true)
  }, [coordinator, dirty, message])

  return useCallback(() => coordinator?.allowNextNavigation(id.current), [coordinator])
}
