

////////////////////////////////////////////////////////
// Material
////////////////////////////////////////////////////////

/** 
* Generic material.
* @constructor 
*/
function Material(name)
{
    this._name = name;
}

Material.prototype.getName = function()
{
    return this._name;
}

////////////////////////////////////////////////////////
// Surface ('uber' material)
////////////////////////////////////////////////////////

/** 
* Generic uber-surface material. Control via properties:
* @constructor 
* @extends Material
* @property {number}  roughness    - The surface roughness
* @property {number}  ior          - The surface coating ior
* @property {Array}  diffuseAlbedo - The surface diffuse (RGB) color
* @property {Array}  specAlbedo    - The surface spec (RGB) color
* @example
* surface.roughness = 0.05;
* surface.ior = 1.3530655391120507;
* surface.diffuseAlbedo = [0.5, 0.5, 0.5];
* surface.specAlbedo = [0.0, 0.0, 0.0];
*/
function Surface(name)
{
    Material.call(this, name);

    this.diffuseAlbedo = [1.0, 1.0, 1.0];
    this.specAlbedo = [1.0, 1.0, 1.0];
    this.roughness = 0.1;
    this.ior = 1.5;
}

Surface.prototype = Object.create(Material.prototype);

Surface.prototype.repr  = function()
{
    let code = `
    surface.roughness = ${this.roughness};
    surface.ior = ${this.ior};
    surface.diffuseAlbedo = [${this.diffuseAlbedo[0]}, ${this.diffuseAlbedo[1]}, ${this.diffuseAlbedo[2]}];
    surface.specAlbedo = [${this.specAlbedo[0]}, ${this.specAlbedo[1]}, ${this.specAlbedo[2]}];
    `;
    return code;
}

Surface.prototype.syncShader = function(shader)
{
    shader.uniform3Fv("surfaceDiffuseAlbedoRGB", this.diffuseAlbedo);
    shader.uniform3Fv("surfaceSpecAlbedoRGB", this.specAlbedo);
    shader.uniformF("surfaceRoughness", this.roughness);
    shader.uniformF("surfaceIor", this.ior);
}

