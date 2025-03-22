#!/bin/bash

# Display banner
echo "=========================================="
echo "   MiniScape Development Environment"
echo "=========================================="

# Check if .env.development exists, create it if not
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

# Load environment variables
set -a
source .env.development
set +a

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 is not installed. Installing globally..."
    npm install -g pm2
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "NGINX is not installed. Please install NGINX to use the dev.miniscape.io domain."
    echo "On Ubuntu/Debian: sudo apt-get install nginx"
    echo "On CentOS/RHEL: sudo yum install nginx"
    echo "On macOS: brew install nginx"
fi

# Setup hosts entry if needed (requires sudo)
if ! grep -q "dev.miniscape.io" /etc/hosts; then
    echo "Adding dev.miniscape.io to /etc/hosts (requires sudo)..."
    echo "127.0.0.1 dev.miniscape.io" | sudo tee -a /etc/hosts
fi

# Create symbolic link to nginx config if nginx is installed
if command -v nginx &> /dev/null; then
    if [ -d "/etc/nginx/sites-available" ]; then
        echo "Setting up NGINX configuration (requires sudo)..."
        sudo ln -sf "$(pwd)/nginx/dev.miniscape.io.conf" /etc/nginx/sites-available/dev.miniscape.io.conf
        sudo ln -sf /etc/nginx/sites-available/dev.miniscape.io.conf /etc/nginx/sites-enabled/dev.miniscape.io.conf
        
        # Set up SSL certificates for dev.miniscape.io using certbot if needed
        if [ ! -d "/etc/letsencrypt/live/dev.miniscape.io" ]; then
            echo "SSL certificates for dev.miniscape.io not found."
            echo "Would you like to set up certificates using Let's Encrypt? (y/n)"
            read -r answer
            if [[ "$answer" =~ ^[Yy]$ ]]; then
                sudo certbot --nginx -d dev.miniscape.io
            else
                echo "Skipping Let's Encrypt setup. Please update SSL certificate paths manually."
            fi
        else
            echo "SSL certificates for dev.miniscape.io found. Verifying NGINX configuration..."
            sudo nginx -t && sudo systemctl reload nginx
        fi
    else
        echo "NGINX sites-available directory not found. Please manually configure NGINX."
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "frontend/node_modules" ] || [ ! -d "backend/node_modules" ]; then
    echo "Installing dependencies..."
    npm run install:all
fi

# Stop any existing development processes
echo "Stopping any existing development servers..."
pm2 stop miniscape-dev-frontend miniscape-dev-backend 2>/dev/null || true
pm2 delete miniscape-dev-frontend miniscape-dev-backend 2>/dev/null || true

# Start development servers using direct npm commands
echo "Starting development frontend..."
cd frontend
pm2 start npm --name miniscape-dev-frontend -- run dev -- --port 3001

echo "Starting development backend..."
cd ../backend
pm2 start npm --name miniscape-dev-backend -- run dev -- --port 4001

cd ..

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

echo "=========================================="
echo "Development environment is now running!"
echo "Frontend: https://dev.miniscape.io (port 3001)"
echo "Backend API: https://dev.miniscape.io/api (port 4001)"
echo "Use 'pm2 logs' to view server logs"
echo "Use 'pm2 stop all' to stop servers"
echo "=========================================="

# Display logs
pm2 logs miniscape-dev-frontend miniscape-dev-backend 