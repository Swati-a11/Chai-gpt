"use client";

import { isTextUIPart, type UIMessage } from "ai";
import type { ChatStatus } from "ai";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  GitBranchIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  CopyIcon,
  RotateCcwIcon,
  Trash2Icon,
  ExternalLinkIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { useDeleteMessage } from "@/features/messages/hooks/use-messages";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { Loader } from "@/components/ai-elements/loader";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

/** Extracts plain text from a `UIMessage` by joining all text parts. */
function getMessageText(message: UIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

function parseMessageSearchState(text: string) {
  // Check the strings matching progress output (without emojis)
  const isSearching = text.includes("Searching the web...");
  const successMatch = text.match(/Found (\d+) relevant sources/);
  const isAnalyzing = text.includes("Analyzing information...");
  const isGenerating = text.includes("Generating final answer...");
  const isFailed = text.includes("Search failed");

  const foundCount = successMatch ? parseInt(successMatch[1], 10) : null;

  // We should strip the search header blocks from the main text body to keep the main output clean
  let mainText = text;
  mainText = mainText.replace(/Searching the web\.\.\.\n?/, "");
  mainText = mainText.replace(/Found \d+ relevant sources\n?/, "");
  mainText = mainText.replace(/Analyzing information\.\.\.\n?/, "");
  mainText = mainText.replace(/Generating final answer\.\.\.\n?/, "");
  mainText = mainText.replace(/Search failed\.\n?/, "");
  mainText = mainText.replace(/I couldn't access live web search right now\. Here's the best answer based on my existing knowledge\.\n?/, "");

  // Strip sources block and return parsed sources
  const sourcesIndex = mainText.indexOf("**Sources:**");
  let parsedSources: { name: string; url: string }[] = [];
  if (sourcesIndex !== -1) {
    const sourcesPart = mainText.slice(sourcesIndex);
    mainText = mainText.slice(0, sourcesIndex);
    
    const lines = sourcesPart.split("\n");
    for (const line of lines) {
      const match = line.match(/•\s+\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        parsedSources.push({
          name: match[1].trim(),
          url: match[2].trim()
        });
      }
    }
  }

  // Also clean up raw Tool Result dumps if they show up in text-delta
  const toolResultIndex = mainText.indexOf("📋 Tool Result:");
  if (toolResultIndex !== -1) {
    const endOfToolResult = mainText.indexOf("\n\n", toolResultIndex);
    if (endOfToolResult !== -1) {
      mainText = mainText.slice(0, toolResultIndex) + mainText.slice(endOfToolResult + 2);
    } else {
      mainText = mainText.slice(0, toolResultIndex);
    }
  }

  return {
    isSearching,
    foundCount,
    isAnalyzing,
    isGenerating,
    isFailed,
    sources: parsedSources,
    mainText: mainText.trim(),
  };
}

type ChatMessagesProps = {
  messages: UIMessage[];
  status: ChatStatus;
  conversationId: string;
  regenerate: (options?: any) => Promise<any>;
  setMessages: (messages: UIMessage[]) => void;
};

/**
 * Renders the conversation message list with markdown responses and a loading indicator.
 */
export function ChatMessages({ messages, status, conversationId, regenerate, setMessages }: ChatMessagesProps) {
  const isWaiting =
    status === "submitted" && messages.at(-1)?.role === "user";
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteMessage(conversationId);

  async function handleCreateBranch(messageId: string) {
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messageId,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const branch = await response.json();
      toast.success("Branch created");

      // Invalidate active conversation queries to refresh branch listing
      void queryClient.invalidateQueries({
        queryKey: ["branches", conversationId],
      });

      // Navigate to the new branch
      router.push(`/c/${conversationId}?branchId=${branch.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to create branch");
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMutation.mutateAsync(messageId);
      // Remove instantly from client state
      setMessages(messages.filter((m) => m.id !== messageId));
      toast.success("Message deleted");
      void queryClient.invalidateQueries({
        queryKey: ["messages", conversationId]
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to delete message");
    }
  };

  const handleCopyMessageText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Conversation>
      <ConversationContent className="py-8">
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const isStreaming = isLast && status === "streaming" && message.role === "assistant";
          const rawText = getMessageText(message);
          const { isSearching, foundCount, isAnalyzing, isGenerating, isFailed, sources, mainText } = parseMessageSearchState(rawText);

          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="w-full"
            >
              <ContextMenu>
                <ContextMenuTrigger className="w-full">
                  <Message from={message.role} className="relative group">
                    <MessageContent className="w-full">
                      {/* Streaming Progress Status Card */}
                      {message.role === "assistant" && (isSearching || foundCount !== null || isAnalyzing || isGenerating || isFailed) && (
                        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground w-fit max-w-sm animate-in fade-in duration-200 select-none">
                          {/* Step 1: Searching */}
                          <div className="flex items-center gap-2">
                            {foundCount !== null || isAnalyzing || isGenerating ? (
                              <CheckCircle2Icon className="size-3.5 text-muted-foreground/60 shrink-0" />
                            ) : isFailed ? (
                              <AlertCircleIcon className="size-3.5 text-destructive shrink-0" />
                            ) : (
                              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground/40 shrink-0" />
                            )}
                            <span className={cn(
                              (foundCount !== null || isAnalyzing || isGenerating) && "opacity-50"
                            )}>
                              Searching the web...
                            </span>
                          </div>

                          {/* Step 2: Found sources */}
                          {(foundCount !== null || isFailed) && (
                            <div className="flex items-center gap-2 animate-in fade-in duration-300">
                              {isFailed ? (
                                <AlertCircleIcon className="size-3.5 text-destructive shrink-0" />
                              ) : (
                                <CheckCircle2Icon className="size-3.5 text-muted-foreground/60 shrink-0" />
                              )}
                              <span className={cn(
                                (isAnalyzing || isGenerating) && "opacity-60"
                              )}>
                                {isFailed 
                                  ? "Search failed" 
                                  : `Found ${foundCount} relevant sources`}
                              </span>
                            </div>
                          )}

                          {/* Step 3: Analyzing */}
                          {isAnalyzing && !isFailed && (
                            <div className="flex items-center gap-2 animate-in fade-in duration-300">
                              {isGenerating ? (
                                <CheckCircle2Icon className="size-3.5 text-muted-foreground/60 shrink-0" />
                              ) : (
                                <Loader2Icon className="size-3.5 animate-spin text-muted-foreground/40 shrink-0" />
                              )}
                              <span className={cn(isGenerating && "opacity-50")}>
                                Analyzing information...
                              </span>
                            </div>
                          )}

                          {/* Step 4: Generating */}
                          {isGenerating && !isFailed && (
                            <div className="flex items-center gap-2 animate-in fade-in duration-300">
                              {isStreaming ? (
                                <Loader2Icon className="size-3.5 animate-spin text-muted-foreground/40 shrink-0" />
                              ) : (
                                <CheckCircle2Icon className="size-3.5 text-muted-foreground/60 shrink-0" />
                              )}
                              <span className={cn(!isStreaming && "opacity-50")}>
                                Generating final answer...
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Render the actual response, omitting the search state headers */}
                      {(mainText || message.role === "user") && (
                        <MessageResponse isAnimating={isStreaming}>
                          {message.role === "assistant" ? mainText : rawText}
                        </MessageResponse>
                      )}

                      {/* Web Search Source Cards */}
                      {message.role === "assistant" && !isStreaming && sources && sources.length > 0 && (
                        <div className="mt-5 border-t border-border/60 pt-4 animate-in fade-in duration-300">
                          <div className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider mb-3 select-none">
                            Sources
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {sources.map((src, idx) => {
                              let domain = "";
                              try {
                                domain = new URL(src.url).hostname.replace("www.", "");
                              } catch (_) {
                                domain = src.url;
                              }

                              const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

                              return (
                                <a
                                  key={idx}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group flex flex-col justify-between p-3 rounded-lg border border-border/80 bg-muted/10 hover:bg-muted/30 hover:border-muted-foreground/20 hover:shadow-sm transition-all duration-200 cursor-pointer select-none"
                                >
                                  <div className="flex gap-2.5 items-start">
                                    <div className="size-6 rounded bg-background border flex items-center justify-center shrink-0 border-border/80 overflow-hidden mt-0.5">
                                      <img
                                        src={faviconUrl}
                                        alt={src.name}
                                        className="size-4 object-contain"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = "none";
                                        }}
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-foreground truncate">
                                        {src.name}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                                        {domain}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                                    <span className="truncate pr-2">Visit source website</span>
                                    <span className="flex items-center gap-0.5 shrink-0 text-primary group-hover:text-primary/95">
                                      Open <ExternalLinkIcon className="size-3" />
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </MessageContent>

                    {/* Smooth Fade-in Hover Action Menu */}
                    <MessageActions className="opacity-0 group-hover:opacity-100 transition-opacity justify-end absolute right-0 -bottom-6 z-20 bg-background/90 border rounded-md shadow-sm py-0.5 px-1 flex gap-0.5">
                      <MessageAction
                        tooltip="Copy response"
                        onClick={() => handleCopyMessageText(message.role === "assistant" ? mainText : rawText)}
                      >
                        <CopyIcon className="size-3.5" />
                      </MessageAction>

                      {message.role === "assistant" && (
                        <MessageAction
                          tooltip="Regenerate response"
                          onClick={() => {
                            void regenerate();
                            toast.success("Response regenerated");
                          }}
                        >
                          <RotateCcwIcon className="size-3.5" />
                        </MessageAction>
                      )}

                      <MessageAction
                        tooltip="Branch from here"
                        onClick={() => handleCreateBranch(message.id)}
                      >
                        <GitBranchIcon className="size-3.5" />
                      </MessageAction>

                      <MessageAction
                        tooltip="Delete message"
                        onClick={() => handleDeleteMessage(message.id)}
                        className="hover:text-destructive hover:bg-destructive/10 text-muted-foreground"
                      >
                        <Trash2Icon className="size-3.5" />
                      </MessageAction>
                    </MessageActions>
                  </Message>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleCopyMessageText(message.role === "assistant" ? mainText : rawText)}>
                    <CopyIcon className="mr-2 size-4 text-muted-foreground" />
                    Copy text
                  </ContextMenuItem>
                  {message.role === "assistant" && (
                    <ContextMenuItem onClick={() => { void regenerate(); toast.success("Response regenerated"); }}>
                      <RotateCcwIcon className="mr-2 size-4 text-muted-foreground" />
                      Regenerate response
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={() => handleCreateBranch(message.id)}>
                    <GitBranchIcon className="mr-2 size-4 text-muted-foreground" />
                    Branch from here
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleDeleteMessage(message.id)} className="text-destructive focus:text-destructive">
                    <Trash2Icon className="mr-2 size-4" />
                    Delete message
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </motion.div>
          );
        })}

        {isWaiting ? (
          <Message from="assistant">
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
    </Conversation>
  );
}