Surface.prototype.initGui  = function(parentFolder) 
{
    this.diffuse = [this.diffuseAlbedo[0]*255.0, this.diffuseAlbedo[1]*255.0, this.diffuseAlbedo[2]*255.0];
    var diffItem = parentFolder.addColor(this, 'diffuse');
    let SURFACE_OBJ = this;
    diffItem.onChange( function(albedo) {
                            if (typeof albedo==='string' || albedo instanceof String)
                            {
                                var color = hexToRgb(albedo);
                                SURFACE_OBJ.diffuseAlbedo[0] = color.r / 255.0;
                                SURFACE_OBJ.diffuseAlbedo[1] = color.g / 255.0;
                                SURFACE_OBJ.diffuseAlbedo[2] = color.b / 255.0;
                            }
                            else
                            {
                                SURFACE_OBJ.diffuseAlbedo[0] = albedo[0] / 255.0;
                                SURFACE_OBJ.diffuseAlbedo[1] = albedo[1] / 255.0;
                                SURFACE_OBJ.diffuseAlbedo[2] = albedo[2] / 255.0;
                            }
                            snelly.reset(true);
                        } );

    this.specular = [this.specAlbedo[0]*255.0, this.specAlbedo[1]*255.0, this.specAlbedo[2]*255.0];
    var specItem = parentFolder.addColor(this, 'specular');
    specItem.onChange( function(albedo) {
                            if (typeof albedo==='string' || albedo instanceof String)
                            {
                                var color = hexToRgb(albedo);
                                SURFACE_OBJ.specAlbedo[0] = color.r / 255.0;
                                SURFACE_OBJ.specAlbedo[1] = color.g / 255.0;
                                SURFACE_OBJ.specAlbedo[2] = color.b / 255.0;
                            }
                            else
                            {
                                SURFACE_OBJ.specAlbedo[0] = albedo[0] / 255.0;
                                SURFACE_OBJ.specAlbedo[1] = albedo[1] / 255.0;
                                SURFACE_OBJ.specAlbedo[2] = albedo[2] / 255.0;
                            }
                            snelly.reset(true);
                        } );

    this.roughnessItem = parentFolder.add(this, 'roughness', 0.0, 1.0);
    this.roughnessItem.onChange( function(value) { SURFACE_OBJ.roughness = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.roughnessItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.iorItem = parentFolder.add(this, 'ior', 1.0, 6.0);
    this.iorItem.onChange( function(value) { SURFACE_OBJ.ior = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.iorItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );
}

////////////////////////////////////////////////////////
// Volumetric material
////////////////////////////////////////////////////////

/** 
* Volumetric material (a homogeneous atmosphere, with heterogeneous emission). Control via properties:
* @constructor 
* @extends Material
* @property {number} mfp             - MFP in units of inverse scene scale (gives grey extinction as inverse MFP)
* @property {number} maxOpticalDepth - maximum optical depth (in any channel), used to bound attenuation to infinity
* @property {Array}  scatteringColor - Scattering (RGB) color (multiplies grey extinction to give per-channel scattering coefficient)
* @property {Array}  absorptionColor - The absorption (RGB) color (multiplies extinction to give per-channel absorption coefficient)
* @property {number} anisotropy      - Phase function anisotropy in [-1,1]
* @property {number} emission        - emission power magnitude
* @property {Array}  emissionColor   - emission color (multiplies emission to give per-channel emission)
* @example
* volume.mfp = 0.1;
* volume.scatteringColor = [0.5, 0.5, 0.5];
* volume.absorptionColor = [0.0, 0.5, 0.0];
* volume.anisotropy = 0.0;
* volume.emission = 0.0;
* volume.emissionColor = [0.5, 0.5, 0.5];
*/
function Volume(name)
{
    Material.call(this, name);
    
    //.atmosphere bounds (homogeneous within this box)
    this.atmosphereMinX = -10.0;
    this.atmosphereMaxX =  10.0;
    this.atmosphereMinY = 0.0;
    this.atmosphereMaxY =  10.0;
    this.atmosphereMinZ = -10.0;
    this.atmosphereMaxZ =  10.0;
    // homogeneous atmosphere volumetric parameters
    this.lof10_mfp = 1.0; // in units of scene length scale
    this.scatteringColor = [0.0, 0.0, 0.0];
    this.absorptionColor = [0.0, 0.0, 0.0];
    this.anisotropy = 0.0;
    // UI values for optional heterogeneous volumetric emission field
    this.emission = 0.0;
    this.emissionColor = [1.0, 1.0, 1.0];
}

Volume.prototype = Object.create(Material.prototype);

Volume.prototype.repr  = function()
{
    let code = `
    volume.atmosphereMinX = ${this.atmosphereMinX};
    volume.atmosphereMinY = ${this.atmosphereMinY};
    volume.atmosphereMinZ = ${this.atmosphereMinZ};
    volume.atmosphereMaxX = ${this.atmosphereMaxX};
    volume.atmosphereMaxY = ${this.atmosphereMaxY};
    volume.atmosphereMaxZ = ${this.atmosphereMaxZ};
    volume.lof10_mfp = ${this.lof10_mfp};
    volume.scatteringColor = [${this.scatteringColor[0]}, ${this.scatteringColor[1]}, ${this.scatteringColor[2]}];
    volume.absorptionColor = [${this.absorptionColor[0]}, ${this.absorptionColor[1]}, ${this.absorptionColor[2]}];
    volume.emission = ${this.emission};
    volume.emissionColor = [${this.emissionColor[0]}, ${this.emissionColor[1]}, ${this.emissionColor[2]}];
    `;
    return code;
}

Volume.prototype.syncShader = function(shader)
{
    let scatteringCoeff = [0.0, 0.0, 0.0];
    let absorptionCoeff = [0.0, 0.0, 0.0];
    let extinctionCoeff = [0.0, 0.0, 0.0];
    for (let c=0; c<3; ++c)
    {
        scatteringCoeff[c] = this.scatteringColor[c];
        absorptionCoeff[c] = this.absorptionColor[c];
        extinctionCoeff[c] = absorptionCoeff[c] + scatteringCoeff[c];
    }

    shader.uniformF("atmosphereMFP", Math.pow(10, this.lof10_mfp));
    shader.uniform3Fv("atmosphereExtinctionCoeffRGB", extinctionCoeff);
    shader.uniform3Fv("atmosphereScatteringCoeffRGB", scatteringCoeff);
    shader.uniformF("atmosphereAnisotropy", this.anisotropy);

    let boundsMin = [this.atmosphereMinX, this.atmosphereMinY, this.atmosphereMinZ];
    let boundsMax = [this.atmosphereMaxX, this.atmosphereMaxY, this.atmosphereMaxZ];
    shader.uniform3Fv("atmosphereBoundsMin", boundsMin);
    shader.uniform3Fv("atmosphereBoundsMax", boundsMax);

    shader.uniformF("volumeEmission", this.emission);
    shader.uniform3Fv("volumeEmissionColorRGB", this.emissionColor);
}

Volume.prototype.nonNullVolume = function(color)
{
    return this.scatteringColor[0]> 0.0 || this.scatteringColor[1]> 0.0 || this.scatteringColor[2]> 0.0;
    return this.absorptionColor[0]> 0.0 || this.absorptionColor[1]> 0.0 || this.absorptionColor[2]> 0.0;
}

Volume.prototype.initGui = function(parentFolder)
{
    let VOLUME_OBJ = this;

    this.mfpItem = parentFolder.add(this, 'lof10_mfp', -2.0, 4.0);
    this.mfpItem.onChange( function(value) { this.lof10_mfp = value; snelly.camera.enabled = false; snelly.reset(true); });
    this.mfpItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    parentFolder.scatteringColor = [this.scatteringColor[0]*255.0, this.scatteringColor[1]*255.0, this.scatteringColor[2]*255.0];
    var scatteringColorItem = parentFolder.addColor(parentFolder, 'scatteringColor');
    scatteringColorItem.onChange( function(C) {
                            let CACHED_NON_NULL_VOUME = VOLUME_OBJ.nonNullVolume();
                            if (typeof C==='string' || C instanceof String)
                            {
                                var color = hexToRgb(C);
                                VOLUME_OBJ.scatteringColor[0] = color.r / 255.0;
                                VOLUME_OBJ.scatteringColor[1] = color.g / 255.0;
                                VOLUME_OBJ.scatteringColor[2] = color.b / 255.0;
                            }
                            else
                            {
                                VOLUME_OBJ.scatteringColor[0] = C[0] / 255.0;
                                VOLUME_OBJ.scatteringColor[1] = C[1] / 255.0;
                                VOLUME_OBJ.scatteringColor[2] = C[2] / 255.0;
                            }
                            if (VOLUME_OBJ.nonNullVolume() != CACHED_NON_NULL_VOUME)
                                snelly.reset(false);
                            else
                                snelly.reset(true);
                        } );

    parentFolder.absorptionColor = [this.absorptionColor[0]*255.0, this.absorptionColor[1]*255.0, this.absorptionColor[2]*255.0];
    var absorptionColorItem = parentFolder.addColor(parentFolder, 'absorptionColor');
    absorptionColorItem.onChange( function(C) {
                            let CACHED_NON_NULL_VOUME = VOLUME_OBJ.nonNullVolume();
                            if (typeof C==='string' || C instanceof String)
                            {
                                var color = hexToRgb(C);
                                VOLUME_OBJ.absorptionColor[0] = color.r / 255.0;
                                VOLUME_OBJ.absorptionColor[1] = color.g / 255.0;
                                VOLUME_OBJ.absorptionColor[2] = color.b / 255.0;
                            }
                            else
                            {
                                VOLUME_OBJ.absorptionColor[0] = C[0] / 255.0;
                                VOLUME_OBJ.absorptionColor[1] = C[1] / 255.0;
                                VOLUME_OBJ.absorptionColor[2] = C[2] / 255.0;
                            }
                            if (VOLUME_OBJ.nonNullVolume() != CACHED_NON_NULL_VOUME)
                                snelly.reset(false);
                            else
                                snelly.reset(true);
                        } );

    this.emissionItem = parentFolder.add(this, 'emission', 0.0, 100.0);
    this.emissionItem.onChange( function(value) { this.emission = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.emissionItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    parentFolder.emission = [this.emissionColor[0]*255.0, this.emissionColor[1]*255.0, this.emissionColor[2]*255.0];
    var emissionColorItem = parentFolder.addColor(parentFolder, 'emission');
    emissionColorItem.onChange( function(C) {
                            if (typeof C==='string' || C instanceof String)
                            {
                                var color = hexToRgb(C);
                                VOLUME_OBJ.emissionColor[0] = color.r / 255.0;
                                VOLUME_OBJ.emissionColor[1] = color.g / 255.0;
                                VOLUME_OBJ.emissionColor[2] = color.b / 255.0;
                            }
                            else
                            {
                                VOLUME_OBJ.emissionColor[0] = C[0] / 255.0;
                                VOLUME_OBJ.emissionColor[1] = C[1] / 255.0;
                                VOLUME_OBJ.emissionColor[2] = C[2] / 255.0;
                            }
                            snelly.reset(true);
                        } );

    this.anisotropyItem = parentFolder.add(this, 'anisotropy', -0.999, 0.999);
    this.anisotropyItem.onChange( function(value) { VOLUME_OBJ.anisotropy = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.anisotropyItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMinXItem = parentFolder.add(this, 'atmosphereMinX', -1000.0, 1000.0);
    this.atmosphereMinXItem.onChange( function(value) { VOLUME_OBJ.atmosphereMinX = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMinXItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMaxXItem = parentFolder.add(this, 'atmosphereMaxX', -1000.0, 1000.0);
    this.atmosphereMaxXItem.onChange( function(value) { VOLUME_OBJ.atmosphereMaxX = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMaxXItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMinYItem = parentFolder.add(this, 'atmosphereMinY', -1000.0, 1000.0);
    this.atmosphereMinYItem.onChange( function(value) { VOLUME_OBJ.atmosphereMinY = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMinYItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMaxYItem = parentFolder.add(this, 'atmosphereMaxY', -1000.0, 1000.0);
    this.atmosphereMaxYItem.onChange( function(value) { VOLUME_OBJ.atmosphereMaxY = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMaxYItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMinZItem = parentFolder.add(this, 'atmosphereMinZ', -1000.0, 1000.0);
    this.atmosphereMinZItem.onChange( function(value) { VOLUME_OBJ.atmosphereMinZ = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMinZItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );

    this.atmosphereMaxZItem = parentFolder.add(this, 'atmosphereMaxZ', -1000.0, 1000.0);
    this.atmosphereMaxZItem.onChange( function(value) { VOLUME_OBJ.atmosphereMaxZ = value; snelly.camera.enabled = false; snelly.reset(true); } );
    this.atmosphereMaxZItem.onFinishChange( function(value) { snelly.camera.enabled = true; } );
}



////////////////////////////////////////////////////////
// Metals
////////////////////////////////////////////////////////

/** 
* Generic metal material. Supported physical metals are:
*```
*  "Aluminium"
*  "Brass"
*  "Calcium"
*  "Chromium"
*  "Cobalt"
*  "Copper" 
*  "Gold"   
*  "Iridium"
*  "Iron" 
*  "Lead"   
*  "Mercury"
*  "Molybdenum"
*  "Nickel"
*  "Palladium"
*  "Platinum"
*  "Silicon"
*  "Silver"
*  "Titanium"
*  "Tungsten"
*  "Vanadium"
*  "Zinc"
*  "Zirconium"
*```
* @constructor 
* @extends Material
* @property {number}  roughness  - The metal surface roughness
* @example
* let metal = materials.loadMetal('Gold');
* metal.roughness = 0.05;
*/
function Metal(name)
{
    Material.call(this, name);
    this.roughness = 0.02;
    this.specAlbedo = [1.0, 1.0, 1.0];
}

Metal.prototype = Object.create(Material.prototype);

Metal.prototype.repr  = function()
{
    let code = `
    metal.roughness = ${this.roughness};
    metal.specAlbedo = [${this.specAlbedo[0]}, ${this.specAlbedo[1]}, ${this.specAlbedo[2]}];
    `;
    return code;
}

Metal.prototype.syncShader = function(shader)
{
    shader.uniformF("metalRoughness", this.roughness);
    shader.uniform3Fv("metalSpecAlbedoRGB", this.specAlbedo);
}

Metal.prototype.initGui  = function(parentFolder) 
{ 
    this.roughnessItem = parentFolder.add(this, 'roughness', 0.0, 0.1);
    this.roughnessItem.onChange( function(value) { snelly.camControls.enabled = false; snelly.reset(true); } );
    this.roughnessItem.onFinishChange( function(value) { snelly.camControls.enabled = true; } );

    this.specular = [this.specAlbedo[0]*255.0, this.specAlbedo[1]*255.0, this.specAlbedo[2]*255.0];
    this.specItem = parentFolder.addColor(this, 'specular');
    var ME = this;
    this.specItem.onChange( function(albedo) {
                                if (typeof albedo==='string' || albedo instanceof String)
                                {
                                    var color = hexToRgb(albedo);
                                    ME.specAlbedo[0] = color.r / 255.0;
                                    ME.specAlbedo[1] = color.g / 255.0;
                                    ME.specAlbedo[2] = color.b / 255.0;
                                }
                                else
                                {
                                    ME.specAlbedo[0] = albedo[0] / 255.0;
                                    ME.specAlbedo[1] = albedo[1] / 255.0;
                                    ME.specAlbedo[2] = albedo[2] / 255.0;
                                }
                                snelly.reset(true);
                            } );
}

Metal.prototype.eraseGui = function(parentFolder) 
{ 
    parentFolder.remove(this.roughnessItem);
    parentFolder.remove(this.specItem);
}

function tabulated_aluminium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([0.0508064516129,0.0526497695853,0.0535437100213,0.0518379530917,0.050132196162,0.0503712273642,0.0507736418511,0.0511633986928,0.0515368814192,0.0519103641457,0.052,0.052,0.052,0.0522873284907,0.0526101694915,0.0529330104923,0.0527616541353,0.0524609022556,0.0521601503759,0.052,0.052,0.052,0.052,0.0519313269841,0.0518500571429,0.0517687873016,0.0516875174603,0.0513434577259,0.0509726122449,0.0506017667638,0.0502309212828,0.0500476972281,0.049979466951,0.0499112366738,0.0498430063966,0.0497747761194,0.0494565472155,0.0491195012107,0.0487824552058,0.048445409201,0.0481083631961,0.048246595092,0.048528803681,0.0488110122699,0.0490932208589,0.0493754294479,0.0496514128296,0.0498340181031,0.0500166233766,0.0501992286501,0.0503818339237,0.0505644391972,0.0507470444707,0.0508711252205,0.0509713015873,0.0510714779541,0.051171654321,0.0512718306878,0.0513720070547,0.0514721834215,0.0516020488722,0.0517499185464,0.0518977882206,0.0520456578947]),
                         k: new Float32Array([2.01265322581,2.08500345622,2.15556716418,2.22123880597,2.28691044776,2.34991146881,2.41268812877,2.47349019608,2.5317535014,2.59001680672,2.64663414634,2.70273170732,2.75882926829,2.81240920097,2.8656779661,2.91894673123,2.97171052632,3.02434210526,3.07697368421,3.12861697723,3.17913457557,3.22965217391,3.28016977226,3.32984761905,3.37937142857,3.4288952381,3.47841904762,3.5276606414,3.57687346939,3.62608629738,3.67529912536,3.7236119403,3.77137313433,3.81913432836,3.86689552239,3.91465671642,3.9623157385,4.00996707022,4.05761840194,4.10526973366,4.15292106538,4.2000543383,4.24703067485,4.29400701139,4.34098334794,4.38795968449,4.43488272334,4.48100629673,4.52712987013,4.57325344353,4.61937701692,4.66550059032,4.71162416372,4.75735696649,4.80293015873,4.84850335097,4.89407654321,4.93964973545,4.98522292769,5.03079611993,5.07616071429,5.12139880952,5.16663690476,5.211875]) } }

function tabulated_brass() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.471,1.45614285714,1.43928571429,1.41642857143,1.38928571429,1.35785714286,1.31914285714,1.278,1.22828571429,1.17714285714,1.12171428571,1.06542857143,1.00828571429,0.953714285714,0.9,0.852,0.805857142857,0.765285714286,0.728142857143,0.694428571429,0.665857142857,0.639,0.617857142857,0.597857142857,0.581285714286,0.566142857143,0.552428571429,0.539571428571,0.527,0.514428571429,0.502,0.49,0.479428571429,0.470285714286,0.464571428571,0.46,0.454285714286,0.450285714286,0.451428571429,0.451142857143,0.449428571429,0.447285714286,0.445,0.444428571429,0.444,0.444,0.444285714286,0.444857142857,0.444571428571,0.444,0.444,0.444142857143,0.444714285714,0.445285714286,0.445857142857,0.446857142857,0.448,0.449142857143,0.450285714286,0.451428571429,0.452857142857,0.454571428571,0.455857142857,0.457]),
                         k: new Float32Array([1.813,1.80842857143,1.80342857143,1.79714285714,1.79171428571,1.78714285714,1.78514285714,1.784,1.79142857143,1.80157142857,1.81985714286,1.84442857143,1.87528571429,1.91471428571,1.957,2.00785714286,2.06014285714,2.11671428571,2.175,2.235,2.29628571429,2.358,2.41857142857,2.47885714286,2.53828571429,2.59657142857,2.65371428571,2.70957142857,2.765,2.81928571429,2.874,2.93,2.98685714286,3.04457142857,3.10185714286,3.159,3.21271428571,3.26614285714,3.31871428571,3.37042857143,3.42128571429,3.47171428571,3.522,3.57171428571,3.62128571429,3.67042857143,3.71871428571,3.76614285714,3.81314285714,3.86,3.90742857143,3.95471428571,4.00157142857,4.04814285714,4.09442857143,4.14028571429,4.186,4.23171428571,4.27742857143,4.32314285714,4.36828571429,4.41285714286,4.457,4.501]) } }

function tabulated_calcium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013,0.620013]),
                         k: new Float32Array([0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728,0.95185728]) } }

function tabulated_chromium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.965,1.99357142857,2.02214285714,2.05071428571,2.07928571429,2.11404761905,2.14896825397,2.18388888889,2.223,2.263,2.303,2.34671428571,2.39814285714,2.44957142857,2.501,2.55525714286,2.61011428571,2.66497142857,2.71982857143,2.76954285714,2.81297142857,2.8564,2.89982857143,2.94367346939,2.99265306122,3.04163265306,3.0906122449,3.13959183673,3.18121212121,3.18813852814,3.19506493506,3.20199134199,3.20891774892,3.21584415584,3.21673469388,3.20857142857,3.20040816327,3.19224489796,3.18408163265,3.17591836735,3.16700680272,3.15612244898,3.14523809524,3.1343537415,3.12346938776,3.11258503401,3.10170068027,3.09081632653,3.0853015873,3.08022222222,3.07514285714,3.07006349206,3.06498412698,3.0599047619,3.05482539683,3.05016483516,3.05346153846,3.05675824176,3.06005494505,3.06335164835,3.06664835165,3.06994505495,3.07324175824,3.07653846154]),
                         k: new Float32Array([2.790625,2.82276785714,2.85767857143,2.89339285714,2.92910714286,2.96404761905,2.99896825397,3.03388888889,3.06357142857,3.09214285714,3.12071428571,3.14928571429,3.17785714286,3.20642857143,3.235,3.25131428571,3.26502857143,3.27874285714,3.29245714286,3.30308571429,3.30994285714,3.3168,3.32365714286,3.33,3.33,3.33,3.33,3.33,3.32909090909,3.3238961039,3.3187012987,3.31350649351,3.30831168831,3.30311688312,3.3,3.3,3.3,3.3,3.3,3.3,3.30149659864,3.30693877551,3.31238095238,3.31782312925,3.32326530612,3.32870748299,3.33414965986,3.33959183673,3.34587301587,3.35222222222,3.35857142857,3.36492063492,3.37126984127,3.37761904762,3.38396825397,3.39016483516,3.39346153846,3.39675824176,3.40005494505,3.40335164835,3.40664835165,3.40994505495,3.41324175824,3.41653846154]) } }

function tabulated_cobalt() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.08618114875,1.06286817158,1.03955519442,1.01624221725,0.992929240081,0.970486629505,0.948113750727,0.925740871949,0.903367993171,0.880995114393,0.858622235615,0.837962488316,0.820471716916,0.802980945516,0.785490174116,0.767999402716,0.750508631315,0.733017859915,0.715527088515,0.700951046074,0.689782554287,0.6786140625,0.667445570713,0.656277078926,0.645108587139,0.633940095352,0.622771603565,0.611603111778,0.600434619991,0.594213854115,0.589095221296,0.583976588477,0.578857955658,0.573739322839,0.56862069002,0.563502057201,0.558383424382,0.553264791563,0.548146158744,0.543027525925,0.537908893106,0.537044997742,0.537496668925,0.537948340108,0.538400011292,0.538851682475,0.539303353659,0.539755024842,0.540206696025,0.540658367209,0.541110038392,0.541561709575,0.542013380759,0.542465051942,0.542916723126,0.543368394309,0.545488118225,0.552214792635,0.558941467044,0.565668141454,0.572394815863,0.579121490273,0.585848164683,0.592574839092]),
                         k: new Float32Array([3.14224861439,3.18492017013,3.22759172587,3.27026328161,3.31293483735,3.36489118203,3.41759140294,3.47029162386,3.52299184477,3.57569206569,3.6283922866,3.68369880828,3.74382650359,3.80395419889,3.8640818942,3.92420958951,3.98433728481,4.04446498012,4.10459267542,4.16654074866,4.23061698891,4.29469322917,4.35876946942,4.42284570967,4.48692194992,4.55099819018,4.61507443043,4.67915067068,4.74322691093,4.80842431911,4.87387147358,4.93931862805,5.00476578252,5.07021293699,5.13566009146,5.20110724593,5.26655440041,5.33200155488,5.39744870935,5.46289586382,5.52834301829,5.5937951013,5.65924870822,5.72470231514,5.79015592205,5.85560952897,5.92106313589,5.98651674281,6.05197034972,6.11742395664,6.18287756356,6.24833117047,6.31378477739,6.37923838431,6.44469199122,6.51014559814,6.57537622629,6.63999101529,6.7046058043,6.7692205933,6.83383538231,6.89845017131,6.96306496032,7.02767974932]) } }

