/**
 * test case for marching.js, at https://github.com/sjpt/metaballsWebgl
 ***/
var THREE, Stats, Marching, console, interpretSearchString='notused', createTestData;
var queryloadpromise, trywebgl2=true, gldebug, Gldebug, location;
//function test() {

// general initialization of test scope
var camera, renderer, canvas, rca, controls, stats,
framenum=0, X, marching, isWebGL2, scene, searchEval, light, lighta, lightGroup, tests;
function marchTestInit() {
    //console.clear();
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    searchEval = unescape(window.location.search.substring(1));

    /** this allows poking behaviour from the search string; eg choice of webgl version */
    if (location.href.indexOf('htmlpreview') !== -1) searchEval = '';
    try {
        X = {}; // done before 'real' X setup, this prevents debug catching setting X.xxx fields
        eval(searchEval);
    } catch (e) {
        console.error('err in first eval', e);
    }

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
        if (!isWebGL2) console.error('webgl2 requested but not available, will try old webgl')
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
    camera.add(lightGroup);
    scene.add(camera);
    lighta = new THREE.AmbientLight( 0xffffff, 0.1 ); lightGroup.add(lighta);
    light = new THREE.DirectionalLight(THREE.Color.NAMES.white, 1); lightGroup.add(light)
    light.position.set(0.6, 0.3, 1);

    marching = new Marching(isWebGL2);
    try {
        eval(searchEval);
    } catch (e) {
        console.error('err in second eval', e);
    }
    X = marching.X;
    scene.add(marching.three);
    animate();

    // where queryloadpromise supported this will show statistics about performance
    if (queryloadpromise) {
        setInterval( () => queryloadpromise().then(x => {
            window.perfmsg.innerHTML = `<b> ${(x.realutil * 100).toFixed(1)}%</b><br>${jstring(x)}`;
        }), 1000);
    }
    makefuns();
    window.funcode.addEventListener('keyup', funkeyup);
}

// make dropdown list from available functions
function makefuns() {
    tests = createTestData();
    const s = [];
    for (let t in tests) {
        s.push(`<option value="${t}">${t}</option>`)
    }
    window.funlist.innerHTML = s.join('\n');
}

// process function change, inclduing basic javascript=>glsl conversion
function funlistchange(v) {
    if (v === 'metaballs') {
        window.useFun.checked = X.useFun = false;
        ds();
        medial(false);
        return;
    }
    if (v === 'medial') {
        window.useFun.checked = X.useFun = false;
        ds();
        medial(true);
        return;
    }
    const t = tests[v], d = t.dims;
    let sf = t.f.toString();
    sf = sf.replace('function(x,y,z) {', '');
    sf = sf.replace('return', 'v = ');
    sf = sf.replace(/([^\.\da-z])(\d+)([^\.\d])/g, '$1$2.$3');
    //sf = sf.replace('/*<<', '/*<</')
    //sf = sf.replace('>>*/', '/>>*/')
    sf = sf.replace(/const/g, 'const float');
    sf = sf.replace(/let/g, 'float');
    sf = sf.substring(0, sf.length-1);
    sf = sf.split('Math.').join('');
    sf = sf.trim();

    X.funcode = window.funcode.value = sf;
    const l = Math.min(d[0][0], d[1][0], d[2][0]);
    const h = Math.max(d[0][1], d[1][1], d[2][1]);
    window.useFun.checked = X.useFun = true;
    X.funRange = window.funRange.value = Math.max(-l, h) * X.xnum/(X.xnum-2);
    ds();
}



/** make sure camera tracks window changes */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
}

/** convenient display function */
function jstring(k) {
    return JSON.stringify(k,
        function jrep (key, val) {
            return val && val.toFixed ? Number(val.toFixed(3)) : val;
        }, '<br>'
    ).split('"').join('');
}

function funkeyup(evt) {
    const funcode = window.funcode;
    if (evt.ctrlKey && evt.code === "Enter") X.funcode = window.funcode.value;
}

var sd = Date.now(), time = 0, speed = 0.1;
function animate() {
    framenum++;
    try {eval(window.code.value);} catch(e){}
    // X.funcode = window.funcode.value;
    window.funcode.style.background = X.funcode === window.funcode.value ? 'lightgreen' : 'lightpink';

    const ed = Date.now();
    time += (ed-sd) * speed /1000;
    filldata(time);
    sd = ed;

    controls.update();

    window.requestAnimationFrame(animate);

    if (marching.material) {
        marching.material.roughness = 0.3;  // do every framein case material has been recreated
        marching.material.metalness = 0.5
    }

    renderer.clear(true, true, true);
    for (let i = 0; i < X.loops; i++) {
        if (X.dowire || X.dopoints || !X.doshade)
            marching.testRender(renderer, undefined, camera);    // for performance tests with points/etc
        else if (X.doshade)
            renderer.render(scene, camera);                      // normal path
    }
    stats.update();
    window.msg.innerHTML = `${jstring(X)}`;
    marching.expose();                      // to help debug, overkill every frame, but just in case
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
        const off = X.medialNeg > 1e10 ? 0 : i >= X.medialNeg ? -X.spatoff : X.spatoff;
        data[ii++] = k*sp(i + t*(1.3 + 2.1 * iin)) + off;
        data[ii++] = k*sp(i*1.3 + t*(1.9 + iin)) + off;
        data[ii++] = k*sp(i*1.7 + t*(2.2 + 0.2 * iin)) + off;
        data[ii++] = ii * 172737 % 16777216;
    }
    marching.updateData(datatexture, X.spherePosScale);
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
                data[ii++] = ii * 172737 % 16777216;
            }
        }
    }
    return ii;
}

