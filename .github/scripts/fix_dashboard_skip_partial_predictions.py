from pathlib import Path

path = Path('src/pages/Dashboard.tsx')
s = path.read_text()
changed = False

old_partial = '''        const isPartialPrediction =
          existingPrediction?.winner === "TBD" ||
          existingPrediction?.reasoning === "Injury report updated. Full analysis pending." ||
          existingPrediction?.scenarioAnalysis === "Pending analysis.";'''
new_partial = '''        const isPartialPrediction =
          existingPrediction?.winner === "TBD" ||
          existingPrediction?.reasoning?.includes("Full analysis pending") ||
          existingPrediction?.scenarioAnalysis === "Pending analysis." ||
          !existingPrediction?.reasoning ||
          !existingPrediction?.scenarioAnalysis;'''

if old_partial in s:
    s = s.replace(old_partial, new_partial, 1)
    changed = True
    print('expanded partial prediction detection')
elif '!existingPrediction?.scenarioAnalysis' in s:
    print('partial prediction detection already expanded')
else:
    raise SystemExit('partial prediction block not found')

old_force = '''        if (isSelected) {
          shouldAnalyze = !isVeryFresh; // Force selected games unless literally just analyzed
        } else if (force) {
          shouldAnalyze = !isVeryFresh; // Force all unless literally just analyzed
        } else {'''
new_force = '''        if (isSelected) {
          shouldAnalyze = isPartialPrediction || !isVeryFresh; // Force selected games; never skip partial placeholders
        } else if (force) {
          shouldAnalyze = isPartialPrediction || !isVeryFresh; // Force all; never skip partial placeholders
        } else {'''

if old_force in s:
    s = s.replace(old_force, new_force, 1)
    changed = True
    print('fixed force/selected skip logic for partial predictions')
elif 'never skip partial placeholders' in s:
    print('force/selected skip logic already patched')
else:
    raise SystemExit('force/selected skip block not found')

old_batch = '''          batch.set(docRef, { 
            gameId,
            injuries,
            lastUpdated: new Date().toISOString(),
            winner: existing?.winner || "TBD",
            confidence: existing?.confidence || 5,
            league: targetLeague,
            date: dateStr
          }, { merge: true });'''
new_batch = '''          batch.set(docRef, { 
            gameId,
            injuries,
            league: targetLeague,
            date: dateStr
          }, { merge: true });'''

if old_batch in s:
    s = s.replace(old_batch, new_batch, 1)
    changed = True
    print('stopped injury updates from creating fresh TBD predictions')
elif 'winner: existing?.winner || "TBD"' not in s:
    print('injury placeholder write already removed')
else:
    print('warning: injury batch placeholder block not found')

path.write_text(s)
print('Dashboard partial prediction skip fix complete', {'changed': changed})
