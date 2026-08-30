/* ============================================================
   Jalamrit — Sponge City Risk Detector
   Frontend logic. Talks to the Flask backend (see /backend/app.py)
   for risk data, predictions, and citizen reports.
   ============================================================ */

const API_BASE = 'http://localhost:5000';

const CAT_COLOR = {L:'#2E8B57', M:'#E0A430', H:'#D9743A', C:'#D64550'};
const CAT_NAME  = {L:'Low', M:'Moderate', H:'High', C:'Critical'};
const REC_NAME = {
  none:'No intervention needed',
  rain_garden:'Rain garden / bioswale',
  permeable_pavement:'Permeable pavement',
  recharge_well:'Groundwater recharge well'
};

// Named localities for the Predict dropdown (approx coordinates within the zone)
const LOCALITIES = [
  {name:"ORR Corridor, Bellandur", lat:12.9293, lon:77.6464},
  {name:"Bellandur Lake area",     lat:12.9297, lon:77.6628},
  {name:"HSR Layout Sector 2",     lat:12.9146, lon:77.6382},
  {name:"Green Glen Layout",       lat:12.9265, lon:77.6529},
  {name:"Sarjapur Road Junction",  lat:12.9109, lon:77.6721},
];

let RISK_DATA = [];  // populated from /api/risk-data on load

/* ---------- Tab switching ---------- */
function goToTab(tabName){
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabName));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+tabName).classList.add('active');
  if(tabName==='report') renderPublicFeed();
  if(tabName==='gov') renderGovFeed();
  if(tabName==='map'){
    renderStats();
    if(!map){
      try{ initMap(); }
      catch(e){ console.error('Map failed to load (check network/CDN access):', e); }
    } else {
      setTimeout(()=>map.invalidateSize(), 50);
    }
  }
}
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=> goToTab(btn.dataset.tab));
});

/* ---------- Load risk data from backend ---------- */
async function loadRiskData(){
  try{
    const res = await fetch(`${API_BASE}/api/risk-data`);
    if(!res.ok) throw new Error('Failed to fetch risk data');
    RISK_DATA = await res.json();
    console.log(`Loaded ${RISK_DATA.length} grid cells from backend`);
  }catch(err){
    console.error('Could not load risk data from backend. Is the Flask server running on port 5000?', err);
  }
}

/* ---------- Map ---------- */
let map = null, cellLayer;
function initMap(){
  if(RISK_DATA.length === 0){
    console.warn('Risk data not loaded yet — map will be empty until it loads.');
  }
  map = L.map('map').setView([12.921, 77.655], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap contributors', maxZoom:18
  }).addTo(map);

  const half = 0.00045;
  cellLayer = L.layerGroup().addTo(map);
  RISK_DATA.forEach(d=>{
    const bounds=[[d.lat-half, d.lon-half],[d.lat+half, d.lon+half]];
    const rect = L.rectangle(bounds, {
      color:CAT_COLOR[d.cat], weight:0, fillColor:CAT_COLOR[d.cat],
      fillOpacity: d.cat==='L' ? 0.18 : 0.65
    });
    rect.on('click', ()=> showCellDetail(d));
    rect.addTo(cellLayer);
  });
}

function showCellDetail(d){
  document.getElementById('cellDetail').innerHTML = `
    <div style="margin-bottom:8px;"><span class="badge badge-${d.cat}">${CAT_NAME[d.cat]}</span></div>
    <div class="stat-block"><span>Risk score</span><span class="stat-num">${d.score}</span></div>
    <div class="stat-block"><span>Elevation</span><span>${d.elev} m</span></div>
    <div class="stat-block"><span>Impervious</span><span>${Math.round(d.imp*100)}%</span></div>
    <div class="stat-block"><span>Dist. to water</span><span>${d.dist} m</span></div>
    <div style="margin-top:10px;font-weight:600;color:var(--midnight);">Recommendation:</div>
    <div>${REC_NAME[d.rec] || d.rec}</div>
  `;
}

function renderStats(){
  if(RISK_DATA.length === 0) return;
  const counts = {L:0,M:0,H:0,C:0};
  RISK_DATA.forEach(d=>counts[d.cat]++);
  const total = RISK_DATA.length;
  const el = document.getElementById('statsList');
  el.innerHTML = ['L','M','H','C'].map(c=>{
    const pct = ((counts[c]/total)*100).toFixed(1);
    return `<div class="stat-block"><span>${CAT_NAME[c]}</span><span class="stat-num">${counts[c]} <span style="font-size:11px;color:var(--ink-muted);font-family:Inter;">(${pct}%)</span></span></div>`;
  }).join('') + `<div class="stat-block"><span>Total cells</span><span class="stat-num">${total}</span></div>`;
}

