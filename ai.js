/* ai.js — Daily Routine AI (ChatGPT-like)
   - Single sidebar toggle (☰) only
   - Sidebar NEVER auto-closes (only toggles when you click ☰)
   - Profile menu opens next to profile
   - New chat does NOT create history until first message is sent
   - Temporary chat is isolated (not saved)
   - Provider dropdown: Auto / OpenRouter / Gemini / Groq
   - Attach button supports many file types:
       * Image files show preview
       * Non-images show a file chip (no preview)
   - 1 message -> 1 response (locks input while waiting)
*/

const LS_KEY = "drt_chat_v5";

// ---------- Elements ----------
const appEl = document.getElementById("app");

const sidebar = document.getElementById("sidebar");
const openSidebarBtn = document.getElementById("openSidebarBtn"); // ☰ only

const chatListEl = document.getElementById("chatList");
const messagesEl = document.getElementById("messages");
const activeChatTitleEl = document.getElementById("activeChatTitle");
const activeChatSubEl = document.getElementById("activeChatSub");

const newChatBtn = document.getElementById("newChatBtn");
const searchToggleBtn = document.getElementById("searchToggleBtn");
const searchWrap = document.getElementById("searchWrap");
const searchInput = document.getElementById("searchInput");

const typingEl = document.getElementById("typing");
const tempChatToggle = document.getElementById("tempChatToggle");

const providerSelect = document.getElementById("modelSelect");

const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("imageInput"); // now supports multiple formats
const imgPreview = document.getElementById("imgPreview");
const imgPreviewImg = document.getElementById("imgPreviewImg");
const removeImgBtn = document.getElementById("removeImgBtn");

const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

const profileBtn = document.getElementById("profileBtn");
const profileMenu = document.getElementById("profileMenu");
const menuSettings = document.getElementById("menuSettings");
const menuCustomize = document.getElementById("menuCustomize");
const menuHelp = document.getElementById("menuHelp");

const chatItemMenu = document.getElementById("chatItemMenu");
const menuPin = document.getElementById("menuPin");
const menuUnpin = document.getElementById("menuUnpin");
const menuDelete = document.getElementById("menuDelete");

const chatHeaderMenuBtn = document.getElementById("chatHeaderMenuBtn");
const chatHeaderMenu = document.getElementById("chatHeaderMenu");
const hdrRename = document.getElementById("hdrRename");
const hdrClear = document.getElementById("hdrClear");
const hdrExport = document.getElementById("hdrExport");

// ---------- Providers (your 3 models/providers) ----------
const PROVIDERS = [
  { id: "auto", name: "Auto (recommended)" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "gemini", name: "Gemini" },
  { id: "groq", name: "Groq" },
];

// ---------- Runtime state ----------
let isWaiting = false;

// Attachments
let attached = null; // {name,type,size,dataUrl?,isImage}
let menuChatId = null;

// Draft chat (not saved until first send)
let draftChat = null;

// Temporary chat (never saved)
let tempChat = null;

// ---------- Utils ----------
function ts() { return Date.now(); }
function newId() { return "c_" + Math.random().toString(16).slice(2) + Date.now().toString(16); }
function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}
function showTyping(on) {
  typingEl.classList.toggle("hidden", !on);
}

// ---------- Storage ----------
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveState(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

let state = loadState();
if (!state) {
  const id = newId();
  state = {
    activeId: id,
    provider: "auto",
    chats: [{
      id,
      title: "New chat",
      pinned: false,
      createdAt: ts(),
      updatedAt: ts(),
      messages: [{
        role: "assistant",
        text: "Hi! What’s on the agenda today?",
        at: ts(),
        provider: "auto"
      }]
    }]
  };
  saveState(state);
}

// ---------- Sidebar toggle (ONE button only) ----------
function toggleSidebar() {
  appEl.classList.toggle("collapsed");
}
openSidebarBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleSidebar();
});

// ---------- Click outside: close menus (NOT sidebar) ----------
document.addEventListener("click", () => {
  profileMenu.classList.add("hidden");
  chatItemMenu.classList.add("hidden");
  chatHeaderMenu.classList.add("hidden");
});

