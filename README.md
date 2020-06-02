# metaballsWebgl
## summary
**metaballsWebgl** is a GPU implemenmtation of metaballs for running under WebGL or WebGL2, using optimized marching cubes (see below).
It uses three.js.

* Input is a texture containing sphere positions.
* Output is a rendered image as part of a three.js scene.

It is designed to be fast for dynamic data; for example it can handle 10,000 spheres at a grid resolution of 100x100x100 at 60 fps using 33% of a 1080 gpu.
It recomputes everything every render, so is inefficient for static data.

A test case can be viewed at https://sjpt.github.io/marchtest.html

## basic usage
```javascript
marching = new Marching(isWebGL2);
scene.add(marching.three);
marching.updateData(datatexture, sphereScale);
```
* `datatexture` is an n wide, 1 high texture of xyz values.
* `sphereScale` is the inverse of the minimum/maximum xyz size, to scale to -1..1 range.

This is illustrated in **marchtest.js**, run using **marching.html**

## more control
More control is via a structure `marching.X`
```
    rad: 0.1,           // radius of spheres
    radInfluence: 1.5,  // how far infludence spreads
    sphereScale: 1,     // scale of sphere positions (TODO; something cheap but more complete)
    sphereYin: false,   // true for y based input texture (1 wide, n high)
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
```
## algorithm
metaballsWebgl has been derived from standard marching cubes, with several optimizations. The optimizations are mainly designed to mitigate the inherent inefficiencies of GPU coding in Webgl.

It operates in four passes:
1. spatial subdivision determines which spheres are active in which super-voxel
2. grid potential fill, fills the voxel corners with potential data
3. voxel relevance pass, flag which voxels are likely to contribute, and how
4. marching cubes pass, generate the marching cubes triangles

The first three passes are rendered using three.js onBeforeCompile(),
the final pass as part of the 'real' three scene.

The relatively rigid limitations of shader programming, especially in Webgl, mean there are some inherent inefficiencies.

The spatial subdivision pass outputs a bitmap for each super-voxel, indicating whether each sphere does or does not contribute to that super-voxel. The bitmap is saved in RGBA float texture, 24 bits per float, 96 bits per texture position. We typically use 25x25x25 super-voxels. This means that the fill pass

The final marching phase generates 5 triangles for every voxel. Most voxels have no surface and all the triangles are 'dummy' triangles with three 'dummy' vertices, almost no voxels use all 5 triangles. The shaders are written to minimize time spent handling dummy vertices and triangles; the purpose of the voxel relevance pass is to assist that. Nevertheless the intrinsic overhead (outside the shaders) of handling vertices and trianlges means that nearly 50% of the gpu time goes into handling these dummy triangles.

The optimizations mean that the flow is highly non-uniform, and likely to behave very poorly on older gpus and gpus in many tablets and phones.

### three.js note
three.js is an excellent framework, but we have had some issues with this project, which is somewhat outside the normal use of three.js.

#### attribute-less coding
Most of the code is inherently attribute-less; in particular vertex positions are arrived at procedurally, and in WebGL2 can be derived from `gl_VertexID` and `gl_InstanceID`. The calling code needs to identify the number of vertices and instances, but no specific vertex or instance attributes are needed.

three.js does not currently support this; it requires a position vertex attribute and at least on instance attribute. This is not difficult (and in necessary in WebGL1), but does involve a little extra code in the application that should be unnecessary.

https://github.com/mrdoob/three.js/issues/19430
https://github.com/mrdoob/three.js/pull/19451
