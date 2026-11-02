"use strict";

const $ = (sel, el = document) => el.querySelector(sel);

const state = {
  byId: new Map(),       // every product we've seen, keyed by id (used by the cart)
  category: "All",
  sort: "featured",
  q: "",
  currency: "USD",
  cart: loadCart(),      // { [productId]: quantity }
};

/* ------------------------------------------------------------------ helpers */
function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem("cart"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem("cart", JSON.stringify(state.cart));
  } catch {
    /* storage unavailable; the cart still works for this visit */
  }
}

function money(minor) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: state.currency }).format(minor / 100);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

/* ------------------------------------------------------------ product art */
const SHAPES = {
  vase: '<path d="M82 36h36v22c34 22 44 62 22 104-4 8-12 10-22 10H82c-10 0-18-2-22-10-22-42-12-82 22-104z"/>',
  mug: '<rect x="52" y="58" width="82" height="96" rx="12"/><path d="M134 80h12a22 22 0 0 1 0 44h-12" fill="none" style="stroke:var(--c)" stroke-width="10"/>',
  bowl: '<path d="M34 88h132c0 38-28 70-66 70s-66-32-66-70z"/>',
  plate: '<ellipse cx="100" cy="112" rx="76" ry="26"/><ellipse cx="100" cy="108" rx="48" ry="14" fill="#fff" fill-opacity=".35"/>',
  textile:
    '<rect x="36" y="48" width="128" height="104" rx="4"/>' +
    '<g stroke="#fff" stroke-opacity=".5" stroke-width="6"><path d="M36 78h128M36 104h128M36 130h128"/></g>',
  cushion: '<path d="M46 56c36-10 72-10 108 0 8 30 8 58 0 88-36 10-72 10-108 0-8-30-8-58 0-88z"/>',
};

const PRODUCT_IMAGES = new Map([
  [1, "https://img.freepik.com/premium-psd/empty-glass-jar-isolated-transparent-background-png-psd_888962-443.jpg"],
  [2, "https://i.pinimg.com/originals/ea/c4/32/eac432e6e5237d6e0ce98a51efd4ddbc.jpg"],
  [3, "https://jantasteel.com/wp-content/uploads/2023/11/020001577A.png"],
  [4, "https://i.etsystatic.com/36050469/r/il/c02503/5005081052/il_800x800.5005081052_h7tt.jpg"],
  [5, "https://th.bing.com/th?id=OPAC.K8VJ7sZpJzX%2b1A474C474&w=658&h=658&qlt=100&o=5&dpr=1.3&pid=21.1"],
  [6, "https://th.bing.com/th/id/OPAC.ww817fR7INxIkw474C474?w=658&h=658&qlt=100&o=5&dpr=1.3&pid=21.1"],
  [7, "https://www.rhool.com/cdn/shop/products/recycled-yellow-striped-cotton-throwthrowmadam-stoltz-525683_1024x1024.jpg?v=1669099661"],
  [8, "https://www.opalandolive.com/cdn/shop/products/f992bb6dd2fd46c27103e58062137322f40bde2a44c9304b827ff79cdfc879e6.jpg?v=1628031110"],
  [9, "https://alderandloom.com/cdn/shop/files/S3a333d97a4204009945249c72447bcf2v.webp?v=1764160924&width=3840"],
  [10, "https://tse4.mm.bing.net/th/id/OIP.EGHShea5QISY3oia-QjMcAHaHa?r=0&w=1200&h=1200&rs=1&pid=ImgDetMain&o=7&rm=3"],
]);

function art(product) {
  const tile = el("div", { class: "tile", style: `--c:${/^#[0-9a-f]{3,8}$/i.test(product.color) ? product.color : "#2d4fd8"}` });
  const imageUrl = PRODUCT_IMAGES.get(product.id);
  if (imageUrl) {
    tile.append(el("img", {
      src: imageUrl,
      alt: product.name,
      loading: "eager",
      onerror: () => {
        tile.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">${SHAPES[product.shape] || SHAPES.bowl}</svg>`;
      },
    }));
  } else {
    tile.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">${SHAPES[product.shape] || SHAPES.bowl}</svg>`;
  }
  return tile;
}

/* ------------------------------------------------------------ product grid */
async function loadProducts() {
  const params = new URLSearchParams({ sort: state.sort });
  if (state.q) params.set("q", state.q);
  if (state.category !== "All") params.set("category", state.category);

  const status = $("#status");
  try {
    const products = await api(`/api/products?${params}`);
    products.forEach((p) => state.byId.set(p.id, p));
    renderGrid(products);
    status.textContent = products.length ? "" : "No products match that search. Try a different word or clear the category.";
  } catch (err) {
    $("#grid").replaceChildren();
    status.textContent = `Could not load products. ${err.message}`;
  }
}

