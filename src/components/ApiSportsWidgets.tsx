import React, { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";

const WIDGET_KEY = import.meta.env.VITE_API_SPORTS_WIDGET_KEY || "b2795a8c744b26f971aaf15eb994212e";

type ApiSportsWidgetEmbedProps = {
  html: string;
  className?: string;
};

export function ApiSportsWidgetEmbed({ html, className }: ApiSportsWidgetEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    if (!containerRef.current) return;
    containerRef.current.innerHTML = html;

    // ── Reformat widget dates from DD/MM → MM/DD ───────────────────────────────
    const reformatWidgetDates = (root: Element) => {
      root.querySelectorAll("game-item .game-infos span, game-item .game-infos").forEach((el) => {
        const node = el as HTMLElement;
        // Walk text nodes directly inside the element (not children)
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        let textNode: Text | null;
        while ((textNode = walker.nextNode() as Text | null)) {
          const orig = textNode.textContent || "";
          // DD/MM/YYYY  →  MM/DD/YYYY
          let updated = orig.replace(
            /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
            (_m, d, mo, y) => `${mo.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`
          );
          // DD/MM HH:MM  →  MM/DD HH:MM  (dates without year, e.g. upcoming games)
          updated = updated.replace(
            /\b(\d{1,2})\/(\d{1,2})(?=\s+\d{2}:\d{2})/g,
            (_m, d, mo) => `${mo.padStart(2, "0")}/${d.padStart(2, "0")}`
          );
          if (updated !== orig) textNode.textContent = updated;
        }
      });
    };

    // ── Global layout styles (injected once into <head>) ──────────────────────
    const globalStyleId = "bettorsedge-widget-layout";
    if (!document.getElementById(globalStyleId)) {
      const globalStyle = document.createElement("style");
      globalStyle.id = globalStyleId;
      globalStyle.textContent = `
        /* BettorsEdge: Clean flex layout for API-Sports widget game rows */
        api-sports-widget game-item {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          height: auto !important;
          min-height: 2.8rem !important;
          padding: 5px 8px !important;
          overflow: visible !important;
          gap: 6px !important;
          box-sizing: border-box !important;
        }
        api-sports-widget game-item .game-infos,
        api-sports-widget game-item.results .game-infos,
        api-sports-widget game-item.favorites .game-infos {
          flex: 0 0 62px !important;
          width: 62px !important;
          min-width: 62px !important;
          max-width: 62px !important;
          font-size: 0.6rem !important;
          line-height: 1.2 !important;
          display: inline-flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: center !important;
          padding: 2px 2px !important;
        }
        api-sports-widget game-item .game-teams {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          display: inline-flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          gap: 3px !important;
          overflow: hidden !important;
          padding: 1px 4px !important;
        }
        api-sports-widget game-item .team-info {
          display: flex !important;
          align-items: center !important;
          min-width: 0 !important;
          width: 100% !important;
          gap: 5px !important;
          flex-wrap: nowrap !important;
        }
        api-sports-widget game-item .team-info.team-home,
        api-sports-widget game-item .team-info.team-away {
          justify-content: flex-start !important;
          flex-direction: row !important;
        }
        api-sports-widget game-item .team-info .team-logo {
          width: 15px !important;
          height: 15px !important;
          object-fit: contain !important;
          flex-shrink: 0 !important;
        }
        api-sports-widget game-item .team-info .team-name {
          font-size: 0.68rem !important;
          font-weight: 500 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
          flex: 1 1 0% !important;
          min-width: 0 !important;
          max-width: none !important;
          margin-left: 0 !important;
          text-align: left !important;
        }
        api-sports-widget game-item .game-score {
          flex: 0 0 auto !important;
          display: inline-flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          align-items: flex-end !important;
          gap: 3px !important;
          margin-left: 4px !important;
          font-family: Tomorrow, sans-serif !important;
          font-size: 0.7rem !important;
          min-width: 68px !important;
          position: static !important;
        }
        api-sports-widget game-item .game-score .score-home,
        api-sports-widget game-item .game-score .score-away {
          display: flex !important;
          flex-direction: row !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 4px !important;
          position: static !important;
        }
        api-sports-widget game-item .game-score .score {
          font-weight: 800 !important;
          min-width: 1.2rem !important;
          text-align: right !important;
          color: var(--primary-color, #18cfc0) !important;
          position: static !important;
        }
        api-sports-widget game-item .game-score .score-home-half,
        api-sports-widget game-item .game-score .score-away-half {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: wrap !important;
          gap: 2px !important;
          opacity: 0.5 !important;
          font-size: 0.56rem !important;
          max-width: 80px !important;
          justify-content: flex-end !important;
        }
        api-sports-widget game-item .game-score .score-home-half span,
        api-sports-widget game-item .game-score .score-away-half span {
          min-width: 0.75rem !important;
        }
        @media (max-width: 480px) {
          api-sports-widget game-item .game-score {
            min-width: 52px !important;
          }
        }
      `;
      document.head.appendChild(globalStyle);
    }

    const initializeWidgets = () => {
      if (cancelled || !containerRef.current) return;

      // Query all content widgets (exclude config)
      const widgets = containerRef.current.querySelectorAll("api-sports-widget:not([data-type='config'])");
      
      widgets.forEach((widget: any) => {
        const runInit = () => {
          if (!cancelled && typeof widget.initSequential === "function") {
            if (!widget.classList.contains("initialized")) {
              widget.initSequential().catch((err: any) => {
                console.error("[Widget Embed] Failed to manually initialize widget:", err);
              });
            }
          }
        };

        if (typeof widget.initSequential === "function") {
          runInit();
        } else {
          (window as any).customElements?.whenDefined("api-sports-widget").then(() => {
            runInit();
          });
        }

        // Inject season filter – runs immediately AND watches for DOM changes
        // so it fires after the widget's async data fetch populates .round-section elements.
        const seasonAttr = widget.getAttribute("data-season");
        if (seasonAttr) {
          const currentSeason = parseInt(seasonAttr, 10);
          if (!isNaN(currentSeason)) {
            const previousSeason = currentSeason - 1;
            const widgetType = widget.getAttribute("data-type") || "widget";
            const filterStyleId = `bettorsedge-season-filter-${widgetType}`;

            // Upsert a <style> in document.head for global scope
            let filterStyleEl = document.getElementById(filterStyleId) as HTMLStyleElement | null;
            if (!filterStyleEl) {
              filterStyleEl = document.createElement("style");
              filterStyleEl.id = filterStyleId;
              document.head.appendChild(filterStyleEl);
            }
            filterStyleEl.textContent = `
              /* BettorsEdge: Hide H2H seasons outside current (${currentSeason}) & previous (${previousSeason}) */
              .round-section:not([data-round="${currentSeason}"]):not([data-round="${previousSeason}"]) {
                display: none !important;
              }
            `;

            // MutationObserver: re-apply season hiding AND date reformatting whenever the widget renders new content
            if (observer) observer.disconnect();
            observer = new MutationObserver(() => {
              // Season filter
              const sections = widget.querySelectorAll(`.round-section`);
              sections.forEach((sec: Element) => {
                const round = sec.getAttribute("data-round");
                if (round && round !== String(currentSeason) && round !== String(previousSeason)) {
                  (sec as HTMLElement).style.setProperty("display", "none", "important");
                }
              });
              // Date reformat
              reformatWidgetDates(widget);
            });
            observer.observe(widget, { childList: true, subtree: true });
          }
        } else {
          // For widgets without a season attribute, still reformat dates after init
          if (observer) observer.disconnect();
          observer = new MutationObserver(() => {
            reformatWidgetDates(widget);
          });
          observer.observe(widget, { childList: true, subtree: true });
        }
      });
    };

    initializeWidgets();

    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
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

  const widgetSeason = useMemo(() => {
    const date = new Date(selectedDate);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed: 9 = Oct
    return month >= 9 ? String(year) : String(year - 1);
  }, [selectedDate]);

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
        data-season="${widgetSeason}"
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
        data-key="${WIDGET_KEY}"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
        data-statistics="true"
        data-team-statistics="true"
        data-player-statistics="true"
        data-events="true"
        data-standings="true"
        data-team-squad="true"
      ></api-sports-widget>
    </div>
  `;

  const apiSportsGameWidgetHtml = selectedGameId ? `
    <div class="space-y-4">
      <api-sports-widget
        data-type="game"
        data-game-id="${selectedGameId}"
        data-season="${widgetSeason}"
        data-refresh="30"
        data-show-toolbar="true"
        data-tab="statistics"
        data-game-style="2"
      ></api-sports-widget>
      
      <api-sports-widget
        data-type="config"
        data-key="${WIDGET_KEY}"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
        data-statistics="true"
        data-team-statistics="true"
        data-player-statistics="true"
        data-events="true"
        data-standings="true"
        data-team-squad="true"
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
        data-season="${widgetSeason}"
        data-refresh="30"
        data-show-toolbar="true"
        data-tab="all"
        data-h2h-style="2"
      ></api-sports-widget>
      
      <api-sports-widget
        data-type="config"
        data-key="${WIDGET_KEY}"
        data-sport="nba"
        data-lang="en"
        data-theme="grey"
        data-timezone="CST"
        data-show-errors="true"
        data-show-logos="true"
        data-favorite="true"
        data-statistics="true"
        data-team-statistics="true"
        data-player-statistics="true"
        data-events="true"
        data-standings="true"
        data-team-squad="true"
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
