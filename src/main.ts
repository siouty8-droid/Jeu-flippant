import "./style.css";
import { Game } from "./Game";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLDivElement;
const game = new Game(canvas, ui);

// Accès console pour le debug : window.rayon9.clock.set(150), etc.
(window as unknown as { rayon9: Game }).rayon9 = game;
