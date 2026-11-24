module.exports = {
  preset: 'react-native',
  // test/*.test.js are standalone node scripts (run with `npm run test:scripts`)
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/'],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
