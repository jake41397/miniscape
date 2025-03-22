#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape - Cleaning PM2 Processes"
echo "=========================================="

# Function to check if a command executed successfully
check_success() {
    if [ $? -eq 0 ]; then
        echo "✅ Success: $1"
    else
        echo "❌ Failed: $1"
        # Only exit for critical failures
        if [ "$2" = "critical" ]; then
            exit 1
        fi
    fi
}

# First, find and kill all Node.js processes for the user
echo "Killing all Node.js processes for pm2-user..."
pkill -9 -u $(whoami) node || true
echo "✅ Node.js processes checked"

# Make sure PM2 is clean
echo "Cleaning up PM2 daemon..."
pm2 kill
check_success "PM2 daemon cleanup" "critical"

# Delete PM2 logs and dump files
echo "Cleaning PM2 files..."
rm -rf ~/.pm2/logs/* 2>/dev/null
rm -f ~/.pm2/dump.pm2 2>/dev/null
check_success "PM2 files cleanup" "critical"

# Build production frontend before starting it
echo "Building production frontend..."
cd frontend
npm run build
check_success "Production frontend build" "critical"

# Start each application individually with explicit port settings
echo "Starting development frontend..."
PORT=3001 pm2 start npm --name miniscape-dev-frontend -- run dev
check_success "Development frontend startup" "critical"

echo "Starting development backend..."
cd ../backend
PORT=4001 pm2 start npm --name miniscape-dev-backend -- run dev
check_success "Development backend startup" "critical"

echo "Starting production frontend..."
cd ../frontend
PORT=3000 pm2 start npm --name miniscape-prod-frontend -- run start
check_success "Production frontend startup" "critical"

echo "Starting production backend..."
cd ../backend
PORT=5000 pm2 start npm --name miniscape-prod-backend -- run start
check_success "Production backend startup" "critical"

cd ..

# Save the correct process list
echo "Saving PM2 process list..."
pm2 save --force
check_success "PM2 process list save" "critical"

# Set up startup
echo "Setting up PM2 startup..."
pm2 startup
check_success "PM2 startup setup"

echo "=========================================="
echo "PM2 processes have been cleaned and restarted!"
echo ""
echo "DEVELOPMENT:"
echo "- Frontend: https://dev.miniscape.io (port 3001)"
echo "- Backend: https://dev.miniscape.io/api (port 4001)"
echo ""
echo "PRODUCTION:"
echo "- Frontend: https://miniscape.io (port 3000)"
echo "- Backend: https://miniscape.io/api (port 5000)"
echo "=========================================="

# Display corrected PM2 status
pm2 status 