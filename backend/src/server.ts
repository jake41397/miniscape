// Load world items from database on startup
import { getWorldItems } from './db/worldItemsDB';

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