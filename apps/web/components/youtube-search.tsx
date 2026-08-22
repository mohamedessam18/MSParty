"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { FormError, Input } from "./ui/input";

export type SearchResult = {
  id: string;
  title: string;
  channel: string | null;
  posterUrl: string | null;
};

/**
 * Finding something to watch without leaving.
 *
 * Deliberately submit-on-enter rather than search-as-you-type. A YouTube
 * project has ten thousand quota units a day and every search spends a hundred
 * of them — a keystroke-triggered search would burn the app's whole daily
 * budget, for everyone, in the time it takes one person to type a film title.
 * So the button is the request, and the results are the answer.
 */
export function YouTubeSearch({ onPick }: { onPick: (result: SearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Guards against a slow first reply landing after a faster second one.
  const sequence = useRef(0);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const ticket = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed })
      });
      const data = await response.json().catch(() => ({}));
      if (ticket !== sequence.current) return;
      if (!response.ok) throw new Error(data.message || "البحث مش شغّال دلوقتي.");
      setResults(data.results);
    } catch (cause) {
      if (ticket === sequence.current) setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <Input
          placeholder="دوّر على فيلم أو حلقة..."
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label="بحث في يوتيوب"
        />
        <Button type="submit" disabled={busy || query.trim().length < 2}>
          {busy ? "..." : "دوّر"}
        </Button>
      </form>

      {error && <FormError>{error}</FormError>}

      {results?.length === 0 && (
        <p className="text-sm text-ivory-dim">مفيش نتايج. جرّب كلمات تانية، أو الصق الرابط على طول.</p>
      )}

      {!!results?.length && (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {results.map(result => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onPick(result)}
                className="flex w-full items-center gap-3 rounded-lg border border-velvet-hi bg-ink-deep/60 p-2 text-right transition hover:border-gold/50"
              >
                {result.posterUrl && (
                  <img src={result.posterUrl} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-sm leading-6 text-ivory">{result.title}</span>
                  {result.channel && <span className="mt-0.5 block truncate text-xs text-ivory-dim">{result.channel}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
