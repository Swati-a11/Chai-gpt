"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, CopyIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import react from "react";

/** Custom pre element renderer to show code toolbar, capitalization, and copying. */
const CustomPre = ({ children, ...props }: any) => {
  const codeElement = react.Children.toArray(children).find(
    (child: any) => child?.type === "code" || child?.props?.node?.tagName === "code"
  ) as any;

  if (!codeElement) {
    return <pre {...props}>{children}</pre>;
  }

  const getCodeText = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(getCodeText).join("");
    if (node.props && node.props.children) return getCodeText(node.props.children);
    return "";
  };

  const rawCode = getCodeText(codeElement).trim();
  const className = codeElement.props?.className || "";
  const match = /language-(\w+)/.exec(className);
  const rawLang = match ? match[1] : "code";

  const displayLang = (() => {
    const l = rawLang.toLowerCase();
    if (l === "cpp" || l === "c++") return "C++";
    if (l === "js" || l === "javascript") return "JavaScript";
    if (l === "ts" || l === "typescript") return "TypeScript";
    if (l === "py" || l === "python") return "Python";
    if (l === "html") return "HTML";
    if (l === "css") return "CSS";
    if (l === "rs" || l === "rust") return "Rust";
    if (l === "go") return "Go";
    if (l === "json") return "JSON";
    if (l === "sh" || l === "bash" || l === "shell") return "Bash";
    return rawLang.charAt(0).toUpperCase() + rawLang.slice(1);
  })();

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-border bg-zinc-50 dark:bg-zinc-950/80">
      {/* Sticky Toolbar */}
      <div className="sticky top-0 z-10 flex h-9 items-center justify-between px-4 bg-zinc-100 dark:bg-zinc-900 border-b border-border text-xs font-mono text-zinc-600 dark:text-zinc-400 select-none">
        <span>{displayLang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer font-medium"
        >
          {copied ? (
            <>
              <CheckIcon className="size-3.5 text-emerald-500" />
              <span>Copied to clipboard</span>
            </>
          ) : (
            <>
              <CopyIcon className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      
      {/* Code Text Content */}
      <pre className="p-4 overflow-x-auto font-mono text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-950" {...props}>
        {children}
      </pre>
    </div>
  );
};

/** Props for a single message row, including the sender role. */
export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

/** Message row container; aligns user messages right and assistant messages left. */
export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

/** Props for the message bubble/content wrapper. */
export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

/** Styled bubble area containing the message body. */
export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

/** Props for the horizontal row of message action buttons. */
export type MessageActionsProps = ComponentProps<"div">;

/** Horizontal flex container for message-level action buttons. */
export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

/** Props for a single icon action button with optional tooltip. */
export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

/** Icon button for message actions (copy, regenerate, etc.) with optional tooltip. */
export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

/** Hook to access branch navigation state; must be used within `MessageBranch`. */
const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

/** Props for the multi-branch message container. */
export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

/** Context provider for navigating between multiple response variants (branches). */
export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange]
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

/** Props for the branch content area that shows one variant at a time. */
export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

/** Renders only the currently active branch child. */
export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

/** Props for the branch navigation button group. */
export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

/** Button group for branch navigation; hidden when there is only one branch. */
export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

/** Props for the previous-branch navigation button. */
export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

/** Navigates to the previous message branch variant. */
export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

/** Props for the next-branch navigation button. */
export type MessageBranchNextProps = ComponentProps<typeof Button>;

/** Navigates to the next message branch variant. */
export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

/** Props for the branch page indicator (`N of M`). */
export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

/** Displays the current branch index and total count (e.g. "2 of 3"). */
export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

/** Props for the markdown response renderer. */
export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { cjk, code, math, mermaid };

/** Renders assistant markdown with code, math, mermaid, and CJK plugins via Streamdown. */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    const components = useMemo(() => ({
      pre: CustomPre
    }), []);

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        plugins={streamdownPlugins}
        components={components}
        shikiTheme={["github-light", "github-dark"]}
        {...props}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
);

MessageResponse.displayName = "MessageResponse";

/** Props for the message toolbar container. */
export type MessageToolbarProps = ComponentProps<"div">;

/** Bottom toolbar row for message-level controls (actions, branch selector, etc.). */
export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
