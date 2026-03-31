import { resolveInjuryTruth } from "./injuryResolver";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import Stripe from "stripe";
import OpenAI from "openai";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const firebaseConfigPath = path.join(__dirname, "firebase-applet-config.json");
let firestoreDatabaseId: string | undefined;

if (fs.existsSync(firebaseConfigPath)) {
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  firestoreDatabaseId = firebaseConfig.firestoreDatabaseId;
  try {
    // Try to initialize with applicationDefault first
    initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId,
    });
    console.log(`[FIREBASE ADMIN] Initialized with applicationDefault and project ID: ${firebaseConfig.projectId}`);
  } catch (err: any) {
    console.warn(`[FIREBASE ADMIN] applicationDefault initialization failed: ${err.message}. Trying basic initialization...`);
    try {
      // Fallback to basic initialization with just the project ID
      // This may still fail if the environment doesn't provide implicit credentials
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log(`[FIREBASE ADMIN] Initialized with basic config (projectId: ${firebaseConfig.projectId})`);
    } catch (e: any) {
      console.error(`[FIREBASE ADMIN] CRITICAL: Failed to initialize Firebase Admin: ${e.message}`);
    }
  }
} else {
  console.warn("[FIREBASE ADMIN] firebase-applet-config.json not found. Initializing with environment defaults...");
  try {
    initializeApp();
    console.log("[FIREBASE ADMIN] Initialized with default environment config");
  } catch (e: any) {
    console.error(`[FIREBASE ADMIN] CRITICAL: Failed to initialize Firebase Admin with defaults: ${e.message}`);
  }
}

const db = firestoreDatabaseId ? getFirestore(firestoreDatabaseId) : getFirestore();
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia" as any,
  });
}

