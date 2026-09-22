import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#163b32] text-white",
        destructive: "border-[#f5c7bd] bg-[#fff1ed] text-[#9c3526]",
        outline: "border-[#d9ddd4] bg-white text-[#33443e]",
        success: "border-[#b8ddc3] bg-[#ebf8ed] text-[#23623d]",
        warning: "border-[#efc9ae] bg-[#fff3e8] text-[#9a512b]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
