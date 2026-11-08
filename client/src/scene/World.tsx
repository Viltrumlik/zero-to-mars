import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ERAS } from '../../../shared/src/content/eras.ts';
import { input } from '../input.ts';
import { useGame, type Gfx } from '../store.ts';
import { City, LAMP_MAT, WINDOW_MAT } from './City.tsx';
import { Pedestrians, Traffic } from './Traffic.tsx';
import { Player } from './Player.tsx';
import { Markers } from './Markers.tsx';
import { Rocket } from './Rocket.tsx';
import { LAUNCH_POS } from './cityLayout.ts';

const FAR = [120, 190, 300];
const CARS = [10, 22, 34];
const WALKERS = [0, 14, 28];
const NIGHT_TOP = new THREE.Color('#070b24');
const NIGHT_BOTTOM = new THREE.Color('#1b2350');
const DUSK = new THREE.Color('#ff8a5c');
const SKY = new Map<string, THREE.Color>();
const col = (hex: string) => {
  let c = SKY.get(hex);
  if (!c) SKY.set(hex, (c = new THREE.Color(hex)));
  return c;
};

/** 0 = night, 1 = full day. */
function daylight(minute: number): number {
  const h = minute / 60;
  if (h < 5 || h >= 21.5) return 0;
  if (h < 7.5) return (h - 5) / 2.5;
  if (h < 17.5) return 1;
  return 1 - (h - 17.5) / 4;
}

function dusk(minute: number): number {
  const h = minute / 60;
  const a = Math.max(0, 1 - Math.abs(h - 6.5) / 1.5);
  const b = Math.max(0, 1 - Math.abs(h - 19) / 2);
  return Math.max(a, b);
}