// ---------- Provider select ----------
function fillProviderSelect() {
  providerSelect.innerHTML = "";
  for (const p of PROVIDERS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    providerSelect.appendChild(opt);
  }
  providerSelect.value = state.provider || "auto";
}
providerSelect?.addEventListener("change", () => {
  state.provider = providerSelect.value;
  saveState(state);
});

// ---------- Search ----------
searchToggleBtn?.addEventListener("click", () => {
  searchWrap.classList.toggle("hidden");
  if (!searchWrap.classList.contains("hidden")) searchInput.focus();
  renderChatList();
});
searchInput?.addEventListener("input", renderChatList);

// ---------- Profile menu position (next to profile) ----------
function openProfileMenuNearProfile() {
  profileMenu.classList.remove("hidden");

  // IMPORTANT: fixed positioning works regardless of sidebar scroll
  profileMenu.style.position = "fixed";

  const r = profileBtn.getBoundingClientRect();

  // Prefer opening upward above profile, aligned left
  const menuW = 220;
  const margin = 10;

  // left clamp
  let left = r.left;
  if (left + menuW > window.innerWidth - margin) left = window.innerWidth - menuW - margin;
  if (left < margin) left = margin;

  // After visible, measure height
  const h = profileMenu.offsetHeight || 140;

  // try open above; if not enough space, open below
  let top = r.top - h - 8;
  if (top < margin) top = r.bottom + 8;

  profileMenu.style.left = `${left}px`;
  profileMenu.style.top = `${top}px`;
}

profileBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = profileMenu.classList.contains("hidden");
  if (isHidden) openProfileMenuNearProfile();
  else profileMenu.classList.add("hidden");
});

menuSettings?.addEventListener("click", (e) => {
  e.stopPropagation();
  profileMenu.classList.add("hidden");
  alert("Settings (coming soon)");
});
menuCustomize?.addEventListener("click", (e) => {
  e.stopPropagation();
  profileMenu.classList.add("hidden");
  alert("Customization (coming soon)");
});
menuHelp?.addEventListener("click", (e) => {
  e.stopPropagation();
  profileMenu.classList.add("hidden");
  alert("Help (tell me what you need)");
});

// ---------- Temporary chat ----------
function isTemp() { return !!tempChatToggle?.checked; }

tempChatToggle?.addEventListener("change", () => {
  if (isTemp()) {
    // start a new temp session
    tempChat = null;
    draftChat = null;
  } else {
    // leaving temp mode does NOT delete normal chats
    tempChat = null;
  }
  renderAll();
});

// ---------- Chat getters ----------
function getSavedActiveChat() {
  return state.chats.find(c => c.id === state.activeId) || state.chats[0];
}
function getCurrentChat() {
  if (isTemp()) {
    if (!tempChat) {
      tempChat = {
        title: "Temporary chat",
        messages: [{
          role: "assistant",
          text: "Temporary chat started. Nothing here will be saved.",
          at: ts(),
          provider: "auto"
        }]
      };
    }
    return tempChat;
  }
  if (draftChat) return draftChat;
  return getSavedActiveChat();
}

// ---------- Render chat list ----------
function lastText(chat) {
  const m = chat.messages[chat.messages.length - 1];
  const t = m?.text || "";
  return t.length > 44 ? t.slice(0, 44) + "…" : t;
}

function renderChatList() {
  const q = (searchInput.value || "").toLowerCase().trim();
  chatListEl.innerHTML = "";

  const sorted = [...state.chats].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  sorted
    .filter(c => !q || (c.title || "").toLowerCase().includes(q))
    .forEach(chat => {
      const el = document.createElement("div");
      const isActive = (!draftChat && !isTemp() && chat.id === state.activeId);
      el.className = "chatItem" + (isActive ? " active" : "");

      el.innerHTML = `
        <div class="chatName">${escapeHtml(chat.title)}${chat.pinned ? " 📌" : ""}</div>
        <div class="chatMeta">${escapeHtml(lastText(chat))}</div>
        <button class="chatDots" aria-label="Chat menu">⋯</button>
      `;

      el.addEventListener("click", (e) => {
        if (e.target?.classList?.contains("chatDots")) return;

        // If currently in temp mode, switch off when opening a saved chat
        if (isTemp()) {
          tempChatToggle.checked = false;
          tempChat = null;
        }
        draftChat = null;

        state.activeId = chat.id;
        saveState(state);
        renderAll();

        // IMPORTANT: do NOT auto-close sidebar
      });

      const dots = el.querySelector(".chatDots");
      dots.addEventListener("click", (e) => {
        e.stopPropagation();
        openChatItemMenu(chat.id, dots);
      });

      chatListEl.appendChild(el);
    });
}

