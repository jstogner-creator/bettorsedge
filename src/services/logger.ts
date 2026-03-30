import { getDb, getAuthInstance } from "../firebase";
import { collection, addDoc } from "firebase/firestore";

export async function logError(error: any, context: string, userId?: string) {
  try {
    const db = getDb();
    const auth = getAuthInstance();
    const uid = userId || auth.currentUser?.uid || null;
    const logsRef = collection(db, "app_logs");
    await addDoc(logsRef, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      userId: uid,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to log error to Firestore:", e);
  }
}

export async function logApiCall(service: string, model: string, prompt: string, response: any, latency: number, tokens?: any) {
  try {
    const db = getDb();
    const auth = getAuthInstance();
    const uid = auth.currentUser?.uid || "system";
    const logsRef = collection(db, "api_logs");
    
    await addDoc(logsRef, {
      service,
      model,
      prompt: prompt.substring(0, 1000), // Cap prompt size
      response: typeof response === "string" ? response.substring(0, 1000) : "JSON_RESPONSE",
      latency,
      tokens: tokens || null,
      userId: uid,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`Failed to log ${service} call to Firestore:`, e);
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
