import fs from 'fs';
import path from 'path';

// Define log level enum
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

// Define types for meta objects
interface LogMeta {
  [key: string]: any;
}

interface ErrorLogMeta extends LogMeta {
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
}

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Get current date for the log file name
const getLogFileName = (): string => {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return `server_${date}.log`;
};

// Format log message
const formatLogMessage = (level: LogLevel, message: string, meta: LogMeta = {}): string => {
  const timestamp = new Date().toISOString();
  const metaString = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}\n`;
};

// Write to log file
const writeToLogFile = (message: string): void => {
  const logFile = path.join(logsDir, getLogFileName());
  fs.appendFileSync(logFile, message);
};

// Logger functions
const logger = {
  debug: (message: string, meta: LogMeta = {}): void => {
    if (process.env.NODE_ENV === 'development') {
      const formattedMessage = formatLogMessage(LogLevel.DEBUG, message, meta);
      console.debug(formattedMessage.trim());
      writeToLogFile(formattedMessage);
    }
  },
  
  info: (message: string, meta: LogMeta = {}): void => {
    const formattedMessage = formatLogMessage(LogLevel.INFO, message, meta);
    console.info(formattedMessage.trim());
    writeToLogFile(formattedMessage);
  },
  
  warn: (message: string, meta: LogMeta = {}): void => {
    const formattedMessage = formatLogMessage(LogLevel.WARN, message, meta);
    console.warn(formattedMessage.trim());
    writeToLogFile(formattedMessage);
  },
  
  error: (message: string, error: Error | null = null, meta: LogMeta = {}): void => {
    const errorMeta: ErrorLogMeta = {
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

export default logger; 