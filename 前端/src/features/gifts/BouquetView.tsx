import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildBouquet, disposeBouquet, type BouquetOrder } from './bouquetModel';

/**
 * 3D 花束（2026-11-13）
 *
 * 一块 canvas 里渲一束低多边形花：加载时从侧面缓缓转到正面，停住后慢慢自转；
 * 手指按住可以自己转（上下左右都能带动一点惯性），松手继续。没有外部控件，
 * 不需要用户看懂任何 UI —— 拆开礼物应该像打开一个盒子，不像操作一台机器。
 *
 * 几条实现上的约定：
 * - **alpha 背景**：canvas 透明，后面是暖色纸底，花束像"放在桌上"而不是"贴在黑屏里"；
 * - 只在需要时渲（自转 / 拖动 / 惯性），静止两秒后彻底停手，别让手机一直烧 GPU；
 * - `disposeBouquet` 只清几何，材质是 `bouquetModel` 里的共享缓存。
 */
export function BouquetView({ order, className }: { order: BouquetOrder; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      // 没有 WebGL 就别硬撑，给个静态提示（不建议在这里抛错，整页会白）
      host.innerHTML =
        '<div style="display:flex;height:100%;align-items:center;justify-content:center;font-size:12px;color:#9a8f7d">这台设备打不开 3D 花束</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);

    scene.add(new THREE.AmbientLight(0xfff6e8, 1.55));
    const key = new THREE.DirectionalLight(0xfff1de, 2.1);
    key.position.set(2.2, 3.2, 2.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8f5, 0.75);
    fill.position.set(-2.4, 1.2, 1.6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe9cf, 0.9);
    rim.position.set(0, 1.4, -2.8);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let bouquet = buildBouquet(order);
    // 花束是以花头为中心生成的，整体往下挪一点，画面里重心才稳
    bouquet.root.position.y -= 0.12;
    pivot.add(bouquet.root);

    // 按实际包围盒自动取景：花材多少不同高度差别很大，写死机位一定会切到花头。
    // 只取半高/半宽（不用包围球），否则前后厚度会把画面顶得只剩一小束。
    bouquet.root.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(bouquet.root);
    const size3 = box3.getSize(new THREE.Vector3());
    const lookY = (box3.min.y + box3.max.y) / 2;
    const halfH = size3.y / 2;
    // 绕竖轴自转时，最宽处是 XZ 对角线（只用 max(x,z) 会在转到斜角时切边）
    const halfW = Math.hypot(size3.x, size3.z) / 2;

    /* ---------------- 交互：拖动转 + 惯性 ---------------- */
    let yaw = -0.5; // 开场从侧后方转过来
    let pitch = 0.06;
    let velYaw = 0;
    let velPitch = 0;
    let dragging = false;
    let idleSince = 0;
    let lastX = 0;
    let lastY = 0;

    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      velYaw = 0;
      velPitch = 0;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw -= dx * 0.011;
      pitch = Math.max(-0.3, Math.min(0.34, pitch + dy * 0.005));
      velYaw = -dx * 0.0016;
      velPitch = dy * 0.0006;
    };
    const onUp = () => {
      dragging = false;
      idleSince = performance.now();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    /* ---------------- 尺寸 ---------------- */
    const resize = () => {
      const w = host.clientWidth || 300;
      const h = host.clientHeight || 360;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // 让整束花刚好装进画面：竖着按 fov 算，横着按横向 fov 算，取更远的那一个
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist =
        Math.max(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2)) * 1.06;
      camera.position.set(0, lookY + 0.05, dist);
      camera.lookAt(0, lookY, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ---------------- 渲染循环 ---------------- */
    let raf = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);

      if (!dragging) {
        yaw += velYaw;
        pitch = Math.max(-0.3, Math.min(0.34, pitch + velPitch));
        velYaw *= 0.94;
        velPitch *= 0.9;
        // 停下来两秒后，自己慢慢转
        if (Math.abs(velYaw) < 0.0004 && performance.now() - idleSince > 2000) {
          yaw += 0.0016;
        }
      }
      pivot.rotation.y = yaw;
      pivot.rotation.x = pitch;
      renderer.render(scene, camera);
    };
    idleSince = performance.now() - 5000; // 一进来就在转
    tick();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      pivot.remove(bouquet.root);
      disposeBouquet(bouquet.root);
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
    // order 变了就整束重建（预设切换用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(order)]);

  return <div ref={hostRef} className={className} data-testid="bouquet-canvas" />;
}
