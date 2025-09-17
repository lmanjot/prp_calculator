# PRP Dosage Calculator API

This API provides an endpoint version of the PRP (Platelet-Rich Plasma) dosage calculator, accepting JSON input and returning JSON output with calculated dosage requirements for hair restoration treatments.

## Features

- **JSON API**: Accepts input data as JSON and returns results as JSON
- **Zone-based calculations**: Calculates dosages for both Temporal/Crown and Full Scalp treatments
- **Concentration optimization**: Provides feedback on PRP concentration and dilution requirements
- **Input validation**: Validates all input parameters with meaningful error messages
- **Health monitoring**: Includes health check endpoint

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python3 prp_calculator_api.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### POST /calculate

Calculates PRP dosage based on patient data and protocol parameters.

**Request Body:**
```json
{
    "thrombocytes": 200,           // Required: Patient thrombocytes in G/L
    "prp_yield": 1.0,             // Optional: PRP yield per tube in ml (default: 1.0)
    "prp_concentration": 7.0,      // Optional: PRP concentration multiplier (default: 7.0)
    "ppp_concentration": 0.5       // Optional: PPP concentration multiplier (default: 0.5)
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "input_parameters": {
            "thrombocytes_gl": 200.0,
            "prp_yield_ml": 1.0,
            "prp_concentration_x": 7.0,
            "ppp_concentration_x": 0.5
        },
        "calculated_concentrations": {
            "baseline_platelets_per_ul": 200000.0,
            "final_prp_concentration_per_ul": 1400000.0,
            "final_prp_concentration_millions": 1.4,
            "final_ppp_concentration_per_ul": 100000.0,
            "platelets_per_ml_of_prp": 1400000000.0
        },
        "concentration_feedback": {
            "type": "success",
            "message": "Your initial PRP has a concentration of 1.40M platelets/µL. This is within the optimal therapeutic window. Excellent!"
        },
        "zones": {
            "temporal_crown": {
                "zone_name": "Temporal/Crown",
                "tubes_needed": 2,
                "total_injection_volume_ml": 2.0,
                "total_prp_volume_ml": 2.0,
                "total_ppp_needed_ml": 0,
                "extract_volume_per_tube_ml": 1.0,
                "target_platelets": 1750000000.0,
                "min_volume_ml": 2.0
            },
            "full_scalp": {
                "zone_name": "Full Scalp",
                "tubes_needed": 3,
                "total_injection_volume_ml": 3.0,
                "total_prp_volume_ml": 3.0,
                "total_ppp_needed_ml": 0,
                "extract_volume_per_tube_ml": 1.0,
                "target_platelets": 3000000000.0,
                "min_volume_ml": 3.0
            }
        }
    }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
    "status": "healthy",
    "service": "PRP Calculator API"
}
```

### GET /

API documentation endpoint with usage information.

## Usage Examples

### Basic calculation with default parameters:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"thrombocytes": 200}' \
  http://localhost:5000/calculate
```

### Custom parameters:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "thrombocytes": 300,
    "prp_yield": 1.2,
    "prp_concentration": 8.0,
    "ppp_concentration": 0.4
  }' \
  http://localhost:5000/calculate
```

### Health check:
```bash
curl http://localhost:5000/health
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400 Bad Request`: Invalid input data or missing required fields
- `500 Internal Server Error`: Calculation errors

Example error response:
```json
{
    "error": "Missing required field: thrombocytes"
}
```

## Calculation Logic

The API implements the same calculation logic as the original HTML calculator:

1. **Base Calculations**: Converts patient thrombocytes to baseline platelet concentrations
2. **Zone Processing**: Calculates requirements for both Temporal/Crown and Full Scalp zones
3. **Tube Requirements**: Determines number of blood tubes needed based on yield
4. **Dilution Logic**: Calculates PPP dilution if concentration is too high
5. **Volume Optimization**: Ensures minimum volume requirements are met
6. **Feedback Generation**: Provides concentration analysis and recommendations

## Configuration

The following constants can be modified in the code:

- `OPTIMAL_MIN_PLATELETS_PER_UL`: Minimum optimal platelet concentration (default: 1,000,000)
- `OPTIMAL_MAX_PLATELETS_PER_UL`: Maximum optimal platelet concentration (default: 1,500,000)
- Zone configurations in `ZONES` dictionary (target platelets and minimum volumes)

## Dependencies

- Flask 3.0.0
- Python 3.7+