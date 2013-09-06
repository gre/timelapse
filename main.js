(function () {

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
      var a = this.attack, d = 0.06, s = 0.8, r = 0.1;
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
    filter.frequency.value = 100;
    filter.Q.value = 0;

    this.white = whiteNoise;
    this.gain = gain;
    this.out = this.filter = filter;
  }

  var bass = new Bass(80, 0.01, 0.2, 0.2);
  bass.osc.type = "sine";
  bass.out.connect(out);

  var osc = new OscGain();
  osc.osc.frequency.value = 100;
  osc.gain.gain.value = 0.3;
  osc.out.connect(out);

  var lfoVolume = new OscGain();
  lfoVolume.osc.frequency.value = 0.5;
  lfoVolume.gain.gain.value = 1000;
  filter.frequency.value = 2000;
  filter.Q.value = 0;
  lfoVolume.out.connect(filter.frequency);

  var osc2 = new OscGain();
  osc2.osc.frequency.value = 150;
  osc2.osc.detune.value = 5;
  osc2.gain.gain.value = 0.2;
  osc2.out.connect(out);

  var osc3 = new OscGain();
  osc3.osc.type = "sawtooth";
  osc3.osc.frequency.value = 300;
  osc3.gain.gain.value = 0.1;

  var noise = new Noise();
  noise.filter.frequency.value = 180;
  noise.filter.Q.value = 10;
  noise.gain.gain.value = 0.4;
  noise.out.connect(out);

  return {
    ctx: ctx,
    bass: bass,
    start: function () {
      out.gain.value = 1;
    },
    stop: function () {
      out.gain.value = 0;
    }
  };
}());

var vars = {
  time: 0,
  boom: 0
};

var lastBoomTime = audio.ctx.currentTime;
// FIXME real sequencer
var i = 0;
setInterval(function () {
  audio.bass.trigger(lastBoomTime = audio.ctx.currentTime);
  ++ i;
}, 1000);


function init () {
  audio.start();
}

function update (time, delta) {
  var dt = time - audio.ctx.currentTime;
  this.set("time", time);
  this.set("boom", time - lastBoomTime + dt);
}

window.main = function (frag) {
    var glsl = Glsl({
    canvas: document.getElementById("viewport"),
    fragment: frag,
    variables: vars,
    init: init,
    update: update
  });
  glsl.start();
};
}());
