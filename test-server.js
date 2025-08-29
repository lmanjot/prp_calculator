import { createServer } from 'http';
import { URL } from 'url';
import calculatePRPDosage from './api/calculate.js';

const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        res.status(200).json({ status: 'ok' });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/calculate') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const inputData = JSON.parse(body);
                const result = calculatePRPDosage(inputData);
                res.status(200).json(result);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});