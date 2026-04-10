import type { IStorage } from "../storage";

// =============================================
// INTELLIGENT SAFETY ENGINEERING MATCHING
// =============================================

// Vehicle impact characteristics database
const VEHICLE_CHARACTERISTICS = {
  forklift: { typicalSpeed: 8, mass: 4000, impactEnergy: 8000, riskLevel: 'high' },
  truck: { typicalSpeed: 15, mass: 15000, impactEnergy: 25000, riskLevel: 'very-high' },
  van: { typicalSpeed: 12, mass: 3000, impactEnergy: 6000, riskLevel: 'medium' },
  car: { typicalSpeed: 10, mass: 1500, impactEnergy: 3000, riskLevel: 'medium' },
  pallet_jack: { typicalSpeed: 5, mass: 500, impactEnergy: 1000, riskLevel: 'low' },
  cart: { typicalSpeed: 3, mass: 200, impactEnergy: 300, riskLevel: 'very-low' },
  scooter: { typicalSpeed: 6, mass: 150, impactEnergy: 400, riskLevel: 'low' },
  bicycle: { typicalSpeed: 8, mass: 100, impactEnergy: 500, riskLevel: 'low' }
};

// Workplace hazard patterns
const WORKPLACE_HAZARDS = {
  warehouse: {
    primaryHazards: ['vehicle-collision', 'rack-damage', 'pedestrian-safety'],
    commonVehicles: ['forklift', 'pallet_jack', 'truck'],
    riskAreas: ['loading-docks', 'aisles', 'intersections']
  },
  manufacturing: {
    primaryHazards: ['production-interference', 'equipment-damage', 'worker-safety'],
    commonVehicles: ['forklift', 'cart', 'truck'],
    riskAreas: ['production-lines', 'material-flow', 'maintenance-areas']
  },
  'loading-dock': {
    primaryHazards: ['truck-collision', 'edge-protection', 'fall-prevention'],
    commonVehicles: ['truck', 'van', 'forklift'],
    riskAreas: ['dock-edges', 'truck-paths', 'loading-areas']
  },
  parking: {
    primaryHazards: ['vehicle-collision', 'building-protection', 'pedestrian-safety'],
    commonVehicles: ['car', 'van', 'truck'],
    riskAreas: ['entrances', 'columns', 'walkways']
  },
  office: {
    primaryHazards: ['pedestrian-safety', 'area-separation', 'asset-protection'],
    commonVehicles: ['cart', 'scooter'],
    riskAreas: ['corridors', 'entrances', 'equipment-areas']
  }
};

export async function performIntelligentMatching(problemData: any, storage: IStorage) {
  try {
    console.log('🧠 Starting intelligent safety analysis for problem:', problemData.problemTitle);
    
    // Advanced semantic analysis
    const safetyContext = analyzeSafetyContext(problemData);
    const vehicleAnalysis = analyzeVehicleThreats(problemData);
    const workplaceRisks = analyzeWorkplaceRisks(problemData);
    
    // Extract enhanced keywords with safety terminology
    const extractedKeywords = extractEnhancedKeywords(
      problemData.problemTitle + " " + problemData.problemDescription,
      safetyContext
    );
    
    console.log('🔍 Extracted keywords:', extractedKeywords);
    console.log('⚠️ Safety context:', safetyContext);
    console.log('🚗 Vehicle analysis:', vehicleAnalysis);
    
    // Get all data for intelligent matching
    const [allProducts, allCaseStudies, allResources] = await Promise.all([
      storage.getProducts(),
      storage.getCaseStudies(),
      storage.getResources()
    ]);

    // Enhanced intelligent product matching
    const productMatches = await matchProductsIntelligently(
      problemData, 
      allProducts, 
      extractedKeywords,
      safetyContext,
      vehicleAnalysis,
      workplaceRisks
    );
    
    // Enhanced case study matching
    const caseStudyMatches = matchCaseStudiesIntelligently(
      problemData, 
      allCaseStudies, 
      extractedKeywords,
      safetyContext
    );
    
    // Match relevant resources
    const resourceMatches = matchRelevantResources(
      allResources,
      productMatches,
      safetyContext,
      extractedKeywords
    );
    
    // Calculate sophisticated match score
    const matchScore = calculateIntelligentMatchScore(
      productMatches, 
      caseStudyMatches, 
      safetyContext
    );
    
    console.log(`✅ Analysis complete! Found ${productMatches.length} product matches, ${caseStudyMatches.length} case studies, score: ${matchScore}%`);
    
    return {
      recommendedProducts: productMatches.slice(0, 8), // Top 8 products
      recommendedCaseStudies: caseStudyMatches.slice(0, 4), // Top 4 case studies
      recommendedResources: resourceMatches.slice(0, 6), // Top 6 resources
      extractedKeywords,
      matchScore,
      safetyContext,
      vehicleAnalysis,
      workplaceRisks,
      implementationGuidance: generateImplementationGuidance(productMatches, safetyContext)
    };
  } catch (error) {
    console.error("❌ Error in intelligent matching:", error);
    return {
      recommendedProducts: [],
      recommendedCaseStudies: [],
      recommendedResources: [],
      extractedKeywords: [],
      matchScore: 0,
      safetyContext: {},
      implementationGuidance: []
    };
  }
}

