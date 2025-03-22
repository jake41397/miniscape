#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape - Production Deployment"
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

# Check if in git repository
if [ ! -d .git ]; then
    echo "❌ Not in a git repository. Make sure you're in the project root."
    exit 1
fi

# Ask for confirmation before proceeding
echo "This script will:"
echo "1. Pull the latest changes from the current branch"
echo "2. Install any new dependencies"
echo "3. Build and export the frontend for production (static files)"
echo "4. Build the backend for production"
echo "5. Restart the production environment"
echo ""
read -p "Continue with deployment? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment canceled."
    exit 0
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull
check_success "Git pull"

# Install dependencies
echo "Installing dependencies..."
npm install
check_success "Root dependencies installation"

cd frontend
echo "Installing frontend dependencies..."
npm install
check_success "Frontend dependencies installation"

cd ../backend
echo "Installing backend dependencies..."
npm install
check_success "Backend dependencies installation"

# Build backend
echo "Building backend for production..."
npm run build
check_success "Backend build"

# Stop production backend to free resources during the frontend build
echo "Stopping production backend temporarily..."
cd ..
pm2 stop miniscape-prod-backend 2>/dev/null || true

# Build and export frontend
echo "Building and exporting frontend for production..."
cd frontend
npm run export
check_success "Frontend build and export"

# Restart production environment
echo "Restarting production environment..."
cd ..
echo "Starting production backend..."
cd backend
PORT=5000 pm2 start npm --name miniscape-prod-backend --env production -- run start
check_success "Production backend startup"
cd ..

# Save PM2 process list
echo "Saving PM2 process list..."
pm2 save --force
check_success "PM2 process list save"

# Reload NGINX to ensure it picks up any changes
echo "Reloading NGINX..."
sudo systemctl reload nginx
check_success "NGINX reload"

echo "=========================================="
echo "Production deployment complete!"
echo "Frontend: https://miniscape.io (static files)"
echo "Backend API: https://miniscape.io/api (port 5000)"
echo "Use 'pm2 logs miniscape-prod-backend' to view server logs"
echo "=========================================="

# Display PM2 status
pm2 status 