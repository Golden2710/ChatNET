/**
 * @format
 */

// Must load first: crypto-js captures the secure RNG when it is first imported
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
