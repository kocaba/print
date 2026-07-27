/**
 * Cloudflare Worker (не Pages!) — точка входу "main" з wrangler.toml.
 *
 * Завдяки конфігурації [assets] у wrangler.toml:
 *   - усі запити НЕ під /api/*  обслуговуються напряму зі статичних файлів
 *     (папка dist/, зібрана через `vite build`) без виконання коду нижче —
 *     це найшвидший шлях (asset-first routing).
 *   - запити під /api/* завжди потрапляють у цей fetch(), завдяки
 *     "run_worker_first": ["/api/*"].
 *
 * Тобто це НЕ окремий сервер — це один edge-Worker, що поєднує
 * статичний хостинг і маленький serverless-ендпоінт для email.
 */

const MAX_BODY_BYTES = 35 * 1024 * 1024; // ~35MB запас під ліміт Workers/Resend

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/order") {
      if (request.method === "POST") {
        return handleOrder(request, env);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }
      return jsonError("Метод не підтримується.", 405);
    }

    // Фолбек: якщо запит все ж дійшов сюди для статичного файлу
    // (напр. під час локального `wrangler dev` без явного asset-роутингу),
    // віддаємо його через binding ASSETS.
    return env.ASSETS.fetch(request);
  }
};

async function handleOrder(request, env) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return jsonError("Файл замовлення завеликий. Спробуйте зменшити зображення.", 413);
    }

    const body = await request.json();
    const { order, finalRenderBase64, productionFilesZipBase64 } = body || {};

    const missing = validateOrder(order);
    if (missing.length > 0) {
      return jsonError(`Відсутні обов'язкові поля: ${missing.join(", ")}`, 400);
    }
    if (!finalRenderBase64 || !productionFilesZipBase64) {
      return jsonError("Відсутні файли макета.", 400);
    }

    if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !env.OWNER_EMAIL) {
      return jsonError("Сервер не налаштований (відсутні секрети email). Зверніться до адміністратора.", 500);
    }

    const html = buildOwnerEmailHtml(order);

    const resendPayload = {
      from: `Print Studio 3D <${env.FROM_EMAIL}>`,
      to: [env.OWNER_EMAIL],
      reply_to: order.customerEmail,
      subject: `Нове замовлення: ${order.product} — ${order.customerName}`,
      html,
      attachments: [
        { filename: "final-render.png", content: finalRenderBase64 },
        { filename: "production-files.zip", content: productionFilesZipBase64 }
      ]
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(resendPayload)
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("Resend error:", errText);
      return jsonError("Не вдалося надіслати email. Спробуйте пізніше.", 502);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("worker /api/order error:", err);
    return jsonError("Внутрішня помилка сервера.", 500);
  }
}

function validateOrder(order) {
  const required = [
    "product",
    "customerName",
    "customerEmail",
    "customerPhone",
    "shippingAddress",
    "quantity",
    "size"
  ];
  if (!order) return required;
  return required.filter((key) => !order[key] && order[key] !== 0);
}

function buildOwnerEmailHtml(order) {
  const rows = [
    ["Товар", order.product],
    ["Колір", order.color],
    ["Розмір", order.size],
    ["Кількість", order.quantity],
    ["Ім'я клієнта", order.customerName],
    ["Email клієнта", order.customerEmail],
    ["Телефон клієнта", order.customerPhone],
    ["Адреса доставки", order.shippingAddress],
    ["Коментар", order.notes || "—"],
    ["Дата замовлення", order.createdAt]
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#666;font-family:sans-serif;font-size:13px;">${escapeHtml(
          label
        )}</td><td style="padding:6px 12px;font-family:sans-serif;font-size:13px;font-weight:600;">${escapeHtml(
          String(value)
        )}</td></tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="font-family:sans-serif;">Нове замовлення з конфігуратора</h2>
      <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>
      <p style="font-family:sans-serif;font-size:13px;color:#666;margin-top:16px;">
        У вкладеннях: final-render.png (фінальний вигляд виробу) та production-files.zip
        (повна текстура, принт на прозорому фоні, оригінал завантаженого зображення, order.json).
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