function extractEnhancedKeywords(text: string, safetyContext: any): string[] {
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'have', 'has', 'had', 'a', 'an'];
  
  // Safety-specific keywords to prioritize
  const safetyKeywords = [
    'collision', 'impact', 'damage', 'protection', 'barrier', 'safety', 'guard', 'secure',
    'accident', 'incident', 'crash', 'hit', 'protect', 'prevent', 'block', 'stop',
    'forklift', 'truck', 'vehicle', 'pedestrian', 'worker', 'staff', 'employee',
    'warehouse', 'loading', 'dock', 'aisle', 'rack', 'column', 'pillar', 'structure',
    'manufacturing', 'production', 'facility', 'plant', 'site', 'area', 'zone'
  ];
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.includes(word))
    .filter((word, index, arr) => arr.indexOf(word) === index);
    
  // Prioritize safety-related keywords
  const prioritizedWords = [
    ...words.filter(word => safetyKeywords.includes(word)),
    ...words.filter(word => !safetyKeywords.includes(word))
  ];
  
  return prioritizedWords.slice(0, 25); // More keywords for better matching
}

function analyzeSafetyContext(problemData: any): any {
  // Calculate impact energy from vehicle weight and speed if provided
  let calculatedImpactEnergy = 0;
  if (problemData.vehicleWeight && problemData.vehicleSpeed) {
    // Calculate kinetic energy: KE = 0.5 * m * v^2
    // Convert speed from km/h to m/s (divide by 3.6)
    const speedMs = problemData.vehicleSpeed / 3.6;
    calculatedImpactEnergy = Math.round(0.5 * problemData.vehicleWeight * speedMs * speedMs);
  }
  
  const context: any = {
    urgencyLevel: problemData.urgency || 'medium',
    industrySpecific: problemData.industry || 'general',
    workplaceType: problemData.workplaceType || 'general',
    hasImpactRequirement: !!calculatedImpactEnergy || !!problemData.vehicleWeight,
    estimatedImpactEnergy: calculatedImpactEnergy,
    vehicleWeight: problemData.vehicleWeight,
    vehicleSpeed: problemData.vehicleSpeed,
    riskLevel: 'medium'
  };
  
  // Analyze problem text for severity indicators
  const problemText = (problemData.problemTitle + " " + problemData.problemDescription).toLowerCase();
  
  // High-risk keywords
  const highRiskIndicators = ['collision', 'crash', 'accident', 'injury', 'damage', 'destroyed', 'frequent', 'daily', 'critical'];
  const mediumRiskIndicators = ['hit', 'bump', 'scrape', 'occasional', 'sometimes', 'concern'];
  const structuralIndicators = ['column', 'pillar', 'wall', 'structure', 'building', 'rack', 'equipment'];
  
  if (highRiskIndicators.some(word => problemText.includes(word))) {
    context.riskLevel = 'high';
  } else if (mediumRiskIndicators.some(word => problemText.includes(word))) {
    context.riskLevel = 'medium';
  }
  
  context.requiresStructuralProtection = structuralIndicators.some(word => problemText.includes(word));
  context.hasPedestrianRisk = problemText.includes('pedestrian') || problemText.includes('worker') || problemText.includes('people');
  context.hasVehicleTraffic = problemText.includes('vehicle') || problemText.includes('traffic') || problemText.includes('forklift');
  
  return context;
}

