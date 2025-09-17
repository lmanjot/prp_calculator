// PRP Dosage Calculator API - Node.js Version
// Vercel serverless function for PRP dosage calculations

// Configuration constants
const ZONES = {
    'temporal_crown': { 
        name: 'Temporal/Crown', 
        minPlatelets: 1.0e9, 
        maxPlatelets: 5.0e9, 
        targetPlatelets: 3.0e9, 
        minVolume: 2.0 
    },
    'full_scalp': { 
        name: 'Full Scalp', 
        minPlatelets: 2.0e9, 
        maxPlatelets: 10.0e9, 
        targetPlatelets: 6.0e9, 
        minVolume: 3.0 
    }
};

const OPTIMAL_MIN_PLATELETS_PER_UL = 1000000;
const OPTIMAL_MAX_PLATELETS_PER_UL = 1500000;

// Double spin protocol configuration
const DOUBLE_SPIN_CONFIG = {
    enabled: true,
    minConcentrationThreshold: 1000000, // 1.0M/µL - threshold to trigger double spin
    concentrationMultiplier: 7.0, // 7x concentration after double spin
    prpYieldPerTube: 2.0, // 2ml PRP per tube after double spin
    requiresEvenTubes: true // Must use 2, 4, 6, etc. tubes
};

// Optimized calculation function to achieve both concentration and platelet count targets
function getTreatmentPlan(zone, baseConcentrations, iteration = 0, useDoubleSpin = false) {
    const { minPlatelets, maxPlatelets, targetPlatelets, minVolume } = zone;
    const { plateletsPerMLofPRP, finalPrpConcentrationPerUL, prpYieldPerTube, baselinePlateletsPerUL, recoveryRate, activationRate, prpConcentrationX } = baseConcentrations;
    
    // Apply double spin configuration if needed
    let effectivePrpConcentration = finalPrpConcentrationPerUL;
    let effectivePrpYield = prpYieldPerTube;
    
    if (useDoubleSpin && DOUBLE_SPIN_CONFIG.enabled) {
        effectivePrpConcentration = finalPrpConcentrationPerUL * (DOUBLE_SPIN_CONFIG.concentrationMultiplier / 4.0); // Adjust from 4x to 7x
        effectivePrpYield = DOUBLE_SPIN_CONFIG.prpYieldPerTube; // 2ml instead of 1ml
    }
    
    // For single spin, ensure we use the correct concentration
    // effectivePrpConcentration should be the concentration of platelets in the PRP, not inactivated platelets
    
    // Calculate effective recovery rate: double spin has 20% lower recovery
    const effectiveRecoveryRate = useDoubleSpin ? recoveryRate * 0.8 : recoveryRate;
    
    // Calculate how many platelets are actually available for treatment after recovery and activation
    const recoveredPlateletsPerUL = baselinePlateletsPerUL * (effectiveRecoveryRate / 100);
    const activatedPlateletsPerUL = recoveredPlateletsPerUL * (activationRate / 100);
    const inactivatedPlateletsPerUL = recoveredPlateletsPerUL * ((100 - activationRate) / 100);
    
    // IMPORTANT: The effective concentration for treatment planning should be based on INACTIVATED platelets
    // This represents what's actually available for injection
    const effectivePlateletsForTreatment = inactivatedPlateletsPerUL;

    // Target concentration: aim for middle of range (1.25M/µL)
    const targetConcentration = (OPTIMAL_MIN_PLATELETS_PER_UL + OPTIMAL_MAX_PLATELETS_PER_UL) / 2;
    
    // A. Start with minimum PRP needed to hit minimum platelet count
    // The target platelet count remains the same - recovery rate affects yield, not target
    let optimalPrpVolumeML = minPlatelets / (effectivePrpConcentration * 1000);
    
    // B. Calculate tubes needed for this PRP volume, adding iterations for adjustments
    let tubesNeeded = Math.max(1, Math.ceil(optimalPrpVolumeML / effectivePrpYield));
    
    // Handle iteration adjustments: positive for increasing, negative for decreasing
    if (iteration > 0) {
        tubesNeeded += iteration; // Add tubes for platelet count or concentration issues
    } else if (iteration < 0) {
        tubesNeeded = Math.max(1, tubesNeeded + iteration); // Reduce tubes (but not below 1)
    }
    
    // For double spin, optimize tube count to minimize excess platelets
    if (useDoubleSpin && DOUBLE_SPIN_CONFIG.enabled) {
        // Calculate what we'd get with current tube count
        const currentVolume = tubesNeeded * effectivePrpYield;
        const currentPlatelets = currentVolume * effectivePrpConcentration * 1000;
        
        // Check if we can reduce tubes while still meeting minimum requirements
        if (tubesNeeded > 1) {
            const reducedTubes = tubesNeeded - 1;
            const reducedVolume = reducedTubes * effectivePrpYield;
            const reducedPlatelets = reducedVolume * effectivePrpConcentration * 1000;
            
            // If reduced tubes still meet minimum platelets and volume, use fewer tubes
            if (reducedPlatelets >= minPlatelets && reducedVolume >= minVolume) {
                tubesNeeded = reducedTubes;
            }
        }
        
        // For double spin, we need at least 1 tube (the even number requirement applies to starting blood tubes, not final PRP tubes)
        tubesNeeded = Math.max(1, tubesNeeded);
    }
    
    // C. Calculate actual PRP volume we'll extract
    let totalPrpExtractedML = tubesNeeded * effectivePrpYield;
    
    // D. Calculate total platelets from actual PRP volume
    // This should be based on the effective PRP concentration (what we actually extract)
    const totalPlateletsFromPRP = totalPrpExtractedML * effectivePrpConcentration * 1000;
    
    // E. Calculate PPP needed based on concentration and volume constraints
    let concentrationPppML = 0;
    let volumeTopUpPppML = 0;
    
    // First, check if PRP alone meets minimum volume
    if (totalPrpExtractedML >= minVolume) {
        // We have enough volume, no PPP needed for volume
        volumeTopUpPppML = 0;
        
        // Only add PPP if PRP concentration is too high
        if (effectivePrpConcentration > OPTIMAL_MAX_PLATELETS_PER_UL) {
            // Calculate dilution needed to bring concentration down to max optimal
            // Use 2.5x PPP concentration for dilution calculations (first 1ml)
            const pppConcentrationForDilution = baselinePlateletsPerUL * 2.5;
            const excessConcentration = effectivePrpConcentration - OPTIMAL_MAX_PLATELETS_PER_UL;
            const dilutionDenominator = OPTIMAL_MAX_PLATELETS_PER_UL - pppConcentrationForDilution;
            if (dilutionDenominator > 0) {
                concentrationPppML = (totalPrpExtractedML * excessConcentration) / dilutionDenominator;
            }
        }
    } else {
        // We need to add PPP to reach minimum volume, BUT check if it would dilute below therapeutic threshold
        const baseVolumeTopUp = minVolume - totalPrpExtractedML;
        
        // Calculate what the final concentration would be if we add PPP
        const pppConcentrationForVolume = baselinePlateletsPerUL * 2.5; // 2.5x for first 1ml
        const totalPlateletsWithPPP = (totalPrpExtractedML * effectivePrpConcentration * 1000) + 
                                     (baseVolumeTopUp * pppConcentrationForVolume * 1000);
        const finalVolumeWithPPP = totalPrpExtractedML + baseVolumeTopUp;
        const finalConcentrationWithPPP = totalPlateletsWithPPP / (finalVolumeWithPPP * 1000);
        
        // Only add PPP if it doesn't bring concentration below therapeutic threshold
        if (finalConcentrationWithPPP >= OPTIMAL_MIN_PLATELETS_PER_UL) {
            volumeTopUpPppML = baseVolumeTopUp;
        } else {
            // Don't add PPP - keep pure PRP to maintain therapeutic concentration
            volumeTopUpPppML = 0;
        }
    }
    
    const totalPppNeededML = concentrationPppML + volumeTopUpPppML;
    const totalInjectionVolume = totalPrpExtractedML + totalPppNeededML;

    // H. Calculate final totals with two-tier PPP concentration
    // First 1ml of PPP has 3x concentration, additional PPP has 1x concentration
    let totalPppPlatelets = 0;
    if (totalPppNeededML > 0) {
        const firstPppML = Math.min(1.0, totalPppNeededML);
        const additionalPppML = Math.max(0, totalPppNeededML - 1.0);
        
        const firstPppConcentration = baselinePlateletsPerUL * 2.5; // 2.5x for first 1ml
        const additionalPppConcentration = baselinePlateletsPerUL * 1.0; // 1x for additional
        
        totalPppPlatelets = (firstPppML * firstPppConcentration * 1000) + (additionalPppML * additionalPppConcentration * 1000);
    }
    
    const totalPlatelets = (totalPrpExtractedML * effectivePrpConcentration * 1000) + totalPppPlatelets;
    const finalMixtureConcentration = totalInjectionVolume > 0 ? totalPlatelets / (totalInjectionVolume * 1000) : 0;

    // I. Check if we're within acceptable ranges
    const concentrationTooLow = finalMixtureConcentration < OPTIMAL_MIN_PLATELETS_PER_UL;
    const concentrationTooHigh = finalMixtureConcentration > OPTIMAL_MAX_PLATELETS_PER_UL;
    const plateletCountTooLow = totalPlatelets < minPlatelets;
    const plateletCountTooHigh = totalPlatelets > maxPlatelets;
    
    // J. Adjust tube count if needed - PRIORITIZE PLATELET COUNT OVER CONCENTRATION
    if (iteration < 3) { // Reduce iterations to avoid infinite loops
        // Priority 1: If platelet count is too low, we need more tubes
        if (plateletCountTooLow) {
            return getTreatmentPlan(zone, baseConcentrations, iteration + 1);
        }
        
        // Priority 2: If concentration is too low, we need more tubes (more platelets)
        // BUT: For double spin with PPP dilution, accept lower concentration if platelets are sufficient
        if (concentrationTooLow && !(useDoubleSpin && totalPppNeededML > 0)) {
            return getTreatmentPlan(zone, baseConcentrations, iteration + 1);
        }
        
        // Priority 3: If platelet count is too high, we accept it for now
        // Tube reduction logic removed to prevent infinite recursion
        // The system will use the calculated tube count
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
        plateletCountRange: `${(minPlatelets/1e9).toFixed(1)}-${(maxPlatelets/1e9).toFixed(1)}B`,
        // Add recovery data for display
        recoveredPlateletsPerUL,
        activatedPlateletsPerUL,
        inactivatedPlateletsPerUL,
        effectiveRecoveryRate
    };
}

