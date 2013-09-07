#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 resolution;
uniform float time;
uniform float boom;
uniform float boomSpeed;
uniform float bpm;

uniform float successState;
uniform float statePower;

uniform float glitch;

const vec2 center = vec2(0.5, 0.5);

const float PI = 3.14159265359;
const float PI_x_2 = 6.28318530718;

const vec3 COLOR_NEUTRAL = vec3(0.1, 0.2, 0.7);
const vec3 COLOR_SUCCESS = vec3(0.0, 0.7, 0.1);
const vec3 COLOR_ERROR = vec3(0.7, 0.0, 0.05);

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

float circlePulse (
  vec2 p, float r, float thin, float pulseAngle,
  float waveFreq, float waveAmp, float waveDuration,
  float bullForce
) {
  vec2 v = p - center;
  float angle = atan(-v.x, -v.y);
  float clock = distanceRadius(0.0, angle) / PI;
  float distAngle = distanceRadius(angle, PI_x_2 * pulseAngle) / PI;
  float sc = smoothstep(1.0-waveDuration, 1.0, distAngle);
  float intensity = 0.1+0.05*sc;
  r /= mix(0.95, 1.0, waveAmp*sc*cos(angle*waveFreq));
  float ring = abs(length(v)-r) - 0.03*bullForce*smoothstep(1.0-1.5*waveDuration, 1.0, clock);
  float value = smoothstep(0.0, intensity, ring);
  return 1.0/sqrt(abs(value))/1.0 * pow(thin, 2.);
}

float bpmToSec (float bpm) {
  return 60. / bpm;
}

void main (void) {
  vec3 c = vec3(0.0);
  vec2 p = gl_FragCoord.xy / resolution;
  float sec = bpmToSec(bpm);
  float cPulse = circlePulse(
    p, 
    mix(0.2, 0.35, smoothstep(0.0, boomSpeed, time-boom)),
    0.5 + smoothstep(0.5, 1.0, statePower)*(1.-distance(p, vec2(0.5, 0.5))),
    mod((time-boom)/sec, 1.0),
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

  gl_FragColor = vec4(c, 1.0);
}