function renderGrid(products) {
  const grid = $("#grid");
  grid.replaceChildren(
    ...products.map((p) => {
      const soldOut = p.stock <= 0;
      const add = el(
        "button",
        { class: "primary add-btn", type: "button", onclick: () => addToCart(p.id) },
        soldOut ? "Sold out" : "Add to cart"
      );
      add.disabled = soldOut;

      const note = !soldOut && p.stock <= 5 ? el("span", { class: "stock-note" }, `${p.stock} left`) : "";

      return el(
        "article",
        { class: "product" + (soldOut ? " sold-out" : "") },
        art(p),
        el("h3", { class: "product-name" }, p.name),
        el("p", { class: "product-desc" }, p.description),
        el("div", { class: "product-foot" }, el("span", { class: "price" }, money(p.price)), note, add)
      );
    })
  );
}

async function loadCategories() {
  const cats = ["All", ...(await api("/api/categories"))];
  const wrap = $("#categories");
  wrap.replaceChildren(
    ...cats.map((c) =>
      el(
        "button",
        {
          class: "cat-btn",
          type: "button",
          "aria-pressed": String(c === state.category),
          onclick: () => {
            state.category = c;
            wrap.querySelectorAll(".cat-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === c)));
            loadProducts();
          },
        },
        c
      )
    )
  );
}

/* --------------------------------------------------------------------- cart */
function cartEntries() {
  // Drop anything the server no longer lists.
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ product: state.byId.get(Number(id)), qty }))
    .filter((e) => e.product);
}

function addToCart(id) {
  const p = state.byId.get(id);
  const next = (state.cart[id] || 0) + 1;
  if (!p || next > p.stock) return;
  state.cart[id] = next;
  saveCart();
  renderCart();
  openCart();
}

function changeQty(id, delta) {
  const p = state.byId.get(id);
  const next = (state.cart[id] || 0) + delta;
  if (next <= 0) delete state.cart[id];
  else if (p && next <= p.stock) state.cart[id] = next;
  saveCart();
  renderCart();
}

function cartTotal() {
  return cartEntries().reduce((sum, e) => sum + e.product.price * e.qty, 0);
}

function renderCart() {
  const entries = cartEntries();
  const list = $("#cart-items");

  $("#cart-count").textContent = entries.reduce((n, e) => n + e.qty, 0);
  $("#cart-total").textContent = money(cartTotal());
  $("#checkout-btn").disabled = entries.length === 0;

  if (!entries.length) {
    list.replaceChildren(el("li", { class: "cart-empty" }, "Your cart is empty. Add something from the shop."));
    return;
  }

  list.replaceChildren(
    ...entries.map(({ product: p, qty }) =>
      el(
        "li",
        { class: "cart-line" },
        art(p),
        el(
          "div",
          {},
          el("div", { class: "cart-line-name" }, p.name),
          el(
            "div",
            { class: "qty" },
            el("button", { type: "button", "aria-label": `Remove one ${p.name}`, onclick: () => changeQty(p.id, -1) }, "−"),
            el("span", {}, String(qty)),
            el("button", { type: "button", "aria-label": `Add one ${p.name}`, onclick: () => changeQty(p.id, 1) }, "+")
          )
        ),
        el("div", { class: "cart-line-price" }, money(p.price * qty))
      )
    )
  );
}

function openCart() {
  $("#overlay").hidden = false;
  const drawer = $("#cart");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  $("#close-cart").focus();
}

function closeCart() {
  $("#overlay").hidden = true;
  const drawer = $("#cart");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

/* ----------------------------------------------------------------- checkout */
const dialog = $("#checkout");
const form = $("#checkout-form");

function openCheckout() {
  closeCart();
  $("#form-error").textContent = "";
  $("#order-total").textContent = `(${money(cartTotal())})`;
  form.hidden = false;
  $("#confirmation").hidden = true;
  dialog.showModal();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#form-error");
  const submit = form.querySelector('button[type="submit"]');
  error.textContent = "";

  const fd = new FormData(form);
  const payload = {
    customer: { name: fd.get("name"), email: fd.get("email"), address: fd.get("address") },
    items: cartEntries().map((e) => ({ id: e.product.id, qty: e.qty })),
  };

  submit.disabled = true;
  try {
    const result = await api("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.cart = {};
    saveCart();
    renderCart();
    $("#order-id").textContent = result.order_id;
    form.hidden = true;
    $("#confirmation").hidden = false;
    form.reset();
    loadProducts(); // refresh stock counts
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
  }
});

/* ------------------------------------------------------------------- wiring */
$("#open-cart").addEventListener("click", openCart);
$("#close-cart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#checkout-btn").addEventListener("click", openCheckout);
$("#cancel-checkout").addEventListener("click", () => { dialog.close(); openCart(); });
$("#done-btn").addEventListener("click", () => dialog.close());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });

$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; loadProducts(); });

let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); loadProducts(); }, 250);
});

(async function init() {
  try {
    state.currency = (await api("/api/config")).currency;
    await loadCategories();
  } catch {
    /* the product request below reports connection problems */
  }
  await loadProducts();
  renderCart();
})();
