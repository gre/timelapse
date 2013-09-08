(function () {
var overlay = document.getElementById("overlay");
var message = document.getElementById("message");

var BPM_MIN = 30;
var BPM_MAX = 150;

var glsl; // Will be implemented

var introTime = 4.5;
var end = false;

var vars = {
  time: 0,
  useraction: 0,
  boom: 0,
  boomSpeed: 0.2,
  bpm: 50,
  successState: 0.0, 
  fullPulse: false,
  glitch: 0.0
};

var E = (function(_){return{pub:function(a,b,c,d){for(d=-1,c=[].concat(_[a]);c[++d];)c[d](b)},sub:function(a,b){(_[a]||(_[a]=[])).push(b)}}})({});

function clamp (x, min, max) {
  return Math.min(Math.max(x, min), max);
};

function smoothstep (min, max, x) {
  x = clamp((x-min)/(max-min), 0.0, 1.0);
  return x*x*(3-2*x);
};

function mix (x, y, a) {
  return x*(1-a) + y*a;
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
    this.out = this.gain = ctx.createGainNode();
    this.osc.connect(this.gain);
  }
  OscGain.prototype = {
    start: function (time, duration) {
      this.osc.start(time, 0, duration);
    }
  };

  function FM () {
    OscGain.call(this);
    this.mod = new OscGain();
    this.mod.out.connect(this.osc.frequency);
  }
  FM.prototype = {
    start: function (time, duration) {
      this.osc.start(time, 0, duration);
      this.mod.start(time, duration);
    }
  };

  function Reverb (time) { // TODO
    var input = ctx.createGain();
    var output = ctx.createGain();
    var drygain = ctx.createGain();
    var wetgain = ctx.createGain();

    var verb = ctx.createConvolver();
    verb.connect(wetgain);

    input.connect(verb);
    input.connect(drygain);

    drygain.connect(output);
    wetgain.connect(output);
    
    function buildImpulse (time) {
          // FIXME: need the audio context to rebuild the buffer.
       var rate = ctx.sampleRate,
          length = rate * time,
          reverse = false,
          decay = 2,
          impulse = ctx.createBuffer(2, length, rate),
          impulseL = impulse.getChannelData(0),
          impulseR = impulse.getChannelData(1);
      for (var i = 0; i < length; i++) {
        var n = reverse ? length - i : i;
        impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
      verb.buffer = impulse;
    }

    this.dry = drygain;
    this.wet = wetgain;
    this.inp = input;
    this.out = output;

    buildImpulse(time||1);
    this.mix(0);
  };

  Reverb.prototype = {
    mix: function (m) {
      this.wet.gain.value = m;
      this.dry.gain.value = 1-m;
    }
  };

  function Kicker (freq, attack, duration, fall) {
    OscGain.call(this);
    this.gain.gain.value = 0;
    this.osc.frequency.value = freq;
    this.freq = freq || 50;
    this.fall = fall || 0;
    this.attack = attack || 0;
    this.duration = duration || 0;
    this.volume = 1.0;
  }

  Kicker.prototype = {
    start: function (time, duration) {
      this.osc.start(time, 0, duration);
    },
    trigger: function (time) {
      var a = this.attack, d = this.attack + 0.06, s = 0.8, r = 0.1;
      this.start(time, this.duration + 1);
      envelope(this.gain, time, this.volume, this.duration, a, d, s, r);
      this.osc.frequency.setValueAtTime(this.freq, time);
      this.osc.frequency.linearRampToValueAtTime(0, time + this.fall);
    }
  };

  function Snare () {
    var noise = new Noise();
    noise.filter.frequency.value = 1000;
    noise.filter.Q.value = 0;
    noise.gain.gain.value = 0;
    this.noise = noise;
    this.out = noise.out;
    this.volume = 0.8;
  }

  Snare.prototype = {
    trigger: function (time) {
      this.noise.start(time, 1);
      envelope(this.noise.gain, time, this.volume, 0.05, 
          0.01, 0.03, 0.3, 0.5);
      /*
      this.noise.filter.frequency.setValueAtTime(5000, time);
      this.noise.filter.frequency.linearRampToValueAtTime(2000, time+0.3);
      */
    }
  };


  function HiHat (duration) {
    var hihat = new Noise();
    hihat.filter.type = "highpass";
    hihat.filter.frequency.value = 15000;
    hihat.filter.Q.value = 10;
    hihat.gain.gain.value = 0;
    this.hihat = hihat;
    this.out = this.hihat.out;
    this.duration = duration||0;
  }

  HiHat.prototype = {
    trigger: function (time) {
      this.hihat.start(time, 1);
      envelope(this.hihat.gain, time, 0.2, this.duration, 
          0.01, 0.015, 0.2, this.duration);
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

    var gain = ctx.createGainNode();
    whiteNoise.connect(gain);

    var filter = ctx.createBiquadFilter();
    gain.connect(filter);
    filter.type = "lowpass";

    this.white = whiteNoise;
    this.gain = gain;
    this.out = this.filter = filter;
  }

  Noise.prototype = {
    start: function (time, duration) {
      this.white.start(time, 0, duration);
    }
  };

  // Sounds!
  var filter = ctx.createBiquadFilter();
  filter.frequency.value = 22010;

  var out = ctx.createGainNode();
  var outCompressor = ctx.createDynamicsCompressor();
  var reverb = new Reverb(1);
  out.gain.value = 0;
  out.connect(filter);
  filter.connect(reverb.inp);
  reverb.out.connect(outCompressor);
  outCompressor.connect(ctx.destination);

  var bass = new FM();
  bass.osc.type = "sine";
  bass.gain.gain.value = 0.5;
  bass.out.connect(out);
  bass.start(0);

  filter.frequency.value = 20000;
  filter.Q.value = 0;

  var osc2 = new OscGain();
  osc2.osc.frequency.value = 150;
  osc2.osc.detune.value = 5;
  osc2.gain.gain.value = 0.2;
  osc2.out.connect(out);
  osc2.start(0);

  /*
  var osc3 = new OscGain();
  osc3.osc.type = "triangle";
  osc3.osc.frequency.value = 1000;
  osc3.gain.gain.value = 0.1;
  osc3.out.connect(out);
  osc3.start(0);
  */

  var noise = new Noise();
  noise.filter.frequency.value = 180;
  noise.filter.Q.value = 10;
  noise.gain.gain.value = 0.05;
  noise.out.connect(out);
  noise.start(0);


  var melo1, melo2, bassMelo;

  with (NOTES) {
    melo1 = [E3,G3,D3,G3,E3,A3,C3,G3];
    melo2 = [E3,B3,D3,G3,E3,C4,C3,D3];
    bassMelo = [G4,D4,F4,C4];
  }

  var DELTAS = [
    Math.pow(2, 0),
    Math.pow(2, 1),
    Math.pow(2, 2)
  ];

  function applyArpeggio (freqParam, baseFreq, time, duration, arpDuration, deltas) {
    if (!deltas) deltas = DELTAS;
    var length = deltas.length;
    var ranges = [];
    for (var t = 0, i = 0; t <= duration; t += arpDuration, i = (i+1) % length) {
      freqParam.setValueAtTime(baseFreq * deltas[i], time + t);
    }
  }

  function meloNote (noteFreq, time, arpeggio, metallic) {
    var fm = new FM();
    var duration = 0.3;
    var release = 0.1;
    fm.osc.type = "triangle";
    fm.osc.frequency.value = 4 * noteFreq;
    fm.mod.osc.frequency.value = 3 * noteFreq;
    fm.mod.osc.type = "sine";
    fm.out.connect(out);
    fm.start(time, 0, 1);
    arpeggio && applyArpeggio(fm.osc.frequency, 4 * noteFreq, time, duration+release, 0.025);
    envelope(fm.gain, time, 0.5, duration, 
        0.01, 0.02, 0.6, 0.2);
    envelope(fm.mod.gain, time, 4 * noteFreq * metallic, duration, 
        0.05, 0.1, 0.6, 0.2);
  }

  function meloPart (i, time) {

  }
  
  function tick (i, time) {
    E.pub("tick", i);
    /*
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
    */
    var r = risk();

    var hasMelo = i > 64;
    var hasHiHat = i > 16;
    var hasSnare = i % 4 == 2;

    if (i == 0) {
      audio.kick(getAbsoluteTime(), 0);
    }

    if (hasMelo) {
      var metallic = 0.5 * r + 0.5 * smoothstep(-1, 1, Math.cos(Math.PI * i / 64));
      var arpeggio = i % 64 >= 32;
      var melo = i % 16 < 8 ? melo1 : melo2;
      var octave = i % 32 < 16 ? 0 : 1;
      var m = melo[i % 8] * (1 << octave);
      meloNote(m, time, arpeggio, metallic);
    }

    if (hasHiHat) {
      var hihat = new HiHat(0.02*vars.bpm/100);
      hihat.out.connect(out);
      hihat.trigger(time);
    }

    if (hasSnare) {
      var snare = new Snare(0.2);
      snare.out.connect(out);
      snare.trigger(time);
    }

    var oscFreq = bassMelo[Math.floor(i/4) % 4];
    bass.osc.frequency.value = oscFreq;
    bass.mod.gain.gain.value = oscFreq * 0.5+0.5*r;
    bass.mod.osc.frequency.value = oscFreq * 0.25;
  }

  function risk () {
    return smoothstep(BPM_MIN*1.2, BPM_MIN, vars.bpm) +
      smoothstep(BPM_MAX*0.8, BPM_MAX, vars.bpm);
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
    //analyser.getFloatFrequencyData(vars.frequencyData);

    noise.gain.gain.value = 0.05+0.9*risk();
    reverb.mix(0.3+0.4*risk());
  }

  function getTickTime () {
    return 60 / (ticksPerBeat * vars.bpm);
  }

  function getCurrentKickTime () {
    return lastTickTime - getTickTime() * (currentTick % 4);
  }

  function getKickInterval () {
    return 4 * getTickTime();
  }

  return {
    ctx: ctx,
    update: update,
    getCurrentKickTime: getCurrentKickTime,
    getKickInterval: getKickInterval,
    kick: function (t, errorRate) {
      errorRate = errorRate * errorRate * errorRate;
      var freq = mix(100, 200, errorRate);
      var speed = mix(0.3, 0.5, errorRate) * 100 / vars.bpm;
      var kick = new Kicker(freq, 0.01, speed, speed);
      kick.osc.type = "square";
      var filter = ctx.createBiquadFilter();
      filter.frequency.value = mix(100, 300, errorRate);
      filter.Q.value = 10 * errorRate;
      kick.out.connect(filter);
      filter.connect(out);
      kick.trigger(t);
      E.pub("boom", t);
    },
    start: function () {
      out.gain.cancelScheduledValues(0);
      out.gain.setValueAtTime(1, ctx.currentTime);
    },
    stop: function () {
      out.gain.cancelScheduledValues(0);
      out.gain.setValueAtTime(0, ctx.currentTime);
    },
    fadeIn: function (duration) {
      var t = ctx.currentTime;
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(1, t+duration);
    },
    fadeOut: function (duration) {
      var t = ctx.currentTime;
      out.gain.setValueAtTime(1, t);
      out.gain.linearRampToValueAtTime(0, t+duration);
    }
  };
}());

var pauseDuration = 0;

function getAbsoluteTime () {
  return audio.ctx.currentTime;
};
function getGameTime (t) {
  return (t||getAbsoluteTime()) - pauseDuration; 
}

function getKickPercent () {
  // FIXME: need to be clean...
  var gt = getGameTime();
  var currentKickTime = audio.getCurrentKickTime();
  var kickTime = audio.getKickInterval();

  var d = gt - currentKickTime;
  var delta = d - kickTime;
  if (delta < -kickTime/2) delta += kickTime;

  var percentDelta = 2 * delta / kickTime;
  return percentDelta;
}

var INF = -0.4;
var SUP = 0.3;

var lastAction = 0;
function action () {
  var gt = getGameTime();
  var percentDelta = getKickPercent();
  var absDelta = Math.abs(percentDelta);

  var successState = 0;

  var bpm = vars.bpm;
  if (percentDelta < INF) {
    bpm *= 0.8;
    successState = 0;
  }
  else if (percentDelta > SUP) {
    bpm *= 0.8;
    successState = 0;
  }
  else {
    bpm = bpm - (0.5 * bpm * percentDelta);
    successState = percentDelta < 0 ?
      Math.max(0, 1-percentDelta/INF) :
      Math.max(0, 1-percentDelta/SUP) ;
  }
  bpm = Math.min(200, bpm);

  audio.kick(getAbsoluteTime(), 1-successState);

  glsl.set("successState", successState);
  glsl.set("bpm", bpm);
  glsl.set("useraction", gt);
  lastAction = gt;
}

function spaceup () {
}

function spacedown () {
  action();
}

function init () {
  E.sub("boom", function (t) {
    // THIS IS MESSY!
    glsl.set("boom", t);
  });
  E.sub("tick", function (i) {
    // TODO
  });
  audio.start();
}

var currentI = -1;
function introMessage (t) {
  var i = Math.floor(t);
  if (currentI === i) return;
  currentI = i;
  if (i == 0) {
    overlay.className = "visible intro";
    message.innerHTML = "Ready?";
  }
  else if (i == 4) {
    overlay.className = "";
    message.innerHTML = "";
  }
  else {
    if (i == 2) {
      overlay.className = "visible intro fadeout";
    }
    message.innerHTML = ""+(4-i);
  }
}

function update () {
  if (!glsl) return;
  var t = getAbsoluteTime();
  var gt = getGameTime(t);
  audio.update(t, gt);
  this.set("time", gt);

  if (end) return;
  var kickPercent = getKickPercent();
  var currentKickTime = audio.getCurrentKickTime();
  var kickTime = audio.getKickInterval();

  //console.log(currentKickTime, vars.boom);
  if (gt < introTime) {
    introMessage(gt);
    if (gt > vars.boom+kickTime) {
      audio.kick(getAbsoluteTime(), 0);
    }
    return;
  }
  
  if (gt > vars.boom+kickTime+kickTime*SUP) {
    action();
  }

  if (vars.bpm < BPM_MIN || vars.bpm > BPM_MAX) {
    E.pub("gameover", 42);
  }
}

window.main = function (frag) {
  var canvas = document.getElementById("viewport");
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.width;
  var h = canvas.height;
  canvas.width = dpr * w;
  canvas.height = dpr * h;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  glsl = Glsl({
    canvas: canvas,
    fragment: frag,
    variables: vars,
    update: update
  });
  var stopAt = null;
  var firstStart = true;
  function start () {
    if (end) return;
    overlay.className = "";
    if (firstStart) {
      firstStart = false;
      audio.fadeIn(2);
    }
    else {
      audio.start();
    }
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
    audio.fadeOut(5);
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

  window.A = audio;
  window.G = glsl;

};
}());
