/**
 * Derived from MarchingCubes.js
* This version modified to do complete work on GPU sjpt 8 May 2020 to 19 May 2020
*
* works in four passes
*  1: spat: use a course grid and deciding which spheres are 'active' within each course voxel (output spatrt)
*  2: fill: compute the potential function at every point on the full grid (using spatrt for optimization)
*  3: box: for each voxel compute its marching cubes 'key'
*  4: march: run marching cubes on the voxels, up to 5 triangles, 15 vertices per voxel
*
*  This algorithm does not intrinsically need vertex or position attributes for the main marching cubes phase;
*  they are provided by gl_VertexID and gl_InstanceID.
*  However, these are not supported in WebGL1, and three.js (up to 117)
*  does not support rendering without some 'dummy' attributes.
*  I hope three.js will accept these min later revisions.
*
* This revision does not allow geometry with no vertex or

 ***/
var THREE, Stats, queryloadpromise, trywebgl2=true;

function Marching(isWebGL2) {
    var me = this;
    var THREESingleChannelFormat = (isWebGL2) ? THREE.RedFormat : THREE.LuminanceFormat;


// control structure of options (could just be me. ?)
const X = me.X = window.X = {
    rad: 0.1,           // radius of spheres
    radInfluence: 1.5,  // how far infludence spreads
    sphereScale: 1,     // scale of sphere positions (TODO; something cheap but more complete)
    sphereYin: false,   // set to true for y based input texture
    npart: 1000,        // number of particles
    ntexsize: 1000,     // size of texture holding particles
    spatdiv: 25,        // numnber of spat phase subdivisions if equal for x,y,z
    doshade: true,      // control final shading phase
    dowire: false,      // control final wireframe phase
    dopoints: false,    // control final points phase
    funtype: 2,         // 0 cubic, 1 quadratic, 2 exp
    useboxnorm: true,   // true to compute normals in box phase
    instancing: true,   // do we use instancing
    loops: 1,           // number of repititions of loop to apply each render cycle
    trivmarch: false,   // true for trivial version of marching cubes pass, performance test to estimate overheads
    xnum: 100, ynum: undefined, znum: undefined,     // numbers for voxel boundary count (ynum and znum default to xnum)
    yinz: 0             // manual override value used to split y in 3d/2d lookup, needed where xnum*ynum > maxtexsize
}

var
    isol = 1,           // marching cubes isolation level
    expradinf = 2,      // radinf for exp code
    // edgeTable,       // unused table for edges
    triTable,           // table to drive mc
    span,               // span of items for spatial check
    spatdivs,           // number of spat phase subdivisions, separate vec3 for x,y,z
    maxt = 5,           // max triangles per voxel, 5 for all possible
    A = 24;             // number of sphere mask bits to pack into each float element

const VEC3 = (x,y,z) => new THREE.Vector3(x, y, z);
// this allows for glsl tagged template literals
// a will contain an array of constant parts and b an array of template parts, which this function interleaves
var glsl = (a,...bb) => a.map((x,i) => [x, bb[i]]).flat().join('');

X.ynum = X.ynum || X.xnum;
X.znum = X.znum || X.xnum;
spatdivs = spatdivs || VEC3(X.spatdiv, X.spatdiv, X.spatdiv);


var lastset = '', lastmarch = '', lastinst = '', lastbox = '', lastnum = '';
// Check that the various settings are unchanged, or rebuild as needed if not
// Could be done with get/set properties but I think this is a bit easier.
// This will do almost all preparation work at first call.
//
// Should work in two passes, to decide what needs to be done, then do it.
// Current code causes some work to be done twice, especially at startup.
function beforeRender(renderer, scene, camera) {
    if (!maxtext) { const gl = renderer.getContext(); maxtext = gl.getParameter( gl.MAX_TEXTURE_SIZE ); }
    // dynamic recompile etc if needed
    const set = [X.funtype, X.spatdiv, X.npart, X.ntexsize, X.sphereYin].join(',');
    if (set !== lastset) {
        lastset = set;
        if (X.spatdiv) spatdivs = VEC3(X.spatdiv,X.spatdiv,X.spatdiv);
        setfun();
        spatinit();
        fillinit();
    }
    const num = [X.xnum, X.ynum, X.znum, X.yinz].join(',');
    if (num !== lastnum) {
        fillinit();
        marchinit(); // before boxinit even though box render done before march render
        boxinit();
        lastnum = num;
    }
    const march = [X.trivmarch].join(',');
    if (lastmarch !== march) {
        lastmarch = march;
        marchmat = marchmatgen();
        marchmesh.material = marchmat;
    }
    const inst = [X.instancing].join(',');
    if (lastinst !== inst) {
        lastinst = inst;
        marchgeomgen();
        marchmatgen();
    }
    const box = [X.useboxnorm].join(',');
    if (box !== lastbox) {
        boxmat();
        lastbox = box;
    }

    boxMarchUniforms.projectionMatrix.value = camera.projectionMatrix;

    marchmesh.material.wireframe = X.dowire;
    setinfluence();
    renderPreobjects(renderer, camera);
}

function renderPreobjects(renderer, camera) {
    // TODO optimize, some of these not needed if sphereData hasn't changed
    rrender('spat', renderer, spatscene, camera, spatrt); // camera not used here
    rrender('fill', renderer, fillscene, camera, fillrt); // camera not used here
    rrender('box', renderer, boxscene, camera, boxrt); // camera not used here
}

// render not using THREE scene, but with more control.
me.testRender = function(renderer, scene, camera) {
    marchmesh.onBeforeRender = ()=>{};
    beforeRender(renderer, scene, camera);
    if (X.dowire) {
        marchmat.wireframe=true; boxMarchUniforms.isol.value = isol-0.1; boxMarchUniforms.col.value.y = 0;
        rrender('march', renderer, marchmesh, camera, null);
        marchmat.wireframe=false; boxMarchUniforms.isol.value = isol; boxMarchUniforms.col.value.y = 1;
    }
    if (X.doshade) {
        // scene.children = [marchmesh];
        marchmat.wireframe=false; boxMarchUniforms.isol.value = isol; boxMarchUniforms.col.value.y = 1;
        rrender('march', renderer, marchmesh, camera, null);
    }
    if (X.dopoints) {
        boxMarchUniforms.isol.value = isol-0.15; boxMarchUniforms.col.value.y = 1;
        rrender('march', renderer, marchpoints, camera, null);
    }
    marchmesh.onBeforeRender = beforeRender;
}

me.updateData = function (datatexture, scale=X.sphereScale) {
    X.sphereScale = scale;
    if (spatFillUniforms && spatFillUniforms.sphereData) {
        spatFillUniforms.sphereData.value = datatexture;
        spatFillUniforms.sphereScale.value = scale;
    }
}

var renders = X.renders = {};       // for performance tests
// rrender is a convenient funnel/filter for render calls for debug, performance test, etc
function rrender(name, renderer, _scene, xcamera, rtout) {
    const oldrt = renderer.getRenderTarget();
    renderer.setRenderTarget(rtout);
    let _nn = renders[name];
    if (_nn === undefined) _nn = 1;
    for (let i = 0; i < _nn; i++) {
        renderer.render(_scene, xcamera);
    }
    renderer.setRenderTarget(oldrt);
}


// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// bits of shader code that are or might be/might have been) shared between different passes
// Most are constant, some are provided as functions to allow for dynamic changes in settings such as xnum
var codebits = {};

function codebitsinit() {
codebits.getmu = glsl`// codebits.getmu get mu given isol level and two potential values
const float tol = 0.000;    // tolerance
// get mu value and check in range
float getmu(float isol, float valp1, float valp2) {
    float mu = (isol - valp1) / (valp2 - valp1);
    // if (mu < -tol || mu > 1.+tol) {
    //     zzz = vec3(0,0,1);
    //     mu = 770.5;                    // exaggerate so it really shows the error
    // } // till working
  return mu;
}
`;

codebits.sphereInput = () => {
    return (X.sphereYin) ?
    '(texture2D(sphereData, vec2(0.5, iin)) * sphereScale)' :
    '(texture2D(sphereData, vec2(iin, 0.5)) * sphereScale)';
}

codebits.compnorm = glsl`// codebits.compnorm compute normal at 0,0,0 corner of box, xi integer
vec3 compNormi(float xi, float yi, float zi) {
    float dx = flook(xi+1., yi, zi) - flook(xi-1., yi, zi);
    float dy = flook(xi, yi+1., zi) - flook(xi, yi-1., zi);
    float dz = flook(xi, yi, zi+1.) - flook(xi, yi, zi-1.);
    // if we allow (common) 0,0,0 case through then NaN can spread
    // eg r = vec4(compNormi(???), 1.) will pollute r.w
    if (dx == 0. && dy == 0. && dz == 0.) return vec3(0.199,0.299,0.399);
    return normalize(vec3(dx, dy, dz));
}

// compute normal, box coord inputs
// ff is integer box numbers
vec3 compNorm(vec3 ff) {
    #if ! ${+X.useboxnorm}
        return boxf(ff.x, ff.y, ff.z).xyz; // assumes already computed in box pass, and so just lookup
    #else
        return compNormi(ff.x, ff.y, ff.z); // perform normal computation
    #endif
}
// codebits.compnorm`

codebits.getxyz = () => glsl`// codebits.getxyz()
// this code must complement lookup
float xi, yi, zi;
float xy = gl_FragCoord.x - 0.5;                    // 0 .. nump.x*nump.y-1
if (${yinz} == 1) { // pre-split code, minor optimization
    xi = mod(xy, nump.x);
    yi = floor(xy / nump.x);
    zi = gl_FragCoord.y - 0.5;
} else {
    const float yinx = float(${yinx});
    const float yinz = float(${yinz});
    float yz = gl_FragCoord.y - 0.5;                    // 0 .. nump.x*nump.y-1
    xi = getpart(xy, nump.x);
    float yihi = getpart(yz, yinz);
    yi = xy + yihi * yinx;
    zi = yz;
}
`

codebits.lookup = () => glsl`// codebits.lookup lookup field/box values
${codebits.getpart}
uniform sampler2D fillrt;

// box or marching cube lookup value in value texture, integer box coord inputs
// this code must complement codebits.getxyz
vec4 look(float xi, float yi, float zi, sampler2D rt) {                    // range 0 .. numv etc
    //xi = clamp(xi, 0., numv.x); // to check if needed todo
    //yi = clamp(yi, 0., numv.y);
    //zi = clamp(zi, 0., numv.z);
    vec2 ll;
    if (${yinz} == 1) { // pre-split code, minor optimization
        float xy = (xi + yi * nump.x + 0.5) / (nump.x * nump.y);
        ll = vec2(xy, (zi+0.5) / nump.z);
    } else {
        const float yinx = float(${yinx});
        const float yinz = float(${yinz});
        float yilo = getpart(yi, yinx);
        float xy = (xi + yilo * nump.x + 0.5) / (nump.x * yinx);
        float yz = (yi + zi * yinz + 0.5) / (yinz * nump.z);
        ll = vec2(xy, yz);
    }
    return texture2D(rt, ll);

}
float flook(float xi, float yi, float zi) {                    // range 0 .. numv etc
    return look(xi, yi, zi, fillrt).x;
}


uniform sampler2D boxrt;
// look up value in boxrt, includes normal (in xyz) and key (in w)
vec4 boxf(float xi, float yi, float zi) {                    // integer range 0 .. numv etc
    return look(xi, yi, zi, boxrt);
}
// codebits.lookup`

codebits.setfxxx = glsl`// codebits.setfxxx: compute values (by lookup)
float
    f000 = flook(xi, yi, zi),
    f100 = flook(xi+1., yi, zi),
    f010 = flook(xi, yi+1., zi),
    f110 = flook(xi+1., yi+1., zi),
    f001 = flook(xi, yi, zi+1.),
    f101 = flook(xi+1., yi, zi+1.),
    f011 = flook(xi, yi+1., zi+1.),
    f111 = flook(xi+1., yi+1., zi+1.);
//codebits.setfxxx`

codebits.defpxxx = glsl`// codebits.defpxxx: define vertices of voxel
    #define p000 vec3(xi, yi, zi)
    #define p100 vec3(xi+1., yi, zi)
    #define p010 vec3(xi, yi+1., zi)
    #define p110 vec3(xi+1., yi+1., zi)
    #define p001 vec3(xi, yi, zi+1.)
    #define p101 vec3(xi+1., yi, zi+1.)
    #define p011 vec3(xi, yi+1., zi+1.)
    #define p111 vec3(xi+1., yi+1., zi+1.)
    // codebits.defpxxx`

codebits.keyi = glsl`// codebits.keyi return the signature key for the setup; 256 values in range 0..255
float keyi(float f000, float f100, float f010, float f110, float f001, float f101, float f011, float f111, float isol) {
    float cubeindex = 0.;
    if (f000 < isol) cubeindex += 1.;
    if (f100 < isol) cubeindex += 2.;
    if (f010 < isol) cubeindex += 8.;
    if (f110 < isol) cubeindex += 4.;
    if (f001 < isol) cubeindex += 16.;
    if (f101 < isol) cubeindex += 32.;
    if (f011 < isol) cubeindex += 128.;
    if (f111 < isol) cubeindex += 64.;
    return cubeindex;
}
// codebits.keyi`

codebits.vertpre = '';
if (isWebGL2) codebits.vertpre =
glsl`#version 300 es
// codebits.vertpre: patch to use webgl-like shader work with later shader version
#define attribute in
#define varying out
#define texture2D texture
`;

codebits.fragpre = '';
if (isWebGL2) codebits.fragpre =
glsl`#version 300 es
// codebits.fragpre: patch to use webgl-like shader work with later shader version
#define varying in
out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
`;

codebits.getpart = glsl`//codebits.getpart unwind integer value 0..b-1 from a packed integer a; reduce a
float getpart(inout float a, float b) {
    float t = floor(a/b);
    float r = a - t*b;
    a = t;
    return r;
}
float getpart(inout int a, int b) {
    int t = a/b;
    int r = a - t*b;
    a = t;
    return float(r);
}
float getpart(inout int a, float b) {
    return getpart(a, int(b));
}
// codebits.getpart`
} // end codebitsinit

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// code for marching cubes pass
var marchgeom, marchmat, marchvert, marchfrag, boxMarchUniforms, marchmesh, marchpoints, triTexture;

me.three = marchmesh = new THREE.Mesh();    // create on construction so available at once
marchmesh.frustumCulled = false;
marchpoints = new THREE.Points();
marchpoints.frustumCulled = false;
marchmesh.name = 'marchmesh';

// NOTE: three.js bug where onBeforeRender on mesh is performed twice
// renderer, scene, camera, geometry, material, group
marchmesh.onBeforeRender = beforeRender;
// const edgeTexture = new THREE.DataTexture(edgeTable, 1, 256, THREESingleChannelFormat, THREE.FloatType);
// edgeTexture.needsUpdate = true;
tables();
triTexture = new THREE.DataTexture(triTable, 16, 256, THREESingleChannelFormat, THREE.FloatType);
triTexture.needsUpdate = true;
triTexture.name = 'triTexture';

boxMarchUniforms = {
    // edgeTable: {value: edgeTexture},
    triTable: {value: triTexture},
    col: {value: new THREE.Vector3(1,1,1)},
    ambcol: {value: new THREE.Vector3(0.03,0.03,0.07)},
    isol: {value: isol},
    projectionMatrix: {value: undefined},
    modelViewMatrix: {value: new THREE.Matrix4()},          // contents set by three.js
    fillrt: {value: undefined},
    boxrt: {value: undefined}
}

function  marchinit() {
    marchgeomgen();
    marchmatgen();
    // marchmat.side = THREE.DoubleSide;
}

function marchgeomgen() {
    marchgeom = new THREE.BufferGeometry(); marchgeom.name = 'marchgeom';
    const {xnum, ynum, znum, instancing} = X;
    const voxs = (xnum-1) * (ynum-1) * (znum-1);    // voxel count
    const tris = voxs * 3 * maxt
    let q = 0;
    let posb, posatt;
    if (instancing) { // assume webgl2 for now
        marchgeom = new THREE.InstancedBufferGeometry(); marchgeom.name = 'marchgeom';
        if (!marchgeom.setAttribute) marchgeom.setAttribute = marchgeom.addAttribute;       // older three.js
        if (isWebGL2) {
            marchgeom.drawRange.count = maxt*3;
            posb = new Uint8Array(maxt*3); // data not used, but size used inside three.js for wireframe << needed till three.js fix
            posatt = new THREE.InstancedBufferAttribute(posb, 1);
            posatt.count = maxt*3;       // this was for when we had a 'dummy' posb, not we have real one for wireframe
        } else {
            posb = new Uint16Array(maxt*3*3);
            for (let r = 0; r < 3 * maxt; r++) {
                posb[q++] = 0;
                posb[q++] = 0;
                posb[q++] = r;
            }
            posatt = new THREE.BufferAttribute(posb, 3);

            const instanceID = new Float32Array(voxs);      // nb webgl1 does not allow Uint32Array
            for (let i = 0; i < voxs; i++) instanceID[i] = i;
            const instatt = new THREE.InstancedBufferAttribute(instanceID, 1, false);
            // instatt.setDynamic(true);    // old syntax and inapproprite anyway
            marchgeom.setAttribute('instanceID', instatt);
        }
        marchgeom._maxInstanceCount = Infinity; // needed until three.js fix <<<
        marchgeom.instanceCount = voxs;
    } else if (isWebGL2) {       // for webgl2 the buffer is only there to let three.js know #vertices
        posb = new Int8Array(tris*3); // data not used, but size used inside three.js for wireframe
        posatt = new THREE.BufferAttribute(posb, 1);
        posatt.count = tris;
    } else {                    // !instancing, !webgl2
        posb = new Int16Array(tris*3);
        for (let i = 0; i < xnum - 1; i++) {
            for (let j = 0; j < ynum - 1; j++) {
                for (let k = 0; k < znum - 1; k++) {
                    for (let r = 0; r < 3 * maxt; r++) {
                        posb[q++] = i;
                        posb[q++] = j;
                        posb[q++] = k * 16 + r;
                    }
                }
            }
        }
        posatt = new THREE.BufferAttribute(posb, 3);
    }
    // if (instancing && isWebGL2) {        // this is needed till three.js fix
    //    console.log('no attribute')
    //} else {
        marchgeom.setAttribute('position', posatt);
    //}
    marchmesh.geometry = marchgeom;
    marchpoints.geometry = marchgeom;
}

function marchmatgen() {
    const {xnum, ynum, znum, instancing} = X;

    marchvert =
glsl`${codebits.vertpre}
// marchvert
// marching cubes vertex shader
precision highp float;
attribute vec3 position;
uniform mat4 projectionMatrix, modelViewMatrix; // , normalMatrix;

const vec3 nump =  vec3(${xnum}., ${ynum}., ${znum}.);
const vec3 numv =  vec3(${xnum-1}., ${ynum-1}., ${znum-1}.);

uniform float isol;

// uniform sampler2D edgeTable;    // 256 x 1
uniform sampler2D triTable;     // 256 x 16

vec3 pos;                   // collect final output position
varying vec3 zzz;           // collect colour
varying vec3 norm;          // collect normal

#define NaN -9999999.9        // sqrt for 'real' NaN, no noticable performance difference
vec3 NaN3 = vec3(NaN, NaN, NaN);
vec4 NaN4 = vec4(NaN, NaN, NaN, NaN);
vec4 BAD4 = vec4(999, 999, 999, 1); // doesn't seem to make much difference what this is

${codebits.lookup()}
${codebits.getmu}
${codebits.compnorm}

vec3 up1, up2;     // grid coordinates for ends and step between them, set by VIntG etc for use by VIntReal,

// Saving just one detail set up1/up2 for VIntG and then computing once in VIntReal
// forces only one lookup.
// When VIntG actually did the work (even under conditional)
// it seems the compiler forced uniform flow and performed unnecessary lookups.
// compute the intersection point on general line, step gives line direction
void VIntReal() {
    float mu = getmu(isol, flook(up1.x, up1.y, up1.z), flook(up2.x, up2.y, up2.z));
    pos = up1 + (up2 - up1) * mu;               // box coords
    pos = pos/numv.x * 2. - 1.;                 // -1..1 coords
    vec3 na = compNorm(up1), nb = compNorm(up2);
    norm = na * (1.-mu) + nb * mu;
}

// save details of ends of edge, ready to compute intersection point
void VIntG(vec3 p1, vec3 p2) {
    up1 = p1;
    up2 = p2;
}

float vk;

float modif(int a, int b) { return float(a - (a/b)*b);}

attribute float instanceID;
void main() {             // marching cubes vertex shader marchvertmain
    ${X.trivmarch ? '' : '// '} gl_Position = vec4(9999, 9999, 9999, 1); return;  // trivial version

    zzz = vec3(1,1,1);    // unless set otherwise
    pos = NaN3;
    gl_Position = BAD4;                // till proved otherwise

    // ~~~~~~~~~~~~~~~~~~~~~
    // first stage, sort out exactly which voxel and voxel index is being worked on
    // varies depending on use of instancing and vertexid
    float xi, yi, zi, vk;
    #if (${isWebGL2 ? '1==1' : '1==0'})
        #if (${instancing ? '1==1' : '1==0'})
            int q = gl_InstanceID;
            vk = float(gl_VertexID) / 16. + 1./32.;
        #else
            int q = gl_VertexID;
            vk = getpart(q, ${3*maxt}) / 16. + 1./32.;
        #endif
        zi = getpart(q, ${znum-1});
        yi = getpart(q, ${ynum-1});
        xi = getpart(q, ${xnum-1});
    #else
        #if (${instancing ? '1==1' : '1==0'})
            int q = int(instanceID);
            zi = getpart(q, ${znum-1});
            yi = getpart(q, ${ynum-1});
            xi = getpart(q, ${xnum-1});
            vk = position.z / 16. + 1./32.;
        #else
            xi = position.x;
            yi = position.y;
            float fpx = position.z / 16.;
            zi = floor(fpx);
            vk = fpx - zi + 1./32.;    // key into which vertex to compute, 0/16..14/16 + 1/32.
        #endif
    #endif
    zzz = vec3(xi,yi,zi)/nump;

    // ~~~~~~~~
    // now we know the vertex find the key and other information precomputed by the box phase
    // Basic active box optimization.
    vec4 box = boxf(xi, yi, zi);
    if (box.x == -1.) return;

    // key on of 256 values in range 0..1
    float key = box.w;
    key = (key + 0.5) / 256.;        // to match texture lookup

    // bits from edgeTable says which of the twelve edges are actively involved
    // but doesn't help in this variant of the algorithm
    //float bits = texture2D(edgeTable, vec2(0.5, key)).x;

    // find which edge we are working on, and this the two ends of the edte
    float edgen = texture2D(triTable, vec2(vk, key)).x;  // get the edge number, 0..11
    if (edgen < 0.) return;                              // optimization, presumably -1 in table

    // exactly one of the below will execute and save details up1 and up2
    // depending which edge
    // and then VIntReal() will do the actual computation

    ${codebits.defpxxx}  // set defines for voxel corner points
    // front lines of the cube
    if (edgen < 3.5) {
        if (edgen == 0.) VIntG(p000, p100);
        else if (edgen == 1.) VIntG(p100, p110);
        else if (edgen == 2.) VIntG(p010, p110);
        else VIntG(p000, p010);
    }

    // back lines of the cube
    else if (edgen < 7.5) {
        if (edgen == 4.) VIntG(p001, p101);
        else if (edgen == 5.) VIntG(p101, p111);
        else if (edgen == 6.) VIntG(p011, p111);
        else VIntG(p001, p011);
    }

    // front to back lines of the cube
    else {
        if (edgen == 8.) VIntG(p000, p001);
        else if (edgen == 9.) VIntG(p100, p101);
        else if (edgen == 10.) VIntG(p110, p111);
        else VIntG(p010, p011);
    }

    // now we have identified edge ends find pos and norm
    VIntReal();

    norm = -mat3(modelViewMatrix) * normalize(norm);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.);
    gl_PointSize = 1.;
}   // end of marchvert
`

    marchfrag =
glsl`${codebits.fragpre}
// marchfrag
precision highp float;

varying vec3 zzz;
varying vec3 norm;
uniform vec3 col;
uniform vec3 ambcol;
const vec3 light1 = normalize(vec3(1,1,1)) * 0.7;
const vec3 light2 = normalize(vec3(-1,0,1)) * 0.1;
const vec3 eye = vec3(0,0,3);

void main() {               // marchfragmain
    vec3 nn = normalize(norm);
    float k = max(dot(nn, light1), 0.) + max(dot(nn, light2), 0.);
    gl_FragColor = (vec4(zzz*col * k,1));
    gl_FragColor.xyz += ambcol;
    gl_FragColor.xyz = (gl_FragColor.xyz);
}
// end marchfrag`;

    marchmat = new THREE.RawShaderMaterial({
        fragmentShader: marchfrag,
        vertexShader: marchvert,
        uniforms: boxMarchUniforms
    });
    marchmat.name = 'marchmat';
    marchmesh.material = marchmat;
    marchpoints.material = marchmat;
    return marchmat;
}

// set up triTable for marching cubes (edgeTable not used)
function tables() {
    /////////////////////////////////////
    // Marching cubes lookup tables
    /////////////////////////////////////

    // These tables are straight from Paul Bourke's page:
    // http://local.wasp.uwa.edu.au/~pbourke/geometry/polygonise/
    // who in turn got them from Cory Gene Bloyd.

    // // table of used edges.  Implicit in triTable.
    // var unusededgeTable = new Float32Array([
    //     0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
    //     0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
    //     0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
    //     0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
    //     0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
    //     0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
    //     0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
    //     0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
    //     0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
    //     0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
    //     0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
    //     0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
    //     0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
    //     0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
    //     0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
    //     0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
    //     0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
    //     0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
    //     0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
    //     0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
    //     0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
    //     0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
    //     0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
    //     0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
    //     0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
    //     0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
    //     0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
    //     0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
    //     0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
    //     0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
    //     0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
    //     0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
    // ]);

    // table of how the edges are used to create triangles
    triTable = new Float32Array([
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1,
        3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1,
        3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1,
        3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1,
        9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1,
        9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
        2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1,
        8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1,
        9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
        4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1,
        3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1,
        1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1,
        4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1,
        4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1,
        9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
        5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1,
        2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1,
        9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1,
        0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1,
        2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1,
        10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1,
        4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1,
        5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1,
        5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1,
        9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1,
        0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1,
        1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1,
        10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1,
        8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1,
        2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1,
        7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1,
        9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1,
        2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1,
        11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1,
        9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1,
        5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1,
        11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1,
        11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
        1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1,
        9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1,
        5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1,
        2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
        0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1,
        5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1,
        6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1,
        3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1,
        6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1,
        5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1,
        1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1,
        10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1,
        6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1,
        8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1,
        7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1,
        3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1,
        5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1,
        0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1,
        9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1,
        8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1,
        5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1,
        0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1,
        6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1,
        10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1,
        10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1,
        8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1,
        1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1,
        3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1,
        0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1,
        10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1,
        3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1,
        6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1,
        9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1,
        8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1,
        3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1,
        6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1,
        0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1,
        10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1,
        10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1,
        2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1,
        7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1,
        7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1,
        2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1,
        1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1,
        11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1,
        8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1,
        0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1,
        7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
        10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
        2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1,
        6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1,
        7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1,
        2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1,
        1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1,
        10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1,
        10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1,
        0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1,
        7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1,
        6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1,
        8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1,
        9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1,
        6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1,
        4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1,
        10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1,
        8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1,
        0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1,
        1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1,
        8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1,
        10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1,
        4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1,
        10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1,
        5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
        11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1,
        9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1,
        6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1,
        7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1,
        3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1,
        7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1,
        9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1,
        3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1,
        6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1,
        9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1,
        1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1,
        4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1,
        7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1,
        6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1,
        3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1,
        0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1,
        6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1,
        0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1,
        11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1,
        6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1,
        5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1,
        9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1,
        1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1,
        1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1,
        10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1,
        0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1,
        5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1,
        10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1,
        11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1,
        9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1,
        7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1,
        2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1,
        8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1,
        9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1,
        9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1,
        1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1,
        9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1,
        9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1,
        5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1,
        0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1,
        10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1,
        2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1,
        0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1,
        0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1,
        9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1,
        5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1,
        3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1,
        5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1,
        8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1,
        0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1,
        9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1,
        0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1,
        1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1,
        3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1,
        4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1,
        9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1,
        11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1,
        11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1,
        2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1,
        9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1,
        3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1,
        1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1,
        4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1,
        4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1,
        0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1,
        3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1,
        3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1,
        0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1,
        9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1,
        1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1
    ]);
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// set the lowest level potential function for a single sphere
var radInfluenceNorm, shapefun, useexp = false;
function setfun() {
    shapefun = glsl`
const float funtype = ${X.funtype}.;
uniform float radInfluence2, radInfluenceNorm, rad2, expradinf, expradinfnorm;
float shape(float d2) {
    d2 /= rad2;
    float r;
    if (funtype == 2.) {    // exp
        r = exp(-d2 * expradinf) * expradinfnorm;    // ?? close to radInfluence = 2.15 for type = 0
    } else {
        if (d2 > radInfluence2) return 0.;
        float ddd = radInfluence2 - d2;
        if (funtype == 0.) {    // cubic
            r = ddd*ddd*ddd * radInfluenceNorm;
        }else {
            r = ddd*ddd * radInfluenceNorm;;
        }
    }
    return r;
}
`

// r = exp(-d2 * expradinf) * expradinfnorm
// r = exp(-d2 * expradinf) / exp(-expradinf)
// r = exp(-d*d * x) / exp(-x)
// x = ln(r)/(1-d*d)
// WASTED TIME, symbolab gave wrong answer ????
// x = (-ln(r)/(d*d-1))
// x = sqrt(-ln(r)/(d*d))
// expradinf = Math.sqrt(-Math.log(r)/(d*d))
// https://www.symbolab.com/solver/function-inverse-calculator/solve%20for%20x%2C%20r%20%3D%20exp%5Cleft(-d%5Ccdot%20d%20%5Ccdot%20x%5Cright)%20%2F%20exp%5Cleft(-x%5Cright)

// rad=1; r=0.05; d=1.5; expradinf=Math.sqrt(-Math.log(r)/(d*d)); setinfluence(); [r, shape(d*d*rad*rad), exp(-d*d * expradinf) / exp(-expradinf), expradinf]
//

// make shape() avaiable to global javascript for debug
var sss = 'window.shape = function(d2) {setinfluence(); ' + shapefun.split('float d2) {')[1].split('float').join('var').split('exp(').join('Math.exp(');
eval(sss);
}

var radInfluence2, dddd, rad2, expradinfnorm;
// various details set each frame for easy test update
function setinfluence() {
    const {rad, radInfluence} = X;


    var d = radInfluence                    // precise tailoff point for square/cubic
    var r = 0.01                            // value taken as edge threshold for exp
    var x = expradinf = Math.log(r)/(1-d*d) // expradinf that gives required threshold at radInfluence tailoff
    span = rad*radInfluence                 // span needed to make sure sphere are included in relevant subdivisions

    radInfluence2 = radInfluence * radInfluence;  // sqr of rad influence
    dddd = 1/(radInfluence2-1);
    rad2 = rad * rad;
    radInfluenceNorm = dddd*dddd* (X.funtype === 0 ? dddd : 1);   // compensate factor
    expradinfnorm = 1 / Math.exp(-expradinf);


    spatFillUniforms.rad2.value = rad2;

    spatFillUniforms.radInfluence2.value = radInfluence2;
    spatFillUniforms.radInfluenceNorm.value = radInfluenceNorm;
    spatFillUniforms.expradinf.value = expradinf;
    spatFillUniforms.expradinfnorm.value = expradinfnorm;

    spatFillUniforms.span.value = span;
    boxMarchUniforms.isol.value = isol;

}


// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// code for fill pass
var fillscene, fillgeometry, fillmaterial, fillmesh,
    fillvert, fillfrag, fillrt, spatFillUniforms, yinx, yinz, maxtext;

function fillinit() {

    let {xnum, ynum, znum} = X;

    yinz = X.yinz ? X.yinz : (xnum * ynum) < maxtext ? 1 : 10;   // compute yinz if not set explicitly, could be a bit more flexible
    yinx = Math.ceil(ynum / yinz);
    console.log(`yinz ${yinz}  yinx ${yinx}`)
    ynum = X.ynum = yinz * yinx;

    fillscene = new THREE.Scene(); fillscene.name = 'fillscene';

    fillgeometry = new THREE.PlaneGeometry(4,4);
    fillmaterial = fillmat();

    fillmesh = new THREE.Mesh(fillgeometry, fillmaterial); fillmesh.name = 'fillmesh';
    fillmesh.frustumCulled = false;
    fillscene.add(fillmesh);

    fillrt = new THREE.WebGLRenderTarget( xnum*yinx,yinz*znum, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            stencilBuffer: false,
            depthBuffer: false
        } );
    fillrt.texture.generateMipmaps = false;
    fillrt.texture.minFilter = fillrt.texture.magFilter = THREE.NearestFilter;
    fillrt.name = 'fillrt';

    if (boxMarchUniforms)
        boxMarchUniforms.fillrt.value = fillrt.texture
}

function fillmat() {
    const {xnum, ynum, znum, npart} = X;

    fillvert = glsl`// fillvert
// fill pointsvertex shader
precision highp float;
attribute vec3 position;
void main() {
	gl_Position = vec4(position, 1);
}
`
    fillfrag = glsl`// fillfrag
precision highp float;


const vec3 nump =  vec3(${xnum}., ${ynum}., ${znum}.);
const vec3 numv =  vec3(${xnum-1}., ${ynum-1}., ${znum-1}.);

uniform float rad;
uniform float sphereScale;
uniform sampler2D sphereData;
uniform sampler2D spatdata;
uniform float testfr;

// make distribution more even
// nb significant performance difference between 'abs(r) * r' and 'sign(r) * r * r'
float sp(float x) { float r = sin(x); return abs(r) * r; }

#define fillf fillspatial
#define npart ${npart}.
const float spatn = ${spatn}.;
const float spatdivsx = ${spatdivs.x}.;
const float spatdivsy = ${spatdivs.y}.;
const float spatdivsz = ${spatdivs.z}.;
const vec3 spatdivs = vec3(${spatdivs.x}., ${spatdivs.y}., ${spatdivs.z}.);

float divk;

${shapefun}

// compute potential from A (=24) spheres, using the bit flags in 'key'
// to avoid lookup/compute for inactive spheres
float fillspatiali(float ii, float key, float x, float y, float z) {
    float t = 0.;
    for (float i = 0.; i < ${A}.; i++) {
        if (key < 1.) break;  // key exhausted, no more active spheres
        key *= 0.5;
        if (fract(key) >= 0.5) {
            float iin = (i + ii + 0.5) / float(${X.ntexsize});
            vec4 d = ${codebits.sphereInput()};
            float xx = x - d.x;
            float yy = y - d.y;
            float zz = z - d.z;
            float d2 = xx*xx + yy*yy + zz*zz;
            t += shape(d2);
        }
    }
    return t;
}

// compute potential from all spheres
// work in blocks of A*4 (=96) spheres, using the bit flags in 4 float channel 'key' values
vec3 div;
float fillspatial(float x, float y, float z) {
    float t = 0.;
    // spatdata holds x=> lowi, x faster moving and y=> z, y faster moving
    float divyz = (div.y + div.z * spatdivsy + 0.5) / (spatdivsy * spatdivsz);
    for (float ii = 0.; ii < spatn; ii++) {
        float i = ii * ${4*A}.;

        vec4 key = texture2D(spatdata, vec2((div.x * spatn + ii + 0.5)/(spatn * spatdivsx), divyz));
        t += fillspatiali(i, key.x, x,y,z);
        t += fillspatiali(i+${A}., key.y, x,y,z);
        t += fillspatiali(i+${2*A}., key.z, x,y,z);
        t += fillspatiali(i+${3*A}., key.w, x,y,z);
    }
    return t;
}

${codebits.getpart}
void main() {           // fill fragment shader fillfragmain
    ${codebits.getxyz()}    // get xi yi zi from 2d position

    float x = xi / numv.x * 2. - 1.;       // range -1..1, using ends
    float y = yi / numv.y * 2. - 1.;
    float z = zi / numv.z * 2. - 1.;

    div = floor(vec3(xi,yi,zi) / numv * spatdivs);

    float v0 = fillf(x, y, z);
    gl_FragColor = vec4(v0,v0,v0,1);
}
`

    const fillUniforms = {
        expradinf: {value: expradinf},
        expradinfnorm: {value: 99},
        sphereScale: {value: 1},
        sphereData: {value: undefined},
        spatdata:  {value: spatdata},
        rad2: {value: 99},
        radInfluence2: {value: 99},
        radInfluenceNorm: {value: 99},
        testfr: {value: 0.5}
        // rad: {value: rad}
    };
    Object.assign(spatFillUniforms, fillUniforms);

    var shader = new THREE.RawShaderMaterial({
        fragmentShader: fillfrag,
        vertexShader: fillvert,
        uniforms: spatFillUniforms
    });
    shader.depthTest = shader.depthWrite = false;
    return shader;
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// box stuff, compute information about each voxel
// each 4 channel entry contains
// nx,ny,nz: normal at 0,0,0 corner
// key: key for the voxel intersections

var boxscene, boxgeometry, boxmaterial, boxmesh,
    boxvert, boxfrag, boxrt;

function boxinit() {
    const {xnum, ynum, znum} = X;

    boxscene = new THREE.Scene();

    boxgeometry = new THREE.PlaneGeometry(4,4);
    boxmaterial = boxmat();

    boxmesh = new THREE.Mesh(boxgeometry, boxmaterial);
    boxmesh.frustumCulled = false;
    boxscene.add(boxmesh);

    boxrt = new THREE.WebGLRenderTarget( xnum*yinx, yinz*znum, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            stencilBuffer: false,
            depthBuffer: false
        } );
    boxrt.texture.generateMipmaps = false;
    boxrt.texture.minFilter = boxrt.texture.magFilter = THREE.NearestFilter;
    boxMarchUniforms.fillrt.value = fillrt.texture;
    boxMarchUniforms.boxrt.value = boxrt.texture;

}

function boxmat() {
    console.log('box material regenerated with useboxnorm', X.useboxnorm);
    const {xnum, ynum, znum, useboxnorm} = X;

    boxvert = glsl`// boxvert
// box pointsvertex shader
precision highp float;
attribute vec3 position;
void main() {   // box vert
	gl_Position = vec4(position, 1);
}
`
    boxfrag = glsl`// boxfrag
precision highp float;

const vec3 nump =  vec3(${xnum}., ${ynum}., ${znum}.);
const vec3 numv =  vec3(${xnum-1}., ${ynum-1}., ${znum-1}.);
uniform float isol; // nb, isol can change because of wire being outside shade

${codebits.lookup()}
${codebits.keyi}
${codebits.getmu}
${codebits.compnorm}

bool isNaN(float v) { return !(v <= 0. || v >= 0.); }

void main() {   // box fragment boxfragmain
    ${codebits.getxyz()}    // get xyz from 2d

    ${codebits.setfxxx}  // set f000 etc
    float key = keyi(f000, f100, f010, f110, f001, f101, f011, f111, isol);
    if (key == 0. || key == 255.) { // all inside or all outside
        key = -1.;
    }
    // even if our key is -1 this may be needed by a neighbouring voxel
    #if ${+useboxnorm}
        vec3 nn = compNormi(xi, yi, zi);
        gl_FragColor = vec4(nn, key);
    #else
        gl_FragColor = vec4(0,0,1, key);
    #endif

}
`
boxmaterial = new THREE.RawShaderMaterial({
    vertexShader: boxvert,
    fragmentShader: boxfrag,
    uniforms: boxMarchUniforms
});
if (boxmesh) boxmesh.material = boxmaterial;
return boxmaterial;

}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// spatial separation
var spatmat, spatgeom, spatmesh, spatscene, spatrt, spatdata,
spatfrag, spatvert;
/*
spattext is divstotn in y (eg 4*4*4=64)
each channel in an element holds A=24 boolean values for 24 input spheres
so 96 input spheres for an element, and npart/96 elements
*/

var spatn;
function spatinit() {
    spatn = Math.ceil(X.npart/(4*A));     // number of slots needed for npart spheres
    const h = spatdivs.y * spatdivs.z;
    const w = spatdivs.x * spatn;
    spatrt = new THREE.WebGLRenderTarget( w, h, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        stencilBuffer: false,
        depthBuffer: false
    } );
    spatdata = spatrt.texture;
    spatdata.minFilter = spatdata.magFilter = THREE.NearestFilter;
    spatdata.generateMipmaps = false;

    spatvert = glsl`// spatvert
// fill spatial division vertex shader
precision highp float;
attribute vec3 position;
void main() {
	gl_Position = vec4(position, 1);
}
`

    spatfrag = glsl` // spatfrag
// fill spatial division fragment shader
precision highp float;
const vec3 spatdivs = vec3(${spatdivs.x}., ${spatdivs.y}., ${spatdivs.z}.);
uniform float span; // span of element (rad*expradinf)
uniform float sphereScale;
uniform sampler2D sphereData;
const float npart = ${X.npart}.;
const float spatn = ${spatn}.;

vec3 low, high;     // range of current div; subset of -1 .. 1 with span border

// lookup one element/channel's worth of spheres for current division
// stating with low sphere number lowi
// gives a key to which spheres from lowi..lowi+23 are active within given div (low..high)
float spatkey(float lowi) {
    float t = 0.;
    for (float ii = ${A-1}.; ii >= 0.; ii--) {
        float i = ii + lowi;
        // if (i >= npart) break;      // may not be helpful, WRONG if ii working backwards, otherwise just some unused calculation
        float iin = (i+0.5) / float(${X.ntexsize});
        vec4 d = ${codebits.sphereInput()};
        t *= 2.;
        t += (low.x < d.x && d.x < high.x && low.y < d.y && d.y < high.y && low.z < d.z && d.z < high.z && i < npart) ? 1. : 0.;
    }
    return t;
}

${codebits.getpart}

void main() {               // spatial fragment shader
    // find active div
    vec3 div;                               // which div is current
    // out holds x=> x, lowi faster moving and y=> z, y faster moving
    float yz = float(gl_FragCoord.y - 0.5);     // contains  z, y faster moving
    div.y = getpart(yz, spatdivs.y);
    div.z = yz; // getpart(yz, spatdivs.z); // what's left, should be the same as getpart

    float lx = float(gl_FragCoord.x - 0.5);     // contains x, lowi faster moving
    float lowi = getpart(lx, spatn) * ${4*A}.;
    div.x = lx;

    low = (div / spatdivs) * 2. - 1. - span;
    high = ((div+1.) / spatdivs) * 2. - 1. + span;

    // find active range of spheres
    gl_FragColor.x = spatkey(lowi);
    gl_FragColor.y = spatkey(lowi+${A}.);
    gl_FragColor.z = spatkey(lowi+${2*A}.);
    gl_FragColor.w = spatkey(lowi+${3*A}.);
    // gl_FragColor.xyz = high; // debug
}
`

    spatmat = new THREE.RawShaderMaterial({
        fragmentShader: spatfrag,
        vertexShader: spatvert,
        uniforms: spatFillUniforms
    });
    spatmat.depthTest = spatmat.depthWrite = false;

    spatgeom = new THREE.PlaneGeometry(4,4);
    spatmesh = new THREE.Mesh(spatgeom, spatmat);
    spatmesh.frustumCulled = false;
    spatscene = new THREE.Scene();
    spatscene.add(spatmesh);

}
spatFillUniforms = {    // will be filled with fillUniforms later
    span: {value: span}
}

codebitsinit();

} // end Marching
