// Relays text messages from one Telegram group to the ceremony poster.
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (unset during setup to enable GET /chats).

const ALLOWED_ORIGINS = ["https://git.heinsoe.com", "null"]; // "null" = poster opened from file://
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const MAX_CHARS = 100; // code points after URL removal, not counting asat (်); longer messages get a reply
const ASAT = "\u103A";
const MY_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
const TOO_LONG_REPLY =
  `စာသား ရှည်လွန်းနေပါတယ်။ စာလုံး ${String(MAX_CHARS).replace(/\d/g, (d) => MY_DIGITS[d])} လုံးအတွင်း ပြန်ပို့ပေးပါ။`;

function respond(request, status, body) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  const origin = request.headers.get("Origin");
  if (origin !== null && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  if (status === 204) {
    headers["Access-Control-Allow-Methods"] = "GET";
    return new Response(null, { status, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function getUpdates(env) {
  const allowed = encodeURIComponent(JSON.stringify(["message"]));
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=-100&allowed_updates=${allowed}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.ok ? data.result : null;
}

function listChats(updates) {
  const chats = new Map();
  for (const { message } of updates) {
    if (message?.chat) {
      const { id, title, type } = message.chat;
      chats.set(id, { id, title, type });
    }
  }
  return [...chats.values()];
}

// Long messages are only reported when after > 0: the poster's first poll (after=0) is a baseline
// over history, and every later poll covers a disjoint (after, latest] window, so each message is
// replied to once per presenting poster.
function collectMessages(updates, chatId, after) {
  let latest = after;
  const messages = [];
  const tooLong = [];
  for (const update of updates) {
    latest = Math.max(latest, update.update_id);
    const message = update.message;
    if (!message || update.update_id <= after) continue;
    if (String(message.chat?.id) !== chatId) continue;
    if (typeof message.text !== "string" || message.text.startsWith("/")) continue;
    const text = message.text.replace(URL_RE, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if ([...text].filter((c) => c !== ASAT).length > MAX_CHARS) {
      if (after > 0) tooLong.push(message.message_id);
      continue;
    }
    messages.push({ id: update.update_id, text });
  }
  messages.sort((a, b) => a.id - b.id);
  return { latest, messages, tooLong };
}

async function replyTooLong(env, messageId) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: TOO_LONG_REPLY,
      reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
    }),
  });
  if (!res.ok) console.warn(`sendMessage failed: ${res.status}`);
}

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") return respond(request, 204);
      if (request.method !== "GET") return respond(request, 405, { error: "method" });

      const url = new URL(request.url);
      const chatId = env.TELEGRAM_CHAT_ID;

      if (url.pathname === "/chats") {
        if (chatId) return respond(request, 404, { error: "not found" });
        const updates = await getUpdates(env);
        if (!updates) return respond(request, 502, { error: "telegram" });
        return respond(request, 200, listChats(updates));
      }

      if (url.pathname === "/messages") {
        if (!chatId) return respond(request, 404, { error: "not found" });
        const parsed = Number.parseInt(url.searchParams.get("after") ?? "", 10);
        const after = Number.isFinite(parsed) ? parsed : 0;
        const updates = await getUpdates(env);
        if (!updates) return respond(request, 502, { error: "telegram" });
        const { latest, messages, tooLong } = collectMessages(updates, chatId, after);
        for (const id of tooLong) ctx.waitUntil(replyTooLong(env, id).catch(() => {}));
        return respond(request, 200, { latest, messages });
      }

      return respond(request, 404, { error: "not found" });
    } catch {
      return respond(request, 502, { error: "server" });
    }
  },
};