function calculatePRPDosage(inputData) {
    // Extract inputs with defaults
    const patientThrombocytesGL = parseFloat(inputData.thrombocytes || 0);
    const prpYieldPerTube = parseFloat(inputData.prp_yield || 1.0);
    const prpConcentrationX = parseFloat(inputData.prp_concentration || 4.0);
    const pppConcentrationX = parseFloat(inputData.ppp_concentration || 2.5);
    const recoveryRate = parseFloat(inputData.recovery_rate || 70.0);
    const activationRate = parseFloat(inputData.activation_rate || 20.0);
    
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
    if (recoveryRate < 0 || recoveryRate > 100) {
        throw new Error("Recovery rate must be between 0 and 100");
    }
    if (activationRate < 0 || activationRate > 100) {
        throw new Error("Activation rate must be between 0 and 100");
    }
    
    // Calculate base concentrations (concentration is NOT affected by recovery/activation)
    const baselinePlateletsPerUL = patientThrombocytesGL * 1000;
    
    // IMPORTANT: Concentration is calculated from ORIGINAL baseline platelets, not reduced ones
    // Recovery and activation only affect the total available platelet count for treatment
    const finalPrpConcentrationPerUL = baselinePlateletsPerUL * prpConcentrationX;
    const finalPppConcentrationPerUL = baselinePlateletsPerUL * pppConcentrationX;
    
    const baseConcentrations = {
        plateletsPerMLofPRP: finalPrpConcentrationPerUL * 1000,
        finalPrpConcentrationPerUL,
        finalPppConcentrationPerUL,
        prpYieldPerTube,
        baselinePlateletsPerUL,
        recoveryRate,
        activationRate,
        prpConcentrationX
    };
    
    const results = {};
    
    // Calculate for each zone independently using the same getTreatmentPlan function
    Object.keys(ZONES).forEach(zoneKey => {
        const zone = ZONES[zoneKey];
        
        // Check if double spin is needed based on initial concentration
        const initialConcentration = finalPrpConcentrationPerUL;
        const useDoubleSpin = DOUBLE_SPIN_CONFIG.enabled && 
                             initialConcentration < DOUBLE_SPIN_CONFIG.minConcentrationThreshold;
        
        // Calculate plan for this zone
        let plan;
        if (useDoubleSpin) {
            // First try with double spin
            plan = getTreatmentPlan(zone, baseConcentrations, 0, true);
        } else {
            plan = getTreatmentPlan(zone, baseConcentrations, 0, false);
        }
        
        // Set results for this zone
        results[zoneKey] = {
            zone_name: zone.name,
            tubes_needed: useDoubleSpin ? plan.tubesNeeded * 2 : plan.tubesNeeded, // Starting blood tubes needed
            final_tubes_needed: plan.tubesNeeded, // Final PRP tubes after double spin
            total_injection_volume_ml: Math.round(plan.totalInjectionVolume * 10) / 10,
            total_prp_volume_ml: Math.round(plan.totalPrpExtractedML * 10) / 10,
            total_ppp_needed_ml: Math.round(plan.totalPppNeededML * 10) / 10,
            extract_volume_per_tube_ml: Math.round(plan.extractVolumePerTube * 10) / 10,
            target_platelets: zone.targetPlatelets,
            min_platelets: zone.minPlatelets,
            max_platelets: zone.maxPlatelets,
            total_platelets_extracted: Math.round(plan.totalPlatelets),
            platelet_count_range: plan.plateletCountRange,
            min_volume_ml: zone.minVolume,
            final_injection_concentration_per_ul: Math.round(plan.finalMixtureConcentration),
            final_injection_concentration_millions: Math.round((plan.finalMixtureConcentration / 1000000) * 100) / 100,
            concentration_status: plan.concentrationStatus,
            platelet_count_status: plan.plateletCountStatus,
            double_spin_used: useDoubleSpin,
            initial_concentration: Math.round(initialConcentration / 1000000 * 100) / 100,
            // Add recovery data for display (now calculated in getTreatmentPlan)
            recovered_platelets_per_ul: Math.round(plan.recoveredPlateletsPerUL || 0),
            activated_platelets_per_ul: Math.round(plan.activatedPlateletsPerUL || 0),
            inactivated_platelets_per_ul: Math.round(plan.inactivatedPlateletsPerUL || 0),
            effective_recovery_rate: plan.effectiveRecoveryRate || recoveryRate
        };
    });
    
    // Generate concentration feedback
    const concentrationMillions = finalPrpConcentrationPerUL / 1000000;
    
    let feedbackType, feedbackMessage;
    if (finalPrpConcentrationPerUL < OPTIMAL_MIN_PLATELETS_PER_UL) {
        feedbackType = "warning";
        feedbackMessage = `Your initial PRP has a concentration of ${concentrationMillions.toFixed(2)}M platelets/µL. This is below the therapeutic window. Double spin required.`;
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
            ppp_concentration_x: pppConcentrationX,
            recovery_rate_percent: recoveryRate,
            activation_rate_percent: activationRate
        },
        calculated_concentrations: {
            baseline_platelets_per_ul: baselinePlateletsPerUL,
            // Note: Recovery data is now calculated per zone since it depends on protocol
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
                    prp_concentration: 4.0,
                    ppp_concentration: 2.5,
                    recovery_rate: 70.0,
                    activation_rate: 20.0
                },
                note: "Recovery and activation rates reduce the total available platelets, but concentration multipliers still apply to the remaining inactivated platelets. Double spin protocol activates when initial concentration < 1.0M/µL."
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
