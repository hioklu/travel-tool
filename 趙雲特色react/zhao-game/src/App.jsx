import React, { useState, useEffect, useRef } from 'react';
import { Play, Zap, Heart, Sword, Trophy, Droplet, Lock, LockOpen, ChevronRight, RotateCcw, Skull, Frown } from 'lucide-react';

// --- Constants ---
const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const PLAYER_X = 250; 
const GROUND_Y = 440;
// Control bar height estimate (padding + text size)
const CONTROLS_HEIGHT = 70; 
const TOTAL_HEIGHT = GAME_HEIGHT + CONTROLS_HEIGHT;

// Colors
const C_BG = "#1a202c";
const C_GROUND = "#2d3748";
const C_STAMINA = "#ef4444"; 
const C_SOUL = "#3b82f6";     
const C_ENEMY = "#e53e3e";
const C_GOLD = "#ecc94b";
const C_PROGRESS = "#14b8a6";

const PRIZES = [5, 10, 50, 100, 250, 500, 800, 1000, 3000, 5000, 10000];

// Initial State Constant
const INITIAL_DEMO_STATE = { 
    status: 'menu', // menu, playing, result
    type: 'success', 
    startTime: 0,
    resultPhase: 'init', // init, unlock, stats, spinning, done
    resultDrawn: [] 
};

// --- Helper Classes for Visuals ---
class VisualEntity {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // 'soldier', 'wine', 'peach'
    this.markedForDeletion = false;
    this.animOffset = Math.random() * 10;
    this.targetX = null; 
  }
  
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const floatY = Math.sin((Date.now() / 200) + this.animOffset) * 2;
    
    if (this.type === 'soldier') {
        ctx.scale(4, 4); 
        ctx.translate(0, floatY * 0.25);
        ctx.fillStyle = C_ENEMY;
        ctx.beginPath(); ctx.arc(0, -15, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = C_ENEMY; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(0, 10);
        ctx.lineTo(-5, 20); ctx.moveTo(0, 10); ctx.lineTo(5, 20);
        ctx.moveTo(0, -5); ctx.lineTo(-8, 5); ctx.moveTo(0, -5); ctx.lineTo(8, 0);
        ctx.stroke();
        ctx.strokeStyle = "#cbd5e0"; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-10, 5); ctx.stroke();
    } else if (this.type === 'peach') {
        // Peach = Stamina
        ctx.scale(2, 2); 
        ctx.translate(0, floatY * 0.5);
        ctx.font = "30px sans-serif";
        ctx.fillText("🍑", -15, 5);
        ctx.shadowColor = "#f6ad55"; ctx.shadowBlur = 10; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    } else if (this.type === 'wine') {
        // Wine = Soul
        ctx.scale(2, 2);
        ctx.translate(0, floatY * 0.5);
        ctx.font = "30px sans-serif";
        ctx.fillText("🍶", -15, 5);
        ctx.shadowColor = "#3b82f6"; ctx.shadowBlur = 10;
    }
    ctx.restore();
  }
}

class VisualParticle {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 1.0;
  }
  update() {
    this.y -= 1;
    this.life -= 0.01;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1.0;
  }
}