function analyzeVehicleThreats(problemData: any): any {
  const vehicleTypes = problemData.vehicleTypes || [];
  const analysis: any = {
    vehicles: [],
    maxThreatLevel: 'low',
    estimatedMaxImpact: 0,
    recommendations: [],
    calculatedFromUserData: false
  };
  
  // If user provided specific vehicle weight and speed, use those for calculation
  if (problemData.vehicleWeight && problemData.vehicleSpeed) {
    const speedMs = problemData.vehicleSpeed / 3.6;
    const impactEnergy = Math.round(0.5 * problemData.vehicleWeight * speedMs * speedMs);
    
    analysis.estimatedMaxImpact = impactEnergy;
    analysis.calculatedFromUserData = true;
    
    // Determine threat level based on calculated impact
    if (impactEnergy > 25000) {
      analysis.maxThreatLevel = 'very-high';
    } else if (impactEnergy > 15000) {
      analysis.maxThreatLevel = 'high';
    } else if (impactEnergy > 5000) {
      analysis.maxThreatLevel = 'medium';
    } else {
      analysis.maxThreatLevel = 'low';
    }
    
    analysis.vehicles.push({
      type: 'custom',
      mass: problemData.vehicleWeight,
      typicalSpeed: problemData.vehicleSpeed,
      impactEnergy: impactEnergy,
      riskLevel: analysis.maxThreatLevel
    });
  }
  
  // Also analyze selected vehicle types
  vehicleTypes.forEach((vehicleType: string) => {
    if (VEHICLE_CHARACTERISTICS[vehicleType]) {
      const vehicle = VEHICLE_CHARACTERISTICS[vehicleType];
      analysis.vehicles.push({
        type: vehicleType,
        ...vehicle
      });
      
      if (!analysis.calculatedFromUserData && vehicle.impactEnergy > analysis.estimatedMaxImpact) {
        analysis.estimatedMaxImpact = vehicle.impactEnergy;
        analysis.maxThreatLevel = vehicle.riskLevel;
      }
    }
  });
  
  // Generate recommendations based on vehicle analysis
  if (analysis.estimatedMaxImpact > 20000) {
    analysis.recommendations.push('High-impact barriers required for heavy vehicle protection');
  }
  if (analysis.estimatedMaxImpact > 10000) {
    analysis.recommendations.push('Consider reinforced protection systems for impact zones');
  }
  if (vehicleTypes.includes('forklift') || problemData.vehicleWeight >= 3000) {
    analysis.recommendations.push('Consider rack protection and pedestrian separation');
  }
  
  return analysis;
}

function analyzeWorkplaceRisks(problemData: any): any {
  const workplaceType = problemData.workplaceType;
  const risks = WORKPLACE_HAZARDS[workplaceType] || {
    primaryHazards: ['general-collision'],
    commonVehicles: ['vehicle'],
    riskAreas: ['general-area']
  };
  
  return {
    ...risks,
    specificRecommendations: generateWorkplaceSpecificRecommendations(workplaceType, problemData)
  };
}

function generateWorkplaceSpecificRecommendations(workplaceType: string, problemData: any): string[] {
  const recommendations = [];
  
  switch (workplaceType) {
    case 'warehouse':
      recommendations.push('Consider rack end protection for storage areas');
      recommendations.push('Implement pedestrian walkway separation');
      if (problemData.vehicleTypes?.includes('forklift')) {
        recommendations.push('Install forklift impact barriers in high-traffic areas');
      }
      break;
    case 'loading-dock':
      recommendations.push('Install dock edge protection barriers');
      recommendations.push('Consider truck restraint systems');
      break;
    case 'manufacturing':
      recommendations.push('Protect critical production equipment');
      recommendations.push('Separate material flow from personnel areas');
      break;
    case 'parking':
      recommendations.push('Install perimeter bollards for building protection');
      recommendations.push('Consider column guards in parking structures');
      break;
  }
  
  return recommendations;
}

