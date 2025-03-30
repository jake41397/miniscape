import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../../game/network/socket';
import soundManager from '../../game/audio/soundManager';

interface ChatMessage {
  name?: string;
  text: string;
  playerId?: string;
  timestamp?: number;
  sender?: string; // For backward compatibility
  isLocal?: boolean;
  type?: 'player' | 'system' | 'action'; // Message type for styling
  content?: string; // For newer message format from server
}

// Persist messages in localStorage (limited to last 50)
const saveMessages = (messages: ChatMessage[]) => {
  try {
    // Only keep the last 50 messages to avoid storage limits
    const messagesToSave = messages.slice(-50);
    localStorage.setItem('chat_messages', JSON.stringify(messagesToSave));
  } catch (error) {
    console.error('Error saving chat messages to localStorage:', error);
  }
};

// Load messages from localStorage
const loadMessages = (): ChatMessage[] => {
  try {
    const savedMessages = localStorage.getItem('chat_messages');
    console.log('Loading chat messages from localStorage:', 
      savedMessages ? `Found ${JSON.parse(savedMessages).length} messages` : 'No messages found');
    
    if (savedMessages) {
      return JSON.parse(savedMessages);
    }
  } catch (error) {
    console.error('Error loading chat messages from localStorage:', error);
  }
  console.log('Returning empty messages array from loadMessages');
  return [];
};

