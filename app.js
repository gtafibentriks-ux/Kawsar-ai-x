/* ═══════════════════════════════════════════
   KAWSAR-AI · app.js v3.0
   Calls /api/chat (serverless) — no direct Anthropic calls
═══════════════════════════════════════════ */

// ─── Personas ────────────────────────────────────────────────────────────────
const PERSONAS = {
  default:  "You are KAWSAR-AI, a highly intelligent, direct, and witty AI assistant. Be bold, confident, and insightful. Your name is KAWSAR-AI.",
  fun:      "You are KAWSAR-AI in Fun Mode! Be playful, use light humor, add emojis occasionally, and keep things entertaining while still being helpful and accurate.",
  precise:  "You are KAWSAR-AI in Precise Mode. Be extremely accurate, technical, and concise. Provide structured, factual responses. Minimize filler. Prioritize correctness above all.",
  creative: "You are KAWSAR-AI in Creative Mode. Be imaginative, expressive, and think outside the box. Embrace metaphors, storytelling, and unconventional ideas."
};

const SUGGESTIONS = [
  "⚡ Explain quantum computing",
  "🐍 Write a Python web scraper",
  "🧠 What is consciousness?",
  "📊 Explain machine learning",
  "🎨 Write a sci-fi short story",
  "🔬 How does DNA replication work?"
];

// ─── State ───────────────────────────────────────────────────────────────────
let chats          = [{ id: uid(), title: "New Chat", messages: [], created: Date.now() }];
let activeId       = chats[0].id;
let currentModel   = "claude-sonnet-4-20250514";
let currentPersona = "default";
let webSearchOn    = false;
let loading        = false;
let editingMsgId   = null;
let attachedImage  = null;

// Image Studio state
let imgStyle     = "realistic";
let imgWidth     = 1024;
let imgHeight    = 1024;
let imgGallery   = [];
let editBase     = null;
let varBase      = null;
let currentTab   = "chat";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid()     { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function nowTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function esc(t)    { return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function eAttr(t)  { return String(t).replace(/"/g,"&quot;"); }
function activeChat() { return chats.find(c => c.id === activeId); }

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderChatList();
  renderSuggestions();
  renderSettingsModels();
  document.getElementById("input").addEventListener("input", updateSendBtn);
});

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.getElementById("chat-panel").style.display  = tab === "chat"  ? "flex"  : "none";
  document.getElementById("image-panel").style.display = tab === "image" ? "block" : "none";
  document.getElementById("tab-chat").classList.toggle("active",  tab === "chat");
  document.getElementById("tab-image").classList.toggle("active", tab === "image");
}

function showImageGen() { switchTab("image"); }

// ─── Suggestions ─────────────────────────────────────────────────────────────
function renderSuggestions() {
  document.getElementById("chips").innerHTML = SUGGESTIONS.map(s =>
    `<button class="chip" onclick="chipClick(this.dataset.t)" data-t="${eAttr(s.slice(2))}">${s}</button>`
  ).join("");
}
function chipClick(t) {
  const inp = document.getElementById("input");
  inp.value = t; autoResize(inp); updateSendBtn(); inp.focus();
}

// ─── Chat list ────────────────────────────────────────────────────────────────
function renderChatList(filter = "") {
  const list = document.getElementById("chat-list");
  list.innerHTML = `<div class="section-label">CONVERSATIONS</div>`;
  const filtered = chats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));
  if (!filtered.length) {
    list.innerHTML += `<div style="padding:12px 8px;font-size:11px;color:var(--muted);text-align:center">No chats found</div>`;
    return;
  }
  filtered.forEach(chat => {
    const div = document.createElement("div");
    div.className = "chat-item";
    div.innerHTML = `
      <button class="chat-item-btn ${chat.id===activeId?"active":""}" onclick="switchChat('${chat.id}')">💬 ${esc(chat.title)}</button>
      <button class="chat-del" onclick="deleteChat(event,'${chat.id}')">✕</button>`;
    list.appendChild(div);
  });
}
function filterChats(v) { renderChatList(v); }

