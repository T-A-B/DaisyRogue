import { Game } from './core/game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.update();
