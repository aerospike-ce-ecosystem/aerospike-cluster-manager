import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded bg-base-200 h-4 w-full", className)} {...props} />;
}

export { Skeleton };
