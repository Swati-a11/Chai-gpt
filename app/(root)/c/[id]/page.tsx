import { loadChatMessages } from '@/features/ai/actions/chat-store';
import { getConversation } from '@/features/conversation/actions/conversation-actions';
import { ConversationView } from '@/features/conversation/components/conversation-view';
import { notFound } from 'next/navigation';
import React from 'react'

type ConversationPageProps = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ branchId?: string }>;
  };

/**
 * Conversation page — loads messages and renders the chat UI for a given ID and branch ID.
 */
const page = async({params, searchParams}:ConversationPageProps) => {
    const {id} = await params;
    const {branchId} = await searchParams;

    try {
      await getConversation(id)
    } catch (error) {
      notFound()
    }

    const initialMessages = await loadChatMessages(id, branchId);
    

  return (
    <ConversationView
      key={`${id}-${branchId || 'default'}`}
      conversationId={id}
      branchId={branchId}
      initialMessages={initialMessages}
    />
  )
}

export default page