import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MMDLoader } from "three/examples/jsm/loaders/MMDLoader.js";
import { MMDAnimationHelper } from "three/examples/jsm/animation/MMDAnimationHelper.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MotionPlayer } from "../engine/MotionPlayer";
import ChatPanel from "../components/ChatPanel";
import { VMDExporter } from "../engine/VMDExporter";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";

export default function MMDPage() {

  const playerRef = useRef<any>(null);

  const ikSolverRef = useRef<any>(null);

  const mountRef = useRef<HTMLDivElement>(null);

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

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    renderer.shadowMap.enabled = true;

    mountRef.current.appendChild(
      renderer.domElement
    );

    // =========================
    // Orbit Controls
    // =========================

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

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

    const ambient = new THREE.AmbientLight(
      0xffffff,
      0.6
    );

    scene.add(ambient);

    const hemiLight =
      new THREE.HemisphereLight(
        0xffffff,
        0x444444,
        1.5
      );

    scene.add(hemiLight);

    const dir =
      new THREE.DirectionalLight(
        0xffffff,
        1
      );

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

    const helper =new MMDAnimationHelper();

    let ikTargetBone: THREE.Bone;

    let mesh: any;

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
        mesh.skeleton.bones.forEach(
          (bone: any, index: number) => {
            console.log(
              index,
              bone.name
            );
          }
        );

        scene.add(mesh);


        ikTargetBone = new THREE.Bone();

        ikTargetBone.name = "RightHandIKTarget";

        ikTargetBone.position.set(8,12,0);

        const iks = [
          {
            target: targetIndex,
            effector: 30,  

            links: [
              { index: 26 },       // hand twist
              { index: 25 },       // elbow
              { index: 21 },       // arm twist
              { index: 20 },       // upper arm
              { index: 19 },       // shoulder C
              { index: 18 }        // shoulder
            ],

          iteration: 10

          }
        ];

        ikSolverRef.current = new CCDIKSolver(mesh, iks);

        // AI Motion Player
        playerRef.current = new MotionPlayer(mesh);

        // MMD Helper
        helper.add(mesh, {
          // animation: mmd.animation,
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

      helper.update(clock.getDelta());

      playerRef.current?.update();

      if (!ikTargetBone || !mesh) {
        controls.update();
        renderer.render(scene, camera);
        return;
      }

      const t = performance.now() * 0.001;

      ikTargetBone.position.x = Math.sin(t) * 5;


      ikSolverRef.current?.update();

      controls.update();

      renderer.render(scene, camera);

      
    };

    animate();

    // =========================
    // Resize Support
    // =========================

    const onResize = () => {

      camera.aspect =
        window.innerWidth /
        window.innerHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        window.innerWidth,
        window.innerHeight
      );
    };

    window.addEventListener(
      "resize",
      onResize
    );

    // =========================
    // Cleanup
    // =========================

    return () => {

      window.removeEventListener(
        "resize",
        onResize
      );

      controls.dispose();

      renderer.dispose();

      if (mountRef.current) {

        mountRef.current.removeChild(
          renderer.domElement
        );
      }
    };

  }, []);

  // =========================
  // Load AI Motion
  // =========================

  useEffect(() => {

    if (
      motionData &&
      playerRef.current
    ) {
      playerRef.current.loadMotion(
        motionData
      );
    }

  }, [motionData]);

  // =========================
  // UI
  // =========================
  const downloadVMD = () => {

    if (!motionData) return;

    const vmd =
      VMDExporter.export(motionData);

    const safeBuffer = new Uint8Array(vmd);

    const blob = new Blob(
      [safeBuffer],
    {
      type:"application/octet-stream"
    }
  );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;

    a.download = "ai_motion.vmd";

    a.click();

    URL.revokeObjectURL(url);
  };
  

  return (
    <>
      {/* Chat UI Overlay */}
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          zIndex: 10,
        }}
      >
        <ChatPanel
          onMotionGenerated={
            setMotionData
          }
        />
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
      <div
  style={{
    position: "fixed",
    top: 20,
    left: 20,
    zIndex: 10,
  }}
>

  <ChatPanel
    onMotionGenerated={
      setMotionData
    }
    />

    <button
      onClick={downloadVMD}
      style={{
        marginTop: 150,
        marginLeft: 30,
        padding: "10px 20px",
        cursor: "pointer",
        
      }}
    >
      Download VMD
    </button>

  </div>
    </>

    
  );
}