async function matchProductsIntelligently(
  problemData: any, 
  products: any[], 
  keywords: string[],
  safetyContext: any,
  vehicleAnalysis: any,
  workplaceRisks: any
) {
  console.log('🔧 Analyzing products intelligently...');
  
  // Group products by base product family to consolidate variants
  const productFamilies = new Map();
  
  products.forEach(product => {
    // Extract base product name (without size/variant details)
    // Look for patterns like "- 1800 mm", "– 2400 mm", sizes, Plus, Standard etc.
    const baseName = product.name
      .replace(/\s*[-–]\s*\d+\s*mm.*$/i, '') // Remove size variations
      .replace(/\s*[-–]\s*\d+m.*$/i, '')      // Remove meter variations
      .replace(/\s+(Plus|Standard|Heavy Duty|Light Duty)$/i, '') // Remove duty variations
      .trim();
    
    if (!productFamilies.has(baseName)) {
      productFamilies.set(baseName, []);
    }
    productFamilies.get(baseName).push(product);
  });
  
  // Score each product family and return with all variants
  const matches = Array.from(productFamilies.entries()).map(([familyName, familyProducts]) => {
    // Sort variants by impact rating for better presentation
    const sortedVariants = familyProducts.sort((a, b) => 
      (a.impactRating || 0) - (b.impactRating || 0)
    );
    
    // Pick the product with median impact rating as representative for scoring
    const representativeProduct = sortedVariants[Math.floor(sortedVariants.length / 2)] || familyProducts[0];
    let score = 0;
    const reasons = [];
    
    // Safety Engineering: Category relevance based on workplace hazards
    const categoryRelevance = assessCategoryRelevance(representativeProduct.category, workplaceRisks, safetyContext);
    score += categoryRelevance.score;
    if (categoryRelevance.reason) reasons.push(categoryRelevance.reason);
    
    // Impact Engineering: Advanced impact requirement matching
    const impactMatch = assessImpactRequirement(representativeProduct, problemData, vehicleAnalysis, safetyContext);
    score += impactMatch.score;
    if (impactMatch.reason) reasons.push(impactMatch.reason);
    
    // Contextual Analysis: Product name and description analysis
    const contextualScore = analyzeProductContext(representativeProduct, keywords, safetyContext);
    score += contextualScore.score;
    if (contextualScore.reason) reasons.push(contextualScore.reason);
    
    // Industry Intelligence: Smart industry matching
    const industryMatch = assessIndustryMatch(representativeProduct, problemData, workplaceRisks);
    score += industryMatch.score;
    if (industryMatch.reason) reasons.push(industryMatch.reason);
    
    // Vehicle-Product Compatibility
    const vehicleCompatibility = assessVehicleCompatibility(representativeProduct, vehicleAnalysis, safetyContext);
    score += vehicleCompatibility.score;
    if (vehicleCompatibility.reason) reasons.push(vehicleCompatibility.reason);
    
    // Safety Priority Boost
    if (safetyContext.urgencyLevel === 'high') {
      score *= 1.2;
      reasons.push('Priority recommendation for urgent safety concern');
    }
    
    // Return the grouped product family with all variants
    return {
      product: representativeProduct, // Main product for display
      variants: sortedVariants,        // All variants in the family
      variantCount: sortedVariants.length,
      score: Math.round(score),
      matchingReasons: reasons.slice(0, 4), // Top 4 reasons
      impactRange: {
        min: Math.min(...sortedVariants.map(p => p.impactRating || 0)),
        max: Math.max(...sortedVariants.map(p => p.impactRating || 0))
      }
    };
  });
  
  const validMatches = matches
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
    
  console.log(`Found ${validMatches.length} unique product families with variants`);
  return validMatches;
}

// Advanced Assessment Functions for Product Intelligence
function assessCategoryRelevance(category: string, workplaceRisks: any, safetyContext: any) {
  let score = 0;
  let reason = '';
  
  // Match product categories to workplace hazards
  const categoryHazardMapping = {
    'traffic-barriers': ['vehicle-collision', 'traffic-control'],
    'pedestrian-barriers': ['pedestrian-safety', 'area-separation'],
    'rack-protection': ['rack-damage', 'forklift-collision'],
    'column-protection': ['structural-protection', 'building-damage'],
    'bollards': ['perimeter-security', 'vehicle-stopping']
  };
  
  const relevantHazards = categoryHazardMapping[category] || [];
  const matchingHazards = workplaceRisks.primaryHazards.filter(hazard => 
    relevantHazards.some(relevant => hazard.includes(relevant.split('-')[0]))
  );
  
  if (matchingHazards.length > 0) {
    score = 50 + (matchingHazards.length * 15);
    reason = `Perfect for ${matchingHazards[0]} protection`;
  }
  
  // Context-based boost
  if (safetyContext.requiresStructuralProtection && category.includes('column')) {
    score += 25;
    reason = 'Essential for structural protection';
  }
  
  return { score, reason };
}

