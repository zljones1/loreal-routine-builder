/* ============================================================
   L'Oréal Smart Routine & Product Advisor
   - Browse products from products.json (category + search)
   - Select products (saved in localStorage)
   - Generate a routine with OpenAI through a Cloudflare Worker
   - Ask follow-up questions (full conversation history is sent)
   No API key lives in this file. The Worker holds it as a secret.
   ============================================================ */

/* 🔧 CLOUDFLARE WORKER URL
   This is the same Worker used for the Project 8 chatbot.
   It keeps the OpenAI key secret. See README.md to set up your own. */
const WORKER_URL = "https://loreal-chatbot.zljones1.workers.dev/";

/* Keys used to save things in localStorage */
const SELECTED_KEY = "lorealSelectedProductIds";
const LANGUAGE_KEY = "lorealLanguage";

/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAll");
const generateBtn = document.getElementById("generateRoutine");
const webSearchToggle = document.getElementById("webSearchToggle");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const languageSelect = document.getElementById("languageSelect");

/* App state */
let allProducts = []; // every product from products.json
let selectedIds = JSON.parse(localStorage.getItem(SELECTED_KEY) || "[]"); // saved selections
let isWaiting = false; // true while we wait for the AI

/* System prompt: keeps the AI on topic */
const systemPrompt = `You are the L'Oréal Smart Routine & Product Advisor, a friendly, elegant beauty expert.
You build personalized routines from the L'Oréal-family products the user selected (L'Oréal Paris, CeraVe, La Roche-Posay, Garnier, Lancôme, Maybelline, Kiehl's, and more).
When you build a routine:
- Use ONLY the selected products, in a sensible order, split into Morning and Evening (or "When to use" for hair, makeup, and fragrance).
- For each step give the product name and one short sentence on how and why to use it.
- End with 1-2 short tips (for example sunscreen or patch testing).
For follow-up questions, answer only about the user's routine or about skincare, haircare, makeup, fragrance, and related beauty topics.
If a question is unrelated (math, coding, sports, politics, etc.), politely decline in one sentence and invite a beauty question instead.
Never invent prices, never promise medical results, and suggest a dermatologist for medical concerns.
Keep answers concise. Use short numbered lists. You may use **bold** for step names.`;

/* Conversation history: everything sent to the Worker each time */
let messages = [{ role: "system", content: systemPrompt }];

/* ---------- Helpers ---------- */

/* Make text safe to put inside HTML (stops HTML injection) */
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Turn the AI's text into simple HTML: bold, links, and line breaks */
function formatReply(text) {
  let html = escapeHTML(text);
  // [link text](https://...) → clickable link
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  // plain https://... links that are not already inside a link
  html = html.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener">$2</a>'
  );
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); // **bold**
  html = html.replace(/^#{1,6}\s*(.+)$/gm, "<strong>$1</strong>"); // # headings
  return html.replace(/\n/g, "<br>");
}

/* Add a chat bubble. role is "user" or "ai" */
function addMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  const label = role === "user" ? "You" : "L'Oréal Advisor";
  bubble.innerHTML = `<span class="sender">${label}</span><div class="msg-text">${formatReply(text)}</div>`;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = bubble.offsetTop - 10; // show the top of the newest message
  return bubble;
}

/* Add web-search citations (if the Worker sent any) under a bubble */
function addCitations(bubble, annotations) {
  const links = (annotations || [])
    .filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => a.url_citation);
  if (links.length === 0) return;
  const unique = [...new Map(links.map((l) => [l.url, l])).values()];
  const list = unique
    .map(
      (l) =>
        `<li><a href="${escapeHTML(l.url)}" target="_blank" rel="noopener">${escapeHTML(l.title || l.url)}</a></li>`
    )
    .join("");
  bubble.insertAdjacentHTML("beforeend", `<div class="citations"><strong>Sources</strong><ul>${list}</ul></div>`);
}

/* Save selected product ids so they survive a page reload */
function saveSelections() {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(selectedIds));
}

