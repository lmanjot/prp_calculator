from flask import Flask, request, jsonify
import json
import math

app = Flask(__name__)

# Configuration constants
ZONES = {
    'temporal_crown': {'name': 'Temporal/Crown', 'targetPlatelets': 1.75e9, 'minVolume': 2.0},
    'full_scalp': {'name': 'Full Scalp', 'targetPlatelets': 3.5e9, 'minVolume': 2.0}
}

OPTIMAL_MIN_PLATELETS_PER_UL = 1000000
OPTIMAL_MAX_PLATELETS_PER_UL = 1500000

def calculate_prp_dosage(input_data):
    # Extract inputs with defaults
    patient_thrombocytes_gl = float(input_data.get('thrombocytes', 0))
    prp_yield_per_tube = float(input_data.get('prp_yield', 1.0))
    prp_concentration_x = float(input_data.get('prp_concentration', 7.0))
    ppp_concentration_x = float(input_data.get('ppp_concentration', 0.5))
    
    # Validate inputs
    if patient_thrombocytes_gl <= 0:
        raise ValueError("Patient thrombocytes must be greater than 0")
    if prp_yield_per_tube <= 0:
        raise ValueError("PRP yield per tube must be greater than 0")
    if prp_concentration_x <= 0:
        raise ValueError("PRP concentration must be greater than 0")
    
    # Calculate base concentrations
    baseline_platelets_per_ul = patient_thrombocytes_gl * 1000
    final_prp_concentration_per_ul = baseline_platelets_per_ul * prp_concentration_x
    final_ppp_concentration_per_ul = baseline_platelets_per_ul * ppp_concentration_x
    platelets_per_ml_of_prp = final_prp_concentration_per_ul * 1000
    
    results = {}
    
    # Calculate for each zone
    for zone_key, zone in ZONES.items():
        target_platelets = zone['targetPlatelets']
        min_volume = zone['minVolume']
        
        required_prp_volume_ml = target_platelets / platelets_per_ml_of_prp if platelets_per_ml_of_prp > 0 else 0
        tubes_needed = math.ceil(required_prp_volume_ml / prp_yield_per_tube) if prp_yield_per_tube > 0 else 0
        total_prp_extracted_ml = tubes_needed * prp_yield_per_tube
        
        dilution_ppp_ml = 0
        if final_prp_concentration_per_ul > OPTIMAL_MAX_PLATELETS_PER_UL:
            numerator = total_prp_extracted_ml * (final_prp_concentration_per_ul - OPTIMAL_MAX_PLATELETS_PER_UL)
            denominator = OPTIMAL_MAX_PLATELETS_PER_UL - final_ppp_concentration_per_ul
            if denominator > 0:
                dilution_ppp_ml = numerator / denominator
        
        volume_after_dilution = total_prp_extracted_ml + dilution_ppp_ml
        volume_top_up_ppp_ml = max(0, min_volume - volume_after_dilution)
        
        total_ppp_needed_ml = dilution_ppp_ml + volume_top_up_ppp_ml
        total_injection_volume = total_prp_extracted_ml + total_ppp_needed_ml
        extract_volume_per_tube = total_injection_volume / tubes_needed if tubes_needed > 0 else 0
        
        results[zone_key] = {
            'zone_name': zone['name'],
            'tubes_needed': tubes_needed,
            'total_injection_volume_ml': round(total_injection_volume, 1),
            'total_prp_volume_ml': round(total_prp_extracted_ml, 1),
            'total_ppp_needed_ml': round(total_ppp_needed_ml, 1),
            'extract_volume_per_tube_ml': round(extract_volume_per_tube, 1),
            'target_platelets': target_platelets,
            'min_volume_ml': min_volume
        }
    
    # Generate concentration feedback
    concentration_millions = final_prp_concentration_per_ul / 1000000
    
    if final_prp_concentration_per_ul < OPTIMAL_MIN_PLATELETS_PER_UL:
        feedback_type = "warning"
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is below the therapeutic window."
    elif final_prp_concentration_per_ul > OPTIMAL_MAX_PLATELETS_PER_UL:
        feedback_type = "info"
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is above the optimal window."
    else:
        feedback_type = "success"
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is within the optimal therapeutic window."
    
    return {
        'input_parameters': {
            'thrombocytes_gl': patient_thrombocytes_gl,
            'prp_yield_ml': prp_yield_per_tube,
            'prp_concentration_x': prp_concentration_x,
            'ppp_concentration_x': ppp_concentration_x
        },
        'calculated_concentrations': {
            'baseline_platelets_per_ul': baseline_platelets_per_ul,
            'final_prp_concentration_per_ul': final_prp_concentration_per_ul,
            'final_prp_concentration_millions': round(concentration_millions, 2),
            'final_ppp_concentration_per_ul': final_ppp_concentration_per_ul,
            'platelets_per_ml_of_prp': platelets_per_ml_of_prp
        },
        'concentration_feedback': {
            'type': feedback_type,
            'message': feedback_message
        },
        'zones': results
    }

@app.route('/', methods=['GET', 'POST'])
def handler():
    # Add CORS headers
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        return add_cors_headers(response)
    
    if request.method == 'GET':
        response = jsonify({
            'service': 'PRP Dosage Calculator API',
            'version': '1.0.0',
            'status': 'healthy',
            'endpoints': {
                'POST /api/calculate': 'Calculate PRP dosage',
                'GET /api/calculate': 'API documentation'
            },
            'example_request': {
                'thrombocytes': 200,
                'prp_yield': 1.0,
                'prp_concentration': 7.0,
                'ppp_concentration': 0.5
            }
        })
        return add_cors_headers(response)
    
    if request.method == 'POST':
        try:
            # Validate request content type
            if not request.is_json:
                response = jsonify({'error': 'Content-Type must be application/json'})
                response.status_code = 400
                return add_cors_headers(response)
            
            input_data = request.get_json()
            
            if not input_data:
                response = jsonify({'error': 'No JSON data provided'})
                response.status_code = 400
                return add_cors_headers(response)
            
            # Validate required fields
            if 'thrombocytes' not in input_data:
                response = jsonify({'error': 'Missing required field: thrombocytes'})
                response.status_code = 400
                return add_cors_headers(response)
            
            # Perform calculation
            results = calculate_prp_dosage(input_data)
            
            response = jsonify({
                'success': True,
                'data': results
            })
            return add_cors_headers(response)
            
        except ValueError as e:
            response = jsonify({'error': f'Invalid input: {str(e)}'})
            response.status_code = 400
            return add_cors_headers(response)
        except Exception as e:
            response = jsonify({'error': f'Calculation error: {str(e)}'})
            response.status_code = 500
            return add_cors_headers(response)