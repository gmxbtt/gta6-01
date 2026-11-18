// main.js — SOLMAR HEAT: wires every system together, runs the game loop,
// owns the camera, the menus and the save, and stages deterministic shots
// for screenshots (?shot=chase|drive|foot|mission).
import * as THREE from 'three';
import { GAME, CAR_TYPES } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { SaveManager } from './save.js';
import { Effects } from './effects.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { Car } from './vehicles.js';

const STORY_INTRO = 'Solmar Bay, 6:47 PM. Rico Vega is out of cash, out of luck, and out of time. Lena has one last plan: four jobs, one big score, and a city that never sleeps. Steal a car. Run the jobs. Don\'t get caught.';

class Game {
  constructor() {
    this.time = 0;
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.cash = 0;
    this.save = new SaveManager();
    this.audio = new AudioEngine();
    this.shake = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 8;
    this.parkedCars = [];
    this._wastedAt = 0;
  }

  async init() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);
    this.input.onPause = () => this.togglePause();
    this.traffic = new TrafficManager(this.scene, this.world);
    this.peds = new PedestrianManager(this.scene, this.world);
    this.player = new Player(this.scene, this.world, this);
    this.police = new PoliceManager(this.scene, this.world, this);
    this.missions = new MissionManager(this.world, this);
    this.missions.initPickups(this.scene, THREE);
    this.hud = new HUD(this);

    this.traffic.spawn(14);
    this.peds.spawn(26);
    this._spawnParkedCars();

    this._buildMenus();
    this._applyShotParam();
    window.addEventListener('resize', () => this._onResize());
    this.renderer.setAnimationLoop((t) => this.loop(t));
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Parked cars along curbs: easy first steals.
  _spawnParkedCars() {
    const spots = [
      { x: -81, z: -20.6, h: 0 }, { x: -27, z: 34.4, h: Math.PI }, { x: 27, z: -87.4, h: 0 },
      { x: 81, z: 20.6, h: Math.PI }, { x: 135, z: -74.6, h: 0 }, { x: -135, z: 87.4, h: Math.PI },
      { x: -27, z: -128.6, h: 0 }, { x: 27, z: 128.6, h: Math.PI }, { x: 87.4, z: -27, h: Math.PI / 2 },
      { x: -34.4, z: 81, h: -Math.PI / 2 },
    ];
    const types = ['sedan', 'coupe', 'sedan', 'taxi', 'van', 'sedan', 'coupe', 'sedan', 'taxi', 'sedan'];
    spots.forEach((s, i) => {
      const car = new Car(types[i], s.x, s.z, s.h);
      car.speed = 0;
      this.scene.add(car.mesh);
      this.parkedCars.push(car);
    });
  }

  allCars() {
    const cars = [];
    for (const e of this.traffic.cars) cars.push(e.car);
    cars.push(...this.parkedCars);
    cars.push(...this.police.cars);
    if (this.player.inCar) cars.push(this.player.inCar);
    return cars;
  }

  addCash(n) {
    this.save.data.cash += n;
    this.save.save();
  }

  addHeat(n, reason) {
    this.police.addHeat(n, reason);
  }

  // --- callbacks used by the subsystems ---
  onCrash(impact, pos) {
    this.audio.crash(Math.min(1, impact / 25));
    this.effects.burst(pos.x, 1, pos.z, 'crash');
    this.shake = Math.min(1, this.shake + impact / 30);
    if (this.player.inCar) this.player.hurt(impact * 0.15);
  }

  onPlayerHurt(health) {
    this.shake = Math.min(1, this.shake + 0.4);
    if (health <= 0) this._wasted();
  }

  onCarWrecked(car) {
    this.audio.crash(0.8);
    this.effects.burst(car.pos.x, 1.5, car.pos.z, 'crash');
    this.effects.burst(car.pos.x, 1.5, car.pos.z, 'smoke');
    this.hud.showMessage('Your car is wrecked — get out!', 'bad');
    this.player.exitCar();
    this.parkedCars.push(car);
  }

  onExitCar(car) {
    if (!this.parkedCars.includes(car)) this.parkedCars.push(car);
  }

  returnCar(car) {
    // A car the player left behind just stays parked where it is.
    if (!this.parkedCars.includes(car) && !this.traffic.cars.some((e) => e.car === car)) {
      this.parkedCars.push(car);
    }
  }

  tryPunch(player) {
    this.audio.punch();
    const ped = this.peds.nearestInFront(player.pos.x, player.pos.z, player.heading, 2.4, 0.3);
    if (ped) {
      this.peds.knockDown(ped);
      this.effects.burst(ped.x, 1.4, ped.z, 'stars');
      this.addHeat(1, 'Assault! A witness called the SBPD.');
      this.peds.scare(player.pos.x, player.pos.z, 15);
      return;
    }
    // Punching a cop is a bad idea, but it is possible.
    const cop = this.police.cops.find((c) => Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 2.4);
    if (cop) {
      this.addHeat(2, 'You hit an officer! The SBPD is coming.');
      this.police.cops.splice(this.police.cops.indexOf(cop), 1);
      this.scene.remove(cop.mesh);
      this.effects.burst(cop.x, 1.4, cop.z, 'stars');
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.save.data.bustedCount++;
    this.save.data.cash = Math.max(0, this.save.data.cash - GAME.bustedFine);
    this.save.save();
    this.police.clearWanted();
    this.missions.abortMission();
    this.audio.fail();
    this.audio.setSiren(false);
    this._showEndScreen('BUSTED', `The SBPD caught up with you. Fine: $${GAME.bustedFine}. The jobs are still waiting.`);
    this.hud.hide();
  }

  _wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.save.data.wastedCount++;
    this.save.data.cash = Math.max(0, this.save.data.cash - GAME.wastedFine);
    this.save.save();
    this.police.clearWanted();
    this.missions.abortMission();
    this.audio.fail();
    this.audio.setSiren(false);
    this._showEndScreen('WASTED', `You got beaten down in the streets of Solmar Bay. Hospital bill: $${GAME.wastedFine}.`);
    this.hud.hide();
  }

  // --- menus ---
  _buildMenus() {
    const startScreen = document.getElementById('start-screen');
    const missionList = document.getElementById('mission-list');
    const renderMissions = () => {
      missionList.innerHTML = '';
      this.missions.defs.forEach((d, i) => {
        const li = document.createElement('li');
        const done = this.missions.done.has(d.id);
        li.className = done ? 'done' : '';
        li.innerHTML = `<span class="m-num">${done ? '✓' : i + 1}</span> <b>${d.title}</b> — ${d.giver} · $${d.payout}`;
        missionList.appendChild(li);
      });
    };
    renderMissions();
    document.getElementById('story-text').textContent = STORY_INTRO;
    document.getElementById('btn-start').addEventListener('click', () => this.startGame(false));
    const cont = document.getElementById('btn-continue');
    if (this.save.hasSave) {
      cont.classList.remove('hidden');
      cont.addEventListener('click', () => this.startGame(true));
    }
    document.getElementById('btn-restart-save').addEventListener('click', () => {
      this.save.clear();
      this.audio.click();
      renderMissions();
      cont.classList.add('hidden');
      this.hud.showMessage('Save wiped. Fresh start, Rico.', 'info');
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-quit-menu').addEventListener('click', () => {
      document.getElementById('pause-screen').classList.add('hidden');
      this.state = 'menu';
      document.getElementById('start-screen').classList.remove('hidden');
      this.hud.hide();
      renderMissions();
    });
    document.getElementById('btn-retry').addEventListener('click', () => {
      document.getElementById('end-screen').classList.add('hidden');
      this.player.resetTo(0, 27);
      this.player.health = 100;
      this.state = 'playing';
      this.hud.show();
      this.hud.setObjective('Press M to take the next job.');
    });
    document.getElementById('btn-end-menu').addEventListener('click', () => {
      document.getElementById('end-screen').classList.add('hidden');
      this.state = 'menu';
      document.getElementById('start-screen').classList.remove('hidden');
      this.hud.hide();
      renderMissions();
    });
    document.getElementById('btn-music').addEventListener('click', (e) => {
      const on = this.audio.toggleMusic();
      e.target.textContent = on ? 'Music: ON' : 'Music: OFF';
    });
    this._renderMissions = renderMissions;
  }

  _showEndScreen(title, text) {
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-text').textContent = text;
    document.getElementById('end-screen').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  startGame(continued) {
    this.audio.init();
    this.audio.setMuted(false);
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('end-screen').classList.add('hidden');
    this.state = 'playing';
    this.hud.show();
    this.hud.setObjective(this.missions.allDone
      ? 'All jobs done. Solmar Bay is yours, Rico.'
      : 'Press M to take the next job.');
    this.hud.showMessage(continued ? 'Welcome back, Rico.' : 'Welcome to Solmar Bay, Rico. Press M for your first job.', 'info', 6);
    this._renderMissions();
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  // --- deterministic staging for screenshots (?shot=...) ---
  _applyShotParam() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return;
    this.shotMode = shot;
    // Skip the menu: the shot is the game itself.
    document.getElementById('start-screen').classList.add('hidden');
    this.audio.init();
    this.state = 'playing';
    this.hud.show();
    if (shot === 'chase') {
      // Rico in a red coupe at speed, 3 stars, four cruisers flanking him.
      const car = new Car('coupe', -27, -27, Math.PI / 2);
      this.scene.add(car.mesh);
      this.player.enterCar(car);
      car.speed = 22;
      this.player.pos.set(-27, 0, -27);
      this.police.setWanted(3);
      const cruisers = [
        { x: -38, z: -15, s: 22 }, { x: -38, z: -39, s: 23 },
        { x: -14, z: -14, s: 20 }, { x: -14, z: -40, s: 21 },
      ];
      for (const c of cruisers) {
        const pc = new Car('police', c.x, c.z, Math.PI / 2);
        pc.speed = c.s;
        this.scene.add(pc.mesh);
        this.police.cars.push(pc);
      }
      this.missions.startMission(this.missions.defs[1]);
      this.camYaw = Math.PI / 2 + Math.PI;
      this.hud.setObjective('Getaway: Escape to the marina hideout — stay ahead of the police!');
    } else if (shot === 'drive') {
      const car = new Car('coupe', 27, -81, 0);
      this.scene.add(car.mesh);
      this.player.enterCar(car);
      car.speed = 20;
      this.player.pos.set(27, 0, -81);
      this.camYaw = Math.PI;
      this.hud.setObjective('Cruise the avenues of Solmar Bay at sunset.');
    } else if (shot === 'foot') {
      this.player.resetTo(0, 27);
      this.player.heading = Math.PI * 0.75;
      this.camYaw = Math.PI * 0.75;
      // A crowd right in front of the camera.
      this.hud.setObjective('Explore Solmar Bay on foot — press E near a car to steal it.');
    } else if (shot === 'mission') {
      // Taxi on the avenue, clear of the streetlight behind it.
      const car = new Car('taxi', 27, 60, Math.PI);
      this.scene.add(car.mesh);
      this.player.enterCar(car);
      car.speed = 12;
      this.player.pos.set(27, 0, 60);
      this.missions.startMission(this.missions.defs[2]);
      this.camYaw = Math.PI;
      this.hud.setObjective('Parcel Run: Drop-off 1 — the plaza kiosk');
    }
    // Park the camera behind the action for the shot.
    this._updateCamera(0.5, true);
  }

  // --- interaction keys handled once per frame ---
  _handleActions() {
    const input = this.input;
    if (input.hit('KeyE')) {
      if (this.player.inCar) {
        this.player.exitCar();
      } else {
        // Mission 4 vault grab first, then entering a car.
        if (this.missions.tryGrab()) return;
        const pos = this.player.pos;
        let best = null;
        let bestD = 4.5;
        const consider = (car) => {
          const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
          if (d < bestD) { bestD = d; best = car; }
        };
        this.traffic.cars.forEach((e) => consider(e.car));
        this.parkedCars.forEach(consider);
        this.police.cars.forEach(consider);
        if (best) {
          const trafficEntry = this.traffic.cars.find((e) => e.car === best);
          if (trafficEntry) {
            this.traffic.steal(trafficEntry);
            this.parkedCars.push(best);
            this.addHeat(1, 'Grand theft auto! Someone saw you take that car.');
          } else if (this.parkedCars.includes(best)) {
            this.addHeat(1, 'Grand theft auto! Someone saw you take that car.');
          } else if (this.police.cars.includes(best)) {
            this.addHeat(2, 'You stole a police cruiser! The SBPD is furious.');
            this.police.cars.splice(this.police.cars.indexOf(best), 1);
            this.parkedCars.push(best);
          }
          this.player.enterCar(best);
          this.hud.showMessage(`You're driving the ${CAR_TYPES[best.type].name}.`, 'info');
        }
      }
    }
    if (input.hit('KeyM')) {
      if (this.state !== 'playing') return;
      if (this.missions.active) {
        this.hud.showMessage('Job in progress: ' + this.missions.active.def.title, 'info');
      } else {
        const next = this.missions.nextMission;
        if (next) this.missions.startMission(next);
        else this.hud.showMessage('All jobs done. Solmar Bay is yours.', 'good');
      }
    }
    if (input.hit('KeyR')) {
      // Restart from the last save: cash and progress reload.
      this.save.load();
      this.player.resetTo(0, 27);
      this.police.clearWanted();
      this.missions.abortMission();
      this.hud.showMessage('Reloaded your save.', 'info');
    }
  }

  _updateCamera(dt, snap) {
    const player = this.player;
    const look = this.input.consumeLook();
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = Math.max(0.05, Math.min(0.9, this.camPitch + look.dy * 0.0022));
    const inCar = !!player.inCar;
    let targetDist = inCar ? 11.5 : 7.5;
    let targetHeight = inCar ? 4.6 : 3.4;
    if (this.shotMode === 'chase') { targetDist = 15; targetHeight = 6; }
    this.camDist += (targetDist - this.camDist) * Math.min(1, dt * 4);
    const focus = player.inCar ? player.inCar.pos : player.pos;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    // The camera trails behind the player's facing when driving; free orbit on foot.
    const followYaw = inCar ? heading : this.camYaw;
    const cx = focus.x - Math.sin(followYaw) * this.camDist;
    const cz = focus.z - Math.cos(followYaw) * this.camDist;
    const cy = focus.y + targetHeight + Math.sin(this.camPitch) * this.camDist * 0.4;
    const desired = new THREE.Vector3(cx, cy, cz);
    if (snap) {
      this.camera.position.copy(desired);
    } else {
      this.camera.position.lerp(desired, Math.min(1, dt * 6));
    }
    const lookAt = new THREE.Vector3(focus.x, focus.y + (inCar ? 1.6 : 1.7), focus.z);
    this.camera.lookAt(lookAt);
    // Speed FOV kick.
    const speedRatio = inCar ? Math.abs(player.inCar.speed) / 32 : 0;
    const targetFov = 62 + speedRatio * 10;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    // Screen shake.
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
  }

  loop(t) {
    const dt = Math.min(0.05, (t - (this._lastT || t)) / 1000 || 0.016);
    this._lastT = t;
    this.time += dt;
    if (this.state === 'playing') {
      this._handleActions();
      this.player.update(dt, this.input, this.camYaw);
      this.traffic.update(dt, this.player.inCar, this.police.cars);
      this.peds.update(dt);
      this.police.update(dt);
      this.missions.update(dt);
      this.missions.updatePickups(dt, this.time);
      this.world.update(dt, this.time);
      this.effects.update(dt);
      // Slow health regen when calm.
      if (this.police.wantedLevel === 0 && this.player.health > 0 && this.player.health < 100) {
        this.player.heal(dt * 2);
      }
      // Engine sound follows the car.
      if (this.player.inCar) {
        this.audio.setEngine(Math.abs(this.player.inCar.speed) / 32, false);
      } else {
        this.audio.setEngine(0, true);
      }
      this._updateCamera(dt, false);
      this.hud.update();
      // Wasted check also fires from damage, but the loop is the backstop.
      if (this.player.health <= 0 && this.state === 'playing') this._wasted();
    } else if (this.state === 'menu') {
      // Slow cinematic orbit behind the start screen.
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 60, 26, Math.cos(a) * 60);
      this.camera.lookAt(0, 4, 0);
      this.traffic.update(dt, null, []);
      this.peds.update(dt);
      this.world.update(dt, this.time);
      this.effects.update(dt);
    }
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
window.__game = game; // playtest hook: lets automated tests read state, nothing else uses it.
game.init().catch((err) => {
  console.error('SOLMAR HEAT failed to start:', err);
  const el = document.getElementById('load-error');
  if (el) {
    el.textContent = 'The game failed to load: ' + err.message;
    el.classList.remove('hidden');
  }
});