/* ---------- Products ---------- */

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for the product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products match your search. Try another word or category.</div>`;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedIds.includes(product.id);
      return `
    <div class="product-card ${isSelected ? "selected" : ""}" data-id="${product.id}"
         role="button" tabindex="0" aria-pressed="${isSelected}">
      <span class="check-badge" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
      <div class="card-top">
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">
        <div class="product-info">
          <p class="brand">${escapeHTML(product.brand)}</p>
          <h3>${escapeHTML(product.name)}</h3>
          <p class="category">${escapeHTML(product.category)}</p>
        </div>
      </div>
      <button type="button" class="info-btn" aria-expanded="false" aria-controls="desc-${product.id}">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i> Details
      </button>
      <p class="description" id="desc-${product.id}" hidden>${escapeHTML(product.description)}</p>
    </div>`;
    })
    .join("");
}

/* Show products that match BOTH the category and the search text */
function updateGrid() {
  const category = categoryFilter.value;
  const searchText = productSearch.value.trim().toLowerCase();

  // Nothing chosen yet: show the starting message
  if (!category && !searchText) {
    productsContainer.innerHTML = `<div class="placeholder-message">Select a category or search to view products</div>`;
    return;
  }

  const filtered = allProducts.filter((product) => {
    const matchesCategory = !category || category === "all" || product.category === category;
    const text = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const matchesSearch = text.includes(searchText);
    return matchesCategory && matchesSearch;
  });

  displayProducts(filtered);
}

/* Select or unselect a product */
function toggleProduct(id) {
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((x) => x !== id);
  } else {
    selectedIds.push(id);
  }
  saveSelections();
  updateGrid();
  renderSelected();
}

/* Show the "Selected Products" list */
function renderSelected() {
  const chosen = allProducts.filter((p) => selectedIds.includes(p.id));
  selectedCount.textContent = chosen.length;
  clearAllBtn.disabled = chosen.length === 0;

  if (chosen.length === 0) {
    selectedProductsList.innerHTML = `<p class="empty-note">No products selected yet.</p>`;
    return;
  }

  selectedProductsList.innerHTML = chosen
    .map(
      (p) => `
    <div class="selected-chip">
      <img src="${escapeHTML(p.image)}" alt="">
      <span>${escapeHTML(p.brand)} · ${escapeHTML(p.name)}</span>
      <button type="button" class="remove-btn" data-id="${p.id}" aria-label="Remove ${escapeHTML(p.name)}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`
    )
    .join("");
}

/* Clicks inside the grid: the Details button OR the card itself */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  const infoBtn = e.target.closest(".info-btn");
  if (infoBtn) {
    // Show / hide the description without selecting the card
    const desc = card.querySelector(".description");
    desc.hidden = !desc.hidden;
    infoBtn.setAttribute("aria-expanded", String(!desc.hidden));
    card.classList.toggle("expanded", !desc.hidden);
    return;
  }

  toggleProduct(Number(card.dataset.id));
});

/* Keyboard support: Enter or Space selects a focused card */
productsContainer.addEventListener("keydown", (e) => {
  const card = e.target.closest(".product-card");
  if (!card || e.target !== card) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleProduct(Number(card.dataset.id));
    document.querySelector(`.product-card[data-id="${card.dataset.id}"]`)?.focus();
  }
});

/* Remove one product from the selected list */
selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (btn) toggleProduct(Number(btn.dataset.id));
});

/* Clear all selections */
clearAllBtn.addEventListener("click", () => {
  selectedIds = [];
  saveSelections();
  updateGrid();
  renderSelected();
});

/* Filter when the category or search text changes */
categoryFilter.addEventListener("change", updateGrid);
productSearch.addEventListener("input", updateGrid);

/* ---------- Language / RTL (LevelUp) ---------- */

function applyLanguage(code) {
  const option = [...languageSelect.options].find((o) => o.value === code) || languageSelect.options[0];
  languageSelect.value = option.value;
  document.documentElement.lang = option.value;
  document.documentElement.dir = option.dataset.dir; // "rtl" flips the whole layout
  localStorage.setItem(LANGUAGE_KEY, option.value);
}

