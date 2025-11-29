import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Fruit, Particle, Point, Debris, FloatingText } from '../types';
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// --- Constants ---
const GRAVITY = 1500; 
const BASE_SPAWN_INTERVAL = 0.8; 
const MAX_LIVES = 3;
const TRAIL_LENGTH = 10; 
const FRUIT_LIFETIME_Y_OFFSET = 150;
const COMBO_WINDOW = 0.3; // Seconds to chain kills

// --- Audio System ---
class SoundManager {
  ctx: AudioContext | null = null;

  constructor() {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playStart() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.1);
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  playSlice(comboPitch = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // Pitch goes up with combo
    const baseFreq = 1200 + (comboPitch * 200);

    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playThrow() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.3);
    osc.type = 'triangle';
    
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playBomb() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}

interface MotionGameProps {
  onGameOver: (score: number, sliced: number, bombs: number) => void;
  gameState: GameState;
  setGameState: (state: GameState) => void;
}

const MotionGame: React.FC<MotionGameProps> = ({ onGameOver, gameState, setGameState }) => {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const soundManagerRef = useRef<SoundManager | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  // Game State Refs
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const slicedCountRef = useRef(0);
  const bombsHitRef = useRef(0);
  
  // Wave/Spawn Logic
  const timeSinceSpawnRef = useRef(0);
  const spawnTimerRef = useRef(BASE_SPAWN_INTERVAL);

  // Combo Logic
  const lastSliceTimeRef = useRef(0);
  const currentComboRef = useRef(0);
  
  // Entities
  const fruitsRef = useRef<Fruit[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const debrisRef = useRef<Debris[]>([]);
  const trailRef = useRef<Point[]>([]); 
  const textsRef = useRef<FloatingText[]>([]);
  
  // Visual Effects
  const shakeRef = useRef(0); 
  const flashRef = useRef(0); 
  const cursorRef = useRef<{x:number, y:number} | null>(null);
  
  // React State
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [waitingForHand, setWaitingForHand] = useState(false);
  
  // UI Sync State
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);

  // --- Initialization ---

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
          facingMode: 'user'
        }, 
        audio: false 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }

      // Handle stream cut (e.g. permission revoked or cable pulled)
      stream.getVideoTracks()[0].onended = () => {
        setCameraReady(false);
        setCameraError("Camera disconnected or permission revoked.");
      };

    } catch (err) {
      console.error("Error accessing webcam:", err);
      setCameraError("Camera access denied. Please enable permissions and reload.");
      setCameraReady(false);
    }
  };

  useEffect(() => {
    soundManagerRef.current = new SoundManager();

    const initVision = async () => {
      try {
        // Use jsDelivr for global accessibility (works in China)
        // This avoids using storage.googleapis.com which is blocked.
        const wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
        // Using a Github mirror or jsDelivr for the model file is safer than Google Storage for global access
        // However, standard MediaPipe implementation often fetches from Google. 
        // We will try to rely on the default resolved path but using the CDN loader helps.
        
        const vision = await FilesetResolver.forVisionTasks(wasmPath);
        
        // We load the model from a publicly accessible URL that supports CORS and isn't Google Storage if possible.
        // For simplicity in this demo, we use the Google URL but via the TaskVision API it might handle some caching.
        // Ideally, deploy 'hand_landmarker.task' to your own public/ folder.
        // Here we use the direct Google URL, if it fails, the user needs to proxy or download it.
        // To fix for China specifically without a proxy, one should host this file locally.
        // fallback: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        
        // Attempting to use a common mirror approach or direct
        const modelPath = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1 
        });
        setModelLoaded(true);
      } catch (err) {
        console.error("Failed to load MediaPipe:", err);
        setCameraError("Failed to load AI Vision Model. Check network connectivity.");
      }
    };

    initVision();
    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      handLandmarkerRef.current?.close();
    };
  }, []);

  // --- Game Mechanics ---

  const spawnFruit = (width: number, height: number, forceBomb = false, difficultyMultiplier = 1) => {
    soundManagerRef.current?.playThrow();

    // Scale bomb chance with difficulty (cap at 25%)
    const bombChance = Math.min(0.15 + (difficultyMultiplier - 1) * 0.05, 0.25);
    const isBomb = forceBomb || Math.random() < bombChance;
    
    // Spawn Logic
    const startY = height + 100;
    const startX = (width * 0.15) + Math.random() * (width * 0.7);
    
    const centerX = width / 2;
    const direction = startX < centerX ? 1 : -1;
    const targetX = centerX + (Math.random() * 200 * direction); 
    
    const peakHeight = height * (0.15 + Math.random() * 0.2);
    const displacementY = startY - peakHeight;
    
    // Slight speed increase with difficulty
    const gravity = GRAVITY * (1 + (difficultyMultiplier - 1) * 0.1);
    
    const vy = -Math.sqrt(2 * gravity * displacementY);
    const timeToPeak = -vy / gravity;
    const vx = (targetX - startX) / timeToPeak;

    let type: Fruit['type'] = 'apple';
    let color = '#d32f2f';
    let emoji = '🍎';
    let radius = 60;

    if (isBomb) {
      type = 'bomb';
      color = '#222';
      emoji = '💣';
      radius = 65;
    } else {
      const rand = Math.random();
      if (rand < 0.15) { type = 'banana'; color = '#fbc02d'; emoji = '🍌'; radius = 60; }
      else if (rand < 0.30) { type = 'orange'; color = '#f57c00'; emoji = '🍊'; radius = 60; }
      else if (rand < 0.45) { type = 'watermelon'; color = '#d32f2f'; emoji = '🍉'; radius = 75; }
      else if (rand < 0.60) { type = 'pineapple'; color = '#fbc02d'; emoji = '🍍'; radius = 70; }
      else if (rand < 0.75) { type = 'peach'; color = '#ff8a65'; emoji = '🍑'; radius = 60; }
      else if (rand < 0.90) { type = 'coconut'; color = '#eeeeee'; emoji = '🥥'; radius = 65; }
      else { type = 'grapes'; color = '#7b1fa2'; emoji = '🍇'; radius = 55; }
    }

    fruitsRef.current.push({
      id: Date.now() + Math.random(),
      x: startX, 
      y: startY, 
      vx, vy,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 4 * difficultyMultiplier, // Spin faster on higher diff
      type, radius, color, emoji, sliced: false
    });
  };

  const spawnWave = (width: number, height: number, difficulty: number) => {
      // Spawn 3-6 fruits at once
      const count = 3 + Math.floor(Math.random() * 3);
      for(let i=0; i<count; i++) {
          setTimeout(() => spawnFruit(width, height, false, difficulty), i * 100);
      }
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 400 + 100;
      particlesRef.current.push({
        id: Math.random(),
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: Math.random() * 8 + 4
      });
    }
  };

  const createFloatingText = (x: number, y: number, text: string, color: string, scale = 1.0) => {
      textsRef.current.push({
          id: Math.random(),
          x, y,
          text,
          life: 1.0,
          color,
          scale,
          vy: -100 // Float up
      });
  }

  const createDebris = (fruit: Fruit, cutAngle: number) => {
    const pushForce = 200; 
    const perpAngle = cutAngle - Math.PI / 2;

    debrisRef.current.push({
      id: Math.random(),
      x: fruit.x,
      y: fruit.y,
      vx: fruit.vx + Math.cos(perpAngle) * pushForce,
      vy: fruit.vy + Math.sin(perpAngle) * pushForce,
      rotation: fruit.rotation,
      rotationSpeed: -3,
      emoji: fruit.emoji,
      radius: fruit.radius,
      cutAngle: cutAngle,
      side: 'left',
      life: 1.0,
      opacity: 1
    });

    debrisRef.current.push({
      id: Math.random(),
      x: fruit.x,
      y: fruit.y,
      vx: fruit.vx + Math.cos(perpAngle + Math.PI) * pushForce,
      vy: fruit.vy + Math.sin(perpAngle + Math.PI) * pushForce,
      rotation: fruit.rotation,
      rotationSpeed: 3,
      emoji: fruit.emoji,
      radius: fruit.radius,
      cutAngle: cutAngle,
      side: 'right',
      life: 1.0,
      opacity: 1
    });
  };

  const resetGame = () => {
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    slicedCountRef.current = 0;
    bombsHitRef.current = 0;
    fruitsRef.current = [];
    particlesRef.current = [];
    debrisRef.current = [];
    trailRef.current = [];
    textsRef.current = [];
    shakeRef.current = 0;
    flashRef.current = 0;
    lastTimeRef.current = performance.now();
    timeSinceSpawnRef.current = 0;
    spawnTimerRef.current = BASE_SPAWN_INTERVAL;
    
    setScore(0);
    setLives(MAX_LIVES);
    setWaitingForHand(true); // Require hand to start
    
    soundManagerRef.current?.resume();
  };

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      resetGame();
    }
  }, [gameState]);


  // --- Main Game Loop ---

  const loop = useCallback(() => {
    requestRef.current = requestAnimationFrame(loop);

    const now = performance.now();
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); 
    lastTimeRef.current = now;

    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // -- Vision Processing --
    let handPoints: Point[] = [];
    if (cameraReady && modelLoaded && handLandmarkerRef.current) {
        const results = handLandmarkerRef.current.detectForVideo(videoRef.current, now);
        
        if (results.landmarks) {
            for (const landmarks of results.landmarks) {
                // Index finger tip (8)
                const indexTip = landmarks[8];
                if (indexTip) {
                    const x = (1 - indexTip.x) * width; // Mirror X
                    const y = indexTip.y * height;
                    handPoints.push({ x, y });
                }
            }
        }
    }

    // Update Cursor
    if (handPoints.length > 0) {
        cursorRef.current = { x: handPoints[0].x, y: handPoints[0].y };
    } else {
        cursorRef.current = null; 
    }

    // -- Screen Shake --
    let offsetX = 0;
    let offsetY = 0;
    if (shakeRef.current > 0) {
        const magnitude = shakeRef.current;
        offsetX = (Math.random() - 0.5) * magnitude;
        offsetY = (Math.random() - 0.5) * magnitude;
        shakeRef.current = Math.max(0, shakeRef.current - 60 * dt);
    }

    // 1. Clear
    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    ctx.translate(offsetX, offsetY);

    // 2. Draw Video (Mirrored)
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    if (videoRef.current && cameraReady) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
      // Vignette / Darken
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; 
      ctx.fillRect(0, 0, width, height);
      
      const grad = ctx.createRadialGradient(width/2, height/2, height/2, width/2, height/2, height);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();

    // 3. Draw Trail
    if (gameState === GameState.PLAYING && handPoints.length > 0) {
         const p = handPoints[0];
         trailRef.current.push({ x: p.x, y: p.y, life: TRAIL_LENGTH });
    }

    for (let i = trailRef.current.length - 1; i >= 0; i--) {
        trailRef.current[i].life! -= 60 * dt;
        if (trailRef.current[i].life! <= 0) trailRef.current.splice(i, 1);
    }

    if (trailRef.current.length > 1) {
        ctx.strokeStyle = '#00e5ff'; 
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00e5ff';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        const points = trailRef.current;
        if (points.length > 0) {
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                const p = points[i];
                const prev = points[i-1];
                const midX = (prev.x + p.x) / 2;
                const midY = (prev.y + p.y) / 2;
                ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
            }
            ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // 4. Game Logic
    if (gameState === GameState.PLAYING) {
      
      // -- RAISE HAND TO START LOGIC --
      if (waitingForHand) {
          if (handPoints.length > 0) {
              setWaitingForHand(false);
              soundManagerRef.current?.playStart();
          } else {
              // Draw "Waiting" Overlay
              ctx.save();
              ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
              ctx.fillRect(0, 0, width, height);
              
              ctx.shadowColor = "black";
              ctx.shadowBlur = 4;
              ctx.fillStyle = "white";
              ctx.font = "900 50px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("RAISE HAND TO START", width/2, height/2);
              
              ctx.font = "20px sans-serif";
              ctx.fillStyle = "#aaa";
              ctx.fillText("Show your index finger to the camera", width/2, height/2 + 60);
              ctx.restore();
              
              ctx.restore(); // Restore shake
              return; // Halt game update
          }
      }

      // -- DIFFICULTY SCALING --
      const difficulty = 1 + Math.min(scoreRef.current / 500, 2.0); // Caps at 3x difficulty (1 + 2)

      // Spawn Logic
      timeSinceSpawnRef.current += dt;
      if (timeSinceSpawnRef.current > spawnTimerRef.current) {
        // Chance for a wave
        if (Math.random() < 0.2) {
             spawnWave(width, height, difficulty);
             spawnTimerRef.current = (BASE_SPAWN_INTERVAL + 1.5) / difficulty; 
        } else {
             spawnFruit(width, height, false, difficulty);
             spawnTimerRef.current = BASE_SPAWN_INTERVAL / difficulty;
        }
        timeSinceSpawnRef.current = 0;
      }

      // Combo Timeout
      if (now / 1000 - lastSliceTimeRef.current > COMBO_WINDOW) {
          currentComboRef.current = 0;
      }

      // Calculate Cut Angle
      let cutAngle = 0;
      if (trailRef.current.length >= 3) {
          const pHead = trailRef.current[trailRef.current.length - 1];
          const pTail = trailRef.current[trailRef.current.length - 3];
          cutAngle = Math.atan2(pHead.y - pTail.y, pHead.x - pTail.x);
      }

      // Check Active Fruits
      for (let i = fruitsRef.current.length - 1; i >= 0; i--) {
        const fruit = fruitsRef.current[i];
        
        // Update physics
        fruit.x += fruit.vx * dt;
        fruit.y += fruit.vy * dt;
        fruit.vy += (GRAVITY * (1 + (difficulty - 1) * 0.1)) * dt; // Gravity increases with diff
        fruit.rotation += fruit.rotationSpeed * dt;

        if (fruit.y > height + FRUIT_LIFETIME_Y_OFFSET && fruit.vy > 0) {
            fruitsRef.current.splice(i, 1);
            continue;
        }

        if (!fruit.sliced) {
            const hitRadius = fruit.radius;
            let hit = false;
            
            // Check collision with recent trail
            const recentPoints = trailRef.current.slice(-4);
            for (const p of recentPoints) {
                const dx = p.x - fruit.x;
                const dy = p.y - fruit.y;
                if (dx * dx + dy * dy < hitRadius * hitRadius) {
                    hit = true;
                    break;
                }
            }

            if (hit) {
                if (fruit.type === 'bomb') {
                    soundManagerRef.current?.playBomb();
                    createExplosion(fruit.x, fruit.y, '#ffffff');
                    bombsHitRef.current++;
                    livesRef.current--;
                    currentComboRef.current = 0; 
                    shakeRef.current = 30; 
                    flashRef.current = 1.0; 
                    setLives(livesRef.current);
                    fruitsRef.current.splice(i, 1);
                    
                    if (livesRef.current <= 0) {
                        setGameState(GameState.GAME_OVER);
                        onGameOver(scoreRef.current, slicedCountRef.current, bombsHitRef.current);
                    }
                    continue;
                } else {
                    // SLICE!
                    fruit.sliced = true;
                    slicedCountRef.current++;
                    
                    // Combo Logic
                    lastSliceTimeRef.current = now / 1000;
                    currentComboRef.current++;
                    
                    let points = 10;
                    let text = "+10";
                    let textColor = "#fff";
                    let scale = 1.0;

                    if (currentComboRef.current > 1) {
                        points += currentComboRef.current * 5;
                        text = `${currentComboRef.current} COMBO!`;
                        textColor = "#ffeb3b"; // Yellow
                        scale = 1.0 + (currentComboRef.current * 0.1);
                    }

                    scoreRef.current += points;
                    setScore(scoreRef.current);
                    
                    soundManagerRef.current?.playSlice(currentComboRef.current);
                    createExplosion(fruit.x, fruit.y, fruit.color);
                    createDebris(fruit, cutAngle); 
                    createFloatingText(fruit.x, fruit.y - 50, text, textColor, scale);
                    
                    fruitsRef.current.splice(i, 1);
                    continue;
                }
            }
        }
      }

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += GRAVITY * 0.6 * dt;
        p.life -= 2.0 * dt;
        if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // Update Floating Texts
      for (let i = textsRef.current.length - 1; i >= 0; i--) {
          const t = textsRef.current[i];
          t.y += t.vy * dt;
          t.life -= 1.0 * dt;
          if (t.life <= 0) textsRef.current.splice(i, 1);
      }

      // Update Debris
      for (let i = debrisRef.current.length - 1; i >= 0; i--) {
        const d = debrisRef.current[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += GRAVITY * dt;
        d.rotation += d.rotationSpeed * dt;
        d.life -= 0.8 * dt;
        d.opacity = Math.max(0, d.life);
        if (d.y > height + 100 || d.life <= 0) debrisRef.current.splice(i, 1);
      }
    }

    // 5. Render Objects
    
    // Render Debris
    debrisRef.current.forEach(d => {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.cutAngle);
      ctx.rotate(d.rotation);
      ctx.globalAlpha = d.opacity;
      
      const fontSize = d.radius * 2;
      ctx.font = `${fontSize}px "Segoe UI Emoji", Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';

      ctx.beginPath();
      if (d.side === 'left') {
          ctx.rect(-d.radius*1.5, -d.radius*1.5, d.radius*3, d.radius*1.5);
      } else {
          ctx.rect(-d.radius*1.5, 0, d.radius*3, d.radius*1.5);
      }
      ctx.clip();
      ctx.rotate(-d.cutAngle);

      ctx.strokeText(d.emoji, 0, 0);
      ctx.fillText(d.emoji, 0, 0);
      ctx.restore();
    });

    // Render Fruits
    fruitsRef.current.forEach(fruit => {
      ctx.save();
      ctx.translate(fruit.x, fruit.y);
      ctx.rotate(fruit.rotation);
      
      const fontSize = fruit.radius * 2;
      ctx.font = `${fontSize}px "Segoe UI Emoji", Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Halo effect for visibility
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'white';
      ctx.lineJoin = 'round';
      ctx.strokeText(fruit.emoji, 0, 0);
      
      ctx.shadowBlur = 0; // Reset
      ctx.fillText(fruit.emoji, 0, 0);
      ctx.restore();
    });

    // Render Particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Render Floating Text
    textsRef.current.forEach(t => {
        ctx.save();
        ctx.translate(t.x, t.y);
        const scale = t.scale * (0.5 + 0.5 * (Math.sin(t.life * Math.PI))); // Pop in/out
        ctx.scale(scale, scale);
        
        ctx.font = "900 30px sans-serif";
        ctx.fillStyle = t.color;
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.textAlign = "center";
        
        ctx.strokeText(t.text, 0, 0);
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
    });

    // Render Cursor (Energy Ball)
    if (cursorRef.current && gameState === GameState.PLAYING && !waitingForHand) {
        const { x, y } = cursorRef.current;
        
        // Glow
        const gradient = ctx.createRadialGradient(x, y, 5, x, y, 20);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(0, 229, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 229, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore(); // Restore shake offset

    // 6. Flash Effect
    if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${flashRef.current})`;
        ctx.fillRect(0, 0, width, height);
        flashRef.current = Math.max(0, flashRef.current - 2.0 * dt);
    }

  }, [gameState, cameraReady, modelLoaded, onGameOver, setGameState, waitingForHand]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex justify-center items-center select-none">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      
      {/* Loading State */}
      {(!cameraReady || !modelLoaded) && !cameraError && (
        <div className="absolute z-50 text-white flex flex-col items-center gap-4">
          <div className="loader"></div>
          <p className="text-xl font-bold tracking-wider">SUMMONING SENSEI AI...</p>
        </div>
      )}

      {/* Camera Error State */}
      {cameraError && (
        <div className="absolute z-50 bg-gray-900/90 p-8 rounded-2xl border border-red-500 flex flex-col items-center text-center max-w-md">
           <div className="text-5xl mb-4">📷</div>
           <h2 className="text-2xl font-bold text-red-500 mb-2">Camera Connection Lost</h2>
           <p className="text-gray-300 mb-6">{cameraError}</p>
           <button 
             onClick={startCamera}
             className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
           >
             Retry Connection
           </button>
        </div>
      )}

      <canvas 
        ref={canvasRef} 
        width={window.innerWidth} 
        height={window.innerHeight} 
        className="absolute top-0 left-0 w-full h-full object-cover"
      />

      {gameState === GameState.PLAYING && !waitingForHand && (
        <div className="absolute top-4 left-4 right-4 flex justify-between text-white font-bold text-3xl z-10 pointer-events-none drop-shadow-md">
          <div className="flex gap-4 items-center">
            <span className="text-yellow-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">SCORE:</span>
            <span className="font-mono text-4xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{score}</span>
          </div>
          <div className="flex gap-2">
            {[...Array(MAX_LIVES)].map((_, i) => (
              <span key={i} className={`transform transition-all duration-300 drop-shadow-lg ${i < lives ? "opacity-100 scale-100" : "opacity-20 scale-75 grayscale"}`}>❤️</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MotionGame;