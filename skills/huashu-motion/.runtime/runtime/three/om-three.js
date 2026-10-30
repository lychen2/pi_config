/* huashu-motion · Three.js helpers (window.OM3). Needs vendor/three.min.js (window.THREE) and vendor/om.js. MIT.
 * A lit studio, the product's real things in it (its logo SVG extruded, its screenshots on a device or a
 * card, its GLB), and a render that follows OM.space. Everything waits for its files through OM.ready, so
 * no frame is taken before a texture or a model has arrived. */
(function () {
  const OM3 = (window.OM3 = {});
  const T = () => window.THREE;
  const size = () => {
    const r = document.querySelector('[data-composition-id]');
    return [Number(r?.getAttribute('data-width')) || 1920, Number(r?.getAttribute('data-height')) || 1080];
  };
  // Every load the films wait for also redraws them when it lands: a frame rendered before a texture or
  // a font arrived is never the one that gets captured.
  const films = [];
  const ready = (p) => {
    const q = Promise.resolve(p).then((v) => { films.forEach((f) => f()); return v; });
    return window.OM && OM.ready ? OM.ready(q) : q;
  };
  OM3.ready = ready;

  // Films render from file://, where fetch() cannot read local files; XMLHttpRequest can. Loaders that
  // fetch (GLTF, HDR) get a blob: URL of the bytes instead.
  OM3.read = (url, type = 'arraybuffer') => new Promise((ok, no) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = type;
    const fail = () => no(new Error(`huashu-motion: could not read ${url}`));
    x.onload = () => ((x.status === 0 || x.status < 300) && x.response != null ? ok(x.response) : fail());
    x.onerror = fail;
    x.send();
  });
  const viaBlob = (Loader, url) => ready(OM3.read(url).then((buf) => {
    const blob = URL.createObjectURL(new Blob([buf]));
    return new Loader().loadAsync(blob).finally(() => URL.revokeObjectURL(blob));
  }));

  // ---------- stage ----------
  // OM3.stage(canvas, { background, env: 'studio'|'room'|'<file>.hdr', exposure, fov, dof: { aperture, maxblur },
  //   bloom: { strength, radius, threshold }, fog: [near, far], shadows, units: 'px' })
  OM3.stage = function (canvas, o = {}) {
    const THREE = T(), [W, H] = size();
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !o.background, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = o.exposure ?? 1;
    renderer.shadowMap.enabled = o.shadows !== false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    if (o.background) scene.background = new THREE.Color(o.background);
    if (o.fog) scene.fog = new THREE.Fog(o.background || '#000', o.fog[0], o.fog[1]);
    const px = o.units === 'px';
    const camera = new THREE.PerspectiveCamera(o.fov || 30, W / H, px ? 10 : 0.05, px ? 40000 : 400);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = o.env || 'studio';
    if (env === 'room') scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    else if (/\.hdr$/i.test(env)) {
      scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      viaBlob(THREE.HDRLoader, env).then((tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmrem.fromEquirectangular(tex).texture; });
    } else scene.environment = pmrem.fromEquirectangular(studioSky(o.envColors)).texture;
    if (o.envIntensity != null) scene.environmentIntensity = o.envIntensity;

    let composer = null, bokeh = null;
    if (o.dof || o.bloom) {
      composer = new THREE.EffectComposer(renderer);
      composer.setPixelRatio(1);
      composer.setSize(W, H);
      composer.addPass(new THREE.RenderPass(scene, camera));
      if (o.bloom) composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(W, H), o.bloom.strength ?? 0.35, o.bloom.radius ?? 0.4, o.bloom.threshold ?? 0.85));
      if (o.dof) { bokeh = new THREE.BokehPass(scene, camera, { focus: 10, aperture: o.dof.aperture ?? 0.0025, maxblur: o.dof.maxblur ?? 0.008 }); composer.addPass(bokeh); }
      composer.addPass(new THREE.OutputPass());
    }
    const stage = {
      THREE, renderer, scene, camera, W, H, bokeh,
      // focus: distance from the camera to the sharp plane (OM3.film passes the camera's distance to its target)
      render(opts = {}) {
        if (bokeh && opts.focus != null) bokeh.uniforms.focus.value = opts.focus;
        if (composer) composer.render(); else renderer.render(scene, camera);
      },
      add(...objs) { scene.add(...objs); return stage; },
    };
    return stage;
  };

  // An equirect sky with two soft boxes and a dark floor: metals read as metal (an all-bright environment
  // turns them white and weightless, none at all turns them black).
  function studioSky(c = {}) {
    const THREE = T(), cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, c.top || '#9a9a9a'); sky.addColorStop(0.48, c.horizon || '#5a5a5a'); sky.addColorStop(0.52, c.floor || '#1b1b1b'); sky.addColorStop(1, '#050505');
    g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
    const box = (x, y, w, h, a) => { const r = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 1.4); r.addColorStop(0, `rgba(255,255,255,${a})`); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(x - w, y - h, w * 3, h * 3); };
    box(180, 90, 220, 120, 1); box(640, 120, 160, 90, 0.75); box(470, 20, 120, 40, 0.5);
    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------- light ----------
  // A key that casts soft shadows over `span` units around the origin, and a rim from behind.
  OM3.lights = function (stage, o = {}) {
    const THREE = T(), span = o.span || 8;
    const key = new THREE.DirectionalLight(o.key || '#ffffff', o.keyIntensity ?? 2.2);
    key.position.set(...(o.from || [span * 0.6, span, span * 0.7]));
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.1, far: span * 6 });
    key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(o.rim || '#ffffff', o.rimIntensity ?? 1.2);
    rim.position.set(-span * 0.8, span * 0.5, -span);
    stage.scene.add(key, rim);
    return { key, rim };
  };

  // ---------- space ----------
  // A photo-studio sweep (floor curving into a wall): the frame never ends in a hard horizon line.
  OM3.cyc = function (stage, o = {}) {
    const THREE = T(), w = o.width || 60, depth = o.depth || 30, r = o.radius || 8, wall = o.height || 30, y0 = o.y ?? 0;
    const len = depth + (Math.PI * r) / 2 + wall, geo = new THREE.PlaneGeometry(w, len, 1, 120), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = p.getY(i) + len / 2; // 0 at the front edge
      let y, z;
      if (s <= depth) { y = 0; z = depth / 2 - s; }
      else if (s <= depth + (Math.PI * r) / 2) { const a = (s - depth) / r; y = r - r * Math.cos(a); z = -depth / 2 - r * Math.sin(a); }
      else { y = r + (s - depth - (Math.PI * r) / 2); z = -depth / 2 - r; }
      p.setXYZ(i, p.getX(i), y + y0, z + (o.z || 0));
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: o.color || '#d8d4cc', roughness: o.roughness ?? 0.85, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    stage.scene.add(mesh);
    return mesh;
  };

  // ---------- real things ----------
  OM3.texture = function (url) {
    const THREE = T();
    let done;
    const p = new Promise((ok) => (done = ok));
    const tex = new THREE.TextureLoader().load(url, (t) => done(t), undefined, () => done(null));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    ready(p.then((t) => { if (!t) throw new Error(`huashu-motion: could not load ${url}`); }));
    tex.loaded = p;
    return tex;
  };

  // The product's logo as an object: every filled path of the SVG extruded, in the SVG's own colours
  // (or `color`), centred, `size` units tall. Returns a Group at once; the geometry arrives before frame one.
  //   const mark = OM3.logo('assets/logo.svg', { size: 2, depth: 0.25, bevel: 0.03, metalness: 0.2 })
  OM3.logo = function (svg, o = {}) {
    const THREE = T(), group = new THREE.Group();
    const text = /<svg[\s>]/i.test(svg) ? Promise.resolve(svg) : OM3.read(svg, 'text');
    ready(text.then((src) => {
      const data = new THREE.SVGLoader().parse(src), inner = new THREE.Group(), parts = [];
      let y0 = Infinity, y1 = -Infinity;
      for (const path of data.paths) {
        const style = path.userData?.style || {};
        if (style.fill === 'none' || style.fillOpacity === 0) continue;
        const shapes = THREE.SVGLoader.createShapes(path);
        for (const sh of shapes) for (const pt of sh.getPoints()) { y0 = Math.min(y0, pt.y); y1 = Math.max(y1, pt.y); }
        if (shapes.length) parts.push([shapes, path.color]);
      }
      if (!parts.length) throw new Error('huashu-motion: OM3.logo — the SVG has no filled paths');
      // depth and bevel are in scene units: build in SVG units divided by the scale, then scale evenly
      const s = (o.size || 2) / Math.max(1e-6, y1 - y0), bevel = o.bevel ?? 0.03;
      for (const [shapes, color] of parts) {
        const geo = new THREE.ExtrudeGeometry(shapes, { depth: (o.depth ?? 0.25) / s, curveSegments: 24, bevelEnabled: bevel > 0, bevelThickness: bevel / s, bevelSize: (bevel * 0.8) / s, bevelSegments: 6 });
        const mat = new THREE.MeshPhysicalMaterial({ color: o.color || color, roughness: o.roughness ?? 0.32, metalness: o.metalness ?? 0.1, clearcoat: o.clearcoat ?? 0.6, clearcoatRoughness: 0.2 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        inner.add(mesh);
      }
      inner.scale.set(s, -s, s); // SVG y grows down
      inner.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
      inner.position.sub(c);
      group.add(inner);
    }));
    return group;
  };

  // A screenshot on a device: a rounded slab with a lit-from-inside screen (the interface keeps its true
  // colours: no tone mapping on the pixels) under a faint glass that catches the studio's reflections.
  //   OM3.screen('assets/app.png', { width: 4, bezel: 0.08, depth: 0.12, radius: 0.12, body: '#1d1d1f' })
  //   bezel: 0, depth: 0.02 gives a printed card or a floating panel.
  //   crop: [left, top, right, bottom] (0–1 of the image) shows one part of a screenshot — a panel lifted
  //   out of the interface, the same capture, no new file.
  OM3.screen = function (image, o = {}) {
    const THREE = T(), group = new THREE.Group(), w = o.width || 4;
    let tex = typeof image === 'string' ? OM3.texture(image) : image;
    const cr = o.crop || [0, 0, 1, 1];
    if (o.crop) {
      const src = tex;
      tex = src.clone();
      tex.loaded = src.loaded;
      tex.repeat.set(cr[2] - cr[0], cr[3] - cr[1]);
      tex.offset.set(cr[0], 1 - cr[3]);
      if (src.loaded) src.loaded.then(() => { tex.needsUpdate = true; });
    }
    const build = (aspect) => {
      const h = w / aspect, b = o.bezel ?? 0.08, d = o.depth ?? 0.12, rad = Math.min(o.radius ?? 0.12, (Math.min(w, h) + 2 * b) / 2 - 1e-3);
      if (d > 0) {
        const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(w + 2 * b, h + 2 * b, d, 6, Math.min(rad, d / 2 - 1e-3)), new THREE.MeshPhysicalMaterial({ color: o.body || '#1d1d1f', roughness: 0.35, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.15 }));
        body.castShadow = body.receiveShadow = true;
        group.add(body);
      }
      const screen = new THREE.Mesh(roundedPlane(w, h, Math.max(0, rad - b)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.z = d / 2 + 0.002;
      group.add(screen);
      if (o.glass !== false) {
        const glass = new THREE.Mesh(roundedPlane(w, h, Math.max(0, rad - b)), new THREE.MeshPhysicalMaterial({ color: '#000', roughness: 0.04, metalness: 0, transparent: true, opacity: o.glass ?? 0.18, envMapIntensity: 1.4, depthWrite: false }));
        glass.position.z = d / 2 + 0.004;
        group.add(glass);
      }
      group.userData.size = [w + 2 * b, h + 2 * b, d];
    };
    if (o.aspect) build(o.aspect);
    else ready((tex.loaded || Promise.resolve(tex)).then((t) => build(((t?.image?.width || 16) * (cr[2] - cr[0])) / ((t?.image?.height || 9) * (cr[3] - cr[1])))));
    group.userData.screen = tex;
    return group;
  };

  function roundedPlane(w, h, r) {
    const THREE = T(), s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ShapeGeometry(s, 16), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / h);
    return g;
  }

  // A .glb (one file: textures inside). Resolves to the glTF scene, shadows on.
  OM3.gltf = function (url) {
    return viaBlob(T().GLTFLoader, url).then((g) => { g.scene.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); return g; });
  };

  // ---------- time ----------
  // One clock for the whole 3D layer: the camera is posed for t, update(t) moves the objects, then one
  // render, in focus on whatever the camera looks at.
  //   OM3.film(stage, tl, D, cam, (t) => { mark.rotation.y = t * 0.4; });
  // The render waits for the end of the seek (a microtask): the timeline updates its tweens in start
  // order, so drawing inside the clock tween (which starts at 0) would show the values tweens had
  // before this frame. Every frame — a jump to 3.6 s included — draws what its tweens just set.
  OM3.film = function (stage, tl, duration, cam, update) {
    let at = 0, queued = false;
    const draw = () => {
      queued = false;
      if (cam) cam.apply(at);
      if (update) update(at);
      stage.render({ focus: cam ? cam.pose(at).distance : undefined });
    };
    const queue = () => { if (!queued) { queued = true; queueMicrotask(draw); } };
    films.push(queue);
    return OM.clock(tl, (t) => { at = t; queue(); }, duration);
  };

  // Clickable in the studio: the object's projected box, so comments arrive with its id.
  OM3.region = function (id, object, stage, label) {
    const THREE = T(), box = new THREE.Box3(), v = new THREE.Vector3();
    OM.region(id, () => {
      box.setFromObject(object);
      if (box.isEmpty()) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(stage.camera);
        if (v.z > 1) return null;
        const x = ((v.x + 1) / 2) * stage.W, y = ((1 - v.y) / 2) * stage.H;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      return [x0, y0, x1 - x0, y1 - y0];
    }, label || id);
    return OM3;
  };
})();
