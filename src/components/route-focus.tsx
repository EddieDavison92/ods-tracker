'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// After in-app navigation, move focus to the page heading so keyboard and screen reader users
// start at the new content rather than back at the header.
export function RouteFocus() {
  const pathname = usePathname()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const h1 = document.querySelector<HTMLElement>('main h1')
    if (!h1) return
    h1.setAttribute('tabindex', '-1')
    h1.focus({ preventScroll: true })
  }, [pathname])
  return null
}