function ds() {
    window.UdoubleSide.checked = marching.autoDouble();
    X.isol = window.isol.value = X.useFun ? 0 : 1;
}

function medial(v) {
    if (v) {
        X.isol = 0;
        X.medialNeg = X.npart/2;
        X.medialThresh = 1e-20;
        X.radInfluence = 3;
        X.rad = 0.2;
        X.doubleSide = true;
        X.funtype = 0;              // cubic has precise 0 value
        X.trackStyle = 'trackMedial'
        X.spatoff = 0.1;
        X.medialColMax = 0.03;
    } else {
        X.isol = 1;
        X.medialNeg = 1e20;
        X.medialThresh = -1e-20;
        X.radInfluence = 2;
        X.rad = 0.1;
        X.doubleSide = false;
        X.trackStyle = 'trackNone';
        X.spatoff = 0;
    }
}

window.onload = () => {
    // this is defined within the javascript to make it easier to have different html test files
    // that bring in different versions of three.js etc
    document.body.innerHTML += `
<style>
    input[type="range"] {width: 15em}
    .hhelp { display: inline-block; position: absolute; left:16em; min-width: 10em; max-width: 30em;
        font-size: 125%; visibility: hidden; color: darkred; background: rgba(240, 255, 255, 1); opacity: 100%;}
    :hover + .hhelp {   visibility: visible; }
</style>

<div style="z-index:999; position:fixed; left: 1em; top:0; background-color: white; opacity: 80%; max-width: 20em;">
    <h3>metaballs</h3>
    <span>rad<input type="range" min="0.001" max="0.5" value="0.1" step="0.001"
        oninput="X.rad=this.value"/></span>
    <p class="hhelp">base radius for metaballs</p>
    <br>
    <span>radInfluence<input type="range" min="1.01" max="4" value="1.5" step="0.001"
        oninput="X.radInfluence=this.value"/></span>
        <p class="hhelp">maximum distance of influence of sphere in metaball interactions<br>factor of radius</p>
    <br>
    <span>#spheres<input type="range" min="0" max="4.3" value="3" step="0.1"
        oninput="X.npart=Math.min(2**14, Math.ceil(10 ** this.value))"/></span>
        <p class="hhelp">number of spheres for metaballs (metaballs only)</p>
    <br>
    <span>
        track: none<input type="radio" name="track" onclick="X.trackStyle='trackNone'">
        Color<input type="radio" name="track" onclick="X.trackStyle='trackColor'" checked="1">
        Id1<input type="radio" name="track" onclick="X.trackStyle='trackId1'">
    </span>
    <p class="hhelp">Control how information about individual spheres is tracked through the mataball code.
    <br><b>Color</b> tracks rgb, and will blend smoothly.
    <br><b>Id1</b>tracks a single ID value of 'most influential' shere.
    <br>This still causes somewhat arbitrary idges.</p>
    <br>
    <span>speed<input type="range" min="0" max="0.5" value="0.1" step="0.01"
        oninput="speed=this.value"/></span>
        <p class="hhelp">speed of metaball movement (metaballs only)</p>
    <br>
    <h3>functions</h3>
    <span style="display: none;">useFun<input type="checkbox" id="useFun" onclick="X.useFun=this.checked; ds()"></span>
    <p class="hhelp">Use function if checked, metaballs if not.
    <br>More flexible function settings to follow ....</p>
    <span>doubleSide<input type="checkbox" id="UdoubleSide" onclick="X.doubleSide=this.checked"></span>
    <p class="hhelp">use doubleSided rendering (set automatically by some other options)</p>
    <span>rotateInside<input type="checkbox" id="UrotateInside" onclick="X.rotateInside=this.checked"></span>
    <p class="hhelp">for doubleSide, rotate rgb on back side</p>
    <br>
        <select name="funs" id="funlist" onchange="funlistchange(this.value)">
        </select>
        <div class="hhelp"><h4>Select function to display</h4>
        <b><i>metaballs</i></b> displays many metaballs according to settings above.
        <br>This requires all four passes to create and then use the metaball potential function.
        <b><i>medial</i></b> displays medial surface according to settings above.
        <br>This uses half the particles as positive, and half as negative, and shows the balancing surface.
        <br>One application is to show potein docking interface (not illustrated here).
        <br><br>Others will display selected function and use just the two marching cubes passes.</li>
        </div>
        <textarea id="funcode"></textarea>
        <p class="hhelp">Write custom code here for potential function, and ctrl-Enter to submit code for use.
        <br><b>Light green</b> background indicates code currently shown is code in use.
        <br><b>Light pink</b> background indicates code currently shown is not code in use.
        <br><b>Currently no feedback for invalid code either before or after hitting ctrl-Enter.</b>
        </p>
    <br>
    <span>funRange<input type="range" min="0" max="4" value="1" step="0.001" id="funRange"
        oninput="X.funRange=this.value"/></span>
        <p class="hhelp">range of x, y and z values input to function (doFun only)</p>
    <br>
    <span>isol<input type="range" min="-1" max="2" value="1" step="0.1" id="isol"
        oninput="X.isol=this.value"/></span>
        <p class="hhelp">isosurface cutoff</p>

    <h3>implementation</h3>
    <span>res<input type="range" min="0" max="400" value="100" step="10"
        oninput="X.xnum=X.ynum=X.znum=this.value"/></span>
        <p class="hhelp">resolution for process.<br>Gui only supports x, y, z the same.</p>
    <br>
    <span>
        <b>shader:</b> trivial<input type="radio" name="shader" onclick="X.threeShader=0">
        three<input type="radio" name="shader" onclick="X.threeShader=1; X.marchtexture=0">
        organic<input type="radio" name="shader" onclick="X.threeShader=1; X.marchtexture=1" checked="1">
    </span>
    <p class="hhelp">
    Choose shader style.
    <br><b>trivial</b> does minimal extra work to make visually readable output.
    <br><b>three</b> uses standard three.js shading.
    <br><b>organic</b> applies Organic Art style texturing, with standard three.js shading.
    <br>Surface net only permits trivial shading for now ...
    </p>
    <br>
    <span>suface net<input type="checkbox" onclick="X.surfnet=this.checked; ds()"></span>
        <p class="hhelp">Use surfnet rather than marching cubes.></p>
    lego<input type="checkbox" onclick="X.lego=this.checked"></span>
        <p class="hhelp">The 'lego' options uses grid based points rather than forcing them to the surface.
        <br>For surfnet this uses the mid-points of the voxels.
        <br>For marching this uses the mid-points of the voxel edges.</p>
    <br>
    <!-- expradinf<input type="range" min="0" max="8" value="1" step="0.001"
        oninput="expradinf=this.value"/>
    <br>
    -->
    <span>
        exp<input type="radio" name="ff" onclick="X.funtype=2" checked="1">
        cubic<input type="radio" name="ff" onclick="X.funtype=0">
        square<input type="radio" name="ff" onclick="X.funtype=1">
    </span>
        <p class="hhelp">metaball function of distance, -ve exponential, cubic, or square</p>
    <br>
    <span>spatial<input type="checkbox" checked="1" onclick="X.renders.spat = +!!this.checked"></span>
        <p class="hhelp">Whether to perform spatial subdivision pass<br>(performance test, metaballs only)</p>
    <span>fill<input type="checkbox" checked="1" onclick="X.renders.fill = +!!this.checked"></span>
        <p class="hhelp">Whether to perform grid fill pass<br>(performance test, metaballs only)</p>
    <span>box<input type="checkbox" checked="1" onclick="X.renders.box = +!!this.checked"></span>
        <p class="hhelp">Whether to perform the grid prepass pass (eg compute key etc)<br>(performance test)</p>
    <span>march<input type="checkbox" checked="1" onclick="X.doshade=this.checked"></span>
        <p class="hhelp">Whether to perform the final marching pass
        <br>(performance test, no output it not selected)</p>
    <br>
    <!-- wire<input type="checkbox" onclick="X.dowire=this.checked"> -->
    <!-- points<input type="checkbox" onclick="X.dopoints=this.checked"> -->
    <span>trivmarch<input type="checkbox" onclick="X.trivmarch=this.checked"></span>
        <p class="hhelp">Perform trivial final marching pass.
        <br>No output is displayed.
        <br>Checks for overhead in processing 'dummy' vertices/triangles<br>(performance test)</p>
    <span>instancing<input type="checkbox" onclick="X.instancing=this.checked" checked="1"></span>
        <p class="hhelp">whether to use instancing (performance test) </p>
    <span>useboxnorm<input type="checkbox" onclick="X.useboxnorm=this.checked" checked="1"></span>
        <p class="hhelp">whether to compute normals in box or march phase </p>
    <br>
    <span>spatdiv<input type="range" min="1" max="50" value="25" step="1"
        oninput="X.spatdiv=this.value"/></span>
        <p class="hhelp">resolution for spatial subdivision pass (metaballs only)
            <br>Gui only supports x, y, z the same.</p>
    <br>
    <span>showTriangles<input type="range" min="0" max="0.01" value="0" step="0.0001" oninput="X.showTriangles=this.value"/></span>
        <p class="hhelp">show the trianlges generated from the triangulation (does not work for trivial shading)</p>
    <br>
    <span>loops<input type="range" min="0" max="10" value="1" step="1" oninput="X.loops=this.value"/></span>
        <p class="hhelp">number of loops (all enabled phases) per refresh cycle (performance test)</p>
    <br>

    <div id=perfmsg></div>
    <div id=msg style="overflow-wrap: break-word"></div>

    <textarea id="code">// extra code here</textarea>
</div>
`
marchTestInit();
};

