from pathlib import Path

path = Path("src/pages/Dashboard.tsx")
s = path.read_text()
changed = False

# Add partial-prediction detection before shouldAnalyze uses it.
needle = '''        const existingPrediction = savedPredictions[game.id];
        
        // Check if injuries changed'''
replacement = '''        const existingPrediction = savedPredictions[game.id];
        const isPartialPrediction =
          existingPrediction?.winner === "TBD" ||
          existingPrediction?.reasoning === "Injury report updated. Full analysis pending." ||
          existingPrediction?.scenarioAnalysis === "Pending analysis.";
        
        // Check if injuries changed'''

if "isPartialPrediction" in s and "const isPartialPrediction" not in s:
    if needle in s:
        s = s.replace(needle, replacement, 1)
        changed = True
        print("added missing isPartialPrediction definition")
    else:
        raise SystemExit("isPartialPrediction is referenced but insertion point was not found")
elif "const isPartialPrediction" in s:
    print("isPartialPrediction definition already present")
else:
    if needle in s:
        s = s.replace(needle, replacement, 1)
        changed = True
        print("added isPartialPrediction definition")
    else:
        print("warning: insertion point for isPartialPrediction not found")

old_should = "shouldAnalyze = !existingPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);"
new_should = "shouldAnalyze = !existingPrediction || isPartialPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);"
if old_should in s:
    s = s.replace(old_should, new_should, 1)
    changed = True
    print("updated shouldAnalyze to include partial predictions")
elif new_should in s:
    print("shouldAnalyze already includes partial predictions")
else:
    print("warning: shouldAnalyze line not found")

for old, new in [
    ('reasoning: savedPredictions[game.id]?.reasoning || "Injury report updated. Full analysis pending.",', 'reasoning: savedPredictions[game.id]?.reasoning,'),
    ('scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis || "Pending analysis.",', 'scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis,'),
    ('hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice || "Pending analysis.",', 'hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice,'),
]:
    if old in s:
        s = s.replace(old, new)
        changed = True
        print("removed placeholder:", old.split(":", 1)[0])

path.write_text(s)
print("Dashboard analysis flow patch complete", {"changed": changed})
