import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import Game from '../../../Game.class';
import simulationShader from '../../../../Shaders/WakeParticles/simulation.glsl';
import vertexShader from '../../../../Shaders/WakeParticles/vertex.glsl';
import fragmentShader from '../../../../Shaders/WakeParticles/fragment.glsl';

export default class WakeParticles {
  constructor(dolphin) {
    this.game = Game.getInstance();
    this.scene = this.game.scene;
    this.renderer = this.game.renderer.rendererInstance;
    this.time = this.game.time;
    this.dolphin = dolphin;

    // GPGPU texture size (particles = WIDTH * WIDTH)
    this.WIDTH = 150;
    this.PARTICLES = this.WIDTH * this.WIDTH;

    this.config = {
      backwardSpeed: 1.4,
      turbulence: 0.55,
      spread: 0.55,
      curlStrength: 0.2,
      spiralIntensity: 0.25,
      buoyancy: 0.12,
      drag: 0.98,
      particleSize: 15.0,
      color1: new THREE.Color(0x85d5fb),
      color2: new THREE.Color(0x0077dd),
      color3: new THREE.Color(0x335c79),
    };

    // For skinned mesh sampling
    this._tmpPosition = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();
    this._tmpSkinned = new THREE.Vector3();

    this.init();
    this.setDebug();
  }

  init() {
    this.setupSurfaceSampling();
    this.initGPGPU();
    this.createParticleGeometry();
    this.createParticleMaterial();

    this.particleSystem = new THREE.Points(this.geometry, this.material);
    this.particleSystem.frustumCulled = false;
    this.scene.add(this.particleSystem);
  }

