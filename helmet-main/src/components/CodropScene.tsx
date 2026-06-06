"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Environment, Loader, useGLTF, useTexture } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  ShaderMaterial,
  Vector2,
} from "three";

function AlwaysInvalidate() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let raf = 0;
    const tick = () => { invalidate(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);
  return null;
}

function GridPlane({ targetCenterUv }: { targetCenterUv: React.MutableRefObject<Vector2> }) {
  const meshRef = useRef<Mesh>(null);
  const uniforms = useMemo(() => ({
    uGridScale:    { value: 28.0 },
    uLineWidth:    { value: 0.5 },
    uEdgeWidth:    { value: 0.14 },
    uEdgeAmp:      { value: 1.35 },
    uCenterRadius: { value: 0.22 },
    uCenterAmp:    { value: 0.9 },
    uCenter:       { value: new Vector2(0.5, 0.5) },
    uTime:         { value: 0.0 },
    uScrollSpeed:  { value: 0.01 },
    uResolution:   { value: new Vector2(1, 1) },
  }), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as ShaderMaterial;
    mat.uniforms.uTime.value = state.clock.getElapsedTime();
    (mat.uniforms.uCenter.value as Vector2).lerp(targetCenterUv.current, 0.08);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -5.2]}>
      <planeGeometry args={[18, 18, 512, 512]} />
      <shaderMaterial
        attach="material"
        args={[{
          uniforms,
          vertexShader: `
            varying vec2 vUv;
            uniform float uEdgeWidth;
            uniform float uEdgeAmp;
            uniform float uCenterRadius;
            uniform float uCenterAmp;
            uniform vec2 uCenter;
            void main() {
              vUv = uv;
              vec3 p = position;
              float dEdge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
              float edgeMask = 1.0 - smoothstep(0.0, uEdgeWidth, dEdge);
              float dCenter = distance(vUv, uCenter);
              float centerMask = 1.0 - smoothstep(0.0, uCenterRadius, dCenter);
              float zOffset = edgeMask * uEdgeAmp + centerMask * uCenterAmp;
              p.z += zOffset;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float uGridScale;
            uniform float uLineWidth;
            uniform float uTime;
            uniform float uScrollSpeed;
            float gridLine(float coord, float width) {
              float fw = fwidth(coord);
              float p = abs(fract(coord - 0.5) - 0.5);
              return 1.0 - smoothstep(width * fw, (width + 1.0) * fw, p);
            }
            void main() {
              vec2 uv = (vUv + vec2(uTime * uScrollSpeed, 0.0)) * uGridScale;
              float gx = gridLine(uv.x, uLineWidth);
              float gy = gridLine(uv.y, uLineWidth);
              float g = max(gx, gy);
              // Dark #131313 bg, white lines
              vec3 bg   = vec3(0.075);
              vec3 line = vec3(1.0);
              vec3 col  = mix(bg, line, g * 0.35);
              gl_FragColor = vec4(col, 1.0);
            }
          `,
          side: DoubleSide,
        }]}
      />
    </mesh>
  );
}

function HelmetModel({ sphereAngleRef }: { sphereAngleRef: React.MutableRefObject<number> }) {
  const helmet = useGLTF("/models/helmet.glb");
  const scene = useMemo(() => helmet.scene.clone(true), [helmet.scene]);
  const modelRef = useRef<Object3D>(null);
  const baseRotation = useMemo(() => ({ x: Math.PI / 8, y: Math.PI / 2 }), []);
  const glassMaterial = useMemo(() => new MeshPhysicalMaterial({
    thickness: 0.9, roughness: 0.0, metalness: 1,
    ior: 1.9, clearcoat: 0.1, clearcoatRoughness: 1.1,
    iridescence: 0, iridescenceIOR: 0,
    iridescenceThicknessRange: [100, 400],
    color: "transparent", transparent: true,
    depthWrite: true, side: DoubleSide,
  }), []);

  useEffect(() => {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.scale.set(0.7, 0.7, 0.7);
        object.material = glassMaterial;
        object.material.needsUpdate = true;
      }
    });
    return () => { glassMaterial.dispose(); };
  }, [scene, glassMaterial]);

  useFrame(() => {
    const obj = modelRef.current;
    if (!obj) return;
    obj.rotation.x = baseRotation.x;
    obj.rotation.y = baseRotation.y - sphereAngleRef.current;
  });

  return <primitive ref={modelRef} object={scene} rotation={[baseRotation.x, baseRotation.y, 0]} />;
}

