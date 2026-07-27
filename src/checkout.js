import JSZip from "jszip";

/**
 * Збирає всі дані замовлення (форма + дизайн + рендери), пакує файли
 * виробництва у ZIP та надсилає JSON-запит на маршрут "/api/order"
 * того ж Cloudflare Worker'а (src/worker.js), який відправляє email власнику.
 */
export async function submitOrder({ formData, scene, editor, productConfig }) {
  const orderInfo = {
    product: productConfig.label,
    productId: productConfig.id,
    color: editor.color,
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    quantity: formData.get("quantity"),
    size: formData.get("size"),
    shippingAddress: formData.get("shippingAddress"),
    notes: formData.get("notes") || "",
    createdAt: new Date().toISOString()
  };

  // 1. Фінальний рендер 3D-сцени (те, що бачив клієнт)
  const finalRenderDataUrl = scene.captureScreenshot();

  // 2. Повна текстура виробу у виробничій роздільній здатності (колір + принт разом)
  const productionCanvas = editor.renderProductionTexture();
  const productionDataUrl = productionCanvas.toDataURL("image/png");

  // 3. Сам принт окремо, на прозорому фоні, у високій роздільній здатності — файл для друкарні
  const printOnlyCanvas = editor.renderPrintOnlyFile();
  const printOnlyDataUrl = printOnlyCanvas.toDataURL("image/png");

  // 4. Пакуємо все у ZIP: оригінал + виробничі файли + order.json
  const zip = new JSZip();
  zip.file("order.json", JSON.stringify(orderInfo, null, 2));
  zip.file("production-texture-full.png", dataUrlToBase64(productionDataUrl), { base64: true });
  zip.file("print-only-transparent.png", dataUrlToBase64(printOnlyDataUrl), { base64: true });
  zip.file("final-render-preview.png", dataUrlToBase64(finalRenderDataUrl), { base64: true });

  if (editor.originalFile) {
    const originalBase64 = await blobToBase64(editor.originalFile);
    const ext = guessExtension(editor.originalFile.type);
    zip.file(`original-upload.${ext}`, originalBase64, { base64: true });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const zipBase64 = await blobToBase64(zipBlob);

  const payload = {
    order: orderInfo,
    finalRenderBase64: dataUrlToBase64(finalRenderDataUrl),
    productionFilesZipBase64: zipBase64
  };

  const response = await fetch("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let message = "Не вдалося надіслати замовлення. Спробуйте ще раз.";
    try {
      const errBody = await response.json();
      if (errBody?.error) message = errBody.error;
    } catch (_) {
      /* ignore */
    }
    throw new Error(message);
  }

  return response.json();
}

function dataUrlToBase64(dataUrl) {
  return dataUrl.split(",")[1];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function guessExtension(mime) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  return map[mime] || "png";
}
