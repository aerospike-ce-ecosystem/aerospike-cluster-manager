"use client";

import { Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AckoBadge() {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="outline"
          className="border-info/30 bg-info/10 text-info gap-1 px-1.5 py-0 text-[10px] font-medium"
        >
          <Boxes className="h-3 w-3" />
          K8s
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">Managed by ACKO</TooltipContent>
    </Tooltip>
  );
}
