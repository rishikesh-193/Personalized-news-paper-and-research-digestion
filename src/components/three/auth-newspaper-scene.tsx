"use client";

import * as React from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { useSceneState } from "@/components/motion";
import { createFrontPageTexture } from "./paper-texture";

/**
 * The auth illustration: a newspaper on a desk, turning its front page.
 *
 * Same rules as the hero — one canvas, no remote assets, no postprocessing,
 * DPR capped by the shared Scene boundary, parked when off-screen or hidden.
 */
function TurningSheets({ lowPower }: { lowPower: boolean }) {
  const root = React.useRef<THREE.Group | null>(null);
  const cover = React.useRef<THREE.Group | null>(null);

  const texture = React.useMemo(() => createFrontPageTexture(), []);
  React.useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_, delta) => {
    const group = root.current;
    const page = cover.current;
    if (!group || !page) return;
    const t = performance.now() / 1000;

    // A slow, never-completing page turn: the sheet lifts and settles.
    const turn = (Math.sin(t * 0.32) + 1) / 2;
    page.rotation.y = -0.06 - turn * 0.5;
    page.position.x = turn * 0.06;

    group.rotation.y += (Math.sin(t * 0.12) * 0.09 - group.rotation.y) * Math.min(1, delta * 1.6);
    group.rotation.x += (Math.cos(t * 0.1) * 0.04 - group.rotation.x) * Math.min(1, delta * 1.6);
  });

  return (
    <group ref={root}>
      {/* The page underneath, and one or two sheets behind it. */}
      <mesh position={[0.02, -0.02, -0.02]} rotation={[0, 0.05, -0.01]}>
        <boxGeometry args={[2.7, 3.5, 0.012]} />
        <meshStandardMaterial color="#EADFD2" roughness={0.75} />
      </mesh>
      {!lowPower ? (
        <mesh position={[-0.03, -0.06, -0.06]} rotation={[0, -0.04, 0.015]}>
          <boxGeometry args={[2.7, 3.5, 0.01]} />
          <meshStandardMaterial color="#E1D4C3" roughness={0.8} />
        </mesh>
      ) : null}

      {/* The turning front page, hinged on its left edge: the sheet sits at
          +1.35 inside a group offset to -1.35, so the group origin is the
          hinge and the closed page stays centred. */}
      <group ref={cover} position={[-1.35, 0.02, 0.06]}>
        <mesh position={[1.35, 0, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[2.7, 3.5, 0.016]} />
          <meshStandardMaterial map={texture} color="#ffffff" roughness={0.72} />
        </mesh>
      </group>
    </group>
  );
}

export function AuthNewspaperScene() {
  const { dpr, lowPower, paused } = useSceneState();

  return (
    <Canvas
      frameloop={paused ? "never" : "always"}
      dpr={dpr}
      camera={{ position: [0, 0, 7.6], fov: 30, near: 0.1, far: 40 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.9} color="#F4EEE6" />
      <directionalLight position={[3, 3.6, 4.2]} intensity={1.45} color="#FFF6EA" />
      <directionalLight position={[-3.4, -1.4, 2]} intensity={0.32} color="#E8D9C6" />
      <TurningSheets lowPower={lowPower} />
    </Canvas>
  );
}

export default AuthNewspaperScene;