/** Sky dome, sun, fog and night lights driven by the in-game clock (animated time-lapse). */
function DayNight({ era, gfx }: { era: number; gfx: Gfx }) {
  const far = FAR[gfx.distance];
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const stars = useRef<THREE.Group>(null);
  const shown = useRef(useGame.getState().s.day * 1440 + useGame.getState().s.minute);
  const uniforms = useMemo(() => ({ top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } }), []);
  useMemo(() => {
    scene.fog = new THREE.Fog('#ffe3c2', far * 0.45, far);
  }, [scene, far]);

  useFrame((_, dt) => {
    const s = useGame.getState().s;
    const target = s.day * 1440 + s.minute;
    const gap = target - shown.current;
    shown.current = gap > 0 && gap < 3000 ? shown.current + Math.min(gap, Math.max(60, gap * 2.5) * dt) : target;
    const minute = ((shown.current % 1440) + 1440) % 1440;
    const day = daylight(minute);
    const d = dusk(minute);
    const [skyTop, skyBottom] = ERAS[era].sky;
    uniforms.top.value.copy(NIGHT_TOP).lerp(col(skyTop), day);
    uniforms.bottom.value.copy(NIGHT_BOTTOM).lerp(col(skyBottom), day).lerp(DUSK, d * 0.55);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(uniforms.bottom.value);

    const angle = ((minute / 60 - 6) / 12) * Math.PI;
    const px = input.player.x;
    const pz = input.player.z;
    if (sun.current) {
      const elev = Math.max(0.25, Math.sin(angle));
      sun.current.position.set(px + Math.cos(angle) * 30, 12 + elev * 30, pz + 14);
      sun.current.target.position.set(px, 0, pz);
      sun.current.target.updateMatrixWorld();
      sun.current.intensity = 0.12 + 2.4 * day;
      sun.current.color.copy(col(d > 0.3 ? '#ffc58a' : day > 0.2 ? '#fff4e0' : '#9db4ff'));
    }
    if (hemi.current) {
      hemi.current.intensity = 0.14 + 0.95 * day;
      hemi.current.color.copy(col(day > 0.3 ? '#dbeaff' : '#6d7bd6'));
    }
    WINDOW_MAT.emissiveIntensity = 0.25 + 2.4 * (1 - day);
    LAMP_MAT.emissiveIntensity = (1 - day) * 3.2;
    if (stars.current) stars.current.visible = day < 0.35 || era >= 5;
  });

  const mars = era === 6;
  return (
    <>
      <mesh scale={300}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
          toneMapped={false}
          uniforms={uniforms}
          vertexShader={`varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
          fragmentShader={`uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
            void main(){ float h = smoothstep(-0.1, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`}
        />
      </mesh>
      <hemisphereLight ref={hemi} args={[mars ? '#ffcfb0' : '#dbeaff', mars ? '#5a2a1a' : '#4a6b3a', 1]} />
      <ambientLight intensity={0.1} />
      <directionalLight
        ref={sun}
        castShadow={gfx.shadows > 0}
        shadow-mapSize={gfx.shadows === 2 ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0006}
      />
      <group ref={stars}>
        <Stars radius={200} depth={40} count={gfx.distance === 2 ? 1500 : 600} factor={4} fade speed={0.5} />
      </group>
    </>
  );
}

/** Shakes the world (not the camera) when a rocket explodes. */
function Shaker({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const until = useRef(0);
  const last = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const anim = useGame.getState().launchAnim;
    if (anim && !anim.win && last.current !== anim.id) {
      last.current = anim.id;
      until.current = clock.elapsedTime + 4.2;
    }
    if (!g.current) return;
    const left = until.current - clock.elapsedTime;
    if (left > 0 && left < 1.4) {
      const a = 0.25 * (left / 1.4);
      g.current.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else g.current.position.set(0, 0, 0);
  });
  return <group ref={g}>{children}</group>;
}

/** Pinch-to-zoom for touch screens (the canvas itself). */
function usePinchZoom() {
  const { gl } = useThree();
  useMemo(() => {
    const el = gl.domElement;
    let startDist = 0;
    let startZoom = 1;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        startDist = dist(e);
        startZoom = input.zoom;
      }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && startDist) input.zoom = Math.min(2.4, Math.max(0.55, startZoom * (startDist / dist(e))));
    }, { passive: true });
    el.addEventListener('touchend', () => (startDist = 0), { passive: true });
  }, [gl]);
}

function Scene({ era, gfx }: { era: number; gfx: Gfx }) {
  usePinchZoom();
  const { camera, gl } = useThree();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gl = gl;
  useMemo(() => {
    camera.far = FAR[gfx.distance] + 40;
    camera.updateProjectionMatrix();
  }, [camera, gfx.distance]);
  return (
    <>
      <DayNight era={era} gfx={gfx} />
      <Shaker>
        <City era={era} shadows={gfx.shadows > 0} />
        {era >= 4 && (
          <group position={LAUNCH_POS}>
            <Rocket era={era} />
          </group>
        )}
        <Traffic count={CARS[gfx.traffic]} mars={era === 6} />
        <Pedestrians count={era === 6 ? 0 : WALKERS[gfx.traffic]} />
        <Player />
        <Markers />
      </Shaker>
    </>
  );
}

export function World() {
  const gfx = useGame((st) => st.gfx);
  const era = useGame((st) => st.s.era);
  const [degrade, setDegrade] = useState(1);
  const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, gfx.res) * degrade);
  const bloom = gfx.bloom && degrade > 0.75;
  const antialias = gfx.preset !== 'low' && !bloom;
  return (
    <Canvas
      key={`${antialias}`}
      shadows={gfx.shadows > 0}
      dpr={dpr}
      camera={{ position: [input.player.x, 22, input.player.z + 17], fov: 50, near: 0.5, far: FAR[gfx.distance] + 40 }}
      gl={{ antialias, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      {gfx.auto && (
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => setDegrade((d) => Math.max(0.5, d - 0.15))}
          onIncline={() => setDegrade((d) => Math.min(1, d + 0.1))}
        />
      )}
      <Scene era={era} gfx={gfx} />
      {bloom && (
        <EffectComposer multisampling={gfx.preset === 'ultra' ? 4 : 0}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.85} luminanceSmoothing={0.25} />
          <Vignette eskil={false} offset={0.3} darkness={gfx.preset === 'ultra' ? 0.45 : 0.3} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
