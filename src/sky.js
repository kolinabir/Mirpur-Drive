/**
 * sky.js
 *
 * Sky dome, sun, and the haze that defines how Dhaka actually looks. Dry-season
 * visibility here is roughly 1.5 to 3 km and the light is scattered enough that
 * shadows stay soft, so the fog is doing as much work as the lighting.
 */

import * as THREE from 'three';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 hazeColor;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float sunIntensity;
  uniform float nightFactor;
  uniform float time;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = dir.y;

    // Multi-tier natural atmospheric gradient
    float zenithT = pow(clamp(h, 0.0, 1.0), 0.52);
    vec3 col = mix(horizonColor, topColor, zenithT);

    // Luminous horizon haze band
    float hazeBand = exp(-max(h, 0.0) * 6.5);
    col = mix(col, hazeColor, hazeBand * 0.85);

    // Ground direction atmospheric blend
    if (h < 0.0) {
      float groundT = clamp(-h * 4.5, 0.0, 1.0);
      vec3 groundHaze = mix(hazeColor, horizonColor * 0.8, 0.5);
      col = mix(col, groundHaze, groundT);
    }

    // Brilliant Sun core & atmospheric corona
    vec3 normSunDir = normalize(sunDirection);
    float sunCos = max(dot(dir, normSunDir), 0.0);
    float sunDisc = smoothstep(0.9991, 0.9997, sunCos);
    float innerCorona = pow(sunCos, 256.0) * 1.6 + pow(sunCos, 48.0) * 0.45;
    float mieHalo = pow(sunCos, 8.0) * 0.22;
    vec3 sunTotal = (sunColor * sunDisc * 3.5 + sunColor * (innerCorona + mieHalo)) * sunIntensity;
    col += sunTotal;

    // Warm horizon glow when the sun is low (golden hour / dawn / dusk)
    if (normSunDir.y < 0.55 && sunIntensity > 0.1) {
      float horizProx = max(0.0, 1.0 - abs(h) * 5.0);
      vec3 horizDir = normalize(vec3(dir.x, 0.0, dir.z));
      vec3 horizSun = normalize(vec3(normSunDir.x, 0.0, normSunDir.z));
      float sunAzimuth = max(dot(horizDir, horizSun), 0.0);
      col += sunColor * pow(sunAzimuth, 3.5) * horizProx * 0.5 * max(0.0, 1.0 - normSunDir.y * 1.7);
    }

    // Night features: Starfield & Moon
    if (nightFactor > 0.02 && h > 0.03) {
      // Procedural twinkling stars
      vec3 p = dir * 260.0;
      vec3 starCoord = floor(p);
      float rnd = fract(sin(dot(starCoord, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      if (rnd > 0.986) {
        float starBright = pow((rnd - 0.986) / 0.014, 2.4);
        float twinkle = 0.75 + 0.25 * sin(rnd * 80.0 + time * 2.5);
        vec3 starCol = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.88, 0.7), fract(rnd * 19.0));
        col += starCol * starBright * twinkle * nightFactor * smoothstep(0.03, 0.22, h);
      }

      // Glowing moon
      vec3 moonDir = normalize(vec3(-normSunDir.x, max(0.35, -normSunDir.y * 0.8 + 0.35), -normSunDir.z));
      float moonCos = max(dot(dir, moonDir), 0.0);
      float moonDisc = smoothstep(0.9984, 0.9994, moonCos);
      float moonAura = pow(moonCos, 64.0) * 0.35 + pow(moonCos, 12.0) * 0.12;
      col += vec3(0.85, 0.92, 1.0) * (moonDisc * 2.2 + moonAura) * nightFactor;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Keyframed times of day with vibrant, natural palettes.
 */
export const TIMES_OF_DAY = {
  morning: {
    label: 'Morning haze',
    elevation: 0.30,
    azimuth: 1.9,
    top: 0x285c99,
    horizon: 0xefb783,
    haze: 0xf8d4aa,
    sun: 0xffe0a2,
    sunIntensity: 1.5,
    ambient: 0xbaa598,
    ambientGround: 0x5a4838,
    ambientIntensity: 0.85,
    dirIntensity: 1.5,
    fog: 0xe5bc94,
    fogNear: 100,
    fogFar: 2500,
    exposure: 1.0,
    cloudColor: 0xfff0dc,
    cloudOpacity: 0.82,
  },
  midday: {
    label: 'Midday',
    elevation: 1.15,
    azimuth: 2.6,
    top: 0x1d6db8,
    horizon: 0x8fc2ea,
    haze: 0xc5e2f7,
    sun: 0xfffaec,
    sunIntensity: 1.3,
    ambient: 0xbad4ec,
    ambientGround: 0x7a7368,
    ambientIntensity: 0.95,
    dirIntensity: 1.75,
    fillColor: 0x9fb5c8,
    fillIntensity: 0.4,
    fog: 0xa4ccee,
    fogNear: 150,
    fogFar: 2800,
    exposure: 1.0,
    cloudColor: 0xffffff,
    cloudOpacity: 0.85,
  },
  afternoon: {
    label: 'Late afternoon',
    elevation: 0.42,
    azimuth: 4.3,
    top: 0x245ca0,
    horizon: 0xeda564,
    haze: 0xf5be82,
    sun: 0xffb84d,
    sunIntensity: 1.8,
    ambient: 0xbaa288,
    ambientGround: 0x5a4636,
    ambientIntensity: 0.85,
    dirIntensity: 1.6,
    fog: 0xe2b27e,
    fogNear: 100,
    fogFar: 2600,
    exposure: 1.02,
    cloudColor: 0xffeed2,
    cloudOpacity: 0.82,
  },
  dusk: {
    label: 'Dusk',
    elevation: 0.10,
    azimuth: 4.75,
    top: 0x182246,
    horizon: 0xd45028,
    haze: 0xad3a2c,
    sun: 0xff4e20,
    sunIntensity: 2.2,
    ambient: 0x6a5472,
    ambientGround: 0x3e322b,
    ambientIntensity: 0.7,
    dirIntensity: 0.95,
    fillColor: 0x8a7268,
    fillIntensity: 0.35,
    fog: 0x72343a,
    fogNear: 80,
    fogFar: 2200,
    exposure: 1.05,
    cloudColor: 0xdb6e42,
    cloudOpacity: 0.78,
  },
  night: {
    label: 'Night',
    elevation: -0.2,
    azimuth: 5.2,
    top: 0x040812,
    horizon: 0x0c1424,
    haze: 0x121b2f,
    sun: 0x7ea2d6,
    sunIntensity: 0.25,
    dirColor: 0x7ea2d6,
    ambient: 0x162234,
    ambientGround: 0x1a1614,
    ambientIntensity: 0.6,
    dirIntensity: 0.35,
    fillColor: 0x3a3228,
    fillIntensity: 0.25,
    fog: 0x090f1b,
    fogNear: 60,
    fogFar: 2000,
    exposure: 1.15,
    cloudColor: 0x223046,
    cloudOpacity: 0.55,
  },
};

function cloudLookFor(p) {
  if (p.cloudColor !== undefined) {
    return { color: new THREE.Color(p.cloudColor), opacity: p.cloudOpacity ?? 0.82 };
  }
  const horizon = new THREE.Color(p.horizon);
  const haze = new THREE.Color(p.haze ?? p.horizon);
  const color = horizon.lerp(haze, 0.5).lerp(new THREE.Color(0xffffff), 0.35);
  return { color, opacity: p.cloudOpacity ?? 0.82 };
}

export class Sky {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.uniforms = {
      topColor: { value: new THREE.Color(0x1d6db8) },
      horizonColor: { value: new THREE.Color(0x8fc2ea) },
      hazeColor: { value: new THREE.Color(0xc5e2f7) },
      sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      sunColor: { value: new THREE.Color(0xfffaec) },
      sunIntensity: { value: 1.3 },
      nightFactor: { value: 0.0 },
      time: { value: 0.0 },
    };

    const geo = new THREE.SphereGeometry(1900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.name = 'sky';
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Sun directional light (no shadow map for clean, even lighting without map-wide shadow artifacts)
    this.sun = new THREE.DirectionalLight(0xfffaec, 1.75);
    this.sun.castShadow = false;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.ambient = new THREE.HemisphereLight(0xbad4ec, 0x7a7368, 0.95);
    scene.add(this.ambient);

    this.fill = new THREE.AmbientLight(0x9fb5c8, 0.4);
    scene.add(this.fill);

    scene.fog = new THREE.Fog(0xa4ccee, 150, 2800);

    this.clouds = buildClouds();
    scene.add(this.clouds);

    this.current = null;
    this.setTime('midday');
  }

  /** Wind runs in the vertex shader; only three uniform values change per frame. */
  updateClouds(position, elapsed = 0) {
    const uniforms = this.clouds.userData.windUniforms;
    uniforms.time.value = elapsed;
    uniforms.origin.value.set(position.x, position.z);
  }

  setTime(key) {
    const p = TIMES_OF_DAY[key];
    if (!p) return;
    this.current = key;
    this.preset = p;

    const dir = new THREE.Vector3(
      Math.cos(p.elevation) * Math.sin(p.azimuth),
      Math.sin(p.elevation),
      Math.cos(p.elevation) * Math.cos(p.azimuth)
    ).normalize();

    this.uniforms.topColor.value.setHex(p.top);
    this.uniforms.horizonColor.value.setHex(p.horizon);
    this.uniforms.hazeColor.value.setHex(p.haze);
    this.uniforms.sunColor.value.setHex(p.sun);
    this.uniforms.sunIntensity.value = p.sunIntensity;
    this.uniforms.sunDirection.value.copy(dir);
    this.uniforms.nightFactor.value = p.elevation < 0 ? 1.0 : (p.elevation < 0.16 ? 0.4 : 0.0);

    this.sunDir = dir;
    this.sun.color.setHex(p.dirColor ?? p.sun);
    this.sun.intensity = p.dirIntensity;
    this.sun.castShadow = false;

    this.ambient.color.setHex(p.ambient);
    this.ambient.groundColor.setHex(p.ambientGround ?? (p.elevation < 0 ? 0x1a1614 : 0x7a7368));
    this.ambient.intensity = p.ambientIntensity;
    this.fill.color.setHex(p.fillColor ?? 0x9fb5c8);
    this.fill.intensity = p.fillIntensity ?? (p.elevation < 0 ? 0.2 : 0.4);

    this.scene.fog.color.setHex(p.fog);
    this.scene.fog.near = p.fogNear;
    this.scene.fog.far = p.fogFar;

    this.renderer.toneMappingExposure = p.exposure;

    if (this.clouds && this.clouds.userData.materials) {
      const look = cloudLookFor(p);
      const [cumulusMat, cirrusMat] = this.clouds.userData.materials;
      if (cumulusMat) {
        cumulusMat.color.copy(look.color);
        cumulusMat.opacity = look.opacity;
      }
      if (cirrusMat) {
        cirrusMat.color.copy(look.color);
        cirrusMat.opacity = look.opacity * 0.55;
      }
    }

    return p.label;
  }

  /** Keep sky dome, sun direction, and dynamic altitude fog synced with the camera. */
  update(cameraPosition, elapsed = 0) {
    this.dome.position.copy(cameraPosition);
    this.sun.target.position.copy(cameraPosition);
    this.sun.position
      .copy(cameraPosition)
      .addScaledVector(this.sunDir, 320);
    this.sun.target.updateMatrixWorld();

    this.uniforms.time.value = elapsed;

    // Expand fog distance at high altitude / sky view for a grand panorama
    if (this.scene.fog && this.preset) {
      const altBoost = Math.min(1.0, Math.max(0.0, (cameraPosition.y - 40) / 100));
      // The opening's route overview is a genuine high aerial shot. Give the
      // corridor enough atmospheric reach to stay crisp at that altitude
      // instead of fading the far stations into a grey wall.
      this.scene.fog.far = THREE.MathUtils.lerp(this.preset.fogFar, 5200, altBoost);
      this.scene.fog.near = THREE.MathUtils.lerp(this.preset.fogNear, 200, altBoost);
    }
  }

  /** True when streetlights and windows should be lit. */
  get isDark() {
    return this.preset.elevation < 0.16;
  }
}

/**
 * Generate a procedural cumulus puff canvas texture with natural lobe clustering,
 * bright sunlit tops, and volumetric shaded bases.
 */
function createCumulusTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 256);

  // Overlapping soft organic lobes
  const lobes = [
    [150, 165, 85], [210, 130, 95], [290, 120, 105], [370, 150, 90],
    [100, 185, 65], [420, 180, 70], [250, 150, 110], [180, 180, 80],
    [320, 175, 85], [250, 105, 80], [330, 130, 75], [170, 135, 75],
  ];

  for (const [x, y, r] of lobes) {
    // Base ambient shaded body
    const gBase = ctx.createRadialGradient(x, y + r * 0.25, 0, x, y, r);
    gBase.addColorStop(0, 'rgba(230, 240, 252, 0.95)');
    gBase.addColorStop(0.55, 'rgba(240, 246, 255, 0.75)');
    gBase.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gBase;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit bright rim/top highlight
    const gSun = ctx.createRadialGradient(x, y - r * 0.35, 0, x, y - r * 0.2, r * 0.85);
    gSun.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
    gSun.addColorStop(0.6, 'rgba(255, 255, 255, 0.45)');
    gSun.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gSun;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Keep the soft lobes from touching the canvas bounds. Without this mask,
  // the transparent texture is still visibly cut by a straight billboard
  // edge when a large instanced plane crosses the viewer's eye line.
  softenTextureEdges(ctx, c.width, c.height, 28);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generate a procedural high-altitude wispy cirrus cloud texture.
 */
function createCirrusTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);

  const wisps = [
    [100, 64, 180, 30], [260, 55, 220, 38], [400, 68, 160, 28],
    [180, 72, 140, 24], [340, 60, 190, 32],
  ];

  for (const [x, y, rx, ry] of wisps) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.beginPath();
    ctx.translate(x, y);
    ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
    ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
  }

  softenTextureEdges(ctx, c.width, c.height, 24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softenTextureEdges(ctx, width, height, margin) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  const horizontal = ctx.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(margin / width, 'rgba(0,0,0,1)');
  horizontal.addColorStop(1 - margin / width, 'rgba(0,0,0,1)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, width, height);

  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(0,0,0,0)');
  vertical.addColorStop(margin / height, 'rgba(0,0,0,1)');
  vertical.addColorStop(1 - margin / height, 'rgba(0,0,0,1)');
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Multi-layer cloud system:
 * Layer 1: Volumetric cumulus field across the sky (550m - 820m).
 * Layer 2: Wispy high-altitude cirrus veil (1250m - 1550m).
 */
function buildClouds() {
  const group = new THREE.Group();
  group.name = 'clouds';

  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2); // lie flat, seen from below

  // 1. Cumulus Layer
  const cumulusTex = createCumulusTexture();
  const cumulusMat = new THREE.MeshBasicMaterial({
    map: cumulusTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  const cumulusCount = 32;
  const cumulusMesh = new THREE.InstancedMesh(geo, cumulusMat, cumulusCount);
  cumulusMesh.frustumCulled = false;
  cumulusMesh.renderOrder = -2;

  let seed = 20260909;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const dummy = new THREE.Object3D();
  for (let i = 0; i < cumulusCount; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 280 + rnd() * 2800;
    const scale = 500 + rnd() * 950;
    dummy.position.set(Math.cos(ang) * rad, 550 + rnd() * 320, Math.sin(ang) * rad);
    dummy.rotation.y = rnd() * Math.PI * 2;
    dummy.scale.set(scale, 1, scale * (0.55 + rnd() * 0.3));
    dummy.updateMatrix();
    cumulusMesh.setMatrixAt(i, dummy.matrix);
  }
  cumulusMesh.instanceMatrix.needsUpdate = true;
  group.add(cumulusMesh);

  // 2. High Cirrus Layer
  const cirrusTex = createCirrusTexture();
  const cirrusMat = new THREE.MeshBasicMaterial({
    map: cirrusTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  const cirrusCount = 12;
  const cirrusMesh = new THREE.InstancedMesh(geo, cirrusMat, cirrusCount);
  cirrusMesh.frustumCulled = false;
  cirrusMesh.renderOrder = -3; // behind cumulus

  for (let i = 0; i < cirrusCount; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 450 + rnd() * 3600;
    const scale = 1200 + rnd() * 1400;
    dummy.position.set(Math.cos(ang) * rad, 1250 + rnd() * 320, Math.sin(ang) * rad);
    dummy.rotation.y = (rnd() - 0.5) * 0.6; // gentle aligned drift
    dummy.scale.set(scale, 1, scale * 0.35);
    dummy.updateMatrix();
    cirrusMesh.setMatrixAt(i, dummy.matrix);
  }
  cirrusMesh.instanceMatrix.needsUpdate = true;
  group.add(cirrusMesh);

  const windUniforms = { time: { value: 0 }, origin: { value: new THREE.Vector2() } };
  function animateLayer(material, wind, span) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.cloudTime = windUniforms.time;
      shader.uniforms.cloudOrigin = windUniforms.origin;
      shader.uniforms.cloudWind = { value: new THREE.Vector2(...wind) };
      shader.uniforms.cloudSpan = { value: span };
      shader.vertexShader = `uniform float cloudTime; uniform vec2 cloudOrigin; uniform vec2 cloudWind; uniform float cloudSpan; varying float cloudEdge;
${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 cloudPoint = instanceMatrix * vec4(transformed, 1.0);
        vec2 centre = instanceMatrix[3].xz;
        vec2 relative = mod(centre + cloudWind * cloudTime - cloudOrigin + cloudSpan * .5, cloudSpan) - cloudSpan * .5;
        cloudPoint.xz += relative + cloudOrigin - centre;
        cloudEdge = 1.0 - smoothstep(cloudSpan * .32, cloudSpan * .49, length(relative));
        vec4 mvPosition = modelViewMatrix * cloudPoint;
        gl_Position = projectionMatrix * mvPosition;
      `);
      shader.fragmentShader = `varying float cloudEdge;
${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `diffuseColor.a *= cloudEdge; if (diffuseColor.a < .012) discard;`);
    };
    material.customProgramCacheKey = () => 'mirpur-wind-clouds-v1';
  }
  animateLayer(cumulusMat, [9, 2], 7200);
  animateLayer(cirrusMat, [5, 1], 9000);
  group.userData.windUniforms = windUniforms;
  group.userData.materials = [cumulusMat, cirrusMat];
  return group;
}
