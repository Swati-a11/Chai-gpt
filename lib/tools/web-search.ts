/**
 * Utility to perform web search using the Tavily Search API.
 * Cleans source names and ranks them based on domain authority:
 * 1. Official/Government
 * 2. Academic/Education
 * 3. Organizations
 * 4. Well-known publications
 * 5. Other websites
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface RankedSearchResult extends TavilySearchResult {
  sourceName: string;
  rank: number;
}

/** Extracts a clean capitalised source name from a URL domain. */
export function cleanDomainName(url: string): string {
    try {
        const parsed = new URL(url);
        let hostname = parsed.hostname.replace("www.", "");
        const parts = hostname.split(".");
        if (parts.length > 1) {
            if (parts[0] === "news" || parts[0] === "blog" || parts[0] === "en") {
                return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
            }
            return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }
        return hostname;
    } catch (e) {
        return "Web Resource";
    }
}

/** Ranks URL domain authority from 1 (highest) to 5 (lowest). */
function getSourceRank(url: string): number {
    const lowercaseUrl = url.toLowerCase();
    
    // 1. Official/Government
    if (lowercaseUrl.includes(".gov") || lowercaseUrl.includes(".gov.")) {
        return 1;
    }
    // 2. Education/Academic
    if (lowercaseUrl.includes(".edu") || lowercaseUrl.includes(".edu.")) {
        return 2;
    }
    // 3. Organization
    if (lowercaseUrl.includes(".org") || lowercaseUrl.includes(".org.")) {
        return 3;
    }
    // 4. Well-known publications / sources
    const wellKnownNews = [
        "bbc.com", "bbc.co.uk", "cnn.com", "reuters.com", "apnews.com", 
        "nytimes.com", "washingtonpost.com", "theguardian.com", "bloomberg.com", 
        "wsj.com", "forbes.com", "economist.com", "cricbuzz.com", "espncricinfo.com",
        "wikipedia.org", "techcrunch.com", "wired.com", "github.com"
    ];
    if (wellKnownNews.some(news => lowercaseUrl.includes(news))) {
        return 4;
    }
    // 5. Other
    return 5;
}

/**
 * Searches the web using Tavily API and ranks the results by source authority and score.
 */
export async function searchAndRankWeb(query: string): Promise<RankedSearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new Error("TAVILY_API_KEY is not defined in environment variables.");
    }

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
    const results = (data.results || []) as TavilySearchResult[];

    const ranked: RankedSearchResult[] = results.map((r) => {
        return {
            ...r,
            sourceName: cleanDomainName(r.url),
            rank: getSourceRank(r.url),
        };
    });

    // Sort by rank ascending (1 is highest priority), then by score descending (higher score is better)
    ranked.sort((a, b) => {
        if (a.rank !== b.rank) {
            return a.rank - b.rank;
        }
        return b.score - a.score;
    });

    return ranked;
}
