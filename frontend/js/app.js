/* ============================================================
   Jalamrit — Sponge City Risk Detector
   Frontend logic. Talks to the Flask backend (see /backend/app.py)
   for risk data, predictions, and citizen reports.
   ============================================================ */

const API_BASE = 'http://localhost:5000';

const CAT_COLOR = {
  L: '#2E8B57',
  M: '#E0A430',
  H: '#D9743A',
  C: '#D64550'
};

const CAT_NAME = {
  L: 'Low',
  M: 'Moderate',
  H: 'High',
  C: 'Critical'
};

const REC_NAME = {
  none: 'No intervention needed',
  rain_garden: 'Rain garden / bioswale',
  permeable_pavement: 'Permeable pavement',
  recharge_well: 'Groundwater recharge well'
};


// Named localities for the Predict dropdown
const LOCALITIES = [
  {
    name: "ORR Corridor, Bellandur",
    lat: 12.9293,
    lon: 77.6464
  },
  {
    name: "Bellandur Lake area",
    lat: 12.9297,
    lon: 77.6628
  },
  {
    name: "HSR Layout Sector 2",
    lat: 12.9146,
    lon: 77.6382
  },
  {
    name: "Green Glen Layout",
    lat: 12.9265,
    lon: 77.6529
  },
  {
    name: "Sarjapur Road Junction",
    lat: 12.9109,
    lon: 77.6721
  }
];


let RISK_DATA = [];


/* ============================================================
   TAB SWITCHING
   ============================================================ */

function goToTab(tabName) {

  document
    .querySelectorAll('nav.tabs button')
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.tab === tabName
      );
    });


  document
    .querySelectorAll('.view')
    .forEach(view => {
      view.classList.remove('active');
    });


  const targetView =
    document.getElementById('view-' + tabName);

  if (targetView) {
    targetView.classList.add('active');
  }


  if (tabName === 'report') {
    renderPublicFeed();
  }


  if (tabName === 'gov') {
    renderGovFeed();
  }


  if (tabName === 'map') {

    renderStats();

    if (!map) {

      try {
        initMap();
      }

      catch (e) {
        console.error(
          'Map failed to load:',
          e
        );
      }

    }

    else {

      setTimeout(() => {
        map.invalidateSize();
      }, 50);

    }

  }

}


document
  .querySelectorAll('nav.tabs button')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => goToTab(button.dataset.tab)
    );

  });


/* ============================================================
   LOAD RISK DATA FROM BACKEND
   ============================================================ */

async function loadRiskData() {

  try {

    const res =
      await fetch(
        `${API_BASE}/api/risk-data`
      );


    if (!res.ok) {
      throw new Error(
        'Failed to fetch risk data'
      );
    }


    RISK_DATA =
      await res.json();


    console.log(
      `Loaded ${RISK_DATA.length} grid cells from backend`
    );

  }

  catch (err) {

    console.error(
      'Could not load risk data from backend. ' +
      'Is the Flask server running on port 5000?',
      err
    );

  }

}


/* ============================================================
   MAP
   ============================================================ */

let map = null;
let cellLayer;


