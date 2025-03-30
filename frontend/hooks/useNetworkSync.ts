// src/hooks/useNetworkSync.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Socket } from 'socket.io-client'; // Assuming Socket type from socket.io-client
import {
    initializeSocket,
    disconnectSocket,
    getSocket,
    isSocketReady,
    getSocketStatus,
    saveLastKnownPosition,
    getLastKnownPosition,
    setupSocketCleanup // If setupSocketCleanup is needed separately
} from '../game/network/socket';
import { setupSocketListeners } from '../game/network/gameSocketHandler';
import { PlayerPosition } from '../types/player'; // Ensure this type path is correct
import { createNameLabel, removeNameLabel } from '../utils/threeUtils'; // Import label utils
import { PLAYER_DEFAULT_Y, SEND_INTERVAL } from '../constants';
import WorldManager from '../game/world/WorldManager'; // Import type if needed for setupSocketListeners
import ItemManager from '../game/world/ItemManager'; // Import type if needed
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';


interface NetworkSyncOptions {
    playerRef: React.RefObject<THREE.Mesh | null>;
    playersRef: React.RefObject<Map<string, THREE.Mesh>>;
    nameLabelsRef: React.RefObject<Map<string, CSS2DObject>>;
    worldManagerRef: React.RefObject<WorldManager | null>;
    itemManagerRef: React.RefObject<ItemManager | null>;
    sceneRef: React.RefObject<THREE.Scene | null>;
    setPlayerNameState: (name: string) => void;
    setPlayerCount?: (count: number) => void;
}

/**
 * Hook to manage WebSocket connection, state, event listeners,
 * and sending player position updates.
 * @param options Configuration object with necessary refs and setters.
 * @returns Connection status and functions for manual reconnect/disconnect.
 */
