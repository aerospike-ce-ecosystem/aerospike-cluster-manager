"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton({ loading, disabled, children, ...props }, ref) {
    return (
      <Button ref={ref} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </Button>
    );
  },
);
