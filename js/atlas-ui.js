import * as THREE from 'three';
import { canvas, scene, camera, mapCamera } from './scene.js';
import { state } from './state.js';
import { elevToHeightKm } from './color-map.js';
import { KOPPEN_CLASSES } from './koppen.js';

let api, enabled=false, level='global', location=null, globe, map, signature='', lastData, lastFields, previous, comparison;
const raycaster=new THREE.Raycaster();
const panel=document.createElement('details');
panel.innerHTML=`<summary>Atlas do mundo · experimental</summary>
<label><input id="atlasEnabled" type="checkbox"> Ativar grade cartográfica</label>
<label for="atlasLevel">Escala cartográfica</label>
<select id="atlasLevel"><option value="global">Global · ~966 km</option><option value="regional">Regional · ~138 km (seleção)</option></select>
<p>Com a grade ativa, clique/toque para inspecionar. Ctrl-clique e modo lápis continuam editando placas.</p>
<output id="atlasInfo" aria-live="polite">Selecione uma posição no planeta.</output>`;
panel.className='atlas-panel';
document.querySelector('#viewMode').closest('details').after(panel);
const output=panel.querySelector('output');
function dispose(object) { if(object){scene.remove(object);object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});} }
function lines(values,color) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));
    return new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,depthTest:true,transparent:true,opacity:.7}));
}
function rebuild() {
    dispose(globe);dispose(map);globe=new THREE.Group();map=new THREE.Group();
    const selected=location && api.locate(location.latDeg,location.lonDeg,level);
    const ids=level==='global'?api.globalCells():selected?api.regionalCells(selected):[];
    const g=[],m=[],sg=[],sm=[];
    for(const id of ids) {
        const b=api.boundary(id), gv=id===selected?sg:g, mv=id===selected?sm:m;
        for(let i=0;i<b.length;i++) {
            const a=b[i],z=b[(i+1)%b.length];
            // Densification keeps globe edges near the spherical surface.
            const av=new THREE.Vector3(...api.direction(...a)),bv=new THREE.Vector3(...api.direction(...z));
            for(let j=0;j<8;j++) {
                const u=av.clone().lerp(bv,j/8).normalize(),v=av.clone().lerp(bv,(j+1)/8).normalize();
                gv.push(...u.multiplyScalar(1.085).toArray(),...v.multiplyScalar(1.085).toArray());
                const p=api.fromDirection(u.x,u.y,u.z),q=api.fromDirection(v.x,v.y,v.z);
                for(const [s,t] of api.projectSegment([p.latDeg,p.lonDeg],[q.latDeg,q.lonDeg],state.mapCenterLon*180/Math.PI)) mv.push(s[0],s[1],.1,t[0],t[1],.1);
            }
        }
    }
    globe.add(lines(g,0x65d9e8),lines(sg,0xffd45c));map.add(lines(m,0x65d9e8),lines(sm,0xffd45c));
    scene.add(globe,map);
}
function report() {
    if(!location || !state.curData) return;
    const start=performance.now(), id=api.locate(location.latDeg,location.lonDeg,level), cell=api.cellInfo(id);
    const data=api.sampleCell(id,state.curData,elevToHeightKm);
    const globalId=api.locate(location.latDeg,location.lonDeg,'global');
    const regionalBase=level==='global'?data:api.sampleCell(globalId,state.curData,elevToHeightKm);
    const rows=[cell.id,`Nível H3 ${cell.resolution} · ${level==='global'?'global':'regional'}`,
        `Centro: ${cell.center.latDeg.toFixed(3)}°, ${cell.center.lonDeg.toFixed(3)}°`,
        `Área: ${cell.areaKm2.toFixed(0)} km² · esfera terrestre`,
        `Terra: ${(100*data.landFraction).toFixed(1)}% · altitude: ${data.elevationMeanM.toFixed(0)} m`,
        data.temperatureMeanC===undefined?'Clima ainda não calculado':`Temperatura média sazonal: ${data.temperatureMeanC.toFixed(1)} °C`,
        data.precipitationIndex===undefined?'':`Chuva: índice ${data.precipitationIndex.toFixed(3)} (normalizado)`,
        data.koppenIndex===undefined?'':`Köppen modal: ${KOPPEN_CLASSES[data.koppenIndex]?.code}`,
        `Referência global: ${globalId} · ${regionalBase.elevationMeanM.toFixed(0)} m · ${(100*regionalBase.landFraction).toFixed(1)}% terra`,
        `${data.samples} amostras · ${data.simulationRegions.toLocaleString('pt-BR')} regiões físicas · ${(performance.now()-start).toFixed(1)} ms`,
        `Vizinhos: ${cell.neighborIds.join(', ')}`,
        'Fonte: Orogen · area-quadrature-nearest-v1 · atlas-h3-v1. Zoom não aumenta a precisão física.'];
    if(previous?.id!==id) comparison=undefined;
    else if(previous.regions!==data.simulationRegions) comparison=previous;
    if(comparison) rows.push(`Δ após Detail (${comparison.regions} → ${data.simulationRegions} regiões): altitude ${(data.elevationMeanM-comparison.elevation).toFixed(1)} m; terra ${(100*(data.landFraction-comparison.land)).toFixed(1)} pontos percentuais`);
    previous={id,regions:data.simulationRegions,elevation:data.elevationMeanM,land:data.landFraction};
    output.textContent=rows.filter(Boolean).join('\n');
}
panel.querySelector('input').addEventListener('change',async e=>{
    enabled=e.target.checked;
    if(enabled && !api) {output.textContent='Carregando índice H3…';try{api=await import('./world-atlas.js');}catch(error){enabled=false;e.target.checked=false;output.textContent=`Falha ao carregar atlas: ${error.message}`;return;}}
    signature=''; if(enabled) {rebuild();report();if(!location)output.textContent='Selecione uma posição no planeta.';}
});
panel.querySelector('select').addEventListener('change',e=>{level=e.target.value;if(enabled&&api){rebuild();report();}});
let down, multitouch=false;
const pointers=new Set();
canvas.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);if(pointers.size>1)multitouch=true;down={x:e.clientX,y:e.clientY,id:e.pointerId};});
canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);down=null;if(!pointers.size)multitouch=false;});
canvas.addEventListener('pointerup',e=>{
    pointers.delete(e.pointerId);const skip=multitouch;if(!pointers.size)multitouch=false;
    if(!enabled||!api||!state.curData||!down||skip||down.id!==e.pointerId||e.button!==0||e.ctrlKey||state.editMode||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
    down=null;
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),state.mapMode?mapCamera:camera);
    if(state.mapMode){
        const p=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Vector3());
        if(!p||Math.abs(p.y)>1||Math.abs(p.x)>2)return;
        location=api.normalizeLocation(p.y*90,p.x*90+state.mapCenterLon*180/Math.PI);
    }else{
        if(!state.planetMesh)return;
        state.planetMesh.updateMatrixWorld();
        const ray=raycaster.ray.clone().applyMatrix4(state.planetMesh.matrixWorld.clone().invert());
        const p=ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(),1),new THREE.Vector3());
        if(!p)return;location=api.fromDirection(p.x,p.y,p.z);
    }
    rebuild();report();
});
export function tickAtlas() {
    if(!api)return;
    const next=`${enabled}:${level}:${state.mapCenterLon}`;
    if(enabled&&next!==signature){signature=next;rebuild();}
    const fields=[state.curData?.r_elevation,state.curData?.r_temperature_summer,state.curData?.r_precip_summer];
    if(enabled&&(lastData!==state.curData||!lastFields||fields.some((x,i)=>x!==lastFields[i]))){lastData=state.curData;lastFields=fields;report();}
    if(globe){globe.visible=enabled&&!state.mapMode;globe.quaternion.copy(state.planetMesh?.quaternion || new THREE.Quaternion());}
    if(map)map.visible=enabled&&state.mapMode;
}
// Refresh climate/reapply updates that mutate curData in place, only when the user opens the panel.
panel.addEventListener('toggle',()=>{if(panel.open&&enabled&&api)report();});
