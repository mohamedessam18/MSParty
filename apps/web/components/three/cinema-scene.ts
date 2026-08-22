import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  WebGLRenderer
} from "three";

/**
 * The room, built rather than drawn.
 *
 * The landing page already had a cinema in CSS — rows of seats on transformed
 * divs — and it reads well, but it is a flat picture of depth: nothing behind
 * anything, no light falling on anything. This is the same room with the parts
 * actually in it, so the beam passes *through* the dust and the seats sit *in*
 * the light rather than being tinted to look like they do.
 *
 * Written against three's own API instead of a React renderer. The scene is
 * built once and then only read from — there is no state to reconcile, so a
 * reconciler would be a second copy of the scene graph and another fifty
 * kilobytes to describe a room that never changes shape.
 *
 * Imports are named on purpose: `import * as THREE` defeats tree-shaking and
 * drags the whole library in, most of which is loaders and controls this never
 * touches.
 */

/** The house palette, so the room matches the page it sits behind. */
const INK = 0x140a0d;
const VELVET = 0x2d1418;
const VELVET_HI = 0x3d1c22;
const GOLD = 0xc9a227;
const CURTAIN = 0xd64545;
const IVORY = 0xf2e8d5;

export type Quality = "full" | "reduced";

/**
 * How much of the room to build.
 *
 * "room" is the landing page: screen, curtains, an audience — the thing being
 * sold. "atmosphere" is everything behind a form: the beam and the dust and the
 * glow, with the furniture left out. Reducing the quality of the full room was
 * not enough on its own — a smaller cinema behind a password field is still a
 * cinema behind a password field.
 */
export type Variant = "room" | "atmosphere";

export type SceneHandle = {
  /** Pointer position in clipspace, -1..1. The camera leans towards it. */
  look: (x: number, y: number) => void;
  resize: (width: number, height: number) => void;
  render: (time: number) => void;
  dispose: () => void;
};

/**
 * Dust in a projector beam.
 *
 * Points rather than instanced quads: there is no per-mote geometry worth
 * having, and a Points cloud of a few hundred is one draw call. They drift up
 * slowly and wrap, which is what dust in a still room actually does — real
 * dust falls, but a beam is warm and the air in it rises.
 */
function makeDust(count: number) {
  const positions = new Float32Array(count * 3);
  const drift = new Float32Array(count);

  for (let index = 0; index < count; index++) {
    // Scattered through the cone of the beam rather than a box, so none of them
    // appear outside the light.
    const depth = Math.random();
    const spread = 0.5 + depth * 4.4;
    positions[index * 3] = (Math.random() - 0.5) * spread;
    positions[index * 3 + 1] = (Math.random() - 0.5) * spread * 0.55 + 1.4;
    positions[index * 3 + 2] = 3.4 - depth * 11.5;
    drift[index] = 0.04 + Math.random() * 0.09;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: IVORY,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: AdditiveBlending
  });

  const points = new Points(geometry, material);
  return { points, positions, drift, geometry, material };
}

/** Rows of seats, as one instanced mesh — one draw call for the whole room. */
function makeSeats(rows: number, perRow: number) {
  const geometry = new PlaneGeometry(0.38, 0.44);
  // Nearly black. An audience seen against a lit screen is a row of
  // silhouettes; giving the seats a colour of their own makes them objects in
  // the room rather than shapes in front of the light.
  const material = new MeshStandardMaterial({
    color: 0x1a0e11,
    roughness: 1,
    metalness: 0,
    side: DoubleSide
  });

  const mesh = new InstancedMesh(geometry, material, rows * perRow);
  const matrix = new Matrix4();
  let index = 0;

  for (let row = 0; row < rows; row++) {
    // Between the camera and the screen, front row nearest. These were laid out
    // on positive z, which put the back rows behind the viewer where nothing
    // could see them.
    const z = -2.9 - row * 1.15;
    const spacing = 0.62 + row * 0.05;
    const stagger = row % 2 ? spacing / 2 : 0;
    // Raked: further rows sit higher, the way seating in a real house does.
    const y = -1.72 + row * 0.15;

    for (let seat = 0; seat < perRow; seat++) {
      const x = (seat - (perRow - 1) / 2) * spacing + stagger;
      matrix.makeTranslation(x, y, z);
      mesh.setMatrixAt(index++, matrix);
    }
  }

  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, geometry, material };
}

