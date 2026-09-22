import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-[#cfd6ce] bg-white px-3.5 text-[15px] text-[#18372f] outline-none transition placeholder:text-[#929c97] focus:border-[#2e6c59] focus:ring-3 focus:ring-[#2e6c59]/12 disabled:cursor-not-allowed disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}

