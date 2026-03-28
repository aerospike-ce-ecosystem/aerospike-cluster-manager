import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
}

export const StatCard = React.memo(function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  subtitle,
}: StatCardProps) {
  return (
    <Card className="gradient-border-top transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              {label}
            </p>
            <p className="metric-value text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
            {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
          </div>
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10",
              trend === "up" && "bg-success/10 text-success",
              trend === "down" && "bg-error/10 text-error",
              (!trend || trend === "neutral") && "bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