function ImageSphere({
  spinVelocityXRef, spinVelocityYRef, angleXRef, angleYRef,
  isDraggingRef, snapActiveRef, snapTargetXRef, snapTargetYRef,
  onTileDirs, onHoverStart, onHoverMove, onHoverEnd,
}: {
  spinVelocityXRef: React.MutableRefObject<number>;
  spinVelocityYRef: React.MutableRefObject<number>;
  angleXRef: React.MutableRefObject<number>;
  angleYRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
  snapActiveRef: React.MutableRefObject<boolean>;
  snapTargetXRef: React.MutableRefObject<number>;
  snapTargetYRef: React.MutableRefObject<number>;
  onTileDirs: (dirs: Array<{ x: number; y: number; z: number }>) => void;
  onHoverStart: (projectName: string, event: ThreeEvent<PointerEvent>) => void;
  onHoverMove: (event: ThreeEvent<PointerEvent>) => void;
  onHoverEnd: () => void;
}) {
  const groupRef = useRef<Object3D>(null);
  const imageUrls = useMemo(() => [
    "/tube/im1.jpg", "/tube/im3.jpg", "/tube/im2.jpg",
    "/tube/im4.jpg", "/tube/im5.jpg", "/tube/im6.jpg",
    "/tube/im7.jpg", "/tube/im8.jpg", "/tube/im9.jpg",
  ], []);
  const textures = useTexture(imageUrls);
  const projectNames = useMemo(() => {
    const m: Record<string, string> = {
      "/tube/im1.jpg": "Project 1", "/tube/im2.jpg": "Project 2",
      "/tube/im3.jpg": "Project 3", "/tube/im4.jpg": "Project 4",
      "/tube/im5.jpg": "Project 5", "/tube/im6.jpg": "Project 6",
      "/tube/im7.jpg": "Project 7", "/tube/im8.jpg": "Project 8",
      "/tube/im9.jpg": "Project 9",
    };
    return imageUrls.map((url) => m[url] ?? url);
  }, [imageUrls]);

  const radius = 4.25;
  const tileW = 0.72;
  const tileH = 1.0;
  const tileCount = imageUrls.length * 8;

  const tiles = useMemo(() => {
    const out: Array<{ x: number; y: number; z: number; texIndex: number }> = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const n = Math.max(1, tileCount);
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const y = 1 - t * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      out.push({ x: Math.cos(theta) * r * radius, y: y * radius * 0.92, z: Math.sin(theta) * r * radius, texIndex: i % imageUrls.length });
    }
    return out;
  }, [imageUrls.length, radius, tileCount]);

  const tileDirsRef = useRef(tiles.map(t => ({ x: t.x / radius, y: t.y / (radius * 0.92), z: t.z / radius })));

  useEffect(() => { onTileDirs(tileDirsRef.current); }, [onTileDirs]);

  const SNAP_SPEED = 4.5;
  const FRICTION = 0.92;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (snapActiveRef.current && !isDraggingRef.current) {
      const dx = snapTargetXRef.current - angleXRef.current;
      const dy = snapTargetYRef.current - angleYRef.current;
      if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) {
        snapActiveRef.current = false;
        angleXRef.current = snapTargetXRef.current;
        angleYRef.current = snapTargetYRef.current;
        spinVelocityXRef.current = 0; spinVelocityYRef.current = 0;
      } else {
        angleXRef.current += dx * SNAP_SPEED * delta;
        angleYRef.current += dy * SNAP_SPEED * delta;
      }
    } else if (!isDraggingRef.current) {
      spinVelocityXRef.current *= FRICTION; spinVelocityYRef.current *= FRICTION;
      angleXRef.current += spinVelocityXRef.current * delta;
      angleYRef.current += spinVelocityYRef.current * delta;
      const maxPitch = 0.9;
      if (angleXRef.current > maxPitch) { angleXRef.current = maxPitch; spinVelocityXRef.current *= -0.3; }
      if (angleXRef.current < -maxPitch) { angleXRef.current = -maxPitch; spinVelocityXRef.current *= -0.3; }
    }
    group.rotation.x = angleXRef.current;
    group.rotation.y = angleYRef.current;
  });

  return (
    <group ref={groupRef}>
      {tiles.map((tile, i) => (
        <mesh
          key={i}
          position={[tile.x, tile.y, tile.z]}
          onPointerEnter={(e) => onHoverStart(projectNames[tile.texIndex], e)}
          onPointerMove={onHoverMove}
          onPointerLeave={onHoverEnd}
        >
          <planeGeometry args={[tileW, tileH]} />
          <meshBasicMaterial map={textures[tile.texIndex]} transparent side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function CodropScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetCenterUv = useRef(new Vector2(0.5, 0.5));
  const cursorElRef = useRef<HTMLDivElement>(null);
  const tooltipElRef = useRef<HTMLDivElement>(null);
  const cursorActive = useRef(false);
  const cursorTarget = useRef({ x: 0, y: 0 });
  const cursorCurrent = useRef({ x: 0, y: 0 });
  const tooltipTarget = useRef({ x: 0, y: 0 });
  const tooltipCurrent = useRef({ x: 0, y: 0 });
  const tooltipRafRef = useRef<number | null>(null);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const sphereSpinVelocityX = useRef(0);
  const sphereSpinVelocityY = useRef(0);
  const sphereAngleX = useRef(0);
  const sphereAngleY = useRef(0);
  const isDraggingRef = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragLastXRef = useRef(0);
  const dragLastYRef = useRef(0);
  const dragLastTRef = useRef(0);
  const snapActiveRef = useRef(false);
  const snapTargetXRef = useRef(0);
  const snapTargetYRef = useRef(0);
  const tileDirsRef = useRef<Array<{ x: number; y: number; z: number }>>([]);
  const snapWheelTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const cursorEl = cursorElRef.current;
      if (cursorEl) {
        const lerp = 0.18;
        cursorCurrent.current.x += (cursorTarget.current.x - cursorCurrent.current.x) * lerp;
        cursorCurrent.current.y += (cursorTarget.current.y - cursorCurrent.current.y) * lerp;
        cursorEl.style.opacity = cursorActive.current ? '1' : '0';
        cursorEl.style.transform = `translate3d(${(cursorCurrent.current.x - 9).toFixed(2)}px, ${(cursorCurrent.current.y - 9).toFixed(2)}px, 0)`;
      }
      const tooltipEl = tooltipElRef.current;
      if (tooltipEl) {
        const lerp = 0.18;
        tooltipCurrent.current.x += (tooltipTarget.current.x - tooltipCurrent.current.x) * lerp;
        tooltipCurrent.current.y += (tooltipTarget.current.y - tooltipCurrent.current.y) * lerp;
        tooltipEl.style.transform = `translate3d(${(tooltipCurrent.current.x + 12).toFixed(2)}px, ${(tooltipCurrent.current.y - 18).toFixed(2)}px, 0)`;
      }
      tooltipRafRef.current = requestAnimationFrame(tick);
    };
    tooltipRafRef.current = requestAnimationFrame(tick);
    return () => { if (tooltipRafRef.current != null) cancelAnimationFrame(tooltipRafRef.current); };
  }, []);

  const setTooltipFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    tooltipTarget.current = { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const onImageHoverStart = useCallback((projectName: string, event: ThreeEvent<PointerEvent>) => {
    if (isDraggingRef.current) return;
    setHoveredProject(projectName);
    setTooltipFromClientPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
    tooltipCurrent.current = { ...tooltipTarget.current };
  }, [setTooltipFromClientPoint]);

  const onImageHoverMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (isDraggingRef.current) return;
    setTooltipFromClientPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
  }, [setTooltipFromClientPoint]);

  const onImageHoverEnd = useCallback(() => { setHoveredProject(null); }, []);

  const requestSnap = useCallback(() => {
    const dirs = tileDirsRef.current;
    if (!dirs.length) return;
    const wrapPi = (a: number) => { const twoPi = Math.PI * 2; let v = (a + Math.PI) % twoPi; if (v < 0) v += twoPi; return v - Math.PI; };
    let bestCost = Infinity, bestPitch = sphereAngleX.current, bestYaw = sphereAngleY.current;
    for (const v of dirs) {
      const z1 = Math.hypot(v.x, v.z);
      const dy = wrapPi(Math.atan2(-v.x, v.z) - sphereAngleY.current);
      const dx = Math.atan2(v.y, z1) - sphereAngleX.current;
      const cost = dy * dy + dx * dx * 1.4;
      if (cost < bestCost) { bestCost = cost; bestPitch = Math.atan2(v.y, z1); bestYaw = sphereAngleY.current + dy; }
    }
    snapTargetXRef.current = bestPitch; snapTargetYRef.current = bestYaw; snapActiveRef.current = true;
  }, []);

  const endDrag = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const pid = dragPointerIdRef.current; dragPointerIdRef.current = null;
    if (event && pid != null) { try { event.currentTarget.releasePointerCapture(pid); } catch {} }
    requestSnap();
  }, [requestSnap]);

  const onPointerEnter = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    cursorTarget.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    cursorCurrent.current = { ...cursorTarget.current };
    cursorActive.current = true;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (isDraggingRef.current && dragPointerIdRef.current === event.pointerId) {
      const dx = event.clientX - dragLastXRef.current;
      const dy = event.clientY - dragLastYRef.current;
      const dtMs = event.timeStamp - dragLastTRef.current;
      dragLastXRef.current = event.clientX; dragLastYRef.current = event.clientY; dragLastTRef.current = event.timeStamp;
      sphereAngleY.current += dx * 0.003;
      sphereAngleX.current = Math.max(-0.9, Math.min(0.9, sphereAngleX.current + -dy * 0.003));
      if (dtMs > 0) {
        const dt = dtMs / 1000;
        sphereSpinVelocityX.current = Math.max(-4, Math.min(4, (-dy * 0.003) / dt));
        sphereSpinVelocityY.current = Math.max(-4, Math.min(4, (dx * 0.003) / dt));
      }
    }
    cursorTarget.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    const s = 0.4;
    targetCenterUv.current.set(
      Math.min(1, Math.max(0, 0.5 + (Math.min(1, Math.max(0, nx)) - 0.5) * s)),
      Math.min(1, Math.max(0, 0.5 + ((1 - Math.min(1, Math.max(0, ny))) - 0.5) * s)),
    );
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    snapActiveRef.current = false; isDraggingRef.current = true;
    dragPointerIdRef.current = event.pointerId;
    dragLastXRef.current = event.clientX; dragLastYRef.current = event.clientY; dragLastTRef.current = event.timeStamp;
    setHoveredProject(null);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  }, []);

  const onPointerLeave = useCallback(() => {
    targetCenterUv.current.set(0.5, 0.5);
    cursorActive.current = false;
    onImageHoverEnd(); endDrag();
  }, [endDrag, onImageHoverEnd]);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    sphereSpinVelocityY.current += event.deltaY * 0.004;
    if (snapWheelTimeoutRef.current != null) window.clearTimeout(snapWheelTimeoutRef.current);
    snapWheelTimeoutRef.current = window.setTimeout(() => { if (!isDraggingRef.current) requestSnap(); }, 140);
  }, [requestSnap]);

  return (
    <div
      ref={containerRef}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
      style={{
        position: 'fixed', inset: 0,
        width: '100vw', height: '100vh',
        backgroundColor: '#131313',
        cursor: 'none', touchAction: 'none', overflow: 'hidden',
      }}
    >
      <Canvas
        frameloop="always"
        camera={{ position: [0, 0, 6.5], fov: 50 }}
        onCreated={({ camera }) => { camera.lookAt(0, 0, 0); }}
        style={{ background: '#131313' }}
      >
        <Suspense fallback={null}>
          <AlwaysInvalidate />
          <ambientLight intensity={0.65} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Environment preset="studio" blur={10.5} />
          <GridPlane targetCenterUv={targetCenterUv} />
          <ImageSphere
            spinVelocityXRef={sphereSpinVelocityX}
            spinVelocityYRef={sphereSpinVelocityY}
            angleXRef={sphereAngleX}
            angleYRef={sphereAngleY}
            isDraggingRef={isDraggingRef}
            snapActiveRef={snapActiveRef}
            snapTargetXRef={snapTargetXRef}
            snapTargetYRef={snapTargetYRef}
            onTileDirs={(dirs) => { tileDirsRef.current = dirs; }}
            onHoverStart={onImageHoverStart}
            onHoverMove={onImageHoverMove}
            onHoverEnd={onImageHoverEnd}
          />
          <HelmetModel sphereAngleRef={sphereAngleY} />
        </Suspense>
      </Canvas>

      {/* Dark vignette */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(19,19,19,0.85) 100%)',
      }} />

      {/* ECHO header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        zIndex: 10, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '32px',
      }}>
        <p style={{
          fontFamily: '"Michroma", sans-serif',
          fontSize: 'clamp(0.55rem, 1vw, 0.8rem)',
          letterSpacing: '0.25em',
          color: 'rgba(255,255,255,0.45)',
          fontWeight: 400,
          margin: '0 0 4px 0',
        }}>
          Remember With
        </p>
        <h1 style={{
          fontFamily: '"Syncopate", sans-serif',
          fontSize: 'clamp(2rem, 6vw, 5rem)',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: '#ffffff',
          margin: 0,
          textTransform: 'uppercase',
        }}>
          ECHO
        </h1>
      </div>

      {/* Tooltip */}
      {hoveredProject && (
        <div ref={tooltipElRef} style={{
          position: 'absolute', zIndex: 10, pointerEvents: 'none',
          left: 0, top: 0,
          padding: '8px 10px', borderRadius: '8px',
          background: 'rgba(0,0,0,0.72)', color: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.22)',
          fontSize: '12px', letterSpacing: '0.02em',
          whiteSpace: 'nowrap', userSelect: 'none',
          fontFamily: '"Michroma", sans-serif',
        }}>
          {hoveredProject}
        </div>
      )}

      {/* Custom cursor */}
      <div ref={cursorElRef} aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 0,
        width: '18px', height: '18px', borderRadius: '9999px',
        background: 'rgba(255,255,255,0.9)', mixBlendMode: 'difference',
        pointerEvents: 'none', zIndex: 30,
        opacity: 0, transition: 'opacity 150ms linear', willChange: 'transform',
      }} />

      <Loader />
    </div>
  );
}

useGLTF.preload("/models/helmet.glb");