export const useNetworkSync = ({
    playerRef,
    playersRef,
    nameLabelsRef,
    worldManagerRef,
    itemManagerRef,
    sceneRef,
    setPlayerNameState,
    setPlayerCount
}: NetworkSyncOptions) => {
    const [isConnected, setIsConnected] = useState(false);
    const [playerName, setPlayerName] = useState<string>(''); // Internal state for display name from socket

    const lastSentPosition = useRef({ x: 0, y: PLAYER_DEFAULT_Y, z: 0 });
    const lastSendTime = useRef(0);
    const lastPositionCacheTime = useRef(0);

    const socketCleanupRef = useRef<(() => void) | null>(null);
    const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null); // Keep track of cleanup interval from gameSocketHandler

    // Internal handler to bridge socket event to React state
    const handleSetPlayerName = useCallback((name: string) => {
        setPlayerName(name);
        setPlayerNameState(name); // Update the parent component's state as well
    }, [setPlayerNameState]);


     // Function to create name labels, passed to setupSocketListeners
     // Needs access to sceneRef and nameLabelsRef
     const createLabelWrapper = useCallback((name: string, mesh: THREE.Mesh) => {
         if (sceneRef.current && nameLabelsRef.current) {
             return createNameLabel(name, mesh, sceneRef.current, {
                 current: nameLabelsRef.current
             });
         }
         console.error("Cannot create label: Scene or nameLabelsRef not available.");
         // Return a dummy object or null if creation fails, though setupSocketListeners might expect a CSS2DObject
         // Ideally, ensure sceneRef/nameLabelsRef are ready before this is called.
         const dummyDiv = document.createElement('div');
         return new CSS2DObject(dummyDiv); // Return a minimal valid object
     }, [sceneRef, nameLabelsRef]); // Dependencies


    // Initialize connection and setup listeners
    useEffect(() => {
        let connectionMonitor: NodeJS.Timeout | null = null;
        let isMounted = true; // Track mount status
        let setupRetryTimer: NodeJS.Timeout | null = null;
        let setupAttempts = 0;
        const MAX_SETUP_ATTEMPTS = 10;

        // Function to attempt socket listener setup
        const attemptSocketListenerSetup = async (socket: any) => {
            try {
                // Check if all required refs are available
                if (!sceneRef.current) {
                    console.warn("Cannot setup socket listeners: scene ref is null");
                    return false;
                }
                if (!playerRef.current) {
                    console.warn("Cannot setup socket listeners: player ref is null");
                    return false;
                }
                if (!playersRef.current) {
                    console.warn("Cannot setup socket listeners: players map ref is null");
                    return false;
                }
                if (!nameLabelsRef.current) {
                    console.warn("Cannot setup socket listeners: name labels ref is null");
                    return false;
                }
                if (!worldManagerRef.current) {
                    console.warn("Cannot setup socket listeners: world manager ref is null");
                    return false;
                }
                
                // All critical refs are available, proceed with setup
                console.log("All refs available, setting up game socket listeners...");
                
                const setupOptions = {
                    scene: sceneRef.current,
                    playerRef: playerRef as React.MutableRefObject<THREE.Mesh | null>,
                    playersRef: playersRef as React.MutableRefObject<Map<string, THREE.Mesh>>,
                    nameLabelsRef: nameLabelsRef as React.MutableRefObject<Map<string, CSS2DObject>>,
                    worldManagerRef,
                    itemManagerRef,
                    cleanupIntervalRef,
                    setPlayerName: handleSetPlayerName,
                    createNameLabel: createLabelWrapper,
                };
                
                // Only add setPlayerCount if it's defined
                if (setPlayerCount) {
                    (setupOptions as any).setPlayerCount = setPlayerCount;
                }
                
                socketCleanupRef.current = await setupSocketListeners(setupOptions);
                
                console.log("Game socket listeners set up successfully.");
                return true;
            } catch (error) {
                console.error("Error setting up socket listeners:", error);
                return false;
            }
        };

        const connectAndSetup = async () => {
            try {
                console.log("Attempting socket connection...");
                const socket = await initializeSocket();

                if (!socket) {
                    console.warn("Socket initialization failed (likely no auth), redirecting...");
                    if(isMounted) window.location.href = '/auth/signin';
                    return;
                }
                console.log("Socket initialized.");

                // --- Socket Event Listeners ---
                const onConnect = () => {
                    if (!isMounted) return;
                    console.log('Socket connected.');
                    setIsConnected(true);

                    // Clear remote players on reconnect to prevent stale data
                    if (playersRef.current) {
                        playersRef.current.clear();
                    }
                    
                    // Also clear any leftover labels associated with old players
                    if(sceneRef.current && nameLabelsRef.current){
                        // Be careful here - don't remove the *local* player's label if it exists
                        const localPlayerId = playerRef.current?.userData?.playerId;
                        nameLabelsRef.current.forEach((label, id) => {
                            if(id !== localPlayerId) { // Keep local player label if needed
                                removeNameLabel(id, sceneRef.current!, {
                                    current: nameLabelsRef.current!
                                });
                            }
                        });
                    }

                    // Restore position from cache if sensible
                    const cachedPosition = getLastKnownPosition();
                    if (cachedPosition && playerRef.current) {
                        const isAtOrigin =
                            Math.abs(playerRef.current.position.x) < 0.1 &&
                            Math.abs(playerRef.current.position.z) < 0.1;
                        // Only restore if player is near origin (likely after disconnect/reconnect)
                        // AND the cached position is significantly different
                        const distFromOriginSq = cachedPosition.x**2 + cachedPosition.z**2;
                        if (isAtOrigin && distFromOriginSq > 0.1) {
                            console.log("Restoring position from cache:", cachedPosition);
                            playerRef.current.position.set(
                                cachedPosition.x,
                                cachedPosition.y, // Use cached Y as well
                                cachedPosition.z
                            );
                            lastSentPosition.current = { ...cachedPosition }; // Sync last sent position
                        }
                    }
                    
                    // Request initial game state after connection
                    // Just let the server's automatic handling work
                    console.log("Connection established, server should send initial data automatically");

                    // Only attempt to set up listeners after a short delay to give refs time to initialize
                    setTimeout(() => {
                        // Check if all refs are ready before attempting setup
                        const areRefsAvailable = 
                            !!sceneRef.current && 
                            !!playerRef.current && 
                            !!playersRef.current && 
                            !!nameLabelsRef.current && 
                            !!worldManagerRef.current;
                        
                        if (areRefsAvailable) {
                            console.log("All refs ready on connect, attempting socket listener setup immediately");
                            // Attempt immediate setup
                            attemptSocketListenerSetup(socket).catch(err => {
                                console.error("Error during immediate setup attempt:", err);
                            });
                        } else {
                            console.log("Some refs not ready yet on connect, will retry setup with delay");
                            // Start retry mechanism after a longer delay
                            setTimeout(() => {
                                attemptSocketListenerSetup(socket).then(success => {
                                    if (!success && isMounted) {
                                        setupAttempts = 0;
                                        if (setupRetryTimer) clearTimeout(setupRetryTimer);
                                        setupRetryTimer = setTimeout(retrySetup, 300);
                                    }
                                }).catch(err => {
                                    console.error("Error during delayed setup attempt:", err);
                                });
                            }, 500);
                        }
                        
                        // Define the retrySetup function
                        const retrySetup = () => {
                            if (!isMounted) return;
                            
                            setupAttempts++;
                            console.log(`Retry attempt ${setupAttempts}/${MAX_SETUP_ATTEMPTS} to set up socket listeners...`);
                            
                            // Check if refs are NOW available before attempting setup
                            const areRefsAvailable = 
                                !!sceneRef.current && 
                                !!playerRef.current && 
                                !!playersRef.current && 
                                !!nameLabelsRef.current && 
                                !!worldManagerRef.current;
                                
                            // Log the current state of refs
                            console.log("Current refs availability:", {
                                scene: !!sceneRef.current,
                                player: !!playerRef.current,
                                players: !!playersRef.current,
                                labels: !!nameLabelsRef.current,
                                worldManager: !!worldManagerRef.current,
                                areAllRefsAvailable: areRefsAvailable
                            });
                            
                            if (!areRefsAvailable) {
                                console.log("Still waiting for refs to be available...");
                                // Refs not yet ready, schedule another retry
                                if (setupAttempts < MAX_SETUP_ATTEMPTS && isMounted) {
                                    const backoff = Math.min(200 * Math.pow(1.5, setupAttempts), 3000);
                                    console.log(`Will retry in ${backoff}ms`);
                                    setupRetryTimer = setTimeout(retrySetup, backoff);
                                } else {
                                    console.error(`Gave up setting up socket listeners after ${setupAttempts} attempts - refs never became available`);
                                }
                                return;
                            }
                            
                            // Now attempt the setup since refs are available
                            attemptSocketListenerSetup(socket).then(success => {
                                if (!success && setupAttempts < MAX_SETUP_ATTEMPTS && isMounted) {
                                    // Calculate backoff time with increasing delays (200ms, 400ms, 800ms, etc.)
                                    const backoff = Math.min(200 * Math.pow(1.5, setupAttempts), 3000);
                                    console.log(`Setup failed again. Will retry in ${backoff}ms`);
                                    setupRetryTimer = setTimeout(retrySetup, backoff);
                                } else if (success) {
                                    console.log(`Successfully set up socket listeners on retry attempt ${setupAttempts}`);
                                    if (setupRetryTimer) {
                                        clearTimeout(setupRetryTimer);
                                        setupRetryTimer = null;
                                    }
                                } else if (setupAttempts >= MAX_SETUP_ATTEMPTS) {
                                    console.error(`Failed to set up socket listeners after ${MAX_SETUP_ATTEMPTS} attempts - giving up`);
                                }
                            }).catch(error => {
                                console.error("Error during socket listener setup retry:", error);
                                if (setupAttempts < MAX_SETUP_ATTEMPTS && isMounted) {
                                    const backoff = Math.min(500 * Math.pow(1.5, setupAttempts), 5000); // Longer backoff after errors
                                    setupRetryTimer = setTimeout(retrySetup, backoff);
                                }
                            });
                        };
                    }, 200);

                    // If you need to request specific data, we could do it in a separate function
                    // after the socket connection is confirmed
                    setTimeout(() => {
                        if (socket.connected && socket.id) {
                            console.log("Requesting player data via getPlayerData");
                            try {
                                socket.emit('getPlayerData', socket.id, (data: any) => {
                                    console.log("Received player data:", data);
                                });
                            } catch (err) {
                                console.error("Error requesting player data:", err);
                            }
                        }
                    }, 1000);
                };

                const onDisconnect = (reason: Socket.DisconnectReason) => {
                    if (!isMounted) return;
                    console.log('Socket disconnected. Reason:', reason);
                    setIsConnected(false);
                    // Optionally cache position on disconnect
                    if (playerRef.current) {
                        saveLastKnownPosition(playerRef.current.position);
                        console.log("Cached position on disconnect.");
                    }
                };

                // Attach core connect/disconnect listeners
                socket.on('connect', onConnect);
                socket.on('disconnect', onDisconnect);

                // Initial state check
                setIsConnected(socket.connected);
                if (socket.connected) {
                    onConnect(); // Trigger initial setup if already connected
                }

                // Monitor connection status periodically as a fallback
                connectionMonitor = setInterval(() => {
                    if (!isMounted) return;
                    const status = getSocketStatus();
                    if (status.connected !== isConnected) {
                        console.warn(`Connection status mismatch detected. Forcing update to: ${status.connected}`);
                        setIsConnected(status.connected);
                        // If newly connected, attempt to run onConnect flow
                        if (status.connected && !isConnected) {
                            console.log("Connection detected via monitor, triggering connect flow");
                            onConnect();
                        } else if (!status.connected && isConnected) {
                            console.log("Disconnection detected via monitor, triggering disconnect flow");
                            onDisconnect('monitor_update' as any);
                        }
                    }
                }, 5000);
            } catch (error) {
                console.error("Error in connectAndSetup:", error);
            }
        };

        connectAndSetup();

        // --- Cleanup ---
        return () => {
            isMounted = false;
            console.log("Cleaning up network sync...");
            if (connectionMonitor) clearInterval(connectionMonitor);
            if (setupRetryTimer) clearTimeout(setupRetryTimer);

            // Execute the cleanup function returned by setupSocketListeners
            socketCleanupRef.current?.();
            socketCleanupRef.current = null;

             // Clear the interval started within gameSocketHandler
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
                cleanupIntervalRef.current = null;
            }


            // Attempt to get socket for cleanup (might already be disconnected)
             getSocket().then(socket => {
                 if (socket) {
                    // Cache position before potentially disconnecting
                    if (playerRef.current) {
                       saveLastKnownPosition(playerRef.current.position);
                       console.log("Cached position during network cleanup.");
                    }
                     socket.off('connect');
                     socket.off('disconnect');
                     // Don't necessarily disconnect here, let the main app lifecycle handle it
                     // disconnectSocket();
                 }
             }).catch(err => {
                 console.warn("Error getting socket during cleanup:", err);
             });

             setIsConnected(false); // Ensure state reflects cleanup
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerRef, playersRef, nameLabelsRef, worldManagerRef, itemManagerRef, sceneRef, handleSetPlayerName, createLabelWrapper, setPlayerCount]); // Add dependencies


     // Function to send position update, called from game loop
     const sendPositionUpdate = useCallback((movementOccurred: boolean) => {
         if (!isConnected || !playerRef.current) return;

         const position = playerRef.current.position;
         const { x, y, z } = position;

         // Skip sending updates for default position (0,1,0) to avoid unnecessary network traffic
         if (Math.abs(x) < 0.01 && Math.abs(y - 1) < 0.01 && Math.abs(z) < 0.01) {
             return;
         }

         const dx = x - lastSentPosition.current.x;
         const dy = y - lastSentPosition.current.y; // Include Y for jump/fall detection
         const dz = z - lastSentPosition.current.z;
         const distanceMovedSq = dx * dx + dy * dy + dz * dz;

         const now = Date.now();
         const timeSinceLastSend = now - lastSendTime.current;

         // Send if:
         // 1. Any movement occurred (position OR orientation) AND interval passed
         // 2. Significant position change (>0.01 units sq) AND interval passed (covers drift)
         // 3. Remove the periodic update every second (this was causing unnecessary traffic)
         const shouldSend = timeSinceLastSend >= SEND_INTERVAL &&
                          (movementOccurred || distanceMovedSq > 0.01);


         if (shouldSend) {
             getSocket().then(socket => {
                 if (socket) {
                     const positionData: PlayerPosition = { x, y, z, timestamp: now };
                     socket.emit('playerMove', positionData);

                     // Debug log for significant movements
                     if (distanceMovedSq > 0.5) {
                         console.log(`Sent position update, moved: ${Math.sqrt(distanceMovedSq).toFixed(2)} units`);
                     }

                     // Cache position frequently when moving
                     if (now - lastPositionCacheTime.current > 1000) { // Cache every second during movement
                         saveLastKnownPosition(positionData);
                         lastPositionCacheTime.current = now;
                     }

                     // Update tracking refs
                     lastSentPosition.current = { x, y, z };
                     lastSendTime.current = now;
                 }
             }).catch(err => console.error("Error getting socket to send position:", err));
         }
     }, [isConnected, playerRef]); // Dependencies


     // Function for manual reconnect attempt
     const reconnect = useCallback(() => {
         if (!isConnected) {
             console.log("Manual reconnect requested...");
              // Re-initialize the socket connection process
              // Note: This might cause the useEffect to run again if dependencies change,
              // handle potential race conditions or double initializations.
              // A simpler approach might be just:
             initializeSocket().then(socket => {
                 if(socket && !socket.connected) {
                     socket.connect(); // Attempt explicit connect if needed
                 }
                 console.log("Manual reconnect attempt finished.");
             }).catch(err => console.error("Manual reconnect failed:", err));
         }
     }, [isConnected]);


    return { 
        isConnected, 
        playerName, 
        reconnect,
        sendPositionUpdate
    };
};