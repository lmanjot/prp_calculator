#!/usr/bin/env python3
"""
PRP Dosage Calculator API - Health Check Endpoint
Vercel serverless function for health monitoring
"""

import json


def handler(event, context):
    """
    Vercel serverless function handler for the health check endpoint
    """
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    # Handle CORS preflight
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'status': 'ok'})
        }
    
    # Return health status
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({
            'status': 'healthy', 
            'service': 'PRP Calculator API',
            'version': '1.0.0'
        })
    }