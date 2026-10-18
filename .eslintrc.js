module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // The UI is styled inline throughout (see src/ui), by design
    'react-native/no-inline-styles': 'off',
  },
};
