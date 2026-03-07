"use client";

import { use, useState, useRef, useEffect } from "react";
import { Terminal, Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTerminal } from "@/hooks/use-terminal";
import { QUICK_COMMANDS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function TerminalPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);
  const { history, loading, executeCommand, navigateHistory, clearHistory } = useTerminal(connId);

  const [input, setInput] = useState("");
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    executeCommand(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = navigateHistory("up");
      if (prev !== undefined) setInput(prev);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = navigateHistory("down");
      if (next !== undefined) setInput(next);
    }
  };

  const handleQuickCommand = (command: string) => {
    executeCommand(command);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Quick Commands */}
      <div className="border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1 text-xs">Quick:</span>
          {QUICK_COMMANDS.map((qc) => (
            <button
              key={qc.command}
              type="button"
              onClick={() => handleQuickCommand(qc.command)}
              className="focus-visible:ring-ring hover:bg-accent inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {qc.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 text-xs"
            onClick={clearHistory}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {/* Output Area */}
      <ScrollArea className="flex-1 bg-[hsl(var(--terminal-bg))]">
        <div className="space-y-3 p-4 font-mono text-sm">
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Terminal className="mb-3 h-8 w-8 text-[hsl(var(--terminal-text-dim))]" />
              <p className="text-[hsl(var(--terminal-text-muted))]">Type a command below or use a quick command above.</p>
              <p className="mt-1 text-xs text-[hsl(var(--terminal-text-dim))]">
                Use Up/Down arrows to navigate command history.
              </p>
            </div>
          )}
          {history.map((entry) => (
            <div key={entry.id} className="space-y-1">
              {/* Timestamp + Command */}
              <div className="flex items-start gap-2">
                <span className="text-xs whitespace-nowrap text-[hsl(var(--terminal-text-dim))]">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-[hsl(var(--terminal-prompt))]">$</span>
                <span className="text-[hsl(var(--terminal-text))]">{entry.command}</span>
              </div>
              {/* Output */}
              <div
                className={cn(
                  "ml-[4.5rem] break-all whitespace-pre-wrap",
                  entry.success ? "text-[hsl(var(--terminal-text-muted))]" : "text-destructive",
                )}
              >
                {entry.output}
              </div>
              <Separator className="bg-[hsl(var(--terminal-border))]" />
            </div>
          ))}
          <div ref={outputEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t bg-[hsl(var(--terminal-bg))] px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="font-mono text-sm text-[hsl(var(--terminal-prompt))]">$</span>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter aql command..."
            className="flex-1 border-[hsl(var(--terminal-border))] bg-[hsl(var(--terminal-input))] font-mono text-base text-[hsl(var(--terminal-text))] placeholder:text-[hsl(var(--terminal-text-dim))] focus-visible:ring-accent/30 sm:text-sm"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !input.trim()}
            variant="outline"
            className="border-[hsl(var(--terminal-border))] text-[hsl(var(--terminal-text))] hover:bg-[hsl(var(--terminal-border))]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
