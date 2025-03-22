module.exports = {
  apps: [
    {
      name: 'miniscape-prod-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'https://miniscape.io/api'
      },
      watch: false,
      instances: 1,
    },
    {
      name: 'miniscape-prod-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        FRONTEND_URL: 'https://miniscape.io'
      },
      watch: false,
      instances: 1,
    }
  ]
}; 