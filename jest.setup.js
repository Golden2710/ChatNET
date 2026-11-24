/* eslint-env jest */

// Native modules are not available under Jest – replace them with mocks.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: props => React.createElement(View, props),
  };
});

jest.mock('react-native-tcp-socket', () => {
  const makeSocket = () => ({
    on: jest.fn(),
    write: jest.fn(),
    destroy: jest.fn(),
  });
  const server = {
    listen: jest.fn((_opts, cb) => cb && cb()),
    on: jest.fn(),
    close: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      createServer: jest.fn(() => server),
      createConnection: jest.fn(() => makeSocket()),
    },
  };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));
