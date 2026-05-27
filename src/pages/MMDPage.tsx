import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";

import { MotionPlayer } from "../engine/MotionPlayer";
import ChatPanel from "../components/ChatPanel";
import { VMDExporter } from "../engine/VMDExporter";

export default function MMDPage() {
  const playerRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const ikSolverRef = useRef<any>(null);

  const [motionData, setMotionData] = useState<any>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let disposed = false;
    let animationFrameId = 0;
    let mesh: any = null;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // =========================
    // Scene
    // =========================

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // =========================
    // Camera
    // =========================

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );

    camera.position.set(0, 15, 40);

    // =========================
    // Renderer
    // =========================

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    renderer.domElement.style.display = "block";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.pointerEvents = "auto";

    mountRef.current.appendChild(renderer.domElement);

    // =========================
    // Orbit Controls
    // =========================

    const controls = new OrbitControls(camera, renderer.domElement);

    controls.enabled = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;

    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;

    controls.screenSpacePanning = true;
    controls.minDistance = 10;
    controls.maxDistance = 100;

    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    controls.target.set(0, 10, 0);
    controls.update();

    // =========================
    // Lights
    // =========================

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);

    //Do not cast shadow 
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(-30, 50, 25);
    scene.add(dir);

    // =========================
    // Ground
    // =========================

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: 0x222222,
      })
    );

    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -10;
    floor.receiveShadow = true;

    scene.add(floor);

    // =========================
    // MMD Setup
    // =========================

    const loader = new MMDLoader();
    const helper = new MMDAnimationHelper();

    console.log("Starting MMD load...");

    loader.loadWithAnimation(
      "/models/cyrene.pmx",
      "/motions/motion.vmd",
      (mmd) => {
        if (disposed) {
          console.warn("MMD load finished after cleanup. Ignoring stale load.");
          return;
        }

        console.log("MMD loaded successfully:", mmd);

        mesh = mmd.mesh;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Keep model aligned with your floor/camera setup
        mesh.position.set(0, -10, 0);

        // Debug bone names
        mesh.skeleton.bones.forEach((bone: any, index: number) => {
          console.log(index, bone.name);
        });

        scene.add(mesh);

        // =========================
        // BUILT-IN PMX IK SETUP
        // =========================
        // Use the PMX model's own IK definitions.
        // This is safer than manually creating leg IK rules.

        const pmxIKs = mesh.geometry.userData.MMD?.iks;

        if (!pmxIKs || pmxIKs.length === 0) {
          console.warn("No built-in PMX IK data found.");
        } else {
          console.log("Using built-in PMX IKs:", pmxIKs);

          ikSolverRef.current = new CCDIKSolver(mesh, pmxIKs);

          console.log("Built-in PMX IK solver enabled.");
        }

        // AI / Manual Motion Player
        playerRef.current = new MotionPlayer(mesh);

        // MMD Helper
        helper.add(mesh, {
          // temporary disabled animation: mmd.animation,
          physics: false,
        });
      }
    );

    // =========================
    // Animation Loop
    // =========================

    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();

      // Let MMD helper update first.
      helper.update(delta);

      // Then apply your generated/manual motion.
      playerRef.current?.update();

      // Then solve leg IK after MotionPlayer moves IK target positions.
      if (mesh && ikSolverRef.current) {
        mesh.updateMatrixWorld(true);
        ikSolverRef.current.update();
      }

      controls.update();

      renderer.render(scene, camera);
    };

    animate();

    // =========================
    // Resize Support
    // =========================

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", onResize);

    // =========================
    // Cleanup
    // =========================

    return () => {
      disposed = true;

      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousBodyOverflow;

      cancelAnimationFrame(animationFrameId);

      controls.dispose();

      if (mesh) {
        scene.remove(mesh);
      }

      renderer.dispose();

      playerRef.current = null;
      ikSolverRef.current = null;

      if (
        mountRef.current &&
        renderer.domElement.parentElement === mountRef.current
      ) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // =========================
  // Load AI / Manual Motion
  // =========================

  useEffect(() => {
    if (motionData && playerRef.current) {
      playerRef.current.loadMotion(motionData);
    }
  }, [motionData]);

  // =========================
  // UI
  // =========================

  const downloadVMD = () => {
    if (!motionData) return;

    const vmd = VMDExporter.export(motionData);
    const safeBuffer = new Uint8Array(vmd);

    const blob = new Blob([safeBuffer], {
      type: "application/octet-stream",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "ai_motion.vmd";
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Three.js Canvas */}
      <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "auto",
        }}
      />

      {/* Chat UI Overlay */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 50,
          pointerEvents: "auto",
        }}
      >
        <ChatPanel onMotionGenerated={setMotionData} />
      </div>

      {/* Buttons Overlay */}
      <div
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 50,
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={downloadVMD}
          style={{
            padding: "10px 20px",
            cursor: "pointer",
          }}
        >
          Download VMD
        </button>

        {/*
        <button
          onClick={testSemanticMotion}
          style={{
            marginTop: 10,
            padding: "10px 20px",
            cursor: "pointer",
            display: "block",
          }}
        >
          Test Semantic Motion
        </button>
        */}
      </div>
    </>
  );
}
