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

## Development Environment

### Using dev.miniscape.io

We've set up a streamlined development environment that allows you to run both frontend and backend servers with a single command, accessible at `dev.miniscape.io`.

#### Setup

1. Run the setup script:
   ```bash
   chmod +x start-dev.sh
   ./start-dev.sh
   ```

2. Access the development environment at:
   ```
   https://dev.miniscape.io
   ```

### Production Environment

To deploy to production, we've created a dedicated script that will set up everything for the production environment.

#### Setup

1. Run the production setup script:
   ```bash
   chmod +x start-prod.sh
   ./start-prod.sh
   ```

2. Access the production environment at:
   ```
   https://miniscape.io
   ```

### Managing Environments

We have several scripts to help manage the development and production environments:

#### Starting Environments

- Start development environment: `./start-dev.sh`
- Start production environment: `./start-prod.sh`
- Start both environments: `./start-both.sh`

#### Stopping Environments

- Stop development environment: `./stop-dev.sh`
- Stop production environment: `./stop-prod.sh` 
- Stop all environments: `./stop-all.sh`

#### Deploying Latest Changes

For deploying the latest changes to production:

```bash
./deploy-prod-latest.sh
```

This script will:
1. Pull the latest changes from the current git branch
2. Install any new dependencies
3. Build and export the frontend for production (static files)
4. Build the backend for production
5. Restart the production environment

### Reloading and Restarting Environments

We have dedicated scripts for reloading and fully restarting both environments:

#### Full Restart

For a complete restart of all services:

```bash
./restart-env.sh
```

This script will:
- Stop all PM2 processes
- Restart NGINX
- Start all services again

## Running on System Startup

Both environments can be configured to run simultaneously and automatically start when the system boots up.

### Setting Up PM2 Startup

The startup scripts can be used to run either individual environments or both at once:

#### Running Both Environments Simultaneously

For running both dev and prod environments on the same server:

```bash
chmod +x start-both.sh
./start-both.sh
```

This will:
- Start both development and production environments
- Configure PM2 to save both process lists for startup
- Give you the startup command to run with sudo privileges

#### Running Individual Environments

If you prefer to run only one environment:

```bash
# For development only
./start-dev.sh

# For production only
./start-prod.sh
```

Each script will output a PM2 startup command like:
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u username --hp /home/username
```

Run this command to enable PM2 startup, and your applications will automatically restart when the system reboots.

### Accessing Both Environments

When both environments are running simultaneously, they are accessed via their respective domains:

- **Development Environment**:
  - Frontend: https://dev.miniscape.io/
  - Backend API: https://dev.miniscape.io/api
  - Socket.IO: https://dev.miniscape.io/socket.io

- **Production Environment**:
  - Frontend: https://miniscape.io/
  - Backend API: https://miniscape.io/api
  - Socket.IO: https://miniscape.io/socket.io

The NGINX configurations ensure that requests to each domain are routed to the correct application servers running on their designated ports.

### Reloading and Restarting Environments

We have dedicated scripts for reloading and fully restarting both environments:

#### Reloading (Zero Downtime)

For making configuration changes without downtime:

```bash
./reload-env.sh
```

This will:
- Reload NGINX configuration
- Reload all PM2 processes with zero downtime

#### Full Restart

For a complete restart of all services:

```bash
./restart-env.sh
```

This will:
- Restart NGINX
- Stop and delete all PM2 processes
- Start both development and production environments
- Save the PM2 process list for startup

#### Troubleshooting PM2 Process Issues

If you encounter issues with PM2 processes (wrong names, stopped processes, or config files running as processes), use the fix script:

```bash
./fix-pm2.sh
```

This will:
- Stop and delete all PM2 processes
- Start the development and production processes with their correct names
- Save the correct process list for startup

These scripts make it easy to maintain both environments on the same server and handle updates or configuration changes.