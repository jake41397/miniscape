import { useEffect, useRef } from 'react';
import { Object3D, Vector3 } from 'three';

interface UsePositionPredictionProps {
  playerMesh: Object3D | undefined;
  enabled: boolean;
}

// Custom Hook for Position Prediction
function usePositionPrediction({ playerMesh, enabled }: UsePositionPredictionProps) {
  const predictionRef = useRef<{
    velocity: Vector3;
    lastUpdateTime: number;
  }>({ velocity: new Vector3(), lastUpdateTime: Date.now() });
  
  // Keep an internal reference to the mesh
  const meshRef = useRef<Object3D | null>(null);
  
  // Update internal mesh reference when playerMesh changes
  useEffect(() => {
    if (playerMesh) {
      console.log("Position prediction updating mesh reference");
      meshRef.current = playerMesh;
    }
  }, [playerMesh]);

  useEffect(() => {
    if (!enabled) return;

    const predictPosition = () => {
      // Use the internal reference which might be more up-to-date
      const currentMesh = meshRef.current || playerMesh;
      
      if (!currentMesh) {
        // If no mesh yet, just keep checking
        requestAnimationFrame(predictPosition);
        return;
      }
      
      if (!currentMesh.userData || !currentMesh.userData.targetPosition) {
        // If target position not set yet, just keep checking
        requestAnimationFrame(predictPosition);
        return;
      }

      try {
        const currentTime = Date.now();
        const { velocity, lastUpdateTime } = predictionRef.current;
        const timeDelta = (currentTime - lastUpdateTime) / 1000; // Time in seconds.

        // Predict based on current velocity, capped at the maximum time delta
        const cappedTimeDelta = Math.min(timeDelta, 0.2);
        const predictedPosition = new Vector3().copy(currentMesh.position); // Start at current position
        predictedPosition.addScaledVector(velocity, cappedTimeDelta);

        currentMesh.position.copy(predictedPosition);

        predictionRef.current.lastUpdateTime = currentTime;
      } catch (error) {
        console.error("Error in position prediction:", error);
      }
      
      requestAnimationFrame(predictPosition);
    };
    
    const animationId = requestAnimationFrame(predictPosition);

    return () => { cancelAnimationFrame(animationId) };
  }, [enabled, playerMesh]);

  // Update velocity whenever target changes (called externally)
  const updateVelocity = (newTarget: Vector3) => {
    try {
      // Use the internal reference which might be more up-to-date
      const currentMesh = meshRef.current || playerMesh;
      
      if (!currentMesh) return;
      
      const currentTime = Date.now();
      const timeDelta = (currentTime - predictionRef.current.lastUpdateTime) / 1000;
      if (timeDelta > 0) {
        predictionRef.current.velocity.subVectors(newTarget, currentMesh.position).divideScalar(timeDelta);
      }
    } catch (error) {
      console.error("Error updating velocity:", error);
    }
  };

  return { updateVelocity };
}

export default usePositionPrediction; 