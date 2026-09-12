import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground",
        secondary: "border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground",
        destructive: "border-transparent bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground",
        outline: "px-2 py-0.5 text-xs font-semibold text-foreground",
        /* Repository kinds and request states: one hue, tinted for the ground. */
        model: "h-[18px] border-model/25 bg-model/[0.12] px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-model",
        dataset: "h-[18px] border-dataset/25 bg-dataset/[0.12] px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-dataset",
        space: "h-[18px] border-space/25 bg-space/[0.12] px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-space",
        success: "h-[18px] border-success/30 bg-success/[0.12] px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-success",
        rejected: "h-[18px] border-danger/30 bg-danger/[0.12] px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-danger",
        warning: "h-[18px] border-warning/30 bg-warning/[0.12] px-[7px] text-[10.5px] font-medium text-warning-soft",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
