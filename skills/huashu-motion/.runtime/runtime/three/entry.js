// The three.js bundle huashu-motion ships: build with `npx esbuild@0.25 entry.js --bundle --minify --format=iife --legal-comments=none --outfile=three.min.js`
// from a three@0.186.1 package unpacked next to it (`npm pack three@0.186.1 && tar xzf three-*.tgz`).
import * as THREE from './package/build/three.module.js';
import { RoomEnvironment } from './package/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from './package/examples/jsm/loaders/GLTFLoader.js';
import { SVGLoader } from './package/examples/jsm/loaders/SVGLoader.js';
import { HDRLoader } from './package/examples/jsm/loaders/HDRLoader.js';
import { FontLoader } from './package/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from './package/examples/jsm/geometries/TextGeometry.js';
import { RoundedBoxGeometry } from './package/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from './package/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './package/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from './package/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from './package/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from './package/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './package/examples/jsm/postprocessing/ShaderPass.js';
import { Reflector } from './package/examples/jsm/objects/Reflector.js';
import * as BufferGeometryUtils from './package/examples/jsm/utils/BufferGeometryUtils.js';
window.THREE = Object.assign({}, THREE, { RoomEnvironment, GLTFLoader, SVGLoader, HDRLoader, FontLoader, TextGeometry, RoundedBoxGeometry, EffectComposer, RenderPass, OutputPass, BokehPass, UnrealBloomPass, ShaderPass, Reflector, BufferGeometryUtils });
