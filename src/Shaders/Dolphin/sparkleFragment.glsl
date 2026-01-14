uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;

varying float vRandom;

void main() {
    // Create circular point
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    
    // Soft circle with glow
    float strength = 0.05 / distanceToCenter - 0.1;
    strength = clamp(strength, 0.0, 1.0);
    
    // Mix colors based on random value and time
    float colorMix = sin(vRandom * 6.28 + uTime) * 0.5 + 0.5;
    vec3 color = mix(uColor1, uColor2, colorMix);
    
    // Twinkle effect
    float twinkle = sin(uTime * 3.0 + vRandom * 20.0) * 0.3 + 0.7;
    
    gl_FragColor = vec4(color, strength * twinkle);
    
    #include <colorspace_fragment>
}
