"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
  GitBranchIcon,
  User as UserIcon,
  Settings as SettingsIcon,
  RefreshCw as RefreshCwIcon,
  Sliders as SlidersIcon,
  LogOut as LogOutIcon,
} from "lucide-react";
import { useClerk, useUser, useSession } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConversations,
  useDeleteConversation,
  useUpdateConversation,
  useBranches,
  useRenameBranch,
  useDeleteBranch,
} from "@/features/conversation/hooks/use-conversation";
import { cn } from "@/lib/utils";

type Conversation = NonNullable<
  ReturnType<typeof useConversations>["data"]
>[number];

/**
 * Main application sidebar — logo, new chat, conversation list, theme toggle, and account.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { data: conversations, isLoading } = useConversations();

  
// Get the active conversation id from the pathname (e.g. /c/123)
// pathname.split("/")[2] is the third part of the pathname (the conversation id)
//  firstparam = / , secondparam = c , thirdparam = 123
  const activeId = pathname.startsWith("/c/")
    ? pathname.split("/")[2]
    : undefined;

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="font-semibold tracking-tight"
              render={<Link href="/" />}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
                C
              </span>
              <span>ChaiGPT</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="New chat" render={<Link href="/" />}>
              <PlusIcon />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <ChatList
                conversations={conversations}
                isLoading={isLoading}
                activeId={activeId}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarFooterMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Renders the conversation list with loading skeletons or an empty-state message. */
function ChatList({
  conversations,
  isLoading,
  activeId,
}: {
  conversations: Conversation[] | undefined;
  isLoading: boolean;
  activeId: string | undefined;
}) {
  if (isLoading) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, index) => (
          <SidebarMenuItem key={index}>
            <Skeleton className="h-8 w-full" />
          </SidebarMenuItem>
        ))}
      </>
    );
  }

  if (!conversations?.length) {
    return (
      <p className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</p>
    );
  }

  return (
    <>
      {conversations.map((conversation) => (
        <ChatItem
          key={conversation.id}
          conversation={conversation}
          isActive={activeId === conversation.id}
        />
      ))}
    </>
  );
}

/** Single sidebar row for a conversation with rename, pin, and delete actions. */
function ChatItem({
  conversation,
  isActive,
}: {
  conversation: Conversation;
  isActive: boolean;
}) {
  const updateConversation = useUpdateConversation();
  const deleteConversation = useDeleteConversation(
    isActive ? conversation.id : undefined
  );
  const { data: branches } = useBranches(conversation.id);
  const searchParams = useSearchParams();
  const activeBranchId = searchParams.get("branchId") || (branches?.[0]?.id);

  /** Prompts the user to rename the conversation and persists the new title. */
  function handleRename() {
    const next = window.prompt("Rename chat", conversation.title);
    if (!next || next.trim() === conversation.title) return;
    updateConversation.mutate({ id: conversation.id, title: next });
  }

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          tooltip={conversation.title}
          render={<Link href={`/c/${conversation.id}`} />}
          className={cn(isActive && "font-medium")}
        >
          <span className="truncate">{conversation.title}</span>
        </SidebarMenuButton>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuAction
                showOnHover
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Chat actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={handleRename}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                updateConversation.mutate({
                  id: conversation.id,
                  isPinned: !conversation.isPinned,
                })
              }
            >
              {conversation.isPinned ? <PinOffIcon /> : <PinIcon />}
              {conversation.isPinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => deleteConversation.mutate(conversation.id)}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {isActive && branches && branches.length > 1 && (
        <SidebarMenuSub className="ml-4 border-l pl-2 gap-1 mt-1">
          {branches.map((branch) => {
            const isBranchActive = activeBranchId === branch.id;
            return (
              <BranchItem
                key={branch.id}
                branch={branch}
                isActive={isBranchActive}
                isDefault={branch.id === branches[0].id}
              />
            );
          })}
        </SidebarMenuSub>
      )}
    </>
  );
}

