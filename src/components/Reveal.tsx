import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Reveal({ children, className = '', delay = 0, id }: { children: ReactNode; className?: string; delay?: number; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || !('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div id={id} ref={ref} className={`home-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()} style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>{children}</div>
}