// ---------- Chat item menu ----------
function openChatItemMenu(chatId, anchorEl) {
  menuChatId = chatId;
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;

  menuPin.classList.toggle("hidden", !!chat.pinned);
  menuUnpin.classList.toggle("hidden", !chat.pinned);

  const r = anchorEl.getBoundingClientRect();
  chatItemMenu.style.position = "fixed";
  chatItemMenu.style.left = (r.right - 190) + "px";
  chatItemMenu.style.top = (r.bottom + 8) + "px";
  chatItemMenu.classList.remove("hidden");
}

menuPin?.addEventListener("click", (e) => {
  e.stopPropagation();
  const chat = state.chats.find(c => c.id === menuChatId);
  if (chat) {
    chat.pinned = true;
    chat.updatedAt = ts();
    saveState(state);
    renderChatList();
  }
  chatItemMenu.classList.add("hidden");
});

menuUnpin?.addEventListener("click", (e) => {
  e.stopPropagation();
  const chat = state.chats.find(c => c.id === menuChatId);
  if (chat) {
    chat.pinned = false;
    chat.updatedAt = ts();
    saveState(state);
    renderChatList();
  }
  chatItemMenu.classList.add("hidden");
});

menuDelete?.addEventListener("click", (e) => {
  e.stopPropagation();
  state.chats = state.chats.filter(c => c.id !== menuChatId);
  if (state.chats.length === 0) {
    const id = newId();
    state.chats = [{
      id,
      title: "New chat",
      pinned: false,
      createdAt: ts(),
      updatedAt: ts(),
      messages: [{ role: "assistant", text: "Hi! What’s on the agenda today?", at: ts(), provider: "auto" }]
    }];
    state.activeId = id;
  } else {
    state.activeId = state.chats[0].id;
  }
  saveState(state);
  renderAll();
  chatItemMenu.classList.add("hidden");
});

// ---------- Header menu (⋯) ----------
chatHeaderMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  const r = chatHeaderMenuBtn.getBoundingClientRect();
  chatHeaderMenu.style.position = "fixed";
  chatHeaderMenu.style.left = (r.right - 190) + "px";
  chatHeaderMenu.style.top = (r.bottom + 8) + "px";
  chatHeaderMenu.classList.toggle("hidden");
});

hdrRename?.addEventListener("click", (e) => {
  e.stopPropagation();
  chatHeaderMenu.classList.add("hidden");

  if (isTemp()) {
    alert("Temporary chat cannot be renamed.");
    return;
  }
  if (draftChat) {
    alert("Send the first message, then you can rename the chat.");
    return;
  }

  const chat = getSavedActiveChat();
  const name = prompt("Rename chat:", chat.title);
  if (!name) return;

  chat.title = name.trim().slice(0, 60) || chat.title;
  chat.updatedAt = ts();
  saveState(state);
  renderChatList();
  renderMessages();
});

hdrClear?.addEventListener("click", (e) => {
  e.stopPropagation();
  chatHeaderMenu.classList.add("hidden");

  const chat = getCurrentChat();
  chat.messages = [{
    role: "assistant",
    text: "Chat cleared. What do you want to talk about now?",
    at: ts(),
    provider: "auto"
  }];

  if (!isTemp() && !draftChat) {
    const saved = getSavedActiveChat();
    saved.messages = chat.messages;
    saved.updatedAt = ts();
    saveState(state);
  }
  renderAll();
});

