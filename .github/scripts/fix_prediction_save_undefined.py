from pathlib import Path

path = Path('src/services/gemini.ts')
s = path.read_text()

if 'function stripUndefined' not in s:
    marker = '''function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(cleanJson(text)) as T;
  } catch (error) {
    console.warn("[OpenAI] Failed to parse JSON response:", error);
    return fallback;
  }
}
'''
    insert = '''function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(cleanJson(text)) as T;
  } catch (error) {
    console.warn("[OpenAI] Failed to parse JSON response:", error);
    return fallback;
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    const cleaned: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, item]) => {
      if (item !== undefined) cleaned[key] = stripUndefined(item);
    });
    return cleaned as T;
  }
  return value;
}
'''
    if marker not in s:
        raise SystemExit('safeJsonParse marker not found')
    s = s.replace(marker, insert, 1)

old = '''  async savePrediction(gameId: string, prediction: Prediction) {
    const db = getDb();
    await setDoc(doc(db, "predictions", gameId), {
      ...prediction,
      gameId,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      lastUpdated: new Date().toISOString(),
    }, { merge: true });
  }'''

new = '''  async savePrediction(gameId: string, prediction: Prediction) {
    const db = getDb();
    const payload = stripUndefined({
      ...prediction,
      gameId,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      lastUpdated: new Date().toISOString(),
    });
    await setDoc(doc(db, "predictions", gameId), payload, { merge: true });
  }'''

if old in s:
    s = s.replace(old, new, 1)
elif 'const payload = stripUndefined({' in s:
    print('savePrediction already sanitized')
else:
    raise SystemExit('savePrediction block not found')

path.write_text(s)
print('Prediction save sanitization patch complete')
