/** add a script dynamically */
async function addscript(src) {
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src;
    head.appendChild(script);
    return new Promise( (resolve, reject) => {
        script.onload = function (e) {
            resolve();
        };
    });
}
// go();
async function go() {
    await addscript("https://rawgit.com/mrdoob/three.js/dev/build/three.js")
    await addscript("https://rawgit.com/mrdoob/three.js/dev/examples/js/controls/TrackballControls.js")
    await addscript("https://rawgit.com/mrdoob/stats.js/master/build/stats.js")

    await addscript("https://cdn.jsdelivr.net/gh/sjpt/metaballsWebgl/marching.js")
    await addscript("https://cdn.jsdelivr.net/gh/sjpt/metaballsWebgl/marchtest.js")
}
// "https://cdn.jsdelivr.net/gh/mrdoob/three.js/dev/build/three.js"

window.onload = () => {
    go();
// document.head.innerHTML += `
// <!-- -->
// <script src="https://rawgit.com/mrdoob/three.js/dev/build/three.js"></script>
// <script src="https://rawgit.com/mrdoob/three.js/dev/examples/js/controls/TrackballControls.js"></script>
// <script src="https://rawgit.com/mrdoob/stats.js/master/build/stats.js"></script>

// <script src="marching.js"></script>
// <script src="marchtest.js"></script>
// <!-- -->
// `

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
    speed<input type="range" min="0" max="10" value="0" step="0.1"
        oninput="timek=20000/this.value"/>
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
    <br>
    loops<input type="range" min="0" max="10" value="1" step="1"
        oninput="X.loops=this.value"/>
    <br>

    <textarea id="code">// extra code here</textarea>
</div>
`};