/* Tell the AI which language to answer in */
function languageNote() {
  const name = languageSelect.options[languageSelect.selectedIndex].text.replace(" (RTL)", "");
  return languageSelect.value === "en" ? "" : `\n\nPlease reply in ${name}.`;
}

languageSelect.addEventListener("change", () => applyLanguage(languageSelect.value));

/* ---------- Talking to the AI ---------- */

/* Send the conversation to the Worker and return the AI's message */
async function askAI() {
  if (!WORKER_URL || WORKER_URL.startsWith("PASTE_")) {
    throw new Error("The Cloudflare Worker URL isn't set yet. Add it to WORKER_URL at the top of script.js (see README).");
  }

  let response;
  try {
    response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // webSearch is only used by the web-search Worker; older Workers ignore it
      body: JSON.stringify({ messages: messages, webSearch: webSearchToggle.checked }),
    });
  } catch {
    throw new Error("Couldn't reach the AI service. Check your internet connection and the Worker URL.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The Worker sent an unexpected response (status ${response.status}).`);
  }

  if (data.error) {
    throw new Error(data.error.message || "The AI service returned an error.");
  }
  if (!data.choices || !data.choices[0]) {
    throw new Error("The AI didn't send an answer. Please try again.");
  }
  return data.choices[0].message;
}

/* Shared flow: show the question, call the AI, show the answer */
async function sendToAI(displayText, contentForAI) {
  if (isWaiting) return;
  isWaiting = true;
  sendBtn.disabled = true;
  generateBtn.disabled = true;

  addMessage("user", displayText);
  messages.push({ role: "user", content: contentForAI + languageNote() });

  const loading = addMessage("ai", "Thinking…");
  loading.classList.add("loading");

  try {
    const reply = await askAI();
    loading.remove();
    const bubble = addMessage("ai", reply.content);
    addCitations(bubble, reply.annotations);
    messages.push({ role: "assistant", content: reply.content });
  } catch (error) {
    messages.pop(); // don't keep a question that got no answer
    loading.remove();
    addMessage("ai", `⚠️ Sorry, something went wrong: ${error.message}`);
    console.error(error);
  } finally {
    isWaiting = false;
    sendBtn.disabled = false;
    generateBtn.disabled = false;
  }
}

/* Generate Routine button */
generateBtn.addEventListener("click", () => {
  // Collect only the selected products, with the fields the AI needs
  const chosen = allProducts
    .filter((p) => selectedIds.includes(p.id))
    .map((p) => ({ name: p.name, brand: p.brand, category: p.category, description: p.description }));

  if (chosen.length === 0) {
    addMessage("ai", "Select at least one product first, then tap Generate Routine. ✨");
    return;
  }

  // Start a fresh conversation for this routine
  messages = [{ role: "system", content: systemPrompt }];

  const prompt = `Build a personalized routine using ONLY these selected products (JSON):\n${JSON.stringify(chosen, null, 2)}`;
  sendToAI(`Generate a routine with my ${chosen.length} selected product${chosen.length > 1 ? "s" : ""}.`, prompt);
});

/* Follow-up questions in the chat box */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question || isWaiting) return;
  userInput.value = "";
  sendToAI(question, question);
});

/* ---------- Start the app ---------- */
async function init() {
  applyLanguage(localStorage.getItem(LANGUAGE_KEY) || "en");
  addMessage(
    "ai",
    "👋 Bonjour! Pick the products you love above, then tap **Generate Routine**. After that, ask me anything about your routine, skincare, haircare, makeup, or fragrance."
  );

  try {
    allProducts = await loadProducts();
  } catch {
    productsContainer.innerHTML = `<div class="placeholder-message">Couldn't load products. Please refresh the page.</div>`;
    return;
  }

  // Forget any saved ids that no longer exist
  selectedIds = selectedIds.filter((id) => allProducts.some((p) => p.id === id));
  saveSelections();

  updateGrid();
  renderSelected();
}

init();
