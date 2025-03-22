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

## Technologies Used

- **Frontend**
  - Next.js
  - TypeScript
  - Three.js (3D rendering)
  - CSS modules

- **Backend**
  - Next.js API routes
  - Socket.IO (real-time communication)

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

3. Run the development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## How to Play

1. **Getting Started**
   - Enter your name when prompted upon entering the game
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

## Project Structure

```
MiniScape/
├── components/         # React components
│   ├── GameCanvas.tsx  # Main game canvas with Three.js
│   └── ui/             # UI components
│       ├── ChatPanel.tsx
│       └── InventoryPanel.tsx
├── game/               # Game logic
│   ├── audio/          # Sound manager
│   ├── network/        # Socket connection
│   └── world/          # World objects and resources
├── pages/              # Next.js pages
│   ├── api/            # API routes
│   │   └── socket.ts   # Socket.IO server
│   └── index.tsx       # Main game page
├── public/             # Static assets
│   └── sounds/         # Sound effects
├── styles/             # CSS styles
└── types/              # TypeScript type definitions
```

## Credits

This project was created as a learning exercise in building a multiplayer game with modern web technologies.

## License

[MIT License](LICENSE)