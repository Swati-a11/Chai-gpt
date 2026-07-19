import { loadChatMessages, saveChatMessages } from "@/features/ai/actions/chat-store";
import { prisma } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { createIdGenerator, createUIMessageStreamResponse, toUIMessageStream, type UIMessage, type TextStreamPart } from "ai";
import { GoogleGenAI, Type, type Content } from "@google/genai";
import { searchAndRankWeb, cleanDomainName } from "@/lib/tools/web-search";
import { NextResponse } from "next/server";

// Force dynamic rendering to prevent Next.js from caching the streaming endpoint
export const dynamic = 'force-dynamic';

/**
 * Utility function to convert Vercel AI SDK messages to Google Gemini Content format.
 */
function convertToGeminiMessages(messages: UIMessage[]): Content[] {
    return messages.map((m) => {
        const role = m.role === "user" ? "user" : "model";
        const text = m.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("");
        return {
            role,
            parts: [{ text }],
        };
    });
}

/**
 * Validates request payload structures before calling the Google Gemini SDK.
 */
function validateGeminiRequest(model: string, contents: Content[]) {
    if (!model) {
        throw new Error("Validation Error: Model name is missing");
    }
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new Error("Validation Error: contents must be a non-empty array");
    }
    for (let i = 0; i < contents.length; i++) {
        const content = contents[i];
        if (!content.role || (content.role !== "user" && content.role !== "model")) {
            throw new Error(`Validation Error: invalid role "${content.role}" at index ${i}. Role must be 'user' or 'model'.`);
        }
        if (!Array.isArray(content.parts) || content.parts.length === 0) {
            throw new Error(`Validation Error: parts must be a non-empty array at index ${i}`);
        }
        for (let j = 0; j < content.parts.length; j++) {
            const part = content.parts[j];
            const keys = Object.keys(part);
            const validKeys = [
                "text", "inlineData", "functionCall", "functionResponse", "fileData",
                "executableCode", "codeExecutionResult", "thought", "thoughtSignature",
                "videoMetadata", "toolCall", "toolResponse", "partMetadata"
            ];
            const hasValidKey = keys.some(key => validKeys.includes(key));
            if (!hasValidKey) {
                throw new Error(`Validation Error: Part at index ${i}, part index ${j} does not contain any valid content field.`);
            }
        }
    }
}

/**
 * Retries a promise-returning function with exponential backoff on transient errors (429, 5xx, network issues).
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (err: any) {
        const status = err?.status || err?.statusCode || 0;
        const msg = (err?.message || "").toLowerCase();
        
        // Retry on status code 429, 5xx, or specific quota/rate limit error strings
        const isTransient = status === 429 || 
                            status >= 500 || 
                            msg.includes("429") || 
                            msg.includes("quota") || 
                            msg.includes("resource_exhausted") ||
                            msg.includes("busy") ||
                            msg.includes("timeout");
                            
        if (retries > 0 && isTransient) {
            console.warn(`>>> [Gemini API Warning]: Transient error encountered (${err.message || status}). Retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return retryWithBackoff(fn, retries - 1, delay * 2);
        }
        throw err;
    }
}

/**
 * POST /api/chat — Streams an AI assistant reply for a conversation.
 */
