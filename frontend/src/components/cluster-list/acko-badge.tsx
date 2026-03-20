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
          className="gap-1 border-[#ffe600]/30 bg-[#ffe600]/10 px-1.5 py-0 text-[10px] font-medium text-[#b8a800]"
        >
          <Boxes className="h-3 w-3" />
          ACKO
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">Managed by ACKO</TooltipContent>
    </Tooltip>
  );
}
