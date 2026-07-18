# ChaiGPT Build

ChaiGPT Build is a production-ready AI chat application built with **Next.js 15**, **TypeScript**, **Google Gemini**, **Tavily Search**, **Prisma ORM**, **PostgreSQL**, and **Clerk Authentication**.

The project extends a standard AI chatbot by implementing two production-grade features:
- **AI Tool Calling** using Tavily for real-time web search.
- **Chat Branching** to continue conversations from any previous message independently.

---

## Features

### AI Tool Calling
- Google Gemini AI integration
- Automatic web search using Tavily
- Streaming AI responses
- Stores tool calls and responses
- Graceful error handling and fallback

### Chat Branching
- Create branches from any message
- Independent conversation history
- Switch between branches
- Rename and delete branches
- Persistent branch state

### Additional Features
- Clerk Authentication
- Persistent chat history
- Dark/Light theme
- Markdown and syntax-highlighted code blocks
- Responsive UI
- Loading and error handling

---

## Tech Stack

- **Frontend:** Next.js 15, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** PostgreSQL
- **AI:** Google Gemini API, Tavily Search API
- **Authentication:** Clerk

---

## Getting Started

### Clone the repository

```bash
git clone https://github.com/your-username/chai-gpt-build.git
cd chai-gpt-build
```

### Install dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env.local` file:

```env
DATABASE_URL=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

GEMINI_API_KEY=
TAVILY_API_KEY=
```

### Setup Database

```bash
npx prisma generate
npx prisma db push
```

### Run the project

```bash
npm run dev
```

Open **http://localhost:3000**

---

## Deployment

Deploy on **Vercel** after adding all environment variables.

Recommended build command:

```bash
prisma generate && next build
```

---

## Testing

- AI chat and streaming
- Automatic web search
- Tool call persistence
- Chat branching
- Branch rename/delete
- Authentication
- Responsive UI

---

## Live Demo

**Live URL:** chai-gpt-alpha.vercel.app


---

## Author

**Swati Kumari**

---

## License

This project was developed as part of an GenAI Cohort assignment.
