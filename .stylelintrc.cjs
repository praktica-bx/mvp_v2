module.exports = {
  plugins: ['stylelint-declaration-strict-values'],
  extends: ['stylelint-config-standard'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      [
        'color',
        'background',
        'background-color',
        'border-color',
        'outline-color',
        'fill',
        'stroke',
        'box-shadow'
      ],
      {
        message: 'Use CSS variables (var(--color-...)) for colors',
        // allow var(--color-...), transparent and currentColor
        allowedValues: ['/^var\\(--color-.*\\)$/', '/^transparent$/', '/^currentColor$/']
      }
    ]
  }
};
