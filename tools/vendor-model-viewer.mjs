/** Build the pinned reader with ordinary textures and no unused WASM decoders. */
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const modules = resolve(process.argv[2] ?? 'node_modules');
const packageRoot = join(modules,'@google/model-viewer');
const metadata = JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
if (metadata.version !== '4.4.0') throw Error('This build adapter requires @google/model-viewer 4.4.0.');
const { build } = await import(pathToFileURL(join(modules,'esbuild/lib/main.js')));
await build({
  entryPoints:[join(packageRoot,'lib/model-viewer.js')],
  outfile:fileURLToPath(new URL('../public/assets/vendor/model-viewer/model-viewer.min.js',import.meta.url)),
  bundle:true, format:'esm', target:'es2022', minify:true, legalComments:'inline', supported:{'template-literal':false},
  banner:{js:'/* Garapp local build: unused compressed-model and HDR gainmap decoders omitted. See README.txt. */'},
  plugins:[{
    name:'without-meshopt-wasm',
    setup(builder) {
      builder.onResolve({filter:/meshopt_decoder\.module\.js$/},() => ({path:'meshopt-unavailable',namespace:'garapp'}));
      builder.onResolve({filter:/zstddec\.module\.js$/},() => ({path:'zstd-unavailable',namespace:'garapp'}));
      builder.onResolve({filter:/^@monogrid\/gainmap-js$/},() => ({path:'ordinary-jpeg',namespace:'garapp'}));
      builder.onLoad({filter:/.*/,namespace:'garapp'},({path}) => ({
        contents:path === 'meshopt-unavailable' ? 'export const MeshoptDecoder = { supported:false, ready:Promise.resolve() };' : path === 'zstd-unavailable' ? 'export class ZSTDDecoder { init() { return Promise.reject(new Error("Unsupported compressed texture")); } }' : 'import {TextureLoader} from "three"; export class HDRJPGLoader extends TextureLoader { constructor() { super(); } }',
        loader:'js', resolveDir:packageRoot,
      }));
    },
  }],
});
