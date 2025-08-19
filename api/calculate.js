// PRP Dosage Calculator API - Node.js Version
// Vercel serverless function for PRP dosage calculations

// Configuration constants
const ZONES = {
    'temporal_crown': { name: 'Temporal/Crown', targetPlatelets: 1.75e9, minVolume: 2.0 },
    'full_scalp': { name: 'Full Scalp', targetPlatelets: 3.5e9, minVolume: 4.0 }
};

const OPTIMAL_MIN_PLATELETS_PER_UL = 1000000;
const OPTIMAL_MAX_PLATELETS_PER_UL = 1500000;

// Recursive calculation function to ensure optimal concentration
function getTreatmentPlan(zone, baseConcentrations, iteration = 0) {
    const { targetPlatelets, minVolume } = zone;
    const { plateletsPerMLofPRP, finalPrpConcentrationPerUL, finalPppConcentrationPerUL, prpYieldPerTube } = baseConcentrations;

    // A. Determine theoretical PRP volume needed
    const requiredPrpVolumeML = plateletsPerMLofPRP > 0 ? targetPlatelets / plateletsPerMLofPRP : 0;
    
    // B. Calculate tubes needed, adding iterations for re-calculation
    const tubesNeeded = prpYieldPerTube > 0 ? Math.ceil(requiredPrpVolumeML / prpYieldPerTube) + iteration : 0;
    
    // C. Calculate actual total PRP volume extracted
    const totalPrpExtractedML = tubesNeeded * prpYieldPerTube;

    // D. Calculate PPP for dilution if needed
    let dilutionPppML = 0;
    if (finalPrpConcentrationPerUL > OPTIMAL_MAX_PLATELETS_PER_UL) {
        const numerator = totalPrpExtractedML * (finalPrpConcentrationPerUL - OPTIMAL_MAX_PLATELETS_PER_UL);
        const denominator = OPTIMAL_MAX_PLATELETS_PER_UL - finalPppConcentrationPerUL;
        if (denominator > 0) {
            dilutionPppML = numerator / denominator;
        }
    }

    // E. Calculate PPP for volume top-up
    const volumeAfterDilution = totalPrpExtractedML + dilutionPppML;
    const volumeTopUpPppML = Math.max(0, minVolume - volumeAfterDilution);
    
    const totalPppNeededML = dilutionPppML + volumeTopUpPppML;
    const totalInjectionVolume = totalPrpExtractedML + totalPppNeededML;

    // F. Calculate final concentration and check against the minimum threshold
    const totalPlatelets = (totalPrpExtractedML * finalPrpConcentrationPerUL) + (totalPppNeededML * finalPppConcentrationPerUL);
    const finalMixtureConcentration = totalInjectionVolume > 0 ? totalPlatelets / totalInjectionVolume : 0;

    // G. If concentration is too low and we haven't looped too much, add a tube and recalculate
    if (finalMixtureConcentration < OPTIMAL_MIN_PLATELETS_PER_UL && iteration < 5) {
        return getTreatmentPlan(zone, baseConcentrations, iteration + 1);
    }

    // H. Return the final, stable plan
    const extractVolumePerTube = tubesNeeded > 0 ? totalInjectionVolume / tubesNeeded : 0;

    return {
        totalInjectionVolume,
        totalPrpExtractedML,
        totalPppNeededML,
        tubesNeeded,
        extractVolumePerTube,
        finalMixtureConcentration
    };
}

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
    const baselinePlateletsPerUL = patientThrombocytesGL * 1000;
    const finalPrpConcentrationPerUL = baselinePlateletsPerUL * prpConcentrationX;
    const finalPppConcentrationPerUL = baselinePlateletsPerUL * pppConcentrationX;
    
    const baseConcentrations = {
        plateletsPerMLofPRP: finalPrpConcentrationPerUL * 1000,
        finalPrpConcentrationPerUL,
        finalPppConcentrationPerUL,
        prpYieldPerTube
    };
    
    const results = {};
    
    // Calculate for each zone using the recursive algorithm
    Object.keys(ZONES).forEach(zoneKey => {
        const plan = getTreatmentPlan(ZONES[zoneKey], baseConcentrations);
        
        // Check if final concentration is within therapeutic range
        const concentrationStatus = plan.finalMixtureConcentration < OPTIMAL_MIN_PLATELETS_PER_UL ? 'below_min' :
                                   plan.finalMixtureConcentration > OPTIMAL_MAX_PLATELETS_PER_UL ? 'above_max' : 'optimal';
        
        results[zoneKey] = {
            zone_name: ZONES[zoneKey].name,
            tubes_needed: plan.tubesNeeded,
            total_injection_volume_ml: Math.round(plan.totalInjectionVolume * 10) / 10,
            total_prp_volume_ml: Math.round(plan.totalPrpExtractedML * 10) / 10,
            total_ppp_needed_ml: Math.round(plan.totalPppNeededML * 10) / 10,
            extract_volume_per_tube_ml: Math.round(plan.extractVolumePerTube * 10) / 10,
            target_platelets: ZONES[zoneKey].targetPlatelets,
            min_volume_ml: ZONES[zoneKey].minVolume,
            final_injection_concentration_per_ul: Math.round(plan.finalMixtureConcentration),
            final_injection_concentration_millions: Math.round((plan.finalMixtureConcentration / 1000000) * 100) / 100,
            concentration_status: concentrationStatus
        };
    });
    
    // Generate concentration feedback
    const concentrationMillions = finalPrpConcentrationPerUL / 1000000;
    
    let feedbackType, feedbackMessage;
    if (finalPrpConcentrationPerUL < OPTIMAL_MIN_PLATELETS_PER_UL) {
        feedbackType = "warning";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is below the therapeutic window.`;
    } else if (finalPrpConcentrationPerUL > OPTIMAL_MAX_PLATELETS_PER_UL) {
        feedbackType = "info";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is above the optimal window, we lower concentration by diluting with PPP.`;
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
            baseline_platelets_per_ul: baselinePlateletsPerUL,
            final_prp_concentration_per_ul: finalPrpConcentrationPerUL,
            final_prp_concentration_millions: Math.round(concentrationMillions * 100) / 100,
            final_ppp_concentration_per_ul: finalPppConcentrationPerUL,
            platelets_per_ml_of_prp: baseConcentrations.plateletsPerMLofPRP
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