/** Individual branch item render component with actions dropdown. */
function BranchItem({
  branch,
  isActive,
  isDefault,
}: {
  branch: any;
  isActive: boolean;
  isDefault: boolean;
}) {
  const renameBranchMutation = useRenameBranch();
  const deleteBranchMutation = useDeleteBranch();
  const router = useRouter();

  function handleRenameBranch(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const next = window.prompt("Rename branch", branch.branchName);
    if (!next || next.trim() === branch.branchName) return;
    renameBranchMutation.mutate({ id: branch.id, name: next });
  }

  function handleDeleteBranch(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (isDefault) {
      toast.error("Cannot delete the default branch");
      return;
    }
    const confirm = window.confirm(
      `Are you sure you want to delete branch "${branch.branchName}"? All of its messages will be lost.`
    );
    if (confirm) {
      deleteBranchMutation.mutate(branch.id, {
        onSuccess: () => {
          if (isActive) {
            router.push(`/c/${branch.conversationId}`);
          }
        },
      });
    }
  }

  return (
    <SidebarMenuSubItem className="group/branch relative flex items-center justify-between">
      <SidebarMenuSubButton
        isActive={isActive}
        render={<Link href={`/c/${branch.conversationId}?branchId=${branch.id}`} />}
        className="flex items-center gap-1.5 min-w-0 pr-6 text-xs text-muted-foreground hover:text-foreground"
      >
        <GitBranchIcon className="size-3 shrink-0" />
        <span className="truncate">{branch.branchName}</span>
        {isDefault && (
          <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 font-normal ml-1 bg-muted/50 text-muted-foreground border-muted-foreground/30">
            Default
          </Badge>
        )}
      </SidebarMenuSubButton>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 opacity-0 group-hover/branch:opacity-100 size-6 text-muted-foreground hover:text-foreground rounded-md transition-opacity"
            >
              <MoreHorizontalIcon className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={handleRenameBranch}>
            <PencilIcon className="size-3.5 mr-2" />
            Rename branch
          </DropdownMenuItem>
          {!isDefault && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={handleDeleteBranch}
              >
                <Trash2Icon className="size-3.5 mr-2" />
                Delete branch
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuSubItem>
  );
}/** Footer menu with theme toggle and custom account dropdown button. */
function SidebarFooterMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useUser();
  const { session } = useSession();
  const { openUserProfile, signOut, setActive, client, openSignIn } = useClerk();
  const router = useRouter();

  const displayName = user
    ? user.firstName || user.fullName || user.primaryEmailAddress?.emailAddress || "Account"
    : "Account";
  const displayEmail = user?.primaryEmailAddress?.emailAddress || "";

  const handleAddAccount = () => {
    openSignIn();
  };

  const activeSessions = client?.sessions || [];
  const currentSessionId = session?.id;
  const otherSessions = activeSessions.filter((s) => s.id !== currentSessionId && s.status === "active");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start cursor-pointer hover:bg-accent"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          Toggle theme
        </Button>
      </SidebarMenuItem>
      
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center w-full rounded-xl hover:bg-accent/80 transition-all duration-200 cursor-pointer p-1.5 gap-2 select-none overflow-hidden border border-transparent hover:border-border/40 outline-none text-left bg-transparent"
              />
            }
          >
              {/* Avatar portion */}
              <div className="size-8 rounded-full border border-border/80 overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="Avatar" className="size-full object-cover" />
                ) : (
                  <div className="size-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              {/* Dynamic text info */}
              <div className="flex flex-col min-w-0 pointer-events-none text-left group-data-[collapsible=icon]:hidden">
                <span className="text-xs font-semibold text-foreground truncate">
                  {displayName}
                </span>
                {displayEmail && (
                  <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                    {displayEmail}
                  </span>
                )}
              </div>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent side="top" align="start" className="w-56 rounded-xl shadow-lg border border-border bg-popover text-popover-foreground animate-in slide-in-from-bottom-2 duration-200">
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium select-none truncate">
              {displayEmail || "Personal Account"}
            </div>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => openUserProfile()} className="cursor-pointer">
              <UserIcon className="size-4 mr-2 text-muted-foreground" />
              My Profile
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={() => openUserProfile()} className="cursor-pointer">
              <SettingsIcon className="size-4 mr-2 text-muted-foreground" />
              Manage Account
            </DropdownMenuItem>
            
            {otherSessions.map((s) => {
              const otherUser = s.user;
              const otherName = otherUser
                ? otherUser.firstName || otherUser.fullName || otherUser.primaryEmailAddress?.emailAddress || "Account"
                : "Account";
              return (
                <DropdownMenuItem
                  key={s.id}
                  onClick={async () => {
                    try {
                      await setActive({ session: s.id });
                      toast.success("Switched account");
                    } catch (e: any) {
                      toast.error(e.message || "Failed to switch account");
                    }
                  }}
                  className="cursor-pointer"
                >
                  <UserIcon className="size-4 mr-2 text-muted-foreground" />
                  Switch to {otherName}
                </DropdownMenuItem>
              );
            })}
            
            <DropdownMenuItem onClick={handleAddAccount} className="cursor-pointer">
              <RefreshCwIcon className="size-4 mr-2 text-muted-foreground" />
              Add another account
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={() => openUserProfile()} className="cursor-pointer">
              <SlidersIcon className="size-4 mr-2 text-muted-foreground" />
              Settings
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              onClick={() => signOut(() => router.push("/"))} 
              className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOutIcon className="size-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
