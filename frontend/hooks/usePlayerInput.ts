import { useState, useEffect, useRef, useCallback } from 'react';
import { JUMP_COOLDOWN } from '../constants';

export interface PlayerInputState {
    moveForward: boolean;
    moveBackward: boolean;
    moveLeft: boolean;
    moveRight: boolean;
    attemptJump: boolean; // Signal jump attempt
}

/**
 * Hook to manage player keyboard input for movement and jumping.
 * Ignores input when focus is on input fields.
 * @returns An object containing the current input state and a function to reset jump attempt.
 */
export const usePlayerInput = () => {
    const [inputState, setInputState] = useState<PlayerInputState>({
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        attemptJump: false,
    });
    const lastJumpTime = useRef<number>(0);
    const movementChanged = useRef<boolean>(false); // Track if state *actually* changed

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in input/textarea
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        let stateChanged = false;
        setInputState(prevState => {
            let newState = { ...prevState };
            let jumpAttempted = false;

            switch (e.key) {
                case 'w': case 'ArrowUp':
                    if (!prevState.moveForward) { newState.moveForward = true; stateChanged = true; }
                    break;
                case 's': case 'ArrowDown':
                    if (!prevState.moveBackward) { newState.moveBackward = true; stateChanged = true; }
                    break;
                case 'a': case 'ArrowLeft':
                    if (!prevState.moveLeft) { newState.moveLeft = true; stateChanged = true; }
                    break;
                case 'd': case 'ArrowRight':
                    if (!prevState.moveRight) { newState.moveRight = true; stateChanged = true; }
                    break;
                case ' ':
                    const now = Date.now();
                    if (!prevState.attemptJump && now - lastJumpTime.current > JUMP_COOLDOWN) {
                        newState.attemptJump = true;
                        jumpAttempted = true; // Set flag for immediate use below
                        stateChanged = true;
                    }
                    break;
                default:
                    return prevState; // No relevant key, return previous state
            }

            if (jumpAttempted) {
                lastJumpTime.current = Date.now(); // Update jump time only when jump is successfully initiated
            }

            // Only update movementChanged ref if state actually changed
            if (stateChanged) {
                movementChanged.current = true;
            }
            return newState;
        });

    }, []);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in input/textarea
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        let stateChanged = false;
        setInputState(prevState => {
            let newState = { ...prevState };
            switch (e.key) {
                case 'w': case 'ArrowUp':
                    if (prevState.moveForward) { newState.moveForward = false; stateChanged = true; }
                    break;
                case 's': case 'ArrowDown':
                    if (prevState.moveBackward) { newState.moveBackward = false; stateChanged = true; }
                    break;
                case 'a': case 'ArrowLeft':
                    if (prevState.moveLeft) { newState.moveLeft = false; stateChanged = true; }
                    break;
                case 'd': case 'ArrowRight':
                    if (prevState.moveRight) { newState.moveRight = false; stateChanged = true; }
                    break;
                default:
                    return prevState; // No relevant key, return previous state
            }
            // Only update movementChanged ref if state actually changed
            if (stateChanged) {
                movementChanged.current = true;
            }
            return newState;
        });
    }, []);

    // Function to reset the jump attempt flag after it's been processed
    const consumeJumpAttempt = useCallback(() => {
        setInputState(prevState => {
            if(prevState.attemptJump) {
                return { ...prevState, attemptJump: false };
            }
            return prevState;
        });
    }, []);

    // Effect to add/remove event listeners
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // Function to check and consume the movement changed flag
    const hasMovementInputChanged = useCallback(() => {
        const changed = movementChanged.current;
        movementChanged.current = false; // Reset after checking
        return changed;
    }, []);

    return { inputState, consumeJumpAttempt, hasMovementInputChanged };
}; 