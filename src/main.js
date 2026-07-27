import { ProductScene } from "./scene.js";
import { DesignEditor } from "./editor.js";
import { submitOrder } from "./checkout.js";
import { PRODUCTS, DEFAULT_PRODUCT_ID } from "./products.js";

const els = {
  viewer3d: document.getElementById("viewer3d"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
  productSwitch: document.getElementById("productSwitch"),
  stageCanvas: document.getElementById("stageCanvas"),
  fileInput: document.getElementById("fileInput"),
  removeBgBtn: document.getElementById("removeBgBtn"),
  resetDesignBtn: document.getElementById("resetDesignBtn"),
  scaleRange: document.getElementById("scaleRange"),
  rotateRange: document.getElementById("rotateRange"),
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
const scene = new ProductScene(els.viewer3d);

const editor = new DesignEditor({
  stageCanvas: els.stageCanvas,
  onChange: () => {
    const tex = editor.renderProductionTexture();
    scene.updateTextureFromCanvas(tex);
  }
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

// --- Перемикання продукту ---
els.productSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".product-btn");
  if (!btn) return;
  [...els.productSwitch.children].forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  loadProduct(btn.dataset.product);
});

// --- Завантаження зображення ---
els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await editor.loadImageFile(file);
  toggleDesignControls(true);
});

function toggleDesignControls(enabled) {
  els.removeBgBtn.disabled = !enabled;
  els.resetDesignBtn.disabled = !enabled;
  els.scaleRange.disabled = !enabled;
  els.rotateRange.disabled = !enabled;
  els.scaleRange.value = 1;
  els.rotateRange.value = 0;
}

// --- Видалення фону ---
els.removeBgBtn.addEventListener("click", async () => {
  els.removeBgBtn.disabled = true;
  els.bgProgress.classList.remove("hidden");
  els.bgProgressBar.style.width = "0%";
  els.bgProgressText.textContent = "0%";
  try {
    await editor.removeBackground((percent, stage) => {
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

// --- Скидання дизайну ---
els.resetDesignBtn.addEventListener("click", () => {
  editor.reset();
  els.fileInput.value = "";
  toggleDesignControls(false);
});

// --- Слайдери масштабу / повороту ---
els.scaleRange.addEventListener("input", (e) => editor.setScale(parseFloat(e.target.value)));
els.rotateRange.addEventListener("input", (e) => editor.setRotation(parseFloat(e.target.value)));

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
    els.checkoutError.textContent = "Спочатку завантажте зображення для друку.";
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
toggleDesignControls(false);
loadProduct(currentProductId);
