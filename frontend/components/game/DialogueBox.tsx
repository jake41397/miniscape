import React, { useState, useEffect } from 'react';
import { NPC } from '../../game/world/landmarks';

interface DialogueBoxProps {
  npc: NPC | null;
  onResponse: (responseIndex: number) => void;
  onClose: () => void;
}

const DialogueBox: React.FC<DialogueBoxProps> = ({ npc, onResponse, onClose }) => {
  const [currentDialogue, setCurrentDialogue] = useState<{
    id: string;
    text: string;
    responses?: {
      text: string;
      nextDialogueId?: string;
      action?: () => void;
    }[];
  } | null>(null);
  
  // Update dialogue when NPC or currentDialogueId changes
  useEffect(() => {
    if (npc) {
      console.log(`DialogueBox: Updating dialogue for ${npc.name}, dialogueId: ${npc.currentDialogueId}`);
      const dialogue = npc.dialogues.find(d => d.id === npc.currentDialogueId);
      
      if (dialogue) {
        console.log(`Found dialogue: ${dialogue.id} with ${dialogue.responses?.length || 0} responses`);
        setCurrentDialogue(dialogue);
      } else {
        console.warn(`No dialogue found with id ${npc.currentDialogueId}`);
        setCurrentDialogue(null);
      }
    } else {
      setCurrentDialogue(null);
    }
  }, [npc, npc?.currentDialogueId]); // Add npc.currentDialogueId as a dependency
  
  // Handle click on response option
  const handleResponseClick = (index: number) => {
    console.log(`Dialogue response clicked: ${index}`);
    onResponse(index);
  };
  
  if (!npc || !currentDialogue) {
    return null;
  }
  
  return (
    <div className="dialogue-container">
      <div className="dialogue-box">
        <div className="dialogue-header">
          <h3>{npc.name}</h3>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Close dialogue"
          >
            ×
          </button>
        </div>
        
        <div className="dialogue-content">
          <p>{currentDialogue.text}</p>
        </div>
        
        {currentDialogue.responses && (
          <div className="dialogue-responses">
            {currentDialogue.responses.map((response, index) => (
              <button
                key={index}
                className="response-button"
                onClick={() => handleResponseClick(index)}
              >
                {response.text}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <style jsx>{`
        .dialogue-container {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 80%;
          max-width: 600px;
          z-index: 1000;
        }
        
        .dialogue-box {
          background-color: rgba(0, 0, 0, 0.8);
          border: 2px solid #FFD700;
          border-radius: 8px;
          color: white;
          padding: 15px;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        }
        
        .dialogue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          border-bottom: 1px solid #FFD700;
          padding-bottom: 5px;
        }
        
        .dialogue-header h3 {
          margin: 0;
          color: #FFD700;
          font-size: 1.2rem;
        }
        
        .close-button {
          background: none;
          border: none;
          color: #FFD700;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        
        .dialogue-content {
          margin-bottom: 15px;
          line-height: 1.5;
        }
        
        .dialogue-responses {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .response-button {
          background-color: #333;
          border: 1px solid #FFD700;
          border-radius: 4px;
          color: white;
          padding: 8px 12px;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .response-button:hover {
          background-color: #444;
        }
        
        .response-button:active {
          background-color: #555;
        }
      `}</style>
    </div>
  );
};

export default DialogueBox; 