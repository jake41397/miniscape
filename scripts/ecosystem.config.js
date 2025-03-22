// Development environment configuration
module.exports = {
  apps: [
    {
      name: 'miniscape-dev-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        NEXT_PUBLIC_API_URL: 'http://dev.miniscape.io/api'
      },
      watch: ['src'],
      ignore_watch: ['node_modules', '.next']
    },
    {
      name: 'miniscape-dev-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 4001,
        FRONTEND_URL: 'http://dev.miniscape.io'
      },
      watch: ['src'],
      ignore_watch: ['node_modules', 'dist']
    }
  ]
}; 