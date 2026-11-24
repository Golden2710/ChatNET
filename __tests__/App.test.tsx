/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import TcpSocket from 'react-native-tcp-socket';
import App from '../App';

test('renders correctly and starts the TCP server', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(renderer!.toJSON()).toBeTruthy();
  expect(TcpSocket.createServer).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
