# MiniScape

MiniScape is a simple multiplayer browser game inspired by RuneScape, built with Next.js, TypeScript, Three.js, and Socket.IO. It allows players to join a shared world, move around, chat with other players, gather resources, and manage their inventory.

## Features

- **Real-time multiplayer interaction**
  - See other players move in real-time
  - Chat with other players
  - Player name labels
  - Join/leave notifications

- **3D World**
  - First-person camera control
  - Different zones (Lumbridge, Barbarian Village, Fishing Spot, Grand Exchange, Wilderness)
  - Resource nodes (trees, rocks, fishing spots)

- **Gameplay Mechanics**
  - Resource gathering (woodcutting, mining, fishing)
  - Inventory management
  - Item dropping and picking
  - Zone-based gameplay

- **User Interface**
  - Chat panel
  - Inventory panel
  - Zone indicator
  - Sound effects

- **Authentication & Persistence**
  - Google SSO (Single Sign-On) authentication
  - Database-backed player data and game state
  - Persistent inventory and player positions

## Technologies Used

- **Frontend**
  - Next.js
  - TypeScript
  - Three.js (3D rendering)
  - CSS modules

- **Backend**
  - Next.js API routes
  - Socket.IO (real-time communication)
  - Supabase (PostgreSQL database and authentication)

## Environment Setup

1. Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=4000
   NODE_ENV=development

   # Frontend URL
   FRONTEND_URL=http://localhost:3000

   # Supabase Configuration
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

   # JWT Configuration
   JWT_SECRET=your-jwt-secret-key
   JWT_EXPIRY=7d

   # App Version
   APP_VERSION=1.0.0
   ```

2. Replace the Supabase configuration values with your actual Supabase project details.

3. For production, make sure to use a strong, secure JWT secret and consider environment-specific configuration.

## Project Structure

The project is now organized with separate frontend and backend:

```
/
├── frontend/       # Next.js frontend code
├── backend/        # Express.js backend server
│   ├── src/
│   │   ├── controllers/   # Business logic
│   │   ├── models/        # Database models
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Custom middleware
│   │   ├── config/        # Configuration files
│   │   ├── utils/         # Utility functions
│   │   └── index.js       # Server entry point
│   └── logs/             # Server logs
├── components/    # Shared React components
├── pages/         # Next.js pages
├── lib/           # Shared library code
├── styles/        # CSS styles
└── public/        # Static assets
```

## Getting Started

1. Install dependencies:
   ```bash
   # Install root dependencies
   npm install
   
   # Install backend dependencies
   cd backend
   npm install
   
   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

2. Start the development servers:
   ```bash
   # Start backend (from the backend directory)
   npm run dev
   
   # Start frontend (from the frontend directory)
   npm run dev
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

## Logging

The backend uses a custom logger that writes to both the console and log files:

- Log files are stored in `backend/logs/` directory
- Log files are named with the format `server_YYYY-MM-DD.log`
- Four log levels are available: DEBUG, INFO, WARN, and ERROR
- In development mode, all log levels are recorded
- In production mode, DEBUG logs are omitted

To use the logger in your code:

```javascript
const logger = require('./utils/logger');

logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message', error, { additionalData: 'value' });
logger.debug('This is a debug message'); // Only logged in development
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/MiniScape.git
cd MiniScape
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Create a `.env.local` file in the root directory based on `.env.local.example`
   - Set up a Supabase project and add your credentials to the file
   - Set up Google OAuth credentials and add them to the file

4. Apply database migrations:
```bash
npm run migrate
```

5. Run the development server:
```bash
npm run dev
```

6. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

1. **Getting Started**
   - Sign in with your Google account
   - Move around using WASD or arrow keys

2. **Resource Gathering**
   - Click on trees to chop wood (in Lumbridge)
   - Click on rocks to mine ore (in Barbarian Village)
   - Click on fishing spots to catch fish (in Fishing Spot)

3. **Inventory Management**
   - View your inventory in the top-right panel
   - Drop items by clicking the "Drop" button next to them
   - Pick up items by clicking on them in the world

4. **Chat System**
   - Use the chat panel in the bottom-left to communicate
   - Type your message and press Enter or click "Send"
   - Minimize the chat panel by clicking on the header

5. **Exploration**
   - Different areas of the world have different resources
   - Your current zone is displayed at the top of the screen

## Controls

- **Movement**: WASD or Arrow keys
- **Camera**: Follows the player
- **Interaction**: Click on resources or items to interact
- **Chat**: Type in chat box and press Enter
- **Sound**: Toggle sound on/off with the sound button

## Database Schema

The game uses a PostgreSQL database (via Supabase) with the following tables:

- **profiles**: User profile information
- **player_data**: Game state for each player (position, inventory)
- **world_items**: Persistent items dropped in the world
- **resource_nodes**: Resource nodes in the game world

## Setting up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Create the required tables using the migration scripts in the `migrations` folder
3. Configure Google OAuth in the Supabase Authentication settings
4. Add your Supabase URL and keys to the `.env.local` file

## Credits

This project was created as a learning exercise in building a multiplayer game with modern web technologies.

## License

[MIT License](LICENSE)