function switchChat(id) {
  activeId = id; editingMsgId = null; attachedImage = null;
  document.getElementById("edit-banner").classList.remove("show");
  document.getElementById("img-preview-wrap").classList.remove("show");
  const inp = document.getElementById("input");
  inp.value = ""; autoResize(inp); updateSendBtn();
  renderChatList(document.getElementById("chat-search").value);
  renderMessages();
  switchTab("chat");
}
function deleteChat(e, id) {
  e.stopPropagation();
  chats = chats.filter(c => c.id !== id);
  if (!chats.length) chats = [{ id: uid(), title: "New Chat", messages: [], created: Date.now() }];
  if (activeId === id) activeId = chats[0].id;
  renderChatList(document.getElementById("chat-search").value);
  renderMessages();
}
function newChat() {
  const c = { id: uid(), title: "New Chat", messages: [], created: Date.now() };
  chats.unshift(c); activeId = c.id; editingMsgId = null; attachedImage = null;
  document.getElementById("edit-banner").classList.remove("show");
  document.getElementById("img-preview-wrap").classList.remove("show");
  const inp = document.getElementById("input");
  inp.value = ""; autoResize(inp); updateSendBtn();
  renderChatList(document.getElementById("chat-search").value);
  renderMessages(); switchTab("chat");
}

// ─── Message rendering ────────────────────────────────────────────────────────
function renderMessages() {
  const msgs = activeChat()?.messages || [];
  const container = document.getElementById("messages");
  Array.from(container.children).forEach(el => {
    if (el.id !== "typing-row" && el.id !== "welcome") el.remove();
  });
  document.getElementById("welcome").style.display = msgs.length ? "none" : "flex";
  document.getElementById("typing-row").classList.remove("show");
  const tr = document.getElementById("typing-row");
  msgs.forEach(m => container.insertBefore(buildMsgEl(m), tr));
  scrollBottom();
}

