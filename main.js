(function () {
var overlay = document.getElementById("overlay");
var message = document.getElementById("message");
var $score = document.getElementById("score");
var $gf = document.getElementById("gamefeedback");

var score = 0;
function incrScore (s) {
  score += s;
  $score.innerHTML = score;
}

function triggerFeedbackMessage (msg, color, size) {
  var e = document.createElement("div");
  $gf.appendChild(e);
  e.innerHTML = msg;
  e.style.top = Math.floor(220 - 60*(Math.random()-0.5))+"px";
  e.style.left = Math.floor(80*(Math.random()-0.5))+"px";
  e.style.color = color;
  e.style.fontSize = size+"em";
  setTimeout(function() {
    e.className = "release";
  }, 200);
  setTimeout(function(){
    $gf.removeChild(e);
  }, 1500);
}

var BPM_MIN = 30;
var BPM_MAX = 160;

var glsl; // Will be implemented

var intro = true;
var end = false;

var vars = {
  time: 0,
  useraction: 0,
  kick: 0,
  kickSpeed: 0.2,
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

  function OscGain (t) {
    this.osc = ctx.createOscillator();
    if (t) this.osc.type = t;
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

  function Repeater (d, r, maxDelay) {
    var out = ctx.createGainNode();
    var delay = ctx.createDelay(maxDelay||2);
    delay.delayTime.value = d || 0.1;
    out.connect(delay);
    var repeatGain = ctx.createGainNode();
    repeatGain.gain.value = r || 0;
    delay.connect(repeatGain);
    repeatGain.connect(out);
    this.gain = out;
    this.delay = delay;
    this.repeater = repeatGain;
    this.inp = this.out = out;
  }

  function CrazyWob () {
    // array of [ AudioParam, multiplicator ]
    var _fw = this._fw = [];
    var _sw = this._sw = [];
    var _vw = this._vw = [];
    function fwatch (param, mult) {
      _fw.push([param,mult]);
    }
    function swatch (param, mult) {
      _sw.push([param,mult]);
    }
    function vwatch (param, mult) {
      _vw.push([param,mult]);
    }

    var out = ctx.createGainNode();

    var volume = ctx.createGainNode();
    volume.gain.value = 0;
    vwatch(volume.gain, 1);

    var osc = new OscGain("triangle");
    osc.gain.gain.value = 0;
    vwatch(osc.gain.gain, 1);

    fwatch(osc.osc.frequency, 1);

    var mod2 = new OscGain("square");
    fwatch(mod2.osc.frequency, 2.03);
    fwatch(mod2.gain.gain, 1/3);
    var mod2bis = new OscGain("sawtooth");
    fwatch(mod2bis.osc.frequency, 0.501);
    fwatch(mod2bis.gain.gain, 1);
    var mod = new OscGain("sine");
    fwatch(mod.osc.frequency, 0.251);
    fwatch(mod.gain.gain, 1);

    mod2.osc.detune.value = -7;
    mod2bis.osc.detune.value = -10;
    mod.osc.detune.value = 3;

    mod2.out.connect(mod2bis.gain.gain);
    mod2bis.out.connect(mod.gain.gain);
    mod.out.connect(osc.osc.frequency);

    var filter = ctx.createBiquadFilter();
    filter.Q.value = 2;
    filter.frequency.value = 500;

    var filterLFO = new OscGain("sine");
    swatch(filterLFO.osc.frequency, 1);
    filterLFO.out.connect(filter.frequency);

    var bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.Q.value = 3;
    bp.frequency.value = 3000;

    var bpMod = new OscGain("sawtooth");
    bpMod.gain.gain.value = 3000;
    swatch(bpMod.osc.frequency, 1/2);
    bpMod.out.connect(bp.frequency);

    osc.out.connect(volume);
    volume.connect(bp);
    volume.connect(filter);

    var volumeLFO = new OscGain("sine");
    swatch(volumeLFO.osc.frequency, 1);
    volumeLFO.out.connect(volume.gain);

    bp.connect(out);
    filter.connect(out);

    osc.start(0);
    mod2.start(0);
    mod2bis.start(0);
    mod.start(0);
    filterLFO.start(0);
    bpMod.start(0);
    volumeLFO.start(0);

    this.volume = volume;
    this.osc = osc;
    this.out = out;
  }

  CrazyWob.prototype = {
    setVolume: function (t, v) {
      this._vw.forEach(function (w) {
        w[0].cancelScheduledValues(0);
        w[0].setValueAtTime(v*w[1], t);
      });
    },
    setSpeed: function (t, s) {
      this._sw.forEach(function (w) {
        w[0].cancelScheduledValues(0);
        w[0].setValueAtTime(s*w[1], t);
      });
    },
    setNoteFreq: function (t, f) {
      this._fw.forEach(function (w) {
        w[0].cancelScheduledValues(0);
        w[0].setValueAtTime(f*w[1], t);
      });
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

  function Snare (volume, freqFrom, freqTo) {
    var noise = new Noise();
    noise.filter.type = "lowpass";
    noise.filter.Q.value = 5;
    noise.gain.gain.value = 0;
    this.noise = noise;
    this.out = noise.out;
    this.volume = 1 || volume;
    this.freqFrom = freqFrom || 800;
    this.freqTo = freqTo || 1000;
    this.release = 0.3;
  }

  Snare.prototype = {
    trigger: function (time) {
      this.noise.start(time, 1);
      envelope(this.noise.gain, time, this.volume, 0.05, 
          0.01, 0.03, 0.25, this.release);
      this.noise.filter.frequency.setValueAtTime(this.freqFrom, time);
      this.noise.filter.frequency.linearRampToValueAtTime(this.freqTo, time+0.1);
    }
  };

  function HiHat (volume, duration) {
    var hihat = new Noise();
    hihat.filter.type = "highpass";
    hihat.filter.frequency.value = 15000;
    hihat.filter.Q.value = 10;
    hihat.gain.gain.value = 0;
    this.hihat = hihat;
    this.out = this.hihat.out;
    this.volume = volume || 1;
    this.duration = duration||0;
  }

  HiHat.prototype = {
    trigger: function (time) {
      this.hihat.start(time, 1);
      envelope(this.hihat.gain, time, this.volume, this.duration, 
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

 function WaveShaper (amount, n_samples) {
   // From https://github.com/janesconference/MorningStar
   var waveShaper = ctx.createWaveShaper();
   var curve = new Float32Array(n_samples);
   if ((amount >= 0) && (amount < 1)) {
     var k = 2 * amount / (1 - amount);
     for (var i = 0; i < n_samples; i+=1) {
       var x = (i - 0) * (1 - (-1)) / (n_samples - 0) + (-1);
       curve[i] = (1 + k) * x / (1+ k * Math.abs(x));
     }
   }
   waveShaper.curve = curve;
   this.out = this.inp = waveShaper;
  }

  function Stereo (left, right) {
    var merger = ctx.createChannelMerger();
    if (left.inp && right.inp) {
      var inp = ctx.createGainNode();
      inp.connect(left.inp);
      inp.connect(right.inp);
      this.inp = inp;
    }
    (left.out||left).connect(merger, 0, 0);
    (right.out||right).connect(merger, 0, 1);
    this.left = left;
    this.right = right;
    this.out = merger;
  }

  // Sounds!
  var out = ctx.createGainNode();
  var outCompressor = ctx.createDynamicsCompressor();

  var reverb = new Reverb(0.5);
  out.gain.value = 0;
  out.connect(reverb.inp);
  reverb.out.connect(outCompressor);
  outCompressor.connect(ctx.destination);

  var bassFilter = ctx.createBiquadFilter();
  bassFilter.frequency = 0;
  bassFilter.connect(out);

  var bass = (function () {
    var bass = new FM();
    bass.gain.gain.value = 0.3;
    var left = new Repeater(0.08, 0.3);
    left.gain.gain.value = 0.5;
    var right = new Repeater(0.05, 0.3);
    right.gain.gain.value = 0.8;
    bass.out.connect(left.inp);
    bass.out.connect(right.inp);
    var stereo = new Stereo(left, right);
    stereo.out.connect(bassFilter);
    return bass;
  }());
  bass.start(0);

  var wobRepeater = new Repeater();
  wobRepeater.out.connect(out);
  var wob = (function () {
    var wob = new CrazyWob();
    var delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.01;
    wob.out.connect(delay);
    var stereo = new Stereo(wob, delay);
    stereo.out.connect(wobRepeater.inp);
    return wob;
  }());

  var fatOut = ctx.createGainNode();
  fatOut.connect(out);

  var bpmOsc2mult = 2;
  var osc2 = new OscGain();
  osc2.type = "sawtooth";
  osc2.osc.frequency.value = vars.bpm * bpmOsc2mult;
  osc2.osc.detune.value = 5;
  osc2.gain.gain.value = 0.05;
  osc2.out.connect(out);
  osc2.start(0);
  E.sub("bpmChange", function (percent) {
    var t = ctx.currentTime;
    bass.osc.detune.setValueAtTime(-200*percent, t);
    bass.osc.detune.linearRampToValueAtTime(0, t+0.2);

    osc2.osc.detune.setValueAtTime(-1000*percent, t);
    osc2.osc.detune.linearRampToValueAtTime(0, t+0.2);
    osc2.osc.frequency.setValueAtTime(bpmOsc2mult * vars.bpm, t);
    osc2.osc.frequency.setValueAtTime(bpmOsc2mult * vars.bpm, t + getKickInterval());
  });

  var noise = new Noise();
  noise.filter.frequency.value = 180;
  noise.filter.Q.value = 20;
  noise.gain.gain.value = 0;
  noise.out.connect(out);
  noise.start(0);

  var drumOut = (function () {
    var left = new Repeater(0.05, 0.2);
    var right = new Repeater(0.08, 0.4);
    right.gain.gain.value = 0.8;
    return new Stereo(left, right);
  }());
  drumOut.out.connect(out);

  var meloOut = new Repeater();
  meloOut.gain.gain.value = 0.5;
  meloOut.delay.delayTime.value = 0.3;
  meloOut.out.connect(out);

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
    freqParam.cancelScheduledValues(0);
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
    fm.out.connect(meloOut.inp);
    setTimeout(function () {
      fm.out.disconnect(meloOut.inp);
    }, 1000);
    fm.start(time, 0, 1);
    arpeggio && applyArpeggio(fm.osc.frequency, 4 * noteFreq, time, duration+release, 0.025);
    envelope(fm.gain, time, 0.5, duration, 
        0.01, 0.02, 0.6, 0.2);
    envelope(fm.mod.gain, time, 4 * noteFreq * metallic, duration, 
        0.05, 0.1, 0.6, 0.2);
  }

  function tick (i, time) {
    E.pub("tick", [i, time]);
    var r = risk();

    var hasDubStep = location.href.indexOf("dubstep")>-1;
    var hasMelo = !hasDubStep && i > 64;
    var meloIsArpeggio = i % 64 >= 32;
    var hasBass = true;
    var hasHiHat = hasDubStep || i > 16;
    var hasSnare = i % 4 == 2;

    if (hasDubStep) {
      wob.setSpeed(0, Math.pow(2, (2+Math.floor(i/4))%7) * vars.bpm/60);
      wob.setNoteFreq(0, (i%16 < 8 ? 1 : 2)*(i%4<2 ? NOTES.C5 : NOTES.C4));
      wob.setVolume(0, 1);
      wobRepeater.gain.gain.value = 0.6 + 0.4*Math.random();
      wobRepeater.repeater.gain.value = 0.5 + 0.7*Math.random();
      if (i%4==0) {
        wobRepeater.repeater.gain.value = 0;
        wobRepeater.delay.delayTime.value = 0.4*Math.random();
      }
      
      // Fat Bass each tick!
      var kick = new Kicker(100, 0.01, 0.2, 0.2);
      kick.volume = 0.4;
      kick.osc.type = "square";
      var filter = ctx.createBiquadFilter();
      filter.frequency.value = 200;
      filter.Q.value = 5;
      kick.out.connect(filter);
      filter.connect(fatOut);
      setTimeout(function () {
        filter.disconnect(fatOut.inp);
      }, 1000);
      kick.trigger(time);

      var snare = new Snare(0.1, 2000, 1000);
      snare.release = 0;
      snare.out.connect(fatOut);
      setTimeout(function () {
        snare.out.disconnect(fatOut);
      }, 1000);
      snare.trigger(time);
    }

    if (hasBass) {
      bassFilter.frequency.value = 3000 * smoothstep(16, 48, i);
      var oscFreq = bassMelo[Math.floor(i/4) % 4];
      bass.osc.frequency.value = oscFreq * 2.0;
      bass.mod.osc.frequency.value = oscFreq * 0.5;
      bass.mod.gain.gain.value = oscFreq*0.5 + 0.5*r;
    }

    if (hasMelo) {
      var metallic = 0.4 * r + 0.3 * smoothstep(-1, 1, Math.cos(Math.PI * i / 16));
      var melo = i % 16 < 8 ? melo1 : melo2;
      var octave = i % 32 < 16 ? 0 : 1;
      var m = melo[i % 8] * (1 << octave);
      meloNote(m, time, meloIsArpeggio, metallic);
    }

    if (hasHiHat) {
      var hihat = new HiHat(0.2, 0.02*vars.bpm/100);
      hihat.out.connect(drumOut.inp);
      setTimeout(function () {
        hihat.out.disconnect(drumOut.inp);
      }, 1000);
      hihat.trigger(time);
    }

    if (hasSnare) {
      var snare = new Snare(1, 1000, 1400);
      snare.out.connect(drumOut.inp);
      setTimeout(function () {
        snare.out.disconnect(drumOut.inp);
      }, 1000);
      snare.trigger(time);
    }
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
    var tickTime = getTickSpeed();
    var nextTickTime;
    while ((nextTickTime = lastTickTime + tickTime) < gameTime + scheduleAheadTime) {
      var audioTickTime = nextTickTime + (time - gameTime);
      currentTick ++;
      lastTickTime = nextTickTime;
      tick(currentTick, audioTickTime);
    }

    var r = risk();

    meloOut.repeater.gain.value = 0.1 + 0.3 * r;
    noise.gain.gain.value = 1.2 * r;
    reverb.mix(0.3+0.4*r);
  }

  function getTickSpeed () {
    return 60 / (ticksPerBeat * vars.bpm);
  }

  function getCurrentKickTime () {
    return lastTickTime - getTickSpeed() * (currentTick % 4);
  }

  function getKickInterval () {
    return 4 * getTickSpeed();
  }

  return {
    ctx: ctx,
    update: update,
    getTickSpeed: getTickSpeed,
    getCurrentKickTime: getCurrentKickTime,
    getKickInterval: getKickInterval,
    kick: function (t, errorRate) {
      errorRate = errorRate * errorRate * errorRate;
      var freq = mix(100, 120, errorRate);
      var speed = mix(0.2, 0.3, errorRate) * 100 / vars.bpm;
      var kick = new Kicker(freq, 0.01, speed, speed);
      kick.volume = 1.5;
      kick.osc.type = "sine";
      var filter = ctx.createBiquadFilter();
      filter.frequency.value = mix(200, 300, errorRate);
      filter.Q.value = 10 + 10 * errorRate;
      kick.out.connect(filter);
      filter.connect(drumOut.inp);
      setTimeout(function () {
        filter.disconnect(drumOut.inp);
      }, 1000);
      kick.trigger(t);

      var snare = new Snare(0.5, 1000, 10);
      snare.out.connect(drumOut.inp);
      setTimeout(function () {
        snare.out.disconnect(drumOut.inp);
      }, 1000);
      snare.trigger(t);

      E.pub("kick", t);
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
      out.gain.cancelScheduledValues(0);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(1, t+duration);
    },
    fadeOut: function (duration) {
      var t = ctx.currentTime;
      out.gain.cancelScheduledValues(0);
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

var levels = [
  25,
  35,
  50,
  65,
  80
];
var levelSize = [
  1.5,
  2.0,
  2.5,
  3.0,
  3.5,
  6.0
];
var levelColors = [
  "#0df",
  "#3f0",
  "#f90",
  "#fe0",
  "#f0f"
];
var levelMsgs = [
  "Ok",
  "Nice",
  "Great",
  "Awesome!",
  "Marvelous!!!"
];
var lastAction = 0;
function action () {
  var gt = getGameTime();
  var percentDelta = getKickPercent();
  var absDelta = Math.abs(percentDelta);

  var successState = 0;

  var bpm = vars.bpm;
  if (percentDelta < INF) {
    E.pub("bpmChange", -0.2);
    bpm *= 0.8;
    successState = 0;
  }
  else if (percentDelta > SUP) {
    E.pub("bpmChange", -0.2);
    bpm *= 0.8;
    successState = 0;
  }
  else {
    var decrease = (0.5 * bpm * percentDelta);
    bpm = bpm - decrease;
    E.pub("bpmChange", -decrease);
    successState = percentDelta < 0 ?
      Math.max(0, 1-percentDelta/INF) :
      Math.max(0, 1-percentDelta/SUP) ;
    var score = Math.floor(
      20 * smoothstep(BPM_MIN, BPM_MAX, bpm) +
      80 * Math.pow(successState, 2)
    );
    var lvl = -1;
    while (lvl<levels.length && levels[lvl+1] < score) lvl++;
    if (lvl!=-1) triggerFeedbackMessage(levelMsgs[lvl], levelColors[lvl], levelSize[lvl]);
    incrScore(score);
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
  if (!intro && !end) action();
}

function init () {
  E.sub("kick", function (t) {
    // THIS IS MESSY!
    glsl.set("kick", t);
  });
  E.sub("tick", function (a) {
    tickUpdate.apply(this, a);
  });
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
    intro = false;
  }
  else {
    if (i == 3) {
      overlay.className = "visible intro fadeout";
    }
    message.innerHTML = ""+(4-i);
  }
}

function tickUpdate (tick, time) {
  if (intro && tick % 4 == 0) {
    introMessage(Math.floor(tick / 4));
    audio.kick(time, 0);
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

  //console.log(currentKickTime, vars.kick);
  /*
  if (gt < introTime) {
    introMessage(gt);
    if (gt > vars.kick+kickTime) {
      audio.kick(getAbsoluteTime(), 0);
    }
    return;
  }
  */
  if (intro) return;
  
  if (gt > vars.kick+kickTime+kickTime*SUP) {
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
    audio.fadeOut(0.5);
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
