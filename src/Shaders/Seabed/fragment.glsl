uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uSandColor;
uniform vec3 uRockColor;
uniform float uGlowIntensity;
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying float vHeight;
varying float vRandom;
varying vec3 vPosition;
varying float vFogDepth;

void main() {
  // Circular particle shape with soft edges
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  
  if(dist > 0.5) {
    discard;
  }
  
  // Soft glow falloff
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
  alpha = pow(alpha, 1.5);
  
  float heightNorm = (vHeight + 8.0) / 16.0;
  heightNorm = clamp(heightNorm, 0.0, 1.0);
  
  float terrainNoise = fract(sin(dot(vPosition.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float isRocky = step(0.6, heightNorm) * (0.7 + terrainNoise * 0.3);
  float isSandy = 1.0 - isRocky;
  
  vec3 deepColor = uColor1;
  vec3 sandColor = uSandColor;
  vec3 rockColor = uRockColor;
  vec3 peakColor = uColor3;
  
  vec3 color;

  if(heightNorm < 0.2) {
    // Deep canyon areas
    color = mix(deepColor, sandColor, heightNorm * 5.0);
  } else if(heightNorm < 0.5) {
    // Sandy middle areas
    vec3 baseColor = mix(sandColor, rockColor, isRocky);
    color = mix(deepColor, baseColor, (heightNorm - 0.2) * 3.33);
  } else if(heightNorm < 0.8) {
    // Mixed rocky/sandy higher areas
    vec3 baseColor = mix(sandColor, rockColor, isRocky);
    color = mix(baseColor, peakColor, (heightNorm - 0.5) * 3.33);
  } else {
    // High peaks
    color = mix(rockColor, peakColor, (heightNorm - 0.8) * 5.0);
  }
  
  float positionVariation = fract(sin(dot(vPosition.xz * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
  color = mix(color, color * 1.2, positionVariation * 0.1);
  
  // Reduced glow effect for more realistic look
  float peakGlow = smoothstep(0.7, 1.0, heightNorm);
  float pulse = sin(uTime * 1.5 + vRandom * 6.28) * 0.3 + 0.7;
  color += peakColor * peakGlow * pulse * uGlowIntensity * 0.3;
  
  // More subtle sparkle effect for mineral deposits
  float sparkle = step(0.995, vRandom + sin(uTime * 2.0 + vPosition.x * 0.1) * 0.01);
  color += vec3(0.8, 0.9, 1.0) * sparkle * 0.4 * isRocky;
  
  // Reduced cyber grid effect for more natural look
  float gridX = fract(vPosition.x * 0.2);
  float gridZ = fract(vPosition.z * 0.2);
  float grid = step(0.98, gridX) + step(0.98, gridZ);
  color += vec3(0.1, 0.3, 0.5) * grid * 0.1;
  
  // Final alpha with subtle glow
  alpha *= (0.7 + uGlowIntensity * 0.3);
  
  // Apply fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  vec3 finalColor = mix(color, uFogColor, fogFactor);
  float finalAlpha = alpha * (1.0 - fogFactor * 0.7);

  gl_FragColor = vec4(finalColor, finalAlpha);
}
