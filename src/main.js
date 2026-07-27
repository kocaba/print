import { ProductScene } from "./scene.js";
import { DesignEditor, FONT_FAMILIES } from "./editor.js";
import { submitOrder } from "./checkout.js";
import { PRODUCTS, DEFAULT_PRODUCT_ID } from "./products.js";

const els = {
  viewer3d: document.getElementById("viewer3d"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
  uvDebugBtn: document.getElementById("uvDebugBtn"),
  productSwitch: document.getElementById("productSwitch"),
  stageCanvas: document.getElementById("stageCanvas"),
  fileInput: document.getElementById("fileInput"),
  addTextBtn: document.getElementById("addTextBtn"),
  removeBgBtn: document.getElementById("removeBgBtn"),
  resetDesignBtn: document.getElementById("resetDesignBtn"),
  layersPanel: document.getElementById("layersPanel"),
  layersEmpty: document.getElementById("layersEmpty"),
  layersList: document.getElementById("layersList"),
  scaleRange: document.getElementById("scaleRange"),
  rotateRange: document.getElementById("rotateRange"),
  textControls: document.getElementById("textControls"),
  textContentInput: document.getElementById("textContentInput"),
  fontSelect: document.getElementById("fontSelect"),
  textColorInput: document.getElementById("textColorInput"),
  colorSwatches: document.getElementById("colorSwatches"),
  bgProgress: document.getElementById("bgProgress"),
  bgProgressBar: document.getElementById("bgProgressBar"),
  bgProgressText: document.getElementById("bgProgressText"),
  openCheckoutBtn: document.getElementById("openCheckoutBtn"),
  checkoutModal: document.getElementById("checkoutModal"),
  closeCheckoutBtn: document.getElementById("closeCheckoutBtn"),
  checkoutForm: document.getElementById("checkoutForm"),
  checkoutError: document.getElementById("checkoutError"),
  checkoutSuccess: document.getElementById("checkoutSuccess"),
  submitOrderBtn: document.getElementById("submitOrderBtn")
};

let currentProductId = DEFAULT_PRODUCT_ID;
let uvDebugActive = false;
const scene = new ProductScene(els.viewer3d);

// Заповнюємо список шрифтів
FONT_FAMILIES.forEach((f) => {
  const opt = document.createElement("option");
  opt.value = f;
  opt.textContent = f;
  opt.style.fontFamily = `"${f}"`;
  els.fontSelect.appendChild(opt);
});

const editor = new DesignEditor({
  stageCanvas: els.stageCanvas,
  onChange: () => {
    const tex = uvDebugActive ? editor.renderUvDebugTexture() : editor.renderProductionTexture();
    scene.updateTextureFromCanvas(tex);
  },
  onSelect: (layer) => syncControlsToLayer(layer),
  onLayersChange: (layers) => renderLayersList(layers)
});

async function loadProduct(productId) {
  const config = PRODUCTS[productId];
  currentProductId = productId;

  setLoading(true, `Завантаження моделі: ${config.label}…`);
  try {
    await scene.loadProduct(config);
    editor.setProduct(config);
    editor.setColor(config.colors[0]);
    renderColorSwatches(config);
  } catch (err) {
    console.error(err);
    setLoading(true, "Не вдалося завантажити 3D-модель. Перевірте /public/models/*.glb (див. README).");
    return;
  }
  setLoading(false);
}

function setLoading(isLoading, text) {
  els.loadingOverlay.classList.toggle("hidden", !isLoading);
  if (text) els.loadingText.textContent = text;
}

function renderColorSwatches(config) {
  els.colorSwatches.innerHTML = "";
  config.colors.forEach((hex, idx) => {
    const btn = document.createElement("button");
    btn.className = "swatch" + (idx === 0 ? " active" : "");
    btn.style.background = hex;
    btn.title = hex;
    btn.addEventListener("click", () => {
      editor.setColor(hex);
      [...els.colorSwatches.children].forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
    });
    els.colorSwatches.appendChild(btn);
  });
}

// --- Список шарів ---
function renderLayersList(layers) {
  els.layersEmpty.classList.toggle("hidden", layers.length > 0);
  els.layersList.innerHTML = "";
  // показуємо зверху донизу (останній доданий / верхній шар — першим у списку)
  [...layers].reverse().forEach((layer) => {
    const li = document.createElement("li");
    li.className = "layer-item" + (layer.id === editor.activeLayerId ? " active" : "");
    li.dataset.id = layer.id;

    const icon = document.createElement("span");
    icon.className = "layer-icon";
    icon.textContent = layer.type === "image" ? "🖼️" : "🔤";

    const label = document.createElement("span");
    label.className = "layer-label";
    label.textContent = layer.type === "image" ? "Зображення" : layer.text || "Текст";

    const del = document.createElement("button");
    del.className = "layer-delete";
    del.title = "Видалити шар";
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      editor.removeLayer(layer.id);
    });

    li.appendChild(icon);
    li.appendChild(label);
    li.appendChild(del);
    li.addEventListener("click", () => editor.selectLayer(layer.id));
    els.layersList.appendChild(li);
  });
}

