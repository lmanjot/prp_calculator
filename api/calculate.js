// PRP Dosage Calculator API - Node.js Version
// Vercel serverless function for PRP dosage calculations

// Configuration constants
const ZONES = {
    'temporal_crown': { 
        name: 'Temporal/Crown', 
        minPlatelets: 1.5e9, 
        maxPlatelets: 2.0e9, 
        targetPlatelets: 1.75e9, 
        minVolume: 2.0 
    },
    'full_scalp': { 
        name: 'Full Scalp', 
        minPlatelets: 3.0e9, 
        maxPlatelets: 4.0e9, 
        targetPlatelets: 3.5e9, 
        minVolume: 4.0 
    }
};

const OPTIMAL_MIN_PLATELETS_PER_UL = 1000000;
const OPTIMAL_MAX_PLATELETS_PER_UL = 1500000;

// Optimized calculation function to achieve both concentration and platelet count targets
function getTreatmentPlan(zone, baseConcentrations, iteration = 0) {
    const { minPlatelets, maxPlatelets, targetPlatelets, minVolume } = zone;
    const { plateletsPerMLofPRP, finalPrpConcentrationPerUL, finalPppConcentrationPerUL, prpYieldPerTube } = baseConcentrations;

    // Target concentration: aim for middle of range (1.25M/µL)
    const targetConcentration = (OPTIMAL_MIN_PLATELETS_PER_UL + OPTIMAL_MAX_PLATELETS_PER_UL) / 2;
    
    // A. Start with minimum PRP needed to hit minimum platelet count
    let optimalPrpVolumeML = minPlatelets / (finalPrpConcentrationPerUL * 1000);
    
    // B. Calculate tubes needed for this PRP volume
    let tubesNeeded = Math.max(1, Math.ceil(optimalPrpVolumeML / prpYieldPerTube));
    
    // C. Calculate actual PRP volume we'll extract
    let totalPrpExtractedML = tubesNeeded * prpYieldPerTube;
    
    // D. Calculate total platelets from actual PRP volume
    const totalPlateletsFromPRP = totalPrpExtractedML * finalPrpConcentrationPerUL * 1000;
    
    // E. Determine optimal final volume based on concentration constraints
    // We want to hit target concentration (1.25M/µL) but not go below minimum (1.0M/µL)
    const idealVolumeForTargetConc = totalPlateletsFromPRP / (targetConcentration * 1000);
    const maxVolumeForMinConc = totalPlateletsFromPRP / (OPTIMAL_MIN_PLATELETS_PER_UL * 1000);
    
    // Choose the smaller volume (higher concentration) but respect minimum volume requirement
    let idealFinalVolume = Math.min(idealVolumeForTargetConc, maxVolumeForMinConc);
    idealFinalVolume = Math.max(idealFinalVolume, minVolume); // Ensure minimum volume
    
    // F. Calculate PPP needed for concentration optimization
    let concentrationPppML = Math.max(0, idealFinalVolume - totalPrpExtractedML);
    
    // G. Ensure we meet minimum volume requirement
    const volumeAfterConcentrationDilution = totalPrpExtractedML + concentrationPppML;
    const volumeTopUpPppML = Math.max(0, minVolume - volumeAfterConcentrationDilution);
    
    const totalPppNeededML = concentrationPppML + volumeTopUpPppML;
    const totalInjectionVolume = totalPrpExtractedML + totalPppNeededML;

    // H. Calculate final totals
    const totalPlatelets = (totalPrpExtractedML * finalPrpConcentrationPerUL * 1000) + (totalPppNeededML * finalPppConcentrationPerUL * 1000);
    const finalMixtureConcentration = totalInjectionVolume > 0 ? totalPlatelets / (totalInjectionVolume * 1000) : 0;

    // I. Check if we're within acceptable ranges
    const concentrationTooLow = finalMixtureConcentration < OPTIMAL_MIN_PLATELETS_PER_UL;
    const concentrationTooHigh = finalMixtureConcentration > OPTIMAL_MAX_PLATELETS_PER_UL;
    const plateletCountTooLow = totalPlatelets < minPlatelets;
    const plateletCountTooHigh = totalPlatelets > maxPlatelets;
    
    // J. Adjust tube count if needed and try again
    if (iteration < 5) {
        // Priority 1: If concentration is too low, we need more tubes (more platelets)
        if (concentrationTooLow) {
            return getTreatmentPlan(zone, baseConcentrations, iteration + 1);
        }
        
        // Priority 2: If platelet count is too low, we need more tubes
        if (plateletCountTooLow) {
            return getTreatmentPlan(zone, baseConcentrations, iteration + 1);
        }
        
        // Priority 3: If platelet count is too high, try fewer tubes if possible
        if (plateletCountTooHigh && tubesNeeded > 1) {
            // Calculate what happens with one fewer tube
            const testTubesNeeded = tubesNeeded - 1;
            const testTotalPrpML = testTubesNeeded * prpYieldPerTube;
            const testTotalPlatelets = testTotalPrpML * finalPrpConcentrationPerUL * 1000;
            
            // Only reduce tubes if we stay above minimum platelet count
            if (testTotalPlatelets >= minPlatelets) {
                // Recalculate with fewer tubes
                tubesNeeded = testTubesNeeded;
                totalPrpExtractedML = testTotalPrpML;
                
                const newTotalPlateletsFromPRP = totalPrpExtractedML * finalPrpConcentrationPerUL * 1000;
                const newIdealVolumeForTargetConc = newTotalPlateletsFromPRP / (targetConcentration * 1000);
                const newMaxVolumeForMinConc = newTotalPlateletsFromPRP / (OPTIMAL_MIN_PLATELETS_PER_UL * 1000);
                
                let newIdealFinalVolume = Math.min(newIdealVolumeForTargetConc, newMaxVolumeForMinConc);
                newIdealFinalVolume = Math.max(newIdealFinalVolume, minVolume);
                
                concentrationPppML = Math.max(0, newIdealFinalVolume - totalPrpExtractedML);
                
                const newVolumeAfterDilution = totalPrpExtractedML + concentrationPppML;
                const newVolumeTopUpPppML = Math.max(0, minVolume - newVolumeAfterDilution);
                
                const newTotalPppNeededML = concentrationPppML + newVolumeTopUpPppML;
                const newTotalInjectionVolume = totalPrpExtractedML + newTotalPppNeededML;
                
                return {
                    totalInjectionVolume: newTotalInjectionVolume,
                    totalPrpExtractedML,
                    totalPppNeededML: newTotalPppNeededML,
                    tubesNeeded,
                    extractVolumePerTube: tubesNeeded > 0 ? newTotalInjectionVolume / tubesNeeded : 0,
                    finalMixtureConcentration: newTotalInjectionVolume > 0 ? 
                        ((totalPrpExtractedML * finalPrpConcentrationPerUL * 1000) + (newTotalPppNeededML * finalPppConcentrationPerUL * 1000)) / (newTotalInjectionVolume * 1000) : 0,
                    totalPlatelets: (totalPrpExtractedML * finalPrpConcentrationPerUL * 1000) + (newTotalPppNeededML * finalPppConcentrationPerUL * 1000),
                    concentrationStatus: 'optimal', // Will be recalculated below
                    plateletCountStatus: 'optimal',  // Will be recalculated below
                    plateletCountRange: `${(minPlatelets/1e9).toFixed(1)}-${(maxPlatelets/1e9).toFixed(1)}B`
                };
            }
        }
    }

    // K. Calculate final metrics
    const extractVolumePerTube = tubesNeeded > 0 ? totalInjectionVolume / tubesNeeded : 0;
    
    // L. Determine status based on both concentration and platelet count
    let concentrationStatus = 'optimal';
    if (finalMixtureConcentration < OPTIMAL_MIN_PLATELETS_PER_UL) {
        concentrationStatus = 'below_min';
    } else if (finalMixtureConcentration > OPTIMAL_MAX_PLATELETS_PER_UL) {
        concentrationStatus = 'above_max';
    }
    
    let plateletCountStatus = 'optimal';
    if (totalPlatelets < minPlatelets) {
        plateletCountStatus = 'below_min';
    } else if (totalPlatelets > maxPlatelets) {
        plateletCountStatus = 'above_max';
    }

    return {
        totalInjectionVolume,
        totalPrpExtractedML,
        totalPppNeededML,
        tubesNeeded,
        extractVolumePerTube,
        finalMixtureConcentration,
        totalPlatelets,
        concentrationStatus,
        plateletCountStatus,
        plateletCountRange: `${(minPlatelets/1e9).toFixed(1)}-${(maxPlatelets/1e9).toFixed(1)}B`
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
        
        results[zoneKey] = {
            zone_name: ZONES[zoneKey].name,
            tubes_needed: plan.tubesNeeded,
            total_injection_volume_ml: Math.round(plan.totalInjectionVolume * 10) / 10,
            total_prp_volume_ml: Math.round(plan.totalPrpExtractedML * 10) / 10,
            total_ppp_needed_ml: Math.round(plan.totalPppNeededML * 10) / 10,
            extract_volume_per_tube_ml: Math.round(plan.extractVolumePerTube * 10) / 10,
            target_platelets: ZONES[zoneKey].targetPlatelets,
            min_platelets: ZONES[zoneKey].minPlatelets,
            max_platelets: ZONES[zoneKey].maxPlatelets,
            total_platelets_extracted: Math.round(plan.totalPlatelets),
            platelet_count_range: plan.plateletCountRange,
            min_volume_ml: ZONES[zoneKey].minVolume,
            final_injection_concentration_per_ul: Math.round(plan.finalMixtureConcentration),
            final_injection_concentration_millions: Math.round((plan.finalMixtureConcentration / 1000000) * 100) / 100,
            concentration_status: plan.concentrationStatus,
            platelet_count_status: plan.plateletCountStatus
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
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is above optimal range, we dilute with PPP to reduce concentration.`;
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

// Authentication token
const AUTH_TOKEN = 'Shared1Mara!';

// Vercel serverless function handler
export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.status(200).json({ status: 'ok' });
            return;
        }
        
        // Check authentication for non-GET requests
        if (req.method === 'POST') {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
            
            if (!token || token !== AUTH_TOKEN) {
                res.status(401).json({ 
                    error: 'Unauthorized',
                    message: 'Valid authentication token required'
                });
                return;
            }
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
                res.status(200).json({ 
                    success: false,
                    error: 'No JSON data provided',
                    message: 'Please provide input data for calculation'
                });
                return;
            }
            
            // Check if thrombocytes value is provided
            if (!inputData.thrombocytes || inputData.thrombocytes <= 0) {
                res.status(200).json({ 
                    success: false,
                    error: 'Missing or invalid thrombocyte value',
                    message: 'Please provide a valid thrombocyte count greater than 0',
                    received_data: inputData
                });
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