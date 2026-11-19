/* ===========================================================
   L'Oréal Smart Routine & Product Advisor
   Browse products, pick the ones you like, and let AI build
   a routine you can ask follow-up questions about.
   =========================================================== */

/* Your Cloudflare Worker URL (it keeps the OpenAI key secret).
   This reuses the Worker from the L'Oréal chatbot project. */
const WORKER_URL = "https://loreal-chatbot.zljones1.workers.dev/";

/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateBtn = document.getElementById("generateRoutine");
const clearBtn = document.getElementById("clearSelections");
const dirToggle = document.getElementById("dirToggle");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

/* All products from products.json (filled in by loadProducts) */
let allProducts = [];

/* IDs of the products the user has picked.
   We load any saved picks from localStorage so they survive a page reload. */
let selectedIds = JSON.parse(localStorage.getItem("selectedProducts")) || [];

/* The system prompt keeps the AI focused on L'Oréal beauty topics */
const systemPrompt = `You are a friendly L'Oréal beauty advisor.
Only answer questions about the user's generated routine, skincare, haircare,
makeup, fragrance, and other beauty topics, using L'Oréal brand products
(L'Oréal Paris, CeraVe, La Roche-Posay, Lancôme, Garnier, Maybelline, Kiehl's,
and others). If the user asks about something unrelated, politely say you can
only help with beauty routines and products, and steer back to their routine.
When you build a routine, give clear numbered steps, say whether each step is
for morning or night, and explain briefly why each product is used.
Write in plain text without markdown symbols like ** or #.`;

/* The whole conversation. We send all of it to the Worker every time,
   because OpenAI does not remember earlier messages on its own. */
const messages = [{ role: "system", content: systemPrompt }];

/* ---------- Products ---------- */

/* Load product data from the JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Show the products that match the category menu and the search box */
function showFilteredProducts() {
  const category = categoryFilter.value;
  const searchText = productSearch.value.trim().toLowerCase();

  /* filter() keeps only the products that pass both checks */
  const filtered = allProducts.filter((product) => {
    const matchesCategory = category === "" || product.category === category;
    const text = `${product.name} ${product.brand} ${product.description}`.toLowerCase();
    const matchesSearch = text.includes(searchText);
    return matchesCategory && matchesSearch;
  });

  displayProducts(filtered);
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">No products match your search.</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      /* Add the "selected" class if this product is already picked */
      const isSelected = selectedIds.includes(product.id) ? "selected" : "";
      return `
        <div class="product-card ${isSelected}" data-id="${product.id}">
          <div class="card-top">
            <img src="${product.image}" alt="${product.name}">
            <div class="product-info">
              <h3>${product.name}</h3>
              <p>${product.brand}</p>
            </div>
          </div>
          <button class="details-btn" type="button">Details</button>
          <p class="product-description">${product.description}</p>
        </div>
      `;
    })
    .join("");
}

/* One click listener on the grid handles every card (event delegation) */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  /* The Details button shows or hides the description instead of selecting */
  if (e.target.classList.contains("details-btn")) {
    card.classList.toggle("show-details");
    e.target.textContent = card.classList.contains("show-details")
      ? "Hide details"
      : "Details";
    return;
  }

  toggleProduct(Number(card.dataset.id));
});

/* Add a product to the selection, or remove it if it's already there */
function toggleProduct(id) {
  if (selectedIds.includes(id)) {
    selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
  } else {
    selectedIds.push(id);
  }
  saveAndRefresh();
}

/* Save picks to localStorage, then redraw the grid and the selected list */
function saveAndRefresh() {
  localStorage.setItem("selectedProducts", JSON.stringify(selectedIds));
  showFilteredProducts();
  renderSelectedList();
}

/* Show the picked products as small chips with a remove button */
function renderSelectedList() {
  const selected = allProducts.filter((p) => selectedIds.includes(p.id));

  if (selected.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="empty-selection">Click products above to add them here.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selected
    .map(
      (product) => `
      <div class="selected-chip">
        <span>${product.brand} ${product.name}</span>
        <button type="button" data-id="${product.id}" aria-label="Remove ${product.name}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `
    )
    .join("");
}

/* Remove a single product from the selected list */
selectedProductsList.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  toggleProduct(Number(button.dataset.id));
});

/* Clear every selection at once */
clearBtn.addEventListener("click", () => {
  selectedIds = [];
  saveAndRefresh();
});

/* Re-filter whenever the category or search text changes */
categoryFilter.addEventListener("change", showFilteredProducts);
productSearch.addEventListener("input", showFilteredProducts);

/* ---------- Chat ---------- */

/* Add a message bubble to the chat window */
function addMessage(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${sender}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* Send the whole conversation to the Worker and show the AI's reply */
async function askAI() {
  const loading = addMessage("Thinking…", "ai loading");
  generateBtn.disabled = true;

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });
    const data = await response.json();

    if (!response.ok || !data.choices) {
      throw new Error(data.error ? data.error.message : "No reply from the AI.");
    }

    const reply = data.choices[0].message.content;
    messages.push({ role: "assistant", content: reply });
    loading.remove();
    addMessage(reply, "ai");
  } catch (error) {
    /* Take the unanswered user message back out so the history stays clean */
    messages.pop();
    loading.remove();
    addMessage(`Sorry, something went wrong: ${error.message}`, "ai");
  }

  generateBtn.disabled = false;
}

/* Generate Routine: send the selected products' details to the AI */
generateBtn.addEventListener("click", async () => {
  const selected = allProducts.filter((p) => selectedIds.includes(p.id));

  if (selected.length === 0) {
    addMessage("Pick at least one product first, then click Generate Routine.", "ai");
    return;
  }

  /* Only send the fields the AI needs */
  const productData = selected.map((p) => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
  }));

  const request = `Build me a personalized routine using these products:\n${JSON.stringify(productData, null, 2)}`;

  addMessage(`Generate a routine with: ${selected.map((p) => p.name).join(", ")}`, "user");
  messages.push({ role: "user", content: request });
  await askAI();
});

/* Follow-up questions from the chat box */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question) return;

  addMessage(question, "user");
  messages.push({ role: "user", content: question });
  userInput.value = "";
  await askAI();
});

/* ---------- LevelUp: right-to-left layout ---------- */
dirToggle.addEventListener("click", () => {
  const isRTL = document.documentElement.dir === "rtl";
  document.documentElement.dir = isRTL ? "ltr" : "rtl";
  dirToggle.textContent = isRTL ? "Switch to RTL (عربى)" : "Switch to LTR (English)";
});

/* ---------- Start the page ---------- */
async function init() {
  allProducts = await loadProducts();
  showFilteredProducts();
  renderSelectedList();
  addMessage("Hi! Pick some products above and click Generate Routine, or ask me a beauty question.", "ai");
}

init();