function buildMsgEl(msg) {
  const isUser = msg.role === "user";
  const row = document.createElement("div");
  row.className = `msg-row ${isUser ? "user-row" : ""}`;
  row.id = "msg-" + msg.id;

  // Image in message (chat attachment OR generated image)
  const imgHtml = msg.image
    ? `<div style="margin-bottom:6px"><img src="${msg.image}" style="max-width:200px;border-radius:10px;border:1px solid var(--border2)" alt="attachment"/></div>`
    : "";

  const content = isUser
    ? esc(msg.content).replace(/\n/g,"<br/>")
    : formatMd(msg.content);

  const userActs = `
    <button class="act-btn" onclick="editMsg('${msg.id}')">✏ Edit</button>
    <button class="act-btn" onclick="copyMsg('${msg.id}')">⎘ Copy</button>`;
  const aiActs = `
    <button class="act-btn" onclick="copyMsg('${msg.id}')">⎘ Copy</button>
    <button class="act-btn" id="like-${msg.id}" onclick="likeMsg('${msg.id}',true)">👍</button>
    <button class="act-btn" id="dis-${msg.id}" onclick="likeMsg('${msg.id}',false)">👎</button>
    ${msg.isLast ? `<button class="act-btn" onclick="regenerate()">↺ Retry</button>` : ""}`;

  row.innerHTML = `
    ${!isUser ? `<div class="avatar ai-av">K</div>` : ""}
    <div class="bubble-wrap">
      ${imgHtml}
      <div class="bubble ${isUser?"user-bubble":"ai-bubble"}">${content}</div>
      <div class="msg-footer">
        <span class="msg-time">${msg.time}</span>
        <div class="msg-actions">${isUser ? userActs : aiActs}</div>
      </div>
    </div>
    ${isUser ? `<div class="avatar user-av">U</div>` : ""}`;
  return row;
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function formatMd(text) {
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<div class="code-block"><div class="code-lang">${lang||"code"} <button class="copy-code" onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="${eAttr(code.trim())}">⎘ copy</button></div><pre><code>${esc(code.trim())}</code></pre></div>`
  );
  text = text.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g,"<em>$1</em>");
  text = text.replace(/`([^`]+)`/g,`<code class="inline-code">$1</code>`);
  text = text.replace(/^### (.+)$/gm,"<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm,"<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm,"<h1>$1</h1>");
  text = text.replace(/^\s*[-*] (.+)$/gm,"<li>$1</li>");
  text = text.replace(/(<li>.*<\/li>\n?)+/gs, m=>`<ul>${m}</ul>`);
  text = text.replace(/\n\n/g,"</p><p>");
  text = text.replace(/\n/g,"<br/>");
  return `<p>${text}</p>`;
}

// ─── API call via serverless proxy ────────────────────────────────────────────
async function callAPI(messages, system) {
  const body = { messages, system, model: currentModel, max_tokens: 1000 };
  if (webSearchOn) body.tools = [{ type:"web_search_20250305", name:"web_search" }];

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("") || "No response received.";
}

// ─── Send message ──────────────────────────────────────────────────────────────
async function sendMessage(overrideText = null, baseMsgs = null) {
  const inp  = document.getElementById("input");
  const text = (overrideText ?? inp.value).trim();
  if (!text || loading) return;

  inp.value = ""; autoResize(inp); updateSendBtn(); cancelEdit();

  const img = attachedImage; attachedImage = null;
  document.getElementById("img-preview-wrap").classList.remove("show");
  document.getElementById("file-input").value = "";

  const userMsg = { id: uid(), role: "user", content: text, time: nowTime(), image: img };
  const base    = baseMsgs ?? [...(activeChat()?.messages || [])];
  const current = [...base, userMsg];
  const isFirst = (activeChat()?.messages || []).length === 0;

  chats = chats.map(c => c.id === activeId
    ? { ...c, messages: current, title: isFirst ? text.slice(0,44) : c.title }
    : c);
  renderChatList(document.getElementById("chat-search").value);
  renderMessages();

  loading = true;
  document.getElementById("typing-row").classList.add("show");
  setSendLoading(true); scrollBottom();

  try {
    const apiMessages = current.map(m => ({ role: m.role, content: m.content }));
    const reply = await callAPI(apiMessages, PERSONAS[currentPersona]);

    document.getElementById("typing-row").classList.remove("show");

    const aiMsg  = { id: uid(), role: "assistant", content: "", time: nowTime() };
    const withAi = [...current, aiMsg];
    chats = chats.map(c => c.id === activeId ? { ...c, messages: withAi } : c);
    renderMessages();

    // Stream effect
    const rowEl    = document.getElementById("msg-" + aiMsg.id);
    const bubbleEl = rowEl?.querySelector(".ai-bubble");
    let displayed  = "";
    for (let i = 0; i < reply.length; i += 5) {
      displayed += reply.slice(i, i + 5);
      if (bubbleEl) { bubbleEl.innerHTML = formatMd(displayed) + '<span class="cursor-blink"></span>'; scrollBottom(); }
      await sleep(6);
    }
    if (bubbleEl) bubbleEl.innerHTML = formatMd(reply);

    aiMsg.content = reply;
    const final = withAi.map((m, i) => ({ ...m, isLast: i === withAi.length-1 && m.role==="assistant" }));
    chats = chats.map(c => c.id === activeId ? { ...c, messages: final } : c);
    renderMessages();

  } catch (err) {
    console.error("Send error:", err);
    document.getElementById("typing-row").classList.remove("show");
    const errMsg = { id: uid(), role: "assistant", content: `⚠️ Error: ${err.message}\n\nMake sure **ANTHROPIC_API_KEY** is set in your Vercel environment variables.`, time: nowTime() };
    chats = chats.map(c => c.id === activeId ? { ...c, messages: [...current, errMsg] } : c);
    renderMessages();
  }

  loading = false; setSendLoading(false); scrollBottom();
}

// ─── Regenerate ───────────────────────────────────────────────────────────────
function regenerate() {
  const msgs     = activeChat()?.messages || [];
  const userMsgs = msgs.filter(m => m.role === "user");
  if (!userMsgs.length) return;
  const lastUser = userMsgs[userMsgs.length - 1];
  const idx      = msgs.map(m => m.id).lastIndexOf(lastUser.id);
  const base     = msgs.slice(0, idx);
  chats = chats.map(c => c.id === activeId ? { ...c, messages: base } : c);
  renderMessages(); sendMessage(lastUser.content, base);
}

// ─── Edit message ─────────────────────────────────────────────────────────────
function editMsg(id) {
  const msg = activeChat()?.messages.find(m => m.id === id);
  if (!msg) return;
  editingMsgId = id;
  const inp = document.getElementById("input");
  inp.value = msg.content; autoResize(inp); updateSendBtn();
  document.getElementById("edit-banner").classList.add("show");
  inp.focus();
}
function cancelEdit() {
  editingMsgId = null;
  document.getElementById("edit-banner").classList.remove("show");
}
function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (editingMsgId) {
      const text = document.getElementById("input").value.trim();
      if (!text) return;
      const msgs = activeChat()?.messages || [];
      const idx  = msgs.findIndex(m => m.id === editingMsgId);
      const base = msgs.slice(0, idx);
      chats = chats.map(c => c.id === activeId ? { ...c, messages: base } : c);
      const val  = document.getElementById("input").value;
      document.getElementById("input").value = "";
      cancelEdit(); sendMessage(val, base);
    } else { sendMessage(); }
  }
}

// ─── Like / Copy ─────────────────────────────────────────────────────────────
function likeMsg(id, pos) {
  document.getElementById(`like-${id}`)?.classList.toggle("liked",  pos  && !document.getElementById(`like-${id}`)?.classList.contains("liked"));
  document.getElementById(`dis-${id}`)?.classList.toggle("disliked", !pos && !document.getElementById(`dis-${id}`)?.classList.contains("disliked"));
  if (pos)  document.getElementById(`dis-${id}`)?.classList.remove("disliked");
  else      document.getElementById(`like-${id}`)?.classList.remove("liked");
}
function copyMsg(id) {
  const msg = activeChat()?.messages.find(m => m.id === id);
  if (msg) navigator.clipboard.writeText(msg.content).catch(()=>{});
}

// ─── Image attachment ─────────────────────────────────────────────────────────
function handleImage(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    attachedImage = ev.target.result;
    document.getElementById("img-preview").src = attachedImage;
    document.getElementById("img-preview-wrap").classList.add("show");
    updateSendBtn();
  };
  reader.readAsDataURL(file);
}
function removeImage() {
  attachedImage = null;
  document.getElementById("img-preview-wrap").classList.remove("show");
  document.getElementById("file-input").value = "";
  updateSendBtn();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function autoResize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }
function updateSendBtn() { document.getElementById("send-btn").disabled = !document.getElementById("input").value.trim() && !attachedImage; }
function setSendLoading(on) { const b = document.getElementById("send-btn"); b.innerHTML = on ? '<div class="spinner"></div>' : "↑"; b.disabled = on; }
function scrollBottom() { const m = document.getElementById("messages"); m.scrollTop = m.scrollHeight; }
function toggleSidebar() {
  const s = document.getElementById("sidebar");
  window.innerWidth <= 640 ? s.classList.toggle("mobile-open") : s.classList.toggle("collapsed");
}
function toggleModelPicker() { document.getElementById("model-dropdown").classList.toggle("open"); }
function selectModel(id, label, tag, el) {
  currentModel = id;
  document.getElementById("model-label").textContent = label;
  document.querySelectorAll(".model-opt").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("model-dropdown").classList.remove("open");
}
document.addEventListener("click", e => {
  if (!document.getElementById("model-wrap")?.contains(e.target))
    document.getElementById("model-dropdown").classList.remove("open");
});
function setMode(mode, el) {
  currentPersona = mode;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
  el?.classList.add("active");
  document.getElementById("persona-sel").value = mode;
  syncPersonaSettings(mode);
}
function setPersonaFromSel(v) { currentPersona = v; syncPersonaSettings(v); }
function setModeFromSettings(m) { currentPersona = m; document.getElementById("persona-sel").value = m; syncPersonaSettings(m); }
function syncPersonaSettings(m) {
  ["default","fun","precise","creative"].forEach(p => document.getElementById("sp-"+p)?.classList.toggle("active", p===m));
}
function toggleSearch() {
  webSearchOn = !webSearchOn;
  ["search-tgl","search-toggle","settings-search-tgl"].forEach(id => document.getElementById(id)?.classList.toggle("on", webSearchOn));
}
function toggleSearchFromSettings() { toggleSearch(); }

