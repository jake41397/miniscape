import React, { useState, useEffect } from 'react';

interface TutorialStep {
  title: string;
  content: string;
  image?: string;
  position?: 'top' | 'right' | 'bottom' | 'left' | 'center';
}

interface TutorialOverlayProps {
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ 
  isActive, 
  onComplete,
  onSkip
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  
  // Define tutorial steps
  const tutorialSteps: TutorialStep[] = [
    {
      title: "Welcome to MiniScape!",
      content: "MiniScape is a 3D multiplayer RPG where you can gather resources, improve your skills, and interact with other players. Let's get started!",
      position: 'center'
    },
    {
      title: "Moving Around",
      content: "Use WASD or arrow keys to move around the world. Hold Right Mouse Button and move your mouse to rotate the camera.",
      position: 'bottom'
    },
    {
      title: "Resource Gathering",
      content: "Right-click on trees, rocks, or fishing spots to gather resources. You'll need the right tools for some activities.",
      position: 'right'
    },
    {
      title: "Skills & Inventory",
      content: "Check your skills and inventory tabs at the bottom of the screen. Your gathered resources will appear in your inventory.",
      position: 'top'
    },
    {
      title: "NPCs & Players",
      content: "Right-click on NPCs to talk to them, or on other players to interact with them. They might have helpful information or trading opportunities.",
      position: 'left'
    },
    {
      title: "Zones & Safety",
      content: "Different zones offer different resources and challenges. Be careful in the Wilderness - other players can attack you there!",
      position: 'bottom'
    },
    {
      title: "Ready to Play!",
      content: "That's it for the basics! Talk to the Tutorial Guide in Lumbridge for more help, or just start exploring.",
      position: 'center'
    }
  ];
  
  useEffect(() => {
    if (isActive) {
      // Show the tutorial with a slight delay for animation
      setTimeout(() => {
        setIsVisible(true);
      }, 300);
    } else {
      setIsVisible(false);
    }
  }, [isActive]);
  
  const goToNextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Tutorial complete
      handleComplete();
    }
  };
  
  const goToPreviousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleComplete = () => {
    setIsVisible(false);
    // Give time for fade-out animation
    setTimeout(() => {
      onComplete();
      setCurrentStep(0);
    }, 300);
  };
  
  const handleSkip = () => {
    setIsVisible(false);
    // Give time for fade-out animation
    setTimeout(() => {
      onSkip();
      setCurrentStep(0);
    }, 300);
  };
  
  if (!isActive) {
    return null;
  }
  
  const currentTutorialStep = tutorialSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === tutorialSteps.length - 1;
  
  // Determine position class
  const positionClass = `tutorial-step-${currentTutorialStep.position || 'center'}`;
  
  return (
    <div className={`tutorial-overlay ${isVisible ? 'visible' : ''}`}>
      <div className={`tutorial-backdrop`} onClick={handleSkip} />
      
      <div className={`tutorial-step ${positionClass}`}>
        <div className="tutorial-header">
          <h2>{currentTutorialStep.title}</h2>
          <button 
            className="tutorial-close-button"
            onClick={handleSkip}
            aria-label="Skip tutorial"
          >
            ×
          </button>
        </div>
        
        <div className="tutorial-content">
          <p>{currentTutorialStep.content}</p>
          
          {currentTutorialStep.image && (
            <img 
              src={currentTutorialStep.image} 
              alt={currentTutorialStep.title}
              className="tutorial-image"
            />
          )}
        </div>
        
        <div className="tutorial-navigation">
          <div className="tutorial-progress">
            {tutorialSteps.map((_, index) => (
              <div 
                key={index} 
                className={`tutorial-progress-dot ${index === currentStep ? 'active' : ''}`}
                onClick={() => setCurrentStep(index)}
              />
            ))}
          </div>
          
          <div className="tutorial-buttons">
            {!isFirstStep && (
              <button 
                className="tutorial-button previous"
                onClick={goToPreviousStep}
              >
                Previous
              </button>
            )}
            
            <button 
              className="tutorial-button next"
              onClick={goToNextStep}
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .tutorial-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 2000;
          display: flex;
          justify-content: center;
          align-items: center;
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        
        .tutorial-overlay.visible {
          opacity: 1;
          pointer-events: auto;
        }
        
        .tutorial-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(3px);
        }
        
        .tutorial-step {
          position: relative;
          background-color: rgba(30, 30, 30, 0.95);
          border: 2px solid #FFD700;
          border-radius: 8px;
          padding: 20px;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          z-index: 2001;
          color: white;
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        
        .tutorial-step-center {
          margin: 0 auto;
        }
        
        .tutorial-step-top {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
        }
        
        .tutorial-step-right {
          position: absolute;
          right: 80px;
          top: 50%;
          transform: translateY(-50%);
        }
        
        .tutorial-step-bottom {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
        }
        
        .tutorial-step-left {
          position: absolute;
          left: 80px;
          top: 50%;
          transform: translateY(-50%);
        }
        
        .tutorial-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          border-bottom: 1px solid #FFD700;
          padding-bottom: 10px;
        }
        
        .tutorial-header h2 {
          margin: 0;
          color: #FFD700;
          font-size: 1.5rem;
        }
        
        .tutorial-close-button {
          background: none;
          border: none;
          color: #FFD700;
          font-size: 1.8rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        
        .tutorial-content {
          margin-bottom: 20px;
          line-height: 1.6;
        }
        
        .tutorial-image {
          width: 100%;
          border-radius: 4px;
          margin-top: 10px;
        }
        
        .tutorial-navigation {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        
        .tutorial-progress {
          display: flex;
          justify-content: center;
          gap: 8px;
        }
        
        .tutorial-progress-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #555;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .tutorial-progress-dot.active {
          background-color: #FFD700;
        }
        
        .tutorial-buttons {
          display: flex;
          justify-content: space-between;
        }
        
        .tutorial-button {
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
          transition: background-color 0.2s;
          border: none;
        }
        
        .tutorial-button.previous {
          background-color: #555;
          color: white;
        }
        
        .tutorial-button.next {
          background-color: #FFD700;
          color: #333;
        }
        
        .tutorial-button.previous:hover {
          background-color: #666;
        }
        
        .tutorial-button.next:hover {
          background-color: #FFC107;
        }
      `}</style>
    </div>
  );
};

export default TutorialOverlay; 