# Project 9: L'Oréal Routine Builder

L'Oréal is expanding what's possible with AI, and now your chatbot is getting smarter. This week, you'll upgrade it into a product-aware routine builder.

Users will be able to browse real L'Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

**Live site:** https://zljones1.github.io/loreal-routine-builder/

## ✅ What's built

- **L'Oréal branding:** official logo, brand red `#ff003b` and gold `#e3a535`, Montserrat type, chat bubbles.
- **Product selection:** click (or press Enter/Space on) a product card to select or unselect it. Selected cards get a red border and a check badge, and the **Selected Products** list updates right away. Each item in the list has its own remove (×) button.
- **Product descriptions:** every card has a **Details** button that expands the card to show the full description (accessible with `aria-expanded`).
- **Generate Routine:** collects only the selected products and sends their JSON (name, brand, category, description) to OpenAI through the Cloudflare Worker. The routine appears in the chat window.
- **Follow-up chat:** the full `messages` history is sent on every request, so the advisor remembers the routine. A system prompt keeps answers to the routine and to skincare, haircare, makeup, fragrance, and related topics.
- **Saved selections:** selected products are stored in `localStorage`, so they stay after a reload. **Clear all** empties the list.
- **Cloudflare Worker:** `script.js` calls the Worker in `WORKER_URL`. No API key is in this repo.

### LevelUps

- **Product Search (10 pts):** the search box filters products by name, brand, or keyword as you type, and works together with the category filter.
- **RTL Language Support (5 pts):** the language menu switches the page to Arabic or Hebrew (right-to-left). The product grid, selected list, and chat all flip using `dir="rtl"` and CSS logical properties, and the advisor answers in the chosen language. The choice is saved.
- **Web Search (10 pts):** the "Use live web search" checkbox sends `webSearch: true`. The updated `RESOURCE_cloudflare-worker.js` then uses `gpt-4o-search-preview`, and the page shows the source links it returns. **To turn this on, paste the updated Worker code into your Cloudflare Worker and redeploy** (steps below). Until then, the checkbox is ignored and you get a normal answer.

## ☁️ Cloudflare Worker setup

1. Log in to https://dash.cloudflare.com → **Workers & Pages** → open your Worker (or **Create → Create Worker**).
2. Click **Edit code**, replace everything with `RESOURCE_cloudflare-worker.js` from this repo, and click **Deploy**.
3. Under **Settings → Variables and Secrets**, make sure there is a **Secret** named `OPENAI_API_KEY` holding your OpenAI key.
4. Copy the Worker URL (like `https://your-worker.your-subdomain.workers.dev/`) into `WORKER_URL` at the top of `script.js`.

Never put the OpenAI key in `script.js` or any other file in this repo.

## 🚀 Launch via GitHub Codespaces

1. In the GitHub repo, click the **Code** button and select **Open with Codespaces → New codespace**.
2. Once your codespace is ready, open the `index.html` file via the live preview.
