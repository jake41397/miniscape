/**
 * Utility function to check if user is currently typing in any input field
 * This should be used by keyboard event handlers to avoid capturing input
 * when user is typing in fields like chat.
 */
export const isUserTyping = (): boolean => {
  // Check if any input or textarea is focused
  if (document.activeElement instanceof HTMLInputElement || 
      document.activeElement instanceof HTMLTextAreaElement) {
    return true;
  }
  
  // Check if our chat input is focused
  if (document.activeElement instanceof HTMLElement && 
      (document.activeElement.classList.contains('chat-input') || 
       document.activeElement.closest('.chat-input'))) {
    return true;
  }
  
  return false;
}; 