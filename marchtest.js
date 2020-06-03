/**
 * test case for marching.js, at https://github.com/sjpt/metaballsWebgl
 ***/
var THREE, Stats, Marching;
var queryloadpromise, trywebgl2=true, gldebug, Gldebug, location;
//function test() {

// general initialization of test scope
var camera, renderer, canvas, rca, controls, stats,
framenum=0, X, marching, isWebGL2, scene, searchEval, lightGroup;
function init() {
    console.clear();
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    searchEval = unescape(window.location.search.substring(1));
    if (location.href.indexOf('htmlpreview') !== -1) searchEval = '';
    eval(searchEval);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 3;
    var gl;

    if (trywebgl2) {
        canvas = document.createElement('canvas');

        // Try creating a WebGL 2 context first
        rca = {};
        gl = canvas.getContext('webgl2', rca);
        if (!gl) {
            gl = canvas.getContext('experimental-webgl2', rca);
        }
        isWebGL2 = !!gl;
    }
    if (isWebGL2) {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    } else {
        renderer = new THREE.WebGLRenderer();
    }
    gl = renderer.getContext();

    if (gldebug && Gldebug) Gldebug.start({gl, type: gldebug});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;

    document.body.appendChild(renderer.domElement);

    THREE.MOUSE.ROTATE = 0; // ? needed because of different THREE versions???
    controls = new THREE.TrackballControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0.0;
    controls.rotateSpeed = 3;
    // controls.screenSpacePanning = false;
    window.addEventListener( 'resize', onWindowResize, false );

    stats = new Stats();
    stats.domElement.id = 'statsid';
    stats.domElement.style.top = '0';
    stats.domElement.style.right = '0';
    stats.domElement.style.left = '';
    stats.domElement.style.position = 'absolute';
    document.body.appendChild( stats.domElement );

    scene = new THREE.Scene();
    lightGroup = new THREE.Group();
    scene.add(lightGroup);
    const lighta = new THREE.AmbientLight( 0xffffff, 0.1 ); lightGroup.add(lighta);
    const light = new THREE.DirectionalLight(new THREE.Vector3(0,5, 0.5, 1), 1); lightGroup.add(light)


    // scene = new THREE.Scene();

    setTimeout( () => {
        marching = new Marching(isWebGL2);
        eval(searchEval);
        X = marching.X;
        scene.add(marching.three);
        animate();
    });

}


/** make sure camera tracks window changes */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

function jstring(k) {
    return JSON.stringify(k,
        function jrep (key, val) {
            return val.toFixed ? Number(val.toFixed(3)) : val;
        }, '<br>'
    ).split('"').join('');
}


var sd = Date.now(), time = 0, speed = 0.1;
function animate() {
    framenum++;
    try {eval(window.code.value);} catch(e){}

    const ed = Date.now();
    time /* = spatFillUniforms.time.value */ += (ed-sd) * speed /1000;
    filldata(time);
    sd = ed;

    controls.update();

    window.requestAnimationFrame(animate);
    // marching.render(renderer, camera);
    renderer.clear(true, true, true);
    for (let i = 0; i < X.loops; i++) {
        if (X.dowire || X.dopoints || !X.doshade)
            marching.testRender(renderer, undefined, camera);    // for performance tests with points/etc
        else if (X.doshade)
            renderer.render(scene, camera);                         // normal path
    }
    stats.update();
    window.msg.innerHTML = `${jstring(X)}`


}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// set up positions
var data = [];
var datatexture;
var gridSpheres = false; // see below for placing
window.fillk = 0.7;

function filldata(t = 1234, k = window.fillk) {
    const {npart} = X;
    X.ntexsize = npart;         // for this test the texture is the correct size
    if (data.length !== 4*npart) {
        data = new Float32Array(4*npart);
        datatexture = new THREE.DataTexture(data, npart, 1, THREE.RGBAFormat, THREE.FloatType);
    }
    datatexture.needsUpdate = true;
    let ii = (gridSpheres) ? fillgrid() : 0;
    for (let i=0; ii<npart*4; i++) {
        let iin = i/npart;
        data[ii++] = k*sp(i + t*(1.3 + 2.1 * iin));
        data[ii++] = k*sp(i*1.3 + t*(1.9 + iin));
        data[ii++] = k*sp(i*1.7 + t*(2.2 + 0.2 * iin));
        data[ii++] = 1;
    }
    marching.updateData(datatexture, X.sphereScale);
    function sp(x) { var r = Math.sin(x); return Math.abs(r) * r; }
}

