import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware with CSP configuration for video embeds
const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
    // More permissive CSP for development
    app.use(helmet({
        contentSecurityPolicy: false, // Disable CSP in development
        frameguard: false // Disable X-Frame-Options in development for PDF viewer
    }));
} else {
    // Strict CSP for production with PDF viewer support
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://player.vimeo.com", "https://vimeo.com", "https://widget.blueyeai.co.il"],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: ["'self'", "https://player.vimeo.com", "https://vimeo.com", "https://widget.blueyeai.co.il", "https://*.blueyeai.co.il"],
                frameSrc: ["'self'", "https://player.vimeo.com", "https://vimeo.com", "https://*.vimeo.com"],
                childSrc: ["'self'", "https://player.vimeo.com", "https://vimeo.com", "https://*.vimeo.com"],
                mediaSrc: ["'self'", "https:", "blob:"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
        // Allow iframe embedding from same origin for PDF viewer in production
        frameguard: { action: 'sameorigin' }
    }));
}

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use(limiter);

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL || false // In production, be more restrictive
        : process.env.FRONTEND_URL || 'http://localhost:5173', // In development, allow localhost
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'XFactor Daily API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import lessonRoutes from './routes/lessons.js';
import chatRoutes from './routes/chat.js';
import supportRoutes from './routes/support.js';
import analyticsRoutes from './routes/analytics.js';

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve static files from the React app build
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Handle React routing - send all non-API requests to React app
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            error: 'API route not found',
            message: `The requested API route ${req.originalUrl} does not exist.`
        });
    }
    
    // Serve React app for all other routes
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    
    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(error.status || 500).json({
        error: error.message || 'Internal server error',
        ...(isDevelopment && { stack: error.stack })
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 XFactor Daily API server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;