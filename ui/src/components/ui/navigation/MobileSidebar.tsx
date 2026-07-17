import { siteConfig } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { cx, focusRing } from "@/lib/utils"
import {
  RiBookOpenLine,
  RiCodeSSlashLine,
  RiMenuLine,
  RiStackLine,
} from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { WorkspacesDropdown } from "./WorkspacesDropdown"

const navigation = [
  {
    name: "Guides",
    href: siteConfig.baseLinks.guides,
    icon: RiBookOpenLine,
  },
  { name: "Clusters", href: siteConfig.baseLinks.clusters, icon: RiStackLine },
  {
    name: "ACKO templates",
    href: siteConfig.baseLinks.ackoTemplates,
    icon: RiCodeSSlashLine,
  },
] as const

export default function MobileSidebar() {
  const pathname = usePathname()
  const isActive = (itemHref: string) =>
    pathname === itemHref ||
    pathname.startsWith(itemHref + "/") ||
    pathname.startsWith(itemHref + "?")
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          aria-label="open sidebar"
          className="group flex items-center rounded-md p-2 text-sm font-medium hover:bg-gray-100 data-[state=open]:bg-gray-100 dark:hover:bg-gray-400/10"
        >
          <RiMenuLine
            className="size-6 shrink-0 sm:size-5"
            aria-hidden="true"
          />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>
            <span className="flex items-center gap-3">
              <Image
                src="/acm-icon.svg"
                alt="Aerospike Cluster Manager"
                width={28}
                height={28}
                className="rounded-md ring-1 ring-[#0B1F33]/10"
              />
              Aerospike Cluster Manager
            </span>
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="mb-4">
            <WorkspacesDropdown />
          </div>
          <nav
            aria-label="core mobile navigation"
            className="flex flex-1 flex-col"
          >
            <ul role="list" className="space-y-1.5">
              {navigation.map((item) => (
                <li key={item.name}>
                  <DrawerClose asChild>
                    <Link
                      href={item.href}
                      className={cx(
                        isActive(item.href)
                          ? "text-primary-40 dark:text-primary-65"
                          : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
                        "flex items-center gap-x-2.5 rounded-md px-2 py-1.5 text-base font-medium transition hover:bg-gray-100 sm:text-sm dark:hover:bg-gray-900",
                        focusRing,
                      )}
                    >
                      <item.icon
                        className="size-5 shrink-0"
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  </DrawerClose>
                </li>
              ))}
            </ul>
          </nav>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