function tabulated_copper() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.26854032258,1.25148963134,1.23432302772,1.21683901919,1.19935501066,1.19354527163,1.18871629779,1.18305882353,1.17633613445,1.16961344538,1.16243902439,1.15512195122,1.14780487805,1.14240274415,1.13723728814,1.13207183212,1.12861654135,1.12560902256,1.12260150376,1.11687025535,1.10803657695,1.09920289855,1.09036922015,1.06382704762,1.03403657143,1.00424609524,0.974455619048,0.87537271137,0.769226938776,0.663081166181,0.556935393586,0.465069936034,0.381956929638,0.298843923241,0.215730916844,0.132617910448,0.121001123487,0.114765772397,0.108530421308,0.102295070218,0.0960597191283,0.0936938431201,0.0925001533742,0.0913064636284,0.0901127738826,0.0889190841367,0.0876521251476,0.0852861275089,0.0829201298701,0.0805541322314,0.0781881345927,0.075822136954,0.0734561393152,0.0719255132275,0.0707360952381,0.0695466772487,0.0683572592593,0.0671678412698,0.0659784232804,0.064789005291,0.0640014473684,0.0634575877193,0.0629137280702,0.0623698684211]),
                         k: new Float32Array([2.04526612903,2.06416013825,2.08712579957,2.12124093817,2.15535607676,2.18769818913,2.21989134809,2.24796732026,2.27074976657,2.29353221289,2.31833101045,2.34376655052,2.36920209059,2.39297497982,2.41654237288,2.44010976594,2.45453383459,2.46656390977,2.47859398496,2.48706487233,2.49148171153,2.49589855072,2.50031538992,2.48211492063,2.45976571429,2.43741650794,2.41506730159,2.41236501458,2.41166530612,2.41096559767,2.41026588921,2.47715565032,2.58547121535,2.69378678038,2.80210234542,2.91041791045,3.0015874092,3.09146634383,3.18134527845,3.27122421308,3.3611031477,3.43271822962,3.4988006135,3.56488299737,3.63096538124,3.69704776512,3.76258126722,3.8198815427,3.87718181818,3.93448209366,3.99178236915,4.04908264463,4.10638292011,4.16146772487,4.21564761905,4.26982751323,4.32400740741,4.37818730159,4.43236719577,4.48654708995,4.53898308271,4.59036152882,4.64173997494,4.69311842105]) } }

function tabulated_gold() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.46534591195,1.46893980234,1.46746630728,1.46387241689,1.4602785265,1.45693521595,1.45361295681,1.45029069767,1.43210784314,1.4125,1.39289215686,1.37331707317,1.35380487805,1.33429268293,1.3147804878,1.2624548105,1.19948104956,1.13650728863,1.0735335277,0.99512,0.89912,0.80312,0.70712,0.616374419804,0.577178958226,0.537983496648,0.49878803507,0.459592573491,0.424149253731,0.400268656716,0.376388059701,0.352507462687,0.328626865672,0.304746268657,0.284960889255,0.271786743516,0.258612597777,0.245438452038,0.232264306299,0.21909016056,0.207096018735,0.197728337237,0.188360655738,0.178992974239,0.16962529274,0.160257611241,0.150889929742,0.141522248244,0.138936507937,0.137666666667,0.136396825397,0.135126984127,0.133857142857,0.132587301587,0.131317460317,0.130047619048,0.131067961165,0.132177531207,0.133287101248,0.13439667129,0.135506241331,0.136615811373,0.137725381415,0.138834951456]),
                         k: new Float32Array([1.9431572327,1.94998562444,1.95352021563,1.95567654987,1.9578328841,1.95493521595,1.95161295681,1.94829069767,1.93930952381,1.92978571429,1.92026190476,1.90779442509,1.88967595819,1.87155749129,1.85343902439,1.84618250729,1.84245072886,1.83871895044,1.83498717201,1.85950057143,1.91618628571,1.972872,2.02955771429,2.08813666839,2.16528984012,2.24244301186,2.3195961836,2.39674935534,2.47205074627,2.541645629,2.61124051173,2.68083539446,2.75043027719,2.82002515991,2.88876245368,2.95611527378,3.02346809387,3.09082091396,3.15817373405,3.22552655414,3.28963131482,3.34650652392,3.40338173302,3.46025694212,3.51713215122,3.57400736032,3.63088256942,3.68775777852,3.74017777778,3.79173333333,3.84328888889,3.89484444444,3.9464,3.99795555556,4.04951111111,4.10106666667,4.14988349515,4.19859361997,4.2473037448,4.29601386963,4.34472399445,4.39343411928,4.44214424411,4.49085436893]) } }

function tabulated_iridium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42,1.42]),
                         k: new Float32Array([1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13,1.13]) } }

