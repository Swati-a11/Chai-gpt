import { SparklesIcon, CodeIcon, NewspaperIcon, FileTextIcon, MapPinIcon } from "lucide-react";

type ChatEmptyProps = {
  onSelectPrompt: (prompt: string) => void;
};

/** Empty-state placeholder shown before the first message is sent, featuring custom suggestion cards. */
export function ChatEmpty({ onSelectPrompt }: ChatEmptyProps) {
  const suggestions = [
    {
      title: "Explain React Hooks",
      desc: "Detailed breakdown of useState & useEffect",
      icon: <SparklesIcon className="size-4 text-amber-500" />,
      prompt: "Explain React Hooks, specifically useState and useEffect, with simple code examples."
    },
    {
      title: "Generate C++ Code",
      desc: "Reverse a linked list algorithm",
      icon: <CodeIcon className="size-4 text-blue-500" />,
      prompt: "Write a C++ program to reverse a linked list, including comments explaining each step."
    },
    {
      title: "Latest AI News",
      desc: "Search for current AI advancements",
      icon: <NewspaperIcon className="size-4 text-emerald-500" />,
      prompt: "What is the latest AI news and major advancements this week?"
    },
    {
      title: "Summarize an Article",
      desc: "How to distill key findings",
      icon: <FileTextIcon className="size-4 text-purple-500" />,
      prompt: "How do I write a good summary of a research article? Provide a step-by-step guide."
    },
    {
      title: "Plan a Trip",
      desc: "3-day itinerary for a weekend getaway",
      icon: <MapPinIcon className="size-4 text-rose-500" />,
      prompt: "Plan a 3-day itinerary for a weekend trip to Tokyo, highlighting must-see spots and restaurants."
    }
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 max-w-2xl mx-auto w-full">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground/90 to-foreground/75 bg-clip-text select-none">
          How can ChaiGPT help today?
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full animate-in fade-in duration-300">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(s.prompt)}
            className="flex items-start text-left p-4 rounded-xl border border-border bg-muted/10 hover:bg-muted/30 hover:border-muted-foreground/20 hover:scale-[1.01] transition-all duration-200 cursor-pointer shadow-sm select-none"
          >
            <div className="size-8 rounded-lg bg-background border flex items-center justify-center shrink-0 mr-3 mt-0.5">
              {s.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {s.title}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {s.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
