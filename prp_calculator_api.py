#!/usr/bin/env python3
"""
PRP Dosage Calculator API
Converts the HTML/JavaScript calculator into a JSON API endpoint
"""

from flask import Flask, request, jsonify
import math
from typing import Dict, Any

app = Flask(__name__)

# Configuration constants (extracted from the original JavaScript)
ZONES = {
    'temporal_crown': {'name': 'Temporal/Crown', 'targetPlatelets': 1.75e9, 'minVolume': 2.0},
    'full_scalp': {'name': 'Full Scalp', 'targetPlatelets': 3.5e9, 'minVolume': 2.0}
}

OPTIMAL_MIN_PLATELETS_PER_UL = 1000000
OPTIMAL_MAX_PLATELETS_PER_UL = 1500000


def calculate_prp_dosage(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate PRP dosage based on input parameters
    
    Args:
        input_data: Dictionary containing:
            - thrombocytes: Patient thrombocytes in G/L
            - prp_yield: PRP yield per tube in ml (default: 1.0)
            - prp_concentration: PRP concentration multiplier (default: 7.0)
            - ppp_concentration: PPP concentration multiplier (default: 0.5)
    
    Returns:
        Dictionary with calculation results for each zone
    """
    
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
        
        # A. Determine theoretical minimum volume of PRP needed
        required_prp_volume_ml = target_platelets / platelets_per_ml_of_prp if platelets_per_ml_of_prp > 0 else 0
        
        # B. Calculate tubes needed based on fixed yield
        tubes_needed = math.ceil(required_prp_volume_ml / prp_yield_per_tube) if prp_yield_per_tube > 0 else 0
        
        # C. Calculate actual total PRP volume extracted
        total_prp_extracted_ml = tubes_needed * prp_yield_per_tube
        
        # D. Calculate PPP dilution if PRP is too concentrated
        dilution_ppp_ml = 0
        if final_prp_concentration_per_ul > OPTIMAL_MAX_PLATELETS_PER_UL:
            numerator = total_prp_extracted_ml * (final_prp_concentration_per_ul - OPTIMAL_MAX_PLATELETS_PER_UL)
            denominator = OPTIMAL_MAX_PLATELETS_PER_UL - final_ppp_concentration_per_ul
            if denominator > 0:
                dilution_ppp_ml = numerator / denominator
        
        # E. Calculate top-up PPP if volume is below minimum
        volume_after_dilution = total_prp_extracted_ml + dilution_ppp_ml
        volume_top_up_ppp_ml = max(0, min_volume - volume_after_dilution)
        
        # Final calculations
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
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is below the therapeutic window. Consider a higher concentration or alternative treatment."
    elif final_prp_concentration_per_ul > OPTIMAL_MAX_PLATELETS_PER_UL:
        feedback_type = "info"
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is above the optimal window. The treatment plan adds the required PPP to dilute the final mixture to the target 1.5M/µL concentration."
    else:
        feedback_type = "success"
        feedback_message = f"Your initial PRP has a concentration of {concentration_millions:.2f}M platelets/µL. This is within the optimal therapeutic window. Excellent!"
    
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


@app.route('/calculate', methods=['POST'])
def calculate_endpoint():
    """
    API endpoint to calculate PRP dosage
    
    Expected JSON input:
    {
        "thrombocytes": 200,           // Patient thrombocytes in G/L (required)
        "prp_yield": 1.0,             // PRP yield per tube in ml (optional, default: 1.0)
        "prp_concentration": 7.0,      // PRP concentration multiplier (optional, default: 7.0)
        "ppp_concentration": 0.5       // PPP concentration multiplier (optional, default: 0.5)
    }
    
    Returns JSON with calculation results
    """
    try:
        # Validate request content type
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        input_data = request.get_json()
        
        if not input_data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Validate required fields
        if 'thrombocytes' not in input_data:
            return jsonify({'error': 'Missing required field: thrombocytes'}), 400
        
        # Perform calculation
        results = calculate_prp_dosage(input_data)
        
        return jsonify({
            'success': True,
            'data': results
        })
        
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Calculation error: {str(e)}'}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'PRP Calculator API'})


@app.route('/', methods=['GET'])
def index():
    """API documentation endpoint"""
    return jsonify({
        'service': 'PRP Dosage Calculator API',
        'version': '1.0.0',
        'endpoints': {
            'POST /calculate': {
                'description': 'Calculate PRP dosage based on patient data and protocol',
                'required_fields': ['thrombocytes'],
                'optional_fields': ['prp_yield', 'prp_concentration', 'ppp_concentration'],
                'example_input': {
                    'thrombocytes': 200,
                    'prp_yield': 1.0,
                    'prp_concentration': 7.0,
                    'ppp_concentration': 0.5
                }
            },
            'GET /health': {
                'description': 'Health check endpoint'
            }
        }
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)