export async function POST(req: Request) {
    try {
        // 1. Clerk Authentication
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: any;
        try {
            body = await req.json();
        } catch (e: any) {
            console.error("Request JSON parse error:", e);
            return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
        }

        const { message, id, branchId }: { message: UIMessage; id: string; branchId?: string } = body;

        if (!message || !id) {
            return NextResponse.json({ error: "Missing message or conversation id" }, { status: 400 });
        }

        // 2. Prisma Database Operations - Check User
        const user = await prisma.user.findUnique({
            where: { clerkId: userId },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found. Complete onboarding first." }, { status: 404 });
        }

        // 3. Prisma Database Operations - Fetch Conversation
        let conversation;
        try {
            conversation = await prisma.conversation.findFirst({
                where: {
                    id,
                    userId: user.id
                }
            });
        } catch (dbErr: any) {
            console.error("Database error finding conversation:", dbErr);
            return NextResponse.json({ error: `Database error: ${dbErr.message || dbErr}` }, { status: 500 });
        }

        if (!conversation) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // 4. Load Conversation History
        let previousMessages: UIMessage[] = [];
        try {
            previousMessages = await loadChatMessages(id, branchId);
        } catch (dbErr: any) {
            console.error("Database error loading chat messages:", dbErr);
            return NextResponse.json({ error: `Database error: ${dbErr.message || dbErr}` }, { status: 500 });
        }

        const alreadySaved = previousMessages.some(
            (storedMessage) => storedMessage.id === message.id
        );

        const messages = alreadySaved ? previousMessages : [...previousMessages, message];

        // 5. Save incoming User message if not already saved
        if (!alreadySaved) {
            try {
                await saveChatMessages(id, [message], {}, branchId);
            } catch (dbErr: any) {
                console.error("Database error saving user message:", dbErr);
                return NextResponse.json({ error: `Database error: ${dbErr.message || dbErr}` }, { status: 500 });
            }
        }

        // 6. Handle Environment Variables Safely
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing from environment variables");
            return NextResponse.json({ error: "Configuration error: GEMINI_API_KEY is missing" }, { status: 500 });
        }

        console.log(`Loaded Gemini Key: ${apiKey.slice(0, 8)}...`);

        // Initialize Google Gen AI client
        let ai: GoogleGenAI;
        try {
            ai = new GoogleGenAI({ apiKey });
        } catch (initErr: any) {
            console.error("Failed to initialize GoogleGenAI client:", initErr);
            return NextResponse.json({ error: `Gemini initialization error: ${initErr.message || initErr}` }, { status: 500 });
        }

        // Timeout Handling: Wrap the stream generation in a promise race to prevent hanging
        const generateStreamWithTimeout = async (params: any) => {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("Gemini API request timed out after 20 seconds")), 20000);
            });
            // Wrap the stream call with our transient retry logic
            const streamPromise = retryWithBackoff(() => ai.models.generateContentStream(params));
            return Promise.race([
                streamPromise,
                timeoutPromise
            ]);
        };

        let toolCallData: { toolName: string; arguments: string; response: string } | null = null;

        const customStream = new ReadableStream<TextStreamPart<any>>({
            async start(controller) {
                const streamTextId = "text-1";
                try {
                    // Send text-start to initialize the message block in the AI SDK stream
                    controller.enqueue({ type: "text-start", id: streamTextId });

                    // REDUCE CONTEXT SIZE: Limit conversation history to the last 10 messages
                    const historyLimit = 10;
                    const truncatedMessages = messages.length > historyLimit ? messages.slice(-historyLimit) : messages;
                    const geminiMessages = convertToGeminiMessages(truncatedMessages);

                    // Validate request structure before sending
                    validateGeminiRequest("gemini-2.5-flash", geminiMessages);

                    // Detailed pre-request logging
                    const lastUserMessage = messages[messages.length - 1];
                    const promptText = lastUserMessage?.parts
                        ?.filter((p) => p.type === "text")
                        ?.map((p) => p.text)
                        ?.join("") || "";
                    console.log(">>> [Incoming User Prompt]:", promptText);
                    console.log(">>> [Conversation History Length (Original)]:", messages.length);
                    console.log(">>> [Conversation History Length (Truncated)]:", truncatedMessages.length);
                    console.log(">>> [Model Name]:", "gemini-2.5-flash");
                    console.log(">>> [Request Sent to Gemini]:", JSON.stringify(geminiMessages, null, 2));
                    console.log(">>> [Payload Size (Characters)]:", JSON.stringify(geminiMessages).length);

                    console.log(">>> [Stream starting]...");
                    const responseStream = await generateStreamWithTimeout({
                        model: "gemini-2.5-flash",
                        contents: geminiMessages,
                        config: {
                            systemInstruction: (conversation.systemPrompt || "You are ChaiGpt , a helpful assistant") +
                                "\n\nWhen asked to write code, do not copy standard templates, libraries, or public GitHub repositories verbatim. Write clean, custom, original code implementations with unique variable names and structure to prevent copyright recitation blocks.",
                            tools: [
                                {
                                    functionDeclarations: [
                                        {
                                            name: "web_search",
                                            description: "Search the web for real-time information or current events.",
                                            parameters: {
                                                type: Type.OBJECT,
                                                properties: {
                                                    query: { type: Type.STRING, description: "The search query" }
                                                },
                                                required: ["query"]
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    });

                    let textResponse = "";
                    let hasToolCall = false;
                    let toolCallQuery = "";
                    let toolCallArgs: any = null;
                    let toolCallId = "";
                    let toolCallName = "";

                    // Stream and handle initial response chunks
                    for await (const chunk of responseStream) {
                        console.log(">>> [Streamed Chunk]:", JSON.stringify(chunk));
                        if (chunk.text) {
                            textResponse += chunk.text;
                            controller.enqueue({ type: "text-delta", id: streamTextId, text: chunk.text });
                        }
                        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                            hasToolCall = true;
                            const call = chunk.functionCalls[0];
                            toolCallQuery = (call.args as any)?.query || "";
                            toolCallArgs = call.args;
                            toolCallId = call.id || "";
                            toolCallName = call.name || "web_search";
                        }
                    }

                    // If model requested a tool call (web_search)
                    if (hasToolCall && toolCallQuery) {
                        controller.enqueue({ type: "text-delta", id: streamTextId, text: "Searching the web...\n" });

                        let searchSummary = "";
                        let resultsList: any[] = [];
                        let searchFailed = false;

                        try {
                            resultsList = await searchAndRankWeb(toolCallQuery);
                            if (resultsList.length === 0) {
                                searchSummary = "No search results found.";
                            } else {
                                // REDUCE CONTEXT SIZE: Keep only the first 3 results (instead of 5)
                                // Truncate content to 800 characters (instead of 1000)
                                const cleanedResults = resultsList.slice(0, 3).map((r) => ({
                                    title: r.title,
                                    url: r.url,
                                    content: typeof r.content === "string" ? r.content.slice(0, 800) : "",
                                    sourceName: r.sourceName,
                                    rank: r.rank
                                }));
                                
                                searchSummary = cleanedResults
                                    .map((r) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}\nSourceRank: ${r.rank}`)
                                    .join("\n\n");
                                    
                                resultsList = cleanedResults;
                            }
                        } catch (error) {
                            console.error("Search failed:", error);
                            searchFailed = true;
                            searchSummary = "I couldn't access live web search right now. Here's the best answer based on my existing knowledge.";
                        }

                        toolCallData = {
                            toolName: toolCallName || "web_search",
                            arguments: JSON.stringify(toolCallArgs || { query: toolCallQuery }),
                            response: searchFailed ? "Error: live search failed." : JSON.stringify(resultsList),
                        };

                        if (searchFailed) {
                            controller.enqueue({ 
                                type: "text-delta", 
                                id: streamTextId, 
                                text: "Search failed.\nI couldn't access live web search right now. Here's the best answer based on my existing knowledge.\n\n" 
                            });
                        } else {
                            controller.enqueue({ type: "text-delta", id: streamTextId, text: `Found ${resultsList.length} relevant sources\n` });
                            controller.enqueue({ type: "text-delta", id: streamTextId, text: "Analyzing information...\n" });
                            controller.enqueue({ type: "text-delta", id: streamTextId, text: "Generating final answer...\n\n" });
                        }

                        const baseSystem = conversation.systemPrompt || "You are ChaiGpt , a helpful assistant";
                        const enhancedInstruction = `${baseSystem}

When asked to write code, do not copy standard templates, libraries, or public GitHub repositories verbatim. Write clean, custom, original code implementations with unique variable names and structure to prevent copyright recitation blocks.

You have been provided with real-time web search results to answer the user's query.
Generate your response following this strict format and layout structure:
1. Short Summary: Start with a brief, 1-2 sentence high-level summary of the key findings.
2. Detailed Answer: Provide a detailed, well-structured explanation. Use paragraph breaks and clean spacing instead of listing everything in long bullet points.
3. Natural Citations: Cite sources naturally inside sentences (e.g., "According to Wikipedia...", "As reported by TechCrunch...").
4. Priority & Conflicts: Prioritize official/government sources over news publications, and resolve any conflicts by highlighting the most authoritative source.
5. Avoid duplication or redundant facts. Ensure clean layout with double newlines between paragraphs.

Do not write the sources list yourself at the end; it will be appended automatically.`;

                        // Construct the turn payload strictly using official Google Gemini API definitions
                        const secondGeminiMessages = [
                            ...geminiMessages,
                            { 
                                role: "model", 
                                parts: [{ 
                                    functionCall: { 
                                        name: toolCallName || "web_search", 
                                        args: toolCallArgs || { query: toolCallQuery },
                                        ...(toolCallId ? { id: toolCallId } : {})
                                    } 
                                }] 
                            },
                            { 
                                role: "user", // MUST be 'user' (never 'tool') in the @google/genai SDK
                                parts: [{ 
                                    functionResponse: { 
                                        name: toolCallName || "web_search", 
                                        response: { result: searchSummary },
                                        ...(toolCallId ? { id: toolCallId } : {})
                                    } 
                                }] 
                            }
                        ] as Content[];

                        // Validate request payload
                        validateGeminiRequest("gemini-2.5-flash", secondGeminiMessages);

                        // Logs before the second Gemini request
                        console.log(">>> [Second Stream starting (tool response)]...");
                        console.log(">>> [Second Stream Model Name]:", "gemini-2.5-flash");
                        console.log(">>> [Second Stream Full Contents Array]:", JSON.stringify(secondGeminiMessages, null, 2));
                        console.log(">>> [Second Stream Tool Response Size]:", JSON.stringify(resultsList).length);
                        console.log(">>> [Second Stream JSON Payload Length]:", JSON.stringify({
                            model: "gemini-2.5-flash",
                            contents: secondGeminiMessages,
                            config: {
                                systemInstruction: enhancedInstruction
                            }
                        }).length);

                        const secondStream = await generateStreamWithTimeout({
                            model: "gemini-2.5-flash",
                            contents: secondGeminiMessages,
                            config: {
                                systemInstruction: enhancedInstruction
                            }
                        });

                        for await (const chunk of secondStream) {
                            console.log(">>> [Streamed Chunk (Second Stream)]:", JSON.stringify(chunk));
                            if (chunk.text) {
                                controller.enqueue({ type: "text-delta", id: streamTextId, text: chunk.text });
                            }
                        }

                        if (!searchFailed && resultsList.length > 0) {
                            let sourcesSection = "\n\n**Sources:**\n";
                            resultsList.forEach((res) => {
                                sourcesSection += `• [${res.sourceName}](${res.url})\n`;
                            });
                            controller.enqueue({ type: "text-delta", id: streamTextId, text: sourcesSection });
                        }
                    }

                    // Send text-end to finalize the message block in the AI SDK stream
                    controller.enqueue({ type: "text-end", id: streamTextId });
                    controller.close();
                    console.log(">>> [Stream ended successfully]");
                } catch (err: any) {
                    // Expose the complete error and stack trace to stdout
                    console.error(">>> [CRITICAL ERROR IN STREAM GENERATION]:");
                    console.error("error.code:", err?.code);
                    console.error("error.status:", err?.status);
                    console.error("error.message:", err?.message);
                    console.error("full error object:", err);
                    console.error("stack trace:", err?.stack || new Error().stack);
                    
                    const isQuotaError = err.status === 429 || 
                                         err.message?.includes("429") || 
                                         err.message?.includes("quota") || 
                                         err.message?.includes("RESOURCE_EXHAUSTED");
                    
                    // NEVER HIDE THE ORIGINAL PROVIDER ERROR: expose it to client in development
                    const isDev = process.env.NODE_ENV === "development";
                    let errorDetails = err?.message || "Unknown error";
                    if (err?.status) {
                        errorDetails += ` (Status: ${err.status})`;
                    }
                    
                    const userFriendlyMsg = isDev 
                        ? `Backend Error: ${errorDetails}`
                        : isQuotaError
                            ? "The AI service is currently busy or has reached its request limit. Please try again in a few moments."
                            : `An error occurred while generating the response: ${errorDetails}`;
                    
                    controller.enqueue({
                        type: "text-delta",
                        id: streamTextId,
                        text: `\n\n⚠️ **Service Notice:** ${userFriendlyMsg}`
                    });
                    controller.enqueue({ type: "text-end", id: streamTextId });
                    controller.close();
                }
            }
        });

        // 6. Return Streaming Response through Vercel AI SDK compatibility layer
        return createUIMessageStreamResponse({
            stream: toUIMessageStream({
                stream: customStream,
                originalMessages: messages,
                generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
                onEnd: async ({ messages: finalMessages }) => {
                    try {
                        await saveChatMessages(id, finalMessages, { updateTitle: false }, branchId);

                        if (toolCallData) {
                            const lastMessage = finalMessages.at(-1);
                            if (lastMessage) {
                                await prisma.toolCall.create({
                                    data: {
                                        messageId: lastMessage.id,
                                        conversationId: id,
                                        toolName: toolCallData.toolName,
                                        arguments: toolCallData.arguments,
                                        response: {
                                            create: {
                                                messageId: lastMessage.id,
                                                conversationId: id,
                                                response: toolCallData.response
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    } catch (dbSaveErr) {
                        console.error("Database save error on stream end:", dbSaveErr);
                    }
                }
            })
        });
    } catch (globalErr: any) {
        // Detailed error logging on global route failures
        console.error("GLOBAL CRITICAL ROUTE ERROR IN POST /api/chat:");
        console.error("error.code:", globalErr?.code);
        console.error("error.status:", globalErr?.status);
        console.error("error.message:", globalErr?.message);
        console.error("full error object:", globalErr);
        console.error("stack trace:", globalErr?.stack || new Error().stack);
        
        const isQuotaError = globalErr.status === 429 || 
                             globalErr.message?.includes("429") || 
                             globalErr.message?.includes("quota") || 
                             globalErr.message?.includes("RESOURCE_EXHAUSTED");
                             
        const userFriendlyMsg = isQuotaError 
            ? "The AI service is currently busy or has reached its request limit. Please try again in a few moments."
            : `An unexpected error occurred: ${globalErr?.message || "Unknown error"}`;
            
        return NextResponse.json(
            { error: userFriendlyMsg },
            { status: isQuotaError ? 429 : 500 }
        );
    }
}