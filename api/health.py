#!/usr/bin/env python3
"""
PRP Dosage Calculator API - Health Check Endpoint
Vercel serverless function for health monitoring
"""

from flask import jsonify


def handler(request):
    """
    Vercel serverless function handler for the health check endpoint
    """
    response = jsonify({
        'status': 'healthy', 
        'service': 'PRP Calculator API',
        'version': '1.0.0'
    })
    
    # Add CORS headers
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    
    return response