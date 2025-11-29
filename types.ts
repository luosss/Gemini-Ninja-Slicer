
export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export interface Point {
  x: number;
  y: number;
  life?: number; // For trail effect
}

export interface Fruit {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  type: 'apple' | 'banana' | 'orange' | 'watermelon' | 'pineapple' | 'peach' | 'coconut' | 'grapes' | 'bomb';
  radius: number;
  sliced: boolean;
  color: string;
  emoji: string;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Debris {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  emoji: string;
  radius: number;
  cutAngle: number; // The angle at which the fruit was sliced
  side: 'left' | 'right';
  life: number;
  opacity: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  scale: number;
  vy: number;
}

export interface SenseiFeedback {
  rank: string;
  message: string;
}