function assessImpactRequirement(product: any, problemData: any, vehicleAnalysis: any, safetyContext: any) {
  let score = 0;
  let reason = '';
  
  const productImpact = product.impactRating || 0;
  const requiredImpact = Math.max(
    problemData.impactRequirement || 0,
    vehicleAnalysis.estimatedMaxImpact || 0
  );
  
  if (productImpact && requiredImpact) {
    const safetyMargin = productImpact - requiredImpact;
    
    if (safetyMargin >= 5000) {
      score = 60;
      reason = `Exceeds impact requirement with ${Math.round(safetyMargin/1000)}kJ safety margin`;
    } else if (safetyMargin >= 0) {
      score = 40;
      reason = `Meets impact requirement (${Math.round(productImpact/1000)}kJ capacity)`;
    } else if (safetyMargin >= -2000) {
      score = 20;
      reason = `Close to impact requirement - consider safety factors`;
    }
  } else if (productImpact > 10000) {
    score = 30;
    reason = `High-impact barrier (${Math.round(productImpact/1000)}kJ capacity)`;
  }
  
  return { score, reason };
}

function analyzeProductContext(product: any, keywords: string[], safetyContext: any) {
  let score = 0;
  let reason = '';
  
  const productText = (product.name + " " + product.description).toLowerCase();
  
  // Count keyword matches
  const matchingKeywords = keywords.filter(keyword => productText.includes(keyword));
  score += matchingKeywords.length * 8;
  
  // Safety-specific keyword boost
  const safetyTerms = ['protection', 'barrier', 'guard', 'safety', 'secure'];
  const safetyMatches = safetyTerms.filter(term => productText.includes(term));
  
  if (safetyMatches.length > 0) {
    score += safetyMatches.length * 10;
    reason = `Safety-focused design with ${safetyMatches.join(', ')} features`;
  }
  
  if (matchingKeywords.length > 3) {
    reason = `Strong keyword match (${matchingKeywords.length} relevant terms)`;
  }
  
  return { score, reason };
}

function assessIndustryMatch(product: any, problemData: any, workplaceRisks: any) {
  let score = 0;
  let reason = '';
  
  // Since products have limited industry data, use workplace-type inference
  const workplaceIndustryMapping = {
    'warehouse': ['Warehousing & Logistics', 'retail', 'manufacturing'],
    'manufacturing': ['automotive', 'manufacturing', 'aerospace'],
    'loading-dock': ['Warehousing & Logistics', 'retail', 'Food & Beverage'],
    'parking': ['retail', 'office', 'healthcare'],
    'office': ['public-sector', 'healthcare', 'education']
  };
  
  const relevantIndustries = workplaceIndustryMapping[problemData.workplaceType] || [];
  
  if (problemData.industry && relevantIndustries.includes(problemData.industry)) {
    score = 35;
    reason = `Optimized for ${problemData.industry} operations`;
  } else if (problemData.workplaceType) {
    score = 20;
    reason = `Suitable for ${problemData.workplaceType} environments`;
  }
  
  return { score, reason };
}

function assessVehicleCompatibility(product: any, vehicleAnalysis: any, safetyContext: any) {
  let score = 0;
  let reason = '';
  
  if (vehicleAnalysis.vehicles && vehicleAnalysis.vehicles.length > 0) {
    const highestRiskVehicle = vehicleAnalysis.vehicles
      .sort((a, b) => b.impactEnergy - a.impactEnergy)[0];
    
    // Match product category to vehicle type
    const vehicleCategoryMapping = {
      'forklift': ['rack-protection', 'traffic-barriers'],
      'truck': ['traffic-barriers', 'bollards'],
      'car': ['traffic-barriers', 'column-protection'],
      'pallet_jack': ['pedestrian-barriers', 'rack-protection']
    };
    
    const suitableCategories = vehicleCategoryMapping[highestRiskVehicle.type] || [];
    
    if (suitableCategories.includes(product.category)) {
      score = 45;
      reason = `Designed for ${highestRiskVehicle.type} protection`;
    } else if (product.impactRating >= highestRiskVehicle.impactEnergy) {
      score = 30;
      reason = `Can withstand ${highestRiskVehicle.type} impact`;
    }
  }
  
  return { score, reason };
}

