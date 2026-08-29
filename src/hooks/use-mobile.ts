import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Tracks whether the viewport is below the mobile breakpoint via a media query
 * subscription exposed through useSyncExternalStore: no state set inside an
 * effect, SSR-safe (server snapshot fixed at false), and no cascading renders.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