function initMap() {

  if (RISK_DATA.length === 0) {

    console.warn(
      'Risk data not loaded yet — map will be empty until it loads.'
    );

  }


  map =
    L.map('map')
      .setView(
        [12.921, 77.655],
        14
      );


  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution:
        '© OpenStreetMap contributors',
      maxZoom: 18
    }
  ).addTo(map);


  const half = 0.00045;


  cellLayer =
    L.layerGroup().addTo(map);


  RISK_DATA.forEach(d => {

    const bounds = [
      [
        d.lat - half,
        d.lon - half
      ],
      [
        d.lat + half,
        d.lon + half
      ]
    ];


    const rect =
      L.rectangle(
        bounds,
        {
          color: CAT_COLOR[d.cat],
          color: '#ffffff',
          weight: 0.5,
          fillColor: CAT_COLOR[d.cat],
          fillOpacity:
            d.cat === 'L'
              ? 0.18
              : 0.65
        }
      );


    rect.on(
      'click',
      () => showCellDetail(d)
    );


    rect.addTo(cellLayer);

  });

  const REC_ICON = {
    rain_garden: '🌱',
    permeable_pavement: '🧱',
    recharge_well: '⛲'
  };

  const interventionLayer = L.layerGroup().addTo(map);

  RISK_DATA.forEach(d => {
    if (!REC_ICON[d.rec]) return;
    const icon = L.divIcon({
      className: 'intervention-marker',
      html: `<span title="${REC_NAME[d.rec] || d.rec}">${REC_ICON[d.rec]}</span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    const marker = L.marker([d.lat, d.lon], { icon, interactive: true });
    marker.on('click', () => showCellDetail(d));
    marker.addTo(interventionLayer);
  });

  L.control.layers(null, { 'Recommended fixes': interventionLayer }, { collapsed: false, position: 'bottomright' }).addTo(map);

}


function showCellDetail(d) {

  document.getElementById(
    'cellDetail'
  ).innerHTML = `

    <div style="margin-bottom:8px;">
      <span class="badge badge-${d.cat}">
        ${CAT_NAME[d.cat]}
      </span>
    </div>

    <div class="stat-block">
      <span>Risk score</span>
      <span class="stat-num">
        ${d.score}
      </span>
    </div>

    <div class="stat-block">
      <span>Elevation</span>
      <span>
        ${d.elev} m
      </span>
    </div>

    <div class="stat-block">
      <span>Impervious</span>
      <span>
        ${Math.round(d.imp * 100)}%
      </span>
    </div>

    <div class="stat-block">
      <span>Dist. to water</span>
      <span>
        ${d.dist} m
      </span>
    </div>

    <div
      style="
        margin-top:10px;
        font-weight:600;
        color:var(--midnight);
      "
    >
      Recommendation:
    </div>

    <div>
      ${REC_NAME[d.rec] || d.rec}
    </div>

  `;

}


function renderStats() {

  if (RISK_DATA.length === 0) {
    return;
  }


  const counts = {
    L: 0,
    M: 0,
    H: 0,
    C: 0
  };


  RISK_DATA.forEach(d => {
    counts[d.cat]++;
  });


  const total =
    RISK_DATA.length;


  const el =
    document.getElementById(
      'statsList'
    );


  el.innerHTML =
    ['L', 'M', 'H', 'C']
      .map(c => {

        const pct =
          (
            (counts[c] / total) *
            100
          ).toFixed(1);


        return `
          <div class="stat-block">
            <span>
              ${CAT_NAME[c]}
            </span>

            <span class="stat-num">
              ${counts[c]}

              <span
                style="
                  font-size:11px;
                  color:var(--ink-muted);
                  font-family:Inter;
                "
              >
                (${pct}%)
              </span>

            </span>
          </div>
        `;

      })
      .join('');


  el.innerHTML += `
    <div class="stat-block">
      <span>Total cells</span>
      <span class="stat-num">
        ${total}
      </span>
    </div>
  `;

}


/* ============================================================
   PREDICT TAB
   ============================================================ */

function droplGaugeSVG(score, color) {

  const pct =
    Math.max(
      0,
      Math.min(1, score)
    );


  const fillY =
    150 -
    (pct * 130) -
    10;


  return `

    <svg
      class="droplet-gauge"
      viewBox="0 0 120 150"
    >

      <defs>

        <clipPath id="dropClip">

          <path
            d="
              M60 5
              C60 5 15 70 15 105
              a45 45 0 0090 0
              C105 70 60 5 60 5z
            "
          />

        </clipPath>

      </defs>


      <path
        d="
          M60 5
          C60 5 15 70 15 105
          a45 45 0 0090 0
          C105 70 60 5 60 5z
        "
        fill="#fff"
        stroke="${color}"
        stroke-width="3"
      />


      <g clip-path="url(#dropClip)">

        <rect
          x="0"
          y="${fillY}"
          width="120"
          height="150"
          fill="${color}"
          opacity="0.85"
        />

      </g>


      <text
        x="60"
        y="112"
        text-anchor="middle"
        font-family="Newsreader,serif"
        font-weight="700"
        font-size="26"
        fill="${pct > 0.45 ? '#fff' : '#16213E'}"
      >
        ${Math.round(pct * 100)}%
      </text>

    </svg>

  `;

}


async function showPrediction(
  lat,
  lon,
  label
) {

  const resultEl =
    document.getElementById(
      'predictResult'
    );


  resultEl.innerHTML = `
    <div
      style="
        margin:20px 0;
        color:var(--ink-muted);
        font-size:13.5px;
      "
    >
      Checking risk…
    </div>
  `;


  try {

    const res =
      await fetch(
        `${API_BASE}/api/predict?lat=${lat}&lon=${lon}`
      );


    if (!res.ok) {
      throw new Error(
        'Prediction request failed'
      );
    }


    const p =
      await res.json();


    const color =
      CAT_COLOR[p.category];


    resultEl.innerHTML = `

      <div
        style="
          margin:20px 0 8px;
          font-size:13px;
          color:var(--ink-muted);
        "
      >
        ${label}
        —
        nearest assessed point
        ${p.nearest_point_distance_m}m away
      </div>


      <div class="result-panel">

        ${droplGaugeSVG(
          p.score,
          color
        )}


        <div class="result-text">

          <h2>

            <span
              class="badge badge-${p.category}"
            >
              ${p.category_label} Risk
            </span>

          </h2>


          <div class="rec-line">

            <b>
              Recommended action:
            </b>

            ${p.recommendation_label}

          </div>


          <div class="factor-row">

            <div class="factor">
              <b>
                ${p.elevation_m} m
              </b>
              Elevation
            </div>


            <div class="factor">
              <b>
                ${p.impervious_pct}%
              </b>
              Impervious surface
            </div>


            <div class="factor">
              <b>
                ${p.distance_to_water_m} m
              </b>
              Distance to water
            </div>

          </div>

        </div>

      </div>

    `;

  }

  catch (err) {

    console.error(
      'Prediction failed:',
      err
    );


    resultEl.innerHTML = `

      <div
        style="
          margin:20px 0;
          color:var(--red);
          font-size:13.5px;
        "
      >
        Could not reach the prediction service.
        Is the backend running on port 5000?
      </div>

    `;

  }

}


/* ============================================================
   REPORT FORM
   ============================================================ */

let selectedPhotoFile = null;


function setupReportForm() {

  const dropzone =
    document.getElementById(
      'dropzone'
    );


  const photoInput =
    document.getElementById(
      'photoInput'
    );


  if (!dropzone || !photoInput) {
    return;
  }


  dropzone.addEventListener(
    'click',
    () => photoInput.click()
  );


  photoInput.addEventListener(
    'change',
    handleFile
  );


  dropzone.addEventListener(
    'dragover',
    e => {

      e.preventDefault();

      dropzone.style.borderColor =
        '#1C7293';

    }
  );


  dropzone.addEventListener(
    'drop',
    e => {

      e.preventDefault();


      if (e.dataTransfer.files[0]) {

        photoInput.files =
          e.dataTransfer.files;

        handleFile();

      }

    }
  );


  function handleFile() {

    const file =
      photoInput.files[0];


    if (!file) {
      return;
    }


    selectedPhotoFile = file;


    const reader =
      new FileReader();


    reader.onload = () => {

      dropzone.innerHTML = `

        <img
          src="${reader.result}"
          alt="preview"
        >

        <div
          style="
            margin-top:8px;
            font-size:12px;
          "
        >
          Tap to change photo
        </div>

      `;

    };


    reader.readAsDataURL(file);

  }


  const reportForm =
    document.getElementById(
      'reportForm'
    );


  if (!reportForm) {
    return;
  }


  reportForm.addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const locality =
        document.getElementById(
          'reportLocality'
        ).value;


      const desc =
        document.getElementById(
          'reportDesc'
        ).value;


      if (!locality || !desc) {

        alert(
          'Please fill in the area and description.'
        );

        return;

      }


      const formData =
        new FormData();


      formData.append(
        'locality',
        locality
      );


      formData.append(
        'description',
        desc
      );


      if (selectedPhotoFile) {

        formData.append(
          'photo',
          selectedPhotoFile
        );

      }


      try {

        const res =
          await fetch(
            `${API_BASE}/api/reports`,
            {
              method: 'POST',
              body: formData
            }
          );


        if (!res.ok) {

          const errBody =
            await res
              .json()
              .catch(() => ({}));


          throw new Error(
            errBody.error ||
            'Submission failed'
          );

        }


        e.target.reset();


        dropzone.innerHTML =
          '<span id="dropzoneText">' +
          'Tap to choose a photo, or drag one here' +
          '</span>';


        selectedPhotoFile = null;


        renderPublicFeed();


        alert(
          'Report submitted. Thank you — your ward office can now see this.'
        );

      }

      catch (err) {

        console.error(
          'Report submission error:',
          err
        );


        alert(
          'Something went wrong submitting your report. ' +
          'Is the backend running? ' +
          err.message
        );

      }

    }
  );

}


/* ============================================================
   LOAD + RENDER REPORTS
   ============================================================ */

async function loadAllReports() {

  try {

    const res =
      await fetch(
        `${API_BASE}/api/reports`
      );


    if (!res.ok) {

      throw new Error(
        'Failed to fetch reports'
      );

    }


    return await res.json();

  }

  catch (err) {

    console.error(
      'Could not load reports:',
      err
    );


    return [];

  }

}


function reportCardHTML(
  r,
  showActions
) {

  const photoHTML =
    r.photo_url

      ? `
        <img
          src="${API_BASE}${r.photo_url}"
          alt="report photo"
        >
      `

      : `
        <div class="no-photo">
          No photo
        </div>
      `;


  const statusLabel = {
    pending: 'Pending',
    verified: 'Red Alert',
    review: 'Under Review',
    resolved: 'Resolved'
  }[r.status] || 'Pending';


  const statusClass = {
    pending: 'badge-status-pending',
    verified: 'badge-status-verified',
    review: 'badge-status-review',
    resolved: 'badge-status-resolved'
  }[r.status] ||
    'badge-status-pending';


  const date =
    new Date(
      r.created_at
    ).toLocaleString();


  let actions = '';


  if (showActions) {

    actions = `

      <div class="gov-actions">

        <button
          onclick="setStatus('${r.id}','verified')"
        >
          Mark Red Alert
        </button>


        <button
          onclick="setStatus('${r.id}','review')"
        >
          Under Review
        </button>


        <button
          onclick="setStatus('${r.id}','resolved')"
        >
          Resolved
        </button>

      </div>

    `;

  }


  return `

    <div class="report-card">

      ${photoHTML}


      <div class="report-meta">

        <div class="top-row">

          <h4>
            ${r.locality}
          </h4>


          <span
            class="badge ${statusClass}"
          >
            ${statusLabel}
          </span>

        </div>


        <p>
          ${r.description}
        </p>


        <div class="ts">
          ${date}
        </div>


        ${actions}

      </div>

    </div>

  `;

}


async function renderPublicFeed() {

  const el =
    document.getElementById(
      'publicFeed'
    );


  if (!el) {
    return;
  }


  const reports =
    await loadAllReports();


  if (reports.length === 0) {

    el.innerHTML =
      '<div class="empty-msg">' +
      'No reports yet — be the first.' +
      '</div>';

    return;

  }


  el.innerHTML =
    reports
      .slice(0, 10)
      .map(
        r => reportCardHTML(r, false)
      )
      .join('');

}


async function renderGovFeed() {

  const el =
    document.getElementById(
      'govFeed'
    );


  if (!el) {
    return;
  }


  const reports =
    await loadAllReports();


  document.getElementById(
    'statTotal'
  ).textContent =
    reports.length;


  document.getElementById(
    'statPending'
  ).textContent =
    reports.filter(
      r => r.status === 'pending'
    ).length;


  document.getElementById(
    'statRed'
  ).textContent =
    reports.filter(
      r => r.status === 'verified'
    ).length;


  document.getElementById(
    'statResolved'
  ).textContent =
    reports.filter(
      r => r.status === 'resolved'
    ).length;


  if (reports.length === 0) {

    el.innerHTML =
      '<div class="empty-msg">' +
      'No reports submitted yet.' +
      '</div>';

    return;

  }


  el.innerHTML =
    reports
      .map(
        r => reportCardHTML(r, true)
      )
      .join('');

}


async function setStatus(
  id,
  status
) {

  try {

    const res =
      await fetch(
        `${API_BASE}/api/reports/${id}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              status
            })

        }
      );


    if (!res.ok) {

      throw new Error(
        'Status update failed'
      );

    }


    renderGovFeed();

  }

  catch (e) {

    console.error(
      'Failed to update status:',
      e
    );


    alert(
      'Could not update status. Please try again.'
    );

  }

}