// ─── Settings ────────────────────────────────────────────────────────────────
function renderSettingsModels() {
  const models = [
    { id:"claude-sonnet-4-20250514", label:"KAWSAR-2",      tag:"SMART", desc:"Best for complex tasks" },
    { id:"claude-sonnet-4-20250514", label:"KAWSAR-2 Mini", tag:"FAST",  desc:"Quick, efficient responses" },
  ];
  const c = document.getElementById("settings-models");
  c.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:8px";
  c.innerHTML = models.map((m,i) => `
    <button onclick="selectModelSettings(this,'${m.id}','${m.label}')"
      style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;
      background:${i===0?"var(--surface2)":"none"};border:1px solid ${i===0?"#00e5ff44":"var(--border2)"};
      border-radius:10px;cursor:pointer;font-family:var(--font-m);transition:all .2s;width:100%">
      <div style="text-align:left">
        <div style="font-size:12px;color:var(--text);font-weight:600">${m.label}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${m.desc}</div>
      </div>
      <span style="font-size:9px;padding:3px 9px;background:#00e5ff22;color:var(--accent);border-radius:4px;letter-spacing:.1em">${m.tag}</span>
    </button>`).join("");
}
function selectModelSettings(el, id, label) {
  currentModel = id; document.getElementById("model-label").textContent = label;
  Array.from(el.parentNode.children).forEach(b => { b.style.background="none"; b.style.borderColor="var(--border2)"; });
  el.style.background="var(--surface2)"; el.style.borderColor="#00e5ff44";
}
function openSettings() {
  document.getElementById("settings-search-tgl")?.classList.toggle("on", webSearchOn);
  document.getElementById("modal-overlay").classList.add("open");
}
function closeSettings() { document.getElementById("modal-overlay").classList.remove("open"); }
function closeSettingsOutside(e) { if (e.target.id==="modal-overlay") closeSettings(); }
function clearAllChats() {
  if (!confirm("Delete ALL conversations? Cannot be undone.")) return;
  const nc = { id: uid(), title: "New Chat", messages: [], created: Date.now() };
  chats = [nc]; activeId = nc.id; closeSettings();
  renderChatList(""); renderMessages();
}

// ══════════════════════════════════════════════════════
//  IMAGE STUDIO
// ══════════════════════════════════════════════════════

function setStudioMode(mode) {
  ["generate","edit","variations"].forEach(m => {
    document.getElementById("ctrl-"+m).style.display  = m===mode ? "block" : "none";
    document.getElementById("sm-"+m).classList.toggle("active", m===mode);
  });
}

