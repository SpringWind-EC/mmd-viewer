import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";

import { MotionPlayer } from "../engine/MotionPlayer";
import ChatPanel from "../components/ChatPanel";
import { VMDExporter } from "../engine/VMDExporter";

import { generateMotionPlan } from "../services/generateMotionPlan";
import { compileMotionPlan } from "../engine/MotionCompiler";

export default function MMDPage() {
  const playerRef = useRef<any>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const ikSolverRef = useRef<any>(null);

  const [motionData, setMotionData] = useState<any>(null);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!mountRef.current) return;

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

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    mountRef.current.appendChild(renderer.domElement);

    // =========================
    // Orbit Controls
    // =========================

    const controls = new OrbitControls(camera, renderer.domElement);

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxDistance = 100;

    // Allow full rotation around model
    controls.maxPolarAngle = Math.PI;

    // Focus orbit around character
    controls.target.set(0, 10, 0);
    controls.update();

    // =========================
    // Lights
    // =========================

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    scene.add(hemiLight);

    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 7);
    dir.castShadow = true;
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

    let mesh: any;

    const findBone = (mesh: any, name: string) => {
      return mesh.skeleton.bones.findIndex((bone: any) => bone.name === name);
    };

    loader.loadWithAnimation(
      "/models/cyrene.pmx",
      "/motions/motion.vmd",
      (mmd) => {
        if (loadedRef.current) return;

        loadedRef.current = true;

        mesh = mmd.mesh;

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Debug bone names
        mesh.skeleton.bones.forEach((bone: any, index: number) => {
          console.log(index, bone.name);
        });

        scene.add(mesh);

        // =========================
        // ARM IK SETUP
        // =========================

        const rightWrist = findBone(mesh, "右手首");
        const rightHandTwist = findBone(mesh, "右手捩");
        const rightElbow = findBone(mesh, "右ひじ");
        const rightArmTwist = findBone(mesh, "右腕捩");
        const rightArm = findBone(mesh, "右腕");
        const rightShoulderC = findBone(mesh, "右肩C");
        const rightShoulder = findBone(mesh, "右肩");

        const leftWrist = findBone(mesh, "左手首");
        const leftHandTwist = findBone(mesh, "左手捩");
        const leftElbow = findBone(mesh, "左ひじ");
        const leftArmTwist = findBone(mesh, "左腕捩");
        const leftArm = findBone(mesh, "左腕");
        const leftShoulderC = findBone(mesh, "左肩C");
        const leftShoulder = findBone(mesh, "左肩");

        const armBones = [
          rightWrist,
          rightHandTwist,
          rightElbow,
          rightArmTwist,
          rightArm,
          rightShoulderC,
          rightShoulder,
          leftWrist,
          leftHandTwist,
          leftElbow,
          leftArmTwist,
          leftArm,
          leftShoulderC,
          leftShoulder,
        ];

        if (armBones.some((index) => index < 0)) {
          console.warn(
            "Arm IK disabled because one or more bones were not found:",
            {
              rightWrist,
              rightHandTwist,
              rightElbow,
              rightArmTwist,
              rightArm,
              rightShoulderC,
              rightShoulder,
              leftWrist,
              leftHandTwist,
              leftElbow,
              leftArmTwist,
              leftArm,
              leftShoulderC,
              leftShoulder,
            }
          );
        } else {
          const iks = [
            {
              target: rightWrist,
              effector: rightWrist,
              links: [
                { index: rightHandTwist },
                { index: rightElbow },
                { index: rightArmTwist },
                { index: rightArm },
                { index: rightShoulderC },
                { index: rightShoulder },
              ],
              iteration: 10,
            },
            {
              target: leftWrist,
              effector: leftWrist,
              links: [
                { index: leftHandTwist },
                { index: leftElbow },
                { index: leftArmTwist },
                { index: leftArm },
                { index: leftShoulderC },
                { index: leftShoulder },
              ],
              iteration: 10,
            },
          ];

          ikSolverRef.current = new CCDIKSolver(mesh, iks);

          console.log("Arm IK enabled:", {
            rightWrist,
            rightHandTwist,
            rightElbow,
            rightArmTwist,
            rightArm,
            rightShoulderC,
            rightShoulder,
            leftWrist,
            leftHandTwist,
            leftElbow,
            leftArmTwist,
            leftArm,
            leftShoulderC,
            leftShoulder,
          });
        }

        // AI Motion Player
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
      requestAnimationFrame(animate);

      const delta = clock.getDelta();

      helper.update(delta);

      playerRef.current?.update();

      // if (mesh && ikSolverRef.current) {
      //   ikSolverRef.current.update();
      // }

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
      window.removeEventListener("resize", onResize);

      controls.dispose();
      renderer.dispose();

      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // =========================
  // Load AI Motion
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

  const testSemanticMotion = async () => {
    try {
      const plan = await generateMotionPlan(
        "two arms reach forward and bend like holding something"
      );

      console.log("SEMANTIC MOTION PLAN:", plan);

      const motion = compileMotionPlan(plan);

      console.log("COMPILED MOTION:", motion);

      setMotionData(motion);
    } catch (error) {
      console.error("Semantic motion test failed:", error);
    }
  };

  return (
    <>
      {/* Chat UI Overlay */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 100,
          pointerEvents: "auto",
        }}
      >
        <ChatPanel onMotionGenerated={setMotionData} />
      </div>

      {/* Three.js Canvas */}
      <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 0,
        }}
      />

      {/* Buttons Overlay */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 20,
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={downloadVMD}
          style={{
            marginTop: 10,
            marginLeft: 400,
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
            marginLeft: 400,
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