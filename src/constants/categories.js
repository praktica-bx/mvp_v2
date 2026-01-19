export const SUPPLY_CATEGORIES = [
  { value: 'water', label: 'Water', dsbCategory: 'water' },
  { value: 'food', label: 'Food', dsbCategory: 'food' },
  { value: 'first-aid', label: 'First Aid & Medicine', dsbCategory: 'firstAid' },
  { value: 'light', label: 'Light & Lighting', dsbCategory: 'light' },
  { value: 'warmth', label: 'Heating & Warmth', dsbCategory: 'warmth' },
  { value: 'sanitation', label: 'Sanitation & Hygiene', dsbCategory: 'hygiene' },
  { value: 'documents', label: 'Documents & Money', dsbCategory: 'documents' },
  { value: 'communication', label: 'Communication', dsbCategory: 'light' },
  { value: 'tools', label: 'Tools & Equipment', dsbCategory: 'tools' },
  { value: 'special-needs', label: 'Special Needs', dsbCategory: 'medications' },
]

// Map categories to quantity multipliers for DSB baseline calculations
export const CATEGORY_QUANTITY_MAP = {
  water: 1, // liters
  food: 1, // kcal (or pcs for simplicity)
  'first-aid': 1, // count as 1 medication item
  light: 1, // count per item
  warmth: 1, // count per item
  sanitation: 1, // count per item
  documents: 1, // count per item
  communication: 1, // count per item
  tools: 1, // count per item
  'special-needs': 1, // count per item
}

export const getCategoryLabel = (value) => {
  const category = SUPPLY_CATEGORIES.find((cat) => cat.value === value)
  return category ? category.label : value
}

export const getDsbCategory = (value) => {
  const category = SUPPLY_CATEGORIES.find((cat) => cat.value === value)
  return category ? category.dsbCategory : null
}