// filldata assistant for regular box (for debug)
// The first 'usebox' spheres are placed on a grid
// If usebox is not a number then as many spheres as possible are gridded
// In either case, any remaining spheres (up to npart) will be placed by filldata code
function fillgrid() {
    const n3 = (typeof gridSpheres === 'number') ? gridSpheres : Math.floor(X.npart ** (1/3) + 0.001);
    let ii = 0;
    for (let x=0; x<n3; x++) {
        for (let y=0; y<n3; y++) {
            for (let z=0; z<n3; z++) {
                data[ii++] = 1.5 * (x/n3 - 0.5);
                data[ii++] = 1.5 * (y/n3 - 0.5);
                data[ii++] = 1.5 * (z/n3 - 0.5);
                data[ii++] = 1;
            }
        }
    }
    return ii;
}


if (queryloadpromise) {
    setInterval( () => queryloadpromise().then(x => {
        window.perfmsg.innerHTML = `${jstring(x)}<br><b> ${(x.realutil * 100).toFixed(1)}%</b>`;
    }), 1000);
}


window.onload = () => {

    // this is defined within the javascript to make it easier to have different html test files
    // that bring in different versions of three.js etc
    document.body.innerHTML = `

<div style="z-index:999; position:absolute; left: 1em; top:0; background-color: white; opacity: 80%; overflow: auto; max-width: 20em;">
    <div id=msg style="overflow-wrap: break-word"></div>
    <div id=perfmsg></div>
    <br>
    exp<input type="radio" name="ff" onclick="X.funtype=2" checked="1"></button>
    cubic<input type="radio" name="ff" onclick="X.funtype=0"></button>
    square<input type="radio" name="ff" onclick="X.funtype=1"></button>
    <br>
    rad<input type="range" min="0.001" max="0.5" value="0.1" step="0.001"
        oninput="X.rad=this.value"/>
    <br>
    radInfluence<input type="range" min="1.01" max="4" value="1.5" step="0.001"
        oninput="X.radInfluence=this.value"/>
    <br>
    speed<input type="range" min="0" max="0.5" value="0.1" step="0.01"
        oninput="speed=this.value"/>
    <br>
    #spheres<input type="range" min="0" max="4.3" value="3" step="0.1"
        oninput="X.npart=Math.min(2**14, Math.ceil(10 ** this.value))"/>
    <br>
    res<input type="range" min="0" max="400" value="100" step="10"
        oninput="X.xnum=X.ynum=X.znum=this.value"/>
    <br>
    spatdiv<input type="range" min="1" max="50" value="25" step="1"
        oninput="X.spatdiv=this.value"/>
    <br>
    <!-- expradinf<input type="range" min="0" max="8" value="1" step="0.001"
        oninput="expradinf=this.value"/>
    <br>
    -->
    spatial<input type="checkbox" checked="1" onclick="X.renders.spat = +!!this.checked"></button>
    fill<input type="checkbox" checked="1" onclick="X.renders.fill = +!!this.checked"></button>
    box<input type="checkbox" checked="1" onclick="X.renders.box = +!!this.checked"></button>
    <br>
    shade<input type="checkbox" checked="1" onclick="X.doshade=this.checked"></button>
    wire<input type="checkbox" onclick="X.dowire=this.checked"></button>
    points<input type="checkbox" onclick="X.dopoints=this.checked"></button>
    trivmarch<input type="checkbox" onclick="X.trivmarch=this.checked"></button>
    instancing<input type="checkbox" onclick="X.instancing=this.checked" checked="1"></button>
    useboxnorm<input type="checkbox" onclick="X.useboxnorm=this.checked" checked="1"></button>
    threeShader<input type="checkbox" onclick="X.threeShader=this.checked" checked="1"></button>
    <br>
    loops<input type="range" min="0" max="10" value="1" step="1"
        oninput="X.loops=this.value"/>
    <br>

    <textarea id="code">// extra code here</textarea>
</div>
`
init();
};

