"use client";
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from "@ai-sdk/react"
import React, { useMemo } from 'react'
import { useConversations, useBranches } from '../hooks/use-conversation';
import { queryKeys } from '../utils/query-keys';
import { toast } from 'sonner';
import { ChatEmpty } from './chat-empty';
import { ChatMessages } from './chat-messages';
import { ChatComposer } from './chat-composer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, GitBranchIcon } from "lucide-react";
import { useRouter } from "next/navigation";

type ConversationViewProps = {
    conversationId: string;
    branchId?: string;
    initialMessages: UIMessage[];
};

/**
 * Main chat view — header, message list (or empty state), and composer with streaming.
 */
export const ConversationView = ({ conversationId, branchId, initialMessages }: ConversationViewProps) => {

    const queryClient = useQueryClient();
    const router = useRouter();
    const { data: conversations } = useConversations();
    const { data: branches } = useBranches(conversationId);

    const transport = useMemo(() => new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
            body: {
                id, branchId, message: messages.at(-1)
            }
        })
    }), [branchId]);

    const { messages, sendMessage, status, stop, regenerate, setMessages } = useChat({
        id: conversationId,
        messages: initialMessages,
        transport,
        onFinish: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    })
    const title =
    conversations?.find((item) => item.id === conversationId)?.title ?? "Chat";

    const activeBranchName = branches?.find(b => b.id === branchId)?.branchName || (branches?.[0]?.branchName || "Main Branch");

    const handleSwitchBranch = (bId: string) => {
        router.push(`/c/${conversationId}?branchId=${bId}`);
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
                <div className="flex items-center gap-2 min-w-0">
                    <SidebarTrigger />
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <h1 className="truncate text-sm font-medium mr-1">{title}</h1>
                    
                    {branches && branches.length > 1 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground hover:text-foreground">
                                        <GitBranchIcon className="size-3.5" />
                                        <span className="truncate max-w-[120px]">{activeBranchName}</span>
                                        <ChevronDownIcon className="size-3 opacity-60" />
                                    </Button>
                                }
                            />
                            <DropdownMenuContent align="start" className="w-48">
                                {branches.map((b) => (
                                    <DropdownMenuItem
                                        key={b.id}
                                        onClick={() => handleSwitchBranch(b.id)}
                                        className={b.id === branchId || (!branchId && b.id === branches[0].id) ? "bg-accent font-medium" : ""}
                                    >
                                        <GitBranchIcon className="mr-2 size-3.5 text-muted-foreground" />
                                        <span className="truncate">{b.branchName}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </header>

            {messages.length === 0 ? (
                <ChatEmpty onSelectPrompt={(text) => sendMessage({ text })} />
            ) : (
                <ChatMessages
                    messages={messages}
                    status={status}
                    conversationId={conversationId}
                    regenerate={regenerate}
                    setMessages={setMessages}
                />
            )}

            {status === "streaming" && (
                <div className="flex justify-center mb-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <Button
                        onClick={() => stop()}
                        variant="outline"
                        size="sm"
                        className="rounded-full shadow-sm bg-background border border-border hover:bg-muted text-xs gap-1.5 px-4 h-8 transition-all flex items-center font-medium cursor-pointer"
                    >
                        <span className="size-2 rounded-sm bg-destructive animate-pulse" />
                        Stop Generating
                    </Button>
                </div>
            )}

            <ChatComposer
                onSend={(text) => {
                    void sendMessage({ text });
                }}
                isSending={status !== "ready"}
                autoFocus
            />
        </div>
    )
}