  setupSurfaceSampling() {
    // Find the skinned mesh
    this.dolphinMesh = null;
    this.dolphin.dolphin.traverse((child) => {
      if (child.isSkinnedMesh) {
        this.dolphinMesh = child;
      }
    });

    if (!this.dolphinMesh) {
      console.warn('WakeParticles: No skinned mesh found');
      return;
    }

    // Create sampler with weight toward back of dolphin (tail area)
    // We'll use vertex positions to weight - vertices with negative Z (tail) get higher weight
    const geometry = this.dolphinMesh.geometry;
    const posAttr = geometry.getAttribute('position');

    // Create weight attribute favoring tail/back area
    const weights = new Float32Array(posAttr.count);
    let minZ = Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }

    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      // Normalize Z to 0-1 range, then weight toward tail (lower Z values)
      const normalizedZ = (z - minZ) / (maxZ - minZ);
      // Exponential falloff - tail gets much higher weight
      weights[i] = Math.pow(1.0 - normalizedZ, 2.0) + 0.1;
    }

    geometry.setAttribute('weight', new THREE.BufferAttribute(weights, 1));

    this.sampler = new MeshSurfaceSampler(this.dolphinMesh)
      .setWeightAttribute('weight')
      .build();

    // Pre-sample points and store vertex indices for skinning
    this.sampledData = [];
    const tempPosition = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();

    for (let i = 0; i < this.PARTICLES; i++) {
      this.sampler.sample(tempPosition, tempNormal);

      // Find closest vertex for bone transform
      let closestIndex = 0;
      let closestDist = Infinity;
      const searchVec = new THREE.Vector3();

      for (let v = 0; v < posAttr.count; v++) {
        searchVec.fromBufferAttribute(posAttr, v);
        const dist = searchVec.distanceToSquared(tempPosition);
        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = v;
        }
      }

      this.sampledData.push({
        position: tempPosition.clone(),
        normal: tempNormal.clone(),
        vertexIndex: closestIndex,
        offset: tempPosition
          .clone()
          .sub(new THREE.Vector3().fromBufferAttribute(posAttr, closestIndex)),
      });
    }
  }

  initGPGPU() {
    this.gpuCompute = new GPUComputationRenderer(
      this.WIDTH,
      this.WIDTH,
      this.renderer
    );

    // Create base texture with initial spawn positions from dolphin surface
    const dtPosition = this.gpuCompute.createTexture();
    const dtSpawnPoints = this.gpuCompute.createTexture();
    this.fillSpawnTexture(dtSpawnPoints);
    this.fillInitialPositions(dtPosition);

    // Add position variable
    this.positionVariable = this.gpuCompute.addVariable(
      'uParticles',
      simulationShader,
      dtPosition
    );

    this.gpuCompute.setVariableDependencies(this.positionVariable, [
      this.positionVariable,
    ]);

    // Set uniforms
    const uniforms = this.positionVariable.material.uniforms;
    uniforms.uTime = { value: 0 };
    uniforms.uDeltaTime = { value: 0 };
    uniforms.uSpawnPoints = { value: dtSpawnPoints };
    uniforms.uBackwardSpeed = { value: this.config.backwardSpeed };
    uniforms.uTurbulence = { value: this.config.turbulence };
    uniforms.uSpread = { value: this.config.spread };
    uniforms.uCurlStrength = { value: this.config.curlStrength };
    uniforms.uSpiralIntensity = { value: this.config.spiralIntensity };
    uniforms.uBuoyancy = { value: this.config.buoyancy };
    uniforms.uDrag = { value: this.config.drag };
    uniforms.uDolphinPosition = { value: new THREE.Vector3(0, 0, 0) };

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPGPU init error:', error);
    }

    // Store spawn texture for updates
    this.spawnTexture = dtSpawnPoints;
  }

  fillSpawnTexture(texture) {
    const data = texture.image.data;

    if (!this.sampledData || this.sampledData.length === 0) {
      // Fallback if no mesh sampling
      for (let i = 0; i < data.length; i += 4) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 1.0;
        data[i + 0] = Math.cos(angle) * r;
        data[i + 1] = (Math.random() - 0.5) * 0.8;
        data[i + 2] = -Math.random() * 0.5; // Behind dolphin
        data[i + 3] = 1.0;
      }
      return;
    }

    // Fill with sampled surface positions (local space)
    for (let i = 0; i < this.PARTICLES; i++) {
      const idx = i * 4;
      const sample = this.sampledData[i];

      // Store local position - will be transformed in update
      data[idx + 0] = sample.position.x;
      data[idx + 1] = sample.position.y;
      data[idx + 2] = sample.position.z;
      // W stores normal direction for emission (pointing outward + backward)
      data[idx + 3] = sample.vertexIndex;
    }
  }

  fillInitialPositions(texture) {
    const data = texture.image.data;

    for (let i = 0; i < data.length; i += 4) {
      // Start particles scattered behind dolphin
      data[i + 0] = (Math.random() - 0.5) * 3.0;
      data[i + 1] = (Math.random() - 0.5) * 2.0;
      data[i + 2] = -Math.random() * 10.0 - 2.0;
      data[i + 3] = Math.random(); // Staggered life
    }
  }

  createParticleGeometry() {
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(this.PARTICLES * 3);
    const uvs = new Float32Array(this.PARTICLES * 2);

    for (let i = 0; i < this.PARTICLES; i++) {
      // UV coordinates to sample GPGPU texture
      uvs[i * 2] = (i % this.WIDTH) / this.WIDTH;
      uvs[i * 2 + 1] = Math.floor(i / this.WIDTH) / this.WIDTH;
    }

    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  createParticleMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPositions: { value: null },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: this.config.particleSize },
        uTime: { value: 0 },
        uColor1: { value: this.config.color1 },
        uColor2: { value: this.config.color2 },
        uColor3: { value: this.config.color3 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  update() {
    const uniforms = this.positionVariable.material.uniforms;

    uniforms.uTime.value = this.time.elapsedTime;
    uniforms.uDeltaTime.value = this.time.delta;

    // Update dolphin position
    if (this.dolphin?.dolphin) {
      uniforms.uDolphinPosition.value.copy(this.dolphin.dolphin.position);
    }

    // Update spawn points from animated mesh surface
    this.updateSpawnPoints();

    // Run GPGPU computation
    this.gpuCompute.compute();

    // Update particle material with new positions
    this.material.uniforms.uPositions.value =
      this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
    this.material.uniforms.uTime.value = this.time.elapsedTime;
  }

  updateSpawnPoints() {
    if (!this.dolphinMesh || !this.spawnTexture || !this.sampledData) return;

    // Update skeleton
    if (this.dolphinMesh.skeleton) {
      this.dolphinMesh.skeleton.update();
    }
    this.dolphinMesh.updateMatrixWorld(true);

    const data = this.spawnTexture.image.data;
    const posAttr = this.dolphinMesh.geometry.getAttribute('position');

    for (let i = 0; i < this.PARTICLES; i++) {
      const idx = i * 4;
      const sample = this.sampledData[i];

      // Get base vertex position
      this._tmpPosition.fromBufferAttribute(posAttr, sample.vertexIndex);

      // Add offset and push slightly outward along normal
      this._tmpPosition.add(sample.offset);
      this._tmpPosition.addScaledVector(sample.normal, 0.02);

      // Apply bone transform
      if (this.dolphinMesh.applyBoneTransform) {
        this._tmpSkinned.copy(this._tmpPosition);
        this.dolphinMesh.applyBoneTransform(
          sample.vertexIndex,
          this._tmpSkinned
        );
        this._tmpSkinned.applyMatrix4(this.dolphinMesh.matrixWorld);
      } else if (this.dolphinMesh.boneTransform) {
        this._tmpSkinned.copy(this._tmpPosition);
        this.dolphinMesh.boneTransform(sample.vertexIndex, this._tmpSkinned);
        this._tmpSkinned.applyMatrix4(this.dolphinMesh.matrixWorld);
      } else {
        this._tmpSkinned
          .copy(this._tmpPosition)
          .applyMatrix4(this.dolphinMesh.matrixWorld);
      }

      // Update spawn texture with world-space position
      data[idx + 0] = this._tmpSkinned.x;
      data[idx + 1] = this._tmpSkinned.y;
      data[idx + 2] = this._tmpSkinned.z;
      // Keep vertex index in W for reference
    }

    this.spawnTexture.needsUpdate = true;
    this.positionVariable.material.uniforms.uSpawnPoints.value =
      this.spawnTexture;
  }

  setDebug() {
    if (!this.game.isDebugEnabled) return;

    const debug = this.game.debug;
    const uniforms = this.positionVariable.material.uniforms;

    debug.add(
      uniforms.uBackwardSpeed,
      'value',
      { min: 0.5, max: 8, step: 0.1, label: 'Backward Speed' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uTurbulence,
      'value',
      { min: 0, max: 2, step: 0.05, label: 'Turbulence' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uSpread,
      'value',
      { min: 0, max: 1, step: 0.05, label: 'Spread' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uCurlStrength,
      'value',
      { min: 0, max: 2, step: 0.05, label: 'Curl Strength' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uSpiralIntensity,
      'value',
      { min: 0, max: 1, step: 0.05, label: 'Spiral' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uBuoyancy,
      'value',
      { min: 0, max: 0.5, step: 0.01, label: 'Buoyancy' },
      'Wake Particles'
    );

    debug.add(
      uniforms.uDrag,
      'value',
      { min: 0.9, max: 1.0, step: 0.005, label: 'Drag' },
      'Wake Particles'
    );

    debug.add(
      this.material.uniforms.uSize,
      'value',
      { min: 1, max: 30, step: 1, label: 'Particle Size' },
      'Wake Particles'
    );

    debug.add(
      this.material.uniforms.uColor1,
      'value',
      { label: 'Color Fresh' },
      'Wake Particles'
    );

    debug.add(
      this.material.uniforms.uColor2,
      'value',
      { label: 'Color Mid' },
      'Wake Particles'
    );

    debug.add(
      this.material.uniforms.uColor3,
      'value',
      { label: 'Color Old' },
      'Wake Particles'
    );
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.particleSystem);
  }
}
