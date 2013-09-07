#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 resolution;
uniform float time;
uniform float boom;

float circle (vec2 p, float r, float h) {
  float value = sin(2.*3.14*distance(p, vec2(0.5, 0.5))/r);
  return 1.0/sqrt(abs(value))/1.0 * pow(h, 2.);
}

void main (void) {
  vec2 p = gl_FragCoord.xy / resolution;
  gl_FragColor = circle(p, 
  mix(0.75, 0.9, smoothstep(0.1, 0.5, time-boom))
  ,  1.2*(1.-distance(vec2(0.5, 0.5), p))) * vec4(0.1, 0.2, 0.7, 1.0);
}
