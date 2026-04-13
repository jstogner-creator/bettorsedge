import { getDb, getIdToken } from "../firebase";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { BettorsEdge } from "./gemini";
import axios from "axios";

export interface QAResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

export class QAService {
  private bettorsEdge = new BettorsEdge();

  async runFullAudit(): Promise<QAResult[]> {
    const results: QAResult[] = [];

    // 1. Firebase Connectivity
    results.push(await this.checkFirebase());

    // 2. Server Health & Secrets
    results.push(await this.checkServerHealth());

    // 3. Gemini API Connectivity
    results.push(await this.checkGemini());

    // 4. API-Sports Connectivity (NBA)
    results.push(await this.checkApiSports());

    // 5. ESPN Connectivity
    results.push(await this.checkEspn());

    return results;
  }

  private async checkFirebase(): Promise<QAResult> {
    try {
      const db = getDb();
      const q = query(collection(db, "predictions"), limit(1));
      await getDocs(q);
      return {
        name: "Firebase Firestore",
        status: 'pass',
        message: "Successfully connected to Firestore and read predictions."
      };
    } catch (error: any) {
      return {
        name: "Firebase Firestore",
        status: 'fail',
        message: `Firestore connection failed: ${error.message}`
      };
    }
  }

  private async checkServerHealth(): Promise<QAResult> {
    try {
      const token = await getIdToken();
      const response = await axios.get("/api/admin/qa-health", {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = response.data;
      const missing = [];
      if (!data.stripe.configured) missing.push("Stripe");
      if (!data.kalshi.configured) missing.push("Kalshi");
      if (!data.openai.configured) missing.push("OpenAI");
      if (!data.gemini.configured) missing.push("Gemini (Server)");

      if (missing.length > 0) {
        return {
          name: "Server Configuration",
          status: 'warning',
          message: `Server is running but missing secrets: ${missing.join(", ")}`,
          details: data
        };
      }

      return {
        name: "Server Configuration",
        status: 'pass',
        message: "Server is healthy and all primary secrets are configured.",
        details: data
      };
    } catch (error: any) {
      return {
        name: "Server Configuration",
        status: 'fail',
        message: `Failed to reach QA health endpoint: ${error.message}`
      };
    }
  }

  private async checkGemini(): Promise<QAResult> {
    try {
      // Simple test to see if we can get a model response
      // We use a very cheap prompt
      const result = await this.bettorsEdge.analyzeRecentPerformance([]);
      if (result && !result.includes("Error")) {
        return {
          name: "Gemini AI Engine",
          status: 'pass',
          message: "Gemini API is responsive and generating analysis."
        };
      }
      return {
        name: "Gemini AI Engine",
        status: 'fail',
        message: "Gemini returned an unexpected or empty response."
      };
    } catch (error: any) {
      return {
        name: "Gemini AI Engine",
        status: 'fail',
        message: `Gemini API call failed: ${error.message}`
      };
    }
  }

  private async checkApiSports(): Promise<QAResult> {
    try {
      const token = await getIdToken();
      const response = await axios.get("/api/nba/games", {
        params: { date: new Date().toISOString().split('T')[0] },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data) {
        return {
          name: "API-Sports (NBA)",
          status: 'pass',
          message: "Successfully reached API-Sports proxy and received data."
        };
      }
      return {
        name: "API-Sports (NBA)",
        status: 'warning',
        message: "API-Sports proxy returned empty data."
      };
    } catch (error: any) {
      return {
        name: "API-Sports (NBA)",
        status: 'fail',
        message: `API-Sports proxy failed: ${error.message}`
      };
    }
  }

  private async checkEspn(): Promise<QAResult> {
    try {
      const token = await getIdToken();
      const response = await axios.get("/api/espn/schedule", {
        params: { sport: 'basketball', league: 'nba', dateStr: new Date().toISOString().split('T')[0].replace(/-/g, '') },
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data) {
        return {
          name: "ESPN Data Service",
          status: 'pass',
          message: "Successfully reached ESPN proxy and received scoreboard data."
        };
      }
      return {
        name: "ESPN Data Service",
        status: 'warning',
        message: "ESPN proxy returned empty data."
      };
    } catch (error: any) {
      return {
        name: "ESPN Data Service",
        status: 'fail',
        message: `ESPN proxy failed: ${error.message}`
      };
    }
  }
}

export const qaService = new QAService();
