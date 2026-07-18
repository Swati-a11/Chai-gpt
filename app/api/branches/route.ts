import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { conversationId, messageId } = await req.json();

    if (!conversationId || !messageId) {
      return new Response("Missing conversationId or messageId", { status: 400 });
    }

    // 1. Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
    });

    if (!conversation) {
      return new Response("Conversation not found", { status: 404 });
    }

    // 2. Find selected message
    const selectedMessage = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },
    });

    if (!selectedMessage) {
      return new Response("Selected message not found in this conversation", { status: 404 });
    }

    // 3. Find all messages in the conversation up to and including the selected message
    // belonging to the same branch (or null branch if it was the default)
    const messagesToCopy = await prisma.message.findMany({
      where: {
        conversationId,
        branchId: selectedMessage.branchId,
        createdAt: {
          lte: selectedMessage.createdAt,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // 4. Create the new branch
    const branchCount = await prisma.conversationBranch.count({
      where: { conversationId },
    });

    const newBranch = await prisma.conversationBranch.create({
      data: {
        conversationId,
        parentBranchId: selectedMessage.branchId,
        branchName: `Branch ${branchCount + 1}`,
      },
    });

    // 5. Copy history
    for (const msg of messagesToCopy) {
      await prisma.message.create({
        data: {
          conversationId,
          role: msg.role,
          status: msg.status,
          content: msg.content,
          parts: msg.parts || undefined,
          metadata: msg.metadata || undefined,
          branchId: newBranch.id,
          createdAt: msg.createdAt,
        },
      });
    }

    return Response.json(newBranch);
  } catch (error: any) {
    console.error("Error in branch creation API:", error);
    return new Response(error.message || "Failed to create branch", { status: 500 });
  }
}