function matchCaseStudiesIntelligently(
  problemData: any, 
  caseStudies: any[], 
  keywords: string[],
  safetyContext: any
) {
  console.log('📚 Analyzing case studies intelligently...');
  
  const matches = caseStudies.map(caseStudy => {
    let score = 0;
    const reasons = [];
    
    // Prioritize documented cases with videos and detailed materials
    if (caseStudy.videoUrl || caseStudy.youtubeUrl) {
      score += 30;
      reasons.push('Video documentation available');
    }
    
    if (caseStudy.pdfUrl) {
      score += 20;
      reasons.push('Detailed PDF case study available');
    }
    
    // Industry matching with contextual boost
    if (problemData.industry && caseStudy.industry === problemData.industry) {
      score += 60;
      reasons.push(`Same industry: ${problemData.industry}`);
    } else if (problemData.industry && isRelatedIndustry(caseStudy.industry, problemData.industry)) {
      score += 30;
      reasons.push(`Related industry experience`);
    }
    
    // Challenge similarity analysis
    if (caseStudy.challenge) {
      const challengeText = caseStudy.challenge.toLowerCase();
      const semanticMatch = analyzeSemanticSimilarity(challengeText, keywords, safetyContext);
      score += semanticMatch.score;
      if (semanticMatch.reason) reasons.push(semanticMatch.reason);
    }
    
    // Solution relevance analysis
    if (caseStudy.solution) {
      const solutionText = caseStudy.solution.toLowerCase();
      const solutionMatch = analyzeSolutionRelevance(solutionText, keywords, safetyContext);
      score += solutionMatch.score;
      if (solutionMatch.reason) reasons.push(solutionMatch.reason);
    }
    
    // Workplace context matching
    const workplaceMatch = analyzeWorkplaceContextMatch(caseStudy, problemData, safetyContext);
    score += workplaceMatch.score;
    if (workplaceMatch.reason) reasons.push(workplaceMatch.reason);
    
    // Impact energy relevance for case study
    if (safetyContext.estimatedImpactEnergy > 0 && caseStudy.impactRating) {
      const impactDifference = Math.abs(safetyContext.estimatedImpactEnergy - (caseStudy.impactRating || 10000));
      if (impactDifference < 5000) {
        score += 40;
        reasons.push('Similar impact requirements');
      } else if (impactDifference < 10000) {
        score += 20;
        reasons.push('Comparable safety requirements');
      }
    }
    
    // Urgency relevance
    if (safetyContext.urgencyLevel === 'high') {
      score *= 1.1;
    }
    
    // Boost for comprehensive solutions
    if (caseStudy.products && caseStudy.products.length > 0) {
      score += 15;
      reasons.push('Complete solution with multiple products');
    }
    
    return {
      caseStudy,
      score: Math.round(score),
      matchingReasons: reasons.slice(0, 4),
      hasVideo: !!(caseStudy.videoUrl || caseStudy.youtubeUrl),
      hasPdf: !!caseStudy.pdfUrl
    };
  });
  
  const validMatches = matches
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
    
  console.log(`Found ${validMatches.length} relevant case studies`);
  return validMatches;
}

// Helper function to check if industries are related
function isRelatedIndustry(industry1: string, industry2: string): boolean {
  const relatedGroups = [
    ['warehouse', 'Warehousing & Logistics', 'distribution', 'fulfillment'],
    ['manufacturing', 'production', 'automotive', 'aerospace'],
    ['retail', 'shopping', 'commerce'],
    ['healthcare', 'hospital', 'medical'],
    ['Food & Beverage', 'food', 'beverage', 'restaurant']
  ];
  
  for (const group of relatedGroups) {
    if (group.includes(industry1) && group.includes(industry2)) {
      return true;
    }
  }
  return false;
}

// Case Study Analysis Functions
function analyzeSemanticSimilarity(challengeText: string, keywords: string[], safetyContext: any) {
  let score = 0;
  let reason = '';
  
  const matchingKeywords = keywords.filter(keyword => challengeText.includes(keyword));
  score += matchingKeywords.length * 12;
  
  // Contextual analysis for safety terms
  const safetyIndicators = ['accident', 'collision', 'damage', 'injury', 'incident', 'hazard'];
  const safetyMatches = safetyIndicators.filter(indicator => challengeText.includes(indicator));
  
  if (safetyMatches.length > 0) {
    score += safetyMatches.length * 15;
    reason = `Similar safety challenge involving ${safetyMatches[0]}`;
  } else if (matchingKeywords.length > 2) {
    reason = `Similar problem context (${matchingKeywords.length} matching terms)`;
  }
  
  return { score, reason };
}

