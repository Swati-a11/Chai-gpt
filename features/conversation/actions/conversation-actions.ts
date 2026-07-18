"use server";

import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { Conversation, ConversationBranch } from "@/lib/generated/prisma/client";

/** Shape of a conversation row returned in the sidebar list. */
export type ConversationListItem = {
    id: string;
    title: string;
    isPinned: boolean;
    isArchived: boolean;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
};


/**
 * Verifies that a conversation exists and belongs to the given user.
 *
 * @throws {Error} When the conversation is not found or not owned by the user.
 */
async function assertOwnsConversation(conversationId: string, userId: string) {
    const conversation = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            userId
        }
    });

    if (!conversation) {
        throw new Error("Conversation not found")
    }

    return conversation
}

/**
 * Fetches a single conversation owned by the current user.
 *
 * @param conversationId - The conversation to load.
 * @throws {Error} When the conversation is not found.
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
    const user = await requireUser();
    return assertOwnsConversation(conversationId, user.id)
}


/**
 * Lists non-archived conversations for the current user.
 * Pinned conversations appear first, then sorted by most recent activity.
 */
export async function listConversations(): Promise<ConversationListItem[]> {
    const user = await requireUser();

    return prisma.conversation.findMany({
        where: { userId: user.id, isArchived: false },
        orderBy: [{ isPinned: "desc" }, { lastMessageAt: "desc" }],
        select: {
            id: true,
            title: true,
            isPinned: true,
            isArchived: true,
            lastMessageAt: true,
            createdAt: true,
            updatedAt: true,
        },
    })
}

/**
 * Creates a new conversation for the current user.
 *
 * @param title - Optional title; defaults to "New Chat".
 */
export async function createConversation(title = "New Chat"): Promise<Conversation> {
    const user = await requireUser();

    return prisma.conversation.create({
        data: {
            userId: user.id,
            title: title.trim() || "New Chat",
        },
    });
}

/**
 * Updates conversation metadata (title, pin, or archive status).
 *
 * @param conversationId - The conversation to update.
 * @param data - Fields to change; omitted fields are left unchanged.
 */
export async function updateConversation(
    conversationId: string,
    data: { title?: string; isPinned?: boolean; isArchived?: boolean }
): Promise<Conversation> {
    const user = await requireUser();
    await assertOwnsConversation(conversationId, user.id);

    const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            ...(data.title !== undefined ? { title: data.title.trim() || "New Chat" } : {}),
            ...(data.isPinned !== undefined ? { isPinned: data.isPinned } : {}),
            ...(data.isArchived !== undefined ? { isArchived: data.isArchived } : {}),
        },
    });

    revalidatePath("/");
    revalidatePath(`/c/${conversationId}`);
    return conversation;
}



/**
 * Permanently deletes a conversation owned by the current user.
 *
 * @param conversationId - The conversation to delete.
 * @returns The deleted conversation ID.
 */
export async function deleteConversation(conversationId: string): Promise<{ id: string }> {
    const user = await requireUser();
    await assertOwnsConversation(conversationId, user.id);

    await prisma.conversation.delete({
        where: { id: conversationId },
    });

    revalidatePath("/");
    return { id: conversationId };
}

/**
 * Lists all branches for a given conversation.
 */
export async function listBranches(conversationId: string): Promise<ConversationBranch[]> {
  const user = await requireUser();
  await assertOwnsConversation(conversationId, user.id);

  return prisma.conversationBranch.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Renames a specific branch.
 */
export async function renameBranch(branchId: string, newName: string): Promise<ConversationBranch> {
  const user = await requireUser();
  
  const branch = await prisma.conversationBranch.findUnique({
    where: { id: branchId },
    include: { conversation: true },
  });

  if (!branch || branch.conversation.userId !== user.id) {
    throw new Error("Branch not found or unauthorized");
  }

  const updated = await prisma.conversationBranch.update({
    where: { id: branchId },
    data: { branchName: newName.trim() },
  });

  revalidatePath(`/c/${branch.conversationId}`);
  return updated;
}

/**
 * Deletes a specific branch. Cannot delete the default (oldest) branch.
 */
export async function deleteBranch(branchId: string): Promise<{ id: string; conversationId: string }> {
  const user = await requireUser();
  
  const branch = await prisma.conversationBranch.findUnique({
    where: { id: branchId },
    include: { conversation: true },
  });

  if (!branch || branch.conversation.userId !== user.id) {
    throw new Error("Branch not found or unauthorized");
  }

  // Find oldest branch to ensure we don't delete it
  const oldestBranch = await prisma.conversationBranch.findFirst({
    where: { conversationId: branch.conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (oldestBranch?.id === branchId) {
    throw new Error("Cannot delete the default branch");
  }

  await prisma.conversationBranch.delete({
    where: { id: branchId },
  });

  revalidatePath(`/c/${branch.conversationId}`);
  return { id: branchId, conversationId: branch.conversationId };
}