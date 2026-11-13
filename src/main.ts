// Entry point: reads URL parameters and starts the game.
import { Game } from './game/Game';
import { parseParams } from './game/urlParams';
import { isWebGL2Available } from './render/Renderer';
import './ui/ui.css';

function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

function main(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app element');
  if (!isWebGL2Available()) {
    const message = document.createElement('div');
    message.className = 'fatal-message';
    message.textContent =
      'MarkusCraft needs WebGL2, which this browser or device does not provide. ' +
      'Please try a current version of Chrome, Edge or Firefox.';
    container.appendChild(message);
    return;
  }
  const game = new Game(container, parseParams(window.location.search, randomSeed));
  game.start();
}

main();
