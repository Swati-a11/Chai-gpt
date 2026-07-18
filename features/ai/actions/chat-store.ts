"use server";

import { isTextUIPart, type UIMessage } from "ai";
import type { Message, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Extracts plain text from an AI SDK `UIMessage` by joining all text parts. */
function getMessageText(message: UIMessage) {
  return message.parts.filter(isTextUIPart).map((part) => part.text).join("");
}

/**
 * Normalizes stored message parts from the database into AI SDK `UIMessage` parts.
 * Falls back to a single text part when no structured parts are stored.
 */
function toUIMessageParts(
  parts: Prisma.JsonValue | null,
  content: string
): UIMessage["parts"] {
  const stored = parts as UIMessage["parts"] | null;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored;
  }

  return [{ type: "text", text: content }];
}

/**
 * Finds the oldest branch of a conversation, or creates a default "Main Branch" 
 * and maps all existing messages of the conversation to it (for backward compatibility).
 */
async function getOrCreateDefaultBranch(conversationId: string) {
  let branch = await prisma.conversationBranch.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (!branch) {
    branch = await prisma.conversationBranch.create({
      data: {
        conversationId,
        branchName: "Main Branch",
      },
    });

    // Backfill any existing messages without a branchId to this default branch
    await prisma.message.updateMany({
      where: {
        conversationId,
        branchId: null,
      },
      data: {
        branchId: branch.id,
      },
    });
  }

  return branch;
}

/**
 * Loads all messages for a conversation branch from the database as AI SDK `UIMessage`s.
 *
 * @param conversationId - The conversation whose messages to load.
 * @param branchId - Optional branch ID to filter by; falls back to the default branch.
 * @returns Messages ordered oldest to newest, ready for `useChat`.
 */
export async function loadChatMessages(
  conversationId: string,
  branchId?: string
): Promise<UIMessage[]> {
  let activeBranchId = branchId;

  if (!activeBranchId) {
    const defaultBranch = await getOrCreateDefaultBranch(conversationId);
    activeBranchId = defaultBranch.id;
  } else {
    // Verify branch exists for this conversation
    const branchExists = await prisma.conversationBranch.findFirst({
      where: { id: activeBranchId, conversationId },
    });
    if (!branchExists) {
      const defaultBranch = await getOrCreateDefaultBranch(conversationId);
      activeBranchId = defaultBranch.id;
    }
  }

  const rows = await prisma.message.findMany({
    where: { conversationId, branchId: activeBranchId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row: Message) => ({
    id: row.id,
    role: row.role === "ASSISTANT" ? "assistant" : "user",
    parts: toUIMessageParts(row.parts, row.content),
  }));
}

type SaveChatMessagesOptions = {
  updateTitle?: boolean;
};

/**
 * Upserts AI SDK `UIMessage`s into the database for a conversation branch.
 *
 * @param conversationId - Target conversation ID.
 * @param messages - Messages to persist (system messages are skipped).
 * @param options.updateTitle - When true, auto-titles "New Chat" from the first user message.
 * @param branchId - Optional branch ID to associate the messages with.
 */
export async function saveChatMessages(
  conversationId: string,
  messages: UIMessage[],
  options: SaveChatMessagesOptions = {},
  branchId?: string
) {
  const { updateTitle = true } = options;

  let activeBranchId = branchId;
  if (!activeBranchId) {
    const defaultBranch = await getOrCreateDefaultBranch(conversationId);
    activeBranchId = defaultBranch.id;
  }

  for (const message of messages) {
    if (message.role === "system") continue;

    const content = getMessageText(message);
    const role = message.role === "assistant" ? "ASSISTANT" : "USER";

    await prisma.message.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        conversationId,
        branchId: activeBranchId,
        role,
        status: "COMPLETE",
        content,
        parts: message.parts as Prisma.InputJsonValue,
      },
      update: {
        content,
        parts: message.parts as Prisma.InputJsonValue,
        status: "COMPLETE",
      },
    });
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { title: true },
  });

  const firstUser = messages.find((message) => message.role === "user");
  const firstUserText = firstUser ? getMessageText(firstUser).trim() : "";

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      title:
        updateTitle && conversation.title === "New Chat" && firstUserText
          ? firstUserText.slice(0, 48)
          : conversation.title,
    },
  });
}
