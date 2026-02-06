// Vercel Serverless Proxy for Aniwatch API
// This bypasses CORS by making API calls from the same domain

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Get the path from query
    const { path } = req.query;

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    // Build the Aniwatch API URL - decode the path first
    const API_BASE = 'https://aniwatch-api-chi.vercel.app/api/v2/hianime';
    // The path is already URL encoded, so we need to decode it first
    const decodedPath = decodeURIComponent(path);
    const apiUrl = `${API_BASE}/${decodedPath}`;

    try {
        console.log('Proxying to:', apiUrl);

        // Use AbortController for timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(apiUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        const data = await response.json();

        // Return the API response
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy error:', error);

        if (error.name === 'AbortError') {
            return res.status(504).json({
                success: false,
                error: 'Request timeout',
                message: 'The API request took too long'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Failed to fetch from API',
            message: error.message
        });
    }
}
