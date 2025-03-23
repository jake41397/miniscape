import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../game/network/socket';
import soundManager from '../../game/audio/soundManager';

interface ChatMessage {
  name: string;
  text: string;
}

const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    let socketInstance: any = null;
    
    // Connect to socket
    async function setupSocket() {
      const socket = await getSocket();
      if (!socket) return;
      
      socketInstance = socket;
      
      // Listen for chat messages
      socket.on('chatMessage', (message: ChatMessage) => {
        setMessages(prevMessages => [...prevMessages, message]);
        
        // Play sound for new message
        soundManager.play('chatMessage');
      });
    }
    
    setupSocket();
    
    // Clean up on unmount
    return () => {
      if (socketInstance) {
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
            {messages.map((msg, index) => (
              <div key={index} style={{ color: 'white', fontSize: '14px' }}>
                <span style={{ color: '#4caf50', fontWeight: 'bold' }}>{msg.name}: </span>
                <span>{msg.text}</span>
              </div>
            ))}
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