function analyzeSolutionRelevance(solutionText: string, keywords: string[], safetyContext: any) {
  let score = 0;
  let reason = '';
  
  const solutionKeywords = keywords.filter(keyword => solutionText.includes(keyword));
  score += solutionKeywords.length * 8;
  
  // Look for implementation terms
  const implementationTerms = ['installed', 'implemented', 'deployed', 'protection', 'barrier'];
  const implementationMatches = implementationTerms.filter(term => solutionText.includes(term));
  
  if (implementationMatches.length > 0) {
    score += implementationMatches.length * 10;
    reason = `Proven solution with ${implementationMatches[0]} approach`;
  }
  
  return { score, reason };
}

function analyzeWorkplaceContextMatch(caseStudy: any, problemData: any, safetyContext: any) {
  let score = 0;
  let reason = '';
  
  const caseStudyText = (caseStudy.title + " " + caseStudy.description + " " + (caseStudy.challenge || '')).toLowerCase();
  
  // Workplace type matching
  const workplaceTerms = {
    'warehouse': ['warehouse', 'storage', 'Warehousing & Logistics', 'distribution'],
    'manufacturing': ['manufacturing', 'production', 'factory', 'plant'],
    'loading-dock': ['loading', 'dock', 'shipping', 'receiving'],
    'parking': ['parking', 'garage', 'vehicle', 'car park'],
    'office': ['office', 'building', 'corporate', 'workplace']
  };
  
  const relevantTerms = workplaceTerms[problemData.workplaceType] || [];
  const matchingTerms = relevantTerms.filter(term => caseStudyText.includes(term));
  
  if (matchingTerms.length > 0) {
    score += matchingTerms.length * 20;
    reason = `Similar ${problemData.workplaceType} environment`;
  }
  
  return { score, reason };
}

// Resource Matching Function
function matchRelevantResources(
  resources: any[],
  productMatches: any[],
  safetyContext: any,
  keywords: string[]
) {
  console.log('📋 Finding relevant resources...');
  
  const matches = resources.map(resource => {
    let score = 0;
    const reasons = [];
    
    const resourceText = (resource.title + " " + resource.description).toLowerCase();
    
    // Match to recommended products
    const topProducts = productMatches.slice(0, 3);
    topProducts.forEach(productMatch => {
      const productName = productMatch.product.name.toLowerCase();
      const productWords = productName.split(' ');
      
      if (productWords.some(word => resourceText.includes(word) && word.length > 3)) {
        score += 40;
        reasons.push(`Related to recommended ${productMatch.product.name}`);
      }
    });
    
    // Keyword matching
    const keywordMatches = keywords.filter(keyword => resourceText.includes(keyword));
    score += keywordMatches.length * 8;
    
    // Category-based relevance
    const categoryRelevance = {
      'Installation Guides': 35,
      'Certificates': 25,
      'Technical Specifications': 30,
      'Video Guides': 20
    };
    
    if (categoryRelevance[resource.category]) {
      score += categoryRelevance[resource.category];
      reasons.push(`Essential ${resource.category.toLowerCase()}`);
    }
    
    // Urgent safety context boost
    if (safetyContext.urgencyLevel === 'high' && resource.category === 'Installation Guides') {
      score += 20;
      reasons.push('Priority resource for urgent implementation');
    }
    
    return {
      resource,
      score,
      matchingReasons: reasons.slice(0, 2)
    };
  });
  
  const validMatches = matches
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
    
  console.log(`Found ${validMatches.length} relevant resources`);
  return validMatches;
}

function generateMatchingReasons(product: any, problemData: any, keywords: string[]): string[] {
  const reasons = [];
  
  if (problemData.industry && product.industries?.includes(problemData.industry)) {
    reasons.push(`Perfect for ${problemData.industry} industry`);
  }
  
  if (product.applications) {
    const matchingApps = product.applications.filter((app: string) => 
      keywords.some(keyword => app.toLowerCase().includes(keyword))
    );
    if (matchingApps.length > 0) {
      reasons.push(`Designed for ${matchingApps[0]}`);
    }
  }
  
  if (problemData.impactRequirement && product.impactRating) {
    if (product.impactRating >= problemData.impactRequirement) {
      reasons.push(`Exceeds your impact requirement (${product.impactRating} J)`);
    }
  }
  
  return reasons.slice(0, 3); // Top 3 reasons
}

