from pathlib import Path

path = Path("src/pages/Dashboard.tsx")
s = path.read_text()

needle = '''        const existingPrediction = savedPredictions[game.id];
        
        // Check if injuries changed'''
replacement = '''        const existingPrediction = savedPredictions[game.id];
        const isPartialPrediction =
          existingPrediction?.winner === "TBD" ||
          existingPrediction?.reasoning === "Injury report updated. Full analysis pending." ||
          existingPrediction?.scenarioAnalysis === "Pending analysis.";
        
        // Check if injuries changed'''

if "isPartialPrediction" in s and "const isPartialPrediction" not in s:
    if needle not in s:
        raise SystemExit("Could not find insertion point for isPartialPrediction")
    s = s.replace(needle, replacement, 1)
    path.write_text(s)
    print("Fixed missing isPartialPrediction definition")
elif "const isPartialPrediction" in s:
    print("isPartialPrediction already defined")
else:
    if needle not in s:
        raise SystemExit("Could not find insertion point for isPartialPrediction")
    s = s.replace(needle, replacement, 1)
    path.write_text(s)
    print("Added isPartialPrediction definition")
