/**
 * Конфігурація продуктів.
 *
 * modelUrl       — шлях до .glb файлу (лежить у /public/models, див. README).
 * cameraPosition — стартова позиція камери [x, y, z].
 * target         — точка, куди дивиться камера [x, y, z].
 * textureSize    — розмір текстурного канвасу (px), також роздільна здатність
 *                   фінального файлу для друку.
 * printArea      — прямокутник зони друку у координатах UV/текстури (0..1),
 *                   {x, y, width, height} — x,y це ЛІВИЙ ВЕРХНІЙ кут.
 *                   ВАЖЛИВО: ці значення залежать від конкретної 3D-моделі,
 *                   яку ви завантажите (див. README -> "Налаштування printArea").
 * meshMatch      — підрядок імені меша/матеріалу, до якого застосовувати текстуру.
 *                   Якщо null — застосовується до першого знайденого меша з матеріалом.
 * colors         — доступні кольори виробу (hex), впливають на mesh.material.color.
 */

export const PRODUCTS = {
  tshirt: {
    id: "tshirt",
    label: "Футболка",
    modelUrl: "/models/tshirt.glb",
    cameraPosition: [0, 0.15, 2.4],
    target: [0, 0.1, 0],
    textureSize: 2048,
    printArea: { x: 0.32, y: 0.22, width: 0.36, height: 0.42 },
    meshMatch: null,
    colors: ["#ffffff", "#1c1c1c", "#c62828", "#1565c0", "#2e7d32", "#f9a825"]
  },
  cap: {
    id: "cap",
    label: "Кепка",
    modelUrl: "/models/cap.glb",
    cameraPosition: [0, 0.1, 1.6],
    target: [0, 0.05, 0.05],
    textureSize: 1024,
    printArea: { x: 0.38, y: 0.30, width: 0.26, height: 0.20 },
    meshMatch: null,
    colors: ["#ffffff", "#1c1c1c", "#c62828", "#1565c0", "#2e7d32"]
  },
  mug: {
    id: "mug",
    label: "Кружка",
    modelUrl: "/models/mug.glb",
    cameraPosition: [0, 0.05, 1.4],
    target: [0, 0, 0],
    textureSize: 2048,
    printArea: { x: 0.06, y: 0.28, width: 0.55, height: 0.42 },
    meshMatch: null,
    colors: ["#ffffff", "#1c1c1c", "#c62828", "#1565c0"]
  }
};

export const DEFAULT_PRODUCT_ID = "tshirt";