/* ---------- Predict tab (calls backend /api/predict) ---------- */
function droplGaugeSVG(score, color){
  const pct = Math.max(0, Math.min(1, score));
  const fillY = 150 - (pct*130) - 10;
  return `
  <svg class="droplet-gauge" viewBox="0 0 120 150">
    <defs>
      <clipPath id="dropClip"><path d="M60 5C60 5 15 70 15 105a45 45 0 0090 0C105 70 60 5 60 5z"/></clipPath>
    </defs>
    <path d="M60 5C60 5 15 70 15 105a45 45 0 0090 0C105 70 60 5 60 5z" fill="#fff" stroke="${color}" stroke-width="3"/>
    <g clip-path="url(#dropClip)">
      <rect x="0" y="${fillY}" width="120" height="150" fill="${color}" opacity="0.85"/>
    </g>
    <text x="60" y="112" text-anchor="middle" font-family="Newsreader,serif" font-weight="700" font-size="26" fill="${pct>0.45?'#fff':'#16213E'}">${Math.round(pct*100)}%</text>
  </svg>`;
}

async function showPrediction(lat, lon, label){
  const resultEl = document.getElementById('predictResult');
  resultEl.innerHTML = `<div style="margin:20px 0;color:var(--ink-muted);font-size:13.5px;">Checking risk…</div>`;

  try{
    const res = await fetch(`${API_BASE}/api/predict?lat=${lat}&lon=${lon}`);
    if(!res.ok) throw new Error('Prediction request failed');
    const p = await res.json();

    const color = CAT_COLOR[p.category];
    resultEl.innerHTML = `
      <div style="margin:20px 0 8px;font-size:13px;color:var(--ink-muted);">
        ${label} — nearest assessed point ${p.nearest_point_distance_m}m away
      </div>
      <div class="result-panel">
        ${droplGaugeSVG(p.score, color)}
        <div class="result-text">
          <h2><span class="badge badge-${p.category}">${p.category_label} Risk</span></h2>
          <div class="rec-line"><b>Recommended action:</b> ${p.recommendation_label}</div>
          <div class="factor-row">
            <div class="factor"><b>${p.elevation_m} m</b>Elevation</div>
            <div class="factor"><b>${p.impervious_pct}%</b>Impervious surface</div>
            <div class="factor"><b>${p.distance_to_water_m} m</b>Distance to water</div>
          </div>
        </div>
      </div>
    `;
  }catch(err){
    console.error('Prediction failed:', err);
    resultEl.innerHTML = `<div style="margin:20px 0;color:var(--red);font-size:13.5px;">
      Could not reach the prediction service. Is the backend running on port 5000?
    </div>`;
  }
}

/* ---------- Report form (POST to backend with photo upload) ---------- */
let selectedPhotoFile = null;

function setupReportForm(){
  const dropzone = document.getElementById('dropzone');
  const photoInput = document.getElementById('photoInput');
  dropzone.addEventListener('click', ()=> photoInput.click());
  photoInput.addEventListener('change', handleFile);
  dropzone.addEventListener('dragover', e=>{e.preventDefault(); dropzone.style.borderColor='#1C7293';});
  dropzone.addEventListener('drop', e=>{
    e.preventDefault();
    if(e.dataTransfer.files[0]){ photoInput.files = e.dataTransfer.files; handleFile(); }
  });

  function handleFile(){
    const file = photoInput.files[0];
    if(!file) return;
    selectedPhotoFile = file;
    const reader = new FileReader();
    reader.onload = ()=>{
      dropzone.innerHTML = `<img src="${reader.result}" alt="preview"><div style="margin-top:8px;font-size:12px;">Tap to change photo</div>`;
    };
    reader.readAsDataURL(file);
  }

  document.getElementById('reportForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const locality = document.getElementById('reportLocality').value;
    const desc = document.getElementById('reportDesc').value;
    if(!locality || !desc){ alert('Please fill in the area and description.'); return; }

    const formData = new FormData();
    formData.append('locality', locality);
    formData.append('description', desc);
    if(selectedPhotoFile) formData.append('photo', selectedPhotoFile);

    try{
      const res = await fetch(`${API_BASE}/api/reports`, { method:'POST', body: formData });
      if(!res.ok){
        const errBody = await res.json().catch(()=>({}));
        throw new Error(errBody.error || 'Submission failed');
      }
      e.target.reset();
      dropzone.innerHTML = '<span id="dropzoneText">Tap to choose a photo, or drag one here</span>';
      selectedPhotoFile = null;
      renderPublicFeed();
      alert('Report submitted. Thank you — your ward office can now see this.');
    }catch(err){
      console.error('Report submission error:', err);
      alert('Something went wrong submitting your report. Is the backend running? ' + err.message);
    }
  });
}