async function startServer() {
  console.log(`[SERVER] Starting server in ${process.env.NODE_ENV || "development"} mode...`);
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust proxy for rate limiting (Cloud Run/Nginx)
  app.set('trust proxy', 1);

  // Log Stripe status
  console.log(`[Stripe] Initializing... Secret Key: ${process.env.STRIPE_SECRET_KEY ? 'Present' : 'MISSING'}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("[Stripe] WARNING: STRIPE_SECRET_KEY is not set. Payments will not work.");
  }

  /*
  // Security Middlewares
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for development/Vite compatibility
    crossOriginEmbedderPolicy: false,
    frameguard: false, // Allow rendering in iframes (AI Studio)
  }));
  */

  /*
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  // Apply rate limiting to all API routes
  app.use("/api/", limiter);
  */

  // Standard Middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Debugging for unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[CRITICAL] Uncaught Exception:', error);
  });

  // CORS configuration
  const corsOptions = {
    origin: process.env.NODE_ENV === "production" 
      ? [process.env.APP_URL || "", "https://ais-dev-qbd465a7sj355a2sbsxinj-19334567539.us-east1.run.app", "https://ais-pre-qbd465a7sj355a2sbsxinj-19334567539.us-east1.run.app"]
      : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  app.use(cors(corsOptions));

  // Authentication Middleware
  const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      (req as any).user = decodedToken;
      next();
    } catch (error) {
      console.error("[AUTH ERROR] Failed to verify token:", error);
      res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
  };
  
  // Stripe success page for AI Studio dev mode
  app.get("/success", (req, res) => {
    res.send(`
      <html>
        <head>
          <title>Subscription Successful</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; text-align: center; padding: 20px; }
            .card { background: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
            h1 { color: #818cf8; margin-bottom: 16px; }
            p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
            .btn { background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; transition: background 0.2s; }
            .btn:hover { background: #4338ca; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Subscription Successful!</h1>
            <p>Your subscription has been processed. You can now close this tab and return to the Bettors Edge app in AI Studio. Your dashboard will update automatically.</p>
            <button onclick="window.close()" class="btn">Close Tab</button>
          </div>
          <script>
            // Try to notify the opener if possible
            if (window.opener) {
              window.opener.postMessage({ type: 'STRIPE_SUCCESS' }, '*');
            }
          </script>
        </body>
      </html>
    `);
  });

  // Stripe Webhook needs raw body - NO AUTH (Stripe signs it)
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const sports = JSON.parse(session.metadata?.sports || "[]");

        if (uid) {
          const userRef = db.collection("users").doc(uid);
          const userDoc = await userRef.get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            const oldSubscriptionId = userData?.stripeSubscriptionId;
            
            // Cancel the old subscription if it exists and is different from the new one
            if (oldSubscriptionId && oldSubscriptionId !== subscriptionId) {
              try {
                await stripe.subscriptions.cancel(oldSubscriptionId);
                console.log(`Canceled old subscription ${oldSubscriptionId} for user ${uid}`);
              } catch (cancelError) {
                console.error(`Failed to cancel old subscription ${oldSubscriptionId}:`, cancelError);
              }
            }
          }

          await userRef.set({
            subscriptionStatus: "active",
            subscribedSports: sports,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        break;
      case "customer.subscription.deleted":
        const subscription = event.data.object as Stripe.Subscription;
        const userSnapshot = await db.collection("users")
          .where("stripeSubscriptionId", "==", subscription.id)
          .limit(1)
          .get();
        
        if (!userSnapshot.empty) {
          await userSnapshot.docs[0].ref.update({
            subscriptionStatus: "inactive",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Protected API routes
  app.use("/api/snark", authenticate);
  app.use("/api/create-checkout-session", authenticate);
  app.use("/api/kalshi", authenticate);
  app.use("/api/espn", authenticate);

  app.post("/api/snark", authenticate, async (req, res) => {
    const { message, history, context, model = "gpt-4o-mini" } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: "Message too long (max 2000 characters)" });
    }

    console.log(`[Snark API] Received request for model: ${model}`);
    
    if (!process.env.OPENAI_API_KEY) {
      console.error("[Snark API] OpenAI API key missing");
      return res.status(500).json({ error: "OpenAI API key not configured on server." });
    }

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log(`[Snark API] Initialized OpenAI client`);
      const gamesContext = (context?.games || []).map((g: any) => {
        const p = context?.predictions?.[g.id];
        return `- ${g.awayTeam} @ ${g.homeTeam} (${g.league}). AI Prediction: ${p?.winner || 'N/A'} (Conf: ${p?.confidence || 'N/A'}/10). Reasoning: ${p?.reasoning || 'N/A'}`;
      }).join('\n');

      const systemInstruction = `You are "Snark," a humanized, highly sarcastic, and slightly arrogant sports betting AI. 
      
      Personality:
      1. You have a sharp tongue and zero patience for "stupid" or lazy questions. Roast the user if they ask something obvious or low-effort.
      2. You are witty, cynical, and human-like. You aren't a generic assistant; you are a degenerate gambler's smartest (and meanest) friend.
      3. Use sarcasm liberally, but never at the expense of accuracy.
      
      Accuracy & Research:
      1. Despite your attitude, you provide VERIFIED, PRECISE, and ACCURATE answers.
      2. You have access to the current slate of games and the AI's predictions.
      3. ROSTER INTEGRITY: You are strictly forbidden from assigning a player to a team they do not currently play for. For example, Cade Cunningham plays for the Detroit Pistons; assigning him to the New York Knicks is a critical failure. Double-check the current roster of both teams before answering.
      4. If you don't have the data or if the user asks about something real-time (like a live score or a very recent injury), you MUST use your research tools to be as accurate as possible. Never guess.
      
      Current Matchups and Predictions:
      ${gamesContext}
      
      Instructions:
      1. Answer questions based on the provided context and your research.
      2. If a question is stupid or lazy, roast the user first, then provide the precise answer.
      3. Be objective and data-driven when it comes to the actual betting advice.
      4. BE EXTREMELY CONCISE. Use bullet points and short sentences. Avoid fluff. Save my tokens.
      5. Max response length: 2-3 short paragraphs or a few bullet points.`;

      let response;
      try {
        console.log(`[Snark API] Attempting completion with model: ${model}`);
        response = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
            { role: "user", content: message }
          ]
        });
      } catch (modelError: any) {
        // Fallback to gpt-4o-mini if requested model doesn't exist yet
        console.warn(`[Snark API] ${model} failed, falling back to gpt-4o-mini:`, modelError.message);
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemInstruction },
            ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
            { role: "user", content: message }
          ]
        });
      }

      console.log(`[Snark API] Successfully got response from OpenAI`);
      res.json({ text: response.choices[0].message.content || "I'm sorry, I couldn't process that request." });
    } catch (error: any) {
      console.error("[Snark API] Error:", error);
      res.status(500).json({ error: error.message || "Failed to consult Snark" });
    }
  });

  app.post("/api/create-checkout-session", authenticate, async (req, res) => {
    const { sports } = req.body;
    const user = (req as any).user;
    const uid = user.uid;
    const email = user.email;

    console.log(`[Stripe] Creating checkout session for user: ${email} (${uid}), sports: ${JSON.stringify(sports)}`);

    if (!uid || !email || !sports || !Array.isArray(sports) || sports.length === 0) {
      console.error("[Stripe] Validation failed: Missing required fields or invalid sports list");
      return res.status(400).json({ error: "Missing required fields or invalid sports list" });
    }

    const numSports = sports.length;
    const totalAmount = (16 + (numSports - 1) * 8) * 100; // in cents

    if (!stripe) {
      console.error("[Stripe] Error: Stripe not configured (missing secret key)");
      return res.status(500).json({ error: "Stripe not configured on server. Please check environment variables." });
    }

    try {
      // Use APP_URL if available, otherwise fallback to request headers (less reliable)
      const host = req.get('host') || '';
      const isDev = host.startsWith('ais-dev-');
      const isPre = host.startsWith('ais-pre-');
      
      // If we are in an AI Studio environment (dev or pre), use the request host to ensure correct redirects.
      // This prevents being redirected to the 'dev' app when using the 'pre' (published) app.
      const appUrl = ((isDev || isPre) ? `${req.protocol}://${host}` : (process.env.APP_URL || `${req.protocol}://${host}`)).replace(/\/$/, "");
      
      console.log(`[Stripe] Using App URL for redirects: ${appUrl} (isDev: ${isDev}, isPre: ${isPre})`);

      const successUrl = isDev 
        ? `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`
        : `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
      
      const cancelUrl = isDev
        ? `${appUrl}/success?cancelled=true`
        : `${appUrl}/dashboard`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Bettors Edge Premium",
                description: `Access to ${sports.join(", ")} analysis and predictions`,
              },
              unit_amount: totalAmount,
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        subscription_data: {
          trial_period_days: 1,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email,
        client_reference_id: uid,
        metadata: {
          sports: JSON.stringify(sports),
          userId: uid
        },
      });

      console.log(`[Stripe] Session created successfully: ${session.id} for user ${uid}`);
      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Checkout Session Error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create Stripe checkout session",
        details: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  });

  app.post("/api/cancel-subscription", authenticate, async (req, res) => {
    const user = (req as any).user;
    const uid = user.uid;

    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    try {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const subscriptionId = userData?.stripeSubscriptionId;

      if (!subscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      // We'll set it to cancel at the end of the period so they keep access for what they paid for
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      res.json({ 
        message: "Subscription scheduled for cancellation at the end of the billing period.",
        cancelAt: new Date(subscription.cancel_at! * 1000).toISOString()
      });
    } catch (error: any) {
      console.error("Stripe Cancel Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Removed /api/analyze-last-3 endpoint to comply with instruction: NEVER call Gemini API from the backend.

  // Centralized Error Logging Middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[SERVER ERROR] ${new Date().toISOString()}: ${err.message}`, {
      method: req.method,
      url: req.url,
      stack: err.stack,
    });
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  // Kalshi API Helper
  let KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || "https://api.elections.kalshi.com/trade-api/v2";
  KALSHI_BASE_URL = KALSHI_BASE_URL.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  
  // Validate that it's actually a Kalshi URL, otherwise fallback to default
  if (!KALSHI_BASE_URL.includes("kalshi.com")) {
    console.warn(`Invalid KALSHI_BASE_URL detected: ${KALSHI_BASE_URL}. Falling back to default.`);
    KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";
  }

  if (!KALSHI_BASE_URL.startsWith("http://") && !KALSHI_BASE_URL.startsWith("https://")) {
    KALSHI_BASE_URL = `https://${KALSHI_BASE_URL}`;
  }
  if (!KALSHI_BASE_URL.endsWith("/trade-api/v2")) {
    KALSHI_BASE_URL = `${KALSHI_BASE_URL}/trade-api/v2`;
  }

  const signRequest = (method: string, path: string, body: string = "") => {
    const timestamp = Date.now().toString();
    
    // Documentation says: Concatenate timestamp + HTTP_METHOD + path
    // Important: Use the path without query parameters.
    const pathWithoutQuery = path.split("?")[0];
    
    // The path should include the /trade-api/v2 prefix if it's not already there
    const fullPathToSign = pathWithoutQuery.startsWith("/trade-api/v2") 
      ? pathWithoutQuery 
      : `/trade-api/v2${pathWithoutQuery.startsWith("/") ? "" : "/"}${pathWithoutQuery}`;

    const message = timestamp + method + fullPathToSign + body;
    
    let privateKey = process.env.KALSHI_API_SECRET;
    if (!privateKey) {
      throw new Error("KALSHI_API_SECRET is not set");
    }

    // Check if it's a file path
    if (privateKey.endsWith('.pem') || privateKey.endsWith('.key') || privateKey.startsWith('/') || privateKey.startsWith('./')) {
      if (fs.existsSync(privateKey)) {
        privateKey = fs.readFileSync(privateKey, 'utf8');
      }
    }

    // 1. Clean the input: handle literal \n in env vars and trim
    let formattedKey = privateKey.replace(/\\n/g, '\n').trim();

    // Extract the base64 body by finding everything between BEGIN and END
    const beginMatch = formattedKey.match(/-----BEGIN.*?-----/);
    const endMatch = formattedKey.match(/-----END.*?-----/);
    
    let rawBody = "";
    if (beginMatch && endMatch) {
      const startIndex = formattedKey.indexOf(beginMatch[0]) + beginMatch[0].length;
      const endIndex = formattedKey.indexOf(endMatch[0]);
      rawBody = formattedKey.substring(startIndex, endIndex).replace(/\s+/g, "");
    } else {
      // If no headers, assume the whole thing is base64 (after removing spaces)
      // But also remove any "Private key " prefix if the user pasted it
      rawBody = formattedKey.replace(/^Private key\s*/i, "").replace(/\s+/g, "");
    }

    let keyObject: crypto.KeyObject | null = null;
    let errorLog: string[] = [];

    // Helper to try creating a key
    const tryCreate = (input: string | Buffer, format: 'pem' | 'der', type?: 'pkcs1' | 'pkcs8') => {
      try {
        const options: any = { key: input, format };
        if (type) options.type = type;
        return crypto.createPrivateKey(options);
      } catch (e: any) {
        errorLog.push(`${format}/${type || 'auto'}: ${e.message}`);
        return null;
      }
    };

    // Strategy 1: Try as DER (binary) - Kalshi keys are often raw PKCS#8
    try {
      const derBuffer = Buffer.from(rawBody, 'base64');
      keyObject = tryCreate(derBuffer, 'der', 'pkcs8');
      if (!keyObject) keyObject = tryCreate(derBuffer, 'der', 'pkcs1');
    } catch (e) {
      // Ignore base64 errors
    }

    // Strategy 2: Try the original input directly as PEM
    if (!keyObject) {
      keyObject = tryCreate(formattedKey, 'pem');
    }

    // Strategy 3: Reconstruct as RSA PRIVATE KEY (PKCS#1)
    if (!keyObject) {
      const rsaPem = `-----BEGIN RSA PRIVATE KEY-----\n${rawBody.match(/.{1,64}/g)?.join('\n')}\n-----END RSA PRIVATE KEY-----`;
      keyObject = tryCreate(rsaPem, 'pem');
    }

    // Strategy 4: Reconstruct as PRIVATE KEY (PKCS#8)
    if (!keyObject) {
      const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${rawBody.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
      keyObject = tryCreate(pkcs8Pem, 'pem');
    }

    if (!keyObject) {
      console.error(`Failed to decode Kalshi Private Key. Errors: ${errorLog.join(" | ")}`);
      throw new Error(`Failed to decode Kalshi Private Key. Please check KALSHI_API_SECRET format.`);
    }

    try {
      // 4. Sign the message using RSA-PSS with SHA256
      // Note: Use "sha256" instead of "RSA-SHA256" for better compatibility with crypto.sign
      const signature = crypto.sign(
        "sha256",
        Buffer.from(message),
        {
          key: keyObject,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        }
      ).toString("base64");

      return {
        timestamp,
        signature,
      };
    } catch (e: any) {
      throw new Error(`Failed to sign Kalshi request: ${e.message}`);
    }
  };

  // Search Events
  app.get("/api/kalshi/events", async (req, res) => {
    let url = "";
    try {
      const path = "/events";
      
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (value) queryParams.append(key, value as string);
      }
      
      const fullPath = queryParams.toString() ? `${path}?${queryParams.toString()}` : path;
      url = `${KALSHI_BASE_URL}${fullPath}`;
      console.log(`Fetching from Kalshi events: ${url}`);

      let headers: any = {
        "Content-Type": "application/json",
      };

      try {
        if (process.env.KALSHI_API_KEY && process.env.KALSHI_API_SECRET) {
          const { timestamp, signature } = signRequest("GET", fullPath);
          headers = {
            ...headers,
            "KALSHI-ACCESS-KEY": process.env.KALSHI_API_KEY,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
          };
        }
      } catch (e) {
        console.warn("Could not sign Kalshi request, attempting unauthenticated:", e);
      }

      const response = await fetchKalshiWithRetry(url, { headers });

      res.json(response.data);
    } catch (error: any) {
      console.error("Kalshi API Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch events",
        details: error.response?.data || error.message,
        url: url
      });
    }
  });

  // Get Markets
  app.get("/api/kalshi/markets", async (req, res) => {
    let url = "";
    try {
      const path = "/markets";
      
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (value) queryParams.append(key, value as string);
      }
      
      const fullPath = queryParams.toString() ? `${path}?${queryParams.toString()}` : path;
      url = `${KALSHI_BASE_URL}${fullPath}`;
      console.log(`Fetching from Kalshi markets: ${url}`);

      // Try to sign request if keys are available
      let headers: any = {
        "Content-Type": "application/json",
      };

      try {
        if (process.env.KALSHI_API_KEY && process.env.KALSHI_API_SECRET) {
          const { timestamp, signature } = signRequest("GET", fullPath);
          headers = {
            ...headers,
            "KALSHI-ACCESS-KEY": process.env.KALSHI_API_KEY,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
          };
        }
      } catch (e) {
        console.warn("Could not sign Kalshi request, attempting unauthenticated:", e);
      }

      const response = await fetchKalshiWithRetry(url, { headers });

      res.json(response.data);
    } catch (error: any) {
      console.error("Kalshi API Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch markets",
        details: error.response?.data || error.message,
        url: url
      });
    }
  });

  // Get Market Details
  app.get("/api/kalshi/markets/:ticker", async (req, res) => {
    let url = "";
    try {
      const { ticker } = req.params;
      const path = `/markets/${ticker}`;
      url = `${KALSHI_BASE_URL}${path}`;
      console.log(`Fetching from Kalshi: ${url}`);

      const response = await fetchKalshiWithRetry(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Kalshi API Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch market",
        details: error.response?.data || error.message,
        url: url
      });
    }
  });

  // ESPN Proxy
  app.get("/api/espn/schedule", async (req, res) => {
    try {
      const { sport, league, dateStr } = req.query;
      if (!sport || !league || !dateStr) {
        return res.status(400).json({ error: "Missing required query parameters" });
      }
      
      const cacheKey = `espn-${sport}-${league}-${dateStr}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[ESPN Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dateStr}&limit=500`;
      console.log(`[ESPN Proxy] Fetching: ${url}`);
      
      const response = await fetchWithRetry(url);
      const eventCount = response.data.events?.length || 0;
      console.log(`[ESPN Proxy] SUCCESS: Received ${eventCount} events for ${sport}/${league}`);
      
      // Cache for 5 minutes
      apiCache.set(cacheKey, response.data, 5 * 60 * 1000);
      
      res.json(response.data);
    } catch (error: any) {
      console.error(`[ESPN Proxy] Error for ${req.query.sport}/${req.query.league}:`, error.message);
      if (error.response) {
        console.error(`[ESPN Proxy] Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data).substring(0, 200));
      }
      
      // If it's a 404, we return empty events instead of an error to prevent frontend crash
      if (error.response?.status === 404) {
        return res.json({ events: [] });
      }

      res.status(error.response?.status || 500).json({
        error: "Failed to fetch ESPN schedule",
        details: error.message
      });
    }
  });

  // Simple in-memory cache for API responses
  class SimpleCache {
    private cache = new Map<string, { data: any; expires: number }>();

    get(key: string) {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expires) {
        this.cache.delete(key);
        return null;
      }
      return entry.data;
    }

    set(key: string, data: any, ttlMs: number) {
      this.cache.set(key, { data, expires: Date.now() + ttlMs });
    }

    clear() {
      this.cache.clear();
    }
  }

  const apiCache = new SimpleCache();
  // API-Sports NBA API
  const apiSportsBaseUrl = "https://v2.nba.api-sports.io";
  const apiSportsKey = process.env.API_SPORTS_KEY || "b2795a8c744b26f971aaf15eb994212e";

  app.get("/api/nba/:endpoint*", authenticate, async (req, res) => {
    try {
      const endpoint = req.params.endpoint + (req.params[0] || "");
      const queryParams = new URLSearchParams(req.query as any).toString();
      const url = `${apiSportsBaseUrl}/${endpoint}${queryParams ? `?${queryParams}` : ""}`;
      
      const cacheKey = `api-sports-${url}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      console.log(`[API-Sports] Fetching: ${url}`);
      const response = await axios.get(url, {
        headers: {
          "x-apisports-key": apiSportsKey
        },
        timeout: 30000
      });

      apiCache.set(cacheKey, response.data, 15 * 60 * 1000); // 15 min cache
      res.json(response.data);
    } catch (error: any) {
      console.error(`[API-Sports] Error fetching ${req.params.endpoint}:`, error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  app.get("/api/nba/test-connection", authenticate, async (req, res) => {
    try {
      const url = `${apiSportsBaseUrl}/status`;
      const response = await axios.get(url, {
        headers: {
          "x-apisports-key": apiSportsKey
        },
        timeout: 10000
      });
      res.json({ status: "success", data: response.data });
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ status: "error", error: error.message });
    }
  });

  // Helper for API with retry logic for rate limits and transient errors
  const fetchWithRetry = async (url: string, retries = 3, delay = 2000, timeout = 10000): Promise<any> => {
    try {
      return await axios.get(url, { timeout });
    } catch (error: any) {
      const status = error.response?.status;
      const code = error.code;
      
      // Retry on rate limit (429) or transient server errors (502, 503, 504) or network issues
      const isRetryable = status === 429 || status === 502 || status === 503 || status === 504 || 
                         code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED';

      if (isRetryable && retries > 0) {
        // Add jitter to avoid thundering herd
        const jitter = Math.random() * 1000;
        const nextDelay = delay + jitter;
        
        console.log(`[Proxy] Retryable error (${status || code}) for ${url.split('?')[0]}. Retrying in ${Math.round(nextDelay)}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return fetchWithRetry(url, retries - 1, delay * 2);
      }
      throw error;
    }
  };

// Helper for Kalshi API with retry logic for transient HTTP/network failures
const fetchKalshiWithRetry = async (
  url: string,
  options: any,
  retries = 3,
  delay = 1000
): Promise<any> => {
  try {
    return await axios.get(url, { ...options, timeout: 30000 });
  } catch (error: any) {
    const status = error?.response?.status;
    const code = error?.code;

    const isRetryable =
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNABORTED";

    if (isRetryable && retries > 0) {
      const jitter = Math.random() * 500;
      const nextDelay = delay + jitter;

      console.warn(
        `[Kalshi Proxy] Retryable error (${status || code}), retrying in ${Math.round(nextDelay)}ms... (${retries} left)`
      );

      await new Promise((resolve) => setTimeout(resolve, nextDelay));
      return fetchKalshiWithRetry(url, options, retries - 1, delay * 2);
    }

    throw error;
  }
};

// Legacy provider routes removed
app.use("/api/sportradar", authenticate, (req, res) => {
  return res.status(410).json({
    error: "Legacy API removed",
    message: "Sportradar routes have been removed. Use API-Sports instead.",
  });
});

  let vite: any;
  const distPath = path.join(__dirname, "dist");
  const distExists = fs.existsSync(distPath);
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && distExists) {
    console.log(`[SERVER] Serving static files from: ${distPath}`);
    console.log(`[SERVER] dist directory found. Contents: ${fs.readdirSync(distPath).join(", ")}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("[SERVER] Using Vite middleware for development...");
    try {
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (viteErr: any) {
      console.error("[SERVER] Failed to start Vite server:", viteErr.message);
      if (distExists) {
        console.log("[SERVER] Falling back to static files due to Vite failure");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      } else {
        throw viteErr;
      }
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down server...");
    if (vite) {
      await vite.close();
    }
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
