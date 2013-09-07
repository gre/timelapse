(function () {

var INF_BPM = 30;

var vars = {
  time: 0,
  useraction: -9999,
  boom: -9999,
  boomSpeed: 0.2,
  bpm: 50,
  successState: 0.0, 
  fullPulse: false,
  glitch: 0.0,
  frequencyData: new Float32Array(32)
};

var E = (function(_){return{pub:function(a,b,c,d){for(d=-1,c=[].concat(_[a]);c[++d];)c[d](b)},sub:function(a,b){(_[a]||(_[a]=[])).push(b)}}})({});

function clamp (x, min, max) {
  return Math.min(Math.max(x, min), max);
};

function smoothstep (min, max, x) {
  x = clamp((x-min)/(max-min), 0.0, 1.0);
  return x*x*(3-2*x);
};

var NOTES = (function () {
  var notes = {};
  var toneSymbols = "CcDdEFfGgAaB";
  function noteToFrequency (note) {
    return Math.pow(2, (note-69)/12)*440;
  };
  for (var octave = 0; octave < 8; ++octave) {
    for (var t = 0; t < 12; ++t) {
      notes[toneSymbols[t]+octave] = noteToFrequency(octave * 12 + t);
    }
  }
  return notes;
}());

var audio = (function() {
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var filter = ctx.createBiquadFilter();
  filter.frequency.value = 22010;

  var out = ctx.createGainNode();
  var outCompressor = ctx.createDynamicsCompressor();
  out.gain.value = 0;
  out.connect(filter);
  filter.connect(outCompressor);
  outCompressor.connect(ctx.destination);
  var analyser = ctx.createAnalyser();
  analyser.fftSize = vars.frequencyData.length * 2;
  analyser.getFloatFrequencyData(vars.frequencyData);
  outCompressor.connect(analyser);

  
  function envelope (gainNode, time, volume, duration, a, d, s, r) {
    gainNode.gain.cancelScheduledValues(0);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(volume, time + a);
    gainNode.gain.linearRampToValueAtTime(volume * s, time + a + d);
    gainNode.gain.setValueAtTime(volume * s, time + a + d + duration);
    gainNode.gain.linearRampToValueAtTime(0, time + a + d + duration + r);
  }

  function OscGain () {
    this.osc = ctx.createOscillator();
    this.osc.start(0);
    this.out = this.gain = ctx.createGainNode();
    this.osc.connect(this.gain);
  }

  function FM () {
    OscGain.call(this);
    this.mod = new OscGain();
    this.mod.out.connect(this.osc.frequency);
  }

  function Bass (freq, attack, duration, fall) {
    OscGain.call(this);
    this.gain.gain.value = 0;
    this.osc.frequency.value = freq;
    this.freq = freq || 50;
    this.fall = fall || 0;
    this.attack = attack || 0;
    this.duration = duration || 0;
    this.volume = 1.0;
  }

  Bass.prototype = {
    trigger: function (time) {
      var a = this.attack, d = this.attack + 0.06, s = 0.8, r = 0.1;
      envelope(this.gain, time, this.volume, this.duration, a, d, s, r);
      this.osc.frequency.setValueAtTime(this.freq, time);
      this.osc.frequency.linearRampToValueAtTime(0, time + this.fall);
    }
  };

  function Noise () {
    var bufferSize = 2 * ctx.sampleRate,
    noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate),
    output = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    var whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    whiteNoise.start(0);

    var gain = ctx.createGainNode();
    whiteNoise.connect(gain);

    var filter = ctx.createBiquadFilter();
    gain.connect(filter);
    filter.type = "lowpass";

    this.white = whiteNoise;
    this.gain = gain;
    this.out = this.filter = filter;
  }

  var bass = new Bass(80, 0.05, 0.2, 0.3);
  bass.osc.type = "triangle";
  bass.out.connect(out);

  var osc = new FM();
  osc.osc.type = "triangle";
  osc.gain.gain.value = 0.1;
  osc.out.connect(out);

  filter.frequency.value = 20000;
  filter.Q.value = 0;

  var osc2 = new OscGain();
  osc2.osc.frequency.value = 150;
  osc2.osc.detune.value = 5;
  osc2.gain.gain.value = 0.2;
  osc2.out.connect(out);

  var osc3 = new OscGain();
  osc3.osc.type = "sawtooth";
  osc3.osc.frequency.value = 300;
  osc3.gain.gain.value = 0.05;

  var noise = new Noise();
  noise.filter.frequency.value = 180;
  noise.filter.Q.value = 10;
  noise.gain.gain.value = 0.05;
  noise.out.connect(out);


  var smallMelo;
  with (NOTES) {
    smallMelo = [D3,E3,C3,G3];
  }
  N=NOTES;

  function tick (i, time) {
    if (i>0 && i % 128 == 0) {
      set("glitch", 0.1);
      set("fullPulse", true);
    }
    if (i % 128 === 16) {
      set("glitch", 0);
      set("fullPulse", false);
    }

    if (i % 4 === 0) {
      audio.bass.trigger(time);
      E.pub("boom");
    }
    var oscFreq = smallMelo[Math.floor(i/4) % 4];
    osc.osc.frequency.value = oscFreq;
    osc.mod.gain.gain.value = oscFreq;
    osc.mod.osc.frequency.value = oscFreq * 2;
  }

  var ticksPerBeat = 4;
  var scheduleAheadTime = 0.1;
  var lastTickTime = -60 / (ticksPerBeat * vars.bpm);
  var currentTick = -1;
  function update (time, gameTime) {
    var tickTime = getTickTime();
    var nextTickTime;
    while ((nextTickTime = lastTickTime + tickTime) < gameTime + scheduleAheadTime) {
      var audioTickTime = nextTickTime + (time - gameTime);
      currentTick ++;
      lastTickTime = nextTickTime;
      tick(currentTick, audioTickTime);
    }
    analyser.getFloatFrequencyData(vars.frequencyData);
  }

  function getTickTime () {
    return 60 / (ticksPerBeat * vars.bpm);
  }

  function getCurrentBassTime () {
    return lastTickTime - getTickTime() * (currentTick % 4);
  }

  function getBassInterval () {
    return 4 * getTickTime();
  }

  return {
    ctx: ctx,
    bass: bass,
    update: update,
    getCurrentBassTime: getCurrentBassTime,
    getBassInterval: getBassInterval,
    start: function () {
      out.gain.value = 1;
    },
    stop: function () {
      out.gain.value = 0;
    }
  };
}());

var set; // will be defined in the main()
var pauseDuration = 0;

function getAbsoluteTime () {
  return audio.ctx.currentTime;
};
function getGameTime (t) {
  return (t||getAbsoluteTime()) - pauseDuration; 
}

function spaceup () {
}

var lastAction = 0;
function spacedown () {
  var gt = getGameTime();
  var currentBassTime = audio.getCurrentBassTime();
  var bassTime = audio.getBassInterval();

  var d = gt - currentBassTime;
  var delta = d - bassTime;
  if (delta < -bassTime/2) delta += bassTime;

  var percentDelta = 2 * delta / bassTime;
  var absDelta = Math.abs(percentDelta);

  var bpm = vars.bpm;
  var INF = -0.4;
  var SUP = 0.3;

  if (percentDelta < INF) {
    bpm *= 0.8;
    set("successState", 0)//Math.max(0, 1 - percentDelta/INF));
  }
  else if (percentDelta > SUP) {
    bpm *= 0.8;
    set("successState", 0)//Math.min(1, percentDelta/SUP));
  }
  else {
    bpm = bpm - (0.5 * bpm * percentDelta);
    var d = percentDelta < 0 ?
      Math.max(0, 1-percentDelta/INF) :
      Math.max(0, 1-percentDelta/SUP) ;
    set("successState", d);
  }

  bpm = Math.min(200, bpm);

  set("bpm", bpm);

  set("useraction", gt);
  lastAction = gt;

  if (bpm < INF_BPM) {
    E.pub("gameover", 42);
  }
}

function init () {
  E.sub("boom", function () {
    var gt = getGameTime();
    set("boom", gt);
  });
  audio.start();
}

function update () {
  var t = getAbsoluteTime();
  var gt = getGameTime(t);
  audio.update(t, gt);
  this.set("time", gt);
  this.sync("frequencyData");
}

window.main = function (frag) {
  var overlay = document.getElementById("overlay");
  var message = document.getElementById("message");
  var canvas = document.getElementById("viewport");
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.width;
  var h = canvas.height;
  canvas.width = dpr * w;
  canvas.height = dpr * h;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  var glsl = Glsl({
    canvas: canvas,
    fragment: frag,
    variables: vars,
    update: update
  });
  set = function (key, value) {
    glsl.set(key, value);
  };
  var stopAt = null;
  var end = false;
  function start () {
    if (end) return;
    overlay.className = "";
    audio.start();
    glsl.start();
    if (stopAt !== null) {
      pauseDuration += (audio.ctx.currentTime - stopAt);
      stopAt = null;
    }
  }
  function stop () {
    if (end) return;
    message.innerHTML = "Game Paused";
    overlay.className = "visible";
    overlay.style.opacity = 0.5;
    audio.stop();
    glsl.stop();
    stopAt = audio.ctx.currentTime;
    if (spaceIsDown) {
      spaceup();
      spaceIsDown = false;
    }
  }

  E.sub("gameover", function (score) {
    end = true;
    message.innerHTML = "Game Over";
    overlay.className = "visible over";
    setTimeout(stop, 1000);
  });

  // Events
  var spaceIsDown = false;
  function onkeyup (e) {
    if (e.which === 32) {
      e.preventDefault();
      if (spaceIsDown)
        !end && spaceup();
      spaceIsDown = false;
    }
  }
  function onkeydown (e) {
    if (e.which === 32) {
      e.preventDefault();
      if (!spaceIsDown)
        !end && spacedown();
      spaceIsDown = true;
    }
  }
  document.addEventListener("keyup", onkeyup);
  document.addEventListener("keydown", onkeydown);

  // Touch devices
  var identifier = null;
  function getCurrentTouch (e) {
    for (var i=0; i<e.changedTouches.length; ++i)
      if (e.changedTouches[i].identifier === identifier)
        return e.changedTouches[i];
  }
  function ontouchstart (e) {
    e.preventDefault();
    if (identifier !== null) return;
    var touch = e.changedTouches[0];
    identifier = touch.identifier;
    spaceIsDown = true;
    !end && spacedown();
  }
  function ontouchend (e) {
    if (identifier === null) return;
    var touch = getCurrentTouch(e);
    if (!touch) return;
    identifier = null;
    spaceIsDown = false;
    !end && spaceup();
  }
  function ontouchcancel (e) {
    if (identifier === null) return;
    var touch = getCurrentTouch(e);
    if (!touch) return;
    identifier = null;
    spaceIsDown = false;
    !end && spaceup();
  }
  document.addEventListener("touchstart", ontouchstart);
  document.addEventListener("touchend", ontouchend);
  document.addEventListener("touchcancel", ontouchcancel);

  window.onblur = stop;
  window.onfocus = start;

  init();
  start();
};
}());