function tabulated_iron() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.11877749048,1.1030497688,1.08732204712,1.07159432544,1.05586660376,1.04977159777,1.04444834314,1.0391250885,1.03380183386,1.02847857922,1.02315532459,1.02178586448,1.02773019186,1.03367451924,1.03961884662,1.045563174,1.05150750139,1.05745182877,1.06339615615,1.07429713632,1.090992839,1.10768854167,1.12438424434,1.14107994701,1.15777564968,1.17447135235,1.19116705502,1.20786275769,1.22455846037,1.25119032292,1.28003551954,1.30888071615,1.33772591277,1.36657110938,1.395416306,1.42426150261,1.45310669923,1.48195189584,1.51079709246,1.53964228907,1.56848748569,1.6114902631,1.65887057023,1.70625087737,1.75363118451,1.80101149164,1.84839179878,1.89577210592,1.94315241305,1.99053272019,2.03791302733,2.08529333446,2.1326736416,2.18005394874,2.22743425587,2.27481456301,2.33233482978,2.41786038146,2.50338593314,2.58891148483,2.67443703651,2.7599625882,2.84548813988,2.93101369157]),
                         k: new Float32Array([3.59813781888,3.66712409981,3.73611038075,3.80509666168,3.87408294261,3.95354846785,4.03385356639,4.11415866493,4.19446376346,4.274768862,4.35507396054,4.43740278395,4.5234751235,4.60954746305,4.6956198026,4.78169214214,4.86776448169,4.95383682124,5.03990916079,5.12778804287,5.21777891727,5.30776979167,5.39776066607,5.48775154046,5.57774241486,5.66773328926,5.75772416366,5.84771503806,5.93770591246,6.03160136863,6.1263665918,6.22113181496,6.31589703812,6.41066226128,6.50542748444,6.60019270761,6.69495793077,6.78972315393,6.88448837709,6.97925360026,7.07401882342,7.17420684782,7.27607160456,7.3779363613,7.47980111805,7.58166587479,7.68353063153,7.78539538828,7.88726014502,7.98912490176,8.0909896585,8.19285441525,8.29471917199,8.39658392873,8.49844868548,8.60031344222,8.70394401931,8.81245156867,8.92095911803,9.02946666739,9.13797421675,9.24648176611,9.35498931548,9.46349686484]) } }

function tabulated_lead() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.88,1.87106382979,1.85404255319,1.8370212766,1.82,1.8029787234,1.78595744681,1.76893617021,1.75191489362,1.73407792208,1.71433766234,1.6945974026,1.67485714286,1.65511688312,1.63537662338,1.61563636364]),
                         k: new Float32Array([3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49,3.49574468085,3.50668693009,3.51762917933,3.52857142857,3.53951367781,3.55045592705,3.56139817629,3.57234042553,3.58841558442,3.61646753247,3.64451948052,3.67257142857,3.70062337662,3.72867532468,3.75672727273]) } }

function tabulated_mercury() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([0.8080885482,0.830158123998,0.852227699795,0.874297275593,0.896366851391,0.921119527681,0.946086620209,0.971053712737,0.996020805265,1.02098789779,1.04725601711,1.073934987,1.10061395688,1.12729292677,1.15397189665,1.18065086654,1.20868421022,1.23705720613,1.26543020203,1.29380319793,1.32217619383,1.35054918973,1.37892218564,1.40774664882,1.43665392553,1.46556120224,1.49446847895,1.52337575566,1.55228303237,1.58119030908,1.61009758579,1.63925199635,1.66855342594,1.69785485552,1.72715628511,1.75645771469,1.78575914428,1.81506057386,1.84436200345,1.87366343303,1.90296486262,1.93360304297,1.96465414634,1.99570524971,2.02675635308,2.05780745645,2.08885855981,2.11990966318,2.15096076655,2.18201186992,2.21306297329,2.24411407666,2.27516518002,2.30593720757,2.33659524639,2.36725328522,2.39791132404,2.42856936287,2.45922740169,2.48988544052,2.52054347934,2.55120151817,2.58185955699,2.61251759582]),
                         k: new Float32Array([3.31763183508,3.37168636746,3.42574089984,3.47979543222,3.5338499646,3.58518605885,3.63630491289,3.68742376694,3.73854262098,3.78966147503,3.8386364508,3.88693441238,3.93523237396,3.98353033554,4.03182829712,4.0801262587,4.12616888489,4.17164591416,4.21712294342,4.26259997268,4.30807700194,4.3535540312,4.39903106046,4.44149432222,4.48340476272,4.52531520321,4.56722564371,4.60913608421,4.6510465247,4.6929569652,4.73486740569,4.77586670486,4.81632396938,4.8567812339,4.89723849843,4.93769576295,4.97815302748,5.018610292,5.05906755652,5.09952482105,5.13998208557,5.17693360378,5.21280219512,5.24867078646,5.2845393778,5.32040796914,5.35627656048,5.39214515182,5.42801374316,5.46388233449,5.49975092583,5.53561951717,5.57148810851,5.60413737349,5.63547170234,5.66680603119,5.69814036005,5.7294746889,5.76080901775,5.79214334661,5.82347767546,5.85481200431,5.88614633317,5.91748066202]) } }

function tabulated_molybdenum() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.736186,3.7412794383,3.75098122553,3.76068301277,3.7703848,3.78008658723,3.78978837447,3.7994901617,3.80919194894,3.81477207273,3.81073498182,3.80669789091,3.8026608,3.79862370909,3.79458661818,3.79054952727]),
                         k: new Float32Array([3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.591222,3.58806158298,3.58204174103,3.57602189909,3.57000205714,3.5639822152,3.55796237325,3.55194253131,3.54592268936,3.53812189403,3.52616554078,3.51420918753,3.50225283429,3.49029648104,3.47834012779,3.46638377455]) } }

function tabulated_nickel() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15,2.15638297872,2.16854103343,2.18069908815,2.19285714286,2.20501519757,2.21717325228,2.22933130699,2.2414893617,2.25467532468,2.27025974026,2.28584415584,2.30142857143,2.31701298701,2.3325974026,2.34818181818]),
                         k: new Float32Array([3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.88,3.89468085106,3.9226443769,3.95060790274,3.97857142857,4.00653495441,4.03449848024,4.06246200608,4.09042553191,4.11716883117,4.14106493506,4.16496103896,4.18885714286,4.21275324675,4.23664935065,4.26054545455]) } }

function tabulated_palladium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.2825,1.29678571429,1.30830357143,1.31901785714,1.32973214286,1.34238095238,1.35507936508,1.36777777778,1.37942857143,1.39085714286,1.40228571429,1.41464285714,1.42892857143,1.44321428571,1.4575,1.47131428571,1.48502857143,1.49874285714,1.51245714286,1.52514285714,1.53657142857,1.548,1.55942857143,1.57107142857,1.58535714286,1.59964285714,1.61392857143,1.62821428571,1.64121212121,1.64813852814,1.65506493506,1.66199134199,1.66891774892,1.67584415584,1.68457142857,1.696,1.70742857143,1.71885714286,1.73028571429,1.74171428571,1.7518707483,1.75867346939,1.76547619048,1.77227891156,1.77908163265,1.78588435374,1.79268707483,1.79948979592,1.80704761905,1.81466666667,1.82228571429,1.8299047619,1.83752380952,1.84514285714,1.85276190476,1.86049450549,1.87038461538,1.88027472527,1.89016483516,1.90005494505,1.90994505495,1.91983516484,1.92972527473,1.93961538462]),
                         k: new Float32Array([2.88625,2.92196428571,2.95767857143,2.99339285714,3.02910714286,3.06404761905,3.09896825397,3.13388888889,3.16828571429,3.20257142857,3.23685714286,3.27207142857,3.30921428571,3.34635714286,3.3835,3.41828571429,3.45257142857,3.48685714286,3.52114285714,3.5544,3.5864,3.6184,3.6504,3.68244897959,3.71510204082,3.74775510204,3.78040816327,3.81306122449,3.84545454545,3.87662337662,3.90779220779,3.93896103896,3.97012987013,4.0012987013,4.03240816327,4.06342857143,4.09444897959,4.12546938776,4.15648979592,4.18751020408,4.21785714286,4.24642857143,4.275,4.30357142857,4.33214285714,4.36071428571,4.38928571429,4.41785714286,4.44701587302,4.47622222222,4.50542857143,4.53463492063,4.56384126984,4.59304761905,4.62225396825,4.65131868132,4.67769230769,4.70406593407,4.73043956044,4.75681318681,4.78318681319,4.80956043956,4.83593406593,4.86230769231]) } }

function tabulated_platinum() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.17558457425,1.0999656884,1.02434680255,0.948727916706,0.873109030858,0.833677079586,0.797144343472,0.760611607357,0.724078871242,0.687546135127,0.651013399012,0.622189854402,0.607626886041,0.593063917679,0.578500949318,0.563937980957,0.549375012595,0.534812044234,0.520249075873,0.510100420763,0.505112449965,0.500124479167,0.495136508369,0.490148537571,0.485160566772,0.480172595974,0.475184625176,0.470196654378,0.46520868358,0.464082890327,0.463817418284,0.463551946242,0.463286474199,0.463021002157,0.462755530114,0.462490058072,0.46222458603,0.461959113987,0.461693641945,0.461428169902,0.46116269786,0.463081272745,0.465675155827,0.468269038908,0.47086292199,0.473456805072,0.476050688153,0.478644571235,0.481238454317,0.483832337398,0.48642622048,0.489020103562,0.491613986643,0.494207869725,0.496801752807,0.499395635889,0.502542677846,0.507217474593,0.511892271341,0.516567068089,0.521241864837,0.525916661585,0.530591458333,0.535266255081]),
                         k: new Float32Array([2.98961740744,3.04442177705,3.09922614666,3.15403051627,3.20883488588,3.2900083731,3.37329449423,3.45658061537,3.5398667365,3.62315285764,3.70643897877,3.78878592341,3.86939556552,3.95000520762,4.03061484973,4.11122449183,4.19183413394,4.27244377604,4.35305341815,4.43113711346,4.50626777548,4.5813984375,4.65652909952,4.73165976154,4.80679042356,4.88192108558,4.9570517476,5.03218240963,5.10731307165,5.17898863676,5.2498945601,5.32080048345,5.39170640679,5.46261233014,5.53351825348,5.60442417683,5.67533010017,5.74623602352,5.81714194686,5.88804787021,5.95895379355,6.02752851787,6.09538243451,6.16323635114,6.23109026778,6.29894418441,6.36679810105,6.43465201768,6.50250593431,6.57035985095,6.63821376758,6.70606768422,6.77392160085,6.84177551749,6.90962943412,6.97748335075,7.04473222307,7.11031003956,7.17588785605,7.24146567255,7.30704348904,7.37262130553,7.43819912202,7.50377693852]) } }

