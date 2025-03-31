// Add logging to file at the top of the file
import * as fs from 'fs';
import * as path from 'path';

// Set up logging to file
const logDir = path.join(__dirname, '../logs');
// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFilePath = path.join(logDir, 'server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Override console.log and console.error to write to file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] INFO: ${message}\n`;
  
  logStream.write(logMessage);
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ERROR: ${message}\n`;
  
  logStream.write(logMessage);
  originalConsoleError.apply(console, args);
};

// Process termination handlers
process.on('exit', () => {
  logStream.end();
});

process.on('SIGINT', () => {
  console.log('Server shutting down...');
  logStream.end();
  process.exit(0);
});

// Load world items from database on startup
import { getWorldItems } from './db/worldItemsDB';

// Import WorldItem interface
interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  droppedBy?: string;
}

// ... other code

// Initialize game world state
const worldItems: WorldItem[] = [];

// Load initial world items from database
async function loadWorldItemsFromDatabase() {
  try {
    console.log('Loading world items from database...');
    const items = await getWorldItems();
    
    if (items && Array.isArray(items)) {
      console.log(`Loaded ${items.length} items from database`);
      
      // Clear existing items
      worldItems.length = 0;
      
      // Add loaded items
      items.forEach(item => worldItems.push(item));
      
      console.log('World items loaded successfully');
    } else {
      console.log('No world items found in database or invalid data format');
    }
  } catch (error) {
    console.error('Error loading world items from database:', error);
  }
}

// Call the function on server startup
loadWorldItemsFromDatabase(); 