import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../game/network/socket';
import soundManager from '../../game/audio/soundManager';

interface ChatMessage {
  name: string;
  text: string;
  playerId?: string;
  timestamp?: number;
  sender?: string; // For backward compatibility
}

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Keep track of messages we've already processed to prevent duplicates
  const processedMessageIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    let socketInstance: any = null;
    
    // Connect to socket
    async function setupSocket() {
      const socket = await getSocket();
      if (!socket) return;
      
      // First remove any existing chatMessage listeners to prevent duplicates
      socket.off('chatMessage');
      
      socketInstance = socket;
      
      // Listen for chat messages - this component handles displaying messages in the chat panel
      // and playing the chat sound. The GameCanvas component handles creating the chat bubbles.
      socket.on('chatMessage', (message: ChatMessage) => {
        console.log('Chat message received in panel:', message);
        
        // Create a unique ID for this message
        const messageId = `${message.playerId}-${message.timestamp}`;
        
        // Check if we've already processed this message
        if (processedMessageIds.current.has(messageId)) {
          console.log('Duplicate message detected, ignoring:', messageId);
          return;
        }
        
        // Add to processed set
        processedMessageIds.current.add(messageId);
        
        // Add message to state
        setMessages(prevMessages => [...prevMessages, message]);
        
        // Play sound for new message
        soundManager.play('chatMessage');
        
        // Clean up old message IDs if the set gets too large
        if (processedMessageIds.current.size > 100) {
          const oldestEntries = Array.from(processedMessageIds.current).slice(0, 50);
          oldestEntries.forEach(id => processedMessageIds.current.delete(id));
        }
      });
      
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
  }, []);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (inputValue.trim() === '') return;
    
    const socket = await getSocket();
    if (!socket) return;
    
    socket.emit('chat', inputValue);
    
    // Clear input
    setInputValue('');
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
        onClick={() => setMinimized(!minimized)}
      >
        <span style={{ color: 'white', fontWeight: 'bold' }}>Chat</span>
        <span style={{ color: 'white' }}>{minimized ? '▲' : '▼'}</span>
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
            {messages.map((msg, index) => {
              const isRecent = isRecentMessage(msg.timestamp);
              return (
                <div 
                  key={index} 
                  style={{ 
                    color: 'white', 
                    fontSize: '14px',
                    backgroundColor: isRecent ? 'rgba(0, 128, 0, 0.2)' : 'transparent',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    transition: 'background-color 0.5s ease'
                  }}
                >
                  <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{msg.name}: </span>
                  <span>{msg.text}</span>
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