function generateCaseStudyMatchingReasons(caseStudy: any, problemData: any, keywords: string[]): string[] {
  const reasons = [];
  
  if (problemData.industry && caseStudy.industry === problemData.industry) {
    reasons.push(`Same industry: ${problemData.industry}`);
  }
  
  if (caseStudy.challenge) {
    const matchingKeywords = keywords.filter(keyword => 
      caseStudy.challenge.toLowerCase().includes(keyword)
    );
    if (matchingKeywords.length > 0) {
      reasons.push(`Similar challenge involving ${matchingKeywords[0]}`);
    }
  }
  
  return reasons.slice(0, 2); // Top 2 reasons
}

function calculateIntelligentMatchScore(
  productMatches: any[], 
  caseStudyMatches: any[], 
  safetyContext: any
): number {
  let totalScore = 0;
  let weightSum = 0;
  
  // Product score (weighted heavily)
  if (productMatches.length > 0) {
    const avgProductScore = productMatches.reduce((sum, match) => sum + match.score, 0) / productMatches.length;
    totalScore += avgProductScore * 0.6; // 60% weight
    weightSum += 0.6;
  }
  
  // Case study score (medium weight)
  if (caseStudyMatches.length > 0) {
    const avgCaseStudyScore = caseStudyMatches.reduce((sum, match) => sum + match.score, 0) / caseStudyMatches.length;
    totalScore += avgCaseStudyScore * 0.3; // 30% weight
    weightSum += 0.3;
  }
  
  // Context quality bonus (10% weight)
  let contextBonus = 0;
  if (safetyContext.hasImpactRequirement) contextBonus += 20;
  if (safetyContext.urgencyLevel === 'high') contextBonus += 15;
  if (safetyContext.riskLevel === 'high') contextBonus += 10;
  
  totalScore += contextBonus * 0.1;
  weightSum += 0.1;
  
  const finalScore = weightSum > 0 ? Math.round(totalScore / weightSum) : 0;
  
  // Cap at 95% to indicate there's always room for human expertise
  return Math.min(finalScore, 95);
}

function generateImplementationGuidance(productMatches: any[], safetyContext: any): string[] {
  const guidance = [];
  
  if (productMatches.length === 0) {
    guidance.push('Contact A-SAFE experts for customized safety solution analysis');
    return guidance;
  }
  
  const topProduct = productMatches[0];
  
  // Implementation priority guidance
  if (safetyContext.urgencyLevel === 'high') {
    guidance.push('🚨 URGENT: Implement temporary safety measures immediately while procuring barriers');
    guidance.push('📞 Contact A-SAFE emergency response team for expedited delivery');
  } else {
    guidance.push('📋 Plan barrier installation during planned maintenance or low-activity periods');
  }
  
  // Technical implementation advice
  if (safetyContext.requiresStructuralProtection) {
    guidance.push('🔧 Structural assessment recommended before installation');
    guidance.push('📐 Professional site survey required for optimal placement');
  }
  
  // Safety compliance guidance
  guidance.push('📜 Verify barriers meet local workplace safety regulations');
  guidance.push('🎓 Provide safety training to staff on new barrier systems');
  
  // Cost optimization tips
  if (productMatches.length > 3) {
    guidance.push('💰 Consider bulk ordering for multi-zone protection cost savings');
  }
  
  // Follow-up recommendations
  guidance.push('📊 Schedule quarterly safety audits to assess barrier effectiveness');
  guidance.push('📞 Book consultation with A-SAFE specialists for implementation planning');
  
  return guidance.slice(0, 6); // Limit to 6 actionable items
}

export async function getDetailedRecommendations(solutionRequest: any, storage: IStorage) {
  try {
    const [productDetails, caseStudyDetails] = await Promise.all([
      Promise.all((solutionRequest.recommendedProducts || []).map(async (rec: any) => {
        const product = await storage.getProduct(rec.product.id);
        return { ...rec, product };
      })),
      Promise.all((solutionRequest.recommendedCaseStudies || []).map(async (rec: any) => {
        const caseStudy = await storage.getCaseStudy(rec.caseStudy.id);
        return { ...rec, caseStudy };
      }))
    ]);
    
    return {
      products: productDetails,
      caseStudies: caseStudyDetails
    };
  } catch (error) {
    console.error("Error getting detailed recommendations:", error);
    return {
      products: [],
      caseStudies: []
    };
  }
}
