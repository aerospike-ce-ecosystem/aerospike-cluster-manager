import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-muted relative animate-pulse overflow-hidden rounded-md",
        "after:animate-shimmer after:absolute after:inset-0 after:translate-x-[-100%]",
        "after:via-background/20 after:bg-gradient-to-r after:from-transparent after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