function tabulated_silicon() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([5.96280645161,5.73607834101,5.53030277186,5.38190191898,5.2335010661,5.12510965795,5.02007947686,4.9270130719,4.8493286648,4.7716442577,4.7079825784,4.64874912892,4.58951567944,4.54248668281,4.49696610169,4.45144552058,4.41292180451,4.37623007519,4.33953834586,4.30644927536,4.27746376812,4.24847826087,4.21949275362,4.19525650794,4.17189142857,4.14852634921,4.12516126984,4.10585539359,4.08696326531,4.06807113703,4.04917900875,4.03234968017,4.01678464819,4.0012196162,3.98565458422,3.97008955224,3.95765084746,3.94544745763,3.9332440678,3.92104067797,3.90883728814,3.89806266433,3.8877208589,3.87737905346,3.86703724803,3.85669544259,3.84649822904,3.83846989374,3.83044155844,3.82241322314,3.81438488784,3.80635655254,3.79832821724,3.79159223986,3.78538412698,3.77917601411,3.77296790123,3.76675978836,3.76055167549,3.75434356261,3.74903571429,3.74427380952,3.73951190476,3.73475]),
                         k: new Float32Array([0.581008064516,0.469026497696,0.373539445629,0.323219616205,0.27289978678,0.244498993964,0.217939637827,0.196464052288,0.181524743231,0.166585434174,0.154261324042,0.142763066202,0.131264808362,0.118506860371,0.105593220339,0.0926795803067,0.0859481203008,0.0808353383459,0.075722556391,0.0713222912353,0.0677336093858,0.0641449275362,0.0605562456867,0.0574247619048,0.0543771428571,0.0513295238095,0.0482819047619,0.0446134110787,0.0408816326531,0.0371498542274,0.0334180758017,0.0317356076759,0.0313091684435,0.0308827292111,0.0304562899787,0.0300298507463,0.0285588377724,0.0270092009685,0.0254595641646,0.0239099273608,0.0223602905569,0.0211928133216,0.0201411042945,0.0190893952673,0.0180376862401,0.016985977213,0.0159704840614,0.0154982290437,0.015025974026,0.0145537190083,0.0140814639906,0.0136092089728,0.0131369539551,0.0126994708995,0.0122761904762,0.0118529100529,0.0114296296296,0.0110063492063,0.0105830687831,0.0101597883598,0.00984398496241,0.00959335839599,0.00934273182957,0.00909210526316]) } }

function tabulated_silver() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([0.05,0.05,0.05,0.05,0.05,0.0469352159468,0.0436129568106,0.0402906976744,0.04,0.04,0.04,0.0409547038328,0.0437421602787,0.0465296167247,0.0493170731707,0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.0501908200103,0.0522537390407,0.0543166580712,0.0563795771016,0.058442496132,0.0595820895522,0.0578763326226,0.056170575693,0.0544648187633,0.0527590618337,0.0510533049041,0.0506298888431,0.0522766570605,0.0539234252779,0.0555701934953,0.0572169617126,0.05886372993,0.0595851455336,0.0582469053195,0.0569086651054,0.0555704248913,0.0542321846771,0.052893944463,0.0515557042489,0.0502174640348,0.0489365079365,0.0476666666667,0.0463968253968,0.045126984127,0.0438571428571,0.0425873015873,0.0413174603175,0.0400476190476,0.038932038835,0.0378224687933,0.0367128987517,0.0356033287101,0.0344937586685,0.0333841886269,0.0322746185853,0.0311650485437]),
                         k: new Float32Array([1.97412578616,2.04815992812,2.12194070081,2.19561545373,2.26929020665,2.33231146179,2.39443770764,2.45656395349,2.51184243697,2.56646428571,2.62108613445,2.67723972125,2.73633379791,2.79542787456,2.85452195122,2.90844489796,2.96068979592,3.01293469388,3.06517959184,3.117684,3.170484,3.223284,3.276084,3.32899948427,3.38304796287,3.43709644146,3.49114492006,3.54519339866,3.59736716418,3.64376375267,3.69016034115,3.73655692964,3.78295351812,3.82935010661,3.87651873199,3.92493371758,3.97334870317,4.02176368876,4.07017867435,4.11859365994,4.16573168284,4.21002743392,4.25432318501,4.2986189361,4.34291468719,4.38721043827,4.43150618936,4.47580194045,4.52075396825,4.56583333333,4.61091269841,4.65599206349,4.70107142857,4.74615079365,4.79123015873,4.83630952381,4.88114563107,4.92597226075,4.97079889043,5.01562552011,5.06045214979,5.10527877947,5.15010540915,5.19493203883]) } }

function tabulated_tantalum() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.34261265138,1.33308614567,1.32355963997,1.31403313427,1.30450662856,1.29537947277,1.28628431199,1.27718915121,1.26809399043,1.25899882964,1.24990366886,1.24121143491,1.23326454095,1.22531764698,1.21737075302,1.20942385906,1.2014769651,1.19353007114,1.18558317717,1.17837413203,1.17202769102,1.16568125,1.15933480898,1.15298836797,1.14664192695,1.14029548594,1.13394904492,1.12760260391,1.12125616289,1.11631415007,1.11168498133,1.10705581259,1.10242664385,1.09779747511,1.09316830637,1.08853913763,1.08390996889,1.07928080015,1.07465163141,1.07002246267,1.06539329393,1.06200330075,1.05899646116,1.05598962156,1.05298278197,1.04997594238,1.04696910279,1.0439622632,1.0409554236,1.03794858401,1.03494174442,1.03193490483,1.02892806523,1.02592122564,1.02291438605,1.01990754646,1.01727033706,1.01565399947,1.01403766188,1.01242132428,1.01080498669,1.0091886491,1.00757231151,1.00595597392]),
                         k: new Float32Array([3.46438512472,3.50996855579,3.55555198686,3.60113541793,3.646718849,3.69531457013,3.74415162911,3.79298868808,3.84182574706,3.89066280604,3.93949986502,3.98928342211,4.04081782538,4.09235222865,4.14388663192,4.19542103519,4.24695543846,4.29848984173,4.350024245,4.4024403979,4.45588738645,4.509334375,4.56278136355,4.6162283521,4.66967534065,4.72312232921,4.77656931776,4.83001630631,4.88346329486,4.9378838846,4.99252134934,5.04715881409,5.10179627883,5.15643374357,5.21107120831,5.26570867305,5.3203461378,5.37498360254,5.42962106728,5.48425853202,5.53889599676,5.59396365257,5.64916432362,5.70436499468,5.75956566573,5.81476633679,5.86996700784,5.92516767889,5.98036834995,6.035569021,6.09076969206,6.14597036311,6.20117103417,6.25637170522,6.31157237627,6.36677304733,6.422007594,6.47733570086,6.53266380771,6.58799191456,6.64332002141,6.69864812827,6.75397623512,6.80930434197]) } }

function tabulated_titanium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([2.040625,2.07276785714,2.09660714286,2.11803571429,2.13946428571,2.16166666667,2.18388888889,2.20611111111,2.22414285714,2.24128571429,2.25842857143,2.27464285714,2.28892857143,2.30321428571,2.3175,2.32754285714,2.33668571429,2.34582857143,2.35497142857,2.36822857143,2.38651428571,2.4048,2.42308571429,2.44153061224,2.46193877551,2.48234693878,2.50275510204,2.52316326531,2.54181818182,2.55220779221,2.5625974026,2.57298701299,2.58337662338,2.59376623377,2.60457142857,2.616,2.62742857143,2.63885714286,2.65028571429,2.66171428571,2.67336734694,2.6856122449,2.69785714286,2.71010204082,2.72234693878,2.73459183673,2.74683673469,2.75908163265,2.77174603175,2.78444444444,2.79714285714,2.80984126984,2.82253968254,2.83523809524,2.84793650794,2.86076923077,2.87615384615,2.89153846154,2.90692307692,2.92230769231,2.93769230769,2.95307692308,2.96846153846,2.98384615385]),
                         k: new Float32Array([2.94125,2.94839285714,2.95830357143,2.96901785714,2.97973214286,2.98928571429,2.99880952381,3.00833333333,3.01707142857,3.02564285714,3.03421428571,3.04557142857,3.06271428571,3.07985714286,3.097,3.11697142857,3.13754285714,3.15811428571,3.17868571429,3.20131428571,3.22645714286,3.2516,3.27674285714,3.30198979592,3.32852040816,3.35505102041,3.38158163265,3.4081122449,3.43454545455,3.46051948052,3.48649350649,3.51246753247,3.53844155844,3.56441558442,3.58914285714,3.612,3.63485714286,3.65771428571,3.68057142857,3.70342857143,3.72448979592,3.74081632653,3.75714285714,3.77346938776,3.78979591837,3.80612244898,3.82244897959,3.8387755102,3.8540952381,3.86933333333,3.88457142857,3.89980952381,3.91504761905,3.93028571429,3.94552380952,3.96027472527,3.96576923077,3.97126373626,3.97675824176,3.98225274725,3.98774725275,3.99324175824,3.99873626374,4.00423076923]) } }

function tabulated_tungsten() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.8312601,3.83764875957,3.84981763495,3.86198651033,3.87415538571,3.88632426109,3.89849313647,3.91066201185,3.92283088723,3.92657986052,3.91068239558,3.89478493065,3.87888746571,3.86299000078,3.84709253584,3.83119507091]),
                         k: new Float32Array([2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.9042727,2.89713238723,2.88353179149,2.86993119574,2.8563306,2.84273000426,2.82912940851,2.81552881277,2.80192821702,2.78741728364,2.77078222909,2.75414717455,2.73751212,2.72087706545,2.70424201091,2.68760695636]) } }

