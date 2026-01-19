/**
 * DSB (Directorate for Civil Protection and Emergency Management) Baseline
 * 1-week self-preparedness minimum per person
 * 
 * Reference: Norwegian government emergency preparedness guidelines
 */

export const dsbBaseline = {
  water: {
    name: 'Water',
    description: 'Drinking & cooking water',
    target: 10.5,
    unit: 'liters',
    daily: 1.5,
    days: 7,
  },
  food: {
    name: 'Food',
    description: 'Non-perishable food supplies',
    target: 14000,
    unit: 'kcal',
    daily: 2000,
    days: 7,
  },
  medications: {
    name: 'Medications',
    description: 'Personal medications (1-week supply)',
    target: 1,
    unit: 'weeks',
    daily: null,
    days: 7,
  },
  firstAid: {
    name: 'First Aid',
    description: 'Basic first aid kit',
    target: 1,
    unit: 'kit',
    daily: null,
    days: 7,
  },
  hygiene: {
    name: 'Hygiene',
    description: 'Toilet paper, soap, sanitizer, feminine products',
    target: 7,
    unit: 'days supply',
    daily: 1,
    days: 7,
  },
  warmth: {
    name: 'Warmth',
    description: 'Blankets, warm clothing, hat, gloves',
    target: 2,
    unit: 'sets',
    daily: null,
    days: 7,
  },
  light: {
    name: 'Light & Communication',
    description: 'Flashlight, candles, radio, phone charger',
    target: 4,
    unit: 'items',
    daily: null,
    days: 7,
  },
  documents: {
    name: 'Important Documents',
    description: 'ID, insurance, medical records, photos',
    target: 5,
    unit: 'items',
    daily: null,
    days: 7,
  },
  tools: {
    name: 'Tools & Cash',
    description: 'Emergency cash, multi-tool, rope, duct tape',
    target: 4,
    unit: 'items',
    daily: null,
    days: 7,
  },
};

/**
 * Get all DSB baseline categories
 * @returns {Object} DSB baseline object
 */
export function getDsbBaseline() {
  return dsbBaseline;
}

/**
 * Get DSB category names
 * @returns {Array} Array of category keys
 */
export function getDsbCategories() {
  return Object.keys(dsbBaseline);
}

/**
 * Get total number of DSB categories
 * @returns {number} Number of categories
 */
export function getDsbCategoryCount() {
  return getDsbCategories().length;
}

/**
 * Calculate completeness percentage based on DSB baseline
 * @param {Object} inventoryByCategory - Object with category keys and user quantities
 * @returns {number} Completeness percentage (0-100)
 */
export function calculateDsbCompleteness(inventoryByCategory = {}) {
  const categories = getDsbCategories();
  
  if (categories.length === 0) return 0;

  let completeCategoryCount = 0;

  categories.forEach((category) => {
    const baseline = dsbBaseline[category];
    const userQuantity = inventoryByCategory[category] || 0;
    
    // Category is complete if user has at least the target quantity
    if (userQuantity >= baseline.target) {
      completeCategoryCount++;
    }
  });

  return Math.round((completeCategoryCount / categories.length) * 100);
}

/**
 * Get detailed completeness breakdown by category
 * @param {Object} inventoryByCategory - Object with category keys and user quantities
 * @returns {Array} Array of category completeness objects
 */
export function getDetailedCompleteness(inventoryByCategory = {}) {
  return getDsbCategories().map((category) => {
    const baseline = dsbBaseline[category];
    const userQuantity = inventoryByCategory[category] || 0;
    const percentage = Math.min(100, Math.round((userQuantity / baseline.target) * 100));
    const isComplete = userQuantity >= baseline.target;

    return {
      category,
      name: baseline.name,
      target: baseline.target,
      unit: baseline.unit,
      current: userQuantity,
      percentage,
      isComplete,
      remaining: Math.max(0, baseline.target - userQuantity),
    };
  });
}
