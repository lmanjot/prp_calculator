import json

def handler(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200, headers
    
    return json.dumps({
        'status': 'healthy', 
        'service': 'PRP Calculator API',
        'version': '1.0.0'
    }), 200, headers