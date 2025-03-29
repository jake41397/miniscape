import React, { useState, ReactNode } from 'react';

interface TabProps {
  icon: ReactNode;
  label: string;
  content: ReactNode;
  badge?: string | number; // Optional badge/count to display on the tab
}

interface TabMenuProps {
  tabs: TabProps[];
}

const TabMenu: React.FC<TabMenuProps> = ({ tabs }) => {
  const [activeTabIndex, setActiveTabIndex] = useState<number | null>(null);

  const toggleTab = (index: number) => {
    if (activeTabIndex === index) {
      setActiveTabIndex(null);
    } else {
      setActiveTabIndex(index);
    }
  };

  return (
    <div className="tab-menu">
      <div className="tab-buttons">
        {tabs.map((tab, index) => (
          <button
            key={`tab-${index}`}
            className={`tab-button ${activeTabIndex === index ? 'active' : ''}`}
            onClick={() => toggleTab(index)}
            title={tab.label}
          >
            {tab.icon}
            {tab.badge && (
              <span className="tab-badge">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>
      
      {activeTabIndex !== null && (
        <div className="tab-content">
          {tabs[activeTabIndex].content}
        </div>
      )}
      
      <style jsx>{`
        .tab-menu {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 100;
          font-family: sans-serif;
        }
        
        .tab-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        .tab-button {
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          min-width: 36px;
          min-height: 36px;
          position: relative; /* Add position relative for badge positioning */
        }
        
        .tab-button:hover {
          background-color: rgba(30, 30, 30, 0.9);
        }
        
        .tab-button.active {
          background-color: rgba(60, 100, 170, 0.8);
        }
        
        .tab-content {
          margin-top: 10px;
          background-color: rgba(0, 0, 0, 0.7);
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          min-width: 250px;
          overflow: hidden;
        }
        
        .tab-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          background-color: rgba(232, 99, 99, 0.9);
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: bold;
          min-width: 8px;
          text-align: center;
          box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
};

export default TabMenu; 