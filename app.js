(() => {
'use strict';
const cv = document.getElementById('stage');
const g = cv.getContext('2d');
const bigPlay = document.getElementById('bigPlay');
const playBtn = document.getElementById('playBtn');
const statusEl = document.getElementById('status');
const fileIn = document.getElementById('fileIn');
const fileLabel = document.getElementById('fileLabel');
const safeChk = document.getElementById('safeChk');
const chips = [...document.querySelectorAll('.chip[data-preset]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- presets: synthesized demo beats ---------- */
const PRESETS = {
  pop: { name:'신나는 팝', bpm:124, mood:'밝음 · 장조', hues:[222,205,245], sat:92, lit:72, lp:18000,
    chords:[[60,64,67],[59,62,67],[57,60,64],[57,60,65]], roots:[36,43,45,41],
    kick:[0,4,8,12], kickVol:0.95, snare:[4,12], snareVol:0.5, clap:false,
    hat:[2,6,10,14], hatVol:0.16, open:false, hatSoft:[1,3,5,7,9,11,13,15],
    bass:[0,3,6,8,11,14], bassKind:'saw', bassVol:0.26, bassLen:1.5,
    pad:true, padVol:0.045, padLp:1800,
    arpEvery:2, arpOct:12, leadType:'triangle', leadVol:0.13, leadLp:4000, swing:0 },
  hiphop: { name:'힙합', bpm:90, mood:'묵직함 · 단조', hues:[250,272,228], sat:78, lit:70, lp:16000,
    chords:[[57,60,64,67],[53,57,60,64],[50,53,57,60],[52,56,59,62]], roots:[45,41,38,40],
    kick:[0,7,10], kickVol:1, snare:[4,12], snareVol:0.6, clap:true,
    hat:[0,2,4,6,8,10,12,14], hatVol:0.12, open:false, hatSoft:[15],
    bass:[0,7,10], bassKind:'808', bassVol:0.5, bassLen:3,
    pad:true, padVol:0.032, padLp:1100,
    arpEvery:0, melSteps:[0,3,6,10], leadType:'square', leadVol:0.05, leadLp:1800, swing:0.18 },
  lofi: { name:'로파이', bpm:76, mood:'잔잔함 · 재즈 코드', hues:[188,205,172], sat:62, lit:70, lp:4200,
    chords:[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]], roots:[41,40,38,36],
    kick:[0,10], kickVol:0.85, snare:[4,12], snareVol:0.35, clap:false,
    hat:[0,2,4,6,8,10,12,14], hatVol:0.07, open:false, hatSoft:null,
    bass:[0,10], bassKind:'sine', bassVol:0.4, bassLen:5,
    pad:true, padVol:0.05, padLp:900,
    arpEvery:0, melSteps:[0,6,9,14], leadType:'triangle', leadVol:0.11, leadLp:2200, swing:0.22, crackle:true },
  edm: { name:'EDM', bpm:128, mood:'폭발 · 고에너지', hues:[200,228,188], sat:100, lit:66, lp:18000,
    chords:[[57,60,64],[57,60,65],[55,60,64],[55,59,62]], roots:[45,41,48,43],
    kick:[0,4,8,12], kickVol:1, snare:[4,12], snareVol:0.8, clap:true,
    hat:[2,6,10,14], hatVol:0.18, open:true, hatSoft:[0,1,3,4,5,7,8,9,11,12,13,15],
    bass:[2,6,10,14], bassKind:'saw', bassVol:0.3, bassLen:1.6,
    pad:false, stab:[0,3,6,10,13], stabVol:0.055,
    arpEvery:1, arpOct:24, leadType:'square', leadVol:0.045, leadLp:3200, swing:0 }
};

/* ---------- state ---------- */
const S = { mode:'ar', preset:'pop', source:'synth', playing:false, safe:true, fileName:'',
  camZ:0, bob:0, flash:0, beat:0, t:0, lastKick:-9, lastSnare:-9, lastFlash:-9,
  kickAvg:0.2, snareAvg:0.2, prevBass:0, onsets:[], bpmEst:0, idlePhase:0,
  hues:PRESETS.pop.hues.slice(), sat:92, lit:72, party:false, jumpT:-9, centroid:0.3, kicks:0, snares:0 };
const F = { bass:0, mid:0, high:0, snareBand:0, energy:0, bands:new Float32Array(12) };

/* ---------- audio engine ---------- */
let ac=null, bus, busLP, comp, master, analyser, noiseBuf, freqData, crackleSrc=null, crackleGain=null;
let fileBuf=null, fileSrc=null, timer=null, step=0, nextT=0;
const mtof = m => 440*Math.pow(2,(m-69)/12);

function initAudio(){
  if (ac) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ac = new AC();
  bus = ac.createGain(); bus.gain.value = 0.9;
  busLP = ac.createBiquadFilter(); busLP.type='lowpass'; busLP.frequency.value = PRESETS[S.preset].lp;
  comp = ac.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.attack.value=0.004; comp.release.value=0.15;
  master = ac.createGain(); master.gain.value = 0.75;
  analyser = ac.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -85; analyser.maxDecibels = -18;
  bus.connect(busLP); busLP.connect(comp); comp.connect(master); master.connect(analyser); analyser.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

function kick(t,v){
  const o=ac.createOscillator(), gn=ac.createGain();
  o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(42,t+0.13);
  gn.gain.setValueAtTime(v,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+0.42);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t+0.45);
}
function noiseHit(t,v,type,fr,q,dur){
  const s=ac.createBufferSource(); s.buffer=noiseBuf;
  const fl=ac.createBiquadFilter(); fl.type=type; fl.frequency.value=fr; fl.Q.value=q;
  const gn=ac.createGain(); gn.gain.setValueAtTime(v,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(fl); fl.connect(gn); gn.connect(bus); s.start(t, Math.random()*0.5); s.stop(t+dur+0.02);
}
function snare(t,v){
  noiseHit(t,v,'bandpass',1900,0.8,0.18);
  const o=ac.createOscillator(), gn=ac.createGain(); o.type='triangle'; o.frequency.value=185;
  gn.gain.setValueAtTime(v*0.5,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+0.1);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t+0.12);
}
function clap(t,v){ for (let i=0;i<3;i++) noiseHit(t+i*0.012, v*0.9,'bandpass',1500,1.2, i===2?0.2:0.03); }
function hat(t,v,open){ noiseHit(t,v,'highpass',7500,0.7, open?0.26:0.05); }
function bass(t,fr,dur,p){
  const o=ac.createOscillator(), gn=ac.createGain();
  if (p.bassKind==='808'){
    o.type='sine'; o.frequency.setValueAtTime(fr*1.8,t); o.frequency.exponentialRampToValueAtTime(fr,t+0.06);
    gn.gain.setValueAtTime(p.bassVol,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(gn);
  } else if (p.bassKind==='sine'){
    o.type='sine'; o.frequency.value=fr;
    gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime(p.bassVol,t+0.02); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(gn);
  } else {
    o.type='sawtooth'; o.frequency.value=fr;
    const fl=ac.createBiquadFilter(); fl.type='lowpass'; fl.Q.value=4;
    fl.frequency.setValueAtTime(1100,t); fl.frequency.exponentialRampToValueAtTime(260,t+dur);
    gn.gain.setValueAtTime(p.bassVol,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(fl); fl.connect(gn);
  }
  gn.connect(bus); o.start(t); o.stop(t+dur+0.05);
}
function lead(t,fr,dur,p){
  const o=ac.createOscillator(), fl=ac.createBiquadFilter(), gn=ac.createGain();
  o.type=p.leadType; o.frequency.value=fr; fl.type='lowpass'; fl.frequency.value=p.leadLp;
  gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime(p.leadVol,t+0.006); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(fl); fl.connect(gn); gn.connect(bus); o.start(t); o.stop(t+dur+0.05);
}
function pad(t,chord,dur,p){
  const fl=ac.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=p.padLp;
  const gn=ac.createGain();
  gn.gain.setValueAtTime(0.0001,t); gn.gain.linearRampToValueAtTime(p.padVol,t+0.35);
  gn.gain.setValueAtTime(p.padVol,t+dur-0.3); gn.gain.linearRampToValueAtTime(0.0001,t+dur+0.2);
  fl.connect(gn); gn.connect(bus);
  chord.forEach(m => [-7,7].forEach(dt => { const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=mtof(m); o.detune.value=dt; o.connect(fl); o.start(t); o.stop(t+dur+0.25); }));
}
function stab(t,chord,dur,p){
  const fl=ac.createBiquadFilter(); fl.type='lowpass'; fl.frequency.setValueAtTime(3500,t); fl.frequency.exponentialRampToValueAtTime(600,t+dur);
  const gn=ac.createGain(); gn.gain.setValueAtTime(p.stabVol,t); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  fl.connect(gn); gn.connect(bus);
  chord.forEach(m => [-12,12].forEach(dt => { const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=mtof(m+12); o.detune.value=dt; o.connect(fl); o.start(t); o.stop(t+dur+0.05); }));
}

function playStep(p, st, t){
  const bar = Math.floor(st/16)%4, s = st%16, sp = 60/p.bpm/4;
  const chord = p.chords[bar], root = p.roots[bar];
  if (p.kick.includes(s)) kick(t,p.kickVol);
  if (p.snare.includes(s)) (p.clap?clap:snare)(t,p.snareVol);
  if (p.hat.includes(s)) hat(t,p.hatVol,p.open);
  if (p.hatSoft && p.hatSoft.includes(s)) hat(t,p.hatVol*0.4,false);
  if (p.bass.includes(s)) bass(t, mtof(root), sp*p.bassLen, p);
  if (p.pad && s===0) pad(t, chord, sp*16, p);
  if (p.stab && p.stab.includes(s)) stab(t, chord, sp*1.3, p);
  if (p.arpEvery && s % p.arpEvery === 0){ const n = chord[((s/p.arpEvery)|0) % chord.length] + p.arpOct; lead(t, mtof(n), sp*p.arpEvery*0.9, p); }
  if (p.melSteps){ const i = p.melSteps.indexOf(s); if (i>=0) lead(t, mtof(chord[(i+bar)%chord.length]+12), sp*2.5, p); }
}
function sched(){
  const p = PRESETS[S.preset], sp = 60/p.bpm/4;
  while (nextT < ac.currentTime + 0.12){
    const t = nextT + ((step%2) ? (p.swing||0)*sp : 0);
    playStep(p, step, t);
    nextT += sp; step++;
  }
}
function updateCrackle(){
  const want = timer && PRESETS[S.preset].crackle;
  if (want && !crackleSrc){
    crackleSrc = ac.createBufferSource(); crackleSrc.buffer = noiseBuf; crackleSrc.loop = true;
    const fl = ac.createBiquadFilter(); fl.type='highpass'; fl.frequency.value=2500;
    crackleGain = ac.createGain(); crackleGain.gain.value = 0.012;
    crackleSrc.connect(fl); fl.connect(crackleGain); crackleGain.connect(comp); crackleSrc.start();
  } else if (!want && crackleSrc){
    try{ crackleSrc.stop(); }catch(e){}
    crackleSrc.disconnect(); crackleSrc = null;
  }
}
function startSynth(){
  stopFile();
  busLP.frequency.setTargetAtTime(PRESETS[S.preset].lp, ac.currentTime, 0.05);
  if (!timer){ step = 0; nextT = ac.currentTime + 0.06; timer = setInterval(sched, 25); }
  updateCrackle();
}
function stopSynth(){ clearInterval(timer); timer = null; updateCrackle(); }
function startFile(){
  stopSynth(); stopFile();
  fileSrc = ac.createBufferSource(); fileSrc.buffer = fileBuf; fileSrc.loop = true;
  fileSrc.connect(comp); fileSrc.start();
}
function stopFile(){ if (fileSrc){ try{ fileSrc.stop(); }catch(e){} fileSrc.disconnect(); fileSrc = null; } }

async function play(){
  initAudio();
  try { await ac.resume(); } catch(e){}
  if (S.source==='synth') startSynth();
  else if (!fileSrc && fileBuf) startFile();
  S.playing = true; statusEl.textContent = '';
  refreshUI(); ensureLoop();
}
function pause(){
  if (ac) ac.suspend();
  S.playing = false; refreshUI();
}

function refreshUI(){
  bigPlay.hidden = S.playing;
  playBtn.textContent = S.playing ? '일시정지' : '재생';
  chips.forEach(c => c.setAttribute('aria-pressed', String(S.source==='synth' && c.dataset.preset===S.preset)));
  fileLabel.setAttribute('aria-pressed', String(S.source==='file'));
}

bigPlay.addEventListener('click', play);
playBtn.addEventListener('click', () => S.playing ? pause() : play());
chips.forEach(c => c.addEventListener('click', () => {
  S.preset = c.dataset.preset; S.source = 'synth'; S.onsets = []; S.bpmEst = 0;
  const p = PRESETS[S.preset]; S.hues = p.hues.slice(); S.sat = p.sat; S.lit = p.lit;
  play();
}));
fileLabel.addEventListener('pointerdown', () => initAudio());
fileIn.addEventListener('change', async () => {
  const f = fileIn.files && fileIn.files[0]; if (!f) return;
  initAudio();
  statusEl.textContent = '곡을 불러오는 중…';
  try {
    const buf = await f.arrayBuffer();
    fileBuf = await new Promise((res, rej) => { const pr = ac.decodeAudioData(buf, res, rej); if (pr && pr.catch) pr.catch(rej); });
    S.fileName = f.name.replace(/\.[^.]+$/, '');
    S.source = 'file'; S.onsets = []; S.bpmEst = 0; S.sat = 85; S.lit = 72;
    startFile(); await play();
  } catch(err){
    statusEl.textContent = '이 파일은 재생할 수 없어요. MP3, WAV, M4A 같은 음악 파일로 다시 시도해 주세요.';
  }
  fileIn.value = '';
});
document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { S.mode = r.value; if (!loopOn) draw(); }));
safeChk.addEventListener('change', () => { S.safe = safeChk.checked; if (!loopOn) draw(); });

/* ---------- analysis ---------- */
const BAND_EDGES = Array.from({length:13}, (_,i) => 40*Math.pow(11000/40, i/12));
function bandAvg(f0,f1){
  const hz = ac.sampleRate/analyser.fftSize;
  const i0 = Math.max(1, Math.floor(f0/hz)), i1 = Math.max(i0+1, Math.ceil(f1/hz));
  let s=0; for (let i=i0;i<i1;i++) s += freqData[i];
  return s/(i1-i0)/255;
}
const clamp = (v,a=0,b=1) => v<a?a:v>b?b:v;
const lerp = (a,b,k) => a+(b-a)*k;
function follow(cur, v, up, down){ return v>cur ? lerp(cur,v,up) : lerp(cur,v,down); }

function analyze(dt, now){
  const live = S.playing && ac && ac.state==='running';
  if (live){
    analyser.getByteFrequencyData(freqData);
    const bass = bandAvg(30,150), mid = bandAvg(300,2000), high = bandAvg(5000,12000), sn = bandAvg(1500,4000);
    F.bass = follow(F.bass, bass, 0.7, 0.2);
    F.mid = follow(F.mid, clamp((mid-0.12)*1.8), 0.5, 0.08);
    F.high = follow(F.high, clamp((high-0.02)/0.16), 0.6, 0.12);
    for (let i=0;i<12;i++){
      const v = clamp((bandAvg(BAND_EDGES[i], BAND_EDGES[i+1])*(1+i*0.12) - 0.2)/0.65);
      F.bands[i] = follow(F.bands[i], v, 0.6, 0.12);
    }
    // onset detection against slow running averages
    if (bass > S.kickAvg*1.18 + 0.03 && bass > 0.42 && now - S.lastKick > 0.22 && bass >= S.prevBass){ onKick(now); }
    S.kickAvg = lerp(S.kickAvg, bass, 0.06); S.prevBass = bass;
    if (sn > S.snareAvg*1.25 + 0.03 && sn > 0.3 && now - S.lastSnare > 0.15){ onSnare(now); }
    S.snareAvg = lerp(S.snareAvg, sn, 0.08);
    // spectral centroid → hue for uploaded songs
    let num=0, den=0; for (let i=2;i<400;i++){ num += i*freqData[i]; den += freqData[i]; }
    S.centroid = lerp(S.centroid, den ? clamp(num/den/140) : 0.3, 0.02);
    if (S.source==='file'){ const h0 = lerp(252, 192, S.centroid); S.hues = [h0, h0-20, h0+22]; }
    F.energy = (F.bass+F.mid+F.high)/3;
  } else {
    // gentle idle signal so the stage shows the idea before anyone presses play
    S.idlePhase += dt*1.5;
    const ph = S.idlePhase % 1, k = Math.exp(-ph*5);
    if (S.idlePhase - dt*1.5 < Math.floor(S.idlePhase) && S.idlePhase >= Math.floor(S.idlePhase) && !reduceMotion) onKick(now, true);
    F.bass = 0.25 + 0.35*k; F.mid = 0.3 + 0.12*Math.sin(S.t*0.9); F.high = 0.18 + 0.08*Math.sin(S.t*1.7);
    for (let i=0;i<12;i++) F.bands[i] = 0.25 + 0.2*Math.sin(S.t*1.2 + i*0.8) + 0.25*k*(1-i/12);
    F.energy = 0.3;
  }
}
function onKick(now, idle){
  S.lastKick = now; S.bob = 1; S.beat = (S.beat+1)%4;
  if (!idle){ S.kicks++; S.onsets.push(now); if (S.onsets.length>24) S.onsets.shift(); estimateBpm(); }
  ripples.push({ z:S.camZ+2.4, t:S.t, hue:S.beat%2 });
  if (S.party && !idle) FRIENDS.forEach(fr => { if (fr.joined) ripples.push({ z:S.camZ+fr.dz, x:fr.x, t:S.t, hue:0, fh:fr.hue, sc:0.55 }); });
  while (ripples.length>24) ripples.shift();
  if (S.mode==='vr') rings.push({ z:S.camZ+46, hue:S.beat%3 });
}
function onSnare(now){
  S.lastSnare = now; S.snares++;
  if (now - S.lastFlash > 0.34){ S.flash = 1; S.lastFlash = now; } // ≤ 3 flashes per second
  for (let i=0;i<14;i++) spawnParticle(true);
}
function estimateBpm(){
  const iv = [];
  for (let i=1;i<S.onsets.length;i++){ const d = S.onsets[i]-S.onsets[i-1]; if (d>0.25 && d<1.5) iv.push(d); }
  if (iv.length < 4) return;
  iv.sort((a,b)=>a-b);
  let bpm = 60/iv[iv.length>>1];
  while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2;
  S.bpmEst = S.bpmEst ? lerp(S.bpmEst, bpm, 0.3) : bpm;
}

/* ---------- world ---------- */
const FAR = 70, EYE = 1.6;
let W=0, H=0, DPR=1, f=500, vpX=0, vpY=0, bobPx=0;
const ripples = [], rings = [], parts = [];
const stars = Array.from({length:90}, () => ({ x:Math.random(), y:Math.random()*0.9, s:Math.random()*1.2+0.3, tw:Math.random()*6 }));
const warp = Array.from({length:160}, () => ({ X:(Math.random()-0.5)*60, Y:(Math.random()-0.5)*36, Z:Math.random()*80+1 }));
function mkB(z0){
  const L = 5 + Math.random()*9, h = 7 + Math.random()*20;
  const cols = Math.max(2, Math.round(L/1.7)), rows = Math.max(1, Math.floor((h-2.4)/3));
  const lit = new Uint8Array(cols*rows); for (let i=0;i<lit.length;i++) lit[i] = Math.random()<0.32 ? 1 : 0;
  const gap = Math.random()<0.22 ? 2 + Math.random()*2 : 0;
  return { z0, z1:z0+L, h, cols, rows, lit, seed:(Math.random()*12)|0, tone:Math.random()*10, gapBefore:gap>0, next:z0+L+gap };
}
const sideL = [], sideR = [];
function fillSide(arr){
  while (arr.length && arr[0].z1 < S.camZ) arr.shift();
  let z = arr.length ? arr[arr.length-1].next : S.camZ - 3;
  while (z < S.camZ + FAR + 20){ const b = mkB(z); arr.push(b); z = b.next; }
}
function P(X,Y,Z){ const z = Math.max(0.05, Z - S.camZ); return [vpX + X*f/z, vpY + (EYE-Y)*f/z + bobPx, z]; }
function quad(a,b,c,d){ g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.lineTo(c[0],c[1]); g.lineTo(d[0],d[1]); g.closePath(); }
function pal(i, a, dl){ const h = S.hues[((i%3)+3)%3]; return 'hsla(' + (h%360).toFixed(0) + ',' + S.sat + '%,' + Math.min(96, S.lit + (dl||0)) + '%,' + clamp(a).toFixed(3) + ')'; }
function safeFade(x,y){
  if (S.mode!=='ar') return 1;
  const cx = W/2, cy = H*0.56, rx = W*0.17, ry = H*0.2;
  const d = ((x-cx)/rx)**2 + ((y-cy)/ry)**2;
  return clamp((d-0.5)/0.9, 0.12, 1);
}
function spawnParticle(burst){
  if (parts.length > 420) return;
  const wide = S.mode==='vr' ? 9 : 3.8;
  parts.push({ X:(Math.random()*2-1)*wide, Y:Math.random()*(burst?3:0.6), Z:S.camZ + 2 + Math.random()*26,
    vy:0.8 + Math.random()*1.8, life:1.2 + Math.random()*1.2, age:0, hue:Math.random()<0.6?2:(Math.random()<0.5?0:1) });
}

function update(dt, now){
  analyze(dt, now);
  const speed = S.mode==='vr' ? (S.playing?6:2) : (S.playing?1.4:0.5);
  S.camZ += speed*dt;
  S.bob *= Math.exp(-dt*7); S.flash *= Math.exp(-dt*6);
  fillSide(sideL); fillSide(sideR);
  const rate = (F.high*90 + 6) * dt;
  let n = Math.floor(rate) + (Math.random() < rate%1 ? 1 : 0);
  if (S.mode !== 'off') for (; n > 0; n--) spawnParticle(false);
  for (let i=parts.length-1;i>=0;i--){ const p = parts[i]; p.age += dt; p.Y += p.vy*dt*(0.6+F.high); if (p.age>p.life || p.Z < S.camZ+0.5) parts.splice(i,1); }
  for (let i=ripples.length-1;i>=0;i--) if (S.t - ripples[i].t > 1.6) ripples.splice(i,1);
  for (let i=rings.length-1;i>=0;i--){ rings[i].z -= dt*18; if (rings[i].z - S.camZ < 0.8) rings.splice(i,1); }
  for (const s of warp){ s.Z -= dt*(10 + F.bass*28); if (s.Z < 1){ s.Z = 80; s.X = (Math.random()-0.5)*60; s.Y = (Math.random()-0.5)*36; } }
}

/* ---------- together mode: invited friends, one shared beat clock ---------- */
const FRIENDS = [
  { name:'민지', ini:'민', hue:205, x:-1.9, dz:5.4, move:0, lat:12, joined:false, joinT:-9 },
  { name:'서준', ini:'서', hue:245, x: 1.9, dz:6.8, move:1, lat:18, joined:false, joinT:-9 },
  { name:'하린', ini:'하', hue:176, x:-0.4, dz:10.5, move:2, lat:9,  joined:false, joinT:-9 }
];
const partyBtn = document.getElementById('partyBtn');
const partyPanel = document.getElementById('partyPanel');
const friendList = document.getElementById('friendList');
const jumpBtn = document.getElementById('jumpBtn');
const copyBtn = document.getElementById('copyBtn');
const syncInfo = document.getElementById('syncInfo');
const inviteLink = document.getElementById('inviteLink');
let partyTimers = [];
function renderFriends(){
  friendList.innerHTML = '';
  FRIENDS.forEach(fr => {
    const li = document.createElement('li');
    const st = fr.joined ? '합류 · 지연 ' + fr.lat + 'ms' : (fr.state || '초대 보내는 중…');
    li.innerHTML = '<span class="av" style="--h:' + fr.hue + '">' + fr.ini + '</span><span class="nm">' + fr.name + '</span><span class="st' + (fr.joined ? ' on' : '') + '">' + st + '</span>';
    friendList.appendChild(li);
  });
  const n = FRIENDS.filter(f => f.joined).length;
  jumpBtn.disabled = n === 0;
  syncInfo.textContent = n ? '나 포함 ' + (n+1) + '명이 같은 박자로 동기화 중' : '친구가 들어오면 같은 박자로 맞춰져요';
}
function startParty(){
  S.party = true; partyPanel.hidden = false; partyBtn.textContent = '혼자 보기로 돌아가기'; partyBtn.setAttribute('aria-pressed','true');
  FRIENDS.forEach(f => { f.joined = false; f.state = '초대 보내는 중…'; });
  renderFriends();
  if (!S.playing) play();
  FRIENDS.forEach((f, i) => {
    partyTimers.push(setTimeout(() => { f.state = '연결 중…'; renderFriends(); }, 500 + i*1100));
    partyTimers.push(setTimeout(() => { f.joined = true; f.joinT = S.t; renderFriends(); }, 1300 + i*1100));
  });
}
function stopParty(){
  S.party = false; partyTimers.forEach(clearTimeout); partyTimers = [];
  FRIENDS.forEach(f => { f.joined = false; });
  partyPanel.hidden = true; partyBtn.textContent = '친구 초대하기'; partyBtn.setAttribute('aria-pressed','false');
  if (!loopOn) draw();
}
partyBtn.addEventListener('click', () => S.party ? stopParty() : startParty());
jumpBtn.addEventListener('click', () => {
  S.jumpT = S.t;
  ripples.push({ z:S.camZ+2.4, t:S.t, hue:0, sc:1.5 });
  FRIENDS.forEach(f => { if (f.joined) ripples.push({ z:S.camZ+f.dz, x:f.x, t:S.t, hue:0, fh:f.hue, sc:1.2 }); });
  for (let i=0;i<50;i++) spawnParticle(true);
  const now = performance.now()/1000;
  if (now - S.lastFlash > 0.34){ S.flash = 1; S.lastFlash = now; }
});
copyBtn.addEventListener('click', async () => {
  const text = inviteLink.textContent;
  try { await navigator.clipboard.writeText(text); copyBtn.textContent = '복사됨'; }
  catch(e){ const r = document.createRange(); r.selectNodeContents(inviteLink); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); copyBtn.textContent = '선택됨 · 복사하세요'; }
  setTimeout(() => { copyBtn.textContent = '링크 복사'; }, 1600);
});
const jumpH = () => { const a = S.t - S.jumpT; return a >= 0 && a < 0.7 ? Math.sin(a/0.7*Math.PI)*0.45 : 0; };

function friendPose(fr, i){
  const a = fr.joined ? clamp((S.t - fr.joinT)/0.8) : 0;
  const wz = S.camZ + fr.dz + Math.sin(S.t*0.5 + i*2)*0.3;
  const wx = fr.x + Math.sin(S.t*0.7 + i)*0.15;
  const lift = (S.playing ? S.bob*0.11 : 0) + jumpH();
  return { a, wz, wx, lift };
}
function drawSyncLines(){
  g.save(); g.globalCompositeOperation = 'lighter';
  const pulse = S.bob, sx = W/2, sy = H + 6;
  FRIENDS.forEach((fr, i) => {
    if (!fr.joined) return;
    const p = friendPose(fr, i), c = P(p.wx, 1.15 + p.lift, p.wz);
    const cx = lerp(sx, c[0], 0.5), cy = lerp(sy, c[1], 0.35) + H*0.08;
    g.strokeStyle = 'hsla(' + fr.hue + ',90%,75%,' + (p.a*(0.12 + pulse*0.35)).toFixed(3) + ')'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, c[0], c[1]); g.stroke();
    // beat packet travelling from me to the friend on every kick
    const t = clamp(1 - pulse), u = 1 - t;
    const px = u*u*sx + 2*u*t*cx + t*t*c[0], py = u*u*sy + 2*u*t*cy + t*t*c[1];
    if (pulse > 0.05){
      g.fillStyle = 'hsla(' + fr.hue + ',95%,85%,' + (p.a*pulse).toFixed(3) + ')';
      g.beginPath(); g.arc(px, py, 3 + pulse*3, 0, Math.PI*2); g.fill();
    }
  });
  g.restore();
}
function drawFriends(){
  const ar = S.mode === 'ar';
  const order = FRIENDS.map((fr, i) => [fr, i]).filter(([fr]) => fr.joined).sort((a,b) => b[0].dz - a[0].dz);
  for (const [fr, i] of order){
    const p = friendPose(fr, i);
    const feet = P(p.wx, p.lift, p.wz), ground = P(p.wx, 0, p.wz), k = f/feet[2];
    const age = S.t - fr.joinT;
    // arrival beam
    if (ar && age < 1.4){
      const ba = 1 - age/1.4, top = P(p.wx, 9, p.wz);
      const gr = g.createLinearGradient(0, top[1], 0, ground[1]);
      gr.addColorStop(0, 'hsla(' + fr.hue + ',90%,80%,0)'); gr.addColorStop(1, 'hsla(' + fr.hue + ',90%,80%,' + (0.55*ba).toFixed(3) + ')');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr;
      g.fillRect(ground[0] - 0.35*k, top[1], 0.7*k, ground[1] - top[1]); g.restore();
    }
    // ground aura, pulsing together with everyone on the kick
    if (ar){
      const rx = 0.75*k*(1 + F.bass*0.35 + S.bob*0.25), ry = rx*0.26;
      const gl = g.createRadialGradient(ground[0], ground[1], 0, ground[0], ground[1], rx);
      gl.addColorStop(0, 'hsla(' + fr.hue + ',95%,72%,' + (0.55*p.a).toFixed(3) + ')'); gl.addColorStop(1, 'hsla(' + fr.hue + ',95%,72%,0)');
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gl;
      g.beginPath(); g.ellipse(ground[0], ground[1], rx, ry, 0, 0, Math.PI*2); g.fill(); g.restore();
    }
    // body, in metres, drawn upward from the feet
    const beatOdd = S.beat % 2 === 1, up = S.playing ? S.bob : 0.3 + 0.2*Math.sin(S.t*2);
    let lA, rA; // arm angles from straight down, radians
    if (fr.move === 0){ lA = beatOdd ? 2.7 : 0.5 + up*0.4; rA = beatOdd ? 0.5 + up*0.4 : 2.7; }
    else if (fr.move === 1){ lA = rA = 1.2 + up*1.6; }
    else { const sw = Math.sin(S.t*Math.PI*PRESETS[S.preset].bpm/60/2); lA = 1.0 + sw*0.9; rA = 1.0 - sw*0.9; }
    if (jumpH() > 0.05){ lA = rA = 2.9; }
    const step = Math.sin(S.t*Math.PI*PRESETS[S.preset].bpm/60)*0.1;
    const segs = [
      [[0,0.92],[-0.12+step,0.02], 0.13], [[0,0.92],[0.12-step,0.02], 0.13],
      [[0,0.92],[0,1.4], 0.3],
      [[-0.19,1.38],[-0.19 - Math.sin(lA)*0.6, 1.38 - Math.cos(lA)*0.6], 0.1],
      [[0.19,1.38],[0.19 + Math.sin(rA)*0.6, 1.38 - Math.cos(rA)*0.6], 0.1]
    ];
    const toS = ([x,y]) => [feet[0] + x*k, feet[1] - y*k];
    const rim = ar ? 'hsla(' + fr.hue + ',95%,78%,' + (0.95*p.a).toFixed(3) + ')' : 'rgba(200,212,245,' + (0.45*p.a).toFixed(3) + ')';
    g.lineCap = 'round';
    for (const pass of [0,1]){
      g.strokeStyle = pass ? 'rgba(6,11,32,' + p.a.toFixed(3) + ')' : rim;
      g.fillStyle = g.strokeStyle;
      for (const [a0, a1, w] of segs){ const s0 = toS(a0), s1 = toS(a1); g.lineWidth = (w + (pass ? 0 : 0.05))*k; g.beginPath(); g.moveTo(s0[0],s0[1]); g.lineTo(s1[0],s1[1]); g.stroke(); }
      const hd = toS([0, 1.62]); g.beginPath(); g.arc(hd[0], hd[1], (0.12 + (pass ? 0 : 0.025))*k, 0, Math.PI*2); g.fill();
    }
    // name tag
    if (ar && p.a > 0.2){
      const s = clamp(W/900, 0.72, 1.15), tag = P(p.wx, 2.1 + p.lift, p.wz);
      g.font = '500 ' + (11*s).toFixed(1) + 'px Manrope, "Noto Sans KR", sans-serif';
      const label = fr.name + '  ' + fr.lat + 'ms', tw = g.measureText(label).width + 26*s, th = 20*s;
      g.globalAlpha = p.a; glassPanel(tag[0] - tw/2, tag[1] - th, tw, th, th/2);
      g.fillStyle = 'hsla(' + fr.hue + ',95%,75%,1)'; g.beginPath(); g.arc(tag[0] - tw/2 + 10*s, tag[1] - th/2, 3*s, 0, Math.PI*2); g.fill();
      g.fillStyle = '#eef3ff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(label, tag[0] - tw/2 + 17*s, tag[1] - th/2);
      g.globalAlpha = 1;
    }
  }
}
function drawPartyHUD(){
  if (!S.party) return;
  const s = clamp(W/900, 0.72, 1.15), pad = 16*s, n = FRIENDS.filter(f => f.joined).length;
  const x = pad, y = pad + 70*s, h = 34*s;
  const label = n ? '함께 모드 · ' + (n+1) + '명 동기화' : '친구를 기다리는 중…';
  g.font = '500 ' + (11.5*s).toFixed(1) + 'px Manrope, "Noto Sans KR", sans-serif';
  const w = 14*s + (n+1)*16*s + 10*s + g.measureText(label).width + 14*s;
  glassPanel(x, y, w, h, h/2);
  const people = [{ ini:'나', hue:220, joined:true }].concat(FRIENDS);
  let cx = x + 14*s + 7*s;
  people.forEach(pp => {
    if (!pp.joined) return;
    const r = 7*s*(1 + S.bob*0.25);
    g.fillStyle = 'hsla(' + pp.hue + ',90%,72%,0.95)'; g.beginPath(); g.arc(cx, y + h/2, r, 0, Math.PI*2); g.fill();
    g.strokeStyle = 'rgba(4,8,23,0.9)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#07112e'; g.font = '700 ' + (8*s).toFixed(1) + 'px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(pp.ini, cx, y + h/2 + 0.5);
    cx += 16*s;
  });
  g.textAlign = 'left'; g.fillStyle = '#eef3ff'; g.font = '500 ' + (11.5*s).toFixed(1) + 'px Manrope, "Noto Sans KR", sans-serif';
  g.fillText(label, cx + 2*s, y + h/2);
  g.textBaseline = 'top';
}

/* ---------- drawing ---------- */
function drawSky(){
  const hz = vpY + bobPx;
  g.fillStyle = '#030615'; g.fillRect(0,0,W,H);
  const gr = g.createLinearGradient(0,0,0,hz);
  if (S.mode==='vr'){ gr.addColorStop(0,'#02040d'); gr.addColorStop(1, pal(0, 0.28, -45)); }
  else { gr.addColorStop(0,'#030615'); gr.addColorStop(0.7,'#0a1740'); gr.addColorStop(1,'#1a3278'); }
  g.fillStyle = gr; g.fillRect(0,0,W,hz+1);
  // eclipse of light sitting on the horizon
  const on = S.mode!=='off', R = Math.max(W,H)*0.62;
  const cy = hz + R*0.86;
  const halo = g.createRadialGradient(vpX, cy, R*0.9, vpX, cy, R*1.35);
  halo.addColorStop(0, on ? pal(0, 0.55 + F.bass*0.35, 8) : 'rgba(120,150,230,0.28)');
  halo.addColorStop(1, 'rgba(60,100,220,0)');
  g.fillStyle = halo; g.fillRect(0,0,W,hz+2);
  g.save(); g.beginPath(); g.rect(0,0,W,hz+1); g.clip();
  g.beginPath(); g.arc(vpX, cy, R, 0, Math.PI*2); g.fillStyle = '#040817'; g.fill();
  g.strokeStyle = on ? 'rgba(225,235,255,' + (0.55 + F.bass*0.4).toFixed(3) + ')' : 'rgba(200,215,255,0.35)';
  g.lineWidth = 1.5; g.stroke();
  g.restore();
  if (S.mode!=='vr'){
    for (const s of stars){
      g.fillStyle = 'rgba(210,225,255,' + (0.2 + 0.2*Math.sin(S.t*1.3+s.tw)).toFixed(2) + ')'; g.fillRect(s.x*W, s.y*hz*0.7, s.s, s.s);
    }
  }
}
function drawSpectrumRing(cx, cy, R, alpha){
  g.save(); g.globalCompositeOperation = 'lighter';
  const n = 64;
  g.lineCap = 'round'; g.lineWidth = Math.max(1, R*0.028);
  for (let i=0;i<n;i++){
    const a = i/n*Math.PI*2 - Math.PI/2;
    const bi = i < n/2 ? i/(n/2)*11 : (n-i)/(n/2)*11;
    const lv = F.bands[Math.min(11, Math.round(bi))];
    const r0 = R, r1 = R + R*(0.08 + lv*0.6);
    g.strokeStyle = pal(i%3===0 ? 1 : 0, alpha*(0.25+lv*0.7), 14);
    g.beginPath(); g.moveTo(cx+Math.cos(a)*r0, cy+Math.sin(a)*r0); g.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1); g.stroke();
  }
  g.strokeStyle = 'rgba(225,235,255,' + (alpha*0.5).toFixed(3) + ')'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx,cy,R*0.92,0,Math.PI*2); g.stroke();
  const gl = g.createRadialGradient(cx,cy,0,cx,cy,R*(0.9+F.bass*0.2));
  gl.addColorStop(0, pal(0, alpha*0.35, 20)); gl.addColorStop(1, pal(0, 0, 0));
  g.fillStyle = gl; g.beginPath(); g.arc(cx,cy,R*(0.9+F.bass*0.2),0,Math.PI*2); g.fill();
  g.restore();
}
function drawGround(){
  const gr = g.createLinearGradient(0, vpY+bobPx, 0, H);
  gr.addColorStop(0, '#0d1b48'); gr.addColorStop(0.35, '#070f2c'); gr.addColorStop(1, '#030718');
  g.fillStyle = gr; g.fillRect(0, vpY+bobPx, W, H - vpY - bobPx + 2);
  g.lineWidth = 1;
  for (const X of [-2.7, 2.7]){
    const a = P(X,0,S.camZ+0.6), b = P(X,0,S.camZ+FAR);
    g.strokeStyle = 'rgba(150,180,255,0.22)'; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  }
  const z0 = Math.ceil((S.camZ+0.6)/2.5)*2.5;
  for (let z=z0; z<S.camZ+FAR*0.6; z+=2.5){
    const a = P(-4,0,z), b = P(4,0,z), fog = (z-S.camZ)/(FAR*0.6);
    g.strokeStyle = 'rgba(150,180,255,' + (0.1*(1-fog)).toFixed(3) + ')';
    g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke();
  }
}
function drawBuilding(b, side){
  const X = side*4;
  const za = Math.max(b.z0, S.camZ+0.35); const zb = Math.min(b.z1, S.camZ+FAR);
  if (zb <= za) return;
  const fog = clamp((za - S.camZ)/FAR);
  const base = [8+b.tone*0.6, 13+b.tone*0.8, 34+b.tone*1.4], fogC = [22,40,96];
  const c = base.map((v,i) => Math.round(lerp(v, fogC[i], Math.pow(fog,0.75))));
  if (b.gapBefore && b.z0 > S.camZ + 0.35){
    const a0 = P(X,0,b.z0), a1 = P(X,b.h,b.z0), a2 = P(side*11,b.h,b.z0), a3 = P(side*11,0,b.z0);
    quad(a0,a1,a2,a3); g.fillStyle = 'rgb(' + c.map(v=>v+6).join(',') + ')'; g.fill();
  }
  const p0 = P(X,0,za), p1 = P(X,b.h,za), p2 = P(X,b.h,zb), p3 = P(X,0,zb);
  quad(p0,p1,p2,p3);
  const fg = g.createLinearGradient(0, p1[1], 0, p0[1]);
  fg.addColorStop(0, 'rgb(' + c.join(',') + ')'); fg.addColorStop(1, 'rgb(' + c.map((v,i)=>Math.round(v*0.55)).join(',') + ')');
  g.fillStyle = fg; g.fill();
  g.strokeStyle = 'rgba(170,195,255,' + (0.28*(1-fog)).toFixed(3) + ')'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(p1[0],p1[1]); g.lineTo(p2[0],p2[1]); g.moveTo(p0[0],p0[1]); g.lineTo(p1[0],p1[1]); g.stroke();
  // windows
  const cw = (b.z1-b.z0)/b.cols, ar = S.mode==='ar';
  for (let ci=0; ci<b.cols; ci++){
    const zc0 = b.z0 + (ci+0.3)*cw, zc1 = b.z0 + (ci+0.7)*cw;
    if (zc0 < S.camZ+0.5 || zc0 > S.camZ+FAR) continue;
    const wf = clamp((zc0 - S.camZ)/FAR);
    const lv = F.bands[(ci + b.seed) % 12];
    const litRows = lv * b.rows * 1.1;
    for (let r=0; r<b.rows; r++){
      const y0 = 2.6 + r*3, y1 = y0 + 1.3; if (y1 > b.h - 0.6) break;
      const a = P(X,y0,zc0), bb = P(X,y1,zc0), cc = P(X,y1,zc1), d = P(X,y0,zc1);
      if (Math.abs(cc[0]-bb[0]) < 0.5) continue;
      quad(a,bb,cc,d);
      if (ar && r < litRows){
        const k = r / Math.max(1,b.rows-1);
        g.fillStyle = 'hsla(' + lerp(S.hues[0], S.hues[1], k).toFixed(0) + ',' + S.sat + '%,' + (S.lit + 6 + k*10).toFixed(0) + '%,' + (0.78*(1-wf*0.6)).toFixed(3) + ')';
      } else if (b.lit[ci*b.rows + r]){
        g.fillStyle = ar ? 'rgba(170,195,255,' + (0.1*(1-wf*0.7)).toFixed(3) + ')' : 'rgba(255,214,160,' + (0.62*(1-wf*0.7)).toFixed(3) + ')';
      } else {
        g.fillStyle = 'rgba(4,8,23,' + (0.7*(1-wf*0.5)).toFixed(3) + ')';
      }
      g.fill();
    }
  }
}
function drawLamps(){
  const sp = 14, list = [];
  for (const side of [-1,1]){
    const off = side>0 ? sp/2 : 0;
    for (let z = Math.ceil((S.camZ + 1 - off)/sp)*sp + off; z < S.camZ + FAR*0.8; z += sp) list.push([z, side]);
  }
  list.sort((a,b) => b[0]-a[0]);
  const ar = S.mode==='ar';
  for (const [z, side] of list){
    const base = P(side*3.3,0,z), top = P(side*3.3,4.6,z), head = P(side*2.9,4.55,z);
    const dz = base[2], fog = clamp(dz/(FAR*0.8));
    g.strokeStyle = 'rgba(90,115,190,' + (0.9*(1-fog)).toFixed(3) + ')'; g.lineWidth = Math.max(1, 0.08*f/dz);
    g.beginPath(); g.moveTo(base[0],base[1]); g.lineTo(top[0],top[1]); g.lineTo(head[0],head[1]); g.stroke();
    const R = 1.1*f/dz*(ar ? 1 + F.bass*0.5 : 1);
    const gl = g.createRadialGradient(head[0],head[1],0,head[0],head[1],R);
    const c0 = ar ? pal(0, 0.6*(1-fog*0.6), 16) : 'rgba(255,214,160,' + (0.55*(1-fog*0.6)).toFixed(3) + ')';
    gl.addColorStop(0, c0); gl.addColorStop(1, 'rgba(120,150,255,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gl;
    g.beginPath(); g.arc(head[0],head[1],R,0,Math.PI*2); g.fill(); g.restore();
  }
}
function drawRipples(){
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const rp of ripples){
    const age = S.t - rp.t, a = Math.pow(1 - age/1.6, 1.5), rad = (0.4 + age*7)*(rp.sc||1), ox = rp.x||0;
    for (const [mul, lw, al] of [[1, 7, 0.12], [1, 1.4, 0.85], [0.72, 1, 0.45]]){
      g.strokeStyle = rp.fh != null ? 'hsla(' + rp.fh + ',95%,78%,' + clamp(a*al).toFixed(3) + ')' : pal(rp.hue, a*al, 18); g.lineWidth = lw;
      g.beginPath(); let pen = false;
      for (let i=0;i<=80;i++){
        const th = i/80*Math.PI*2, r = rad*mul;
        const Z = rp.z + Math.sin(th)*r;
        if (Z - S.camZ < 0.4){ pen = false; continue; }
        const p = P(ox + Math.cos(th)*r, 0.02, Z);
        if (!pen){ g.moveTo(p[0],p[1]); pen = true; } else g.lineTo(p[0],p[1]);
      }
      g.stroke();
    }
  }
  g.restore();
}
function drawRibbons(){
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  const amp = 0.4 + F.mid*2.2;
  for (let k=0;k<3;k++){
    const ph = k*2.1, pts = [];
    for (let s=0;s<=56;s++){
      const u = s/56, Z = S.camZ + 1.6 + u*u*50;
      const X = Math.sin(Z*0.11 + S.t*0.8 + ph)*(S.mode==='vr'?5:2.5);
      const Y = 3.2 + k*1.0 + Math.sin(Z*0.23 - S.t*1.8 + ph)*amp;
      pts.push([P(X,Y,Z), u]);
    }
    for (const pass of [0,1]){
      for (let i=1;i<pts.length;i++){
        const [p, u] = pts[i], q = pts[i-1][0];
        const base = (0.18 + F.mid*0.85)*(1-u*0.85)*safeFade(p[0],p[1]);
        const w = Math.max(0.8, (0.06 + F.mid*0.12)*f/p[2]);
        g.strokeStyle = pal(k, pass ? base : base*0.14, pass ? 22 : 8);
        g.lineWidth = pass ? Math.max(0.8, w*0.35) : w*2.4;
        g.beginPath(); g.moveTo(q[0],q[1]); g.lineTo(p[0],p[1]); g.stroke();
      }
    }
  }
  g.restore();
}
function drawParticles(){
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const p of parts){
    const q = P(p.X,p.Y,p.Z); if (q[2] > FAR) continue;
    const life = 1 - p.age/p.life, sz = clamp(0.045*f/q[2]*(0.5+life), 0.7, 4.5);
    const a = life*safeFade(q[0],q[1]);
    g.fillStyle = pal(p.hue, a*0.18, 20); g.beginPath(); g.arc(q[0],q[1],sz*3,0,Math.PI*2); g.fill();
    g.fillStyle = 'rgba(235,242,255,' + (a*0.9).toFixed(3) + ')'; g.beginPath(); g.arc(q[0],q[1],sz*0.8,0,Math.PI*2); g.fill();
  }
  g.restore();
}
function drawFlash(){
  if (S.flash < 0.02) return;
  const gr = g.createRadialGradient(W/2,H/2,Math.min(W,H)*0.38,W/2,H/2,Math.max(W,H)*0.75);
  gr.addColorStop(0, 'rgba(200,220,255,0)'); gr.addColorStop(1, 'rgba(200,220,255,' + (S.flash*0.22).toFixed(3) + ')');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0,0,W,H); g.restore();
}
function drawVR(){
  const gr0 = g.createLinearGradient(0, vpY+bobPx, 0, H);
  gr0.addColorStop(0, '#0b1850'); gr0.addColorStop(1, '#02040f');
  g.fillStyle = gr0; g.fillRect(0, vpY+bobPx, W, H);
  g.lineWidth = 1;
  const ga = 0.16 + F.bass*0.4;
  for (let X=-30; X<=30; X+=3){ const a = P(X,0,S.camZ+0.6), b = P(X,0,S.camZ+FAR); g.strokeStyle = pal(0, ga*0.7, 10); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
  for (let z = Math.ceil(S.camZ/3)*3; z < S.camZ+FAR; z+=3){ const a = P(-30,0,z), b = P(30,0,z); g.strokeStyle = pal(0, ga*(1-(z-S.camZ)/FAR), 10); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); }
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const s of warp){
    const x = vpX + s.X*f/s.Z, y = vpY + bobPx + s.Y*f/s.Z, zz = s.Z + 2 + F.bass*4;
    const x2 = vpX + s.X*f/zz, y2 = vpY + bobPx + s.Y*f/zz;
    if (y > vpY + bobPx + 2 && s.Y > 0) continue;
    g.strokeStyle = 'rgba(210,225,255,' + (0.8*clamp(1 - s.Z/80)).toFixed(3) + ')'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x2,y2); g.lineTo(x,y); g.stroke();
  }
  g.restore();
  drawSpectrumRing(vpX, vpY + bobPx - H*0.02, Math.min(W,H)*0.09*(1+F.bass*0.3), 1);
  const list = [];
  for (const side of [-1,1]) for (let z = Math.ceil(S.camZ/4)*4 + 4; z < S.camZ + FAR; z += 4) list.push([z, side]);
  list.sort((a,b) => b[0]-a[0]);
  for (const [z, side] of list){
    const idx = ((Math.round(z/4) % 12) + 12) % 12, lv = F.bands[idx], hgt = 0.8 + lv*13;
    const a = P(side*7,0,z), b = P(side*7,hgt,z), c = P(side*8.2,hgt,z), d = P(side*8.2,0,z);
    const fog = clamp((z-S.camZ)/FAR), al = 1 - fog*0.75;
    const gr = g.createLinearGradient(0, a[1], 0, b[1]);
    gr.addColorStop(0, pal(0, 0.06*al, 0)); gr.addColorStop(1, pal(1, 0.75*al, 16));
    quad(a,b,c,d); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(225,235,255,' + (0.7*al).toFixed(3) + ')'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(b[0],b[1]); g.lineTo(c[0],c[1]); g.stroke();
  }
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const r of rings){
    const dz = r.z - S.camZ, R = 7*f/dz, a = clamp(1 - dz/46)*clamp(dz/2);
    const c = P(0, EYE, r.z);
    g.strokeStyle = pal(r.hue, a*0.2, 10); g.lineWidth = Math.max(4, 0.9*f/dz);
    g.beginPath(); g.arc(c[0], c[1], R, 0, Math.PI*2); g.stroke();
    g.strokeStyle = 'rgba(230,238,255,' + (a*0.85).toFixed(3) + ')'; g.lineWidth = Math.max(1, 0.12*f/dz);
    g.beginPath(); g.arc(c[0], c[1], R, 0, Math.PI*2); g.stroke();
  }
  g.restore();
  drawRipples(); drawRibbons(); drawParticles(); drawFlash();
}
function drawStreet(){
  const ar = S.mode==='ar';
  if (ar) drawSpectrumRing(vpX, H*0.16 + bobPx, Math.min(W,H)*0.06*(1+F.bass*0.25), 0.95);
  drawGround();
  const all = sideL.map(b => [b,-1]).concat(sideR.map(b => [b,1]));
  all.sort((a,b) => b[0].z0 - a[0].z0);
  for (const [b,side] of all) drawBuilding(b, side);
  drawLamps();
  if (ar){ drawRipples(); if (S.party){ drawSyncLines(); drawFriends(); } drawRibbons(); drawParticles(); drawFlash(); }
  else if (S.party) drawFriends();
}
function roundRect(x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
function glassPanel(x,y,w,h,r){
  roundRect(x,y,w,h,r);
  const gr = g.createLinearGradient(x,y,x+w,y+h);
  gr.addColorStop(0,'rgba(170,195,255,0.16)'); gr.addColorStop(1,'rgba(120,150,255,0.05)');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(190,210,255,0.28)'; g.lineWidth = 1; g.stroke();
}
function drawHUD(){
  const s = clamp(W/900, 0.72, 1.15), pad = 16*s;
  const font = (n,w) => (w||400) + ' ' + (n*s).toFixed(1) + 'px Manrope, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  // safety zone
  if (S.mode==='ar' && S.safe){
    g.save(); g.setLineDash([4*s, 6*s]); g.strokeStyle = 'rgba(210,225,255,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(W/2, H*0.56, W*0.17, H*0.2, 0, 0, Math.PI*2); g.stroke(); g.restore();
    g.font = font(10.5, 500); g.fillStyle = 'rgba(210,225,255,0.8)'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('보행 시야 확보 구역', W/2, H*0.56 + H*0.2 + 8*s);
  }
  const p = PRESETS[S.preset];
  // top-left: mode + track
  const modeLbl = S.mode==='ar' ? 'AR Glass · 실시간 분석' : S.mode==='vr' ? 'VR · 제자리 몰입 모드' : '효과 꺼짐 · 평소의 밤길';
  const track = !S.playing ? '대기 중 · 재생을 눌러 보세요' : S.source==='file' ? S.fileName : p.name + ' 데모 비트';
  g.font = font(15, 500);
  let tr = track; const maxW = W*0.42; while (g.measureText(tr).width > maxW && tr.length > 4) tr = tr.slice(0,-2);
  if (tr !== track) tr += '…';
  g.font = font(11, 500); const mw = g.measureText(modeLbl).width + 18*s;
  g.font = font(15, 500); const tw = g.measureText(tr).width;
  const pw = Math.max(mw, tw) + 28*s, ph = 62*s;
  glassPanel(pad, pad, pw, ph, 16*s);
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = S.playing && S.mode!=='off' ? '#d3e2ff' : 'rgba(210,225,255,0.45)';
  g.beginPath(); g.arc(pad + 17*s, pad + 20*s, 3*s, 0, Math.PI*2); g.fill();
  g.font = font(11, 500); g.fillStyle = 'rgba(210,225,255,0.75)'; g.fillText(modeLbl, pad + 26*s, pad + 13*s);
  g.font = font(15, 500); g.fillStyle = '#eef3ff'; g.fillText(tr, pad + 14*s, pad + 32*s);
  // top-right: BPM
  const bpm = S.source==='file' ? (S.bpmEst ? '~' + Math.round(S.bpmEst) : '--') : String(p.bpm);
  const mood = S.source==='file' ? '음색 기반 자동 색' : p.mood;
  g.font = font(30, 300); const bw = g.measureText(bpm).width;
  g.font = font(11, 400); const mdw = g.measureText(mood).width;
  const rw = Math.max(bw + 42*s, mdw) + 28*s;
  glassPanel(W - pad - rw, pad, rw, ph + 8*s, 16*s);
  g.textAlign = 'left';
  g.font = font(30, 300); g.fillStyle = '#eef3ff'; g.fillText(bpm, W - pad - rw + 14*s, pad + 6*s);
  g.font = font(11, 500); g.fillStyle = 'rgba(210,225,255,0.7)'; g.fillText('BPM', W - pad - rw + 20*s + bw, pad + 20*s);
  g.font = font(11, 400); g.fillStyle = 'rgba(210,225,255,0.7)'; g.fillText(mood, W - pad - rw + 14*s, pad + 48*s);
  // bottom-left: level meters
  const mW = Math.min(110*s, W*0.2), bh = 3*16*s + 20*s, bx = pad, by = H - pad - bh, bwid = mW + 58*s;
  glassPanel(bx, by, bwid, bh, 16*s);
  [['저음', F.bass], ['중음', F.mid], ['고음', F.high]].forEach(([lb, v], k) => {
    const y = by + 12*s + k*16*s;
    g.font = font(11, 400); g.fillStyle = 'rgba(210,225,255,0.75)'; g.fillText(lb, bx + 14*s, y);
    g.fillStyle = 'rgba(210,225,255,0.14)'; roundRect(bx + 44*s, y + 5*s, mW, 3*s, 1.5*s); g.fill();
    const gr = g.createLinearGradient(bx + 44*s, 0, bx + 44*s + mW, 0);
    gr.addColorStop(0, 'rgba(126,166,255,0.9)'); gr.addColorStop(1, 'rgba(230,238,255,1)');
    g.fillStyle = S.mode==='off' ? 'rgba(210,225,255,0.5)' : gr; roundRect(bx + 44*s, y + 5*s, Math.max(3, mW*clamp(v)), 3*s, 1.5*s); g.fill();
  });
  // bottom-right: beat
  const dw = 4*16*s + 40*s, dx = W - pad - dw, dy = H - pad - 36*s;
  glassPanel(dx, dy, dw, 36*s, 18*s);
  g.font = font(10, 500); g.fillStyle = 'rgba(210,225,255,0.6)'; g.textBaseline = 'middle'; g.fillText('BEAT', dx + 12*s, dy + 18*s);
  for (let i=0;i<4;i++){
    const on = i === S.beat, x = dx + 50*s + i*14*s, y = dy + 18*s;
    if (on && S.mode!=='off'){ g.fillStyle = 'rgba(126,166,255,0.35)'; g.beginPath(); g.arc(x, y, 8*s, 0, Math.PI*2); g.fill(); }
    g.fillStyle = on ? '#eef3ff' : 'rgba(210,225,255,0.25)';
    g.beginPath(); g.arc(x, y, (on ? 3.5 : 2.5)*s, 0, Math.PI*2); g.fill();
  }
  g.textBaseline = 'top';
}
function draw(){
  if (!W || !H) return;
  f = Math.min(W*0.75, H*1.0); vpX = W/2; vpY = H*0.42;
  bobPx = (reduceMotion ? 0 : S.bob*H*0.012 + jumpH()*H*0.05) + Math.sin(S.t*2.2)*H*0.002;
  g.setTransform(DPR,0,0,DPR,0,0);
  drawSky();
  if (S.mode==='vr') drawVR(); else drawStreet();
  drawHUD(); drawPartyHUD();
}

let loopOn = false, last = performance.now();
function frame(now){
  const dt = clamp((now-last)/1000, 0, 0.05); last = now; S.t += dt;
  update(dt, now/1000); draw();
  if (reduceMotion && !S.playing){ loopOn = false; return; }
  requestAnimationFrame(frame);
}
function ensureLoop(){ if (!loopOn){ loopOn = true; last = performance.now(); requestAnimationFrame(frame); } }

function resize(){
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height;
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  if (!loopOn) draw();
}
new ResizeObserver(resize).observe(cv);
fillSide(sideL); fillSide(sideR);
resize();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!loopOn) draw(); });
if (reduceMotion){ update(0.016, performance.now()/1000); draw(); } else ensureLoop();
refreshUI();
window.__onbeat = { S, F };
})();