/* ---------- Load + render reports (GET from backend) ---------- */
async function loadAllReports(){
  try{
    const res = await fetch(`${API_BASE}/api/reports`);
    if(!res.ok) throw new Error('Failed to fetch reports');
    return await res.json();
  }catch(err){
    console.error('Could not load reports:', err);
    return [];
  }
}

function reportCardHTML(r, showActions){
  const photoHTML = r.photo_url
    ? `<img src="${API_BASE}${r.photo_url}" alt="report photo">`
    : `<div class="no-photo">No photo</div>`;
  const statusLabel = {pending:'Pending', verified:'Red Alert', review:'Under Review', resolved:'Resolved'}[r.status] || 'Pending';
  const statusClass = {pending:'badge-status-pending', verified:'badge-status-verified', review:'badge-status-review', resolved:'badge-status-resolved'}[r.status] || 'badge-status-pending';
  const date = new Date(r.created_at).toLocaleString();

  let actions = '';
  if(showActions){
    actions = `
      <div class="gov-actions">
        <button onclick="setStatus('${r.id}','verified')">Mark Red Alert</button>
        <button onclick="setStatus('${r.id}','review')">Under Review</button>
        <button onclick="setStatus('${r.id}','resolved')">Resolved</button>
      </div>`;
  }

  return `
    <div class="report-card">
      ${photoHTML}
      <div class="report-meta">
        <div class="top-row">
          <h4>${r.locality}</h4>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        <p>${r.description}</p>
        <div class="ts">${date}</div>
        ${actions}
      </div>
    </div>`;
}

async function renderPublicFeed(){
  const el = document.getElementById('publicFeed');
  const reports = await loadAllReports();
  if(reports.length===0){ el.innerHTML = '<div class="empty-msg">No reports yet — be the first.</div>'; return; }
  el.innerHTML = reports.slice(0,10).map(r=>reportCardHTML(r,false)).join('');
}

async function renderGovFeed(){
  const el = document.getElementById('govFeed');
  const reports = await loadAllReports();

  document.getElementById('statTotal').textContent = reports.length;
  document.getElementById('statPending').textContent = reports.filter(r=>r.status==='pending').length;
  document.getElementById('statRed').textContent = reports.filter(r=>r.status==='verified').length;
  document.getElementById('statResolved').textContent = reports.filter(r=>r.status==='resolved').length;

  if(reports.length===0){ el.innerHTML = '<div class="empty-msg">No reports submitted yet.</div>'; return; }
  el.innerHTML = reports.map(r=>reportCardHTML(r,true)).join('');
}

