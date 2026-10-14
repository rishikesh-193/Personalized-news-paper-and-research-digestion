"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { useSceneState } from "@/components/motion";
import { createFrontPageTexture } from "./paper-texture";
import { createRandom } from "./prng";

/**
 * The hero scene: a small stack of newspaper sheets floating over the page.
 *
 * Deliberately lightweight — four sheets, one canvas-drawn texture, a handful
 * of ink particles, one directional light and one ambient. No environment map,
 * no remote assets, no postprocessing.
 */

const PAPER = "#F4EEE6";

/** Normalised scroll progress across roughly the first viewport of scroll. */
function useScrollProgress() {
  const progress = React.useRef(0);

  React.useEffect(() => {
    const update = () => {
      const span = Math.max(1, window.innerHeight * 0.9);
      progress.current = Math.min(1, Math.max(0, window.scrollY / span));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return progress;
}

function Sheets({ lowPower }: { lowPower: boolean }) {
  const root = React.useRef<THREE.Group | null>(null);
  const scroll = useScrollProgress();
  const { pointer } = useThree();
  const texture = React.useMemo(() => {
    const created = createFrontPageTexture();
    return created;
  }, []);

  React.useEffect(() => () => texture.dispose(), [texture]);

  const sheets = React.useMemo(
    () =>
      [
        // Front page: the sheet carrying the drawn texture.
        { y: 0.06, rotY: -0.05, rotZ: 0.015, tint: "#ffffff", textured: true },
        { y: -0.06, rotY: 0.06, rotZ: -0.02, tint: "#F1E9DE", textured: false },
        { y: -0.18, rotY: -0.02, rotZ: 0.03, tint: "#EADFD2", textured: false },
        { y: -0.3, rotY: 0.09, rotZ: -0.035, tint: "#E4D8C9", textured: false },
      ].slice(0, lowPower ? 3 : 4),
    [lowPower],
  );

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const t = performance.now() / 1000;
    const scrollProgress = scroll.current;
    // Slow drift, plus a pointer-parallax tilt that eases toward the cursor.
    const targetY = pointer.x * 0.22 + Math.sin(t * 0.18) * 0.06;
    const targetX = -pointer.y * 0.16 + Math.cos(t * 0.14) * 0.03;
    group.rotation.y += (targetY - group.rotation.y) * Math.min(1, delta * 2.4);
    group.rotation.x += (targetX - group.rotation.x) * Math.min(1, delta * 2.4);
    group.position.y = -scrollProgress * 0.5;
    group.rotation.z = scrollProgress * -0.06;

    // Scroll pushes the sheets apart, so the stack opens as the reader moves
    // down the page. Applied here because scroll does not re-render React.
    const spread = lowPower ? 0.07 : 0.11;
    group.children.forEach((child, index) => {
      const offset = index - 1.5;
      child.position.x = offset * spread * 0.9 * (1 + scrollProgress * 1.6);
      child.position.z = (index - 1.5) * -0.055 * (1 + scrollProgress);
    });
  });

  return (
    <group ref={root}>
      {sheets.map((sheet, index) => (
          <mesh
            key={index}
            // x and z are owned by the frame loop, which opens the stack on
            // scroll; this is only the starting position.
            position={[(index - 1.5) * 0.1, sheet.y, (index - 1.5) * -0.055]}
            rotation={[0, sheet.rotY, sheet.rotZ]}
            castShadow
          >
            <boxGeometry args={[2.95, 3.9, 0.014 + index * 0.002]} />
            <meshStandardMaterial
              map={sheet.textured ? texture : undefined}
              color={sheet.textured ? "#ffffff" : sheet.tint}
              roughness={0.72}
              metalness={0.02}
            />
          </mesh>
      ))}
    </group>
  );
}

function Ink({ count }: { count: number }) {
  const points = React.useRef<THREE.Points>(null);

  const geometry = React.useMemo(() => {
    const positions = new Float32Array(count * 3);
    const random = createRandom(count * 7919 + 13);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (random() - 0.5) * 9;
      positions[index * 3 + 1] = (random() - 0.5) * 6.5;
      positions[index * 3 + 2] = (random() - 0.5) * 3;
    }
    const created = new THREE.BufferGeometry();
    created.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return created;
  }, [count]);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!points.current) return;
    // Slow upward drift on a wrapping loop — cheap, and it never accumulates
    // unbounded coordinates.
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < count; index += 1) {
      array[index * 3 + 1] += delta * 0.06;
      if (array[index * 3 + 1] > 3.4) array[index * 3 + 1] = -3.4;
    }
    attribute.needsUpdate = true;
    points.current.rotation.y += delta * 0.02;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color="#17161A"
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function Rig() {
  const { camera } = useThree();
  // Pulled back far enough that the fanned stack clears the canvas edges at
  // every aspect ratio the hero column takes.
  const base = React.useRef(new THREE.Vector3(0, 0, 9.6));

  useFrame(() => {
    camera.position.lerp(base.current, 0.08);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export function NewspaperScene() {
  const { dpr, lowPower, paused } = useSceneState();

  return (
    <Canvas
      // Never render twice when the tab is hidden: "never" parks the loop.
      frameloop={paused ? "never" : "always"}
      dpr={dpr}
      camera={{ position: [0, 0, 9.6], fov: 28, near: 0.1, far: 40 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: "high-performance" }}
      shadows={!lowPower}
      style={{ background: "transparent" }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.85} color={PAPER} />
      <directionalLight
        position={[3.4, 4.2, 4.6]}
        intensity={1.5}
        color="#FFF6EA"
        castShadow={!lowPower}
        shadow-mapSize-width={lowPower ? 512 : 1024}
        shadow-mapSize-height={lowPower ? 512 : 1024}
      />
      <directionalLight position={[-4, -2, 2]} intensity={0.35} color="#E8D9C6" />
      <Sheets lowPower={lowPower} />
      <Ink count={lowPower ? 24 : 90} />
      {!lowPower ? (
        <ContactShadows
          position={[0, -2.65, 0]}
          opacity={0.28}
          scale={11}
          blur={2.6}
          far={5}
          resolution={512}
          color="#17161A"
        />
      ) : null}
      <Rig />
    </Canvas>
  );
}

export default NewspaperScene;
