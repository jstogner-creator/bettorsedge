from pathlib import Path

path = Path("src/pages/Dashboard.tsx")
s = path.read_text()
changed = False

# 1) Add partial-prediction detection to the bulk/smart analysis path.
old2 = '''          const existingPrediction = savedPredictions[game.id];
          
          // Check if injuries changed
          const newInjuries = injuryUpdates[game.id];
          const oldInjuries = existingPrediction?.injuries;
          const injuriesChanged = newInjuries && JSON.stringify(newInjuries) !== JSON.stringify(oldInjuries || []);'''

new2 = '''          const existingPrediction = savedPredictions[game.id];
          const isPartialPrediction =
            existingPrediction?.winner === "TBD" ||
            existingPrediction?.reasoning === "Injury report updated. Full analysis pending." ||
            existingPrediction?.scenarioAnalysis === "Pending analysis.";
          
          // Check if injuries changed
          const newInjuries = injuryUpdates[game.id];
          const oldInjuries = existingPrediction?.injuries;
          const injuriesChanged = newInjuries && JSON.stringify(newInjuries) !== JSON.stringify(oldInjuries || []);'''

if old2 in s:
    s = s.replace(old2, new2, 1)
    changed = True
    print("added partial-prediction detection")
elif "const isPartialPrediction =" in s:
    print("partial-prediction detection already present")
else:
    print("warning: smart-analysis prediction block not found; continuing")

# 2) Force partial predictions to be analyzed even if they are fresh.
old3 = '''          // Smart analysis
          shouldAnalyze = !existingPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);'''

new3 = '''          // Smart analysis
          shouldAnalyze = !existingPrediction || isPartialPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);'''

if old3 in s:
    s = s.replace(old3, new3, 1)
    changed = True
    print("updated shouldAnalyze to include partial predictions")
elif "isPartialPrediction || !isRecentEnough" in s:
    print("partial-prediction retry already present")
else:
    print("warning: shouldAnalyze line not found; continuing")

# 3) Remove the most harmful single-game placeholder text if present.
# This step is intentionally tolerant. If the exact block differs, the bulk-analysis fix above still prevents stale TBD cards from blocking full analysis.
if "Injury report updated. Full analysis pending." in s:
    s = s.replace('reasoning: savedPredictions[game.id]?.reasoning || "Injury report updated. Full analysis pending.",', 'reasoning: savedPredictions[game.id]?.reasoning,')
    s = s.replace('scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis || "Pending analysis.",', 'scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis,')
    s = s.replace('hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice || "Pending analysis.",', 'hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice,')
    changed = True
    print("removed hard-coded injury-only placeholder text")

path.write_text(s)
print("Dashboard analysis flow patch complete", {"changed": changed})
