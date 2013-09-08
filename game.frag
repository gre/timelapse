#ifdef GL_ES
precision mediump float;
#endif

#define BPM_MIN 30.0
#define BPM_MAX 200.0
#define FREQUENCY_DATA_SIZE 32

uniform float frequencyData[FREQUENCY_DATA_SIZE];

uniform vec2 resolution;
uniform float time;
uniform float boom;
uniform float boomSpeed;
uniform float bpm;

uniform float useraction;
uniform float successState;

uniform bool fullPulse;
uniform float glitch;

const vec2 center = vec2(0.5, 0.5);

const float PI = 3.14159265359;
const float PI_x_2 = 6.28318530718;

const vec3 COLOR_NEUTRAL = vec3(0.1, 0.2, 0.7);
const vec3 COLOR_SUCCESS = vec3(0.0, 0.7, 0.1);
const vec3 COLOR_ERROR = vec3(0.7, 0.0, 0.05);

float expInOut (float a) {
  return 0.0==a ? 0.0 : 1.0==a ? 1.0 : 1.0 > (a *= 2.0) ? 0.5 * pow(1024.0,a-1.0):0.5*(-pow(2.0,-10.0*(a-1.0))+2.0);
}

float random (vec2 pos) {
  return fract(sin(dot(pos.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
vec3 random3 (vec2 pos) {
  return vec3(
    random(pos),
    random(pos*3.),
    random(pos*13.)
  );
}

float distanceRadius (float a, float b) {
  float d = mod(distance(a, b), PI_x_2);
  return d < PI ? d : PI_x_2 - d;
}

float spiralDistance (vec2 v, float r) {
  float d = length(v);
  float a = (PI + atan(v.x, v.y))/PI_x_2;
  return distance(1.0, 2.0 * smoothstep(0.0, 1.0, fract(log(d/r)+a)));
}

float circlePulse (
  vec2 v, float boomForce,
  float boomGlitchFreq, float boomGlitchAmp,
  float thin, float pulseAngle, bool fullPulse,
  float waveFreq, float waveAmp, float waveDuration,
  float bullForce
) {
  float angle = atan(-v.x, -v.y);
  float clock = distanceRadius(0.0, angle) / PI;
  float distAngle = distanceRadius(angle, PI_x_2 * pulseAngle) / PI;
  float f = mix(1.0, smoothstep(-1.0, 1.0, cos(boomGlitchFreq * (clock+0.1*angle+boomForce))), boomGlitchAmp);
  float r = mix(0.35, 0.2, boomForce*f);
  float sc = smoothstep(1.0-waveDuration, 1.0, distAngle);
  float intensity = 0.1+0.05*sc;
  r /= mix(0.95, 1.0, waveAmp*sc*cos(angle*waveFreq));
  float ring = abs(length(v)-r) - 0.03*bullForce*(!fullPulse ? smoothstep(1.0-1.5*waveDuration, 1.0, clock) : 1.0);
  float value = smoothstep(0.0, intensity, ring);
  float returnValue = 1.0/sqrt(abs(value))/1.0 * pow(thin, 2.);
  if ( length(v) < r) {
    float s = spiralDistance(
      v,
      PI
    );
    s = 1.0 - pow(smoothstep(0.0, 0.3, s), 0.3);
    returnValue += s;
  }
  return returnValue;
}

float bpmToSec (float bpm) {
  return 60. / bpm;
}

void main (void) {
  vec3 c = vec3(0.0);
  vec2 p = gl_FragCoord.xy / resolution;
  float sec = bpmToSec(bpm);
  float statePower = smoothstep(0.8, 0.0, time-useraction);
  float cPulse = circlePulse(
    p - center,
    smoothstep(boomSpeed, 0.0, time-boom),
    20.0,
    0.5,
    0.5 + 0.5 * smoothstep(smoothstep(0.6, 1.0, statePower), 0.0, distance(smoothstep(0.8, 1.0, statePower), distance(p, center))),
    mod((time-boom)/sec, 1.0),
    fullPulse,
    1.2*sqrt(bpm) + 4.0*statePower,
    2.0,
    min(0.5, bpm / 800.0),
    1.0 - statePower
  );
  vec3 mainColor = mix(
    COLOR_NEUTRAL,
    mix(COLOR_ERROR, COLOR_SUCCESS, successState),
    statePower);
  
  c += cPulse * mainColor;

  if (glitch != 0.0) {
    c += glitch * 0.5 * cPulse * (0.5 * random(p + time) + 0.5 * random(floor(p * 100.) + time));
  }

/*
  for (int x = 0; x < FREQUENCY_DATA_SIZE; ++x) {
    if (x == int(2.0 * distance(p.x, 0.5) * float(FREQUENCY_DATA_SIZE))) {
      c -= 0.1*vec3(10.0*p.y < smoothstep(-150.0, 0.0, frequencyData[x]) ? 1.0 : 0.0);
    }
  }
  */

  c = clamp(
    c,
    vec3(0.0, 0.0, 0.0),
    vec3(1.0, 1.0, 1.0)
  );

  c += 0.05;

  float bpmLight = smoothstep(BPM_MIN, BPM_MAX, bpm);
  c *= max(0.1, min(1.0, 200.0*bpmLight));
  c *= max(0.95, 800.0*(bpmLight-0.98));

  gl_FragColor = vec4(c, 1.0);
}
