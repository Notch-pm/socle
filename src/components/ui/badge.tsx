import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        outline: "border-input bg-transparent text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        // Statuts (intégrations) — jetons `--success` / `--destructive` existants.
        success: "border-transparent bg-success/10 text-success",
        destructive: "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
