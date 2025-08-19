// Health check endpoint for PRP Calculator API

export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).json({ status: 'ok' });
        return;
    }
    
    // Return health status
    res.status(200).json({
        status: 'healthy',
        service: 'PRP Calculator API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
}