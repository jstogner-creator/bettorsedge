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
    initializeApp({
      credential: applicationDefault(), // Or use service account if provided
      projectId: firebaseConfig.projectId,
    });
    console.log(`[FIREBASE ADMIN] Initialized with project ID: ${firebaseConfig.projectId}`);
  } catch (err: any) {
    console.warn(`[FIREBASE ADMIN] Failed to initialize with applicationDefault: ${err.message}. Falling back to basic initialization.`);
    try {
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log(`[FIREBASE ADMIN] Initialized with basic config (no credentials)`);
    } catch (e: any) {
      console.error(`[FIREBASE ADMIN] CRITICAL: Failed to initialize Firebase Admin: ${e.message}`);
    }
  }
} else {
  try {
    initializeApp();
    console.log(`[FIREBASE ADMIN] Initialized with default config`);
  } catch (e: any) {
    console.error(`[FIREBASE ADMIN] CRITICAL: Failed to initialize Firebase Admin (no config): ${e.message}`);
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
  const PORT = 3000;

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

      const response = await axios.get(url, { headers });

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

      const response = await axios.get(url, { headers });

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

      const response = await axios.get(url, {
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
  const workingConfigs = new Map<string, string>(); // Cache successful URL prefixes per API key

  const sportNameMap: Record<string, string> = {
    'sr:sport:1': 'soccer',
    'sr:sport:2': 'basketball',
    'sr:sport:3': 'baseball',
    'sr:sport:4': 'hockey',
    'sr:sport:5': 'tennis',
    'sr:sport:6': 'handball',
    'sr:sport:12': 'football',
    'sr:sport:16': 'rugby',
    'sr:sport:20': 'table-tennis',
    'sr:sport:21': 'cricket',
    'sr:sport:23': 'volleyball',
    'sr:sport:24': 'darts',
    'sr:sport:31': 'esports',
    'sr:sport:34': 'badminton',
    'sr:sport:37': 'aussie-rules',
    'sr:sport:109': 'mma'
  };

  // Helper for Sportradar API configuration
  const getSportradarConfig = (l: string) => {
    const league = l.toLowerCase();
    let version = 'v8';
    if (league === 'nhl') version = 'v7';
    if (league === 'mlb') version = 'v8';
    if (league === 'nba') version = 'v8';
    if (league === 'nfl') version = 'v7';
    
    return {
      version,
      paths: ['trial', 'production', 'official', 'premium', 'standard', 'trial-tracking', 'tracking'],
      domains: ['api.sportradar.us', 'api.sportradar.com']
    };
  };

  // Helper for API with retry logic for 429s
  const fetchWithRetry = async (url: string, retries = 3, delay = 2000): Promise<any> => {
    try {
      return await axios.get(url, { timeout: 15000 });
    } catch (error: any) {
      if (error.response?.status === 429 && retries > 0) {
        console.log(`[Proxy] Rate limited (429) for ${url.split('?')[0]}. Retrying in ${delay}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay * 2);
      }
      throw error;
    }
  };

  app.get("/api/sportradar/injuries", authenticate, async (req, res) => {
    try {
      const { league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-injuries-${league}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      const configKey = `${league}-injuries-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/injuries.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} injuries`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/injuries.json?api_key=${apiKey}`;
          console.log(`[Sportradar Proxy] Trying ${league} injuries: ${domain}/${pathType}`);
          
          try {
            const response = await fetchWithRetry(url);
            const teamCount = response.data.teams?.length || 0;
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} injuries for ${teamCount} teams (${domain}/${pathType}). Saved config.`);
            
            // Cache for 1 hour
            apiCache.set(cacheKey, response.data, 60 * 60 * 1000);
            
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403) break; // If not 403, maybe it's a real error
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} injuries:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} injuries`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/daily-summary", authenticate, async (req, res) => {
    try {
      const { year, month, day, league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const configKey = `${league}-summary-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${year}/${month}/${day}/summary.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} daily summary for ${year}-${month}-${day}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${year}/${month}/${day}/summary.json?api_key=${apiKey}`;
          
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/games/')[0];
            workingConfigs.set(configKey, prefix);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} daily summary:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} daily summary`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/daily-changelog", authenticate, async (req, res) => {
    try {
      const { year, month, day, league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-daily-changelog-${league}-${year}-${month}-${day}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      const configKey = `${league}-changelog-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/${year}/${month}/${day}/changes.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} daily changelog for ${year}-${month}-${day}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          // Pattern: https://api.sportradar.com/nba/{access_level}/v8/{language_code}/league/{year}/{month}/{day}/changes.{format}
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/${year}/${month}/${day}/changes.json?api_key=${apiKey}`;
          
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} daily changelog (${domain}/${pathType}/${version}). Saved config.`);
            
            // Cache for 15 minutes
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} daily changelog:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} daily changelog`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/daily-injuries", authenticate, async (req, res) => {
    try {
      const { year, month, day, league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-daily-injuries-${league}-${year}-${month}-${day}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      const configKey = `${league}-injuries-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/${year}/${month}/${day}/daily_injuries.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} daily injuries for ${year}-${month}-${day}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          // Pattern 1: {domain}/{league}/{pathType}/{version}/en/league/{year}/{month}/{day}/daily_injuries.json
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/${year}/${month}/${day}/daily_injuries.json?api_key=${apiKey}`;
          
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} daily injuries (${domain}/${pathType}/${version}). Saved config.`);
            
            // Cache for 15 minutes
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }

      // Last ditch fallback: try without "league" in path if it's a different API structure
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/${year}/${month}/${day}/daily_injuries.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} daily injuries (last-ditch: ${domain}/${pathType}/${version})`);
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} daily injuries:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} daily injuries`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/schedule", authenticate, async (req, res) => {
    try {
      const { year, month, day, league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-schedule-${league}-${year}-${month}-${day}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      const configKey = `${league}-schedule-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      const preferredVersion = version;
      const versions = [preferredVersion, 'v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2', 'v9'].filter((v, i, a) => a.indexOf(v) === i);
      
      console.log(`[Sportradar Proxy] Fetching ${league} schedule for ${year}-${month}-${day}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          for (const v of versions) {
            const url = `https://${domain}/${league}/${pathType}/${v}/en/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`;
            
            try {
              const response = await fetchWithRetry(url);
              const gameCount = response.data.games?.length || 0;
              const prefix = url.split('/games/')[0];
              workingConfigs.set(configKey, prefix);
              console.log(`[Sportradar Proxy] SUCCESS: Received ${league} schedule with ${gameCount} games (${domain}/${pathType}/${v}). Saved config.`);
              
              // Cache for 15 minutes
              apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
              
              return res.json(response.data);
            } catch (error: any) {
              lastError = error;
              if (error.response?.status === 403 || error.response?.status === 404) continue;
              break; // If it's a 429 or other real error, stop and handle it
            }
          }
        }
      }

      // Last ditch for schedule: try without pathType or with different structure
      for (const domain of domains) {
        for (const v of versions) {
          const url = `https://${domain}/${league}/${v}/en/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            console.log(`[Sportradar Proxy] SUCCESS with last-ditch ${domain}/${league}/${v} schedule!`);
            return res.json(response.data);
          } catch (e) {}
        }
      }

      if (lastError) throw lastError;
      return res.status(404).json({ error: 'No schedule found after all fallbacks' });
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} schedule:`, error.message);
      if (error.response) {
        console.error(`[Sportradar Proxy] Status: ${error.response.status}, Data:`, JSON.stringify(error.response.data).substring(0, 200));
      }
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} schedule`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/summary", authenticate, async (req, res) => {
    try {
      const { gameId, league = 'nba' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const configKey = `${league}-summary-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${gameId}/summary.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} summary for game: ${gameId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${gameId}/summary.json?api_key=${apiKey}`;
          console.log(`[Sportradar Proxy] Trying ${league} summary: ${domain}/${pathType}`);
          
          try {
            const response = await fetchWithRetry(url);
            const hasLineups = !!(response.data.home?.players && response.data.away?.players);
            const prefix = url.split('/games/')[0];
            workingConfigs.set(configKey, prefix);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} summary (${domain}/${pathType}). Lineups available: ${hasLineups}. Saved config.`);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403) break;
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'nba'} summary for ${req.query.gameId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'nba'} summary`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/head-to-head", authenticate, async (req, res) => {
    try {
      const { teamId1, teamId2, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const configKey = `${league}-h2h-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/teams/${teamId1}/versus/${teamId2}/matches.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} head-to-head: ${teamId1} vs ${teamId2}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/teams/${teamId1}/versus/${teamId2}/matches.json?api_key=${apiKey}`;
          console.log(`[Sportradar Proxy] Trying ${league} head-to-head: ${domain}/${pathType}`);
          
          try {
            const response = await fetchWithRetry(url);
            const matchCount = response.data.last_meetings?.length || 0;
            const prefix = url.split('/teams/')[0];
            workingConfigs.set(configKey, prefix);
            console.log(`[Sportradar Proxy] SUCCESS: Received ${league} head-to-head with ${matchCount} matches (${domain}/${pathType}). Saved config.`);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403) break;
          }
        }
      }

      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} head-to-head:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} head-to-head`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/daily-boxscore", authenticate, async (req, res) => {
    try {
      const { year, month, day, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-daily-boxscore-${league}-${year}-${month}-${day}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-boxscore-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${year}/${month}/${day}/boxscore.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} daily boxscore for ${year}-${month}-${day}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${year}/${month}/${day}/boxscore.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/games/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} daily boxscore:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} daily boxscore`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/pbp", authenticate, async (req, res) => {
    try {
      const { gameId, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-pbp-${league}-${gameId}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-pbp-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${gameId}/pbp.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} pbp for game: ${gameId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${gameId}/pbp.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/games/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} pbp for ${req.query.gameId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} pbp`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/standings", authenticate, async (req, res) => {
    try {
      const { year, league = 'mlb', season_type = 'reg' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-standings-${league}-${year}-${season_type}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-standings-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/standings.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} standings`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/standings.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} standings:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} standings`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/hierarchy", authenticate, async (req, res) => {
    try {
      const { league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-hierarchy-${league}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-hierarchy-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/hierarchy.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} hierarchy`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/hierarchy.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} hierarchy:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} hierarchy`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/team-profile", authenticate, async (req, res) => {
    try {
      const { teamId, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-team-profile-${league}-${teamId}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-team-profile-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/teams/${teamId}/profile.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} team profile for ${teamId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/teams/${teamId}/profile.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/teams/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} team profile for ${req.query.teamId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} team profile`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/player-profile", authenticate, async (req, res) => {
    try {
      const { playerId, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-player-profile-${league}-${playerId}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-player-profile-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/players/${playerId}/profile.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} player profile for ${playerId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/players/${playerId}/profile.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/players/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} player profile for ${req.query.playerId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} player profile`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/game-boxscore", authenticate, async (req, res) => {
    try {
      const { gameId, league = 'mlb' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-game-boxscore-${league}-${gameId}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-boxscore-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/games/${gameId}/boxscore.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} game boxscore for ${gameId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/games/${gameId}/boxscore.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/games/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} game boxscore for ${req.query.gameId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} game boxscore`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/seasonal-splits", authenticate, async (req, res) => {
    try {
      const { teamId, year, league = 'mlb', season_type = 'reg' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-seasonal-splits-${league}-${teamId}-${year}-${season_type}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-splits-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/teams/${teamId}/${year}/${season_type}/splits.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} seasonal splits for ${teamId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/teams/${teamId}/${year}/${season_type}/splits.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/teams/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} seasonal splits for ${req.query.teamId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} seasonal splits`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/seasonal-stats", authenticate, async (req, res) => {
    try {
      const { teamId, year, league = 'mlb', season_type = 'reg' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-seasonal-stats-${league}-${teamId}-${year}-${season_type}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-stats-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/teams/${teamId}/${year}/${season_type}/statistics.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} seasonal stats for ${teamId}`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/teams/${teamId}/${year}/${season_type}/statistics.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/teams/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} seasonal stats for ${req.query.teamId}:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} seasonal stats`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/league-leaders", authenticate, async (req, res) => {
    try {
      const { year, league = 'mlb', season_type = 'reg' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const cacheKey = `sr-league-leaders-${league}-${year}-${season_type}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) return res.json(cachedData);

      const configKey = `${league}-leaders-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      if (workingPrefix) {
        try {
          const url = `${workingPrefix}/league/${year}/${season_type}/leaders.json?api_key=${apiKey}`;
          const response = await fetchWithRetry(url);
          apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
          return res.json(response.data);
        } catch (e) {
          workingConfigs.delete(configKey);
        }
      }

      const { version, paths, domains } = getSportradarConfig(league as string);
      console.log(`[Sportradar Proxy] Fetching ${league} league leaders`);
      
      let lastError;
      for (const domain of domains) {
        for (const pathType of paths) {
          const url = `https://${domain}/${league}/${pathType}/${version}/en/league/${year}/${season_type}/leaders.json?api_key=${apiKey}`;
          try {
            const response = await fetchWithRetry(url);
            const prefix = url.split('/league/')[0];
            workingConfigs.set(configKey, prefix);
            apiCache.set(cacheKey, response.data, 24 * 60 * 60 * 1000);
            return res.json(response.data);
          } catch (error: any) {
            lastError = error;
            if (error.response?.status !== 403 && error.response?.status !== 404) break;
          }
        }
      }
      throw lastError;
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching ${req.query.league || 'mlb'} league leaders:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar ${req.query.league || 'mlb'} league leaders`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/odds", authenticate, async (req, res) => {
    try {
      const { sportId = 'sr:sport:2', eventId, date, type = 'schedule' } = req.query;
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });
      
      const cacheKey = `sr-odds-${type}-${sportId}-${eventId || ''}-${date || ''}`;
      const cachedData = apiCache.get(cacheKey);
      if (cachedData) {
        console.log(`[Sportradar Proxy] Cache HIT for ${cacheKey}`);
        return res.json(cachedData);
      }

      // Log key prefix for debugging (safe)
      console.log(`[Sportradar Proxy] Using API Key starting with: ${apiKey.substring(0, 4)}...`);

      // Check for working config
      const configKey = `odds-${apiKey.substring(0, 8)}`;
      const workingPrefix = workingConfigs.get(configKey);
      
      let url = "";
      if (workingPrefix) {
        if (type === 'books') url = `${workingPrefix}/additional/books.json?api_key=${apiKey}`;
        else if (type === 'markets' && eventId) url = `${workingPrefix}/sport_events/${eventId}/markets.json?api_key=${apiKey}`;
        else if (type === 'odds' && eventId) url = `${workingPrefix}/sport_events/${eventId}/odds.json?api_key=${apiKey}`;
        else if (date) url = `${workingPrefix}/sports/${sportId}/daily_schedule/${date}.json?api_key=${apiKey}`;
        else url = `${workingPrefix}/sports/${sportId}/schedule.json?api_key=${apiKey}`;
      } else {
        if (type === 'markets' && eventId) {
          url = `https://api.sportradar.us/oddscomparison-row1/trial/v2/en/sport_events/${eventId}/markets.json?api_key=${apiKey}`;
        } else if (type === 'odds' && eventId) {
          url = `https://api.sportradar.us/oddscomparison-row1/trial/v2/en/sport_events/${eventId}/odds.json?api_key=${apiKey}`;
        } else if (type === 'books') {
          url = `https://api.sportradar.us/oddscomparison-row1/trial/v2/en/additional/books.json?api_key=${apiKey}`;
        } else if (date) {
          url = `https://api.sportradar.us/oddscomparison-row1/trial/v2/en/sports/${sportId}/daily_schedule/${date}.json?api_key=${apiKey}`;
        } else {
          url = `https://api.sportradar.us/oddscomparison-row1/trial/v2/en/sports/${sportId}/schedule.json?api_key=${apiKey}`;
        }
      }

      console.log(`[Sportradar Proxy] Fetching ${type}: ${url.replace(apiKey, 'REDACTED')}`);
      let response;
      try {
        response = await fetchWithRetry(url);
        
        // If it worked and we didn't have a working prefix, save it
        if (!workingPrefix) {
          const prefix = url.split('/en/')[0] + '/en';
          workingConfigs.set(configKey, prefix);
        }

        // Cache for 15 minutes
        apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
        
        return res.json(response.data);
      } catch (error: any) {
        // If cached config failed, clear it and try full search
        if (workingPrefix) {
          console.log(`[Sportradar Proxy] Cached config failed, trying full search...`);
          workingConfigs.delete(configKey);
          // Recursively call to try full search
          return res.redirect(req.originalUrl);
        }

      // Quick fallbacks before full search
      if (error.response?.status === 403) {
        const domains = ['api.sportradar.us', 'api.sportradar.com'];
        const products = [
          'oddscomparison-us1', 'oddscomparison-row1', 'oddscomparison-global', 'oddscomparison-m1',
          'odds-comparison-us1', 'odds-comparison-row1', 'odds-comparison-global',
          'odds-us1', 'odds-row1', 'odds-global', 'odds-m1'
        ];
        const versions = ['v3', 'v2', 'v1', 'v4', 'v8'];
        const pathTypes = ['trial', 'production', 'official', 'premium'];

        console.log(`[Sportradar Proxy] Quick fallback search starting...`);
        for (const domain of domains) {
          for (const product of products) {
            for (const v of versions) {
              for (const pathType of pathTypes) {
                let testUrl = "";
                if (type === 'books') testUrl = `https://${domain}/${product}/${pathType}/${v}/en/additional/books.json?api_key=${apiKey}`;
                else if (type === 'markets' && eventId) testUrl = `https://${domain}/${product}/${pathType}/${v}/en/sport_events/${eventId}/markets.json?api_key=${apiKey}`;
                else if (type === 'odds' && eventId) testUrl = `https://${domain}/${product}/${pathType}/${v}/en/sport_events/${eventId}/odds.json?api_key=${apiKey}`;
                else if (date) testUrl = `https://${domain}/${product}/${pathType}/${v}/en/sports/${sportId}/daily_schedule/${date}.json?api_key=${apiKey}`;
                else testUrl = `https://${domain}/${product}/${pathType}/${v}/en/sports/${sportId}/schedule.json?api_key=${apiKey}`;

                try {
                  console.log(`[Sportradar Proxy] Trying quick fallback: ${domain}/${product}/${pathType}/${v}`);
                  response = await fetchWithRetry(testUrl, 0);
                  const prefix = testUrl.split('/en/')[0] + '/en';
                  workingConfigs.set(configKey, prefix);
                  apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
                  return res.json(response.data);
                } catch (e) {
                  // Try without "additional" for books if it fails
                  if (type === 'books') {
                    try {
                      const altUrl = `https://${domain}/${product}/${pathType}/${v}/en/books.json?api_key=${apiKey}`;
                      response = await fetchWithRetry(altUrl, 0);
                      const prefix = altUrl.split('/en/')[0] + '/en';
                      workingConfigs.set(configKey, prefix);
                      apiCache.set(cacheKey, response.data, 15 * 60 * 1000);
                      return res.json(response.data);
                    } catch (e2) {}
                  }
                }
              }
            }
          }
        }
        console.log(`[Sportradar Proxy] Quick fallbacks failed, proceeding to full fallback search...`);
      }

      // If 403, try other endpoints, domains, and versions
      if (error.response?.status === 403) {
        const domains = ['api.sportradar.us', 'api.sportradar.com'];
        const products = [
          'oddscomparison-us1', 'oddscomparison-row1', 'oddscomparison-global', 'oddscomparison-m1',
          'odds-comparison-us1', 'odds-comparison-row1', 'odds-comparison-global',
          'odds-us1', 'odds-row1', 'odds-global', 'odds-m1',
          'oddscomparison-us2', 'oddscomparison-row2', 'oddscomparison-global2',
          'oddscomparison-us', 'oddscomparison-row', 'oddscomparison-global',
          'odds-us', 'odds-row', 'odds-global',
          'oddscomparison', 'odds', 'odds-comparison',
          'sport-event-odds', 'sport-event-odds-us1', 'sport-event-odds-row1',
          'sport-event-odds-global', 'sport-event-odds-m1',
          'liveodds-us1', 'liveodds-row1', 'liveodds-global', 'liveodds-m1',
          'live-odds-us1', 'live-odds-row1', 'live-odds-global',
          'nba-odds', 'mlb-odds', 'nfl-odds', 'nhl-odds', 'soccer-odds',
          'basketball-odds', 'baseball-odds', 'football-odds', 'hockey-odds',
          'us-odds', 'row-odds', 'global-odds', 'm1-odds',
          'odds-comparison-v2', 'odds-comparison-v3', 'odds-v2', 'odds-v3'
        ];
        const pathTypes = ['trial', 'production', 'official', 'premium', 'standard', 'trial-tracking', 'tracking'];
        const versions = ['v2', 'v3', 'v1', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9'];
        const sIdStr = String(sportId);
        const sportIds = [sIdStr, sIdStr.replace('sr:sport:', ''), sIdStr.split(':').pop() || ''];
        
        // Add sport names to search
        const sportName = sportNameMap[sIdStr];
        if (sportName) sportIds.push(sportName);

        let lastError = error;
          let count = 0;
          const maxAttempts = 3000; // Increased from 2000 to allow even deeper search
          
          outer: for (const domain of domains) {
            for (const product of products) {
              for (const v of versions) {
                for (const pathType of pathTypes) {
                  for (const sId of sportIds) {
                    if (count++ > maxAttempts) break outer;
                    if (count % 250 === 0) console.log(`[Sportradar Proxy] Fallback search progress: ${count} attempts...`);

                    let nextUrls = [];
                    if (type === 'books') {
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/additional/books.json?api_key=${apiKey}`);
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/books.json?api_key=${apiKey}`);
                    } else if (type === 'markets' && eventId) {
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/sport_events/${eventId}/markets.json?api_key=${apiKey}`);
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/events/${eventId}/markets.json?api_key=${apiKey}`);
                    } else if (type === 'odds' && eventId) {
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/sport_events/${eventId}/odds.json?api_key=${apiKey}`);
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/events/${eventId}/odds.json?api_key=${apiKey}`);
                    } else if (date) {
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/sports/${sId}/daily_schedule/${date}.json?api_key=${apiKey}`);
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/schedules/${date}/schedule.json?api_key=${apiKey}`);
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/sports/${sId}/schedules/${date}/schedule.json?api_key=${apiKey}`);
                    } else {
                      nextUrls.push(`https://${domain}/${product}/${pathType}/${v}/en/sports/${sId}/schedule.json?api_key=${apiKey}`);
                    }
                    
                    for (const nextUrl of nextUrls) {
                      try {
                        response = await fetchWithRetry(nextUrl, 0); // No retries during fallback search
                        const prefix = nextUrl.split('/en/')[0] + '/en';
                        workingConfigs.set(configKey, prefix);
                        console.log(`[Sportradar Proxy] SUCCESS with ${nextUrl.replace(apiKey, 'REDACTED')} fallback! Saved config.`);
                        break outer;
                      } catch (nextErr: any) {
                        lastError = nextErr;
                        // Continue to next pattern or next iteration
                      }
                    }
                  }
                }
              }
            }
            
            // Pattern 2: {domain}/{product}-{version}/en/...
            for (const product of products) {
              for (const v of versions) {
                for (const sId of sportIds) {
                  if (count++ > maxAttempts) break outer;
                  if (count % 100 === 0) console.log(`[Sportradar Proxy] Fallback search progress: ${count} attempts...`);

                  let nextUrl;
                  if (type === 'books') {
                    nextUrl = `https://${domain}/${product}-${v}/en/additional/books.json?api_key=${apiKey}`;
                  } else if (type === 'markets' && eventId) {
                    nextUrl = `https://${domain}/${product}-${v}/en/sport_events/${eventId}/markets.json?api_key=${apiKey}`;
                  } else if (type === 'odds' && eventId) {
                    nextUrl = `https://${domain}/${product}-${v}/en/sport_events/${eventId}/odds.json?api_key=${apiKey}`;
                  } else if (date) {
                    nextUrl = `https://${domain}/${product}-${v}/en/sports/${sId}/daily_schedule/${date}.json?api_key=${apiKey}`;
                  } else {
                    nextUrl = `https://${domain}/${product}-${v}/en/sports/${sId}/schedule.json?api_key=${apiKey}`;
                  }
                  
                  try {
                    response = await fetchWithRetry(nextUrl, 0);
                    const prefix = nextUrl.split('/en/')[0] + '/en';
                    workingConfigs.set(configKey, prefix);
                    console.log(`[Sportradar Proxy] SUCCESS with ${domain}/${product}-${v}/${sId} fallback! Saved config.`);
                    break outer;
                  } catch (nextErr: any) {
                    // Try "events" instead of "sport_events"
                    if (type === 'markets' || type === 'odds') {
                      const altUrl = nextUrl.replace('/sport_events/', '/events/');
                      try {
                        response = await fetchWithRetry(altUrl, 0);
                        const prefix = altUrl.split('/en/')[0] + '/en';
                        workingConfigs.set(configKey, prefix);
                        console.log(`[Sportradar Proxy] SUCCESS with ${domain}/${product}-${v}/${sId} (events) fallback! Saved config.`);
                        break outer;
                      } catch (e) {}
                    }
                    lastError = nextErr;
                    if (nextErr.response?.status !== 403 && nextErr.response?.status !== 404) break;
                  }
                }
              }
            }
          }
          
          if (!response) {
            console.error(`[Sportradar Proxy] ALL fallbacks failed for ${type}. Final error: ${lastError.message}`);
            throw lastError;
          }
        } else {
          throw error;
        }
      }
      
      if (response.data && response.data.sport_events) {
        console.log(`[Sportradar Proxy] SUCCESS: Received ${response.data.sport_events.length} events for ${sportId}`);
      } else {
        console.log(`[Sportradar Proxy] WARNING: No events found in response for ${sportId}`);
      }
      
      res.json(response.data);
    } catch (error: any) {
      console.error(`[Sportradar Proxy] ERROR fetching odds:`, error.message);
      res.status(error.response?.status || 500).json({
        error: `Failed to fetch Sportradar odds`,
        details: error.message
      });
    }
  });

  app.get("/api/sportradar/test-connection", authenticate, async (req, res) => {
    try {
      const apiKey = process.env.SPORTRADAR_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Sportradar API key not configured" });

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const results: any = {};
      
      // Test 1: NBA Injuries (Standard NBA Trial/Production)
      const nbaPaths = ['trial', 'production', 'official', 'premium', 'standard'];
      let nbaSuccess = false;
      for (const domain of ['api.sportradar.us', 'api.sportradar.com']) {
        if (nbaSuccess) break;
        for (const pathType of nbaPaths) {
          if (nbaSuccess) break;
          try {
            const nbaUrl = `https://${domain}/nba/${pathType}/v8/en/league/injuries.json?api_key=${apiKey}`;
            await axios.get(nbaUrl, { timeout: 10000 });
            results.nba = { status: 'success', domain, path: pathType };
            nbaSuccess = true;
            const prefix = nbaUrl.split('/league/')[0];
            workingConfigs.set(`nba-injuries-${apiKey.substring(0, 8)}`, prefix);
          } catch (err: any) {
            results.nba = { status: 'failed', error: err.message, code: err.response?.status, lastPath: pathType };
          }
        }
      }

      // Test 2: Odds Comparison Books (Try multiple regions, versions, and paths)
      const oddsEndpoints = [
        'oddscomparison-us1', 'oddscomparison-row1', 'oddscomparison-global', 'oddscomparison-m1',
        'odds-comparison-us1', 'odds-comparison-row1', 'odds-comparison-global',
        'odds-us1', 'odds-row1', 'odds-global', 'odds-m1',
        'oddscomparison-us2', 'oddscomparison-row2', 'oddscomparison-global2',
        'oddscomparison-us', 'oddscomparison-row', 'oddscomparison-global',
        'odds-us', 'odds-row', 'odds-global',
        'oddscomparison', 'odds', 'odds-comparison',
        'sport-event-odds', 'sport-event-odds-us1', 'sport-event-odds-row1',
        'sport-event-odds-global', 'sport-event-odds-m1',
        'liveodds-us1', 'liveodds-row1', 'liveodds-global', 'liveodds-m1',
        'live-odds-us1', 'live-odds-row1', 'live-odds-global'
      ];
      const oddsVersions = ['v2', 'v3', 'v1', 'v4', 'v5', 'v8', 'v9'];
      
      let oddsSuccess = false;
      for (const domain of ['api.sportradar.us', 'api.sportradar.com']) {
        if (oddsSuccess) break;
        for (const region of oddsEndpoints) {
          if (oddsSuccess) break;
          for (const version of oddsVersions) {
            if (oddsSuccess) break;
            for (const pathType of nbaPaths) {
              if (oddsSuccess) break;
              try {
                const oddsUrl = `https://${domain}/${region}/${pathType}/${version}/en/books.json?api_key=${apiKey}`;
                await axios.get(oddsUrl, { timeout: 10000 });
                results.odds = { status: 'success', domain, region, version, path: pathType };
                oddsSuccess = true;
                const prefix = oddsUrl.split('/en/')[0] + '/en';
                workingConfigs.set(`odds-${apiKey.substring(0, 8)}`, prefix);
              } catch (err: any) {
                // Try without "additional" if it fails
                try {
                  const oddsUrlAlt = `https://${domain}/${region}/${pathType}/${version}/en/additional/books.json?api_key=${apiKey}`;
                  await axios.get(oddsUrlAlt, { timeout: 10000 });
                  results.odds = { status: 'success', domain, region, version, path: pathType, alt: 'additional' };
                  oddsSuccess = true;
                  const prefix = oddsUrlAlt.split('/en/')[0] + '/en';
                  workingConfigs.set(`odds-${apiKey.substring(0, 8)}`, prefix);
                } catch (e) {
                  results.odds = { status: 'failed', error: err.message, code: err.response?.status, lastRegion: region, lastVersion: version, lastPath: pathType };
                }
              }
            }
          }
        }
      }

      // Test 3: NBA Schedule (Try multiple paths)
      let scheduleSuccess = false;
      let sampleGameId = '';
      for (const domain of ['api.sportradar.us', 'api.sportradar.com']) {
        if (scheduleSuccess) break;
        for (const pathType of nbaPaths) {
          if (scheduleSuccess) break;
          try {
            const scheduleUrl = `https://${domain}/nba/${pathType}/v8/en/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`;
            const scheduleResp = await axios.get(scheduleUrl, { timeout: 10000 });
            results.schedule = { status: 'success', domain, path: pathType };
            scheduleSuccess = true;
            if (scheduleResp.data?.games?.length > 0) {
              sampleGameId = scheduleResp.data.games[0].id;
            }
            const prefix = scheduleUrl.split('/games/')[0];
            workingConfigs.set(`nba-schedule-${apiKey.substring(0, 8)}`, prefix);
          } catch (err: any) {
            results.schedule = { status: 'failed', error: err.message, code: err.response?.status, lastPath: pathType };
          }
        }
      }

      // Test 4: Odds Markets & Odds (if game ID found)
      if (sampleGameId) {
        results.eventOdds = { gameId: sampleGameId };
        try {
          // Try markets
          const marketsUrl = `https://api.sportradar.us/oddscomparison-us1/trial/v2/en/sport_events/${sampleGameId}/markets.json?api_key=${apiKey}`;
          await axios.get(marketsUrl, { timeout: 5000 });
          results.eventOdds.markets = 'success';
        } catch (err: any) {
          results.eventOdds.markets = `failed (${err.response?.status || 'ERR'})`;
        }
        
        try {
          // Try odds
          const oddsUrl = `https://api.sportradar.us/oddscomparison-us1/trial/v2/en/sport_events/${sampleGameId}/odds.json?api_key=${apiKey}`;
          await axios.get(oddsUrl, { timeout: 5000 });
          results.eventOdds.odds = 'success';
        } catch (err: any) {
          results.eventOdds.odds = `failed (${err.response?.status || 'ERR'})`;
        }
      }

      // Test 4: Other Sports (Quick check for key type)
      const otherSports = [
        { name: 'nfl', url: `https://api.sportradar.us/nfl/official/trial/v7/en/league/hierarchy.json?api_key=${apiKey}` },
        { name: 'nhl', url: `https://api.sportradar.us/nhl/trial/v4/en/league/hierarchy.json?api_key=${apiKey}` },
        { name: 'mlb', url: `https://api.sportradar.us/mlb/trial/v8/en/league/hierarchy.json?api_key=${apiKey}` },
        { name: 'soccer', url: `https://api.sportradar.us/soccer-t3/global/trial/v4/en/leagues.json?api_key=${apiKey}` }
      ];

      results.otherSports = {};
      for (const sport of otherSports) {
        try {
          await axios.get(sport.url, { timeout: 5000 });
          results.otherSports[sport.name] = 'success';
        } catch (err: any) {
          results.otherSports[sport.name] = err.response?.status || 'failed';
        }
      }

      // Test 5: Daily Injuries
      try {
        const injuriesUrl = `https://api.sportradar.us/nba/trial/v8/en/league/${year}/${month}/${day}/daily_injuries.json?api_key=${apiKey}`;
        await axios.get(injuriesUrl, { timeout: 10000 });
        results.dailyInjuries = { status: 'success' };
      } catch (err: any) {
        results.dailyInjuries = { status: 'failed', code: err.response?.status || 'ERR' };
      }

      // Test 6: Daily Changelog
      try {
        const changelogUrl = `https://api.sportradar.us/nba/trial/v8/en/league/${year}/${month}/${day}/changes.json?api_key=${apiKey}`;
        await axios.get(changelogUrl, { timeout: 10000 });
        results.dailyChangelog = { status: 'success' };
      } catch (err: any) {
        results.dailyChangelog = { status: 'failed', code: err.response?.status || 'ERR' };
      }

      // Test 7: MLB Specific Endpoints
      results.mlbSpecific = {};
      const mlbTests = [
        { name: 'standings', url: `https://api.sportradar.us/mlb/trial/v8/en/league/standings.json?api_key=${apiKey}` },
        { name: 'hierarchy', url: `https://api.sportradar.us/mlb/trial/v8/en/league/hierarchy.json?api_key=${apiKey}` },
        { name: 'boxscore', url: `https://api.sportradar.us/mlb/trial/v8/en/games/${year}/${month}/${day}/boxscore.json?api_key=${apiKey}` }
      ];

      for (const test of mlbTests) {
        try {
          await axios.get(test.url, { timeout: 5000 });
          results.mlbSpecific[test.name] = 'success';
        } catch (err: any) {
          results.mlbSpecific[test.name] = err.response?.status || 'failed';
        }
      }

      // Key verification
      const keyInfo = {
        length: apiKey.length,
        hasWhitespace: /\s/.test(apiKey),
        isAlphanumeric: /^[a-z0-9]+$/i.test(apiKey),
        prefix: apiKey.substring(0, 4),
        suffix: apiKey.substring(apiKey.length - 4)
      };

      res.json({
        keyInfo,
        results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
