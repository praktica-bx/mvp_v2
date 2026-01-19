export default function AllergenCheckboxes({ value = [], onChange }) {
  const allergenOptions = [
    { label: 'Milk', value: 'milk' },
    { label: 'Gluten', value: 'gluten' },
    { label: 'Soya', value: 'soya' },
    { label: 'Nuts', value: 'nuts' },
    { label: 'None', value: 'none' },
  ]

  const handleToggle = (allergen) => {
    const newValue = value.includes(allergen)
      ? value.filter((a) => a !== allergen)
      : [...value, allergen]
    onChange(newValue)
  }

  return (
    <div className="form-group">
      <label>Allergens</label>
      <div className="checkbox-group">
        {allergenOptions.map((option) => (
          <label key={option.value} className="checkbox-label">
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={() => handleToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}