export default function App() {
  const [slideIndex, setSlideIndex] = useState(0); 
  
  // Slide 8 State
  const [unlockPhase, setUnlockPhase] = useState('init'); 
  // Slide 9 State
  const [spinStage, setSpinStage] = useState('idle'); 
  const [activeIndex, setActiveIndex] = useState(-1);
  const [drawnPrizes, setDrawnPrizes] = useState([]); 
  // Refs to store pre-determined winners to prevent duplicates
  const spinWinnersRef = useRef([]); 
  const spinTimeoutRef = useRef(null);

  // Slide 10 (Full Demo) State
  const [demoState, setDemoState] = useState(INITIAL_DEMO_STATE); 
  const demoWinnersRef = useRef([]);

  const canvasRef = useRef(null);

  // --- Responsive Scaling State ---
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);
  
  // Simulation State
  const simStateRef = useRef({
    entities: [],
    particles: [],
    stamina: 100,
    soul: 0,
    kills: 0,
    isSlashing: false,
    slashTimer: 0,
    distance: 0,
    killAnimStart: 0,
    ultKillAnimStart: 0,
    retreatX: 0, // NEW: For retreat animation
    // New: Custom Kill Animation State
    killAnim: {
        active: false,
        startVal: 0,
        endVal: 0,
        startTime: 0
    }
  });

  // --- Scaling Logic ---
  useEffect(() => {
    const handleResize = () => {
        // Calculate scale to fit window while maintaining aspect ratio
        // We add some padding (e.g., 20px on sides) so it doesn't touch edges exactly
        const padding = 20;
        const availableWidth = window.innerWidth - padding;
        const availableHeight = window.innerHeight - padding;
        
        const scaleX = availableWidth / GAME_WIDTH;
        const scaleY = availableHeight / TOTAL_HEIGHT;
        
        // Choose the smaller scale to ensure it fits entirely
        const newScale = Math.min(scaleX, scaleY, 1); // 1 means max scale is 100% (prevent upscaling blur if desired, remove ,1 to allow upscale)
        // Actually, for this pixel/vector art style, upscaling is usually fine. Let's allow it but cap reasonable max.
        // Let's just use min(scaleX, scaleY) to always fit.
        setScale(Math.min(scaleX, scaleY));
    };

    handleResize(); // Initial calc
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const nextSlide = () => setSlideIndex(p => Math.min(10, p + 1));
  const prevSlide = () => setSlideIndex(p => Math.max(0, p - 1));
  const gotoSlide = (i) => setSlideIndex(i);

  const getSlideDescription = (index) => {
    switch(index) {
        case 2: return "介面概覽：2D卷軸、起點終點、狀態欄";
        case 3: return "敵軍來襲：敵軍從右方湧入包圍 (循環演示)";
        case 4: return "想像成割草遊戲，揮砍：扣體力、有機會加龍魂 (循環演示)";
        case 5: return "計算擊殺數";
        case 6: return "特殊掉落：🍶 喝酒，獲得龍魂";
        case 7: return "龍魂：累積滿可開大招";
        case 8: return "挑戰成功(1/2)：獎勵解鎖、結算";
        case 9: return "挑戰成功(2/2)：演示二連抽，抽過不放回";
        case 10: return "流程演示";
        default: return "";
    }
  };

  // --- Logic for Slide 8 ---
  useEffect(() => {
    if (slideIndex === 8) {
        setUnlockPhase('init');
        const t1 = setTimeout(() => setUnlockPhase('unlocking'), 1000);
        const t2 = setTimeout(() => setUnlockPhase('stats'), 2500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [slideIndex]);

  // --- Logic for Slide 9 (Page 10) ---
  useEffect(() => {
    if (slideIndex === 9) {
        setSpinStage('idle'); setActiveIndex(-1); setDrawnPrizes([]); clearTimeout(spinTimeoutRef.current);
        
        // Pre-calculate 2 UNIQUE winners for this session
        const p1 = Math.floor(Math.random() * PRIZES.length);
        let p2 = Math.floor(Math.random() * PRIZES.length);
        while (p2 === p1) {
            p2 = Math.floor(Math.random() * PRIZES.length);
        }
        spinWinnersRef.current = [p1, p2];

        const tStart = setTimeout(() => { startDoubleSpinSequence(); }, 500);
        return () => { clearTimeout(tStart); clearTimeout(spinTimeoutRef.current); };
    }
  }, [slideIndex]);

  // --- Logic for Slide 10 (Full Demo) ---
  useEffect(() => {
    if (slideIndex === 10) {
        setDemoState(INITIAL_DEMO_STATE);
    }
  }, [slideIndex]);

  // Cleanup timeout when leaving result status
  useEffect(() => {
      if (demoState.status !== 'result') {
          clearTimeout(spinTimeoutRef.current);
      }
  }, [demoState.status]);

  // Triggered when entering result phase in demo
  useEffect(() => {
      if (slideIndex === 10 && demoState.status === 'result') {
          setDemoState(prev => ({...prev, resultPhase: 'init', resultDrawn: []}));
          setActiveIndex(-1);

          const unlockTime = 1000;
          setTimeout(() => {
              setDemoState(prev => ({...prev, resultPhase: 'unlock'}));
          }, unlockTime);

          const statsTime = 2500;
          setTimeout(() => {
              setDemoState(prev => ({...prev, resultPhase: 'stats'}));
          }, statsTime);

          const spinTime = 4500;
          setTimeout(() => {
              setDemoState(prev => ({...prev, resultPhase: 'spinning'}));
              startDemoSpin(demoState.type);
          }, spinTime);
      }
  }, [slideIndex, demoState.status]);

  const startDemo = (type) => {
      // Pre-calculate demo winners
      const count = type === 'success' ? 2 : 1;
      let validIndices = [];
      PRIZES.forEach((p, i) => {
          if (type === 'failure' && (p === 5000 || p === 10000)) return;
          validIndices.push(i);
      });
      
      const winners = [];
      for(let i=0; i<count; i++) {
          if (validIndices.length === 0) break;
          const r = Math.floor(Math.random() * validIndices.length);
          winners.push(validIndices[r]);
          validIndices.splice(r, 1); // Remove used index to ensure uniqueness
      }
      demoWinnersRef.current = winners;

      setDemoState({ 
          status: 'playing', 
          type, 
          startTime: Date.now(), 
          resultPhase: 'init',
          resultDrawn: []
      });
  };

  const startDoubleSpinSequence = () => { runSingleSpin(1); };

  const runSingleSpin = (roundNum) => {
      setSpinStage(roundNum === 1 ? 'spinning1' : 'spinning2');
      
      const invalidIndices = roundNum === 2 ? [spinWinnersRef.current[0]] : [];
      let current = 0; 
      // Ensure start is not on drawn prize
      while(invalidIndices.includes(current)) {
          current++;
          if (current >= PRIZES.length) current = 0;
      }

      let speed = 50; let rounds = 0;
      const targetRounds = 2; 
      const stopIndex = spinWinnersRef.current[roundNum - 1];

      const run = () => {
          setActiveIndex(current);
          let next = current + 1;
          if (next >= PRIZES.length) { next = 0; rounds++; }

          // SKIP LOGIC: If next is already drawn, skip it
          if (invalidIndices.includes(next)) {
              next++;
              if (next >= PRIZES.length) { next = 0; rounds++; }
          }

          if (rounds >= targetRounds && current === stopIndex) {
              setDrawnPrizes(prev => [...prev, stopIndex]);
              if (roundNum === 1) {
                  setSpinStage('result1');
                  spinTimeoutRef.current = setTimeout(() => { runSingleSpin(2); }, 1500);
              } else {
                  setSpinStage('result2');
                  spinTimeoutRef.current = setTimeout(() => { setSpinStage('final'); }, 1000);
              }
          } else {
              if (rounds >= targetRounds - 1) speed += 20;
              current = next;
              spinTimeoutRef.current = setTimeout(run, speed);
          }
      };
      run();
  };

  const startDemoSpin = (type) => {
      const totalSpins = type === 'success' ? 2 : 1;
      runDemoSpinRound(1, totalSpins, type);
  };

  const runDemoSpinRound = (currentRound, totalRounds, type) => {
      const drawnIndices = demoWinnersRef.current.slice(0, currentRound - 1);
      
      let current = 0; 
      
      // Basic next helper that respects skips
      const getNext = (curr) => {
          let n = curr + 1;
          if (n >= PRIZES.length) n = 0;
          
          // Skip logic 1: Already drawn (Standard)
          while (drawnIndices.includes(n)) {
              n++;
              if (n >= PRIZES.length) n = 0;
          }
          
          // Skip logic 2: Locked prizes in Failure mode
          // 5000X is at index 9, 10000X is at index 10
          if (type === 'failure') {
             while (PRIZES[n] === 5000 || PRIZES[n] === 10000 || drawnIndices.includes(n)) {
                 n++;
                 if (n >= PRIZES.length) n = 0;
             }
          }
          return n;
      };

      // Ensure start is valid
      if (drawnIndices.includes(current) || (type === 'failure' && (PRIZES[current] === 5000 || PRIZES[current] === 10000))) {
          current = getNext(current);
      }

      let speed = 50; let rounds = 0;
      const targetRounds = 2; 
      const stopIndex = demoWinnersRef.current[currentRound - 1];

      const run = () => {
          setActiveIndex(current);
          let next = getNext(current);
          
          if (next <= current) { rounds++; } // Wrapped around

          if (rounds >= targetRounds && current === stopIndex) {
              setDemoState(prev => {
                  const safeDrawn = prev.resultDrawn || [];
                  return {...prev, resultDrawn: [...safeDrawn, stopIndex]};
              });
              
              if (currentRound < totalRounds) {
                  spinTimeoutRef.current = setTimeout(() => {
                      runDemoSpinRound(currentRound + 1, totalRounds, type);
                  }, 1500);
              } else {
                  spinTimeoutRef.current = setTimeout(() => {
                      setDemoState(prev => ({...prev, resultPhase: 'done'}));
                  }, 1000);
              }
          } else {
              if (rounds >= targetRounds - 1) speed += 20;
              current = next;
              spinTimeoutRef.current = setTimeout(run, speed);
          }
      };
      run();
  };


  // --- Canvas Simulation Logic ---
  useEffect(() => {
    const state = simStateRef.current;
    state.particles = []; state.entities = []; state.isSlashing = false;
    state.killAnim = { active: false, startVal: 0, endVal: 0, startTime: 0 };
    state.retreatX = 0;
    let loopInterval; let moveInterval;

    const SOLDIER_SPAWN_Y = GROUND_Y - 80; 

    // Logic for specific slides
    switch(slideIndex) {
        case 2: state.stamina=100; state.soul=0; state.kills=0; state.distance=0; break;
        case 3: // Slide 4: Enemies enter from right
            state.stamina=100; state.soul=0; state.distance=10;
            const spawnWave = () => {
                state.entities = []; 
                for(let i=0; i<15; i++) {
                    const ent = new VisualEntity(GAME_WIDTH + Math.random() * 400, SOLDIER_SPAWN_Y-Math.random()*50, 'soldier');
                    ent.targetX = (GAME_WIDTH / 2) + Math.random() * 200; 
                    state.entities.push(ent);
                }
            };
            spawnWave(); 
            loopInterval = setInterval(spawnWave, 3500);
            break;
        case 4: // Attack
            state.distance=20;
            const runAttack = () => {
                state.entities = [];
                for(let i=0; i<3; i++) {
                    state.entities.push(new VisualEntity(PLAYER_X + 150 + (i * 60), SOLDIER_SPAWN_Y, 'soldier'));
                }
                state.stamina=100; state.soul=0; state.kills=0;
                setTimeout(()=> { 
                    state.isSlashing=true; state.slashTimer=20; 
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF")); 
                }, 500);
                setTimeout(()=> { 
                    state.entities=[]; 
                    state.particles.push(new VisualParticle(PLAYER_X-60, GROUND_Y-280, "-15 體力", C_STAMINA)); 
                    state.particles.push(new VisualParticle(PLAYER_X+60, GROUND_Y-320, "+30 龍魂", C_SOUL)); 
                }, 800);
                setTimeout(()=> { state.stamina=85; state.soul=30; }, 1000);
            };
            runAttack(); loopInterval=setInterval(runAttack, 2000);
            break;
        case 5: // Kill Count
            state.stamina=70; state.soul=50; state.kills=0; state.distance=30;
            const runKillAnim = () => { state.killAnimStart = Date.now(); };
            runKillAnim(); loopInterval = setInterval(runKillAnim, 3500);
            break;
        case 6: // Wine Drop (Fills Soul)
            state.stamina=60; state.distance=50; state.kills=216;
            const runWine = () => {
                state.soul=30; 
                state.entities=[new VisualEntity(660, GROUND_Y-80, 'wine')]; 
                state.particles=[];
                if(moveInterval) clearInterval(moveInterval);
                moveInterval = setInterval(()=> {
                    if(state.entities.length>0 && state.entities[0].type==='wine'){
                        state.entities[0].x-=4;
                        if(state.entities[0].x<=PLAYER_X+60){ 
                            state.entities=[]; state.soul=100; 
                            state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-120, "+70 龍魂", C_SOUL));
                            state.particles.push(new VisualParticle(PLAYER_X+20, GROUND_Y-150, "龍魂全滿!", "#FFF"));
                            clearInterval(moveInterval);
                        }
                    }
                }, 16);
            };
            runWine(); loopInterval=setInterval(runWine, 3000);
            break;
        case 7: // Ultimate
            state.stamina=40; state.soul=100; state.distance=80; state.kills=216;
            const runUlt = () => {
                state.entities=[]; state.soul=100; state.stamina=40; state.kills=216; 
                state.killAnim = { active: false, startVal:0, endVal:0, startTime:0 };

                // 0.0s: Spawn rushing enemies
                for(let i=0; i<40; i++) {
                    const ent = new VisualEntity(GAME_WIDTH + Math.random() * 400, SOLDIER_SPAWN_Y-Math.random()*80, 'soldier');
                    // 0.0s-2.5s: Target around player to crowd
                    ent.targetX = PLAYER_X + 50 + Math.random() * 150; 
                    state.entities.push(ent);
                }
                
                // 2.5s: Release Ult
                setTimeout(()=> { 
                    state.isSlashing=true; state.slashTimer=20; state.soul=0; state.stamina-=3; 
                    state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-100, "龍魂釋放!", "#FFF")); 
                }, 2500); 

                // 2.8s: Wipe Out & Kill Anim
                setTimeout(()=> { 
                    state.particles.push(new VisualParticle(400, 200, "全屏秒殺!", C_GOLD)); 
                    state.entities=[]; 
                    state.killAnim = {
                        active: true,
                        startVal: 216,
                        endVal: 528,
                        startTime: Date.now()
                    };
                }, 2800);
            };
            runUlt(); loopInterval=setInterval(runUlt, 7000); 
            break;
        
        case 10: 
            state.stamina=100; state.soul=0; state.distance=0; state.kills=0;
            break;

        default: break;
    }
    return () => { clearInterval(loopInterval); if(moveInterval) clearInterval(moveInterval); };
  }, [slideIndex]);

  // --- Canvas Loop ---
  useEffect(() => {
    if (slideIndex < 2 && slideIndex !== 10) return;
    if (slideIndex > 7 && slideIndex !== 10) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    let frameId;
    const SOLDIER_SPAWN_Y = GROUND_Y - 80;

    const loop = () => {
        const state = simStateRef.current;
        
        // --- Full Demo Logic (Slide 10) ---
        if (slideIndex === 10 && demoState.status === 'playing') {
            const elapsed = Date.now() - demoState.startTime;
            
            // Helper to spawn rushing enemies
            const spawnRush = (count) => {
                for(let i=0; i<count; i++) {
                    const ent = new VisualEntity(GAME_WIDTH + Math.random()*300, SOLDIER_SPAWN_Y-Math.random()*50, 'soldier');
                    ent.targetX = (GAME_WIDTH/2) - 100 + Math.random()*200;
                    state.entities.push(ent);
                }
            };
            
            // Helper to trigger kill count animation
            const triggerKillAnim = (start, end) => {
                state.killAnim = {
                    active: true,
                    startVal: start,
                    endVal: end,
                    startTime: Date.now()
                };
            };

            // Common Move Logic
            state.entities.forEach(e => {
                if (e.targetX !== null && e.x > e.targetX) e.x -= 12; // Rush speed
                else if (e.type === 'peach' || e.type === 'wine' || e.type === 'water') e.x -= 4; // Item speed
            });

            if (demoState.type === 'success') {
                // ... (Keep existing Success Script) ...
                if (elapsed < 100) { 
                    state.stamina = 100; state.soul = 0; state.kills = 0; state.distance = 0; state.entities = []; 
                    state.killAnim = { active: false, startVal:0, endVal:0, startTime:0 }; state.retreatX = 0;
                }
                // Stage 1
                if (elapsed > 500 && elapsed < 600 && state.entities.length === 0) spawnRush(3);
                if (elapsed > 1500 && elapsed < 1600 && state.entities.length > 0) {
                    state.entities = []; state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 95; triggerKillAnim(0, 50);
                }
                // Stage 2
                if (elapsed > 4500 && elapsed < 4600) state.entities.push(new VisualEntity(PLAYER_X + 250, GROUND_Y-80, 'wine'));
                if (elapsed > 5500 && elapsed < 5600 && state.entities.length > 0) {
                    state.entities = []; state.soul = 100; state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-120, "龍魂全滿!", "#FFF"));
                }
                if (elapsed > 5500 && elapsed < 7000) state.distance = ((elapsed - 5500) / 1500) * 30;
                else if (elapsed >= 7000 && elapsed < 11000) state.distance = 30;
                // Stage 3
                if (elapsed > 7500 && elapsed < 7600) spawnRush(20);
                if (elapsed > 8500 && elapsed < 8600 && state.entities.length > 0) {
                      state.isSlashing = true; state.slashTimer = 30; state.soul = 0;
                      state.particles.push(new VisualParticle(400, 200, "全屏秒殺!", C_GOLD));
                      state.entities = []; triggerKillAnim(50, 300);
                }
                if (elapsed > 11000 && elapsed < 12500) state.distance = 30 + ((elapsed - 11000) / 1500) * 30;
                else if (elapsed >= 12500 && elapsed < 16500) state.distance = 60;
                // Stage 4
                if (elapsed > 13000 && elapsed < 13100) spawnRush(3);
                if (elapsed > 14000 && elapsed < 14100 && state.entities.length > 0) {
                    state.entities = []; state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 30; state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-280, "-30 體力", C_STAMINA));
                    triggerKillAnim(300, 350);
                }
                if (elapsed > 14500 && elapsed < 14600) state.entities.push(new VisualEntity(PLAYER_X + 250, GROUND_Y-80, 'peach'));
                if (elapsed > 15500 && elapsed < 15600 && state.entities.length > 0) {
                    state.entities = []; state.stamina = 100; state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-120, "體力恢復!", "#3b82f6"));
                }
                if (elapsed > 16500 && elapsed < 18000) state.distance = 60 + ((elapsed - 16500) / 1500) * 30;
                else if (elapsed >= 18000 && elapsed < 22000) state.distance = 90;
                // Stage 5
                if (elapsed > 18500 && elapsed < 18600) spawnRush(3);
                if (elapsed > 19500 && elapsed < 19600 && state.entities.length > 0) {
                    state.entities = []; state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 95; triggerKillAnim(350, 528);
                }
                if (elapsed > 22000 && elapsed < 23500) state.distance = 90 + ((elapsed - 22000) / 1500) * 10;
                else if (elapsed >= 23500) state.distance = 100;
                if (elapsed > 24000) setDemoState({ ...demoState, status: 'result' });

            } else {
                // --- Failure Scenario Script ---
                // Timeline: Total ~15s
                // Stage 1: 0-5s (Rush -> Kill -> Move)
                // Stage 2: 5-10s (Rush -> Kill -> Move)
                // Stage 3: 10-15s (Rush -> Die -> Retreat)
                
                if (elapsed < 100) { 
                    state.stamina = 100; state.soul = 0; state.kills = 0; state.distance = 0; state.entities = []; 
                    state.killAnim = { active: false, startVal:0, endVal:0, startTime:0 }; state.retreatX = 0;
                }

                // --- STAGE 1: Rush -> Slash (-40) -> Kill Anim -> Move ---
                if (elapsed > 500 && elapsed < 600) spawnRush(3);
                
                if (elapsed > 1500 && elapsed < 1600 && state.entities.length > 0) {
                    state.entities = [];
                    state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 60; // -40
                    state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-280, "-40 體力", C_STAMINA));
                    triggerKillAnim(0, 50);
                }

                // Move: 3.0s to 4.5s
                if (elapsed > 3000 && elapsed < 4500) {
                    state.distance = ((elapsed - 3000) / 1500) * 30; // 0 -> 30
                } else if (elapsed >= 4500 && elapsed < 5500) {
                    state.distance = 30;
                }

                // --- STAGE 2: Rush -> Slash (-40) -> Kill Anim -> Move ---
                if (elapsed > 5500 && elapsed < 5600) spawnRush(5);

                if (elapsed > 6500 && elapsed < 6600 && state.entities.length > 0) {
                    state.entities = [];
                    state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 20; // -40 more
                    state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-280, "-40 體力", C_STAMINA));
                    triggerKillAnim(50, 120);
                }

                // Move: 8.0s to 9.5s
                if (elapsed > 8000 && elapsed < 9500) {
                    state.distance = 30 + ((elapsed - 8000) / 1500) * 30; // 30 -> 60
                } else if (elapsed >= 9500 && elapsed < 10500) {
                    state.distance = 60;
                }

                // --- STAGE 3: Rush -> Slash -> Die (0 Stamina) -> Retreat ---
                if (elapsed > 10500 && elapsed < 10600) spawnRush(8);

                if (elapsed > 11500 && elapsed < 11600 && state.entities.length > 0) {
                    state.entities = [];
                    state.isSlashing = true; state.slashTimer = 10;
                    state.particles.push(new VisualParticle(PLAYER_X+180, GROUND_Y-100, "斬!", "#FFF"));
                    state.stamina = 0; // Dead
                    triggerKillAnim(120, 250);
                }
                
                if (elapsed > 12000 && elapsed < 12100) {
                      state.particles.push(new VisualParticle(PLAYER_X, GROUND_Y-120, "體力歸零...", "#F00"));
                }

                // Retreat Animation (Start running Left after Kill Anim starts fading out)
                if (elapsed > 13500) {
                    state.retreatX -= 12; // Run Left
                }

                if (elapsed > 16000) {
                    setDemoState({ ...demoState, status: 'result' });
                }
            }
        }

        ctx.fillStyle = C_BG; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.strokeStyle = "#2d3748"; ctx.lineWidth = 2;
        for (let i=0; i<GAME_WIDTH; i+=50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i-100, GAME_HEIGHT); ctx.stroke(); }
        ctx.fillStyle = C_GROUND; ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GAME_HEIGHT-GROUND_Y);
        
        if (slideIndex === 3 || slideIndex === 7) {
            state.entities.forEach(e => {
                if (e.targetX !== null && e.x > e.targetX) e.x -= (slideIndex===7 ? 10 : 15);
            });
        }

        // --- Draw Player (Updated for Retreat) ---
        const isDead = state.stamina <= 0;
        const isRetreating = state.retreatX < 0;
        
        let runY = Math.sin(Date.now() / 150) * 15;
        if (isDead && !isRetreating) runY = 0; // Briefly pause before running? Or keep bouncing? Let's keep bouncing for "Running away" or "Fighting"
        if (isDead && !isRetreating && slideIndex === 10 && demoState.type === 'failure' && Date.now() - demoState.startTime > 12000 && Date.now() - demoState.startTime < 13500) {
             // Brief moment of stationary defeat before running
             runY = 10; 
        }

        ctx.save(); 
        // Apply Retreat X offset
        const drawPlayerX = PLAYER_X + state.retreatX;
        ctx.translate(drawPlayerX, GROUND_Y - 40 + runY); 
        
        // Handle Orientation
        if (isRetreating) {
            ctx.scale(1, 1); // Face Left (Normal Emoji Direction)
        } else {
            ctx.scale(-1, 1); // Face Right (Battle Direction)
        }

        ctx.font = "240px sans-serif"; 
        ctx.textAlign = "center"; 
        ctx.fillText("🏇", 0, 0); 
        ctx.restore();
        
        // Draw Slash relative to player
        if (state.isSlashing) {
            ctx.save(); 
            ctx.translate(drawPlayerX + (isRetreating ? -80 : 80), GROUND_Y - 80); // Adjust slash side
            ctx.fillStyle = (slideIndex===7 || (slideIndex===10 && demoState.type==='success' && state.kills>100))?"rgba(255,255,255,0.8)":"rgba(200,230,255,0.6)";
            ctx.beginPath(); 
            ctx.arc(0, 0, (slideIndex===7 || (slideIndex===10 && state.kills>100))?800:280, -Math.PI/3, Math.PI/3); 
            ctx.lineTo(0,0); ctx.fill(); 
            ctx.restore();
            if(state.slashTimer>0) state.slashTimer--; else state.isSlashing=false;
        }

        state.entities.forEach(e => e.draw(ctx));
        state.particles.forEach(p => { p.update(); p.draw(ctx); });
        state.particles = state.particles.filter(p => p.life > 0);
        
        if (slideIndex !== 10 || demoState.status === 'playing') {
            drawSimUI(ctx, state, slideIndex);
        }

        frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [slideIndex, demoState]);

  const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
  };

  const drawSimUI = (ctx, state, index) => {
    ctx.font="bold 18px 'Noto Sans TC', sans-serif"; ctx.textBaseline = "middle";
    const barX = 80; const barW = 250; const barH = 20; const iconX = 50;

    // Stamina
    ctx.fillStyle = C_STAMINA; ctx.textAlign = "center"; ctx.font = "24px sans-serif"; ctx.fillText("🍑", iconX, 40); 
    ctx.fillStyle = "#374151"; drawRoundedRect(ctx, barX, 30, barW, barH, 10); ctx.fill();
    if (state.stamina > 0) { ctx.fillStyle = C_STAMINA; const fillW = Math.max(0, (state.stamina / 100) * barW); drawRoundedRect(ctx, barX, 30, fillW, barH, 10); ctx.fill(); }

    // Soul
    ctx.fillStyle = C_SOUL; ctx.textAlign = "center"; ctx.font = "24px sans-serif"; ctx.fillText("🍶", iconX, 80);
    ctx.fillStyle = "#374151"; drawRoundedRect(ctx, barX, 70, barW, barH, 10); ctx.fill();
    if (state.soul > 0) { ctx.fillStyle = C_SOUL; const fillW = Math.max(0, (state.soul / 100) * barW); drawRoundedRect(ctx, barX, 70, fillW, barH, 10); ctx.fill(); }

    // Progress Bar
    const progX = 400; const progY = 55; const progW = 300; const progH = 8;
    ctx.fillStyle = "#9ca3af"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "left"; ctx.fillText("起點", progX, progY - 20); ctx.textAlign = "right"; ctx.fillText("長坂橋 (終點)", progX + progW, progY - 20);
    ctx.fillStyle = "#374151"; drawRoundedRect(ctx, progX, progY, progW, progH, 4); ctx.fill();
    const progress = Math.min(1, state.distance / 100); const fillPW = progress * progW;
    if (fillPW > 0) { ctx.fillStyle = C_PROGRESS; drawRoundedRect(ctx, progX, progY, fillPW, progH, 4); ctx.fill(); }
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(progX + fillPW, progY + progH/2, 8, 0, Math.PI*2); ctx.fill();

    // Kill Count & Animation Logic
    const kAnim = state.killAnim;
    let drawX = GAME_WIDTH - 30;
    let drawY = 40;
    let drawScale = 1;
    let currentKills = state.kills;
    let isAnimating = false;

    // Special logic for standalone slides
    if (index === 5) {
        const t = Math.min(1, (Date.now() - (state.killAnimStart||0))/1500); 
        const ease = 1 - Math.pow(1 - t, 4); 
        currentKills = Math.floor(ease * 216);
        const sx = GAME_WIDTH-20; const sy = 40; const ex = GAME_WIDTH/2; const ey = GAME_HEIGHT/2;
        drawX = sx+(ex-sx)*ease; drawY = sy+(ey-sy)*ease;
        drawScale = 1 + 3 * ease;
        state.kills = currentKills;
        isAnimating = true;
    } else if ((index === 10 || index === 7) && kAnim && kAnim.active) {
        // DEMO KILL ANIMATION (Shared by Slide 10 and Slide 7)
        // Timeline: 2.5s Total
        // 0.0 - 0.5s: Fly In (TopRight -> Center) & Scale Up (1 -> 4)
        // 0.5 - 1.5s: Scroll Number (StartVal -> EndVal)
        // 1.5 - 2.0s: Pause
        // 2.0 - 2.5s: Fly Out (Center -> TopRight) & Scale Down (4 -> 1)
        
        const elapsed = Date.now() - kAnim.startTime;
        const startX = GAME_WIDTH - 30; const startY = 40;
        const centerX = GAME_WIDTH / 2; const centerY = GAME_HEIGHT / 2;

        if (elapsed < 500) {
            // Phase 1: Fly In
            const t = elapsed / 500;
            const ease = 1 - Math.pow(1 - t, 3); // Ease Out
            drawX = startX + (centerX - startX) * ease;
            drawY = startY + (centerY - startY) * ease;
            drawScale = 1 + 3 * ease;
            currentKills = kAnim.startVal;
            isAnimating = true;
        } else if (elapsed < 1500) {
            // Phase 2: Scroll
            const t = (elapsed - 500) / 1000;
            const ease = 1 - Math.pow(1 - t, 3);
            drawX = centerX; drawY = centerY; drawScale = 4;
            currentKills = Math.floor(kAnim.startVal + (kAnim.endVal - kAnim.startVal) * t); // Linear scroll looks better for numbers usually, but ease is fine
            isAnimating = true;
        } else if (elapsed < 2000) {
            // Phase 3: Pause
            drawX = centerX; drawY = centerY; drawScale = 4;
            currentKills = kAnim.endVal;
            isAnimating = true;
        } else if (elapsed < 2500) {
            // Phase 4: Fly Out
            const t = (elapsed - 2000) / 500;
            const ease = t * t; // Ease In
            drawX = centerX + (startX - centerX) * ease;
            drawY = centerY + (startY - centerY) * ease;
            drawScale = 4 - 3 * ease;
            currentKills = kAnim.endVal;
            isAnimating = true;
        } else {
            // Done
            state.kills = kAnim.endVal;
            state.killAnim.active = false;
            currentKills = kAnim.endVal;
        }
    }

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(drawScale, drawScale);
    ctx.font = "bold 20px sans-serif";
    if (isAnimating) {
        ctx.textAlign = "center";
        ctx.fillStyle = C_GOLD;
        ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 4;
    } else {
        ctx.textAlign = "right";
        ctx.fillStyle = "#FFF";
        ctx.shadowBlur = 0;
    }
    ctx.fillText(`${currentKills} 斬`, 0, 0);
    ctx.restore();

    ctx.textAlign="right"; ctx.font="18px sans-serif"; ctx.fillStyle=C_GOLD; 
    // Static position for Bounty text
    ctx.fillText(`累積賞金: ${currentKills*100}`, GAME_WIDTH-30, 70); 
    ctx.textAlign="left";
  };

  // --- Render Components ---
  const renderCover = () => (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-fade-in p-8 bg-gray-900">
      <div className="bg-blue-900 p-6 rounded-full mb-4 shadow-[0_0_30px_rgba(59,130,246,0.5)]">
        <Sword size={80} className="text-white" />
      </div>
      <h1 className="text-6xl font-bold text-white tracking-widest text-shadow">常山趙子龍</h1>
      <h2 className="text-4xl font-bold text-teal-400">極限突圍：特色演示</h2>
      <div className="h-1 w-32 bg-teal-500 rounded-full"></div>
      <p className="text-gray-400 text-xl">互動式簡報 v2.0</p>
    </div>
  );

  const renderConcept = () => (
    <div className="flex flex-col items-center h-full p-8 text-white bg-gray-900">
      <h2 className="text-3xl font-bold mb-8 border-b-2 border-teal-500 pb-2">核心玩法介紹</h2>
      <div className="grid grid-cols-3 gap-6 w-full max-w-5xl mb-8">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex flex-col items-start text-left">
             <div className="w-full flex justify-center mb-4"><div className="bg-red-900 p-3 rounded-full"><Sword className="text-red-400" size={32}/></div></div>
            <h3 className="text-xl font-bold mb-4 w-full text-center text-red-300">揮砍</h3>
            <ul className="list-disc pl-5 space-y-2 text-lg text-gray-300"> 
                <li>趙雲會<span className="text-red-400 font-bold">攻擊</span>敵人</li>
                <li>需時刻注意體力存量，並<span className="text-red-400 font-bold">累積擊殺數</span></li>
            </ul>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex flex-col items-start text-left">
            <div className="w-full flex justify-center mb-4"><div className="bg-blue-900 p-3 rounded-full"><Heart className="text-blue-400" size={32}/></div></div>
            <h3 className="text-xl font-bold mb-4 w-full text-center text-blue-300">體力</h3>
            <ul className="list-disc pl-5 space-y-2 text-lg text-gray-300 mb-4">
                <li>每次揮砍都會<span className="text-red-400 font-bold">消耗體力</span></li>
                <li>有機會獲得 🍑 吃仙桃補充體力</li>
            </ul>
            <div className="text-lg text-center w-full space-y-3 bg-gray-900/50 p-3 rounded">
                <div className="flex flex-col leading-tight"><span className="text-gray-300 text-base">體力歸零前抵達終點</span><span className="text-green-400 font-bold text-2xl mt-1">= 成功</span></div>
                <div className="flex flex-col leading-tight pt-2 border-t border-gray-700/50"><span className="text-gray-300 text-base">體力歸零前未達終點</span><span className="text-red-400 font-bold text-2xl mt-1">= 失敗</span></div>
            </div>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex flex-col items-start text-left">
             <div className="w-full flex justify-center mb-4"><div className="bg-yellow-900 p-3 rounded-full"><Zap className="text-yellow-400" size={32}/></div></div>
            <h3 className="text-xl font-bold mb-4 w-full text-center text-yellow-300">龍魂</h3>
            <ul className="list-disc pl-5 space-y-2 text-lg text-gray-300">
                <li>擊殺敵人 或 喝 🍶 美酒，累積龍魂</li>
                <li>累積滿後釋放大招，<span className="text-yellow-400 font-bold">累積更多擊殺數</span></li>
            </ul>
        </div>
      </div>
      <button onClick={() => gotoSlide(2)} className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg text-xl flex items-center gap-2 animate-bounce">進入特色介紹 <ChevronRight /></button>
    </div>
  );

  const renderWinUnlock = () => {
      const isUnlocked = unlockPhase !== 'init'; const showStats = unlockPhase === 'stats'; const kills = 528; const spins = 2;
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 p-4">
            <h2 className="text-5xl font-bold mb-4 text-yellow-400">挑戰成功！</h2><p className="text-2xl text-white mb-4">成功抵達長坂橋</p>
            <div className={`transition-all duration-1000 ease-out mb-8 ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="flex flex-col items-center">
                    <p className="text-gray-300 text-xl bg-gray-800 px-6 py-2 rounded-full border border-gray-600">總擊殺: <span className="text-white font-bold">{kills}</span> 人 <span className="mx-3 text-gray-500">|</span> 獲得 <span className="text-yellow-400 font-bold text-2xl">{spins}</span> 次抽獎</p>
                    <p className="text-gray-400 text-sm mt-2 font-medium bg-black/30 px-3 py-1 rounded">(擊殺數越高，抽獎次數越多)</p>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-3 w-full max-w-2xl">
                {PRIZES.map((prize, idx) => {
                    const isHighPrize = prize === 5000 || prize === 10000;
                    const isLocked = isHighPrize && !isUnlocked; const isGlowing = isHighPrize && isUnlocked;
                    return (
                        <div key={idx} className={`relative p-4 rounded-lg border-2 text-center transition-all duration-500 bg-gray-800 border-gray-600 ${isLocked ? 'opacity-40 grayscale' : ''} ${isGlowing ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105' : ''}`}>
                            <div className="text-xl font-bold text-gray-200">{prize}X</div>
                            {isLocked && <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black/50 rounded-lg"><Lock size={24}/></div>}
                            {unlockPhase === 'unlocking' && isHighPrize && (<div className="absolute inset-0 flex items-center justify-center animate-ping text-yellow-300"><LockOpen size={32}/></div>)}
                        </div>
                    );
                })}
            </div>
            <div className="h-8 mt-4">{unlockPhase === 'unlocking' && <span className="text-yellow-300 animate-pulse font-bold text-xl">高倍率獎勵解鎖!</span>}</div>
        </div>
      );
  };

  const renderWinSpin = () => {
      const prize1 = drawnPrizes.length > 0 ? PRIZES[drawnPrizes[0]] : 0; const prize2 = drawnPrizes.length > 1 ? PRIZES[drawnPrizes[1]] : 0; const total = prize1 + prize2;
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 p-4">
            <h2 className="text-5xl font-bold mb-2 text-yellow-400">幸運抽獎</h2>
            <div className="flex gap-4 mb-6">
                <div className={`px-4 py-2 rounded bg-gray-800 border ${drawnPrizes.length>0?'border-yellow-500 text-white':'border-gray-600 text-gray-500'}`}>抽獎 1: {drawnPrizes.length > 0 ? `${prize1}X` : '...'}</div>
                <div className={`px-4 py-2 rounded bg-gray-800 border ${drawnPrizes.length>1?'border-yellow-500 text-white':'border-gray-600 text-gray-500'}`}>抽獎 2: {drawnPrizes.length > 1 ? `${prize2}X` : '...'}</div>
            </div>
            <div className="grid grid-cols-4 gap-3 w-full max-w-2xl mb-4">
                {PRIZES.map((prize, idx) => {
                    const isActive = idx === activeIndex; const isWon = drawnPrizes.includes(idx); const isFinalHighlight = spinStage === 'final' && isWon;
                    return (
                        <div key={idx} className={`relative p-4 rounded-lg border-2 text-center transition-all duration-100 ${isActive ? 'bg-yellow-600 border-white scale-110 z-20 shadow-[0_0_20px_yellow]' : 'bg-gray-800 border-gray-600'} ${isFinalHighlight ? 'border-green-400 bg-green-900 shadow-[0_0_15px_green]' : ''} ${!isActive && isWon && spinStage !== 'final' ? 'border-yellow-500 text-yellow-500' : ''} `}>
                            <div className={`text-xl font-bold ${isActive || isFinalHighlight ? 'text-white' : 'text-gray-200'}`}>{prize}X</div>
                        </div>
                    );
                })}
            </div>
            <div className="h-16 flex items-center justify-center">
                {spinStage.includes('spinning') && <span className="text-green-400 font-bold text-2xl animate-pulse">抽獎進行中...</span>}
                {spinStage === 'final' && (<div className="animate-bounce text-center"><div className="text-white text-xl">總共獲得</div><div className="text-5xl font-bold text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">{total} 倍</div></div>)}
            </div>
        </div>
      );
  };

  const renderLose = () => (
    <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 p-4">
        <h2 className="text-5xl font-bold mb-4 text-red-500">挑戰失敗...</h2><p className="text-2xl text-white mb-8">體力耗盡，未能突圍</p>
        <div className="grid grid-cols-4 gap-3 w-full max-w-2xl opacity-100 mb-8">
            {PRIZES.map((prize, idx) => {
                const isLocked = prize === 5000 || prize === 10000;
                return (
                    <div key={idx} className={`relative p-4 rounded-lg border-2 text-center bg-gray-800 border-gray-600 ${isLocked ? 'opacity-30 grayscale' : ''}`}>
                        <div className="text-xl font-bold text-white">{prize}X</div>{isLocked && <div className="absolute inset-0 flex items-center justify-center text-red-500"><Lock size={24}/></div>}
                    </div>
                );
            })}
        </div>
        <div className="text-red-500 text-xl">🔒 5000X 與 10000X 已鎖定</div>
    </div>
  );

  // --- Slide 10: Full Demo Components ---
  const renderDemoMenu = () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 p-4 animate-fade-in">
          <h2 className="text-5xl font-bold text-white mb-12">完整流程演示</h2>
          <div className="flex gap-12">
              <button onClick={() => startDemo('success')} className="flex flex-col items-center gap-4 bg-gray-800 hover:bg-green-900 border-2 border-green-600 p-8 rounded-xl transition-all hover:scale-105 group"><Trophy size={64} className="text-green-400 group-hover:text-green-300"/><span className="text-2xl font-bold text-green-400">成功突圍</span><span className="text-sm text-gray-400">解鎖獎勵演示</span></button>
              <button onClick={() => startDemo('failure')} className="flex flex-col items-center gap-4 bg-gray-800 hover:bg-red-900 border-2 border-red-600 p-8 rounded-xl transition-all hover:scale-105 group"><Skull size={64} className="text-red-400 group-hover:text-red-300"/><span className="text-2xl font-bold text-red-400">力竭戰敗</span><span className="text-sm text-gray-400">失敗結算演示</span></button>
          </div>
      </div>
  );

  // Custom Result for Demo (Combines Unlock/Stats/Spin)
  const renderDemoResult = () => {
      const isSuccess = demoState.type === 'success';
      const phase = demoState.resultPhase;
      const kills = isSuccess ? 528 : 250;
      const spins = isSuccess ? 2 : 1;
      const drawn = demoState.resultDrawn || [];
      const prize1 = drawn.length > 0 ? PRIZES[drawn[0]] : 0;
      const prize2 = drawn.length > 1 ? PRIZES[drawn[1]] : 0;
      const totalWin = prize1 + (isSuccess ? prize2 : 0);

      const isUnlocked = phase !== 'init' && isSuccess;
      const showStats = phase === 'stats' || phase === 'spinning' || phase === 'done';
      const isSpinning = phase === 'spinning' || phase === 'done';
      const isDone = phase === 'done';

      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 p-4">
            <h2 className={`text-5xl font-bold mb-2 ${isSuccess ? 'text-yellow-400' : 'text-red-500'}`}>{isSuccess ? "挑戰成功！" : "挑戰失敗..."}</h2>
            <p className="text-2xl text-white mb-2">{isSuccess ? "成功抵達長坂橋" : "體力耗盡，未能突圍"}</p>
            <div className={`transition-all duration-1000 ease-out mb-4 h-16 ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="flex flex-col items-center">
                    <p className="text-gray-300 text-xl bg-gray-800 px-6 py-2 rounded-full border border-gray-600">總擊殺: <span className="text-white font-bold">{kills}</span> 人 <span className="mx-3 text-gray-500">|</span> 獲得 <span className="text-yellow-400 font-bold text-2xl">{spins}</span> 次抽獎</p>
                    <p className="text-gray-400 text-sm mt-1 font-medium bg-black/30 px-3 py-1 rounded">(擊殺數越高，抽獎次數越多)</p>
                </div>
            </div>
            
            {/* Draw Result Display */}
            <div className={`flex gap-4 mb-4 transition-all ${isSpinning ? 'opacity-100' : 'opacity-0'}`}>
                 <div className={`px-4 py-2 rounded bg-gray-800 border ${drawn.length>0?'border-yellow-500 text-white':'border-gray-600 text-gray-500'}`}>抽獎 1: {drawn.length > 0 ? `${prize1}X` : '...'}</div>
                 {isSuccess && <div className={`px-4 py-2 rounded bg-gray-800 border ${drawn.length>1?'border-yellow-500 text-white':'border-gray-600 text-gray-500'}`}>抽獎 2: {drawn.length > 1 ? `${prize2}X` : '...'}</div>}
            </div>

             {/* Total Win Display */}
             <div className={`mb-4 transition-all ${isDone && isSuccess ? 'opacity-100 scale-110' : 'opacity-0'}`}>
                 <span className="text-yellow-400 font-bold text-2xl drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">總共獲得：{totalWin} 倍</span>
             </div>

            <div className="grid grid-cols-4 gap-3 w-full max-w-xl mb-2">
                {PRIZES.map((prize, idx) => {
                    const isHighPrize = prize === 5000 || prize === 10000;
                    const isLocked = isHighPrize && (!isSuccess || phase === 'init');
                    const isGlowing = isHighPrize && isSuccess && phase !== 'init';
                    const isActive = idx === activeIndex;
                    const isWon = drawn.includes(idx);
                    // Special highlighting for failure mode locked prizes
                    const isFailureLocked = !isSuccess && isHighPrize;

                    return (
                        <div key={idx} className={`relative p-3 rounded-lg border-2 text-center transition-all duration-300 ${isActive && isSpinning ? 'bg-yellow-600 border-white scale-110 z-20' : 'bg-gray-800 border-gray-600'} ${isLocked ? 'opacity-40 grayscale' : ''} ${isGlowing && !isActive ? 'border-yellow-500 shadow-[0_0_10px_orange]' : ''} ${!isActive && isWon && phase === 'done' ? 'border-green-400 bg-green-900' : ''}`}>
                            <div className={`text-lg font-bold ${isActive ? 'text-white' : 'text-gray-200'}`}>{prize}X</div>
                            {isLocked && <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black/50 rounded-lg"><Lock size={20}/></div>}
                            {phase === 'unlock' && isHighPrize && isSuccess && (<div className="absolute inset-0 flex items-center justify-center animate-ping text-yellow-300"><LockOpen size={24}/></div>)}
                        </div>
                    );
                })}
            </div>
            <button onClick={() => setDemoState(INITIAL_DEMO_STATE)} className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full flex items-center gap-2 border border-slate-500 z-50"><RotateCcw size={16}/> 返回演示選單</button>
        </div>
      );
  };

  // --- Main Render ---
  return (
    // Outer responsive wrapper
    <div className="flex items-center justify-center w-screen h-screen bg-gray-950 font-sans select-none overflow-hidden">
        {/* Scaled Container: Keeps strict aspect ratio and resolution logic */}
        <div 
            ref={containerRef}
            style={{
                width: GAME_WIDTH,
                height: TOTAL_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
            className="relative flex flex-col bg-transparent"
        >
          {/* Game Area */}
          <div className="relative w-full h-[540px] bg-slate-900 rounded-t-xl overflow-hidden border border-slate-700 border-b-0">
            {slideIndex === 0 && renderCover()}
            {slideIndex === 1 && renderConcept()}
            {slideIndex >= 2 && slideIndex <= 7 && (<div className="relative w-full h-full"><canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} className="block" /></div>)}
            {slideIndex === 8 && renderWinUnlock()}
            {slideIndex === 9 && renderWinSpin()}
            {slideIndex === 10 && (
                <>
                    {demoState.status === 'menu' && renderDemoMenu()}
                    {demoState.status === 'playing' && (<div className="relative w-full h-full"><canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} className="block" /></div>)}
                    {demoState.status === 'result' && renderDemoResult()}
                </>
            )}
          </div>
          
          {/* Control Bar */}
          <div className="w-full h-[70px] bg-black/80 p-3 flex justify-between items-center backdrop-blur-sm border border-t-0 border-gray-700 rounded-b-xl shadow-lg">
                <div className="text-gray-400 text-lg ml-4 w-32">第 {slideIndex + 1} / 11 頁</div>
                <div className="flex-1 text-center text-white font-bold text-lg">{getSlideDescription(slideIndex)}</div>
                <div className="flex gap-4 mr-4 w-auto justify-end">
                    <button onClick={prevSlide} disabled={slideIndex===0} className="px-4 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-30">上一步</button>
                    <button onClick={nextSlide} disabled={slideIndex===10} className="px-4 py-1 bg-teal-600 hover:bg-teal-500 rounded text-white disabled:opacity-30">下一步</button>
                    {slideIndex === 10 && demoState.status === 'menu' && <button onClick={() => setSlideIndex(0)} className="px-4 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-white flex items-center gap-1"><RotateCcw size={16}/> 重播簡報</button>}
                </div>
          </div>
        </div>
    </div>
  );
}