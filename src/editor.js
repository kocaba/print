/**
 * DesignEditor
 * Відповідає за:
 *  - завантаження зображення користувача
 *  - видалення фону (client-side, @imgly/background-removal)
 *  - інтерактивне переміщення / масштабування / обертання (drag, wheel, слайдери)
 *  - рендер прев'ю-канвасу (stage) та рендер фінальної текстури виробу (offscreen canvas)
 */

export class DesignEditor {
  /**
   * @param {Object} opts
   * @param {HTMLCanvasElement} opts.stageCanvas
   * @param {Function} opts.onChange - викликається щоразу, коли треба перемалювати 3D-текстуру
   */
  constructor({ stageCanvas, onChange }) {
    this.stage = stageCanvas;
    this.stageCtx = stageCanvas.getContext("2d");
    this.onChange = onChange || (() => {});

    this.product = null; // поточний конфіг продукту (з products.js)
    this.color = "#ffffff";

    this.design = null; // { img, baseWidthNorm, baseHeightNorm, xNorm, yNorm, scale, rotationDeg }
    this.originalFile = null; // File — оригінал, що йде в архів для виробництва
    this.processedIsBgRemoved = false;

    this._dragging = false;
    this._dragOffset = { x: 0, y: 0 };

    this._bindPointerEvents();
  }

  setProduct(productConfig) {
    this.product = productConfig;
    this.render();
  }

  setColor(hex) {
    this.color = hex;
    this.render();
  }

  hasDesign() {
    return !!this.design;
  }

  /** Завантажує File зображення, ставить його за замовчуванням по центру зони друку. */
  async loadImageFile(file) {
    this.originalFile = file;
    this.processedIsBgRemoved = false;
    const img = await fileToImage(file);
    this._applyImage(img);
  }

  /** Замінює поточне зображення (напр. після видалення фону), зберігаючи трансформацію. */
  async replaceImageKeepTransform(fileOrBlob) {
    const img = await fileToImage(fileOrBlob);
    const prev = this.design;
    this._applyImage(img);
    if (prev) {
      this.design.xNorm = prev.xNorm;
      this.design.yNorm = prev.yNorm;
      this.design.scale = prev.scale;
      this.design.rotationDeg = prev.rotationDeg;
    }
    this.render();
  }

  _applyImage(img) {
    const pa = this.product.printArea;
    const areaAspect = pa.width / pa.height;
    const imgAspect = img.width / img.height;

    // baseWidth/Height у нормалізованих координатах (0..1 відносно всього канвасу),
    // підібрані так, щоб зображення при scale=1 вписувалось у зону друку.
    let baseWidthNorm, baseHeightNorm;
    if (imgAspect > areaAspect) {
      baseWidthNorm = pa.width;
      baseHeightNorm = pa.width / imgAspect;
    } else {
      baseHeightNorm = pa.height;
      baseWidthNorm = pa.height * imgAspect;
    }

    this.design = {
      img,
      baseWidthNorm,
      baseHeightNorm,
      xNorm: pa.x + pa.width / 2,
      yNorm: pa.y + pa.height / 2,
      scale: 1,
      rotationDeg: 0
    };
    this.render();
  }

  reset() {
    this.design = null;
    this.originalFile = null;
    this.processedIsBgRemoved = false;
    this.render();
  }

  setScale(scale) {
    if (!this.design) return;
    this.design.scale = clamp(scale, 0.1, 3);
    this.render();
  }

  setRotation(deg) {
    if (!this.design) return;
    this.design.rotationDeg = deg;
    this.render();
  }

  /** Видалення фону через @imgly/background-removal (повністю в браузері). */
  async removeBackground(onProgress) {
    if (!this.originalFile) return;
    const { removeBackground } = await import("@imgly/background-removal");
    const sourceBlob = this.design ? await imageElementToBlob(this.design.img) : this.originalFile;

    const resultBlob = await removeBackground(sourceBlob, {
      progress: (key, current, total) => {
        if (onProgress) onProgress(Math.round((current / total) * 100), key);
      }
    });

    this.processedIsBgRemoved = true;
    await this.replaceImageKeepTransform(resultBlob);
    return resultBlob;
  }

  /** Малює прев'ю на видимому stage-канвасі (те, що бачить користувач). */
  render() {
    const ctx = this.stageCtx;
    const W = this.stage.width;
    const H = this.stage.height;
    ctx.clearRect(0, 0, W, H);

    // Базовий колір виробу
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, W, H);

    // Зона друку (напрямна рамка)
    if (this.product) {
      const pa = this.product.printArea;
      ctx.save();
      ctx.strokeStyle = "rgba(76,110,245,0.9)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(pa.x * W, pa.y * H, pa.width * W, pa.height * H);
      ctx.restore();
    }

    // Дизайн
    if (this.design) {
      this._drawDesign(ctx, W, H);
    }

    this.onChange();
  }

  _drawDesign(ctx, W, H) {
    const d = this.design;
    const w = d.baseWidthNorm * d.scale * W;
    const h = d.baseHeightNorm * d.scale * H;
    const cx = d.xNorm * W;
    const cy = d.yNorm * H;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((d.rotationDeg * Math.PI) / 180);
    ctx.drawImage(d.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /**
   * Рендерить фінальну текстуру продукту у повній роздільній здатності
   * (для 3D-матеріалу і для файлу, що йде у виробництво).
   * @returns {HTMLCanvasElement}
   */
  renderProductionTexture() {
    const size = this.product.textureSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, size, size);

    if (this.design) {
      const pa = this.product.printArea;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pa.x * size, pa.y * size, pa.width * size, pa.height * size);
      ctx.clip();
      this._drawDesign(ctx, size, size);
      ctx.restore();
    }
    return canvas;
  }

  /** Тільки принт (прозорий фон навколо), без кольору виробу — окремий файл для друкарні. */
  renderPrintOnlyFile() {
    const size = this.product.textureSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (this.design) {
      this._drawDesign(ctx, size, size);
    }
    return canvas;
  }

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

    const hitTest = (pos) => {
      if (!this.design) return false;
      const d = this.design;
      const w = d.baseWidthNorm * d.scale * el.width;
      const h = d.baseHeightNorm * d.scale * el.height;
      const cx = d.xNorm * el.width;
      const cy = d.yNorm * el.height;
      // Спрощений hit-test через обертання (обертаємо точку у локальну систему координат)
      const angle = (-d.rotationDeg * Math.PI) / 180;
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      return Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2;
    };

    const down = (e) => {
      if (!this.design) return;
      const pos = getPos(e);
      if (hitTest(pos)) {
        this._dragging = true;
        this._dragOffset = {
          x: pos.x - this.design.xNorm * el.width,
          y: pos.y - this.design.yNorm * el.height
        };
        el.style.cursor = "grabbing";
      }
    };
    const move = (e) => {
      if (!this._dragging || !this.design) return;
      e.preventDefault();
      const pos = getPos(e);
      this.design.xNorm = clamp((pos.x - this._dragOffset.x) / el.width, 0, 1);
      this.design.yNorm = clamp((pos.y - this._dragOffset.y) / el.height, 0, 1);
      this.render();
    };
    const up = () => {
      this._dragging = false;
      el.style.cursor = "grab";
    };
    const wheel = (e) => {
      if (!this.design) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      this.setScale(this.design.scale + delta);
      const slider = document.getElementById("scaleRange");
      if (slider) slider.value = this.design.scale;
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