function selectStyle(el) {
  document.querySelectorAll(".style-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  imgStyle = el.dataset.style;
}
function selectSize(el) {
  document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  imgWidth  = parseInt(el.dataset.w);
  imgHeight = parseInt(el.dataset.h);
}

// ── Show inline error in studio ───────────────────────────────────────────────
function showStudioError(msg) {
  setGenLoading(false); setEditLoading(false);
  const canvas = document.getElementById("output-canvas");
  const ph     = document.getElementById("output-placeholder");
  const overlay= document.getElementById("gen-overlay");
  if (overlay) overlay.style.display = "none";
  if (ph) ph.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:10px">⚠️</div>
      <div style="font-size:12px;color:#ff6b6b;line-height:1.6;max-width:260px">${msg}</div>
      <button onclick="resetStudioPlaceholder()" style="margin-top:14px;padding:7px 16px;background:none;border:1px solid var(--border2);border-radius:8px;color:var(--muted);cursor:pointer;font-size:11px;font-family:var(--font-m)">Try Again</button>
    </div>`;
  if (ph) ph.style.display = "flex";
}
function resetStudioPlaceholder() {
  const ph = document.getElementById("output-placeholder");
  if (ph) ph.innerHTML = `<div style="font-size:48px;margin-bottom:12px;opacity:.3">🎨</div><div style="font-size:12px;color:var(--muted);letter-spacing:.08em">YOUR IMAGE WILL APPEAR HERE</div>`;
}

// ── Generate image ────────────────────────────────────────────────────────────
async function generateImage() {
  const prompt = document.getElementById("img-prompt").value.trim();
  if (!prompt) { showStudioError("Please enter a prompt first!"); return; }

  setGenLoading(true, "Enhancing prompt…");
  try {
    const res  = await fetch("/api/imagine", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ prompt, style: imgStyle, width: imgWidth, height: imgHeight })
    });

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error("Server returned invalid response. Check Vercel logs."); }

    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.image) throw new Error("No image returned from server.");
    showOutputImage(data.image, data.enhancedPrompt, data.seed);
  } catch (err) {
    showStudioError("Generation failed: " + err.message);
  }
}

// ── Edit image ────────────────────────────────────────────────────────────────
async function editImage() {
  const prompt = document.getElementById("edit-prompt").value.trim();
  if (!editBase)  { showStudioError("Please upload an image to edit first!"); return; }
  if (!prompt)    { showStudioError("Please describe what to change!"); return; }

  setEditLoading(true);
  try {
    const res  = await fetch("/api/imagine", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        prompt: `Edit image: ${prompt}`,
        style: imgStyle, width: imgWidth, height: imgHeight
      })
    });

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error("Server returned invalid response."); }

    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    showOutputImage(data.image, data.enhancedPrompt, data.seed);
  } catch (err) {
    showStudioError("Edit failed: " + err.message);
  }
}

// ── Variation ─────────────────────────────────────────────────────────────────
async function generateVariation() {
  if (!varBase) { showStudioError("Please upload an image first!"); return; }
  const prompt = document.getElementById("var-prompt").value.trim() || "Create a creative variation";
  setGenLoading(true, "Creating variation…");
  try {
    const res  = await fetch("/api/imagine", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ prompt, style: imgStyle, width: imgWidth, height: imgHeight })
    });

    let data;
    try { data = await res.json(); }
    catch(_) { throw new Error("Server returned invalid response."); }

    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    showOutputImage(data.image, data.enhancedPrompt, data.seed);
  } catch (err) {
    showStudioError("Variation failed: " + err.message);
  }
}

// ── Show output ───────────────────────────────────────────────────────────────
function showOutputImage(src, prompt, seed) {
  setGenLoading(false); setEditLoading(false);

  const canvas = document.getElementById("output-canvas");
  const imgEl  = document.getElementById("output-image");
  const phEl   = document.getElementById("output-placeholder");
  const actEl  = document.getElementById("output-actions");
  const metaEl = document.getElementById("output-meta");

  imgEl.src = src;
  imgEl.style.display = "block";
  phEl.style.display  = "none";
  actEl.style.display = "flex";
  metaEl.style.display = "block";
  metaEl.innerHTML = `<strong style="color:var(--accent)">PROMPT:</strong> ${esc(prompt || "")}<br/><strong style="color:var(--accent)">SEED:</strong> ${seed || "N/A"}`;

  // Gallery
  imgGallery.unshift({ src, prompt, seed });
  if (imgGallery.length > 12) imgGallery.pop();
  renderGallery();
  document.getElementById("gallery-wrap").style.display = "block";
}

function renderGallery() {
  const g = document.getElementById("gallery");
  g.innerHTML = imgGallery.map((item, i) => `
    <div class="gallery-item" onclick="loadGalleryItem(${i})" title="${eAttr(item.prompt||'')}">
      <img src="${item.src}" alt="Generated ${i+1}"/>
    </div>`).join("");
}

function loadGalleryItem(i) {
  const item = imgGallery[i];
  if (!item) return;
  showOutputImage(item.src, item.prompt, item.seed);
}

// ── Download & actions ────────────────────────────────────────────────────────
function downloadImage() {
  const src = document.getElementById("output-image").src;
  if (!src || src === window.location.href) return;
  const a   = document.createElement("a");
  a.href    = src;
  a.download = `kawsar-ai-${Date.now()}.jpg`;
  a.click();
}

function sendToChat() {
  const src = document.getElementById("output-image").src;
  if (!src || src === window.location.href) return;
  const prompt = document.getElementById("img-prompt").value || "AI-generated image";
  switchTab("chat");
  const aiMsg = {
    id: uid(), role: "assistant",
    content: `🎨 Here's your generated image! *(${prompt})*`,
    time: nowTime(), image: src
  };
  chats = chats.map(c => c.id === activeId
    ? { ...c, messages: [...(c.messages||[]), aiMsg] }
    : c);
  renderMessages();
}

