/* admin.js — restored full controller with TF-IDF integration */

/* CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyAWTsTs_NEav91LKQ5jLrVf3ojsLYAY4XI",
  authDomain: "grievance-redressal-syst-627d7.firebaseapp.com",
  projectId: "grievance-redressal-syst-627d7",
  storageBucket: "grievance-redressal-syst-627d7.firebasestorage.app",
  messagingSenderId: "47862331768",
  appId: "1:47862331768:web:423bb1a0ac46e259d1b08d",
  measurementId: "G-YX2Y3RFF3P"
};

if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const ADMIN_EMAILS = ["aryaadmin@gmail.com"];

/* UI elements */
const adminLoginSection = document.getElementById("adminLoginSection");
const dashboardSection = document.getElementById("dashboardSection");
const adminEmailSpan = document.getElementById("adminEmail");
const signOutBtn = document.getElementById("signOutBtn");
const statusEl = document.getElementById("status");
const summaryPanel = document.getElementById("summaryPanel");
const summaryBtn = document.getElementById("summaryBtn");
const collapseSummary = document.getElementById("collapseSummary");
const clearCluster = document.getElementById("clearCluster");
const clustersList = document.getElementById("clustersList");
const summaryLoading = document.getElementById("summaryLoading");
const dashboardWrap = document.getElementById("dashboardWrap");

let grievances = [];
let unsubscribe = null;

/* pagination state */
let currentPage = 1;
let pageSize = 10;

/* map state */
let map, markersLayer;
const markersById = {};

/* TFIDF state */
let clusters = [];
let tfidfState = null;

/* HELPERS */
function showStatus(msg, cls) {
  statusEl.innerText = msg;
  statusEl.className = `mt-2 text-center fw-bold ${cls || ''}`;
  console.log("STATUS:", msg);
  setTimeout(()=> { if(statusEl.innerText === msg) statusEl.innerText = ""; }, 5000);
}

function escapeHtml(str) {
  if(!str && str !== 0) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* MAP */
function initMap() {
  if(map) return;
  map = L.map('map', { zoomControl:true }).setView([20.5937,78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  markersLayer = L.featureGroup().addTo(map);
  setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} }, 300);
}

/* DESCRIPTION TOGGLE */
function toggleDescription(id){
  const shortEl = document.getElementById(`desc-${id}`);
  const fullEl = document.getElementById(`desc-full-${id}`);
  const btn = event.target;

  if(fullEl.classList.contains("d-none")){
    // Expand
    fullEl.classList.remove("d-none");
    shortEl.classList.add("d-none");
    btn.textContent = "Show Less";
  } else {
    // Collapse
    fullEl.classList.add("d-none");
    shortEl.classList.remove("d-none");
    btn.textContent = "Show More";
  }
}


/* AUTH */
auth.onAuthStateChanged(user=>{
  if(!user){
    adminLoginSection.style.display = "block";
    dashboardSection.style.display = "none";
    adminEmailSpan.innerText = "";
    signOutBtn.style.display = "none";
    if(unsubscribe) unsubscribe();
    return;
  }
  if(!ADMIN_EMAILS.includes(user.email)){
    showStatus("❌ You are signed in, but not an admin.","text-danger");
    auth.signOut();
    return;
  }
  adminEmailSpan.innerText = user.email;
  adminLoginSection.style.display = "none";
  dashboardSection.style.display = "block";
  signOutBtn.style.display = "inline-block";
  showStatus("✅ Signed in as admin.", "text-success");
  initMap();
  setTimeout(()=> map.invalidateSize(), 300);

  if(unsubscribe) unsubscribe();
  const q = db.collection("grievances").orderBy("createdAt", "desc");
  unsubscribe = q.onSnapshot(snapshot=>{
    grievances = [];
    snapshot.forEach(doc => grievances.push({ id: doc.id, ...doc.data() }));
    currentPage = 1;
    renderStats();
    runClientClustering(); // compute clusters + render clusters list
    renderGrievances();
  }, err=>{
    console.error("Grievance snapshot error:", err);
    showStatus("❌ Failed to load grievances. See console.", "text-danger");
    summaryLoading.textContent = 'Failed to load data: ' + (err.message || err);
  });
});

/* LOGIN / SIGNOUT */
async function login() {
  const email = document.getElementById("adminEmailInput").value.trim();
  const password = document.getElementById("adminPasswordInput").value.trim();
  if(!email || !password) return showStatus("⚠️ Enter email and password.", "text-warning");
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(e) {
    console.error(e);
    showStatus("❌ " + e.message, "text-danger");
  }
}
function signOut() { auth.signOut(); }