export function createCinema(
  canvas: HTMLCanvasElement,
  quality: Quality,
  variant: Variant = "room"
): SceneHandle | null {
  const furnished = variant === "room";
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: quality === "full", alpha: true, powerPreference: "low-power" });
  } catch {
    // No WebGL, or the browser refused a context. The caller keeps its
    // fallback on screen; nothing here is load-bearing.
    return null;
  }

  renderer.setClearColor(INK, 0);
  const scene = new Scene();
  // Fog does the heavy lifting for depth: the back rows fade into the room
  // instead of being drawn smaller, which is what a dark auditorium looks like.
  scene.fog = new Fog(INK, 6, 17);

  const camera = new PerspectiveCamera(46, 1, 0.1, 60);
  // Back of the house, a little above the last row, looking down the room.
  camera.position.set(0, 0.5, 2.4);
  camera.lookAt(0, 0.5, -8);

  // --- the screen -----------------------------------------------------------
  // Unlit and at full brightness: this is what is lighting the room, so it must
  // not itself be lit by anything. Everything else in the scene is darker than
  // it by construction.
  // fog:false throughout this block. Fog applies to unlit materials as well,
  // so without it the brightest thing in the room gets blended towards the
  // room's own darkness and stops reading as a light source at all.
  const screen = new Mesh(new PlaneGeometry(6.2, 3.5), new MeshBasicMaterial({ color: IVORY, fog: false }));
  screen.position.set(0, 0.75, -8);
  if (furnished) scene.add(screen);

  // Bloom, cheaply: a larger additive plane just behind, so the screen bleeds
  // into the dark instead of ending on a hard edge.
  const glow = new Mesh(
    new PlaneGeometry(11, 7.5),
    new ShaderMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
      uniforms: { uColor: { value: new Color(IVORY) }, uAmount: { value: furnished ? 0.3 : 0.22 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uAmount;
        varying vec2 vUv;
        void main() {
          // Radial, and squared, so it has no edge anywhere for the eye to
          // catch — a rectangle of light is the one shape a glow cannot be.
          float d = length(vUv - 0.5) * 2.0;
          float falloff = pow(max(0.0, 1.0 - d), 2.5);
          gl_FragColor = vec4(uColor, falloff * uAmount);
        }
      `
    })
  );
  glow.position.set(0, 0.75, -8.1);
  scene.add(glow);

  // A gilded frame, drawn slightly larger and behind.
  const frame = new Mesh(
    new PlaneGeometry(6.6, 3.9),
    new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, fog: false })
  );
  frame.position.set(0, 0.75, -8.05);
  if (furnished) scene.add(frame);

  // --- curtains -------------------------------------------------------------
  const curtains = new Group();
  for (const side of [-1, 1]) {
    const curtain = new Mesh(
      new PlaneGeometry(2.1, 5.6, 8, 1),
      new MeshStandardMaterial({ color: CURTAIN, roughness: 1, metalness: 0, side: DoubleSide })
    );
    // Folded by pushing alternate columns of vertices forward, which is enough
    // to catch the light differently along the drop and read as fabric.
    const position = curtain.geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      position.setZ(index, Math.sin(position.getX(index) * 6) * 0.22);
    }
    curtain.geometry.computeVertexNormals();
    curtain.position.set(side * 4.15, 0.55, -7.7);
    curtain.rotation.y = side * -0.3;
    curtains.add(curtain);
  }
  if (furnished) scene.add(curtains);

  // --- the beam -------------------------------------------------------------
  // A cone from the back of the room to the screen. Additive and unlit, so it
  // brightens whatever it crosses instead of being a solid object in the way.
  // Apex behind the viewer, widening onto the screen. rotateX(+90°) sends the
  // cone's tip towards +z and its base towards -z, which is the direction the
  // light actually travels here.
  const BEAM_LENGTH = 13;
  // A cone with a flat opacity has a visible silhouette — it reads as a
  // translucent object rather than as light. This fades it two ways at once:
  // towards the rim, so the sides dissolve instead of ending, and towards the
  // screen, so it is brightest where it leaves the projector.
  const beam = new Mesh(
    new ConeGeometry(2.6, BEAM_LENGTH, 40, 24, true),
    new ShaderMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uColor: { value: new Color(IVORY) }, uStrength: { value: furnished ? 0.1 : 0.16 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          // Across the cone: brightest along the axis the camera sees through
          // the middle, gone at the silhouette edges.
          float across = sin(vUv.x * 3.14159265);
          // Along it: the tip is the source, the far end has spread out.
          float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - vUv.y * 0.65);
          gl_FragColor = vec4(uColor, across * across * along * uStrength);
        }
      `
    })
  );
  beam.position.set(0, 1.5, 3.6 - BEAM_LENGTH / 2);
  beam.rotation.x = Math.PI / 2;
  scene.add(beam);

  const dust = makeDust(quality === "full" ? 420 : 140);
  scene.add(dust.points);

  // --- seats and light ------------------------------------------------------
  const seats = makeSeats(quality === "full" ? 5 : 3, quality === "full" ? 9 : 7);
  if (furnished) scene.add(seats.mesh);

  // One light, in front, standing in for the screen's spill. Cheaper than
  // lighting the screen itself and lands in the same place.
  const spill = new PointLight(IVORY, 22, 22, 2);
  spill.position.set(0, 0.75, -7);
  scene.add(spill);

  // A little warmth off the curtains, low and behind the audience, so the seats
  // are not pure black cutouts.
  const warm = new PointLight(CURTAIN, 3, 9, 2);
  warm.position.set(0, -1.2, -1.5);
  scene.add(warm);

  // --- motion ---------------------------------------------------------------
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  const flickerColor = new Color();

  return {
    look(x, y) {
      target.x = x;
      target.y = y;
    },

    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // Capped rather than taken from the device: a phone at 3x renders nine
      // times the pixels for a background nobody is inspecting.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "full" ? 2 : 1.25));
      renderer.setSize(width, height, false);
    },

    render(time) {
      // Damped, so the camera arrives at the pointer rather than snapping to it.
      current.x += (target.x - current.x) * 0.045;
      current.y += (target.y - current.y) * 0.045;
      camera.position.x = current.x * 0.7;
      camera.position.y = 0.5 + current.y * 0.3;
      camera.lookAt(0, 0.55 + current.y * 0.12, -8);

      // The screen breathes. A projected image is never a constant brightness,
      // and a perfectly steady rectangle is the tell that this is a render.
      const flicker = 0.9 + Math.sin(time * 1.7) * 0.03 + Math.sin(time * 11.3) * 0.015;
      spill.intensity = 19 + flicker * 4;
      flickerColor.setHex(IVORY).multiplyScalar(flicker);
      (screen.material as MeshBasicMaterial).color.copy(flickerColor);

      // Dust rises through the beam and wraps at the top.
      const positions = dust.positions;
      for (let index = 0; index < dust.drift.length; index++) {
        const axis = index * 3 + 1;
        positions[axis] += dust.drift[index] * 0.004;
        if (positions[axis] > 3.4) positions[axis] = -0.9;
      }
      dust.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    },

    dispose() {
      // Every geometry, material and texture holds GPU memory that the garbage
      // collector cannot reach. Missing one leaks a whole scene per navigation.
      screen.geometry.dispose();
      (screen.material as MeshBasicMaterial).dispose();
      glow.geometry.dispose();
      (glow.material as ShaderMaterial).dispose();
      frame.geometry.dispose();
      (frame.material as MeshBasicMaterial).dispose();
      curtains.children.forEach(child => {
        const mesh = child as Mesh;
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      });
      beam.geometry.dispose();
      (beam.material as ShaderMaterial).dispose();
      dust.geometry.dispose();
      dust.material.dispose();
      seats.geometry.dispose();
      seats.material.dispose();
      seats.mesh.dispose();
      renderer.dispose();
    }
  };
}

export { INK, VELVET };