// --- Синхронізація бічної панелі з обраним шаром ---
function syncControlsToLayer(layer) {
  [...els.layersList.children].forEach((li) => {
    li.classList.toggle("active", li.dataset.id === (layer && layer.id));
  });

  const hasLayer = !!layer;
  els.scaleRange.disabled = !hasLayer;
  els.rotateRange.disabled = !hasLayer;
  els.scaleRange.value = hasLayer ? layer.scale : 1;
  els.rotateRange.value = hasLayer ? layer.rotationDeg : 0;

  const isImage = hasLayer && layer.type === "image";
  els.removeBgBtn.disabled = !isImage;

  const isText = hasLayer && layer.type === "text";
  els.textControls.classList.toggle("hidden", !isText);
  if (isText) {
    els.textContentInput.value = layer.text;
    els.fontSelect.value = layer.fontFamily;
    els.textColorInput.value = layer.color;
  }
}

// --- Перемикання продукту ---
els.productSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".product-btn");
  if (!btn) return;
  [...els.productSwitch.children].forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  loadProduct(btn.dataset.product);
});

// --- Калібрування UV (щоб знайти правильні координати printArea під конкретну модель) ---
els.uvDebugBtn.addEventListener("click", () => {
  uvDebugActive = !uvDebugActive;
  els.uvDebugBtn.classList.toggle("active", uvDebugActive);
  const tex = uvDebugActive ? editor.renderUvDebugTexture() : editor.renderProductionTexture();
  scene.updateTextureFromCanvas(tex);
});

// --- Додавання зображення (кожен файл — окремий новий шар) ---
els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await editor.addImageLayer(file);
  els.fileInput.value = "";
});

// --- Додавання тексту ---
els.addTextBtn.addEventListener("click", () => {
  editor.addTextLayer();
});

// --- Видалення фону активного зображення ---
els.removeBgBtn.addEventListener("click", async () => {
  els.removeBgBtn.disabled = true;
  els.bgProgress.classList.remove("hidden");
  els.bgProgressBar.style.width = "0%";
  els.bgProgressText.textContent = "0%";
  try {
    await editor.removeBackgroundOnActive((percent, stage) => {
      els.bgProgressBar.style.width = percent + "%";
      els.bgProgressText.textContent = `${percent}% (${stage})`;
    });
  } catch (err) {
    console.error(err);
    alert("Не вдалося видалити фон. Спробуйте інше зображення.");
  } finally {
    els.bgProgress.classList.add("hidden");
    els.removeBgBtn.disabled = false;
  }
});

// --- Очищення всіх шарів ---
els.resetDesignBtn.addEventListener("click", () => {
  editor.reset();
});

// --- Слайдери масштабу / повороту активного шару ---
els.scaleRange.addEventListener("input", (e) => editor.setActiveScale(parseFloat(e.target.value)));
els.rotateRange.addEventListener("input", (e) => editor.setActiveRotation(parseFloat(e.target.value)));

// --- Контроли текстового шару ---
els.textContentInput.addEventListener("input", (e) => editor.updateActiveLayer({ text: e.target.value }));
els.fontSelect.addEventListener("change", (e) => editor.updateActiveLayer({ fontFamily: e.target.value }));
els.textColorInput.addEventListener("input", (e) => editor.updateActiveLayer({ color: e.target.value }));

// --- Модалка чекауту ---
els.openCheckoutBtn.addEventListener("click", () => {
  els.checkoutModal.classList.remove("hidden");
  els.checkoutForm.classList.remove("hidden");
  els.checkoutSuccess.classList.add("hidden");
  els.checkoutError.classList.add("hidden");
});
els.closeCheckoutBtn.addEventListener("click", () => {
  els.checkoutModal.classList.add("hidden");
});
els.checkoutModal.addEventListener("click", (e) => {
  if (e.target === els.checkoutModal) els.checkoutModal.classList.add("hidden");
});

els.checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.checkoutError.classList.add("hidden");

  if (!editor.hasDesign()) {
    els.checkoutError.textContent = "Спочатку додайте зображення або текст для друку.";
    els.checkoutError.classList.remove("hidden");
    return;
  }

  els.submitOrderBtn.disabled = true;
  els.submitOrderBtn.textContent = "Надсилання…";

  try {
    const formData = new FormData(els.checkoutForm);
    await submitOrder({
      formData,
      scene,
      editor,
      productConfig: PRODUCTS[currentProductId]
    });
    els.checkoutForm.classList.add("hidden");
    els.checkoutSuccess.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    els.checkoutError.textContent = err.message || "Сталася помилка. Спробуйте ще раз.";
    els.checkoutError.classList.remove("hidden");
  } finally {
    els.submitOrderBtn.disabled = false;
    els.submitOrderBtn.textContent = "Надіслати замовлення";
  }
});

// --- Старт ---
renderLayersList([]);
syncControlsToLayer(null);
loadProduct(currentProductId);