/* ============================================================
   HERO TITLE
   ============================================================ */

function setupHeroTitle() {

  const el =
    document.getElementById(
      'heroTitle'
    );


  if (!el) {
    return;
  }


  const word =
    'JalAmrit';


  el.innerHTML =
    word
      .split('')
      .map(
        (ch, i) =>
          `<span style="animation-delay:${0.15 + i * 0.07}s">${ch}</span>`
      )
      .join('');

}


/* ============================================================
   3D EARTH
   ============================================================ */

function setupGlobe() {

  const canvas =
    document.getElementById(
      'globeCanvas'
    );


  const hero =
    document.getElementById(
      'hero'
    );


  if (
    !window.THREE ||
    !canvas ||
    !hero
  ) {

    console.warn(
      'Three.js globe could not be initialized.'
    );

    return;

  }


  /* ----------------------------------------------------------
     SCENE
     ---------------------------------------------------------- */

  const scene =
    new THREE.Scene();


  /* ----------------------------------------------------------
     CAMERA
     ---------------------------------------------------------- */

  const camera =
    new THREE.PerspectiveCamera(
      36,
      hero.clientWidth /
        hero.clientHeight,
      0.1,
      1000
    );


  /*
     Slightly farther camera distance.
     This helps the smaller Earth fit comfortably.
  */

  camera.position.set(
    0,
    0.15,
    10.5
  );


  /* ----------------------------------------------------------
     RENDERER
     ---------------------------------------------------------- */

  const renderer =
    new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });


  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      2
    )
  );


  renderer.setSize(
    hero.clientWidth,
    hero.clientHeight
  );


  /*
     Better color reproduction.
  */

  if (
    'outputColorSpace' in renderer
  ) {

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

  }


  renderer.toneMapping =
    THREE.ACESFilmicToneMapping;


  /*
     Brighter cinematic exposure.
  */

  renderer.toneMappingExposure =
    1.12;


  /* ----------------------------------------------------------
     GLOBE GROUP
     ---------------------------------------------------------- */

  const globeGroup =
    new THREE.Group();


  /*
     Responsive positioning.

     Desktop:
       Earth sits to the right.

     Mobile:
       Earth moves toward center
       and slightly downward.
  */

  function updateGlobePosition() {

    const width =
      hero.clientWidth;


    if (width <= 480) {

      globeGroup.position.set(
        0.35,
        -1.15,
        0
      );

    }

    else if (width <= 768) {

      globeGroup.position.set(
        0.65,
        -0.65,
        0
      );

    }

    else if (width <= 1100) {

      globeGroup.position.set(
        1.55,
        0.10,
        0
      );

    }

    else {

      globeGroup.position.set(
        2.05,
        0.25,
        0
      );

    }

  }


  updateGlobePosition();


  /*
     IMPORTANT:
     Reduced from 3.2 to 2.55.
  */

  const EARTH_R =
    2.55;


  /* ----------------------------------------------------------
     TEXTURE LOADER
     ---------------------------------------------------------- */

  const loader =
    new THREE.TextureLoader();


  loader.crossOrigin =
    'anonymous';


  /* ----------------------------------------------------------
     EARTH TEXTURE
     ---------------------------------------------------------- */

  const earthTexture =
    loader.load(
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
    );


  /*
     Make the texture colors more accurate.
  */

  if (
    'colorSpace' in earthTexture
  ) {

    earthTexture.colorSpace =
      THREE.SRGBColorSpace;

  }


  /* ----------------------------------------------------------
     EARTH MATERIAL
     ---------------------------------------------------------- */

  const earthGeo =
    new THREE.SphereGeometry(
      EARTH_R,
      96,
      96
    );


  /*
     The old color was too dark/muted.

     This keeps the satellite texture visible
     while adding a subtle cool blue tone.
  */

  const earthMat =
    new THREE.MeshStandardMaterial({

      map: earthTexture,

      color: 0xd9f4ff,

      roughness: 0.70,

      metalness: 0.02,

      emissive: 0x0a2940,

      emissiveIntensity: 0.24

    });


  const earthMesh =
    new THREE.Mesh(
      earthGeo,
      earthMat
    );


  globeGroup.add(
    earthMesh
  );


  /* ----------------------------------------------------------
     CLOUDS
     ---------------------------------------------------------- */

  const cloudTexture =
    loader.load(
      'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
    );


  if (
    'colorSpace' in cloudTexture
  ) {

    cloudTexture.colorSpace =
      THREE.SRGBColorSpace;

  }


  const cloudGeo =
    new THREE.SphereGeometry(
      EARTH_R * 1.016,
      96,
      96
    );


  const cloudMat =
    new THREE.MeshLambertMaterial({

      map: cloudTexture,

      transparent: true,

      opacity: 0.60,

      depthWrite: false

    });


  const cloudMesh =
    new THREE.Mesh(
      cloudGeo,
      cloudMat
    );


  globeGroup.add(
    cloudMesh
  );


  /* ----------------------------------------------------------
     ATMOSPHERIC GLOW
     ---------------------------------------------------------- */

  const atmoGeo =
    new THREE.SphereGeometry(
      EARTH_R * 1.075,
      96,
      96
    );


  const atmoMat =
    new THREE.ShaderMaterial({

      transparent: true,

      side: THREE.BackSide,

      blending:
        THREE.AdditiveBlending,

      uniforms: {

        glowColor: {
          value:
            new THREE.Color(
              0x35c9ff
            )
        }

      },

      vertexShader: `

        varying float intensity;

        void main() {

          vec3 vNormal =
            normalize(
              normalMatrix *
              normal
            );

          vec3 vNormel =
            normalize(
              normalMatrix *
              vec3(
                0.0,
                0.0,
                1.0
              )
            );

          intensity =
            pow(
              0.82 -
              dot(
                vNormal,
                vNormel
              ),
              3.2
            );

          gl_Position =
            projectionMatrix *
            modelViewMatrix *
            vec4(
              position,
              1.0
            );

        }

      `,

      fragmentShader: `

        uniform vec3 glowColor;

        varying float intensity;

        void main() {

          gl_FragColor =
            vec4(
              glowColor,
              intensity * 0.42
            );

        }

      `

    });


  const atmosphere =
    new THREE.Mesh(
      atmoGeo,
      atmoMat
    );


  globeGroup.add(
    atmosphere
  );


  /* ----------------------------------------------------------
     LAT/LON → 3D POSITION
     ---------------------------------------------------------- */

  function latLonToXYZ(
    lat,
    lon,
    radius
  ) {

    const phi =
      (90 - lat) *
      (Math.PI / 180);


    const theta =
      (lon + 180) *
      (Math.PI / 180);


    return new THREE.Vector3(

      -radius *
        Math.sin(phi) *
        Math.cos(theta),

      radius *
        Math.cos(phi),

      radius *
        Math.sin(phi) *
        Math.sin(theta)

    );

  }


  /* ----------------------------------------------------------
     IMPORTANT CITY LOCATIONS
     ---------------------------------------------------------- */

  const cities = [

    {
      name: 'Bengaluru',
      lat: 12.97,
      lon: 77.59,
      color: 0x72ffd0,
      size: 1.25
    },

    {
      name: 'Hyderabad',
      lat: 17.38,
      lon: 78.49,
      color: 0xffd166,
      size: 1
    },

    {
      name: 'Pune',
      lat: 18.52,
      lon: 73.86,
      color: 0xffd166,
      size: 1
    },

    {
      name: 'Chennai',
      lat: 13.08,
      lon: 80.27,
      color: 0xffd166,
      size: 1
    }

  ];


  const markerRings = [];


  /* ----------------------------------------------------------
     CITY MARKERS
     ---------------------------------------------------------- */

  cities.forEach(
    (city, index) => {

      const pos =
        latLonToXYZ(
          city.lat,
          city.lon,
          EARTH_R * 1.026
        );


      /*
         Small glowing dot.
      */

      const dot =
        new THREE.Mesh(

          new THREE.SphereGeometry(
            0.045 *
              city.size,
            18,
            18
          ),

          new THREE.MeshBasicMaterial({
            color:
              city.color
          })

        );


      dot.position.copy(
        pos
      );


      globeGroup.add(
        dot
      );


      /*
         Pulsing ring.
      */

      const ring =
        new THREE.Mesh(

          new THREE.RingGeometry(
            0.055,
            0.085,
            32
          ),

          new THREE.MeshBasicMaterial({

            color:
              city.color,

            transparent: true,

            opacity: 0.72,

            side:
              THREE.DoubleSide

          })

        );


      ring.position.copy(
        pos
      );


      ring.lookAt(
        pos.clone()
          .multiplyScalar(2)
      );


      ring.rotation.z =
        index * 0.8;


      globeGroup.add(
        ring
      );


      markerRings.push({
        ring,
        index,
        size:
          city.size
      });

    }
  );


  /* ----------------------------------------------------------
     INITIAL EARTH ROTATION
     ---------------------------------------------------------- */

  globeGroup.rotation.x =
    0.30;


  globeGroup.rotation.y =
    -1.70;


  scene.add(
    globeGroup
  );


  /* ----------------------------------------------------------
     LIGHTING
     ---------------------------------------------------------- */

  /*
     Soft overall illumination.
  */

  const ambientLight =
    new THREE.AmbientLight(
      0x9edff5,
      0.72
    );


  scene.add(
    ambientLight
  );


  /*
     Main sunlight.
  */

  const sun =
    new THREE.DirectionalLight(
      0xffffff,
      1.80
    );


  sun.position.set(
    6,
    4,
    7
  );


  scene.add(
    sun
  );


  /*
     Blue atmospheric fill.
  */

  const rim =
    new THREE.DirectionalLight(
      0x36bde8,
      0.65
    );


  rim.position.set(
    -6,
    1,
    -5
  );


  scene.add(
    rim
  );


  /*
     Very subtle warm fill.
     Stops the Earth from becoming completely blue.
  */

  const fill =
    new THREE.DirectionalLight(
      0xfff1d6,
      0.25
    );


  fill.position.set(
    4,
    -2,
    3
  );


  scene.add(
    fill
  );


  /* ----------------------------------------------------------
     STARS
     ---------------------------------------------------------- */

  const starCount =
    850;


  const starPos =
    new Float32Array(
      starCount * 3
    );


  for (
    let i = 0;
    i < starCount;
    i++
  ) {

    const r =
      28 +
      Math.random() * 38;


    const theta =
      Math.random() *
      Math.PI *
      2;


    const phi =
      Math.acos(
        2 *
        Math.random() -
        1
      );


    starPos[i * 3] =
      r *
      Math.sin(phi) *
      Math.cos(theta);


    starPos[i * 3 + 1] =
      r *
      Math.sin(phi) *
      Math.sin(theta);


    starPos[i * 3 + 2] =
      r *
      Math.cos(phi) -
      16;

  }


  const starGeo =
    new THREE.BufferGeometry();


  starGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      starPos,
      3
    )
  );


  const starMat =
    new THREE.PointsMaterial({

      color:
        0xffffff,

      size:
        0.045,

      transparent:
        true,

      opacity:
        0.72,

      sizeAttenuation:
        true

    });


  const stars =
    new THREE.Points(
      starGeo,
      starMat
    );


  scene.add(
    stars
  );

  const shootingStars = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    shootingStars.push({ line, active: false, progress: 0, start: new THREE.Vector3(), end: new THREE.Vector3(), delay: 2 + Math.random() * 6 });
  }
  function spawnShootingStar(s) {
    const r = 30 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    s.start.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi) - 16);
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 10;
    s.end.copy(s.start).add(new THREE.Vector3(Math.cos(angle) * dist, Math.sin(angle) * dist * 0.5 - dist * 0.4, 0));
    s.progress = 0;
    s.active = true;
  }


  /* ----------------------------------------------------------
     MOUSE INTERACTION
     ---------------------------------------------------------- */

  let targetRotX =
    0.30;


  let targetRotY =
    -1.70;


  let currentMouseX =
    0;


  let currentMouseY =
    0;


  /*
     Mouse movement gently changes
     the viewing direction.
  */

  hero.addEventListener(
    'pointermove',
    event => {

      const rect =
        hero.getBoundingClientRect();


      const mouseX =
        (
          (
            event.clientX -
            rect.left
          ) /
          rect.width
        ) -
        0.5;


      const mouseY =
        (
          (
            event.clientY -
            rect.top
          ) /
          rect.height
        ) -
        0.5;


      currentMouseX =
        mouseX;


      currentMouseY =
        mouseY;


      /*
         Keep movement subtle.
         This prevents the Earth from
         moving over the title.
      */

      targetRotY =
        -1.70 +
        mouseX * 0.28;


      targetRotX =
        0.30 +
        mouseY * 0.12;

    }
  );


  /* ----------------------------------------------------------
     ANIMATION
     ---------------------------------------------------------- */

  let time = 0;


  function animate() {

    requestAnimationFrame(
      animate
    );


    time += 0.01;


    /*
       Slow natural Earth rotation.
    */

    earthMesh.rotation.y +=
      0.00075;


    /*
       Clouds move slightly faster
       than the Earth.
    */

    cloudMesh.rotation.y +=
      0.00105;


    /*
       Smooth mouse movement.
    */

    globeGroup.rotation.y +=
      (
        targetRotY -
        globeGroup.rotation.y
      ) *
      0.035;


    globeGroup.rotation.x +=
      (
        targetRotX -
        globeGroup.rotation.x
      ) *
      0.035;


    /*
       Pulsing location markers.
    */

    markerRings.forEach(
      marker => {

        const pulse =
          1 +
          (
            0.28 *
            Math.abs(
              Math.sin(
                time * 1.45 +
                marker.index
              )
            )
          );


        marker.ring.scale.setScalar(
          pulse *
          marker.size
        );


        marker.ring.material.opacity =
          0.40 +
          (
            0.35 *
            Math.abs(
              Math.sin(
                time * 2.1 +
                marker.index
              )
            )
          );

      }
    );


    /*
       Slowly moving stars.
    */

    stars.rotation.y +=
      0.00008;


    /*
       Very subtle star breathing.
    */

    starMat.opacity =
      0.64 +
      Math.sin(time * 0.45) *
      0.08;

    shootingStars.forEach(s => {
      if (!s.active) {
        s.delay -= 0.016;
        if (s.delay <= 0) spawnShootingStar(s);
        return;
      }
      s.progress += 0.028;
      if (s.progress >= 1) {
        s.active = false;
        s.delay = 3 + Math.random() * 9;
        s.line.material.opacity = 0;
        return;
      }
      const head = s.start.clone().lerp(s.end, s.progress);
      const tail = s.start.clone().lerp(s.end, Math.max(0, s.progress - 0.12));
      const pos = s.line.geometry.attributes.position.array;
      pos[0] = tail.x; pos[1] = tail.y; pos[2] = tail.z;
      pos[3] = head.x; pos[4] = head.y; pos[5] = head.z;
      s.line.geometry.attributes.position.needsUpdate = true;
      s.line.material.opacity = Math.sin(Math.min(s.progress * 4, 1) * Math.PI);
    });


    renderer.render(
      scene,
      camera
    );

  }


  animate();


  /* ----------------------------------------------------------
     RESPONSIVE RESIZE
     ---------------------------------------------------------- */

  function resizeGlobe() {

    const width =
      hero.clientWidth;


    const height =
      hero.clientHeight;


    camera.aspect =
      width / height;


    camera.updateProjectionMatrix();


    renderer.setSize(
      width,
      height,
      false
    );


    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );


    updateGlobePosition();

  }


  window.addEventListener(
    'resize',
    resizeGlobe
  );


  resizeGlobe();

}


