// taken from http://mikolalysenko.github.io/Isosurface/
function createTestData() {
  var result = {};

  function memoize(f) {
    var cached = null;
    return function() {
      if(cached === null) {
        cached = f();
      }
      return cached;
    }
  }

    function makeVolume(dims, f) {
        return {dims, f};
    }

    result.metaballs = null;

    result.fano = makeVolume(
      [[-2, 2, 0.05],
        [-2, 2, 0.05],
        [-2, 2, 0.05]],
        function(x,y,z) {
    const b000 = -0.1296938094028164;
    const b100 = -0.12559320317105938;
    const b010 = -1.0328623458582733;
    const b001 = 2.5255575472290266;
    const b110 = 2.4060330675140764;
    const b101 = 10.0;
    const b011 = 1.2300251035770497;
    const b210 = 0.5731475086982323;
    const b120 = 0.8879230087385453;
    const b201 = 2.3413317237583797;
    const b102 = 0.29802930904302305;
    const b021 = 1.4619136622627633;
    const b012 = 0.8846581412111914;
    const b111 = 1.3399230191726863;
    const b030 = 10.0;
    const b003 = 10.0;
    const b200 = 1.8674935459024677;
    const b020 = 8.961174069275634;
    const b002 = 10.0;
    const b300 = 2.6837624713897066;
    const w = 1.0;

    let r = 0.0;
    r += b000 * w * w * w;
    r += b001 * z * w * w;
    r += b002 * z * z * w;
    r += b003 * z * z * z;

    r += b010 * y * w * w;
    r += b011 * y * z * w;
    r += b012 * y * z * z;

    r += b020 * y * y * w;
    r += b021 * y * y * z;

    r += b030 * y * y * y;

    r += b100 * x * w * w;
    r += b101 * x * z * w;
    r += b102 * x * z * z;

    r += b110 * x * y * w;
    r += b111 * x * y * z;

    r += b120 * x * y * y;

    r += b200 * x * x * w;
    r += b201 * x * x * z;

    r += b210 * x * x * y;

    r += b300 * x * x * x;

    return r;
  });


  result.Sphere = makeVolume(
    [[-1.0, 1.0, 0.25],
     [-1.0, 1.0, 0.25],
     [-1.0, 1.0, 0.25]],
    function(x,y,z) {
      return x*x + y*y + z*z - 1.0;
    }
  );

  result.Torus = makeVolume(
    [[-2.0, 2.0, 0.2],
     [-2.0, 2.0, 0.2],
     [-1.0, 1.0, 0.2]],
    function(x,y,z) {
      return Math.pow(1.0 - Math.sqrt(x*x + y*y), 2) + z*z - 0.25;
    }
  );

  result['Big Sphere'] = makeVolume(
    [[-1.0, 1.0, 0.05],
     [-1.0, 1.0, 0.05],
     [-1.0, 1.0, 0.05]],
    function(x,y,z) {
      return x*x + y*y + z*z - 1.0;
    }
  );

  result.Hyperelliptic = makeVolume(
    [[-1.0, 1.0, 0.05],
     [-1.0, 1.0, 0.05],
     [-1.0, 1.0, 0.05]],
    function(x,y,z) {
      return Math.pow( Math.pow(x, 6) + Math.pow(y, 6) + Math.pow(z, 6), 1.0/6.0 ) - 1.0;
    }
  );

  result['Nodal Cubic'] = makeVolume(
    [[-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05]],
    function(x,y,z) {
      return x*y + y*z + z*x + x*y*z;
    }
  );

  result["Goursat's Surface"] = makeVolume(
    [[-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05]],
    function(x,y,z) {
      return Math.pow(x,4) + Math.pow(y,4) + Math.pow(z,4) - 1.5 * (x*x  + y*y + z*z) + 1;
    }
  );

  result.Heart = makeVolume(
    [[-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05],
     [-2.0, 2.0, 0.05]],
    function(x,y,z) {
      y *= 1.5;
      z *= 1.5;
      return Math.pow(2*x*x+y*y+2*z*z-1, 3) - 0.1 * z*z*y*y*y - y*y*y*x*x;
    }
  );

  result["Nordstrand's Weird Surface"] = makeVolume(
    [[-0.8, 0.8, 0.01],
     [-0.8, 0.8, 0.01],
     [-0.8, 0.8, 0.01]],
    function(x,y,z) {
      return 25 * (Math.pow(x,3)*(y+z) + Math.pow(y,3)*(x+z) + Math.pow(z,3)*(x+y)) +
        50 * (x*x*y*y + x*x*z*z + y*y*z*z) -
        125 * (x*x*y*z + y*y*x*z+z*z*x*y) +
        60*x*y*z -
        4*(x*y+x*z+y*z);
    }
  );

  result['Sine Waves'] = makeVolume(
    [[-Math.PI*2, Math.PI*2, Math.PI/8],
     [-Math.PI*2, Math.PI*2, Math.PI/8],
     [-Math.PI*2, Math.PI*2, Math.PI/8]],
    function(x,y,z) {
      return Math.sin(x) + Math.sin(y) + Math.sin(z);
    }
  );

//   result['Perlin Noise'] = makeVolume(
//     [[-5, 5, 0.25],
//      [-5, 5, 0.25],
//      [-5, 5, 0.25]],
//     function(x,y,z) {
//       return PerlinNoise.noise(x,y,z) - 0.5;
//     }
//   );

//   result.Asteroid = makeVolume(
//     [[-1, 1, 0.08],
//      [-1, 1, 0.08],
//      [-1, 1, 0.08]],
//     function(x,y,z) {
//       return (x*x + y*y + z*z) - PerlinNoise.noise(x*2,y*2,z*2);
//     }
//   );

//   result.Terrain = makeVolume(
//     [[-1, 1, 0.05],
//      [-1, 1, 0.05],
//      [-1, 1, 0.05]],
//     function(x,y,z) {
//       return  y + PerlinNoise.noise(x*2+5,y*2+3,z*2+0.6);
//     }
//   );

//   function distanceFromConvexPlanes(planes, planeOffsets, x, y, z) {
//     var maxDistance = -Infinity;
//     for(var i = 0; i < planes.length; i++) {
//       var x_ = x - planeOffsets[i][0];
//       var y_ = y - planeOffsets[i][1];
//       var z_ = z - planeOffsets[i][2];

//       var dotProduct = planes[i][0] * x_ + planes[i][1] * y_ + planes[i][2] * z_;

//       maxDistance = Math.max(maxDistance, dotProduct);
//     }

//     return maxDistance;
//   }

//   result.Pyramid = makeVolume(
//     [[-1, 1, 0.125],
//      [-1, 1, 0.125],
//      [-1, 1, 0.125]],
//     function(x,y,z) {
//       var ROOT_3 = Math.sqrt(3);

//       var planes = [[-ROOT_3, ROOT_3, -ROOT_3],
//                     [-ROOT_3, ROOT_3,  ROOT_3],
//                     [ ROOT_3, ROOT_3, -ROOT_3],
//                     [ ROOT_3, ROOT_3,  ROOT_3]];
//       var planeOffsets = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];

//       return distanceFromConvexPlanes(planes, planeOffsets, x, y, z);
//     }
//   );

//   result['1/2 Offset Pyramid'] = makeVolume(
//     [[-1, 1, 0.125],
//      [-1, 1, 0.125],
//      [-1, 1, 0.125]],
//     function(x,y,z) {
//       var ROOT_3 = Math.sqrt(3);

//       var planes = [[-ROOT_3, ROOT_3, -ROOT_3],
//                     [-ROOT_3, ROOT_3,  ROOT_3],
//                     [ ROOT_3, ROOT_3, -ROOT_3],
//                     [ ROOT_3, ROOT_3,  ROOT_3]];
//       var planeOffsets = [[0.0625, 0.0625, 0.0625],
//                           [0.0625, 0.0625, 0.0625],
//                           [0.0625, 0.0625, 0.0625],
//                           [0.0625,0.0625,0.0625]];

//       return distanceFromConvexPlanes(planes, planeOffsets, x, y, z);
//     }
//   );

//   result.Tetrahedron = makeVolume(
//     [[-1, 1, 0.125],
//      [-1, 1, 0.125],
//      [-1, 1, 0.125]],
//     function(x,y,z) {
//       var INV_ROOT_3 = Math.sqrt(3)/3;

//       var planes = [[ INV_ROOT_3,  INV_ROOT_3,  INV_ROOT_3],
//                     [-INV_ROOT_3, -INV_ROOT_3,  INV_ROOT_3],
//                     [ INV_ROOT_3, -INV_ROOT_3, -INV_ROOT_3],
//                     [-INV_ROOT_3,  INV_ROOT_3, -INV_ROOT_3]];
//       var planeOffsets = [[ 0.25,  0.25,  0.25],
//                           [-0.25, -0.25,  0.25],
//                           [ 0.25, -0.25, -0.25],
//                           [-0.25,  0.25, -0.25]];

//       return distanceFromConvexPlanes(planes, planeOffsets, x, y, z);
//     }
//   );

//   result['1/2 Offset Tetrahedron'] = makeVolume(
//     [[-1, 1, 0.125],
//      [-1, 1, 0.125],
//      [-1, 1, 0.125]],
//     function(x,y,z) {
//       var INV_ROOT_3 = Math.sqrt(3)/3;

//       var planes = [[ INV_ROOT_3,  INV_ROOT_3,  INV_ROOT_3],
//                     [-INV_ROOT_3, -INV_ROOT_3,  INV_ROOT_3],
//                     [ INV_ROOT_3, -INV_ROOT_3, -INV_ROOT_3],
//                     [-INV_ROOT_3,  INV_ROOT_3, -INV_ROOT_3]];
//       var planeOffsets = [[ 0.3125,  0.3125,  0.3125],
//                           [-0.3125, -0.3125,  0.3125],
//                           [ 0.3125, -0.3125, -0.3125],
//                           [-0.3125,  0.3125, -0.3125]];

//       return distanceFromConvexPlanes(planes, planeOffsets, x, y, z);
//     }
//   );

//   result.Empty = function(){ return { data: new Float32Array(32*32*32), dims:[32,32,32] } };

  return result;
}
