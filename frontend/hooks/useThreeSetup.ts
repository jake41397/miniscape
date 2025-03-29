import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { setupLights } from '../utils/threeUtils';

interface ThreeSetup {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  labelRenderer: CSS2DRenderer | null;
}

/**
 * Hook to initialize the core Three.js components (Scene, Camera, Renderer, LabelRenderer, Lights).
 * Handles window resizing and cleanup.
 * @param canvasRef Ref to the div element where the canvas should be appended.
 * @returns An object containing the initialized Three.js components.
 */
export const useThreeSetup = (canvasRef: React.RefObject<HTMLDivElement>): ThreeSetup => {
  const [setup, setSetup] = useState<ThreeSetup>({
    scene: null,
    camera: null,
    renderer: null,
    labelRenderer: null,
  });

  const lightsRef = useRef<{ ambientLight?: THREE.AmbientLight; directionalLight?: THREE.DirectionalLight }>({});

  useEffect(() => {
    if (!canvasRef.current) return;

    // --- Initialize Scene ---
    const scene = new THREE.Scene();

    // --- Initialize Camera ---
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 10, 10); // Initial position
    camera.lookAt(0, 0, 0);

    // --- Initialize Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color('#87CEEB')); // Sky blue
    canvasRef.current.appendChild(renderer.domElement);

    // --- Initialize Label Renderer ---
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Crucial
    canvasRef.current.appendChild(labelRenderer.domElement);

    // --- Setup Lights ---
    lightsRef.current = setupLights(scene);

    // --- Set State ---
    setSetup({ scene, camera, renderer, labelRenderer });

    // --- Handle Resize ---
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (camera) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
      }
      if (renderer) renderer.setSize(width, height);
      if (labelRenderer) labelRenderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', handleResize);

      // Remove renderers from DOM
      if (renderer && canvasRef.current?.contains(renderer.domElement)) {
          canvasRef.current.removeChild(renderer.domElement);
      }
      if (labelRenderer && canvasRef.current?.contains(labelRenderer.domElement)) {
          canvasRef.current.removeChild(labelRenderer.domElement);
      }

      // Dispose Three.js objects
      renderer?.dispose();

      // Dispose lights
      scene?.remove(lightsRef.current.ambientLight!);
      scene?.remove(lightsRef.current.directionalLight!);

      console.log("Three.js setup cleaned up.");
    };
  }, [canvasRef]); // Re-run only if canvasRef changes

  return setup;
}; 