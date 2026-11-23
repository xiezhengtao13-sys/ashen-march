import { GameApp } from './GameApp';
import './style.css';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) return;

  const app = new GameApp(canvas, uiRoot);
  await app.start();
}

void bootstrap();
