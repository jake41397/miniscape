#!/bin/bash

# Script to restart NGINX and both environments

# Display banner
echo "=========================================="
echo "   MiniScape - Restarting Environments"
echo "=========================================="

# Function to check if a command executed successfully
check_success() {
    if [ $? -eq 0 ]; then
        echo "✅ Success: $1"
    else
        echo "❌ Failed: $1"
        exit 1
    fi
}

# Restart NGINX
echo "Restarting NGINX..."
sudo systemctl restart nginx
check_success "NGINX restart"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
    check_success "PM2 installation"
fi

# Stop all current PM2 processes
echo "Stopping all PM2 processes..."
pm2 stop all
check_success "Stopping PM2 processes"

# Delete all processes to avoid confusion
echo "Deleting all PM2 processes..."
pm2 delete all
check_success "Deleting PM2 processes"

# Start each application individually
echo "Starting development frontend..."
cd frontend
pm2 start npm --name miniscape-dev-frontend -- run dev -- --port 3001
check_success "Development frontend startup"

echo "Starting development backend..."
cd ../backend
pm2 start npm --name miniscape-dev-backend -- run dev -- --port 4001
check_success "Development backend startup"

# Build backend for production
echo "Building backend for production..."
cd ../backend
npm run build
check_success "Backend build"

# Build and export frontend for production
echo "Building and exporting frontend for production..."
cd ../frontend
npm run export
check_success "Frontend export"

echo "Starting production backend..."
cd ../backend
pm2 start npm --name miniscape-prod-backend -- run start -- --port 5000
check_success "Production backend startup"

cd ..

# Save PM2 process list for startup
echo "Saving PM2 process list for startup..."
pm2 save --force
check_success "PM2 process list save"

echo "=========================================="
echo "Both environments have been restarted!"
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