function tabulated_vanadium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.0872755717,1.0735609984,1.05984642509,1.04613185178,1.03241727848,1.01417875451,0.995577781876,0.976976809241,0.958375836607,0.939774863972,0.921173891337,0.902388764397,0.883262986106,0.864137207814,0.845011429522,0.82588565123,0.806759872938,0.787634094647,0.768508316355,0.750837521777,0.734867719222,0.718897916667,0.702928114111,0.686958311556,0.670988509001,0.655018706446,0.639048903891,0.623079101336,0.60710929878,0.594938915505,0.583614873693,0.572290831882,0.56096679007,0.549642748258,0.538318706446,0.526994664634,0.515670622822,0.50434658101,0.493022539199,0.481698497387,0.470374455575,0.462387034779,0.455431298555,0.448475562331,0.441519826107,0.434564089883,0.427608353659,0.420652617435,0.41369688121,0.406741144986,0.399785408762,0.392829672538,0.385873936314,0.37891820009,0.371962463866,0.365006727642,0.358928755928,0.355275058677,0.351621361426,0.347967664174,0.344313966923,0.340660269672,0.337006572421,0.333352875169]),
                         k: new Float32Array([3.20395724891,3.23756963696,3.27118202501,3.30479441306,3.33840680112,3.37873604794,3.41960343426,3.46047082058,3.5013382069,3.54220559322,3.58307297954,3.62681616502,3.67587904625,3.72494192747,3.77400480869,3.82306768992,3.87213057114,3.92119345237,3.97025633359,4.02228222141,4.07777210029,4.13326197917,4.18875185805,4.24424173692,4.2997316158,4.35522149468,4.41071137356,4.46620125244,4.52169113132,4.57999834744,4.63893314087,4.6978679343,4.75680272773,4.81573752115,4.87467231458,4.93360710801,4.99254190144,5.05147669487,5.1104114883,5.16934628173,5.22828107516,5.28795655762,5.34786106143,5.40776556523,5.46767006904,5.52757457285,5.58747907666,5.64738358046,5.70728808427,5.76719258808,5.82709709188,5.88700159569,5.9469060995,6.0068106033,6.06671510711,6.12661961092,6.18640876609,6.24587934294,6.30534991979,6.36482049664,6.42429107349,6.48376165033,6.54323222718,6.60270280403]) } }

function tabulated_zinc() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([0.56474643138,0.574111166233,0.583475901086,0.592840635939,0.602205370792,0.613672079149,0.625307192858,0.636942306566,0.648577420275,0.660212533983,0.671847647692,0.684132110458,0.697617748697,0.711103386936,0.724589025175,0.738074663414,0.751560301652,0.765045939891,0.77853157813,0.792799135142,0.807980817571,0.8231625,0.838344182429,0.853525864858,0.868707547287,0.883889229716,0.899070912145,0.914252594574,0.929434277003,0.946000033599,0.962874100299,0.979748166999,0.996622233698,1.0134963004,1.0303703671,1.0472444338,1.0641185005,1.0809925672,1.0978666339,1.1147407006,1.1316147673,1.14984840673,1.1685024266,1.18715644648,1.20581046635,1.22446448622,1.2431185061,1.26177252597,1.28042654584,1.29908056572,1.31773458559,1.33638860547,1.35504262534,1.37369664521,1.39235066509,1.41100468496,1.43015697663,1.45068543191,1.4712138872,1.49174234248,1.51227079776,1.53279925305,1.55332770833,1.57385616362]),
                         k: new Float32Array([3.38934549401,3.45027918144,3.51121286887,3.5721465563,3.63308024373,3.69157304494,3.74987028787,3.80816753081,3.86646477374,3.92476201668,3.98305925961,4.04058895958,4.09669884726,4.15280873493,4.2089186226,4.26502851027,4.32113839795,4.37724828562,4.43335817329,4.4885272477,4.54259643635,4.596665625,4.65073481365,4.7048040023,4.75887319095,4.8129423796,4.86701156826,4.92108075691,4.97514994556,5.02751278787,5.07949553219,5.13147827651,5.18346102082,5.23544376514,5.28742650946,5.33940925377,5.39139199809,5.44337474241,5.49535748673,5.54734023104,5.59932297536,5.64952510889,5.69917667683,5.74882824477,5.79847981272,5.84813138066,5.89778294861,5.94743451655,5.99708608449,6.04673765244,6.09638922038,6.14604078833,6.19569235627,6.24534392422,6.29499549216,6.3446470601,6.3935460747,6.44036663219,6.48718718968,6.53400774717,6.58082830466,6.62764886215,6.67446941964,6.72128997713]) } }

function tabulated_zirconium() { // 64 samples of n, k between 390.000000nm and 750.000000nm
        return { n: new Float32Array([1.685,1.713,1.74128571429,1.77042857143,1.79957142857,1.82871428571,1.85721428571,1.8855,1.91378571429,1.94207142857,1.97035714286,1.99864285714,2.02692857143,2.05542857143,2.084,2.11257142857,2.14192857143,2.17364285714,2.20535714286,2.23707142857,2.26878571429,2.3005,2.33221428571,2.36414285714,2.39671428571,2.42928571429,2.46185714286,2.49635714286,2.5315,2.56664285714,2.60285714286,2.64228571429,2.68171428571,2.72114285714,2.758,2.794,2.83,2.86492857143,2.89664285714,2.92835714286,2.96007142857,2.99157142857,3.023,3.05442857143,3.08521428571,3.11407142857,3.14292857143,3.17178571429,3.19935714286,3.2265,3.25364285714,3.28042857143,3.30614285714,3.33185714286,3.35757142857,3.382,3.406,3.43,3.45357142857,3.47585714286,3.49814285714,3.52042857143,3.54078571429,3.5605]),
                         k: new Float32Array([2.5155,2.55178571429,2.58821428571,2.62507142857,2.66192857143,2.69878571429,2.73135714286,2.7625,2.79364285714,2.82478571429,2.85592857143,2.88707142857,2.91821428571,2.94892857143,2.9795,3.01007142857,3.0405,3.0705,3.1005,3.1305,3.15728571429,3.183,3.20871428571,3.2345,3.2605,3.2865,3.3125,3.33657142857,3.36,3.38342857143,3.40564285714,3.42421428571,3.44278571429,3.46135714286,3.47392857143,3.4845,3.49507142857,3.50542857143,3.51514285714,3.52485714286,3.53457142857,3.54321428571,3.5515,3.55978571429,3.56742857143,3.57314285714,3.57885714286,3.58457142857,3.58964285714,3.5945,3.59935714286,3.60392857143,3.60764285714,3.61135714286,3.61507142857,3.6175,3.6195,3.6215,3.62335714286,3.62478571429,3.62621428571,3.62764285714,3.62842857143,3.629]) } }




function TabulatedMetal(name, nk)
{
    Metal.call(this, name);
    this.ior_tex  = new GLU.Texture(64, 1, 1, true, true, true, nk.n);
    this.k_tex    = new GLU.Texture(64, 1, 1, true, true, true, nk.k);
}

TabulatedMetal.prototype = Object.create(Metal.prototype);

TabulatedMetal.prototype.ior = function()
{
    // Defines GLSL functions which take wavelength (in nanometres) and return ior and k
    var Nsample = 64;
    var delta = 1.0/(750.0-390.0);
return `
float IOR_METAL(float wavelength_nm)
{
    float u = (wavelength_nm - 390.0) * ${delta};
    return texture(iorTex, vec2(u, 0.5)).r;
}                                                       
float K_METAL(float wavelength_nm)                                      
{
    float u = (wavelength_nm - 390.0) * ${delta};
    return texture(kTex, vec2(u, 0.5)).r;
}
    `;
}

