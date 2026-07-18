import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Props for the {@link Loader} thinking component. */
export type LoaderProps = HTMLAttributes<HTMLDivElement>;

/** Animated "Thinking..." loading indicator for assistant responses. */
export const Loader = ({ className, ...props }: LoaderProps) => (
  <div
    className={cn("flex items-center gap-1.5 text-xs text-muted-foreground/80 font-normal py-0.5 select-none", className)}
    {...props}
  >
    <span>Thinking</span>
    <span className="flex gap-1 items-center mt-1">
      <span className="animate-pulse duration-1000 delay-0 rounded-full size-1 bg-muted-foreground/60" />
      <span className="animate-pulse duration-1000 delay-200 rounded-full size-1 bg-muted-foreground/60" style={{ animationDelay: '0.2s' }} />
      <span className="animate-pulse duration-1000 delay-400 rounded-full size-1 bg-muted-foreground/60" style={{ animationDelay: '0.4s' }} />
    </span>
  </div>
);
