// PRP Dosage Calculator API - Node.js Version
// Vercel serverless function for PRP dosage calculations

// Configuration constants
const ZONES = {
    'temporal_crown': { name: 'Temporal/Crown', targetPlatelets: 1.75e9, minVolume: 2.0 },
    'full_scalp': { name: 'Full Scalp', targetPlatelets: 3.5e9, minVolume: 2.0 }
};

const OPTIMAL_MIN_PLATELETS_PER_UL = 1000000;
const OPTIMAL_MAX_PLATELETS_PER_UL = 1500000;

function calculatePRPDosage(inputData) {
    // Extract inputs with defaults
    const patientThrombocytesGL = parseFloat(inputData.thrombocytes || 0);
    const prpYieldPerTube = parseFloat(inputData.prp_yield || 1.0);
    const prpConcentrationX = parseFloat(inputData.prp_concentration || 7.0);
    const pppConcentrationX = parseFloat(inputData.ppp_concentration || 0.5);
    
    // Validate inputs
    if (patientThrombocytesGL <= 0) {
        throw new Error("Patient thrombocytes must be greater than 0");
    }
    if (prpYieldPerTube <= 0) {
        throw new Error("PRP yield per tube must be greater than 0");
    }
    if (prpConcentrationX <= 0) {
        throw new Error("PRP concentration must be greater than 0");
    }
    
    // Calculate base concentrations
    const baselilnePlateletsPerUL = patientThrombocytesGL * 1000;
    const finalPRPConcentrationPerUL = baselilnePlateletsPerUL * prpConcentrationX;
    const finalPPPConcentrationPerUL = baselilnePlateletsPerUL * pppConcentrationX;
    const plateletsPerMLOfPRP = finalPRPConcentrationPerUL * 1000;
    
    const results = {};
    
    // Calculate for each zone
    Object.keys(ZONES).forEach(zoneKey => {
        const zone = ZONES[zoneKey];
        const targetPlatelets = zone.targetPlatelets;
        const minVolume = zone.minVolume;
        
        // A. Determine theoretical minimum volume of PRP needed
        const requiredPRPVolumeML = plateletsPerMLOfPRP > 0 ? targetPlatelets / plateletsPerMLOfPRP : 0;
        
        // B. Calculate tubes needed based on fixed yield
        const tubesNeeded = prpYieldPerTube > 0 ? Math.ceil(requiredPRPVolumeML / prpYieldPerTube) : 0;
        
        // C. Calculate actual total PRP volume extracted
        const totalPRPExtractedML = tubesNeeded * prpYieldPerTube;
        
        // D. Calculate PPP dilution if PRP is too concentrated
        let dilutionPPPML = 0;
        if (finalPRPConcentrationPerUL > OPTIMAL_MAX_PLATELETS_PER_UL) {
            const numerator = totalPRPExtractedML * (finalPRPConcentrationPerUL - OPTIMAL_MAX_PLATELETS_PER_UL);
            const denominator = OPTIMAL_MAX_PLATELETS_PER_UL - finalPPPConcentrationPerUL;
            if (denominator > 0) {
                dilutionPPPML = numerator / denominator;
            }
        }
        
        // E. Calculate top-up PPP if volume is below minimum
        const volumeAfterDilution = totalPRPExtractedML + dilutionPPPML;
        const volumeTopUpPPPML = Math.max(0, minVolume - volumeAfterDilution);
        
        // Final calculations
        const totalPPPNeededML = dilutionPPPML + volumeTopUpPPPML;
        const totalInjectionVolume = totalPRPExtractedML + totalPPPNeededML;
        const extractVolumePerTube = tubesNeeded > 0 ? totalInjectionVolume / tubesNeeded : 0;
        
        results[zoneKey] = {
            zone_name: zone.name,
            tubes_needed: tubesNeeded,
            total_injection_volume_ml: Math.round(totalInjectionVolume * 10) / 10,
            total_prp_volume_ml: Math.round(totalPRPExtractedML * 10) / 10,
            total_ppp_needed_ml: Math.round(totalPPPNeededML * 10) / 10,
            extract_volume_per_tube_ml: Math.round(extractVolumePerTube * 10) / 10,
            target_platelets: targetPlatelets,
            min_volume_ml: minVolume
        };
    });
    
    // Generate concentration feedback
    const concentrationMillions = finalPRPConcentrationPerUL / 1000000;
    
    let feedbackType, feedbackMessage;
    if (finalPRPConcentrationPerUL < OPTIMAL_MIN_PLATELETS_PER_UL) {
        feedbackType = "warning";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is below the therapeutic window.`;
    } else if (finalPRPConcentrationPerUL > OPTIMAL_MAX_PLATELETS_PER_UL) {
        feedbackType = "info";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is above the optimal window.`;
    } else {
        feedbackType = "success";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is within the optimal therapeutic window.`;
    }
    
    return {
        input_parameters: {
            thrombocytes_gl: patientThrombocytesGL,
            prp_yield_ml: prpYieldPerTube,
            prp_concentration_x: prpConcentrationX,
            ppp_concentration_x: pppConcentrationX
        },
        calculated_concentrations: {
            baseline_platelets_per_ul: baselilnePlateletsPerUL,
            final_prp_concentration_per_ul: finalPRPConcentrationPerUL,
            final_prp_concentration_millions: Math.round(concentrationMillions * 100) / 100,
            final_ppp_concentration_per_ul: finalPPPConcentrationPerUL,
            platelets_per_ml_of_prp: plateletsPerMLOfPRP
        },
        concentration_feedback: {
            type: feedbackType,
            message: feedbackMessage
        },
        zones: results
    };
}

// Vercel serverless function handler
export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.status(200).json({ status: 'ok' });
            return;
        }
        
        // Handle GET request for documentation
        if (req.method === 'GET') {
            res.status(200).json({
                service: 'PRP Dosage Calculator API',
                version: '1.0.0',
                status: 'healthy',
                endpoints: {
                    'POST /api/calculate': 'Calculate PRP dosage',
                    'GET /api/calculate': 'API documentation'
                },
                example_request: {
                    thrombocytes: 200,
                    prp_yield: 1.0,
                    prp_concentration: 7.0,
                    ppp_concentration: 0.5
                }
            });
            return;
        }
        
        // Handle POST request for calculation
        if (req.method === 'POST') {
            const inputData = req.body;
            
            if (!inputData) {
                res.status(400).json({ error: 'No JSON data provided' });
                return;
            }
            
            // Validate required fields
            if (!inputData.thrombocytes) {
                res.status(400).json({ error: 'Missing required field: thrombocytes' });
                return;
            }
            
            // Perform calculation
            const results = calculatePRPDosage(inputData);
            
            res.status(200).json({
                success: true,
                data: results
            });
            return;
        }
        
        // Method not allowed
        res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('API Error:', error);
        if (error.message.includes('must be greater than')) {
            res.status(400).json({ error: `Invalid input: ${error.message}` });
        } else {
            res.status(500).json({ error: `Calculation error: ${error.message}` });
        }
    }
}