/* STATS */
function renderStats() {
  const total = grievances.length;
  let highOpen=0, medOpen=0, resolved=0;
  grievances.forEach(g=>{
    const status = g.status || "open";
    const priority = (g.hfEngine?.priority || "low").toLowerCase();
    if(status === "resolved") resolved++;
    else {
      if(priority === "high") highOpen++;
      if(priority === "medium") medOpen++;
    }
  });
  document.getElementById("statTotal").innerText = total;
  document.getElementById("statHighOpen").innerText = highOpen;
  document.getElementById("statMediumOpen").innerText = medOpen;
  document.getElementById("statResolved").innerText = resolved;
}

/* FILTERS + RENDER LIST */
function onFilterChange(){ currentPage = 1; renderGrievances(); }
function onPageSizeChange(){ pageSize = Number(document.getElementById('pageSizeSelect').value) || 10; currentPage = 1; renderGrievances(); }

function priorityWeight(p){ if(p==="high") return 3; if(p==="medium") return 2; return 1; }

function renderGrievances() {
  const listEl = document.getElementById("grievanceList");
  if(!grievances.length){ listEl.innerHTML = '<div class="text-center text-muted py-5">No grievances yet.</div>'; document.getElementById("listMeta").innerText = "0 items"; updateMapMarkers([]); renderPaginationControls(0); return; }

  const priorityFilter = document.getElementById("priorityFilter").value;
  const categoryFilter = document.getElementById("categoryFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;
  const searchText = document.getElementById("searchInput").value.trim().toLowerCase();

  let filtered = grievances.filter(g=>{
    const hf = g.hfEngine || {};
    const pr = (hf.priority || "low").toLowerCase();
    const cat = (hf.category || "other").toLowerCase();
    const st = (g.status || "open").toLowerCase();
    if(priorityFilter !== "all" && pr !== priorityFilter) return false;
    if(categoryFilter !== "all" && cat !== categoryFilter) return false;
    if(statusFilter !== "all" && st !== statusFilter) return false;
    if(searchText){ const blob = `${g.title||''} ${g.description||''}`.toLowerCase(); if(!blob.includes(searchText)) return false; }
    return true;
  });

  // if cluster filter active, restrict to cluster members
  if(window._selectedClusterIds && window._selectedClusterIds.size){
    filtered = filtered.filter(g => window._selectedClusterIds.has(g.id));
  }

  filtered.sort((a,b)=>{
    const pa = priorityWeight(a.hfEngine?.priority || "low");
    const pb = priorityWeight(b.hfEngine?.priority || "low");
    if(pa !== pb) return pb - pa;
    const da = a.createdAt?.toDate?.() || new Date(0);
    const db = b.createdAt?.toDate?.() || new Date(0);
    return db - da;
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if(currentPage > totalPages) currentPage = totalPages;
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);

  document.getElementById("listMeta").innerText = `${totalItems} items • page ${currentPage} of ${totalPages}`;

  let html = "";
  pageItems.forEach(g=>{
    const hf = g.hfEngine || {};
    const priority = (hf.priority || "low").toLowerCase();
    const category = (hf.category || "other").toLowerCase();
    const isUrgent = !!hf.isUrgent;
    const status = (g.status || "open").toLowerCase();
    const created = g.createdAt?.toDate?.() || new Date();
    const createdStr = created.toLocaleDateString() + " " + created.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    let badgeClass = "badge-priority-low";
    if(priority === "high") badgeClass = "badge-priority-high";
    else if(priority === "medium") badgeClass = "badge-priority-medium";
    const urgentBadge = isUrgent ? `<span class="badge ms-1 badge-urgent">URGENT</span>` : "";
    const statusClass = status === "resolved" ? "status-resolved" : "status-open";
    const keywords = (hf.keywords || []).slice(0,5).join(", ");
    const lat = (typeof g.latitude !== 'undefined' && g.latitude !== null) ? g.latitude : null;
    const lon = (typeof g.longitude !== 'undefined' && g.longitude !== null) ? g.longitude : null;
    const latlonHtml = (lat!==null && lon!==null) ? `<div class="mt-1 small text-muted"><span class="small-label">Lat / Lon:</span> ${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}</div>` : "";
    html += `
      <div class="grievance-row" onclick="onRowClick('${g.id}')">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="d-flex align-items-center mb-1">
              <strong>${escapeHtml(g.title || "Untitled")}</strong>
              <span class="badge ms-2 ${badgeClass} text-uppercase">${priority || "low"}</span>
              ${urgentBadge}
              <span class="badge ms-2 bg-secondary text-uppercase">${escapeHtml(category)}</span>
            </div>
            <!-- DESCRIPTION WITH SHOW MORE -->
                <div class="mb-1 small text-muted">
                <span id="desc-${g.id}" class="desc-short">
                    ${escapeHtml((g.description || "").slice(0, 120))}
                    ${(g.description || "").length > 120 ? "..." : ""}
                </span>

                ${(g.description || "").length > 120 ? `
                    <span id="desc-full-${g.id}" class="desc-full d-none">
                    ${escapeHtml(g.description)}
                    </span>
                    <button class="btn btn-link btn-sm p-0" 
                            onclick="event.stopPropagation(); toggleDescription('${g.id}')">
                    Show More
                    </button>
                ` : ""}
                </div>
            <div class="small text-muted">
              <span class="me-3"><span class="small-label">Created:</span> ${escapeHtml(createdStr)}</span>
              <span class="me-3"><span class="small-label">User:</span> ${escapeHtml(g.userId || "-")}</span>
              ${keywords ? `<span class="small-label">Keywords:</span> ${escapeHtml(keywords)}` : ""}
            </div>
            ${latlonHtml}
          </div>
          <div class="text-end">
            <div class="mb-2">
              <span class="status-chip ${statusClass}">${status}</span>
            </div>
            ${status === "open" ? `<button class="btn btn-sm btn-outline-success mb-1" onclick="event.stopPropagation(); markResolved('${g.id}')">Mark Resolved</button>` : `<button class="btn btn-sm btn-outline-secondary" disabled>Resolved</button>`}
          </div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html || '<div class="text-center text-muted py-5">No grievances match these filters.</div>';
  renderPaginationControls(totalItems);
  updateMapMarkers(filtered); // show markers for filtered set on map (entire filtered set)
}

/* Pagination controls */
function renderPaginationControls(totalItems){
  const el = document.getElementById('paginationButtons');
  el.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const prev = document.createElement('button'); prev.className='btn btn-sm btn-outline-light page-btn'; prev.innerText='Prev'; prev.disabled=currentPage<=1; prev.onclick=()=>{ if(currentPage>1){ currentPage--; renderGrievances(); } }; el.appendChild(prev);

  const maxButtons = 7;
  const createPageButton = n => {
    const b = document.createElement('button');
    b.className = `btn btn-sm ${n===currentPage ? 'btn-primary' : 'btn-outline-light'} page-btn`;
    b.innerText = n; b.onclick = ()=>{ if(currentPage===n) return; currentPage=n; renderGrievances(); }; return b;
  };

  if(totalPages <= maxButtons) { for(let i=1;i<=totalPages;i++) el.appendChild(createPageButton(i)); }
  else {
    const pages = new Set([1,totalPages,currentPage,currentPage-1,currentPage+1,2,totalPages-1]);
    const sorted = Array.from(pages).filter(n=>n>=1 && n<=totalPages).sort((a,b)=>a-b);
    let last = 0; sorted.forEach(n=>{ if(last && n-last>1){ const ell=document.createElement('span'); ell.className='mx-1 text-muted'; ell.innerText='…'; el.appendChild(ell); } el.appendChild(createPageButton(n)); last=n; });
  }

  const next = document.createElement('button'); next.className='btn btn-sm btn-outline-light page-btn'; next.innerText='Next'; next.disabled=currentPage>=totalPages; next.onclick=()=>{ if(currentPage<totalPages){ currentPage++; renderGrievances(); } }; el.appendChild(next);

  setTimeout(()=>{ try{ map.invalidateSize(); } catch(e){} }, 150);
}

/* mark resolved */
async function markResolved(id){
  try{ await db.collection("grievances").doc(id).update({ status:"resolved" }); showStatus("✅ Marked as resolved.", "text-success"); } catch(e){ console.error(e); showStatus("❌ Failed to update status.", "text-danger"); }
}

/* update markers */
function updateMapMarkers(list){
  if(!map) return;
  markersLayer.clearLayers();
  for(const k in markersById) delete markersById[k];
  const pts = [];
  list.forEach(g=>{
    const lat = (typeof g.latitude !== 'undefined' && g.latitude !== null) ? Number(g.latitude) : null;
    const lon = (typeof g.longitude !== 'undefined' && g.longitude !== null) ? Number(g.longitude) : null;
    if(lat === null || lon === null || isNaN(lat) || isNaN(lon)) return;
    const hf = g.hfEngine || {};
    const popupHtml = `<div><strong>${escapeHtml(g.title || 'Untitled')}</strong><br/><small class="text-muted">${escapeHtml(g.userId || '-')}</small><div style="margin-top:6px"><span class="small-label">Category:</span> ${escapeHtml(hf.category||'other')}<br/><span class="small-label">Priority:</span> ${escapeHtml(hf.priority||'low')}<br/><span class="small-label">Created:</span> ${escapeHtml((g.createdAt?.toDate?.()||'').toString())}</div></div>`;
    const marker = L.marker([lat, lon]).addTo(markersLayer).bindPopup(popupHtml);
    markersById[g.id] = marker;
    pts.push([lat, lon]);
  });

  if(pts.length){
    try{ map.fitBounds(L.latLngBounds(pts), { padding: [40,40] }); } catch(e) {}
  } else {
    map.setView([20.5937,78.9629],5);
  }

  setTimeout(()=>{ try{ map.invalidateSize(); } catch(e){} }, 150);
}

/* focus marker */
function focusOnMarker(docId){
  const marker = markersById[docId];
  if(marker){ try{ map.setView(marker.getLatLng(),15); marker.openPopup(); } catch(e){} }
  else showStatus("ℹ️ No location available for this grievance.", "text-info");
}

/* detail modal */
function onRowClick(docId){
  const g = grievances.find(x => x.id === docId);
  if(!g){ showStatus("ℹ️ Could not find grievance details.","text-info"); return; }
  showDetailModal(g);
  if(g.latitude !== undefined && g.latitude !== null && g.longitude !== undefined && g.longitude !== null) focusOnMarker(docId);
}

function showDetailModal(g){
  const m = document.getElementById('grievance-detail-modal');
  if(!m) return;
  document.getElementById('gd-title').innerText = g.title || 'Untitled';
  const hf = g.hfEngine || {};
  const priority = (hf.priority || 'low').toUpperCase();
  const priorityColor = priority === 'HIGH' ? '#ff5252' : (priority === 'MEDIUM' ? '#ffb300' : '#66bb6a');
  const priorityBadge = `<span style="background:${priorityColor};color:#fff;padding:4px 8px;border-radius:999px;margin-right:6px;font-size:0.75rem">${priority}</span>`;
  const urgentBadge = hf.isUrgent ? `<span style="background:#ff1744;color:#fff;padding:4px 8px;border-radius:999px;margin-right:6px;font-size:0.75rem">URGENT</span>` : '';
  const catBadge = `<span style="background:#6c757d;color:#fff;padding:4px 8px;border-radius:999px;font-size:0.75rem">${(hf.category||'').toUpperCase()}</span>`;
  document.getElementById('gd-badges').innerHTML = priorityBadge + urgentBadge + catBadge;
  document.getElementById('gd-desc').innerText = g.description || '';
  const created = (g.createdAt && typeof g.createdAt.toDate === 'function') ? g.createdAt.toDate().toLocaleString() : (g.createdAt || '');
  const keywords = (hf.keywords && hf.keywords.length) ? hf.keywords.join(', ') : '-';
  document.getElementById('gd-meta').innerHTML =
    `<div><strong style="color:#bdbdbd">Created:</strong> ${created}</div>
     <div><strong style="color:#bdbdbd">User:</strong> ${g.userId || '-'}</div>
     <div><strong style="color:#bdbdbd">Keywords:</strong> ${escapeHtml(keywords)}</div>`;
  const lat = (g.latitude !== undefined && g.latitude !== null) ? Number(g.latitude) : null;
  const lon = (g.longitude !== undefined && g.longitude !== null) ? Number(g.longitude) : null;
  document.getElementById('gd-latlon').innerHTML = lat!==null && lon!==null
    ? `<strong style="color:#bdbdbd">Lat/Lon:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}`
    : `<strong style="color:#bdbdbd">Lat/Lon:</strong> Not provided`;
  const mapBtn = document.getElementById('gd-map-btn');
  if(lat!==null && lon!==null){ mapBtn.style.display='inline-block'; mapBtn.onclick = function(e){ e.stopPropagation(); focusOnMarker(g.id); }; } else { mapBtn.style.display='none'; mapBtn.onclick=null; }
  const resolveBtn = document.getElementById('gd-resolve-btn');
  resolveBtn.onclick = async function(e){ e.stopPropagation(); await markResolved(g.id); hideDetailModal(); };
  m.style.display = 'block';
}
function hideDetailModal(){ const m=document.getElementById('grievance-detail-modal'); if(m) m.style.display='none'; }
document.getElementById('gd-close').addEventListener('click', function(e){ e.stopPropagation(); hideDetailModal(); });
document.addEventListener('click', function(e){ const m=document.getElementById('grievance-detail-modal'); if(!m || m.style.display === 'none') return; if(!m.contains(e.target)) hideDetailModal(); });

/* CLUSTERING UI: run TF-IDF, render clusters, apply cluster filters */
function runClientClustering(){
  try{
    if(!grievances.length){ clusters = []; clustersList.innerHTML = ''; summaryLoading.textContent = 'No grievances'; return; }
    const corpus = grievances.map(g=>`${g.title||''} ${g.description||''}`.trim());
    // build using TFIDF lib
    const tf = window.TFIDF ? null : null; // placeholder (we call TFIDF_run below)
    // run clustering
    const result = (typeof TFIDF !== 'undefined' && TFIDF.run) ? TFIDF.run(grievances) : [];
    clusters = result;
    renderClustersUI();
  } catch(e){
    console.error('clustering failed', e);
    summaryLoading.textContent = 'Clustering failed';
  }
}

function renderClustersUI(){
  clustersList.innerHTML = '';
  if(!clusters.length){ clustersList.innerHTML = '<div class="text-muted">No clusters found.</div>'; return; }
  clusters.forEach(cluster => {
    const row = document.createElement('div'); row.className = 'summary-cluster';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-weight:700">${cluster.size} — ${escapeHtml(cluster.area)}</div>
          <div class="small text-muted">${escapeHtml(cluster.keywords.join(', '))}</div>
          <div class="small text-muted mt-1">${escapeHtml(cluster.sample.slice(0,110))}${cluster.sample.length>110?'…':''}</div>
        </div>
        <div style="text-align:right">
          <div class="badge bg-light text-dark">${cluster.size}</div>
          <div style="margin-top:6px"><button class="btn btn-sm btn-outline-light btn-view" data-id="${cluster.clusterId}">View</button></div>
        </div>
      </div>`;
    clustersList.appendChild(row);
  });
  document.querySelectorAll('.btn-view').forEach(b=>b.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id; applyClusterFilter(id);
  }));
}

