import { getDb, getAuthInstance } from "../firebase";
import { collection, addDoc } from "firebase/firestore";

export async function logError(error: any, context: string, userId?: string) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[App Error] ${context}:`, message, stack);

  try {
    const db = getDb();
    const auth = getAuthInstance();
    const uid = userId || auth.currentUser?.uid || "anonymous";
    const logsRef = collection(db, "app_logs");
    await addDoc(logsRef, {
      message,
      stack,
      context,
      userId: uid,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    // If it's a permission error, don't keep trying to log to Firestore as it might cause more errors
    if (e.message?.includes("permissions")) {
      console.warn("Firestore logging permissions missing for app_logs");
    }
  }
}

export async function logApiCall(service: string, model: string, prompt: string, response: any, latency: number, tokens?: any) {
  console.log(`[API Call] ${service} (${model}) - Latency: ${latency}ms`);
  
  try {
    const db = getDb();
    const auth = getAuthInstance();
    const uid = auth.currentUser?.uid || "system";
    const logsRef = collection(db, "api_logs");
    
    await addDoc(logsRef, {
      service,
      model,
      prompt: prompt.substring(0, 1000),
      response: typeof response === "string" ? response.substring(0, 1000) : "JSON_RESPONSE",
      latency,
      tokens: tokens || null,
      userId: uid,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    if (e.message?.includes("permissions")) {
      console.warn("Firestore logging permissions missing for api_logs");
    }
  }
}

export async function logSourceAudit(gameId: string, league: string, audit: any) {
  try {
    const db = getDb();
    const logsRef = collection(db, "source_audits");
    await addDoc(logsRef, {
      gameId,
      league,
      ...audit,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to log source audit to Firestore:", e);
  }
}
