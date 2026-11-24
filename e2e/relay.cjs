// Sits on the "network" between the two emulators and records every byte they send.
const fs = require('node:fs');
const net = require('node:net');

const capture = fs.createWriteStream(process.argv[2]);

net
  .createServer(client => {
    const device = net.createConnection(18888, '127.0.0.1');
    client.on('data', data => {
      capture.write(data);
      device.write(data);
    });
    device.on('data', data => client.write(data));
    client.on('end', () => device.end());
    device.on('end', () => client.end());
    client.on('error', () => device.destroy());
    device.on('error', () => client.destroy());
  })
  .listen(8888, '127.0.0.1');
