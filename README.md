# ChaiGPT Build — Production Extensions

An extended production-grade Next.js 15 chat application integrated with Google Gemini API, Tavily Web Search tool calling, Prisma ORM (PostgreSQL), and Chat Branching history capabilities.

## Architecture & Features

### 1. AI Tool Calling (Web Search)
- **Gemini Integration**: Model automatically decides whether it needs real-time search based on queries like "Current Bitcoin price" or "Latest AI news".
- **Tavily Integration**: Fetches top search results from Tavily Search API, returning source titles, URLs, and snippets.
- **Streaming UI**: Feeds search process state ("Thinking...", "Searching...", "Tool Result...") as a non-blocking stream.
- **Database Persistence**: Stores tool calls and responses (`ToolCall` & `ToolResponse` models) with direct relations to assistant messages.
- **Error Fallback**: If Tavily fails or search throws an error, the system gracefully falls back to Gemini's internal knowledge without crashing.

### 2. Chat Branching
- **Multi-Branch Threads**: Allows users to split a chat tree from *any* historical message in the conversation.
- **API Endpoint**: `POST /api/branches` copies conversation history up to the selected message and links subsequent messages to the new branch.
- **Navigation UI**: Lists branches in a clean, nested view under active conversations in the sidebar. Includes a dropdown list in the conversation header.
- **Branch Management**: Supports renaming and deleting branches with deletion confirmations (preventing deletion of the default branch).
- **State Persistence**: The active branch is persisted in URL query parameters (`?branchId=...`) for instant recovery on page refreshes.

---

## Environment Variables

Add the following to your `.env` or `.env.local` file:

```env
# PostgreSQL database url
DATABASE_URL="postgres://..."

# Clerk authentication keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Google Gemini API key
GEMINI_API_KEY=AQ....

# Tavily Search API key
TAVILY_API_KEY=tvly-dev-...
```

---

## Database Migration Instructions

Whenever you sync or deploy changes to PostgreSQL:

1. **Verify Schema Changes**:
   Ensure models like `ConversationBranch`, `ToolCall`, and `ToolResponse` are present in `prisma/schema.prisma`.

2. **Push Schema (Development)**:
   ```bash
   npx prisma db push
   ```

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Production Migrations**:
   Generate a migration folder for deployment tracking:
   ```bash
   npx prisma migrate dev --name init_branching_and_tooling
   ```
   Apply migrations in production environment:
   ```bash
   npx prisma migrate deploy
   ```

---

## Deployment Steps for Vercel

To deploy ChaiGPT Build with Vercel:

1. **Import Repository**:
   Connect your GitHub/GitLab account to Vercel and import the project folder.

2. **Configure Build Settings**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `chai-gpt-build` (or `./`)
   - **Build Command**: `next build`
   - **Output Directory**: `.next`

3. **Configure Environment Variables**:
   Add all keys from the [Environment Variables](#environment-variables) section in Vercel's Project Settings dashboard.

4. **Configure Prisma Integration (Build Step)**:
   Ensure Prisma client is generated during the build process. You can modify your build script in `package.json` to generate client:
   ```json
   "build": "prisma generate && next build"
   ```

5. **Deploy**:
   Click **Deploy**. Vercel will bundle the routes, statically pre-render pages, and host Server Actions/APIs on edge/serverless runtimes.

---

## Testing & Verification Checklist

Follow this checklist to manually verify all production-grade features:

### 1. AI Tool Calling & Web Search
- [ ] **Trigger Search**: Ask a real-time question: *"What is the current Bitcoin price?"*
  - Verify that the message shows search states in sequence: **Thinking...** -> **Searching the web...** -> **Search completed** -> final text.
- [ ] **Disable Search**: Ask a general question: *"What is the capital of France?"*
  - Verify that it streams immediately without invoking any search loaders or showing status indicators.
- [ ] **Failure Resiliency**: Temporarily unset `TAVILY_API_KEY` (or type an invalid query).
  - Verify that search shows a warning badge but continues generating a clean answer with fallback knowledge.
- [ ] **Database Integrity**: Query the database or verify that `ToolCall` and `ToolResponse` tables have populated entries matching the message ID.

### 2. Chat Branching
- [ ] **Create Branch**: Hover over any user or assistant message and click the **Branch** icon (or right-click to open the **Context Menu** and select **Branch from here**).
  - Verify that a new branch is created, URL parameters update to `?branchId=...`, and only the history up to that point is loaded.
- [ ] **Independent Editing**: Send a new message in Branch 2.
  - Switch back to the main branch via the sidebar. Verify that the new messages in Branch 2 are absent, and original messages are preserved.
- [ ] **Rename Branch**: Click the actions icon (`...`) next to the branch name in the sidebar, select **Rename branch**, type a new name, and click OK.
  - Verify that the sidebar and header reflect the renamed label.
- [ ] **Delete Branch**: Delete the new branch.
  - Verify that a confirmation modal is prompted first.
  - Verify that the default branch (Main) cannot be deleted.
- [ ] **Refresh Safety**: Reload the page while on a custom branch.
  - Verify that the active branch state and messages are fully restored.
