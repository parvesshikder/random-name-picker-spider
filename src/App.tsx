import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, X, User, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';

interface Person {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gender: 'male' | 'female';
  angle: number;
  legPhase: number;
}

interface Spider {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  // orientation and leg animation for cooler movement
  angle: number;
  legPhase: number;
}

type GamePhase = 'idle' | 'chase' | 'hunt' | 'paused' | 'gameover';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [spider, setSpider] = useState<Spider>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    legPhase: 0,
  });
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [nameInput, setNameInput] = useState('');
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male');
  const [caughtPerson, setCaughtPerson] = useState<Person | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [spiderSize, setSpiderSize] = useState(35);
  const [error, setError] = useState('');
  const gridSpacingRef = useRef(40);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const chaseStartTimeRef = useRef<number>(0);
  const chaseDurationRef = useRef<number>(4000);
  const huntStartTimeRef = useRef<number>(0);
  const targetPersonRef = useRef<Person | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isHoveringRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const peopleRef = useRef<Person[]>([]);
  const lastTargetChangeRef = useRef<number>(0); // for random switching

  // Keep people ref in sync
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  // Initialize canvas and spider position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const container = canvas.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        canvasSizeRef.current = { width: rect.width, height: rect.height };
        
        // Responsive grid spacing
        gridSpacingRef.current = Math.min(rect.width, rect.height) < 500 ? 25 : 35;
        
        // Responsive spider size
        const newSpiderSize = Math.min(rect.width, rect.height) < 500 ? 24 : 35;
        setSpiderSize(newSpiderSize);
        
        // Center spider
        setSpider(prev => ({
          ...prev,
          x: rect.width / 2,
          y: rect.height / 2,
          targetX: rect.width / 2,
          targetY: rect.height / 2,
        }));
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Play sound effect
  const playSound = useCallback((frequency: number, duration: number, type: OscillatorType = 'sine') => {
    if (isMuted) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.log('Audio not supported');
    }
  }, [isMuted]);

  // Play catch sound
  const playCatchSound = useCallback(() => {
    if (isMuted) return;
    playSound(800, 0.1, 'square');
    setTimeout(() => playSound(600, 0.15, 'square'), 100);
    setTimeout(() => playSound(400, 0.3, 'sawtooth'), 200);
  }, [isMuted, playSound]);

  // Play chase start sound
  const playChaseSound = useCallback(() => {
    if (isMuted) return;
    playSound(300, 0.1, 'sawtooth');
    setTimeout(() => playSound(400, 0.1, 'sawtooth'), 100);
    setTimeout(() => playSound(500, 0.2, 'sawtooth'), 200);
  }, [isMuted, playSound]);

  // Add person
  const addPerson = useCallback(() => {
    if (!nameInput.trim()) {
      setError('Please enter a name');
      return;
    }
    
    // Check for duplicate names
    const trimmedName = nameInput.trim();
    if (peopleRef.current.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError('This name already exists!');
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Spawn randomly all over canvas with padding
    const padding = 80;
    const newPerson: Person = {
      id: Math.random().toString(36).substr(2, 9),
      name: trimmedName,
      x: padding + Math.random() * (canvas.width - padding * 2),
      y: padding + Math.random() * (canvas.height - padding * 2),
      vx: (Math.random() - 0.5) * 1, // gentle start
      vy: (Math.random() - 0.5) * 1,
      gender: selectedGender,
      angle: 0,
      legPhase: Math.random() * Math.PI * 2,
    };

    setPeople(prev => [...prev, newPerson]);
    setNameInput('');
    setError('');
    playSound(600 + Math.random() * 200, 0.08, 'sine');
  }, [nameInput, selectedGender, playSound]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addPerson();
    }
  };

  // Start game
  const startGame = () => {
    if (people.length === 0) return;
    
    playChaseSound();
    setGamePhase('chase');
    chaseStartTimeRef.current = Date.now();
    
    // Set chase duration based on people count (longer so things don't feel too hectic)
    const chaseDuration = people.length >= 5 ? 12000 : 8000;
    chaseDurationRef.current = chaseDuration;
    
    // Pick random target
    targetPersonRef.current = people[Math.floor(Math.random() * people.length)];
  };

  // Pause game
  const pauseGame = () => {
    setGamePhase('paused');
  };

  // Resume game
  const resumeGame = () => {
    if (chaseStartTimeRef.current > 0) {
      setGamePhase('chase');
    } else {
      setGamePhase('hunt');
    }
  };

  // Reset game
  const resetGame = () => {
    setGamePhase('idle');
    setCaughtPerson(null);
    setPeople([]);
    setError('');
    targetPersonRef.current = null;
    chaseStartTimeRef.current = 0;
    huntStartTimeRef.current = 0;
    mousePosRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      setSpider(prev => ({
        ...prev,
        x: canvas.width / 2,
        y: canvas.height / 2,
        targetX: canvas.width / 2,
        targetY: canvas.height / 2,
        vx: 0,
        vy: 0,
        angle: 0,
        legPhase: 0,
      }));
    }
  };

  // Mouse handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };

    // only "activate" hover when the cursor is near the spider
    const dx = x - spider.x;
    const dy = y - spider.y;
    isHoveringRef.current = Math.hypot(dx, dy) < spiderSize * 3;
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    mousePosRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    mousePosRef.current = { x, y };

    const dx = x - spider.x;
    const dy = y - spider.y;
    isHoveringRef.current = Math.hypot(dx, dy) < spiderSize * 3;
  };

  const handleTouchEnd = () => {
    isHoveringRef.current = false;
    mousePosRef.current = null;
  };

  // Draw grid dots
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const spacing = gridSpacingRef.current;
    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
    
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Draw spider
  const drawSpider = (ctx: CanvasRenderingContext2D, spider: Spider, size: number) => {
    const legLength = size * 2;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    // legs connect to grid dots with three articulated segments
    const legSpacing = gridSpacingRef.current;
    const offsets = [-0.75, -0.55, -0.35, -0.15, 0.15, 0.35, 0.55, 0.75];
    offsets.forEach((rel, idx) => {
      const baseAngle = spider.angle + rel * Math.PI;
      const phase = spider.legPhase + idx * Math.PI * 0.5;
      const lift = Math.max(0, Math.sin(phase)) * 12;

      const baseRadius = size * 0.35;
      const baseX = spider.x + Math.cos(baseAngle) * baseRadius;
      const baseY = spider.y + Math.sin(baseAngle) * baseRadius;

      const rayX = spider.x + Math.cos(baseAngle) * legLength * 1.6;
      const rayY = spider.y + Math.sin(baseAngle) * legLength * 1.6;
      const gridX = Math.round(rayX / legSpacing) * legSpacing;
      const gridY = Math.round(rayY / legSpacing) * legSpacing;
      const footX = gridX;
      const footY = gridY - lift;

      // calculate intermediate joints using simple IK splitting leg into 3 equal lengths
      const dx = footX - baseX;
      const dy = footY - baseY;
      const fullDist = Math.hypot(dx, dy) || 1;
      const seg = fullDist / 3;
      const dirX = dx / fullDist;
      const dirY = dy / fullDist;
      // offset perpendicular for more natural bend
      const perpX = -dirY;
      const perpY = dirX;
      const bendAmt = Math.sin(phase) * 8;

      const joint1x = baseX + dirX * seg + perpX * bendAmt;
      const joint1y = baseY + dirY * seg + perpY * bendAmt;
      const joint2x = joint1x + dirX * seg + perpX * (bendAmt * 0.5);
      const joint2y = joint1y + dirY * seg + perpY * (bendAmt * 0.5);

      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(joint1x, joint1y);
      ctx.lineTo(joint2x, joint2y);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      ctx.fillStyle = '#3ea9f5';
      ctx.beginPath();
      ctx.arc(footX, footY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw aggressive angular body with spikes
    const bodyGradient = ctx.createRadialGradient(
      spider.x, spider.y, size * 0.1,
      spider.x, spider.y, size * 0.7
    );
    bodyGradient.addColorStop(0, '#555');
    bodyGradient.addColorStop(0.5, '#222');
    bodyGradient.addColorStop(1, '#000');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    // create a spiky polygon
    const spikes = 8;
    for (let k = 0; k < spikes; k++) {
      const ang = (k / spikes) * Math.PI * 2;
      const r = size * (k % 2 === 0 ? 0.65 : 0.8);
      const x = spider.x + Math.cos(ang) * r;
      const y = spider.y + Math.sin(ang) * r + size * 0.1;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // angular panel lines
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    for (let k = 0; k < spikes; k++) {
      const ang = (k / spikes) * Math.PI * 2;
      const r1 = size * 0.2;
      const r2 = size * 0.5;
      ctx.beginPath();
      ctx.moveTo(spider.x + Math.cos(ang) * r1, spider.y + Math.sin(ang) * r1 + size * 0.1);
      ctx.lineTo(spider.x + Math.cos(ang) * r2, spider.y + Math.sin(ang) * r2 + size * 0.1);
      ctx.stroke();
    }

    // rivet-like bolts at corners
    ctx.fillStyle = '#111';
    for (let k = 0; k < spikes; k++) {
      const ang = (k / spikes) * Math.PI * 2;
      const r = size * 0.6;
      const x = spider.x + Math.cos(ang) * r;
      const y = spider.y + Math.sin(ang) * r + size * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // glowing reactor core with mechanical ring
    const coreGradient = ctx.createRadialGradient(
      spider.x, spider.y + size * 0.1, 0,
      spider.x, spider.y + size * 0.1, size * 0.3
    );
    coreGradient.addColorStop(0, '#3ea9f5');
    coreGradient.addColorStop(0.5, '#0a84ff');
    coreGradient.addColorStop(1, 'rgba(10, 132, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(spider.x, spider.y + size * 0.1, size * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spider.x, spider.y + size * 0.1, size * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    // red hourglass retained as faceplate stripe
    ctx.fillStyle = '#e3342f';
    ctx.fillRect(spider.x - size * 0.1, spider.y - size * 0.05, size * 0.2, size * 0.3);
    
    // Draw spider head (glowing robotic eye cluster)
    const headGradient = ctx.createRadialGradient(
      spider.x, spider.y - size * 0.4, 0,
      spider.x, spider.y - size * 0.3, size * 0.4
    );
    headGradient.addColorStop(0, '#bbdefb');
    headGradient.addColorStop(1, '#64b5f6');
    
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.ellipse(spider.x, spider.y - size * 0.35, size * 0.3, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw eyes with glow
    const eyeGlow = ctx.createRadialGradient(
      spider.x - size * 0.1, spider.y - size * 0.5, 0,
      spider.x - size * 0.1, spider.y - size * 0.5, size * 0.2
    );
    eyeGlow.addColorStop(0, 'rgba(62, 169, 245, 0.9)');
    eyeGlow.addColorStop(1, 'rgba(62, 169, 245, 0)');
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.arc(spider.x - size * 0.1, spider.y - size * 0.5, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#3ea9f5';
    const eyePositions = [
      { x: -0.12, y: -0.5 },
      { x: 0.12, y: -0.5 },
      { x: -0.2, y: -0.4 },
      { x: 0.2, y: -0.4 },
    ];
    
    eyePositions.forEach(pos => {
      ctx.beginPath();
      ctx.arc(spider.x + pos.x * size, spider.y + pos.y * size, size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw fangs
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(spider.x - size * 0.08, spider.y - size * 0.55);
    ctx.lineTo(spider.x - size * 0.12, spider.y - size * 0.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(spider.x + size * 0.08, spider.y - size * 0.55);
    ctx.lineTo(spider.x + size * 0.12, spider.y - size * 0.75);
    ctx.stroke();
  };

  // Draw human figure
  const drawHuman = (ctx: CanvasRenderingContext2D, person: Person, isTarget: boolean) => {
    const size = 16;
    const headRadius = size * 0.35;
    
    // Highlight if target
    if (isTarget && (gamePhase === 'chase' || gamePhase === 'hunt')) {
      // Pulsing target indicator
      const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
      ctx.strokeStyle = `rgba(249, 115, 22, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(person.x, person.y, size * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Target arrow
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(person.x, person.y - size * 2.5);
      ctx.lineTo(person.x - 6, person.y - size * 3);
      ctx.lineTo(person.x + 6, person.y - size * 3);
      ctx.fill();
    }
    
    // Body color based on gender
    const bodyColor = person.gender === 'male' ? '#3b82f6' : '#ec4899';
    const darkBodyColor = person.gender === 'male' ? '#1d4ed8' : '#db2777';
    
    // Calculate leg positions based on running phase (simple alternating swing)
    const legSwing = Math.sin(person.legPhase) * 0.3;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(person.x, person.y + size * 1.4, size * 0.6, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw legs
    ctx.strokeStyle = darkBodyColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    // Left leg (single sweep)
    ctx.beginPath();
    ctx.moveTo(person.x, person.y + size * 0.2);
    ctx.lineTo(person.x - size * 0.3 + legSwing * size, person.y + size * 1);
    ctx.stroke();
    
    // Right leg (single sweep)
    ctx.beginPath();
    ctx.moveTo(person.x, person.y + size * 0.2);
    ctx.lineTo(person.x + size * 0.3 - legSwing * size, person.y + size * 1);
    ctx.stroke();
    
    // Draw arms
    const armSwing = Math.cos(person.legPhase) * 0.4;
    
    // Left arm
    ctx.beginPath();
    ctx.moveTo(person.x, person.y - size * 0.15);
    ctx.lineTo(person.x - size * 0.45 - armSwing * size, person.y + size * 0.15);
    ctx.stroke();
    
    // Right arm
    ctx.beginPath();
    ctx.moveTo(person.x, person.y - size * 0.15);
    ctx.lineTo(person.x + size * 0.45 + armSwing * size, person.y + size * 0.15);
    ctx.stroke();
    
    // Draw body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(person.x, person.y, size * 0.32, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Body highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(person.x - size * 0.1, person.y - size * 0.1, size * 0.15, size * 0.2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw head
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath();
    ctx.arc(person.x, person.y - size * 0.55, headRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw hair
    ctx.fillStyle = person.gender === 'male' ? '#451a03' : '#7c2d12';
    ctx.beginPath();
    if (person.gender === 'male') {
      ctx.arc(person.x, person.y - size * 0.65, headRadius * 0.9, Math.PI, 0);
    } else {
      ctx.arc(person.x, person.y - size * 0.6, headRadius, Math.PI * 1.2, -0.2);
      ctx.ellipse(person.x, person.y - size * 0.35, headRadius * 0.25, headRadius * 0.5, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    
    // Draw name label with background
    ctx.font = 'bold 10px sans-serif';
    const textWidth = ctx.measureText(person.name).width;
    
    // Label background (light for clarity)
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.roundRect(person.x - textWidth / 2 - 4, person.y + size * 1.4, textWidth + 8, 18, 4);
    ctx.fill();
    
    // Label text
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(person.name, person.x, person.y + size * 1.6);
  };

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // background fill now off-white for maximum contrast
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Draw grid with subtle grey
      drawGrid(ctx, canvas.width, canvas.height);
      
      // Update and draw people
      if (gamePhase !== 'paused') {
        setPeople(prevPeople => {
          return prevPeople.map(person => {
            let newX = person.x;
            let newY = person.y;
            let newVx = person.vx;
            let newVy = person.vy;
            
            // movement only occurs in chase/hunt
            if (gamePhase === 'chase' || gamePhase === 'hunt') {
              newX += newVx * 0.5; // slower overall
              newY += newVy * 0.5;
              
              const margin = 50;
              if (newX < margin || newX > canvas.width - margin) {
                newVx = -newVx;
                newX = Math.max(margin, Math.min(canvas.width - margin, newX));
              }
              if (newY < margin || newY > canvas.height - margin) {
                newVy = -newVy;
                newY = Math.max(margin, Math.min(canvas.height - margin, newY));
              }
              
              if (Math.random() < 0.03) {
                newVx += (Math.random() - 0.5) * 1;
                newVy += (Math.random() - 0.5) * 1;
                const speed = Math.sqrt(newVx * newVx + newVy * newVy);
                if (speed > 2) {
                  newVx = (newVx / speed) * 2;
                  newVy = (newVy / speed) * 2;
                }
              }
            }
            
            const angle = Math.atan2(newVy, newVx);
            
            // only advance legs when chasing/running
            const newLegPhase = (gamePhase === 'chase' || gamePhase === 'hunt')
              ? person.legPhase + 0.15
              : person.legPhase;
            
            return {
              ...person,
              x: newX,
              y: newY,
              vx: newVx,
              vy: newVy,
              angle,
              legPhase: newLegPhase,
            };
          });
        });
      }
      
      // Draw people
      people.forEach(person => {
        const isTarget = targetPersonRef.current?.id === person.id;
        drawHuman(ctx, person, isTarget);
      });
      
      // Update spider
      // during idle the spider still responds to cursor proximity
      if (gamePhase !== 'paused' && gamePhase !== 'gameover') {
        setSpider(prevSpider => {
          let targetX = prevSpider.targetX;
          let targetY = prevSpider.targetY;
          
          if (gamePhase === 'idle') {
            // always follow mouse/touch during idle
            if (mousePosRef.current) {
              targetX = mousePosRef.current.x;
              targetY = mousePosRef.current.y;
            }
          } else if (gamePhase === 'chase' || gamePhase === 'hunt') {
            // during chase choose a random person periodically
            if (people.length > 0) {
              const now = Date.now();
              if (
                !targetPersonRef.current ||
                now - lastTargetChangeRef.current > 1000 ||
                Math.random() < 0.02
              ) {
                const idx = Math.floor(Math.random() * people.length);
                targetPersonRef.current = people[idx];
                lastTargetChangeRef.current = now;
              }
              if (targetPersonRef.current) {
                targetX = targetPersonRef.current.x;
                targetY = targetPersonRef.current.y;
              }
            }

            if (gamePhase === 'chase') {
              const elapsed = Date.now() - chaseStartTimeRef.current;
              if (elapsed >= chaseDurationRef.current) {
                setGamePhase('hunt');
                huntStartTimeRef.current = Date.now();
              }
            }

            if (gamePhase === 'hunt' && targetPersonRef.current) {
              const dx = prevSpider.x - targetPersonRef.current.x;
              const dy = prevSpider.y - targetPersonRef.current.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < spiderSize * 0.7) {
                setCaughtPerson(targetPersonRef.current);
                setGamePhase('gameover');
                playCatchSound();
                targetPersonRef.current = null;
              }
            }
          }
          
          // Smooth movement towards target + orientation/legs animation
          const dx = targetX - prevSpider.x;
          const dy = targetY - prevSpider.y;
          const distance = Math.hypot(dx, dy);
          const speed = gamePhase === 'hunt' ? 0.05 : 0.025; // faster so movement is noticeable

          const newAngle = Math.atan2(dy, dx);
          const legPhase = prevSpider.legPhase + (distance * 0.1);

          return {
            ...prevSpider,
            x: prevSpider.x + dx * speed,
            y: prevSpider.y + dy * speed,
            targetX,
            targetY,
            angle: newAngle,
            legPhase,
          };
        });
      }
      
      // always draw spider so it can respond even before game starts
      drawSpider(ctx, spider, spiderSize);
      
      // Draw phase indicator
      if (gamePhase === 'chase') {
        const elapsed = Date.now() - chaseStartTimeRef.current;
        const remaining = Math.max(0, Math.ceil((chaseDurationRef.current - elapsed) / 1000));
        
        ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Chase Phase: ${remaining}s`, canvas.width / 2, 30);
        
        // Progress bar
        const progress = elapsed / chaseDurationRef.current;
        ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
        ctx.fillRect(canvas.width / 2 - 100, 40, 200, 6);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(canvas.width / 2 - 100, 40, 200 * (1 - progress), 6);
      } else if (gamePhase === 'hunt') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔴 HUNT MODE!', canvas.width / 2, 30);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [people, spider, gamePhase, spiderSize, playCatchSound]);

  return (
    <div className="min-h-screen h-[100dvh] bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 flex flex-col lg:flex-row overflow-hidden">
      {/* Canvas Area - Takes more space on mobile */}
      <div className="flex-1 p-2 lg:p-4 flex items-center justify-center h-full">
        <div className="relative w-full h-full bg-slate-950/70 rounded-xl lg:rounded-2xl overflow-hidden shadow-2xl border border-slate-800/50">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-full cursor-crosshair"
          />
          
          {/* Initial Spider Display */}
          {gamePhase === 'idle' && people.length === 0 && (
            <div className="absolute top-4 left-0 right-0 flex items-center justify-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                {/* instructions shown above spider's default center position */}
                <p className="text-slate-600 text-xs lg:text-sm font-medium">Add participants to start</p>
                <p className="text-slate-500 text-xs mt-1">Spider will follow your pointer</p>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      {/* Control Panel - Minimal on mobile */}
      <div className="w-full lg:w-72 xl:w-80 p-2 lg:p-4 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800/50 flex flex-col gap-2 lg:gap-4 max-h-[35vh] lg:max-h-screen overflow-auto">
        {/* Header */}
        <div className="text-center lg:text-left hidden lg:block">
          <h1 className="text-xl lg:text-2xl font-bold text-white">
            Random Name <span className="text-orange-500">Picker</span> Spider
          </h1>
          <p className="text-slate-400 text-xs">Who will the spider catch?</p>
        </div>

        {/* Mobile Header - Compact */}
        <div className="flex lg:hidden items-center justify-between">
          <h1 className="text-lg font-bold text-white">
            Random Name <span className="text-orange-500">Picker</span> Spider
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 bg-slate-800 rounded-lg text-slate-300"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>

        {/* Name Input with Gender Selection */}
        <div className="space-y-1 lg:space-y-2">
          <label className="text-slate-300 text-xs lg:text-sm font-medium hidden lg:block">Add Participant</label>
          <div className="flex gap-1 lg:gap-2">
            <Input
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setError('');
              }}
              onKeyPress={handleKeyPress}
              placeholder="Enter name..."
              className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 text-sm h-9 lg:h-10"
              disabled={gamePhase === 'gameover'}
            />
            {/* Gender Toggle */}
            <button
              onClick={() => setSelectedGender(selectedGender === 'male' ? 'female' : 'male')}
              className={`px-2 lg:px-3 rounded-lg transition-colors ${
                selectedGender === 'male' 
                  ? 'bg-blue-500/30 text-blue-400 border border-blue-500/50' 
                  : 'bg-pink-500/30 text-pink-400 border border-pink-500/50'
              }`}
            >
              {selectedGender === 'male' ? <User size={18} /> : <UserRound size={18} />}
            </button>
            <Button
              onClick={addPerson}
              disabled={!nameInput.trim() || gamePhase === 'gameover'}
              className="bg-orange-500 hover:bg-orange-600 text-white px-3 lg:px-4 h-9 lg:h-10"
            >
              <span className="hidden lg:inline">Add</span>
              <span className="lg:hidden">+</span>
            </Button>
          </div>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-xs"
            >
              {error}
            </motion.p>
          )}
        </div>

        {/* Participants List - Collapsible on mobile */}
        <div className="space-y-1 lg:space-y-2 flex-1 min-h-0">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 text-xs lg:text-sm font-medium">
              Participants <span className="text-orange-400">({people.length})</span>
            </label>
            {people.length > 0 && gamePhase === 'idle' && (
              <button
                onClick={() => setPeople([])}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-16 lg:max-h-32 overflow-y-auto space-y-1 pr-1">
            <AnimatePresence>
              {people.map((person) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center justify-between bg-slate-800/50 rounded-lg px-2 lg:px-3 py-1"
                >
                  <div className="flex items-center gap-1 lg:gap-2">
                    <span className="text-sm">{person.gender === 'male' ? '👤' : '👩'}</span>
                    <span className="text-slate-200 text-xs lg:text-sm truncate max-w-[80px] lg:max-w-[120px]">{person.name}</span>
                  </div>
                  {gamePhase === 'idle' && (
                    <button
                      onClick={() => setPeople(prev => prev.filter(p => p.id !== person.id))}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {people.length === 0 && (
              <div className="text-center py-2 text-slate-500 text-xs">
                No participants
              </div>
            )}
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-3 gap-1 lg:gap-2">
          <Button
            onClick={startGame}
            disabled={people.length === 0 || gamePhase === 'chase' || gamePhase === 'hunt' || gamePhase === 'gameover'}
            className="bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 text-xs lg:text-sm h-9 lg:h-10"
          >
            <Play size={14} className="mr-0 lg:mr-1" />
            <span className="hidden lg:inline">Start</span>
          </Button>
          <Button
            onClick={gamePhase === 'paused' ? resumeGame : pauseGame}
            disabled={gamePhase !== 'chase' && gamePhase !== 'hunt' && gamePhase !== 'paused'}
            className="bg-yellow-500 hover:bg-yellow-600 text-white disabled:opacity-50 text-xs lg:text-sm h-9 lg:h-10"
          >
            <Pause size={14} className="mr-0 lg:mr-1" />
            <span className="hidden lg:inline">{gamePhase === 'paused' ? 'Resume' : 'Pause'}</span>
          </Button>
          <Button
            onClick={resetGame}
            className="bg-red-500 hover:bg-red-600 text-white text-xs lg:text-sm h-9 lg:h-10"
          >
            <RotateCcw size={14} className="mr-0 lg:mr-1" />
            <span className="hidden lg:inline">Reset</span>
          </Button>
        </div>

        {/* Sound Toggle - Desktop only */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="hidden lg:flex items-center justify-center gap-2 py-2 px-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span className="text-sm">{isMuted ? 'Sound Off' : 'Sound On'}</span>
        </button>

        {/* Status - Compact */}
        <div className="text-center hidden lg:block">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            gamePhase === 'idle' ? 'bg-slate-800 text-slate-400' :
            gamePhase === 'chase' ? 'bg-orange-500/20 text-orange-400' :
            gamePhase === 'hunt' ? 'bg-red-500/20 text-red-400 animate-pulse' :
            gamePhase === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              gamePhase === 'idle' ? 'bg-slate-500' :
              gamePhase === 'chase' ? 'bg-orange-500 animate-pulse' :
              gamePhase === 'hunt' ? 'bg-red-500 animate-pulse' :
              gamePhase === 'paused' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            {gamePhase === 'idle' ? 'Ready' :
             gamePhase === 'chase' ? 'Chasing...' :
             gamePhase === 'hunt' ? 'HUNTING!' :
             gamePhase === 'paused' ? 'Paused' :
             'Game Over'}
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      <AnimatePresence>
        {gamePhase === 'gameover' && caughtPerson && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.5, y: 50, rotate: -10 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              exit={{ scale: 0.5, y: 50, rotate: 10 }}
              className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 lg:p-8 max-w-sm w-full text-center border border-slate-700 shadow-2xl"
            >
              <motion.div 
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="text-6xl lg:text-7xl mb-4"
              >
                🕷️
              </motion.div>
              <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">CAUGHT!</h2>
              <p className="text-slate-400 mb-4 text-sm">The spider has caught its prey...</p>
              
              <div className="bg-gradient-to-br from-slate-700/50 to-slate-600/50 rounded-xl p-4 mb-6 border border-slate-600">
                <div className="text-4xl lg:text-5xl mb-2">{caughtPerson.gender === 'male' ? '👤' : '👩'}</div>
                <div className="text-xl lg:text-2xl font-bold text-orange-400">{caughtPerson.name}</div>
              </div>
              
              <Button
                onClick={resetGame}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                <RotateCcw size={18} className="mr-2" />
                Play Again
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