/* apply cluster filter */
function applyClusterFilter(clusterId){
  if(!clusterId) { window._selectedClusterIds = null; renderGrievances(); return; }
  const cluster = clusters.find(c=>c.clusterId===clusterId);
  if(!cluster) return;
  const ids = new Set(cluster.ids.map(i => grievances[i].id));
  window._selectedClusterIds = ids;
  // after applying, re-render list + center map
  renderGrievances();
  const pts = grievances.filter(g=>ids.has(g.id)).map(g => (g.latitude!==undefined && g.latitude!==null && g.longitude!==undefined && g.longitude!==null) ? [Number(g.latitude), Number(g.longitude)] : null).filter(Boolean);
  if(pts.length) try{ map.fitBounds(L.latLngBounds(pts), {padding:[40,40]}); } catch(e){}
}

/* summary panel controls */
summaryBtn.addEventListener('click', ()=>{ summaryPanel.classList.toggle('open'); dashboardWrap.classList.toggle('shifted'); if(summaryPanel.classList.contains('open')) runClientClustering(); });
collapseSummary.addEventListener('click', ()=>{ summaryPanel.classList.toggle('open'); dashboardWrap.classList.toggle('shifted'); });
clearCluster.addEventListener('click', ()=>{ window._selectedClusterIds = null; renderGrievances(); document.querySelectorAll('.summary-cluster').forEach(r=>r.style.outline='none'); });

/* scheduler for clustering to avoid heavy work on repeated updates */
let clusterTimer = null;
function scheduleClusterAndRender(){
  summaryLoading.textContent = 'Computing clusters…';
  if(clusterTimer) clearTimeout(clusterTimer);
  clusterTimer = setTimeout(()=>{ runClientClustering(); clusterTimer = null; }, 200);
  renderStats();
  renderGrievances();
}

/* run clustering on load */
function runClientClusteringWrapper(){ scheduleClusterAndRender(); }

/* initial call made after snapshot */
function scheduleInitial(){ setTimeout(()=>{ if(grievances.length) scheduleClusterAndRender(); else summaryLoading.textContent='Waiting for grievances'; }, 350); }

/* Expose helpers for outside debugging */
window._admin_helpers = { runClientClustering, applyClusterFilter, renderGrievances };

/* wire global _admin API */
window._admin = {
  login, signOut, toggleSummary: ()=>{ summaryPanel.classList.toggle('open'); dashboardWrap.classList.toggle('shifted'); runClientClustering(); }, openDetail: onRowClick
};

/* Start initial */
scheduleInitial();
