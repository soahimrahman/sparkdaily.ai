import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

app.use((req, _res, next) => {
  console.log(`➡️ ${req.method} ${req.url}`);
  next();
});

console.log("OpenRouter key loaded?", Boolean(process.env.OPENROUTER_API_KEY));
console.log("Gemini key loaded?", Boolean(process.env.GEMINI_API_KEY));
console.log("Groq key loaded?", Boolean(process.env.GROQ_API_KEY));

app.get("/health", (_req, res) => res.json({ ok: true }));

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Build OpenAI-style messages from your UI history
function buildMessages({ message, history }) {
  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

  const system = {
    role: "system",
    content:
      "You are a friendly, human-like assistant similar to ChatGPT. Speak naturally. Do not mention being an AI unless asked directly. Keep replies short in casual chat, and be structured when planning or productivity help is requested."
  };

  const hist = safeHistory.map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    content: String(m.text || "")
  }));

  return [system, ...hist, { role: "user", content: message }];
}

// Call OpenRouter (OpenAI compatible)
async function callOpenRouter({ model, messages }) {
  const res = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Daily Routine AI"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 450
      })
    },
    12000
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${data?.error?.message || "Unknown error"}`);

  return data?.choices?.[0]?.message?.content || "No reply.";
}

// Call Groq (OpenAI compatible endpoint)
async function callGroq({ model, messages }) {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.9,
        max_tokens: 450
      })
    },
    12000
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Groq ${res.status}: ${data?.error?.message || "Unknown error"}`);

  return data?.choices?.[0]?.message?.content || "No reply.";
}

// Call Gemini (REST, no package install)
async function callGemini({ model, messages }) {
  // Convert OpenAI-style messages into a single prompt (simple + reliable)
  const prompt = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 450
        }
      })
    },
    12000
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message || "Unknown error"}`);

  const reply =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ||
    "No reply.";

  return reply;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, provider, model } = req.body || {};
    if (!message) return res.status(400).json({ reply: "No message received." });

    const messages = buildMessages({ message, history });

    const prov = (provider || "openrouter").toLowerCase();

    let reply = "No reply.";
    if (prov === "openrouter") {
      if (!process.env.OPENROUTER_API_KEY) throw new Error("Missing OPENROUTER_API_KEY");
      reply = await callOpenRouter({ model: model || "meta-llama/llama-3.1-8b-instruct", messages });
    } else if (prov === "groq") {
      if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");
      // Common Groq models: llama-3.1-8b-instant, llama-3.1-70b-versatile, mixtral-8x7b-32768
      reply = await callGroq({ model: model || "llama-3.1-8b-instant", messages });
    } else if (prov === "gemini") {
      if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
      // Common Gemini models: gemini-1.5-flash, gemini-1.5-pro
      reply = await callGemini({ model: model || "gemini-1.5-flash", messages });
    } else {
      return res.status(400).json({ reply: "Unknown provider." });
    }

    res.json({ reply });

  } catch (err) {
    console.error("Provider error:", err?.message || err);
    res.status(500).json({ reply: "Server error calling AI provider. Check backend console." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running: http://localhost:${PORT}`));
