# Print Studio 3D — веб-конфігуратор друку на футболках, кепках і кружках

Повністю браузерний конфігуратор (SPA):
- 3D-перегляд виробу в реальному часі (Three.js)
- Завантаження зображення користувачем
- Автоматичне видалення фону **прямо в браузері** (без API, без сервера)
- Переміщення / масштабування / обертання принта
- Зміна кольору виробу
- Оформлення замовлення → email власнику з даними клієнта, фінальним рендером
  і всіма файлами, потрібними для друку (архів ZIP)

Немає жодного власного бекенд-сервера. Все — фронтенд і бекенд-логіка —
розгортається як **один Cloudflare Worker**: статичні файли (Vite-збірка)
віддаються напряму через Workers Static Assets, а маршрут `/api/order`
обробляється тим самим Worker'ом (serverless, входить до Cloudflare
безкоштовно) і лише пересилає лист через Resend API.

---

## 1. Технологічний стек і чому саме він

| Технологія | Навіщо | Офіційний сайт |
|---|---|---|
| [Vite](https://vitejs.dev/) | Збірка статичного SPA, найшвидший dev-сервер | https://vitejs.dev/ |
| [Three.js](https://threejs.org/) | 3D-рендеринг у браузері через WebGL, підтримка glTF/GLB | https://threejs.org/ |
| [@imgly/background-removal](https://github.com/imgly/background-removal-js) | Видалення фону з фото повністю в браузері (ONNX/WASM), без ключів API і без сервера | https://www.npmjs.com/package/@imgly/background-removal |
| [JSZip](https://stuk.github.io/jszip/) | Пакування виробничих файлів в один ZIP перед відправкою | https://stuk.github.io/jszip/ |
| [Cloudflare Workers](https://workers.cloudflare.com/) | Виконання коду на edge + хостинг статики (Workers Static Assets) в одному деплої | https://workers.cloudflare.com/ |
| [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) | Роздача файлів Vite-збірки (`dist/`) напряму з Worker'а, без окремого хостингу | https://developers.cloudflare.com/workers/static-assets/ |
| [Resend](https://resend.com/) | Email API з підтримкою вкладень, простий безкоштовний тариф | https://resend.com/ |
| [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) | Деплой і локальний запуск Cloudflare Worker'а | https://developers.cloudflare.com/workers/wrangler/ |

Чому саме так: Three.js — стандарт де-факто для WebGL у браузері з відмінною
підтримкою glTF. @imgly/background-removal — єдина зріла бібліотека, що прибирає
фон з фото **без відправки зображення на будь-який сервер** (модель сегментації
завантажується і виконується локально через WASM), що ідеально узгоджується з
вимогою "повністю в браузері". Cloudflare Workers з Static Assets дозволяють
мати єдиний деплой (статика + один маленький serverless-виклик для email),
залишаючись у межах "без власного сервера" (це не VPS і не Node.js-бекенд,
який треба адмініструвати, — це edge-Worker самого Cloudflare, що виконує
код лише на запит).

---

## 2. Що потрібно встановити локально

1. **Node.js** ≥ 18.18 (рекомендовано LTS 20+) — https://nodejs.org/
2. **npm** (йде разом з Node.js)
3. **Git** — https://git-scm.com/downloads
4. **Акаунт GitHub** (для репозиторію) — https://github.com/join
5. **Акаунт Cloudflare** (безкоштовний) — https://dash.cloudflare.com/sign-up
6. **Акаунт Resend** (безкоштовний тариф до 3000 листів/міс) — https://resend.com/
7. **Wrangler CLI** — встановлюється як devDependency проєкту (нічого додатково
   ставити не треба, є в `package.json`), офіційна документація:
   https://developers.cloudflare.com/workers/wrangler/install-and-update/

---

## 3. Встановлення проєкту локально

```bash
# 1. Розпакуйте проєкт (або склонуйте з GitHub після кроку 5)
cd print-configurator

# 2. Встановіть залежності
npm install

# 3. Покладіть 3D-моделі у public/models/ (див. розділ "3D-МОДЕЛІ" нижче)

# 4. Створіть файл локальних секретів для Cloudflare Functions
cp .dev.vars.example .dev.vars
# відкрийте .dev.vars і впишіть свої RESEND_API_KEY / FROM_EMAIL / OWNER_EMAIL

# 5. Запустіть проєкт локально (лише фронтенд, швидкий hot-reload, без /api/order)
npm run dev
# відкриється http://localhost:5173

# 6. Щоб протестувати ПОВНІСТЮ (разом з /api/order, у реальному Workers-рантаймі):
npm run worker:dev
# це збере dist/ і запустить `wrangler dev`, за замовчуванням на http://localhost:8787
```

---

## 4. 3D-МОДЕЛІ — де взяти безкоштовно і куди покласти

Проєкт очікує 3 файли у форматі **.glb** у папці `public/models/`:

```
public/models/tshirt.glb
public/models/cap.glb
public/models/mug.glb
```

### Рекомендовані безкоштовні джерела

**Футболка (tshirt.glb)**
- Sketchfab, ліцензія CC Attribution (безкоштовно, потрібне лише зазначення
  автора у себе на сайті/в умовах):
  https://sketchfab.com/3d-models/t-shirt-c1a3e5eb9b5445f4b7d4be82f1127eba
  → кнопка "Download 3D Model" → формат **glTF (.glb)**.
- Альтернатива — пошук інших моделей із фільтром "Downloadable" і
  ліцензією CC0/CC-BY тут: https://sketchfab.com/tags/t-shirt

**Кепка (cap.glb)**
- Пошук безкоштовних CC0-моделей кепки без реєстрації:
  https://poly.pizza/search/cap
  (Poly Pizza — агрегатор CC0-моделей, скачування напряму в .glb,
  без атрибуції, дозволено комерційне використання)

**Кружка (mug.glb)**
- Poly Pizza, CC0, без атрибуції, напряму .glb:
  https://poly.pizza/search/mug
- Альтернатива з PBR-текстурами (ліцензія CC0):
  https://www.cgtrader.com/free-3d-models/household/kitchenware/cc0-mug-7
  → після скачування конвертуйте в .glb через Blender
  (File → Export → glTF 2.0), якщо формат не .glb/.gltf одразу.

### Якщо потрібен конвертер у GLB

Якщо модель скачана в форматі OBJ/FBX/DAE — безкоштовно конвертуйте в GLB:
- **Blender** (безкоштовний, офіційний): https://www.blender.org/download/
  Імпорт файлу → `File → Export → glTF 2.0 (.glb/.gltf)` → формат "glTF Binary (.glb)"
- Або онлайн-конвертер без встановлення: https://products.aspose.app/3d/conversion

### Налаштування зони друку (`printArea`)

Файл `src/products.js` містить для кожного продукту параметр:

```js
printArea: { x: 0.32, y: 0.22, width: 0.36, height: 0.42 }
```

Це прямокутник у координатах **UV-розгортки** моделі (0..1 — вся текстура
0..1 по X і Y, лівий верхній кут). Значення за замовчуванням підібрані
орієнтовно під типову UV-розгортку "перед по центру". Якщо принт
накладається не туди, куди треба:

1. Відкрийте модель у Blender.
2. Перейдіть у режим UV Editing, подивіться, де саме на UV-розгортці
   знаходиться передня частина виробу (перед футболки / фронтальна панель
   кепки / бічна поверхня кружки).
3. Визначте прямокутні межі цієї ділянки у частках від 0 до 1 і впишіть їх
   у `printArea` відповідного продукту в `src/products.js`.
4. Перезапустіть `npm run dev` — зміни підхопляться миттєво.

---

## 5. Деплой на GitHub

```bash
git init
git add .
git commit -m "Initial commit: print configurator"

# Створіть порожній репозиторій на https://github.com/new (без README)
git branch -M main
git remote add origin https://github.com/<ваш-логін>/<назва-репо>.git
git push -u origin main
```

**Важливо:** файл `.dev.vars` вже в `.gitignore` — секрети НЕ потраплять у git.
Файли `.glb` моделей (якщо великі) можна закомітити як звичайні бінарні файли —
GitHub дозволяє файли до 100MB без Git LFS.

---

## 6. Деплой на Cloudflare Workers

Проєкт розгортається як **один Worker** з увімкненими Workers Static Assets
(`[assets]` у `wrangler.toml`): статика (`dist/`) і код `/api/order`
(`src/worker.js`) деплояться разом однією командою.

### Варіант A — через CLI (Wrangler), рекомендовано

```bash
# 1. Логін у Cloudflare (відкриє браузер)
npx wrangler login

# 2. Додайте секрети (запитає значення інтерактивно, нічого не пише у файли)
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put FROM_EMAIL
npx wrangler secret put OWNER_EMAIL

# 3. Збірка + деплой одним скриптом (вже прописаний у package.json)
npm run deploy
# те саме вручну: npm run build && npx wrangler deploy
```

Після успішного деплою Wrangler виведе URL виду
`https://print-configurator.<ваш-субдомен>.workers.dev` — це вже робочий сайт.

Щоб підʼєднати власний домен: Cloudflare Dashboard → **Workers & Pages** →
ваш Worker → **Settings** → **Domains & Routes** → **Add Custom Domain**
(домен має бути доданий у ваш Cloudflare-акаунт). Документація:
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

### Варіант B — через Dashboard з автодеплоєм із Git (Workers Builds)

1. Зайдіть у https://dash.cloudflare.com/ → **Workers & Pages** → **Create** → **Workers** → **Import a repository** (Workers Builds — CI/CD для Workers).
2. Оберіть щойно створений GitHub-репозиторій.
3. Cloudflare автоматично визначить `wrangler.toml`, збірку запустить командою
   `npm run build` (Vite), а деплой — через `wrangler deploy` за конфігурацією
   з `wrangler.toml`.
4. Після першого деплою: **Settings** → **Variables and Secrets** → додайте
   як **Secret**: `RESEND_API_KEY`, `FROM_EMAIL`, `OWNER_EMAIL`.
5. Зробіть **Retry deployment**, щоб Worker побачив нові секрети.

Документація Workers Builds:
https://developers.cloudflare.com/workers/ci-cd/builds/

### Налаштування Resend (обов'язково для email)

1. Зареєструйтесь на https://resend.com/
2. **Domains** → додайте свій домен і підтвердіть DNS-записи (SPF/DKIM),
   інструкція: https://resend.com/docs/dashboard/domains/introduction
   (Якщо домену немає — Resend дозволяє тестову відправку з їхнього
   `onboarding@resend.dev`, підходить лише для тестів, не для продакшна.)
3. **API Keys** → створіть ключ, вставте в секрет `RESEND_API_KEY`.
4. `FROM_EMAIL` — адреса на вашому підтвердженому домені, напр. `orders@yourdomain.com`.
5. `OWNER_EMAIL` — куди приходитимуть замовлення.

Документація Resend Attachments API (яку використовує `functions/api/order.js`):
https://resend.com/docs/api-reference/emails/send-email

---

## 7. Дерево проєкту

```
print-configurator/
├── public/
│   └── models/
│       ├── README.txt
│       ├── tshirt.glb          # додайте самостійно (див. розділ 4)
│       ├── cap.glb             # додайте самостійно
│       └── mug.glb             # додайте самостійно
├── src/
│   ├── checkout.js             # збір даних замовлення, генерація файлів, ZIP, відправка
│   ├── editor.js                # 2D-редактор: drag/scale/rotate, видалення фону
│   ├── main.js                  # точка входу фронтенду, з'єднує UI + сцену + редактор
│   ├── products.js              # конфігурація продуктів, printArea, кольори
│   ├── scene.js                  # Three.js 3D-в'юер
│   ├── style.css
│   └── worker.js                 # Cloudflare Worker: статика + /api/order (Resend email)
├── .dev.vars.example
├── .gitignore
├── index.html
├── package.json
├── README.md
├── vite.config.js
└── wrangler.toml                 # конфігурація Worker'а + Workers Static Assets
```

> **Примітка:** `src/worker.js` виконується в рантаймі Cloudflare Workers,
> а не збирається Vite'ом разом з рештою `src/` — Wrangler бандлить його
> окремо під час `wrangler deploy` / `wrangler dev`. Vite збирає лише
> фронтенд (`index.html` + `src/main.js` та все, що він імпортує) у `dist/`.

---

## 8. Як це працює (коротко)

1. `scene.js` завантажує `.glb` через `GLTFLoader`, центрує й масштабує модель,
   знаходить меші й клонує їхні матеріали.
2. `editor.js` малює на 2D-канвасі (`stageCanvas`) зону друку та зображення
   користувача з можливістю drag (pointer events), zoom (колесо миші/слайдер),
   rotate (слайдер). Кожна зміна перераховує offscreen-канвас продукційної
   роздільної здатності.
3. Цей offscreen-канвас передається у `scene.updateTextureFromCanvas()`, яка
   створює `THREE.CanvasTexture` і призначає її матеріалу — принт одразу
   видно на 3D-моделі.
4. Видалення фону: `@imgly/background-removal` завантажує невелику ONNX-модель
   сегментації з CDN один раз і виконує інференс локально в браузері (WebAssembly),
   повертає PNG із прозорим фоном.
5. При оформленні замовлення (`checkout.js`): робиться скріншот `renderer.domElement`
   (фінальний рендер), генерується повна текстура і принт окремо, все пакується
   у ZIP разом з оригіналом фото та JSON з даними замовлення, і відправляється
   одним POST-запитом на `/api/order`.
6. `src/worker.js` (Cloudflare Worker) отримує POST на `/api/order`
   (завдяки `run_worker_first: ["/api/*"]` у `wrangler.toml` — усі інші
   шляхи обслуговуються статикою напряму, без виконання цього коду),
   валідує дані і викликає Resend API, який надсилає лист власнику з
   вкладеннями `final-render.png` та `production-files.zip`.

---

## 9. Обмеження та можливі покращення

- Ліміт розміру запиту в `/api/order` — ~35MB (див. `MAX_BODY_BYTES` в
  `src/worker.js`), достатньо для PNG 2048×2048 + ZIP. За потреби
  зменшіть `textureSize` у `src/products.js`. Також майте на увазі ліміт
  Cloudflare Workers на розмір вхідного запиту (типово 100MB на платних
  планах, менше на Free) — див. https://developers.cloudflare.com/workers/platform/limits/
- Hit-test перетягування зображення в `editor.js` спрощений (без урахування
  повороту при визначенні межі кліку в кутах) — для точнішого UX можна додати
  повноцінні resize/rotate-хендли по кутах.
- Для дуже високої точності накладання текстури на складну геометрію (рукави,
  шви) можна замінити прямокутну `printArea` на UV-маску (додаткове PNG
  з альфа-каналом, що визначає форму зони друку).
- Підтвердження листа клієнту (окрім власника) — легко додати другим
  викликом Resend у `order.js` (`to: [order.customerEmail]`).
