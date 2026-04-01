"use client";

import Link from "next/link";
import Image from "next/image";
import { Moon, Sun, Monitor, PanelLeft, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore, type Theme } from "@/stores/ui-store";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Header() {
  const { theme, setTheme, toggleSidebar, setMobileNavOpen, mobileNavOpen } = useUIStore();
  const { isDesktop } = useBreakpoint();

  const handleToggle = () => {
    if (isDesktop) {
      toggleSidebar();
    } else {
      setMobileNavOpen(!mobileNavOpen);
    }
  };

  return (
    <header className="bg-base-100/80 border-base-300/60 relative z-50 flex h-12 items-center justify-between border-b px-4 backdrop-blur-md">
      {/* Bottom gradient accent line */}
      <div className="via-primary/30 absolute right-0 bottom-0 left-0 h-[1px] bg-gradient-to-r from-transparent to-transparent" />

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              className="text-muted-foreground hover:text-base-content h-10 w-10 md:h-8 md:w-8"
              aria-label="Toggle sidebar"
            >
              {isDesktop ? <PanelLeft className="h-4 w-4" /> : <Menu className="h-5 w-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Toggle Sidebar (Cmd+B)</TooltipContent>
        </Tooltip>

        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Image
            src="/aerospike-logo.svg"
            alt="Aerospike"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <div className="flex flex-col">
            <span className="text-sm leading-none font-semibold tracking-tight">
              Aerospike Cluster Manager
            </span>
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-base-content h-10 w-10 md:h-8 md:w-8"
              aria-label="GitHub repository"
              asChild
            >
              <a
                href="https://github.com/aerospike-ce-ecosystem/aerospike-cluster-manager"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
                </svg>
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">GitHub Repository</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-base-content h-10 w-10 md:h-8 md:w-8"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : theme === "light" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            {(["light", "dark", "system"] as Theme[]).map((t) => (
              <DropdownMenuItem key={t} onClick={() => setTheme(t)} className="gap-2 capitalize">
                {t === "light" && <Sun className="text-warning h-4 w-4" />}
                {t === "dark" && <Moon className="text-info h-4 w-4" />}
                {t === "system" && <Monitor className="text-muted-foreground h-4 w-4" />}
                {t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
