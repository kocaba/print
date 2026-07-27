import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export class ProductScene {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    this.camera.position.set(0, 0.15, 2.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 6;

    this._setupLights();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(dracoLoader);

    this.currentModel = null;
    this.targetMeshes = []; // меші, до яких застосовується текстура
    this.canvasTexture = null;

    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    this._resize();

    this._animate = this._animate.bind(this);
    this._animate();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x30323d, 1.1);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2, 3, 2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-2, 1, -1.5);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(0, 2, -3);
    this.scene.add(rim);
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Завантажує модель продукту, замінюючи попередню.
   * @param {Object} productConfig - об'єкт з products.js
   */
  async loadProduct(productConfig) {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      disposeObject3D(this.currentModel);
      this.currentModel = null;
      this.targetMeshes = [];
    }

    const gltf = await this.gltfLoader.loadAsync(productConfig.modelUrl);
    const root = gltf.scene;

    // Автоцентрування та нормалізація масштабу під сцену
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1.0 / maxDim;
    root.scale.setScalar(scale);

    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (!productConfig.meshMatch || obj.name.toLowerCase().includes(productConfig.meshMatch.toLowerCase())) {
          // Клонуємо матеріал, щоб не ділити його з іншими інстансами глб-кешу
          obj.material = obj.material.clone();
          this.targetMeshes.push(obj);
        }
      }
    });

    this.scene.add(root);
    this.currentModel = root;

    this.camera.position.set(...productConfig.cameraPosition);
    this.controls.target.set(...productConfig.target);
    this.controls.update();

    return gltf;
  }

  /**
   * Оновлює текстуру на всіх цільових мешах, використовуючи canvas як джерело.
   * @param {HTMLCanvasElement} canvas
   */
  updateTextureFromCanvas(canvas) {
    if (!this.canvasTexture) {
      this.canvasTexture = new THREE.CanvasTexture(canvas);
      this.canvasTexture.colorSpace = THREE.SRGBColorSpace;
      this.canvasTexture.flipY = false;
    } else {
      // editor.renderProductionTexture() створює НОВИЙ <canvas> при кожному виклику,
      // тож треба щоразу оновлювати посилання на актуальний canvas,
      // інакше текстура назавжди застрягає на першому (порожньому) знімку.
      this.canvasTexture.image = canvas;
    }
    this.canvasTexture.needsUpdate = true;

    for (const mesh of this.targetMeshes) {
      const mat = mesh.material;
      mat.map = this.canvasTexture;
      mat.color.set(0xffffff); // базовий колір тепер задає сам canvas
      mat.needsUpdate = true;
    }
  }

  /** Робить знімок поточного 3D-виду (фінальний рендер для клієнта/власника). */
  captureScreenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    window.removeEventListener("resize", this._resize);
    this.renderer.dispose();
  }
}

function disposeObject3D(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        m?.map?.dispose();
        m?.dispose();
      });
    }
  });
}
