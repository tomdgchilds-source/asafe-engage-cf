/**
 * Product-specific pricing calculation utilities.
 *
 * NOTE: These prices are hardcoded for now. Ideally they should be fetched
 * from the server via /api/product-pricing endpoints. This file centralises
 * the pricing logic that was previously scattered inside AddToCartModal.
 */

// ─── Height Restrictor ───────────────────────────────────────────────

export function calculateHeightRestrictorPricing(
  restrictorHeight: string,
  restrictorWidth: string,
) {
  const height = parseFloat(restrictorHeight) || 2000;
  const width = parseFloat(restrictorWidth) || 4000;

  const basePrice = 5426.30; // iFlex Height Restrictor base price (AED)
  const standardArea = 2000 * 4000;
  const customArea = height * width;
  const areaMultiplier = customArea / standardArea;

  const unitPrice = Math.max(basePrice * areaMultiplier, basePrice * 0.5);

  return {
    unitPrice: Math.round(unitPrice * 100) / 100,
    tier: `Custom ${height}mm H x ${width}mm W`,
  };
}

// ─── iFlex Rail Column Guard ─────────────────────────────────────────

export function calculateIFlexRailPricing(
  columnLength: string,
  columnWidth: string,
  sidesToProtect: number,
  threeSidesDouble: 'length' | 'width',
  quantity: number,
  productName: string,
) {
  const length = parseFloat(columnLength) || 0;
  const width = parseFloat(columnWidth) || 0;

  if (sidesToProtect === 1) {
    if (length <= 0) {
      return { unitPrice: 0, totalPrice: 0, tier: 'Requires Length Dimension' };
    }
  } else {
    if (length <= 0 || width <= 0) {
      return { unitPrice: 0, totalPrice: 0, tier: 'Requires Dimensions' };
    }
  }

  const effectiveLength = length + 400;
  const effectiveWidth = width + 400;

  let totalLengthMm = 0;

  if (sidesToProtect === 4) {
    totalLengthMm = effectiveLength * 2 + effectiveWidth * 2;
  } else if (sidesToProtect === 3) {
    totalLengthMm =
      threeSidesDouble === 'length'
        ? effectiveLength * 2 + effectiveWidth
        : effectiveLength + effectiveWidth * 2;
  } else if (sidesToProtect === 2) {
    totalLengthMm = effectiveLength + effectiveWidth;
  } else if (sidesToProtect === 1) {
    totalLengthMm = effectiveLength;
  }

  const totalLengthMeters = totalLengthMm / 1000;

  const isPlusVersion =
    productName.toLowerCase().includes('+') ||
    productName.toLowerCase().includes('plus') ||
    productName.includes('Column Guard+');
  const pricePerMeter = isPlusVersion ? 2267 : 2042; // AED
  const unitPrice = totalLengthMeters * pricePerMeter;

  return {
    unitPrice: Math.round(unitPrice * 100) / 100,
    totalPrice: Math.round(unitPrice * quantity * 100) / 100,
    tier: `${sidesToProtect} Side${sidesToProtect !== 1 ? 's' : ''} (${totalLengthMeters.toFixed(2)}m total)`,
  };
}

// ─── Topple Barrier ──────────────────────────────────────────────────

const POST_PRICES: Record<string, number> = {
  '2080': 2029.87,
  '3600': 4014.82,
  '5300': 5793.84,
};

const RAIL_PRICES: Record<string, number> = {
  '500': 47.11,
  '600': 61.13,
  '700': 63.86,
  '800': 91.5,
  '900': 103.18,
  '1000': 118.76,
  '1100': 132.39,
  '1200': 147.96,
  '1300': 161.59,
  '1400': 175.22,
  '1500': 190.79,
  '1600': 204.42,
  '1700': 218.05,
  '1800': 220.0,
  '1900': 247.25,
  '2000': 260.88,
  '2100': 276.46,
  '2200': 290.09,
};

const RAIL_COUNTS: Record<string, number> = {
  '2080': 4,
  '3600': 6,
  '5300': 8,
};

export function calculateToppleBarrierPricing(
  toppleHeight: string,
  toppleWidth: string,
) {
  const height = parseFloat(toppleHeight) || 2080;
  const width = parseFloat(toppleWidth) || 1000;

  const postPrice = POST_PRICES[height.toString()] || 0;
  const railPrice = RAIL_PRICES[width.toString()] || 0;
  const numberOfRails = RAIL_COUNTS[height.toString()] || 4;

  const unitPrice = postPrice * 2 + railPrice * numberOfRails;
  const heightM = (height / 1000).toFixed(2);

  return {
    unitPrice: Math.round(unitPrice * 100) / 100,
    tier: `${heightM}m H \u00d7 ${width}mm W (2 posts + ${numberOfRails} rails)`,
  };
}
