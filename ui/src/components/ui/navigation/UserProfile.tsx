"use client"

import { Button } from "@/components/Button"
import { cx, focusRing } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth-store"
import { RiMore2Fill } from "@remixicon/react"

import { DropdownUserProfile } from "./DropdownUserProfile"

/**
 * Derive a "display name" + 1–2 char monogram for the avatar bubble.
 *
 * - Authenticated: prefer ``name`` → ``preferred_username`` → ``email``
 * - Unauthenticated (OIDC disabled / not yet logged in): "Local user" / "LU"
 *
 * The monogram is computed from the same source as the display name to keep
 * them in sync when one is missing.
 */
function deriveIdentity(): { display: string; initials: string } {
  const claims = useAuthStore.getState().claims
  if (!claims) {
    return { display: "Local user", initials: "LU" }
  }
  const display =
    claims.name?.trim() ||
    claims.preferred_username?.trim() ||
    claims.email?.trim() ||
    "User"
  const trimmed = display.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  let initials: string
  if (parts.length >= 2) {
    initials = (parts[0][0] + parts[1][0]).toUpperCase()
  } else if (trimmed.includes("@")) {
    // emails: take first 2 chars of the local part
    initials = trimmed.split("@")[0].slice(0, 2).toUpperCase()
  } else {
    initials = trimmed.slice(0, 2).toUpperCase()
  }
  return { display, initials: initials || "U" }
}

function useIdentity(): { display: string; initials: string } {
  const claims = useAuthStore((s) => s.claims)
  if (!claims) {
    return { display: "Local user", initials: "LU" }
  }
  // Re-use the pure helper but read from the current claims so React
  // re-renders when the store changes.
  return deriveIdentity()
}

export const UserProfileDesktop = () => {
  const { display, initials } = useIdentity()
  return (
    <DropdownUserProfile>
      <Button
        aria-label="User settings"
        variant="ghost"
        className={cx(
          focusRing,
          "group flex w-full items-center justify-between rounded-md p-2 text-sm font-medium text-gray-900 hover:bg-gray-100 data-[state=open]:bg-gray-100 data-[state=open]:bg-gray-400/10 hover:dark:bg-gray-400/10",
        )}
      >
        <span className="flex items-center gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
            aria-hidden="true"
          >
            {initials}
          </span>
          <span className="truncate">{display}</span>
        </span>
        <RiMore2Fill
          className="size-4 shrink-0 text-gray-500 group-hover:text-gray-700 group-hover:dark:text-gray-400"
          aria-hidden="true"
        />
      </Button>
    </DropdownUserProfile>
  )
}

export const UserProfileMobile = () => {
  const { initials } = useIdentity()
  return (
    <DropdownUserProfile align="end">
      <Button
        aria-label="User settings"
        variant="ghost"
        className={cx(
          "group flex items-center rounded-md p-1 text-sm font-medium text-gray-900 hover:bg-gray-100 data-[state=open]:bg-gray-100 data-[state=open]:bg-gray-400/10 hover:dark:bg-gray-400/10",
        )}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
          aria-hidden="true"
        >
          {initials}
        </span>
      </Button>
    </DropdownUserProfile>
  )
}
