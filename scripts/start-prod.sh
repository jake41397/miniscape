#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape Production Environment"
echo "=========================================="

# Check if .env.production exists, create it if not
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

# Load environment variables
set -a
source .env.production
set +a

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
fi

# Check if nginx is installed and configured
if ! command -v nginx &> /dev/null; then
    echo "NGINX is not installed. Please install NGINX for the production setup."
    echo "On Ubuntu/Debian: sudo apt-get install nginx"
    echo "On CentOS/RHEL: sudo yum install nginx"
    exit 1
fi

# Verify NGINX configuration exists for miniscape.io
if [ ! -f "/etc/nginx/sites-available/miniscape.io" ]; then
    echo "WARNING: NGINX configuration for miniscape.io not found."
    echo "The existing NGINX configuration should have:"
    echo "- Frontend: Serving static files from /var/www/miniscape/frontend/out"
    echo "- Backend API on port 5000"
    echo "- Proper SSL certificate configuration"
else
    echo "NGINX configuration for miniscape.io found."
    echo "Verifying NGINX configuration..."
    sudo nginx -t
fi

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "frontend/node_modules" ] || [ ! -d "backend/node_modules" ]; then
    echo "Installing dependencies..."
    npm run install:all
fi

# Build the backend for production
echo "Building the backend for production..."
cd backend
npm run build
cd ..

# Build and export the frontend for production
echo "Building and exporting the frontend for production..."
cd frontend
npm run export
cd ..

# Stop any existing production processes
echo "Stopping any existing production servers..."
pm2 stop miniscape-prod-frontend miniscape-prod-backend 2>/dev/null || true
pm2 delete miniscape-prod-frontend miniscape-prod-backend 2>/dev/null || true

# Start production backend using direct npm command
echo "Starting production backend..."
cd backend
PORT=5000 pm2 start npm --name miniscape-prod-backend --env production -- run start

cd ..

echo "Production frontend is now served as static files by NGINX from: /var/www/miniscape/frontend/out"

# Configure PM2 to start on system boot
echo "Configuring PM2 to start on system boot..."
pm2 save --force
PM2_STARTUP_COMMAND=$(pm2 startup | grep "sudo" | tail -n 1)
if [ ! -z "$PM2_STARTUP_COMMAND" ]; then
    echo "Run the following command with sudo privileges to enable PM2 startup:"
    echo "$PM2_STARTUP_COMMAND"
else
    echo "PM2 startup command not found or already configured."
fi

# Reload NGINX to make sure it picks up any changes
echo "Reloading NGINX configuration..."
sudo systemctl reload nginx

echo "=========================================="
echo "Production environment is now running!"
echo "Frontend: https://miniscape.io (static files)"
echo "Backend API: https://miniscape.io/api (port 5000)"
echo "Use 'pm2 logs' to view server logs"
echo "Use './stop-prod.sh' to stop servers"
echo "=========================================="

# Display logs
pm2 logs miniscape-prod-backend 