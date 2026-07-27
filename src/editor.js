/**
 * DesignEditor (layer-based)
 * Відповідає за:
 *  - шари дизайну: зображення (декілька) та текст (декілька), кожен зі своєю
 *    трансформацією (позиція, масштаб, поворот)
 *  - завантаження зображення, видалення фону (client-side, @imgly/background-removal)
 *    для активного шару-зображення
 *  - інтерактивне переміщення / масштабування / обертання активного шару
 *    (drag, wheel, слайдери)
 *  - рендер прев'ю-канвасу (stage) та рендер фінальної текстури виробу
 *    (offscreen canvas), а також окремого "друк-онлі" файлу
 *  - режим калібрування UV (сітка з підписами) — щоб підібрати правильні
 *    координати printArea під конкретну 3D-модель (див. README)
 *
 * ВАЖЛИВО ПРО ПРОДУКТИВНІСТЬ:
 * stage-канвас (600x600, прев'ю) перемальовується синхронно при кожному
 * русі миші — це дешево. А ось повна текстура виробництва (2048x2048)
 * та заливка її в GPU-текстуру Three.js — дорога операція. Тому виклик
 * `onChange` (який якраз генерує 2048px canvas і штовхає його в сцену)
 * не викликається на кожен pointermove, а збирається через
 * requestAnimationFrame — максимум один раз за кадр.
 */

const FONT_FAMILIES = ["PT Sans", "Montserrat", "Oswald"];
let _uidCounter = 0;
function genId(prefix) {
  _uidCounter += 1;
  return `${prefix}_${_uidCounter}_${Date.now().toString(36)}`;
}

export class DesignEditor {
  /**
   * @param {Object} opts
   * @param {HTMLCanvasElement} opts.stageCanvas
   * @param {Function} opts.onChange - викликається (з тротлінгом через rAF),
   *        коли треба перемалювати 3D-текстуру
   * @param {Function} [opts.onSelect] - викликається з обраним шаром (або null),
   *        коли активний шар змінюється (клік по канвасу, додавання/видалення шару)
   * @param {Function} [opts.onLayersChange] - викликається зі списком шарів,
   *        коли їх кількість/порядок змінюється
   */
  constructor({ stageCanvas, onChange, onSelect, onLayersChange }) {
    this.stage = stageCanvas;
    this.stageCtx = stageCanvas.getContext("2d");
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.onLayersChange = onLayersChange || (() => {});

    this.product = null;
    this.color = "#ffffff";

    /** @type {Array<Object>} */
    this.layers = []; // порядок = порядок малювання (останній = зверху)
    this.activeLayerId = null;

    this.uvDebugMode = false;

    this._dragging = false;
    this._dragLayerId = null;
    this._dragOffset = { x: 0, y: 0 };

    // Кешовані offscreen-канваси для важких повнорозмірних рендерів,
    // щоб не створювати новий <canvas> (і не змушувати збирач сміття
    // працювати) на кожен виклик.
    this._prodCanvas = null;
    this._printCanvas = null;
    this._uvCanvas = null;

    this._rafPending = false;

    this._bindPointerEvents();

    // Прогріваємо шрифти заздалегідь, щоб текст не блимав дефолтним
    // шрифтом при першому використанні.
    if (document.fonts && document.fonts.load) {
      Promise.all(
        FONT_FAMILIES.map((f) => document.fonts.load(`700 40px "${f}"`).catch(() => {}))
      ).then(() => this.render());
    }
  }

  // ---------- Продукт / колір ----------

  setProduct(productConfig) {
    this.product = productConfig;
    this.render();
  }

  setColor(hex) {
    this.color = hex;
    this.render();
  }

  hasDesign() {
    return this.layers.length > 0;
  }

  getLayers() {
    return this.layers;
  }

  getActiveLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) || null;
  }

  setUvDebug(enabled) {
    this.uvDebugMode = enabled;
    this._scheduleOnChange(true);
  }

  // ---------- Шари: зображення ----------

  /** Додає новий шар-зображення з File, центрує його в зоні друку. */
  async addImageLayer(file) {
    const img = await fileToImage(file);
    const pa = this.product.printArea;
    const areaAspect = pa.width / pa.height;
    const imgAspect = img.width / img.height;

    let baseWidthNorm, baseHeightNorm;
    if (imgAspect > areaAspect) {
      baseWidthNorm = pa.width;
      baseHeightNorm = pa.width / imgAspect;
    } else {
      baseHeightNorm = pa.height;
      baseWidthNorm = pa.height * imgAspect;
    }

    const layer = {
      id: genId("img"),
      type: "image",
      img,
      originalFile: file,
      processedIsBgRemoved: false,
      baseWidthNorm,
      baseHeightNorm,
      xNorm: pa.x + pa.width / 2,
      yNorm: pa.y + pa.height / 2,
      scale: 1,
      rotationDeg: 0
    };
    this.layers.push(layer);
    this._setActive(layer.id);
    this._notifyLayersChange();
    this.render();
    return layer;
  }

  /** Замінює зображення активного шару (напр. після видалення фону), зберігаючи трансформацію. */
  async _replaceActiveImage(fileOrBlob) {
    const layer = this.getActiveLayer();
    if (!layer || layer.type !== "image") return;
    const img = await fileToImage(fileOrBlob);
    layer.img = img;
    this.render();
  }

  /** Видалення фону через @imgly/background-removal для активного шару-зображення. */
  async removeBackgroundOnActive(onProgress) {
    const layer = this.getActiveLayer();
    if (!layer || layer.type !== "image") return;
    const { removeBackground } = await import("@imgly/background-removal");
    const sourceBlob = await imageElementToBlob(layer.img);

    const resultBlob = await removeBackground(sourceBlob, {
      progress: (key, current, total) => {
        if (onProgress) onProgress(Math.round((current / total) * 100), key);
      }
    });

    layer.processedIsBgRemoved = true;
    await this._replaceActiveImage(resultBlob);
    return resultBlob;
  }

  // ---------- Шари: текст ----------

  /** Додає новий текстовий шар по центру зони друку. */
  addTextLayer(initialText = "Ваш текст") {
    const pa = this.product.printArea;
    const layer = {
      id: genId("txt"),
      type: "text",
      text: initialText,
      fontFamily: FONT_FAMILIES[0],
      color: "#000000",
      fontSizeNorm: pa.height * 0.22, // відносно висоти всього канвасу
      xNorm: pa.x + pa.width / 2,
      yNorm: pa.y + pa.height / 2,
      scale: 1,
      rotationDeg: 0
    };
    this.layers.push(layer);
    this._setActive(layer.id);
    this._notifyLayersChange();
    this.render();
    return layer;
  }

  /** Оновлює властивості активного шару (текст, шрифт, колір тощо). */
  updateActiveLayer(patch) {
    const layer = this.getActiveLayer();
    if (!layer) return;
    Object.assign(layer, patch);
    this.render();
  }

  // ---------- Спільне керування шарами ----------

  selectLayer(id) {
    this._setActive(id);
    this.render();
  }

  removeLayer(id) {
    this.layers = this.layers.filter((l) => l.id !== id);
    if (this.activeLayerId === id) {
      const next = this.layers[this.layers.length - 1] || null;
      this._setActive(next ? next.id : null);
    }
    this._notifyLayersChange();
    this.render();
  }

  reset() {
    this.layers = [];
    this._setActive(null);
    this._notifyLayersChange();
    this.render();
  }

  setActiveScale(scale) {
    const layer = this.getActiveLayer();
    if (!layer) return;
    layer.scale = clamp(scale, 0.1, 4);
    this.render();
  }

  setActiveRotation(deg) {
    const layer = this.getActiveLayer();
    if (!layer) return;
    layer.rotationDeg = deg;
    this.render();
  }

  _setActive(id) {
    this.activeLayerId = id;
    this.onSelect(this.getActiveLayer());
  }

  _notifyLayersChange() {
    this.onLayersChange(this.layers);
  }

  // ---------- Рендер ----------

  /** Малює прев'ю на видимому stage-канвасі (те, що бачить користувач). Синхронно, дешево. */
  render() {
    const ctx = this.stageCtx;
    const W = this.stage.width;
    const H = this.stage.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, W, H);

    if (this.product) {
      const pa = this.product.printArea;
      ctx.save();
      ctx.strokeStyle = "rgba(76,110,245,0.9)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(pa.x * W, pa.y * H, pa.width * W, pa.height * H);
      ctx.restore();
    }

    for (const layer of this.layers) {
      this._drawLayer(ctx, layer, W, H, layer.id === this.activeLayerId);
    }

    this._scheduleOnChange();
  }

  _drawLayer(ctx, layer, W, H, isActive) {
    const b = this._getLayerBounds(ctx, layer, W, H);

    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate((layer.rotationDeg * Math.PI) / 180);

    if (layer.type === "image") {
      ctx.drawImage(layer.img, -b.w / 2, -b.h / 2, b.w, b.h);
    } else if (layer.type === "text") {
      ctx.fillStyle = layer.color;
      ctx.font = `700 ${b.fontPx}px "${layer.fontFamily}"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(layer.text || "", 0, 0);
    }
    ctx.restore();

    if (isActive) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate((layer.rotationDeg * Math.PI) / 180);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-b.w / 2 - 6, -b.h / 2 - 6, b.w + 12, b.h + 12);
      ctx.restore();
    }
  }

  /** Повертає {cx,cy,w,h[,fontPx]} шару в піксельних координатах канвасу W×H. */
  _getLayerBounds(ctx, layer, W, H) {
    const cx = layer.xNorm * W;
    const cy = layer.yNorm * H;
    if (layer.type === "image") {
      const w = layer.baseWidthNorm * layer.scale * W;
      const h = layer.baseHeightNorm * layer.scale * H;
      return { cx, cy, w, h };
    }
    // text
    const fontPx = layer.fontSizeNorm * layer.scale * H;
    ctx.font = `700 ${fontPx}px "${layer.fontFamily}"`;
    const metrics = ctx.measureText(layer.text || " ");
    const w = Math.max(metrics.width, 1);
    const h = fontPx * 1.25;
    return { cx, cy, w, h, fontPx };
  }

  /**
   * Рендерить фінальну текстуру продукту у повній роздільній здатності
   * (для 3D-матеріалу і для файлу, що йде у виробництво).
   * Використовує кешований canvas, щоб не створювати новий об'єкт щоразу.
   */
  renderProductionTexture() {
    const canvas = this._getCachedCanvas("_prodCanvas", this.product.textureSize);
    const ctx = canvas.getContext("2d");
    const size = canvas.width;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, size, size);

    const pa = this.product.printArea;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pa.x * size, pa.y * size, pa.width * size, pa.height * size);
    ctx.clip();
    for (const layer of this.layers) {
      this._drawLayer(ctx, layer, size, size, false);
    }
    ctx.restore();
    return canvas;
  }

  /** Тільки принт (прозорий фон навколо), без кольору виробу — окремий файл для друкарні. */
  renderPrintOnlyFile() {
    const canvas = this._getCachedCanvas("_printCanvas", this.product.textureSize);
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    for (const layer of this.layers) {
      this._drawLayer(ctx, layer, size, size, false);
    }
    return canvas;
  }

  /**
   * Режим калібрування: малює на весь канвас пронумеровану сітку
   * (без урахування printArea/кольору/шарів), щоб побачити на реальній
   * 3D-моделі, яка клітинка де опиняється — і за цим підібрати правильні
   * координати printArea у products.js.
   */
  renderUvDebugTexture() {
    const canvas = this._getCachedCanvas("_uvCanvas", this.product.textureSize);
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cols = 8;
    const rows = 8;
    const cw = size / cols;
    const ch = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const even = (r + c) % 2 === 0;
        ctx.fillStyle = even ? "#ff4d4d" : "#ffe14d";
        ctx.fillRect(c * cw, r * ch, cw, ch);
        ctx.fillStyle = "#000000";
        ctx.font = `bold ${Math.floor(cw * 0.22)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${c},${r}`, c * cw + cw / 2, r * ch + ch / 2);
      }
    }
    // Контур поточної printArea для орієнтиру
    if (this.product) {
      const pa = this.product.printArea;
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = size * 0.006;
      ctx.strokeRect(pa.x * size, pa.y * size, pa.width * size, pa.height * size);
    }
    return canvas;
  }

  _getCachedCanvas(key, size) {
    let canvas = this[key];
    if (!canvas || canvas.width !== size) {
      canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      this[key] = canvas;
    }
    return canvas;
  }

  /** Тротлимо важкий колбек (генерація 2048px текстури + заливка в GPU) через rAF. */
  _scheduleOnChange(force = false) {
    if (this._rafPending && !force) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.onChange();
    });
  }

  // ---------- Взаємодія мишею/тачем ----------

  _bindPointerEvents() {
    const el = this.stage;

    const getPos = (e) => {
      const rect = el.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * el.width,
        y: ((clientY - rect.top) / rect.height) * el.height
      };
    };

    const hitTestLayer = (layer, pos) => {
      const ctx = this.stageCtx;
      const b = this._getLayerBounds(ctx, layer, el.width, el.height);
      const angle = (-layer.rotationDeg * Math.PI) / 180;
      const dx = pos.x - b.cx;
      const dy = pos.y - b.cy;
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      return Math.abs(localX) <= b.w / 2 && Math.abs(localY) <= b.h / 2;
    };

    const findTopHit = (pos) => {
      for (let i = this.layers.length - 1; i >= 0; i--) {
        if (hitTestLayer(this.layers[i], pos)) return this.layers[i];
      }
      return null;
    };

    const down = (e) => {
      const pos = getPos(e);
      const hit = findTopHit(pos);
      if (!hit) return;
      this._setActive(hit.id);
      this._dragging = true;
      this._dragLayerId = hit.id;
      this._dragOffset = {
        x: pos.x - hit.xNorm * el.width,
        y: pos.y - hit.yNorm * el.height
      };
      el.style.cursor = "grabbing";
      this.render();
    };
    const move = (e) => {
      if (!this._dragging) return;
      const layer = this.layers.find((l) => l.id === this._dragLayerId);
      if (!layer) return;
      e.preventDefault();
      const pos = getPos(e);
      layer.xNorm = clamp((pos.x - this._dragOffset.x) / el.width, 0, 1);
      layer.yNorm = clamp((pos.y - this._dragOffset.y) / el.height, 0, 1);
      this.render();
    };
    const up = () => {
      this._dragging = false;
      this._dragLayerId = null;
      el.style.cursor = "grab";
    };
    const wheel = (e) => {
      const layer = this.getActiveLayer();
      if (!layer) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      this.setActiveScale(layer.scale + delta);
      const slider = document.getElementById("scaleRange");
      if (slider) slider.value = layer.scale;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
  }
}

export { FONT_FAMILIES };

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function fileToImage(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function imageElementToBlob(img) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    c.toBlob((blob) => resolve(blob), "image/png");
  });
}
