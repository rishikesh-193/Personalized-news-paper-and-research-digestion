"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { useSceneState } from "@/components/motion";
import { createFrontPageTexture } from "./paper-texture";
import { createRandom } from "./prng";
import {
  SCENE_CAMERA_DISTANCE,
  SCENE_FOV_DEGREES,
  SHEET_HEIGHT,
  SHEET_LOW_POWER_SPREAD,
  SHEET_SCROLL_LIFT,
  SHEET_SCROLL_ROLL,
  SHEET_SPREAD,
  SHEET_WIDTH,
  SHEET_Z_GAP,
  heroSheets,
  sheetIsTextured,
  sheetThickness,
  sheetTint,
} from "./sheet-layout";

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

  // Sheet geometry lives in a pure module (sheet-layout.ts) so the depth
  // ordering can be tested without WebGL. A per-sheet yaw used to swing sheets
  // through each other and hide the front page's left third; the layout now
  // varies roll only and is guarded by a test.
  const sheets = React.useMemo(
    () => heroSheets(lowPower ? 3 : 4),
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
    // Scroll fans the sheets outward so the stack opens as the reader moves
    // down the page, and lifts it very slightly.
    //
    // Two deliberate constraints, both from the framing in <NewspaperScene>:
    // the lift is small and UPWARD, because the composition must never be
    // pushed out of the bottom of the canvas (it was, which is what clipped the
    // stack); and the lift, the roll and the fan are all bounded so the whole
    // stack stays inside the view frustum at every scroll position.
    group.position.y = scrollProgress * SHEET_SCROLL_LIFT;
    group.rotation.z = scrollProgress * SHEET_SCROLL_ROLL;

    // Applied here because scroll does not re-render React.
    const spread = lowPower ? SHEET_LOW_POWER_SPREAD : SHEET_SPREAD;
    const centre = (sheets.length - 1) / 2;
    group.children.forEach((child, index) => {
      const offset = index - centre;
      child.position.x = offset * spread * 0.9 * (1 + scrollProgress * 1.6);
      // Depth stays strictly ordered as the stack opens: the fan must never be
      // able to reorder the sheets, or the back sheets would cover the page.
      child.position.z = -index * SHEET_Z_GAP;
    });
  });

  return (
    <group ref={root}>
      {sheets.map((sheet) => (
          <mesh
            key={sheet.index}
            // x and z are owned by the frame loop, which opens the stack on
            // scroll; this is only the starting position.
            position={[sheet.x, sheet.y, sheet.z]}
            rotation={[0, sheet.rotY, sheet.rotZ]}
            castShadow
          >
            <boxGeometry
              args={[
                SHEET_WIDTH,
                SHEET_HEIGHT,
                sheetThickness(sheet.index),
              ]}
            />
            <meshStandardMaterial
              map={sheetIsTextured(sheet.index) ? texture : undefined}
              color={sheetIsTextured(sheet.index) ? "#ffffff" : sheetTint(sheet.index)}
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
  // every aspect ratio the hero column takes, counting the scroll lift, the
  // roll and the full spread. `stackBounds` and the framing test in
  // tests/presentation.test.ts assert this against the same constants.
  const base = React.useRef(new THREE.Vector3(0, 0, SCENE_CAMERA_DISTANCE));

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
      camera={{
        position: [0, 0, SCENE_CAMERA_DISTANCE],
        fov: SCENE_FOV_DEGREES,
        near: 0.1,
        far: 40,
      }}
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
          // Just under the stack. At -2.65 this sat outside the frustum and
          // rendered nothing at all.
          position={[0, -2.4, 0]}
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
