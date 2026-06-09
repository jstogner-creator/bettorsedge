from pathlib import Path

path = Path("src/pages/Dashboard.tsx")
s = path.read_text()

old = '''        const docRef = doc(db, "predictions", game.id);
        const newPredictionData = { 
          gameId: game.id,
          league: targetLeague,
          date: dateStr,
          injuries: gameUpdates,
          lastUpdated: new Date().toISOString(),
          winner: savedPredictions[game.id]?.winner || "TBD",
          confidence: savedPredictions[game.id]?.confidence || 5,
          reasoning: savedPredictions[game.id]?.reasoning || "Injury report updated. Full analysis pending.",
          scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis || "Pending analysis.",
          hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice || "Pending analysis.",
          keyFactors: savedPredictions[game.id]?.keyFactors || [],
          kalshiPrice: savedPredictions[game.id]?.kalshiPrice || 0.5,
          qaStatus: savedPredictions[game.id]?.qaStatus || "verified"
        };
        await setDoc(docRef, newPredictionData, { merge: true });
        
        // Update local state
        setSavedPredictions(prev => ({
          ...prev,
          [game.id]: {
            ...(prev[game.id] || {}),
            ...newPredictionData
          }
        }));'''

new = '''        // Keep injury updates in memory only before full analysis.
        // Do not write a fresh TBD prediction here because that can make the card look analyzed
        // and can cause smart-analysis resume logic to skip the real prediction.
        setSavedPredictions(prev => ({
          ...prev,
          [game.id]: {
            ...(prev[game.id] || {}),
            gameId: game.id,
            league: targetLeague,
            date: dateStr,
            injuries: gameUpdates,
          } as any
        }));'''

if old not in s:
    if "Injury report updated. Full analysis pending." not in s:
        print("single-game partial write block already removed")
    else:
        raise SystemExit("target single-game partial write block not found")
else:
    s = s.replace(old, new, 1)

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

if old2 not in s:
    if "const isPartialPrediction =" in s:
        print("partial prediction detection already added")
    else:
        raise SystemExit("target smart-analysis partial detection block not found")
else:
    s = s.replace(old2, new2, 1)

old3 = '''          // Smart analysis
          shouldAnalyze = !existingPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);'''

new3 = '''          // Smart analysis
          shouldAnalyze = !existingPrediction || isPartialPrediction || !isRecentEnough || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);'''

if old3 not in s:
    if "isPartialPrediction || !isRecentEnough" in s:
        print("smart-analysis partial retry already added")
    else:
        raise SystemExit("target smart-analysis shouldAnalyze line not found")
else:
    s = s.replace(old3, new3, 1)

path.write_text(s)
print("Dashboard analysis flow patched")
