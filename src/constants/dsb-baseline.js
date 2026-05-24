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
    note: '1.5 liters per person per day',
  },
  food: {
    name: 'Food',
    description: 'Non-perishable food supplies',
    target: 14000,
    unit: 'kcal',
    daily: 2000,
    days: 7,
    note: '2000 kcal per person per day (or 21 meals/cans per person)',
  },
  medications: {
    name: 'Medications',
    description: 'Personal medications (1-week supply)',
    target: 1,
    unit: 'week supply',
    daily: null,
    days: 7,
    note: '1 week supply per person',
  },
  firstAid: {
    name: 'First Aid',
    description: 'Basic first aid kit',
    target: 1,
    unit: 'kit',
    daily: null,
    days: 7,
    note: '1 kit per household',
  },
  hygiene: {
    name: 'Hygiene',
    description: 'Toilet paper, soap, sanitizer, feminine products',
    target: 7,
    unit: 'rolls',
    daily: 1,
    days: 7,
    note: '7 rolls toilet paper per person (1 per day), 1 bar soap, 1 pack sanitary products if needed',
  },
  warmth: {
    name: 'Warmth',
    description: 'Blankets, warm clothing, hat, gloves',
    target: 2,
    unit: 'blankets',
    daily: null,
    days: 7,
    note: '2 blankets per person, 1 set warm clothes per person',
  },
  light: {
    name: 'Light',
    description: 'Flashlights, batteries, candles, radio',
    target: 2,
    unit: 'flashlights',
    daily: null,
    days: 7,
    note: '2 flashlights, 12 AA batteries, 6 candles, 1 radio per household',
  },
  batteries: {
    name: 'Batteries',
    description: 'AA/AAA batteries for devices',
    target: 12,
    unit: 'AA batteries',
    daily: null,
    days: 7,
    note: '12 AA, 6 AAA per household',
  },
  documents: {
    name: 'Important Documents',
    description: 'ID, insurance, medical records, photos',
    target: 1,
    unit: 'set',
    daily: null,
    days: 7,
    note: '1 set per household',
  },
  tools: {
    name: 'Tools & Cash',
    description: 'Emergency cash, multi-tool, rope, duct tape',
    target: 1,
    unit: 'set',
    daily: null,
    days: 7,
    note: '1 multi-tool, 1 roll duct tape, 1 rope, 1 cash stash per household',
  },
  communication: {
    name: 'Communication',
    description: 'Power bank, battery radio',
    target: 1,
    unit: 'set',
    daily: null,
    days: 7,
    note: '1 power bank, 1 battery radio per household',
  },
  'special-needs': {
    name: 'Special Needs',
    description: 'Baby formula, medical devices, etc.',
    target: 1,
    unit: 'week supply',
    daily: null,
    days: 7,
    note: '1 week supply per person as needed',
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