/* ============================================================
   INITIALIZATION
   ============================================================ */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    /* Hero */
    setupHeroTitle();

    setupGlobe();


    /* --------------------------------------------------------
       Enter App button
       -------------------------------------------------------- */

    const enterAppBtn =
      document.getElementById(
        'enterAppBtn'
      );


    if (enterAppBtn) {

      enterAppBtn.addEventListener(
        'click',
        () => goToTab('map')
      );

    }


    /* --------------------------------------------------------
       Report form
       -------------------------------------------------------- */

    setupReportForm();


    /* --------------------------------------------------------
       Reveal animations
       -------------------------------------------------------- */

    const revealObserver =
      new IntersectionObserver(
        entries => {

          entries.forEach(
            entry => {

              if (
                entry.isIntersecting
              ) {

                entry.target
                  .classList
                  .add('in-view');


                revealObserver
                  .unobserve(
                    entry.target
                  );

              }

            }
          );

        },
        {
          threshold: 0.15
        }
      );


    document
      .querySelectorAll('.reveal')
      .forEach(
        el =>
          revealObserver.observe(el)
      );


    /* --------------------------------------------------------
       Top navigation scroll effect
       -------------------------------------------------------- */

    const topbar =
      document.querySelector(
        'header.topbar'
      );


    if (topbar) {

      document.addEventListener(
        'scroll',
        () => {

          topbar.classList.toggle(
            'scrolled',
            window.scrollY > 40
          );

        },
        {
          passive: true
        }
      );

    }


    /* --------------------------------------------------------
       Predict locality dropdown
       -------------------------------------------------------- */

    const sel =
      document.getElementById(
        'localitySelect'
      );


    if (sel) {

      LOCALITIES.forEach(
        (loc, i) => {

          const opt =
            document.createElement(
              'option'
            );


          opt.value = i;


          opt.textContent =
            loc.name;


          sel.appendChild(
            opt
          );

        }
      );

    }


    /* --------------------------------------------------------
       Predict button
       -------------------------------------------------------- */

    const predictBtn =
      document.getElementById(
        'predictBtn'
      );


    if (
      predictBtn &&
      sel
    ) {

      predictBtn.addEventListener(
        'click',
        () => {

          const idx =
            sel.value;


          if (idx === '') {

            alert(
              'Please choose a locality first.'
            );

            return;

          }


          const loc =
            LOCALITIES[idx];


          showPrediction(
            loc.lat,
            loc.lon,
            loc.name
          );

        }
      );

    }


    /* --------------------------------------------------------
       Geolocation button
       -------------------------------------------------------- */

    const geoBtn =
      document.getElementById(
        'geoBtn'
      );


    if (geoBtn) {

      geoBtn.addEventListener(
        'click',
        () => {

          if (
            !navigator.geolocation
          ) {

            alert(
              'Geolocation not supported on this device.'
            );

            return;

          }


          navigator.geolocation.getCurrentPosition(

            pos => {

              showPrediction(
                pos.coords.latitude,
                pos.coords.longitude,
                'Your location'
              );

            },

            () => {

              alert(
                'Could not get your location. ' +
                'Please select a locality instead.'
              );

            }

          );

        }
      );

    }


    /* --------------------------------------------------------
       Load risk data once at startup
       -------------------------------------------------------- */

    await loadRiskData();

  }
);