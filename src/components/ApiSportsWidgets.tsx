import React, { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";

let apiSportsScriptPromise: Promise<void> | null = null;

function loadApiSportsScript() {
  if (typeof window === "undefined") return Promise.resolve();

  if ((window as any).__apiSportsWidgetsLoaded) {
    return Promise.resolve();
  }

  if (!apiSportsScriptPromise) {
    apiSportsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-api-sports-widgets="true"]'
      );

      if (existing) {
        existing.addEventListener("load", () => {
          (window as any).__apiSportsWidgetsLoaded = true;
          resolve();
        });
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://widgets.api-sports.io/2.0.3/widgets.js";
      script.async = true;
      script.defer = true;
      script.dataset.apiSportsWidgets = "true";

      script.onload = () => {
        (window as any).__apiSportsWidgetsLoaded = true;
        resolve();
      };

      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

  return apiSportsScriptPromise;
}

type ApiSportsWidgetEmbedProps = {
  html: string;
  className?: string;
};

export function ApiSportsWidgetEmbed({ html, className }: ApiSportsWidgetEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      await loadApiSportsScript();
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = html;

      const maybeRefresh = (window as any)?.ApiSportsWidgets?.refresh;
      if (typeof maybeRefresh === "function") {
        maybeRefresh();
      }
    };

    mount().catch((err) => {
      console.error("[API-Sports Widgets] Failed to load widget script:", err);
    });

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [html]);

  return <div ref={containerRef} className={className} />;
}

export function NbaApiSportsPanel({
  selectedDate,
  selectedGameId,
  selectedH2H,
}: {
  selectedDate: Date;
  selectedGameId?: number | null;
  selectedH2H?: string | null;
}) {
  const [activeWidgetTab, setActiveWidgetTab] = useState<"games" | "game" | "h2h">("games");

  useEffect(() => {
    if (selectedGameId && activeWidgetTab === "games") {
      setActiveWidgetTab("game");
    }
  }, [selectedGameId]);

  const apiSportsGamesWidgetHtml = `
    <div class="space-y-4">
      <api-sports-widget
        data-type="games"
        data-date="${format(selectedDate, "yyyy-MM-dd")}"
        data-refresh="30"
        data-show-toolbar="true"
        data-tab="all"
        data-games-style="2"
        data-target-game="#api-sports-game-details"
        data-target-standings="modal"
      ></api-sports-widget>

      <div
        id="api-sports-game-details"
        class="min-h-[500px] rounded-2xl border border-slate-800 bg-slate-950 p-4"
      >
        <div class="text-slate-400 text-sm">
          Click a matchup above to load game details here.
        </div>
      </div>

      <api-sports-widget
        data-type="config"
        data-key="b2795a8c744b26f971aaf15eb994212e"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
      ></api-sports-widget>
    </div>
  `;

  const apiSportsGameWidgetHtml = selectedGameId ? `
    <div class="space-y-4">
      <api-sports-widget
        data-type="game"
        data-game-id="${selectedGameId}"
        data-refresh="30"
        data-show-toolbar="true"
        data-tab="all"
        data-game-style="2"
      ></api-sports-widget>
      
      <api-sports-widget
        data-type="config"
        data-key="b2795a8c744b26f971aaf15eb994212e"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
      ></api-sports-widget>
    </div>
  ` : `
    <div class="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-400 text-sm">
      Select a game from the Games tab or the schedule below to see details.
    </div>
  `;

  const apiSportsH2HWidgetHtml = selectedH2H ? `
    <div class="space-y-4">
      <api-sports-widget
        data-type="h2h"
        data-h2h="${selectedH2H}"
        data-refresh="30"
        data-show-toolbar="true"
        data-tab="all"
        data-h2h-style="2"
      ></api-sports-widget>
      
      <api-sports-widget
        data-type="config"
        data-key="b2795a8c744b26f971aaf15eb994212e"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
      ></api-sports-widget>
    </div>
  ` : `
    <div class="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-400 text-sm">
      Select a game from the Games tab or the schedule below to see head-to-head history.
    </div>
  `;

  const currentHtml = useMemo(() => {
    switch (activeWidgetTab) {
      case "game":
        return apiSportsGameWidgetHtml;
      case "h2h":
        return apiSportsH2HWidgetHtml;
      case "games":
      default:
        return apiSportsGamesWidgetHtml;
    }
  }, [activeWidgetTab, selectedDate]);

  return (
    <section className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">API-Sports NBA Widgets</h3>
          <p className="text-sm text-slate-400">
            Live games, single-game detail, and matchup history.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          <button
            onClick={() => setActiveWidgetTab("games")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "games"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Games
          </button>

          <button
            onClick={() => setActiveWidgetTab("game")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "game"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Game
          </button>

          <button
            onClick={() => setActiveWidgetTab("h2h")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "h2h"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            H2H
          </button>
        </div>
      </div>

      <div className="min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2 md:p-4">
        <ApiSportsWidgetEmbed html={currentHtml} />
      </div>
    </section>
  );
}