function useAsEditBase() {
  const src = document.getElementById("output-image").src;
  if (!src) return;
  setStudioMode("edit");
  editBase = src;
  const editImg = document.getElementById("edit-preview-img");
  const placeholder = document.getElementById("edit-upload-placeholder");
  editImg.src = src;
  editImg.style.display = "block";
  if (placeholder) placeholder.style.display = "none";
}

// ── Upload handlers ───────────────────────────────────────────────────────────
function handleEditUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    editBase = ev.target.result;
    const imgEl = document.getElementById("edit-preview-img");
    const ph    = document.getElementById("edit-upload-placeholder");
    imgEl.src   = editBase; imgEl.style.display = "block";
    if (ph) ph.style.display = "none";
  };
  reader.readAsDataURL(file);
}

function handleVariationUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    varBase     = ev.target.result;
    const imgEl = document.getElementById("var-preview-img");
    const ph    = document.getElementById("var-upload-placeholder");
    imgEl.src   = varBase; imgEl.style.display = "block";
    if (ph) ph.style.display = "none";
  };
  reader.readAsDataURL(file);
}

// ── Loading states ────────────────────────────────────────────────────────────
function setGenLoading(on, status = "Generating…") {
  const btn     = document.getElementById("gen-btn");
  const txt     = document.getElementById("gen-btn-text");
  const spinner = document.getElementById("gen-spinner");
  const overlay = document.getElementById("gen-overlay");
  const statusEl= document.getElementById("gen-status");
  btn.disabled  = on;
  txt.style.display     = on ? "none" : "inline";
  spinner.style.display = on ? "block" : "none";
  overlay.style.display = on ? "flex"  : "none";
  if (statusEl) statusEl.textContent = status;
}
function setEditLoading(on) {
  const btn     = document.getElementById("edit-btn");
  const txt     = document.getElementById("edit-btn-text");
  const spinner = document.getElementById("edit-spinner");
  if (!btn) return;
  btn.disabled  = on;
  txt.style.display     = on ? "none"  : "inline";
  spinner.style.display = on ? "block" : "none";
}
