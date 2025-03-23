#!/bin/bash

# Script to start both development and production environments

# Display banner
echo "=========================================="
echo "   MiniScape - Starting Both Environments"
echo "=========================================="

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
fi

# Check for existing environment config files
if [ ! -f .env.development ] || [ ! -f .env.production ]; then
    echo "Environment files missing. Creating them..."
    
    if [ ! -f .env.development ]; then
        echo "Creating .env.development file..."
        cat > .env.development << EOL
# Development Environment Variables
NODE_ENV=development
FRONTEND_PORT=3001
BACKEND_PORT=4001
EOL
        echo ".env.development file created."
    fi
    
    if [ ! -f .env.production ]; then
        echo "Creating .env.production file..."
        cat > .env.production << EOL
# Production Environment Variables
NODE_ENV=production
FRONTEND_PORT=3000
BACKEND_PORT=5000
EOL
        echo ".env.production file created."
    fi
fi

echo "Starting BOTH development and production environments..."

# Stop any existing processes to avoid port conflicts
echo "Stopping existing PM2 processes..."
pm2 stop all
pm2 delete all

# Build backend for production
echo "Building backend for production..."
cd backend
npm run build
cd ..

# Build and export frontend for production
echo "Building and exporting frontend for production..."
cd frontend
npm run export
cd ..

# Start each application individually
echo "Starting development frontend with file watching enabled..."
cd frontend
pm2 start npm --name miniscape-dev-frontend --watch --ignore-watch="node_modules .next .git .vscode" --watch-delay=1000 -- run dev -- --port 3001

echo "Starting development backend with file watching enabled..."
cd ../backend
pm2 start npm --name miniscape-dev-backend --watch --ignore-watch="node_modules dist .git .vscode logs" --watch-delay=1000 -- run dev -- --port 4001

echo "Starting production backend..."
cd ../backend
PORT=5000 pm2 start npm --name miniscape-prod-backend --env production -- run start

cd ..

# Reload NGINX to make sure it picks up any changes
echo "Reloading NGINX configuration..."
sudo systemctl reload nginx

# Configure PM2 to start both environments on system boot
echo "Configuring PM2 to start both environments on system boot..."
pm2 save --force

PM2_STARTUP_COMMAND=$(pm2 startup | grep "sudo" | tail -n 1)
if [ ! -z "$PM2_STARTUP_COMMAND" ]; then
    echo "Run the following command with sudo privileges to enable PM2 startup:"
    echo "$PM2_STARTUP_COMMAND"
else
    echo "PM2 startup command not found or already configured."
fi

echo "=========================================="
echo "Both environments are now running!"
echo ""
echo "DEVELOPMENT:"
echo "- Frontend: https://dev.miniscape.io (port 3001)"
echo "- Backend: https://dev.miniscape.io/api (port 4001)"
echo ""
echo "PRODUCTION:"
echo "- Frontend: https://miniscape.io (static files served by NGINX)"
echo "- Backend: https://miniscape.io/api (port 5000)"
echo ""
echo "Use 'pm2 logs' to view all logs"
echo "Use 'pm2 logs miniscape-dev-frontend' to view specific app logs"
echo "=========================================="

# Display PM2 status
pm2 status 