hdrExport?.addEventListener("click", (e) => {
  e.stopPropagation();
  chatHeaderMenu.classList.add("hidden");

  const chat = getCurrentChat();
  const lines = [];
  lines.push(activeChatTitleEl.textContent || "Chat");
  lines.push("-----");
  chat.messages.forEach(m => {
    lines.push(`[${fmtTime(m.at)}] ${m.role.toUpperCase()}: ${m.text}`);
  });

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "chat.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- New chat (DRAFT only; no history entry yet) ----------
newChatBtn?.addEventListener("click", (e) => {
  e.stopPropagation();

  // Do not let search block anything
  searchInput.value = "";
  searchWrap.classList.add("hidden");
  renderChatList();

  if (isTemp()) {
    // restart temp
    tempChat = null;
    draftChat = null;
    renderAll();
    return;
  }

  draftChat = {
    title: "New chat",
    messages: [{
      role: "assistant",
      text: "Hi! What’s on the agenda today?",
      at: ts(),
      provider: "auto"
    }]
  };

  renderAll();

  // IMPORTANT: do NOT auto-close sidebar
});

// ---------- Message rendering ----------
function providerLabel(p) {
  if (p === "openrouter") return "OpenRouter";
  if (p === "gemini") return "Gemini";
  if (p === "groq") return "Groq";
  return "Auto";
}

function renderMessages() {
  const chat = getCurrentChat();

  activeChatTitleEl.textContent = isTemp()
    ? "Temporary chat"
    : (draftChat ? "New chat" : (getSavedActiveChat()?.title || "Chat"));

  activeChatSubEl.textContent = isTemp()
    ? "Not saved • Not used in memory"
    : "Ask anything. Plan your day. Brainstorm ideas.";

  messagesEl.innerHTML = "";

  chat.messages.forEach(m => {
    if (m.role === "user") {
      const row = document.createElement("div");
      row.className = "msgRow user";
      row.innerHTML = `<div class="userBubble">${escapeHtml(m.text)}</div>`;
      messagesEl.appendChild(row);

      // show file chip under user message if attached was used
      if (m.file) {
        const chip = document.createElement("div");
        chip.className = "msgRow user";
        chip.innerHTML = `
          <div class="userBubble" style="opacity:.9">
            📎 ${escapeHtml(m.file.name)} <span style="opacity:.7;font-weight:600">(${escapeHtml(m.file.type || "file")})</span>
          </div>`;
        messagesEl.appendChild(chip);
      }

    } else {
      const row = document.createElement("div");
      row.className = "msgRow ai";
      row.innerHTML = `
        <div class="aiText">
          <div class="aiMeta">
            <span class="aiBadge">${escapeHtml(providerLabel(m.provider || state.provider))}</span>
            <span>${fmtTime(m.at)}</span>
          </div>
          <div>${escapeHtml(m.text).replace(/\n/g, "<br>")}</div>
        </div>
      `;
      messagesEl.appendChild(row);
    }
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderAll() {
  fillProviderSelect();
  renderChatList();
  renderMessages();
}

// ---------- Composer textarea auto-grow ----------
function autoGrow() {
  msgInput.style.height = "auto";
  msgInput.style.height = Math.min(msgInput.scrollHeight, 160) + "px";
}
msgInput?.addEventListener("input", autoGrow);

// ---------- File attach handling ----------
uploadBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const isImage = (file.type || "").startsWith("image/");
  attached = {
    name: file.name,
    type: file.type,
    size: file.size,
    isImage,
    dataUrl: null
  };

  if (isImage) {
    const dataUrl = await readAsDataURL(file);
    attached.dataUrl = dataUrl;
    imgPreviewImg.src = dataUrl;
    imgPreview.classList.remove("hidden");
  } else {
    // show chip in preview area (reuse imgPreview container)
    imgPreview.classList.remove("hidden");
    imgPreviewImg.removeAttribute("src");
    imgPreviewImg.alt = "file";
    // Replace image preview with a simple placeholder by hiding the img tag visually
    imgPreviewImg.style.display = "none";

    // create/update a file label inside preview
    let label = document.getElementById("filePreviewLabel");
    if (!label) {
      label = document.createElement("div");
      label.id = "filePreviewLabel";
      label.style.display = "flex";
      label.style.flexDirection = "column";
      label.style.gap = "2px";
      label.style.fontSize = "12px";
      label.style.color = "rgba(234,240,255,.85)";
      imgPreview.insertBefore(label, removeImgBtn);
    }
    label.innerHTML = `
      <div style="font-weight:800">📎 ${escapeHtml(file.name)}</div>
      <div style="opacity:.7">${escapeHtml(file.type || "file")} • ${(file.size/1024).toFixed(1)} KB</div>
    `;
  }
});

removeImgBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  clearAttachment();
});

function clearAttachment() {
  attached = null;
  fileInput.value = "";
  imgPreview.classList.add("hidden");

  // restore image preview visuals
  imgPreviewImg.style.display = "";
  imgPreviewImg.src = "";
  const label = document.getElementById("filePreviewLabel");
  if (label) label.remove();
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------- History builder ----------
function buildHistory() {
  // temp chat doesn't get stored
  const chat = getCurrentChat();
  return chat.messages.slice(-16).map(m => ({ role: m.role, text: m.text }));
}

// ---------- Auto routing (rotate providers so it doesn't always pick one) ----------
function autoRoutePlan() {
  // rotate order by current minute so it alternates naturally
  const k = new Date().getMinutes() % 3;
  const order = [
    ["openrouter", "gemini", "groq"],
    ["gemini", "groq", "openrouter"],
    ["groq", "openrouter", "gemini"],
  ][k];
  return order.map(p => ({ provider: p }));
}

// ---------- Backend call ----------
// Your backend must accept:
// POST http://localhost:3000/api/chat
// { provider, message, history, attachment? }
// attachment: { name,type,size,isImage,dataUrl? }
async function callBackend({ provider, message, history, attachment }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, message, history, attachment }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.reply || `HTTP ${res.status}`);
    return data.reply || "No reply.";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAI(userText) {
  const history = buildHistory();

  if (state.provider === "auto") {
    let lastErr = null;
    for (const step of autoRoutePlan()) {
      try {
        const reply = await callBackend({
          provider: step.provider,
          message: userText,
          history,
          attachment: attached
        });
        return { reply, provider: step.provider };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("All providers failed.");
  }

  const reply = await callBackend({
    provider: state.provider,
    message: userText,
    history,
    attachment: attached
  });
  return { reply, provider: state.provider };
}

// ---------- Save draft as real chat after first send ----------
function finalizeDraftIfNeeded(firstUserText) {
  if (isTemp()) return;
  if (!draftChat) return;

  const id = newId();
  const saved = {
    id,
    title: firstUserText.slice(0, 28) + (firstUserText.length > 28 ? "…" : ""),
    pinned: false,
    createdAt: ts(),
    updatedAt: ts(),
    messages: draftChat.messages
  };

  state.chats.unshift(saved);
  state.activeId = id;
  draftChat = null;
  saveState(state);
}

// ---------- Add message ----------
function addMessage(role, text, provider = null, fileMeta = null) {
  const chat = getCurrentChat();
  const msg = { role, text, at: ts() };
  if (provider) msg.provider = provider;
  if (fileMeta) msg.file = fileMeta;
  chat.messages.push(msg);

  if (!isTemp() && !draftChat) {
    const saved = getSavedActiveChat();
    saved.updatedAt = ts();
    saveState(state);
  }
}

// ---------- Send (1 message -> 1 response) ----------
async function send() {
  const text = msgInput.value.trim();
  if (!text) return;
  if (isWaiting) return;

  isWaiting = true;
  sendBtn.disabled = true;
  msgInput.disabled = true;

  msgInput.value = "";
  autoGrow();

  // attach meta to the user msg (so it appears under that message)
  const fileMeta = attached ? { name: attached.name, type: attached.type, size: attached.size } : null;

  addMessage("user", text, null, fileMeta);
  renderMessages();
  showTyping(true);

  try {
    const { reply, provider } = await callAI(text);

    finalizeDraftIfNeeded(text);

    addMessage("assistant", reply, provider);
  } catch (e) {
    addMessage("assistant", `❌ ${String(e.message || e)}`, "auto");
  } finally {
    showTyping(false);

    // clear attachment after send
    clearAttachment();

    isWaiting = false;
    sendBtn.disabled = false;
    msgInput.disabled = false;
    msgInput.focus();

    // update saved chat timestamp
    if (!isTemp() && !draftChat) {
      const chat = getSavedActiveChat();
      chat.updatedAt = ts();
      saveState(state);
    }

    renderAll();
  }
}

// Enter send
msgInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

sendBtn?.addEventListener("click", send);

// ---------- Init ----------
fillProviderSelect();
renderAll();
