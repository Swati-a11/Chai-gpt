/**
 * Utility to perform web search using the Tavily Search API.
 * Requires TAVILY_API_KEY environment variable.
 */
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchWeb(query: string): Promise<TavilySearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not defined in environment variables.");
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily search request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return (data.results || []) as TavilySearchResult[];
  } catch (error) {
    console.error("Error in searchWeb:", error);
    throw error;
  }
}
