// Tremor Raw useOnWindowResize [v0.0.0]

import * as React from "react"

export const useOnWindowResize = (handler: { (): void }) => {
  // Stash the latest handler in a ref so callers passing an inline function
  // don't cause the effect to re-bind the resize listener every render. The
  // listener stays installed for the component lifetime and always invokes
  // the freshest handler.
  const handlerRef = React.useRef(handler)
  React.useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  React.useEffect(() => {
    const handleResize = () => {
      handlerRef.current()
    }
    handleResize()
    window.addEventListener("resize", handleResize)

    return () => window.removeEventListener("resize", handleResize)
  }, [])
}
