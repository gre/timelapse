try {(function () {
var overlay = document.getElementById("overlay");
var message = document.getElementById("message");
var $score = document.getElementById("score");
var $gf = document.getElementById("gamefeedback");
var $time = document.getElementById("time");

function triggerFeedbackMessage (msg, color, size) {
  var e = document.createElement("div");
  $gf.appendChild(e);
  e.innerHTML = msg;
  e.style.top = Math.floor(150 - 60*(Math.random()-0.5))+"px";
  e.style.left = Math.floor(80*(Math.random()-0.5))+"px";
  e.style.color = color;
  e.style.fontSize = size+"em";
  setTimeout(function() {
    e.className = "release";
  }, 500);
  setTimeout(function(){
    $gf.removeChild(e);
  }, 1500);
}

function displayRemainingTime (secs) {
  var mm = Math.floor(secs / 60);
  var ss = secs % 60;
  $time.innerHTML = (mm<=9 ?"0":"")+mm+":"+(ss<=9?"0":"")+ss;
}

var bpmScaleOnFailure = 0.1;
var BPM_MIN = 30;
var BPM_MAX = 160;
var TOTAL_TIME = 60;

var glsl; // Will be implemented

var gameStartAt;
var intro = true;
var end = false;

var score = 0;
var dubstepStartAtTick=null, dubstepEndAtTick=null;
var hasDubStep = false;

var pulseOpeningStartTime;
var pulseOpeningEndTime;
var pulseClosingStartTime;
var pulseClosingEndTime;

var vars = {
  lvl: 1,
  time: 0,
  dubstepAction: false,
  useraction: -Infinity,
  kick: -Infinity,
  kickSpeed: 0.2,
  bpm: 50,
  successState: 0.0,
  fullPulse: false,
  pulseOpenFrom: 0,
  pulseOpenTo: 0
};

var lastScoreChange = 0;
function incrScore (s) {
  $score.className = "incr";
  score += s;
  $score.innerHTML = score;
  lastScoreChange = getGameTime();
}
function decrScore (s) {
  $score.className = "decr";
  score -= s;
  $score.innerHTML = score;
  lastScoreChange = getGameTime();
}

function updateScore () {
  var gt = getGameTime();
  var recent = smoothstep(0.3, 0, gt-lastScoreChange);
  if (recent === 0)
    $score.className = "";
}
setInterval(updateScore, 100);

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
 
  function startNode (node, time, offset, duration) {
    time = time || ctx.currentTime;
    offset = offset || 0;
    if (duration)
      node.start(time, offset, duration);
    else
      node.start(time, offset);
  }

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
    this.out = this.gain = ctx.createGain();
    this.osc.connect(this.gain);
  }
  OscGain.prototype = {
    start: function (time, duration) {
      startNode(this.osc, time, 0, duration);
    }
  };

  function FM () {
    OscGain.call(this);
    this.mod = new OscGain();
    this.mod.out.connect(this.osc.frequency);
  }
  FM.prototype = {
    start: function (time, duration) {
      startNode(this.osc, time, 0, duration);
      this.mod.start(time, duration);
    }
  };

  function Repeater (d, r, maxDelay) {
    var out = ctx.createGain();
    var delay = ctx.createDelay(maxDelay||2);
    delay.delayTime.value = d || 0.1;
    out.connect(delay);
    var repeatGain = ctx.createGain();
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

    var out = ctx.createGain();

    var volume = ctx.createGain();
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
      startNode(this.osc, time, 0, duration);
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
    this.volume = volume || 1;
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

    var gain = ctx.createGain();
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
      startNode(this.white, time, 0, duration);
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
      var inp = ctx.createGain();
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
  var out = ctx.createGain();
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

  var fatOut = ctx.createGain();
  fatOut.connect(out);
  fatOut.connect(wobRepeater.inp);

  var bpmOsc2mult = 3;
  var bpmNoiseMult = 10;
  var noiseBpmGain = ctx.createGain();
  noiseBpmGain.connect(out);
  var noiseBpm = new Noise();
  noiseBpm.out.connect(noiseBpmGain);
  noiseBpm.start(0);
  noiseBpm.gain.gain.value = 0.2;
  noiseBpm.filter.type = "bandpass";
  noiseBpm.filter.Q.value = 20;
  noiseBpm.filter.frequency.value = 0;

  var bpmNoiseLfoMult = 0.05;
  var bpmNoiseLfoPow = 1.3;
  var lfoBpm = ctx.createOscillator();
  lfoBpm.start(0);
  var lfoBpmGain = ctx.createGain();
  lfoBpmGain.gain.value = 0.8;
  lfoBpm.connect(lfoBpmGain);
  lfoBpmGain.connect(noiseBpmGain.gain);

  var osc2 = new OscGain();
  osc2.type = "sawtooth";
  osc2.osc.frequency.value = vars.bpm * bpmOsc2mult;
  osc2.osc.detune.value = 5;
  osc2.gain.gain.value = 0.1;
  osc2.out.connect(out);
  osc2.start(0);
  
  var onBpmChange = function (percent) {
    var t = ctx.currentTime;
    bass.osc.detune.setValueAtTime(-200*percent, t);
    bass.osc.detune.linearRampToValueAtTime(0, t+0.2);

    osc2.osc.detune.setValueAtTime(-1000*percent, t);
    osc2.osc.detune.linearRampToValueAtTime(0, t+0.2);
    osc2.osc.frequency.setValueAtTime(bpmOsc2mult * vars.bpm, t);
    osc2.osc.frequency.setValueAtTime(bpmOsc2mult * vars.bpm, t + getKickInterval());

    noiseBpm.filter.frequency.setValueAtTime(bpmNoiseMult * vars.bpm, t);
    lfoBpm.frequency.setValueAtTime(Math.pow(bpmNoiseLfoMult*vars.bpm, bpmNoiseLfoPow), t);
  }
  E.sub("bpmChange", onBpmChange);
  onBpmChange(0);

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
  var meloVolume = 0.5;
  meloOut.gain.gain.value = meloVolume;
  meloOut.delay.delayTime.value = 0.3;
  meloOut.out.connect(out);

  var melo1, melo2, bassMelo, dubMelo;

  with (NOTES) {
    melo1 = [E3,G3,D3,G3,E3,A3,C3,G3];
    melo2 = [E3,B3,D3,G3,E3,C4,C3,D3];
    bassMelo = [G4,D4,F4,C4];
    dubMelo = [C5,C4,E5,E4];
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
    startNode(fm, time, 0, 1);
    arpeggio && applyArpeggio(fm.osc.frequency, 4 * noteFreq, time, duration+release, 0.025);
    envelope(fm.gain, time, 0.5, duration, 
        0.01, 0.02, 0.6, 0.2);
    envelope(fm.mod.gain, time, 4 * noteFreq * metallic, duration, 
        0.05, 0.1, 0.6, 0.2);
  }

  function tick (i, time) {
    E.pub("tick", [i, time]);
    var gt = getGameTime(time);
    var r = risk();

    hasDubStep = dubstepStartAtTick !== null && dubstepStartAtTick <= i;
    var introduceDubstepPhase = i % 256 == 121;
    var concludeDubstepPhase = i % 256 == 161;
    var hasMelo = !hasDubStep && i > 64 && i % 64 < 32;
    var meloIsArpeggio = i % 128 < 64;
    var hasBass = dubstepStartAtTick === null;
    var hasHiHat = hasDubStep || i > 16;
    var hasSnare = dubstepStartAtTick === null && i % 4 == 2;

    var fatkick = false;
    var fatsnare = false;

    if (introduceDubstepPhase) {
      dubstepStartAtTick = i+3;
      pulseOpeningStartTime = getGameTime(time);
      pulseOpeningEndTime = pulseOpeningStartTime + 3*getTickSpeed();
      fatkick = true;
      fatsnare = true;
      var gain = ctx.createGain();
      gain.connect(out);
      var vibrato = ctx.createOscillator();
      vibrato.frequency.value = 10;
      vibrato.connect(gain.gain);
      var fm = new FM();
      var duration = 0.5;
      var release = 0.1;
      fm.osc.type = "square";
      fm.osc.frequency.setValueAtTime(400, time);
      fm.osc.frequency.linearRampToValueAtTime(800, time+duration);
      fm.mod.osc.frequency.setValueAtTime(200, time);
      fm.mod.osc.frequency.linearRampToValueAtTime(1200, time+duration);
      fm.mod.osc.type = "sine";
      fm.out.connect(gain);
      setTimeout(function () {
        fm.out.disconnect(gain);
      }, 1000);
      envelope(fm.gain, time, 0.5, duration, 
          0.01, 0.02, 0.6, 0.2);
      envelope(fm.mod.gain, time, 600, duration, 
          0.05, 0.1, 0.6, 0.2);
      startNode(fm, time, 0, 1);
      glsl.set("fullPulse", true);
    }

    if (concludeDubstepPhase) {
      dubstepEndAtTick = i+3;
      pulseClosingStartTime = getGameTime(time);
      pulseClosingEndTime = pulseClosingStartTime + 3*getTickSpeed();
    }

    if (i === dubstepStartAtTick) {
      wob.setVolume(time, 1);
      wob.setSpeed(time, vars.bpm/60);
      wob.setNoteFreq(time, NOTES.C4);
      wobRepeater.repeater.gain.setValueAtTime(0, time);
      meloOut.gain.gain.linearRampToValueAtTime(0, time+1);
      pulseOpeningStartTime = pulseOpeningEndTime = null;
      glsl.set("pulseOpenFrom", 0);
      glsl.set("pulseOpenTo", 1);
    }

    if (i === dubstepEndAtTick) {
      dubstepStartAtTick = null;
      wob.setVolume(time, 0);
      meloOut.gain.gain.linearRampToValueAtTime(meloVolume, time+2);
      glsl.set("fullPulse", false);
      pulseClosingStartTime = pulseClosingEndTime = null;
      glsl.set("pulseOpenFrom", 0);
      glsl.set("pulseOpenTo", 0);
    }

    if (hasDubStep) {
      wob.setSpeed(time, Math.pow(2, (1+Math.floor(i/4))%4) * vars.bpm/60);
      wob.setNoteFreq(time, (i%16 < 8 ? 1 : 2)*(dubMelo[i%dubMelo.length]));//<2 ? NOTES.C5 : NOTES.C4));
      wobRepeater.gain.gain.setValueAtTime(0.0 + 1.0*Math.random(), time);
      wobRepeater.repeater.gain.setValueAtTime(0.99*(1-Math.random()*Math.random()), time);
      if (i%4==0) {
        wobRepeater.repeater.gain.setValueAtTime(0, time);
        wobRepeater.delay.delayTime.setValueAtTime(0.5*Math.random(), time);
      }
      fatkick = i%2 == 0;
      fatsnare = true;
    }
      
    // Fat Bass each tick!
    if (fatkick) {
      var kick = new Kicker(200, 0.01, 0.2, 0.2);
      kick.volume = 0.4;
      kick.osc.type = "square";
      var filter = ctx.createBiquadFilter();
      filter.frequency.value = 300;
      filter.Q.value = 10;
      kick.out.connect(filter);
      filter.connect(fatOut);
      setTimeout(function () {
        filter.disconnect(fatOut.inp);
      }, 1000);
      kick.trigger(time);
    }

    if (fatsnare) {
      var snare = new Snare(0.6, 2000, 1000);
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

  function getFloatTick () {
    return currentTick + (getGameTime()-lastTickTime)/getTickSpeed();
  }

  function getTickSpeed () {
    return 60 / (ticksPerBeat * vars.bpm);
  }

  function getCurrentKickTime () {
    return vars.kick;//lastTickTime - getTickSpeed() * (currentTick % 4);
  }

  function getKickInterval () {
    return 4 * getTickSpeed();
  }

  return {
    ctx: ctx,
    update: update,
    getFloatTick: getFloatTick,
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

var scores = [
  0,
  30,
  50,
  65,
  80
];
var scoreSize = [
  1.5,
  2.0,
  2.5,
  3.0,
  3.5,
  6.0
];
var scoreColors = [
  "#f90",
  "#fe0",
  "#0df",
  "#3f0",
  "#f0f"
];
var scoreMsgs = [
  "Ok.",
  "Nice.",
  "Great!",
  "Awesome!!",
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
    E.pub("bpmChange", -bpmScaleOnFailure);
    bpm *= (1+bpmScaleOnFailure);
    successState = 0;
    triggerFeedbackMessage("TOO FAST...", "#F00", 1.6);
    decrScore(100);
  }
  else if (percentDelta > SUP) {
    E.pub("bpmChange", +bpmScaleOnFailure);
    bpm *= (1-bpmScaleOnFailure);
    successState = 0;
    triggerFeedbackMessage("Miss", "#F00", 2.5);
    decrScore(100);
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
    while (lvl<scores.length && scores[lvl+1] < score) lvl++;
    if (lvl!=-1) triggerFeedbackMessage(scoreMsgs[lvl], scoreColors[lvl], scoreSize[lvl]);
    incrScore(score);
  }
  bpm = Math.min(200, bpm);

  audio.kick(getAbsoluteTime(), 1-successState);

  glsl.set("successState", successState);
  glsl.set("bpm", bpm);
  glsl.set("useraction", gt);
  lastAction = gt;
}

var dubstepEntered = null;

function spaceup () {
  if (dubstepEntered !== null) {
    var tick = audio.getFloatTick();
    var dist = Math.abs(tick-dubstepEndAtTick);
    var s = Math.round(20*(tick-dubstepEntered));
    if (dist < 1) {
      s += 100;
      triggerFeedbackMessage("OMG +"+s+" !", "#0FF", 4);
    }
    incrScore(s);
    dubstepEntered = tick;
    dubstepEntered = null;
    glsl.set("dubstepAction", false);
  }
}

function spacedown () {
  if (intro || end) return;
  if (dubstepStartAtTick === null) {
    action();
  }
  else {
    var tick = audio.getFloatTick();
    dubstepEntered = tick;
    glsl.set("dubstepAction", true);
    glsl.set("successState", 1);
    if (tick > dubstepStartAtTick-1) {
      var dist = Math.abs(tick-dubstepStartAtTick);
      if (dist < 1) {
        incrScore(100);
        triggerFeedbackMessage("Perfect!", "#0FF", 4);
      }
      else {
        triggerFeedbackMessage("Hold it now!", "#FFF", 3);
      }
    }
    else {
      triggerFeedbackMessage("Hold it now!", "#FFF", 3);
    }
  }
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
    gameStartAt = getGameTime();
  }
  else {
    if (i == 3) {
      overlay.className = "visible intro fadeout";
    }
    message.innerHTML = ""+(4-i);
  }
}


function levelUp() {
  vars.lvl ++;
  bpmScaleOnFailure = Math.min(0.7, 0.1 + vars.lvl/20);
}

function tickUpdate (tick, time) {
  if (intro && tick % 4 == 0) {
    introMessage(Math.floor(tick / 4));
    audio.kick(time, 0);
  }
  if (hasDubStep && tick % 4 == 0) {
    audio.kick(time, 0);
  }
  if (tick>0 && tick % 128 == 0) {
    levelUp();
  }
}

var lastRemainingTime = null;
function update () {
  if (!glsl) return;
  var t = getAbsoluteTime();
  var gt = getGameTime(t);
  audio.update(t, gt);
  this.set("time", gt);

  if (pulseOpeningStartTime) {
    this.set("pulseOpenFrom", 0);
    this.set("pulseOpenTo", smoothstep(pulseOpeningStartTime, pulseOpeningEndTime, gt));
  }
  if (pulseClosingStartTime) {
    this.set("pulseOpenFrom", smoothstep(pulseClosingStartTime, pulseClosingEndTime, gt));
    this.set("pulseOpenTo", 1);
  }

  if (end) return;
  var kickPercent = getKickPercent();
  var currentKickTime = audio.getCurrentKickTime();
  var kickTime = audio.getKickInterval();

  if (intro) return;
  
  if (dubstepStartAtTick===null && gt > vars.kick+kickTime+kickTime*SUP) {
    action();
  }

  var remainingTime = TOTAL_TIME-Math.ceil(gt - gameStartAt);
  if (remainingTime !== lastRemainingTime) {
    lastRemainingTime = remainingTime;
    displayRemainingTime(remainingTime);
  }

  if (vars.bpm < BPM_MIN || vars.bpm > BPM_MAX || remainingTime <= 0) {
    E.pub("gameover", remainingTime <= 0);
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
  var stopAt = null;
  var firstStart = true;
  function start () {
    if (end) return;
    overlay.className = "";
    if (firstStart) {
      pauseDuration = audio.ctx.currentTime;
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
    glsl.stop();
    if (end) return;
    message.innerHTML = "Game Paused";
    overlay.className = "visible";
    audio.fadeOut(0.5);
    stopAt = audio.ctx.currentTime;
    if (spaceIsDown) {
      spaceup();
      spaceIsDown = false;
    }
  }

  E.sub("gameover", function (normalEnd) {
    end = true;
    overlay.className = "visible over";
    message.innerHTML = "Game Over";
    document.getElementById("finalmsg").innerHTML = "Your final score: "+score;
    setTimeout(stop, 5000);
    audio.fadeOut(5);
  });

  function init () {
    glsl = Glsl({
      canvas: canvas,
      fragment: frag,
      variables: vars,
      update: update
    });

    window.onblur = stop;
    window.onfocus = start;

    E.sub("kick", function (t) {
      glsl.set("kick", getGameTime(t));
    });
    E.sub("tick", function (a) {
      tickUpdate.apply(this, a);
    });
  }

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

  var $play = document.getElementById("play");
  var $intro = document.getElementById("intro");
  function onPlay () {
    $intro.style.display = "none";
    init();
    start();
  }

  $play.addEventListener("click", onPlay);

  if (location.hash == "#skipintro") {
    onPlay();
  }
  else {
    $intro.style.display = "block";
  }
  message.innerHTML = "";

  window.A = audio;
  window.G = glsl;

};
}());
} catch (e) {
  document.getElementById("message").innerHTML = "Can't run the game";
  var error = document.createElement("pre");
  error.innerHTML = e;
  document.getElementById("overlay").appendChild(error);
  console.log(e);
  console.log(e.stack);
}