const ChatPanel: React.FC = () => {
  
  // Initialize messages from localStorage
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const loadedMessages = loadMessages();
    console.log('Initial messages state set with', loadedMessages.length, 'messages');
    return loadedMessages;
  });
  const [inputValue, setInputValue] = useState('');
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Keep track of our own socket ID for message comparison
  const mySocketIdRef = useRef<string | undefined>(undefined);
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    console.log('Messages changed, saving to localStorage:', messages.length, 'messages');
    saveMessages(messages);
  }, [messages]);
  
  // Create a chat message handler that can access latest messages
  const handleChatMessage = useCallback((message: ChatMessage) => {
    console.log('🔴 Chat message received in panel:', message);
    
    // Debug check if message has all required fields
    // Check for either text or content field (newer format uses content)
    if (!message.text && !message.content) {
      console.warn('Received message with empty content!', message);
      return; // Skip messages with no text/content
    }
    
    // Determine if this is our own message or from another player
    const isOwnMessage = message.playerId === mySocketIdRef.current;
    
    // Check if we're seeing a server echo of our own message
    // that we already added locally to avoid duplicates
    if (isOwnMessage) {
      // Get the latest messages (not from closure)
      const latestMessages = [...messages];
      
      // Compare using either text or content property
      const messageContent = message.text || message.content || '';
      
      const recentOwnMessage = latestMessages.find(msg => 
        msg.isLocal && 
        (msg.text === messageContent || msg.content === messageContent) && 
        msg.timestamp && 
        message.timestamp && 
        Math.abs(msg.timestamp - message.timestamp) < 2000
      );
      
      if (recentOwnMessage) {
        console.log('Skipping server echo of our own message that was already added locally');
        return;
      }
    }
    
    console.log(`Adding message from ${isOwnMessage ? 'ourselves' : message.name || 'system'} to chat history`);
    
    // Create a formatted message object to add to our state
    const formattedMessage = {
      ...message,
      // Ensure text property exists for rendering
      text: message.text || message.content || '',
      // For display consistency
      name: isOwnMessage ? 'You' : message.name || message.sender || 'Unknown'
    };
    
    // Add to messages state
    setMessages(prevMessages => [...prevMessages, formattedMessage]);
    
    // Play sound for new message (only for others' messages)
    if (!isOwnMessage) {
      soundManager.play('chatMessage');
    }
  }, [messages]);
  
  useEffect(() => {
    let socketInstance: any = null;
    
    // Connect to socket
    async function setupSocket() {
      const socket = await getSocket();
      if (!socket) return;
      
      // First remove any existing chatMessage listeners to prevent duplicates
      socket.off('chatMessage');
      
      // Store our socket ID for message comparison
      mySocketIdRef.current = socket.id;
      
      socketInstance = socket;
      
      // Listen for chat messages using our callback handler
      socket.on('chatMessage', handleChatMessage);
      
      // Log to confirm listener setup
      console.log('Chat message listener set up in ChatPanel');
    }
    
    setupSocket();
    
    // Clean up on unmount
    return () => {
      if (socketInstance) {
        console.log('Removing chatMessage listener on ChatPanel unmount');
        socketInstance.off('chatMessage');
      }
    };
  }, [handleChatMessage]); // Only dependency is the message handler
  
  // Scroll to bottom when messages change
  useEffect(() => {
    console.log(`Messages updated, total count: ${messages.length}`);
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (inputValue.trim() === '') return;
    
    const socket = await getSocket();
    if (!socket) {
      console.error('Cannot send message - socket not connected');
      return;
    }
    
    // Check if this is a command (starts with /)
    if (inputValue.startsWith('/')) {
      handleChatCommand(inputValue);
      setInputValue('');
      return;
    }
    
    console.log('Sending chat message:', inputValue);
    
    // Get our own player name
    const playerName = 'You'; // We'll use a generic name for local display
    
    // Create a direct message for immediate display
    const directMessage = {
      name: playerName,
      text: inputValue,
      timestamp: Date.now(),
      // Mark as local so we can style it differently
      isLocal: true
    };
    
    // Add local message immediately without waiting for server
    setMessages(prev => [...prev, directMessage]);
    
    // Send to the server - it will broadcast to all clients including us
    socket.emit('chat', inputValue);
    
    // Clear input
    setInputValue('');
  };
  
  // New function to handle chat commands
  const handleChatCommand = async (commandString: string) => {
    const parts = commandString.trim().split(' ');
    const command = parts[0].toLowerCase();
    
    switch (command) {
      case '/help':
        // Display available commands
        setMessages(prev => [...prev, {
          name: 'System',
          text: 'Available commands:',
          timestamp: Date.now(),
          type: 'system'
        }, {
          name: 'System',
          text: '/drop [item_name] - Drops the specified item on the ground',
          timestamp: Date.now(),
          type: 'system'
        }, {
          name: 'System',
          text: '/give [item_name] - Gives you the specified item',
          timestamp: Date.now(),
          type: 'system'
        }, {
          name: 'System',
          text: '/help - Shows this help message',
          timestamp: Date.now(),
          type: 'system'
        }]);
        break;
        
      case '/drop':
        if (parts.length < 2) {
          // Add error message to chat
          setMessages(prev => [...prev, {
            name: 'System',
            text: 'Usage: /drop [item_name] - Drops the specified item on the ground',
            timestamp: Date.now(),
            type: 'system'
          }]);
          return;
        }
        
        // Get the item name (combine all words after /drop)
        const itemName = parts.slice(1).join(' ');
        console.log(`Attempting to drop item: ${itemName}`);
        
        const socket = await getSocket();
        if (!socket) {
          console.error('Cannot execute command - socket not connected');
          setMessages(prev => [...prev, {
            name: 'System',
            text: 'Error: Not connected to server',
            timestamp: Date.now(),
            type: 'system'
          }]);
          return;
        }
        
        // Send drop command to server
        (socket as any).emit('chatCommand', { 
          command: 'drop', 
          params: { itemName } 
        });
        
        // Add feedback message
        setMessages(prev => [...prev, {
          name: 'System',
          text: `Attempting to drop: ${itemName}`,
          timestamp: Date.now(),
          type: 'system'
        }]);
        break;
        
      default:
        // Unknown command
        setMessages(prev => [...prev, {
          name: 'System',
          text: `Unknown command: ${command}`,
          timestamp: Date.now(),
          type: 'system'
        }]);
        break;
    }
  };
  
  // Check if a message is recent (less than 10 seconds old)
  const isRecentMessage = (timestamp?: number) => {
    if (!timestamp) return false;
    return Date.now() - timestamp < 10000; // 10 seconds
  };
  
  return (
    <div 
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        width: '300px',
        height: minimized ? '40px' : '250px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '5px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.3s ease',
        overflow: 'hidden',
        zIndex: 100
      }}
    >
      <div 
        style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          cursor: 'pointer'
        }}
      >
        <span style={{ color: 'white', fontWeight: 'bold' }}>
          Chat {messages.length > 0 && `(${messages.length})`}
        </span>
        <div>
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering minimize
              
              // Create test message options
              const testOptions = [
                { role: 'local', name: 'You', isLocal: true },
                { role: 'other', name: 'Test Player', playerId: 'test-player-id' }
              ];
              
              // Alternate between local and other player messages for easier testing
              const nextTest = messages.length % 2 === 0 ? testOptions[0] : testOptions[1];
              
              // Add a test message directly to state
              const testMessage = {
                ...nextTest,
                text: `${nextTest.role === 'local' ? 'Your' : 'Other player'} test message at ${new Date().toLocaleTimeString()}`,
                timestamp: Date.now()
              };
              
              console.log('Adding test message directly to state:', testMessage);
              setMessages(prev => [...prev, testMessage]);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff9800',
              cursor: 'pointer',
              marginRight: '8px',
              fontSize: '12px'
            }}
            title="Add test message (alternates between your message and other player's message)"
          >
            🧪
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering minimize
              console.log('Force refreshing chat messages display');
              setMessages([...messages]); // Force re-render
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4caf50',
              cursor: 'pointer',
              marginRight: '8px',
              fontSize: '12px'
            }}
            title="Refresh messages"
          >
            🔄
          </button>
          <span 
            style={{ color: 'white', cursor: 'pointer' }}
            onClick={() => setMinimized(!minimized)}
          >
            {minimized ? '▲' : '▼'}
          </span>
        </div>
      </div>
      
      {!minimized && (
        <>
          <div 
            style={{
              flex: 1,
              padding: '10px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            {/* Debug information */}
            <div style={{ color: '#666', fontSize: '10px', marginBottom: '5px' }}>
              Debug: {messages.length} messages in state
            </div>

            {/* Empty state message */}
            {messages.length === 0 && (
              <div style={{ color: '#888', textAlign: 'center', padding: '20px 0' }}>
                No messages yet. Start chatting or type /help to see available commands!
              </div>
            )}
            
            {/* Simplified message rendering */}
            {messages.map((msg, index) => {
              // Determine if this is a message from ourselves or another player
              const isOwnMessage = msg.isLocal || (msg.playerId === mySocketIdRef.current);
              
              // Use type from message, or determine based on properties
              const messageType = msg.type || 
                (msg.playerId === 'system' ? 'system' : isOwnMessage ? 'player' : 'player');
              
              // Use content field if available (new format) or text (old format)
              const messageText = msg.content || msg.text || '[Empty message]';
              
              // Handle different message type styling
              let backgroundColor, borderColor, nameColor;
              let displayName = msg.name || msg.sender || 'Unknown';
              
              if (messageType === 'system') {
                backgroundColor = 'rgba(255, 152, 0, 0.3)'; // Orange for system
                borderColor = '#ff9800';
                nameColor = '#ffcc80';
                displayName = 'System';
              } else if (messageType === 'action') {
                backgroundColor = 'rgba(103, 58, 183, 0.3)'; // Purple for actions
                borderColor = '#673ab7';
                nameColor = '#d1c4e9';
                displayName = 'Action';
              } else { // Default player message
                backgroundColor = isOwnMessage 
                  ? 'rgba(25, 118, 210, 0.5)' // Blue for our messages 
                  : 'rgba(50, 50, 50, 0.5)';  // Dark for others
                borderColor = isOwnMessage 
                  ? '#2196f3'   // Blue border for ours
                  : '#4caf50';  // Green border for others
                nameColor = isOwnMessage ? '#90caf9' : '#4caf50';
              }
              
              return (
                <div 
                  key={`msg-${index}`} 
                  style={{ 
                    color: 'white', 
                    fontSize: '14px',
                    backgroundColor: backgroundColor,
                    padding: '6px 10px',
                    borderRadius: '4px',
                    borderLeft: `3px solid ${borderColor}`,
                    marginBottom: '4px'
                  }}
                >
                  <div style={{ 
                    color: nameColor, 
                    fontWeight: 'bold', 
                    marginBottom: '2px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{displayName}</span>
                    <span style={{ fontSize: '10px', color: '#aaa' }}>
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                  <div>{messageText}</div>
                </div>
              );
            })}
            
            <div ref={messagesEndRef} />
          </div>
          
          <form 
            onSubmit={handleSubmit}
            style={{
              padding: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              display: 'flex'
            }}
          >
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="chat-input"
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '3px',
                color: 'white',
                outline: 'none'
              }}
              placeholder="Type a message..."
              onKeyDown={(e) => {
                // Explicitly prevent propagation for space key to ensure it works in the input
                if (e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            />
            <button 
              type="submit"
              style={{
                marginLeft: '8px',
                padding: '0 12px',
                backgroundColor: '#4caf50',
                border: 'none',
                borderRadius: '3px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default ChatPanel; 