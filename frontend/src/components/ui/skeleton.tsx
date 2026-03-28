import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-base-200 h-4 w-full animate-pulse rounded", className)} {...props} />
  );
}

export { Skeleton };