TabulatedMetal.prototype.syncShader = function(shader)
{
    this.ior_tex.bind(4);
    shader.uniformTexture("iorTex", this.ior_tex);

    this.k_tex.bind(5);
    shader.uniformTexture("k_tex", this.k_tex);

    Metal.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
TabulatedMetal.prototype.initGui = function(parentFolder)
{

}

TabulatedMetal.prototype.eraseGui = function(parentFolder)
{

}

TabulatedMetal.prototype.initGui  = function(parentFolder) { Metal.prototype.initGui.call(this, parentFolder) }
TabulatedMetal.prototype.eraseGui = function(parentFolder) { Metal.prototype.eraseGui.call(this, parentFolder) }



////////////////////////////////////////////////////////
// Dielectrics
////////////////////////////////////////////////////////

/** 
* Generic dielectric material. Supported physical dielectrics are:
*```glsl
*  "Constant IOR dielectric"
*  "Glass (BK7)"
*  "Glass (K7)"
*  "Glass (F5)"
*  "Glass (LAFN7)"
*  "Glass (LASF35)"
*  "Glass (N-LAK33A)"
*  "Glass (N-FK51A)"
*  "Glass (SF4)"
*  "Glass (SF67)"
*  "Water"
*  "Polycarbonate"
*  "Glycerol"
*  "Liquid Crystal (E7)"
*  "Diamond"
*  "Quartz"
*  "Fused Silica"
*  "Sapphire"
*  "Sodium Chloride"
*  "Proustite"
*  "Rutile"
*  "Silver Chloride"
*```
* @constructor 
* @extends Material
* @property {number} roughness        - The dielectric surface roughness
* @property {array} absorptionColor   - The dielectric surface absorption color
* @property {number} absorptionScale  - The dielectric surface absorption scale (m.f.p in multiples of scene max scale)
* @example
* let dielectric = materials.loadDielectric('Diamond');
* dielectric.absorptionColor = [1.0, 1.0, 1.0];
* dielectric.absorptionScale = 1.0; // mfp in multiples of scene scale
* dielectric.roughness = 0.030443974630021145;
*/
function Dielectric(name)
{
    Material.call(this, name);
    this.roughness = 0.005;
    this.absorptionScale = -1.0; // set later based on scene maxLengthScale
    this.absorptionColor  = [1.0, 1.0, 1.0];
    this.absorptionColorF = [0.0, 0.0, 0.0];
    this.absorptionRGB    = [0.0, 0.0, 0.0];
    this.specAlbedo = [1.0, 1.0, 1.0];
}

Dielectric.prototype = Object.create(Material.prototype);

Dielectric.prototype.repr  = function()
{
    let code = `
    dielectric.absorptionColor = [${this.absorptionColor[0]}, ${this.absorptionColor[1]}, ${this.absorptionColor[2]}];
    dielectric.absorptionScale = ${this.absorptionScale}; // mfp in multiples of scene scale
    dielectric.roughness = ${this.roughness};
    `;
    return code;
}

Dielectric.prototype.syncShader = function(shader)
{
    shader.uniformF("dieleRoughness", this.roughness);
    shader.uniform3Fv("dieleSpecAlbedoRGB", this.specAlbedo);

    this.absorptionRGB[0] = snelly.lengthScale/Math.max(this.absorptionScale, 1.0e-3) * Math.max(0.0, 1.0 - this.absorptionColor[0]);
    this.absorptionRGB[1] = snelly.lengthScale/Math.max(this.absorptionScale, 1.0e-3) * Math.max(0.0, 1.0 - this.absorptionColor[1]);
    this.absorptionRGB[2] = snelly.lengthScale/Math.max(this.absorptionScale, 1.0e-3) * Math.max(0.0, 1.0 - this.absorptionColor[2]);

    shader.uniform3Fv("dieleAbsorptionRGB", this.absorptionRGB);
}

Dielectric.prototype.initGui  = function(parentFolder) 
{ 
    if (this.absorptionScale<0.0) this.absorptionScale = snelly.maxLengthScale; 

    this.roughnessItem = parentFolder.add(this, 'roughness', 0.0, 0.1);
    this.roughnessItem.onChange( function(value) { snelly.camControls.enabled = false; snelly.reset(true); } );
    this.roughnessItem.onFinishChange( function(value) { snelly.camControls.enabled = true; } );

    this.absorption = [this.absorptionColor[0]*255.0, this.absorptionColor[1]*255.0, this.absorptionColor[2]*255.0];
    this.absorptionColorItem = parentFolder.addColor(this, 'absorption');
    var ME = this;
    this.absorptionColorItem.onChange( function(value) {
                            if (typeof value==='string' || value instanceof String)
                            {
                                var color = hexToRgb(value);
                                ME.absorptionColor[0] = color.r / 255.0;
                                ME.absorptionColor[1] = color.g / 255.0;
                                ME.absorptionColor[2] = color.b / 255.0;
                            }
                            else
                            {
                                ME.absorptionColor[0] = value[0] / 255.0;
                                ME.absorptionColor[1] = value[1] / 255.0;
                                ME.absorptionColor[2] = value[2] / 255.0;
                            }
                            snelly.reset(true);
                        } );

    this.absorptionScaleItem = parentFolder.add(this, 'absorptionScale', 0.0, 10.0*snelly.lengthScale);
    this.absorptionScaleItem.onChange( function(value) { snelly.camera.enabled = false; snelly.reset(true); } );
    this.absorptionScaleItem.onFinishChange( function(value) { snelly.camControls.enabled = true; } );

    this.specular = [this.specAlbedo[0]*255.0, this.specAlbedo[1]*255.0, this.specAlbedo[2]*255.0];
    this.specItem = parentFolder.addColor(this, 'specular');
    var ME = this;
    this.specItem.onChange( function(albedo) {
                                if (typeof albedo==='string' || albedo instanceof String)
                                {
                                    var color = hexToRgb(albedo);
                                    ME.specAlbedo[0] = color.r / 255.0;
                                    ME.specAlbedo[1] = color.g / 255.0;
                                    ME.specAlbedo[2] = color.b / 255.0;
                                }
                                else
                                {
                                    ME.specAlbedo[0] = albedo[0] / 255.0;
                                    ME.specAlbedo[1] = albedo[1] / 255.0;
                                    ME.specAlbedo[2] = albedo[2] / 255.0;
                                }
                                snelly.reset(true);
                            } );
}

Dielectric.prototype.eraseGui = function(parentFolder) 
{ 
    parentFolder.remove(this.roughnessItem);
    parentFolder.remove(this.specItem);
    parentFolder.remove(this.absorptionColorItem);
    parentFolder.remove(this.absorptionScaleItem);
}


//
// Simplest (but unphysical) model with no wavelength dependence
//
function ConstantDielectric(name, iorVal) 
{
    Dielectric.call(this, name);
    this.iorVal = iorVal;
}

ConstantDielectric.prototype = Object.create(Dielectric.prototype);

ConstantDielectric.prototype.ior = function()
{
    return `
uniform float _iorVal;
float IOR_DIELE(float wavelength_nm)  
{                     
    return _iorVal;   
}
    `;
}

ConstantDielectric.prototype.syncShader = function(shader)
{
    shader.uniformF("_iorVal", this.iorVal);
    Dielectric.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
ConstantDielectric.prototype.initGui = function(parentFolder)
{
    this.iorItem = parentFolder.add(this, 'iorVal', 0.0, 5.0);
    this.iorItem.onChange( function(value) { snelly.camControls.enabled = false; snelly.reset(true); } );
    this.iorItem.onFinishChange( function(value) { snelly.camControls.enabled = true; } );

    Dielectric.prototype.initGui.call(this, parentFolder)
}

ConstantDielectric.prototype.eraseGui = function(parentFolder)
{
    parentFolder.remove(this.iorItem);
    Dielectric.prototype.eraseGui.call(this, parentFolder)
}



// The standard Sellmeier model for dielectrics (model 1 at refractiveindex.info)
function SellmeierDielectric(name, coeffs) 
{
    Dielectric.call(this, name);
    this.coeffs = coeffs;
}

SellmeierDielectric.prototype = Object.create(Dielectric.prototype);

SellmeierDielectric.prototype.ior = function()
{
    var numTerms = (this.coeffs.length - 1)/2;
    var IOR_FORMULA = `1.0 + _C1 `;
    for (var t=1; t<=numTerms; ++t)
    {
        IOR_FORMULA += `+ _C${2*t}*l2/(l2 - _C${2*t+1}*_C${2*t+1})`;
    }

    // Defines a GLSL function which takes wavelength (in micrometres) and returns ior
    var uniforms = '';
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        uniforms += `uniform float _C${n};\n`
    }
    var code = `${uniforms}    
float IOR_DIELE(float wavelength_nm) 
{                                                                                            
    float wavelength_um = 1.0e-3*wavelength_nm;                                                                      
    float l2 = wavelength_um*wavelength_um;                                                                               
    float n2 = ${IOR_FORMULA}; 
    return max(sqrt(abs(n2)), 1.0e-3);                                                                     
}`;

    return code;
}

SellmeierDielectric.prototype.syncShader = function(shader)
{
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        shader.uniformF(`_C${n}`, this.coeffs[n-1]);
    }
    Dielectric.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
SellmeierDielectric.prototype.initGui  = function(parentFolder) { Dielectric.prototype.initGui.call(this, parentFolder) }
SellmeierDielectric.prototype.eraseGui = function(parentFolder) { Dielectric.prototype.eraseGui.call(this, parentFolder) }


// The standard Sellmeier model for dielectrics (model 2 at refractiveindex.info)
// coeffs array must have an odd number of elements (the constant, plus a pair per 'pole' term)
function Sellmeier2Dielectric(name, coeffs) 
{
    Dielectric.call(this, name);
    this.coeffs = coeffs;
}

Sellmeier2Dielectric.prototype = Object.create(Dielectric.prototype);

Sellmeier2Dielectric.prototype.ior = function()
{
    var numTerms = (this.coeffs.length - 1)/2;
    var IOR_FORMULA = `1.0 + _C1 `;
    for (var t=1; t<=numTerms; ++t)
    {
        IOR_FORMULA += `+ _C${2*t}*l2/(l2 - _C${2*t+1})`;
    }

    // Defines a GLSL function which takes wavelength (in nanometres) and returns ior
    var uniforms = '';
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        uniforms += `uniform float _C${n};\n`
    }
    var code = `${uniforms}    
float IOR_DIELE(float wavelength_nm) 
{                                                                                            
    float wavelength_um = 1.0e-3*wavelength_nm;                                                                      
    float l2 = wavelength_um*wavelength_um;                                                                               
    float n2 = ${IOR_FORMULA}; 
    return max(sqrt(abs(n2)), 1.0e-3);
}`;

    return code;
}

Sellmeier2Dielectric.prototype.syncShader = function(shader)
{
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        shader.uniformF(`_C${n}`, this.coeffs[n-1]);
    }
    Dielectric.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
Sellmeier2Dielectric.prototype.initGui  = function(parentFolder) { Dielectric.prototype.initGui.call(this, parentFolder) }
Sellmeier2Dielectric.prototype.eraseGui = function(parentFolder) { Dielectric.prototype.eraseGui.call(this, parentFolder) }



// Model 4 at Polyanskiy's refractiveindex.info:
function PolyanskiyDielectric(name, coeffs) 
{
    Dielectric.call(this, name);
    this.C1 = coeffs[0];
    this.C2 = coeffs[1];
    this.C3 = coeffs[2];
    this.C4 = coeffs[3];
    this.C5 = coeffs[4];
}

PolyanskiyDielectric.prototype = Object.create(Dielectric.prototype);

PolyanskiyDielectric.prototype.ior = function()
{
    var IOR_FORMULA = ' _C1 + _C2*pow(l, _C3)/(l*l - pow(_C4, _C5))';

    // Defines a GLSL function which takes wavelength (in nanometres) and returns ior
    var code = `
uniform float _C1;
uniform float _C2;
uniform float _C3;
uniform float _C4;
uniform float _C5;
float IOR_DIELE(float wavelength_nm)
{
    float wavelength_um = 1.0e-3*wavelength_nm;
    float l = wavelength_um;
    float n2 = ${IOR_FORMULA};
    return max(sqrt(abs(n2)), 1.0e-3);
}`;

    return code;
}

PolyanskiyDielectric.prototype.syncShader = function(shader)
{
    shader.uniformF('_C1', this.C1);
    shader.uniformF('_C2', this.C2);
    shader.uniformF('_C3', this.C3);
    shader.uniformF('_C4', this.C4);
    shader.uniformF('_C5', this.C5);
    Dielectric.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
PolyanskiyDielectric.prototype.initGui  = function(parentFolder) { Dielectric.prototype.initGui.call(this, parentFolder) }
PolyanskiyDielectric.prototype.eraseGui = function(parentFolder) { Dielectric.prototype.eraseGui.call(this, parentFolder) }


// Cauchy model for dielectrics (model 5 at refractiveindex.info)
function CauchyDielectric(name, coeffs) 
{
    Dielectric.call(this, name);
    this.coeffs = coeffs;
}

CauchyDielectric.prototype = Object.create(Dielectric.prototype);

CauchyDielectric.prototype.ior = function()
{
    var numTerms = (this.coeffs.length - 1)/2;
    var IOR_FORMULA = `_C1`;
    for (var t=1; t<=numTerms; ++t)
    {
        IOR_FORMULA += ` + _C${2*t}*pow(l, _C${2*t+1})`;
    }

    // Defines a GLSL function which takes wavelength (in nanometres) and returns ior
    var uniforms = '';
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        uniforms += `uniform float _C${n};\n`;
    }
    var code = `${uniforms}
float IOR_DIELE(float wavelength_nm)
{
    float wavelength_um = 1.0e-3*wavelength_nm;
    float l = wavelength_um;
    float n = ${IOR_FORMULA};
    return max(n, 1.0e-3);
}`;

    return code;
}