async function setStatus(id, status){
  try{
    const res = await fetch(`${API_BASE}/api/reports/${id}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({status})
    });
    if(!res.ok) throw new Error('Status update failed');
    renderGovFeed();
  }catch(e){
    console.error('Failed to update status:', e);
    alert('Could not update status. Please try again.');
  }
}

/* ---------- Hero: title letters + 3D globe ---------- */
function setupHeroTitle(){
  const el = document.getElementById('heroTitle');
  const word = 'Jalamrit';
  el.innerHTML = word.split('').map((ch,i)=>
    `<span style="animation-delay:${0.15 + i*0.07}s">${ch}</span>`
  ).join('');
}

function setupGlobe(){
  const canvas = document.getElementById('globeCanvas');
  const hero = document.getElementById('hero');
  if(!window.THREE || !canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, hero.clientWidth/hero.clientHeight, 0.1, 1000);
  camera.position.set(0, 0.3, 12.5);

  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(hero.clientWidth, hero.clientHeight);

  const globeGroup = new THREE.Group();
  const EARTH_R = 4.4;
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';

  const earthTexture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
  const earthGeo = new THREE.SphereGeometry(EARTH_R, 64, 64);
  const earthMat = new THREE.MeshPhongMaterial({
    map: earthTexture, shininess:6, specular:0x223344
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  globeGroup.add(earthMesh);

  const cloudTexture = loader.load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png');
  const cloudGeo = new THREE.SphereGeometry(EARTH_R*1.012, 64, 64);
  const cloudMat = new THREE.MeshLambertMaterial({
    map: cloudTexture, transparent:true, opacity:0.55, depthWrite:false
  });
  const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
  globeGroup.add(cloudMesh);

  const atmoGeo = new THREE.SphereGeometry(EARTH_R*1.06, 64, 64);
  const atmoMat = new THREE.ShaderMaterial({
    transparent:true, side:THREE.BackSide, blending:THREE.AdditiveBlending,
    uniforms:{ glowColor:{ value:new THREE.Color(0x4FA8C9) } },
    vertexShader:`
      varying float intensity;
      void main(){
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vNormel = normalize(normalMatrix * vec3(0.,0.,1.));
        intensity = pow(0.68 - dot(vNormal, vNormel), 3.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader:`
      uniform vec3 glowColor;
      varying float intensity;
      void main(){
        gl_FragColor = vec4(glowColor, 1.0) * intensity;
      }`
  });
  globeGroup.add(new THREE.Mesh(atmoGeo, atmoMat));

  function latLonToXYZ(lat, lon, r){
    const phi = (90-lat)*(Math.PI/180);
    const theta = (lon+180)*(Math.PI/180);
    return new THREE.Vector3(
      -r*Math.sin(phi)*Math.cos(theta),
       r*Math.cos(phi),
       r*Math.sin(phi)*Math.sin(theta)
    );
  }
  const cities = [
    {lat:12.97,lon:77.59,name:'Bengaluru'}, {lat:17.38,lon:78.49,name:'Hyderabad'},
    {lat:18.52,lon:73.86,name:'Pune'}, {lat:13.08,lon:80.27,name:'Chennai'}
  ];
  const markerRings = [];
  cities.forEach(c=>{
    const pos = latLonToXYZ(c.lat, c.lon, EARTH_R*1.02);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshBasicMaterial({color:0xFFC857})
    );
    dot.position.copy(pos);
    globeGroup.add(dot);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.09, 24),
      new THREE.MeshBasicMaterial({color:0xFFC857, transparent:true, opacity:0.7, side:THREE.DoubleSide})
    );
    ring.position.copy(pos);
    ring.lookAt(pos.clone().multiplyScalar(2));
    globeGroup.add(ring);
    markerRings.push(ring);
  });

  globeGroup.rotation.x = 0.22;
  globeGroup.rotation.y = -1.9;
  scene.add(globeGroup);

  scene.add(new THREE.AmbientLight(0x334455, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 2, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4a6a8a, 0.35);
  fill.position.set(-6,-2,-4);
  scene.add(fill);

  const starCount = 500;
  const starPos = new Float32Array(starCount*3);
  for(let i=0;i<starCount;i++){
    const r = 30 + Math.random()*40;
    const theta = Math.random()*Math.PI*2, phi = Math.acos(2*Math.random()-1);
    starPos[i*3]   = r*Math.sin(phi)*Math.cos(theta);
    starPos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    starPos[i*3+2] = r*Math.cos(phi) - 15;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
  const starMat = new THREE.PointsMaterial({color:0xffffff, size:0.045, transparent:true, opacity:0.7, sizeAttenuation:true});
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  let targetRotX = 0.22, targetRotY = -1.9;
  hero.addEventListener('mousemove', (e)=>{
    const rect = hero.getBoundingClientRect();
    const mouseX = ((e.clientX-rect.left)/rect.width - 0.5);
    const mouseY = ((e.clientY-rect.top)/rect.height - 0.5);
    targetRotY = -1.9 + mouseX*0.35;
    targetRotX = 0.22 + mouseY*0.15;
  });

  let t = 0;
  function animate(){
    requestAnimationFrame(animate);
    t += 0.01;
    globeGroup.rotation.y += 0.0016;
    globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x)*0.03;
    cloudMesh.rotation.y += 0.0009;
    markerRings.forEach((ring,i)=>{
      const s = 1 + 0.35*Math.abs(Math.sin(t*1.3 + i));
      ring.scale.set(s,s,s);
    });
    stars.rotation.y += 0.00012;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', ()=>{
    if(document.getElementById('view-home').classList.contains('active')){
      camera.aspect = hero.clientWidth/hero.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(hero.clientWidth, hero.clientHeight);
    }
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  setupHeroTitle();
  setupGlobe();
  document.getElementById('enterAppBtn').addEventListener('click', ()=> goToTab('map'));
  setupReportForm();

  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {threshold:0.15});
  document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));

  const topbar = document.querySelector('header.topbar');
  document.addEventListener('scroll', ()=>{
    topbar.classList.toggle('scrolled', window.scrollY > 40);
  }, {passive:true});

  const sel = document.getElementById('localitySelect');
  LOCALITIES.forEach((loc,i)=>{
    const opt=document.createElement('option'); opt.value=i; opt.textContent=loc.name;
    sel.appendChild(opt);
  });

  document.getElementById('predictBtn').addEventListener('click', ()=>{
    const idx = sel.value;
    if(idx===''){ alert('Please choose a locality first.'); return; }
    const loc = LOCALITIES[idx];
    showPrediction(loc.lat, loc.lon, loc.name);
  });

  document.getElementById('geoBtn').addEventListener('click', ()=>{
    if(!navigator.geolocation){ alert('Geolocation not supported on this device.'); return; }
    navigator.geolocation.getCurrentPosition(
      pos=> showPrediction(pos.coords.latitude, pos.coords.longitude, 'Your location'),
      ()=> alert('Could not get your location. Please select a locality instead.')
    );
  });

  // Load risk data once at startup (needed for the map)
  await loadRiskData();
});
