const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Get current date for the log file name
const getLogFileName = () => {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return `server_${date}.log`;
};

// Log levels
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

// Format log message
const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}\n`;
};

// Write to log file
const writeToLogFile = (message) => {
  const logFile = path.join(logsDir, getLogFileName());
  fs.appendFileSync(logFile, message);
};

// Logger functions
const logger = {
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV === 'development') {
      const formattedMessage = formatLogMessage(LogLevel.DEBUG, message, meta);
      console.debug(formattedMessage.trim());
      writeToLogFile(formattedMessage);
    }
  },
  
  info: (message, meta = {}) => {
    const formattedMessage = formatLogMessage(LogLevel.INFO, message, meta);
    console.info(formattedMessage.trim());
    writeToLogFile(formattedMessage);
  },
  
  warn: (message, meta = {}) => {
    const formattedMessage = formatLogMessage(LogLevel.WARN, message, meta);
    console.warn(formattedMessage.trim());
    writeToLogFile(formattedMessage);
  },
  
  error: (message, error, meta = {}) => {
    const errorMeta = {
      ...meta,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      })
    };
    
    const formattedMessage = formatLogMessage(LogLevel.ERROR, message, errorMeta);
    console.error(formattedMessage.trim());
    writeToLogFile(formattedMessage);
  }
};

module.exports = logger; 