CauchyDielectric.prototype.syncShader = function(shader)
{
    for (var n=1; n<=this.coeffs.length; ++n)
    {
        shader.uniformF(`_C${n}`, this.coeffs[n-1]);
    }
    Dielectric.prototype.syncShader.call(this, shader);
}

// set up gui and callbacks for this material
CauchyDielectric.prototype.initGui  = function(parentFolder) { Dielectric.prototype.initGui.call(this, parentFolder) }
CauchyDielectric.prototype.eraseGui = function(parentFolder) { Dielectric.prototype.eraseGui.call(this, parentFolder) }



////////////////////////////////////////////////////
// Material manager
////////////////////////////////////////////////////

/** 
* This object controls the properties of the three basic material types:
*  - Dielectric (multiple different sub-types)
*  - Metal (multiple different sub-types)
*  - Surface (an uber-shader like materal)
* @constructor 
*/
var Materials = function()
{
    this.dielectrics = {}
    this.metals = {}
    this.dielectricObj = null;
    this.metalObj = null;
    {
        // Dielectrics
        this.addDielectric( new ConstantDielectric("Constant IOR dielectric", 1.5) ); 
        this.addDielectric( new SellmeierDielectric("Glass (BK7)",       [0.0, 1.03961212, 0.00600069867, 0.231792344, 0.0200179144, 1.01046945,  103.560653]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (K7)",       [0.0, 1.1273555,  0.00720341707, 0.124412303, 0.0269835916, 0.827100531, 100.384588]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (F5)",       [0.0, 1.3104463,  0.00958633048, 0.19603426,  0.0457627627, 0.96612977,  115.011883]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (LAFN7)",    [0.0, 1.66842615, 0.0103159999,  0.298512803, 0.0469216348, 1.0774376,   82.5078509]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (LASF35)",   [0.0, 2.45505861, 0.0135670404,  0.453006077, 0.054580302,  2.3851308,   167.904715]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (N-LAK33A)", [0.0, 1.44116999, 0.00680933877, 0.571749501, 0.0222291824, 1.16605226,  80.9379555]) );
        this.addDielectric( new SellmeierDielectric("Glass (N-FK51A)",   [0.0, 0.97124781, 0.00472301995, 0.216901417, 0.0153575612, 0.90465166,  168.68133]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (SF4)",      [0.0, 1.61957826, 0.0125502104,  0.339493189, 0.0544559822, 1.02566931,  117.652222]) );
        this.addDielectric( new Sellmeier2Dielectric("Glass (SF67)",     [0.0, 1.97464225, 0.0145772324,  0.467095921, 0.0669790359, 2.43154209,  157.444895]) );
        this.addDielectric( new Sellmeier2Dielectric("Water",            [0.0,        5.67252e-1, 5.08555046e-3, 1.736581e-1, 1.8149386e-2, 2.12153e-2, 2.61726e-2, 1.1384932e-1, 1.073888e1]) );
        this.addDielectric( new Sellmeier2Dielectric("Ethanol",          [0.0,        0.83189,    0.00930,       -0.15582,    -49.45200]) );
        this.addDielectric( new Sellmeier2Dielectric("Polycarbonate",    [0.0,        0.83189,    0.00930,       -0.15582,    -49.45200]) );
        this.addDielectric( new CauchyDielectric("Glycerol",             [1.45797, 0.00598, -2, -0.00036, -4]) );
        this.addDielectric( new CauchyDielectric("Liquid Crystal (E7)",  [1.4990,  0.0072,  -2,  0.0003,  -4]) );
        this.addDielectric( new SellmeierDielectric("Diamond",           [0.0,        0.3306,     0.175,         4.3356,      0.1060]) );
        this.addDielectric( new SellmeierDielectric("Quartz",            [0.0, 0.6961663, 0.0684043, 0.4079426, 0.1162414, 0.8974794, 9.896161]) );
        this.addDielectric( new SellmeierDielectric("Fused Silica",      [0.0,        0.6961663,  0.0684043,     0.4079426,  0.1162414, 0.8974794, 9.896161]) );
        this.addDielectric( new SellmeierDielectric("Sapphire",          [0.0,        1.5039759,  0.0740288,     0.55069141, 0.1216529, 6.5927379, 20.072248]) );
        this.addDielectric( new SellmeierDielectric("Sodium Chloride",   [0.00055,    0.19800,    0.050,         0.48398,     0.100,        0.38696,   0.128]) );
        this.addDielectric( new PolyanskiyDielectric("Proustite",        [7.483, 0.474, 0.0, 0.09, 1.0]) );
        this.addDielectric( new PolyanskiyDielectric("Rutile",           [5.913, 0.2441, 0.0, 0.0803, 1.0]) );
        this.addDielectric( new PolyanskiyDielectric("Silver Chloride",  [4.00804, 0.079086, 0.0, 0.04584, 1.0]) );

        // Metals
        this.addMetal( new TabulatedMetal("Aluminium",  tabulated_aluminium() ));
        this.addMetal( new TabulatedMetal("Brass",      tabulated_brass()     ));
        this.addMetal( new TabulatedMetal("Calcium",    tabulated_calcium()   ));
        this.addMetal( new TabulatedMetal("Chromium",   tabulated_chromium()  ));
        this.addMetal( new TabulatedMetal("Cobalt",     tabulated_cobalt()    ));
        this.addMetal( new TabulatedMetal("Copper",     tabulated_copper()    ));
        this.addMetal( new TabulatedMetal("Gold",       tabulated_gold()      ));
        this.addMetal( new TabulatedMetal("Iridium",    tabulated_iridium()   ));
        this.addMetal( new TabulatedMetal("Iron",       tabulated_iron()      ));
        this.addMetal( new TabulatedMetal("Lead",       tabulated_lead()      ));
        this.addMetal( new TabulatedMetal("Mercury",    tabulated_mercury()   ));
        this.addMetal( new TabulatedMetal("Molybdenum", tabulated_molybdenum()));
        this.addMetal( new TabulatedMetal("Nickel",     tabulated_nickel()    ));
        this.addMetal( new TabulatedMetal("Palladium",  tabulated_palladium() ));
        this.addMetal( new TabulatedMetal("Platinum",   tabulated_platinum()  ));
        this.addMetal( new TabulatedMetal("Silicon",    tabulated_silicon()   ));
        this.addMetal( new TabulatedMetal("Silver",     tabulated_silver()    ));
        this.addMetal( new TabulatedMetal("Titanium",   tabulated_titanium()  ));
        this.addMetal( new TabulatedMetal("Tungsten",   tabulated_tungsten()  ));
        this.addMetal( new TabulatedMetal("Vanadium",   tabulated_vanadium()  ));
        this.addMetal( new TabulatedMetal("Zinc",       tabulated_zinc()      ));
        this.addMetal( new TabulatedMetal("Zirconium",  tabulated_zirconium() ));

        // Surface (uber)
        this.surfaceObj = new Surface("Surface", "");

        // Volume
        this.volumeObj = new Volume("Volume", "");

        // Defaults:
        this.loadDielectric("Glass (BK7)");
        this.loadMetal("Aluminium");
    }
}

Materials.prototype.addDielectric = function(materialObj)
{
    this.dielectrics[materialObj.getName()] = materialObj;
}

Materials.prototype.getDielectrics = function()
{
    return this.dielectrics;
}

/**
* Load the desired Dielectric object by name. Supported dielectrics are:
*```glsl
*  "Constant IOR dielectric"
*  "Glass (BK7)"
*  "Glass (K7)"
*  "Glass (F5)"
*  "Glass (LAFN7)"
*  "Glass (LASF35)"
*  "Glass (N-LAK33A)"
*  "Glass (N-FK51A)"
*  "Glass (SF4)"
*  "Glass (SF67)"
*  "Water"
*  "Polycarbonate"
*  "Glycerol"
*  "Liquid Crystal (E7)"
*  "Diamond"
*  "Quartz"
*  "Fused Silica"
*  "Sapphire"
*  "Sodium Chloride"
*  "Proustite"
*  "Rutile"
*  "Silver Chloride"
*```
* @param {String} dielectricName - one of the names listed above
* @returns {Dielectric} - the loaded dielectric
*/
Materials.prototype.loadDielectric = function(dielectricName)
{
    this.dielectricObj = this.dielectrics[dielectricName];
    return this.dielectricObj;
}

Materials.prototype.getLoadedDielectric = function()
{
    return this.dielectricObj;
}

/**
* Get the currently loaded Dielectric object.
* @returns {Dielectric}
*/
Materials.prototype.getDielectric = function()
{
    return this.getLoadedDielectric();
}


Materials.prototype.addMetal = function(materialObj)
{
    this.metals[materialObj.getName()] = materialObj;
}

Materials.prototype.getMetals = function()
{
    return this.metals;
}

/**
* Load the desired Metal object by name. Supported metals are:
*```
*  "Aluminium"
*  "Brass"
*  "Calcium"
*  "Chromium"
*  "Cobalt"  
*  "Copper"  
*  "Gold"    
*  "Iridium"
*  "Iron"    
*  "Lead"    
*  "Mercury" 
*  "Molybdenum"
*  "Nickel"
*  "Palladium"
*  "Platinum"
*  "Silicon"
*  "Silver" 
*  "Titanium"
*  "Tungsten"
*  "Vanadium"
*  "Zinc" 
*  "Zirconium"
*```
* @param {String} metalName - one of the names listed above
* @returns {Metal} - the loaded metal
*/
Materials.prototype.loadMetal = function(metalName)
{
    this.metalObj = this.metals[metalName];
    return this.metalObj;
}

Materials.prototype.getLoadedMetal = function()
{
    return this.metalObj;
}

/**
* Get the currently loaded Metal object.
* @returns {Metal}
*/
Materials.prototype.getMetal = function()
{
    return this.getLoadedMetal();
}


Materials.prototype.loadSurface  = function()
{
    return this.surfaceObj;
}

/**
* Get the Surface object.
* @returns {Surface}
*/
Materials.prototype.getSurface  = function()
{
    return this.surfaceObj;
}

Materials.prototype.loadVolume  = function()
{
    return this.volumeObj;
}

/**
* Get the Volume object.
* @returns {Surface}
*/
Materials.prototype.getVolume  = function()
{
    return this.volumeObj;
}


// Upload current material parameters
Materials.prototype.syncShader  = function(program)
{
    if (this.metalObj      !== null) this.metalObj.syncShader(program);
    if (this.dielectricObj !== null) this.dielectricObj.syncShader(program);
    if (this.surfaceObj    !== null) this.surfaceObj.syncShader(program);
    if (this.volumeObj     !== null) this.volumeObj.syncShader(program);
}

    