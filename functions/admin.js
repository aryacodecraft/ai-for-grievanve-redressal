/* admin.js — TF-IDF-only summary (preserves TF-IDF UI like screenshot)
   - Paste this entire file as admin.js
   - Requires tfidf.js (if absent, UI shows "TFIDF not available")
*/

/* FIREBASE CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyAWTsTs_NEav91LKQ5jLrVf3ojsLYAY4XI",
  authDomain: "grievance-redressal-syst-627d7.firebaseapp.com",
  projectId: "grievance-redressal-syst-627d7",
  storageBucket: "grievance-redressal-syst-627d7.firebasestorage.app",
  messagingSenderId: "47862331768",
  appId: "1:47862331768:web:423bb1a0ac46e259d1b08d",
  measurementId: "G-YX2Y3RFF3P"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ADMIN EMAILS */
const ADMIN_EMAILS = ["aryaadmin@gmail.com"];

/* UI elements */
const adminLoginSection = document.getElementById("adminLoginSection");
const dashboardSection = document.getElementById("dashboardSection");
const adminEmailSpan = document.getElementById("adminEmail");
const signOutBtn = document.getElementById("signOutBtn");
const statusEl = document.getElementById("status");
const dashboardWrap = document.getElementById("dashboardWrap");

const summaryPanel = document.getElementById("summaryPanel");
const summaryBtn = document.getElementById("summaryBtn");
const clustersList = document.getElementById("clustersList");

let grievances = [];
let unsubscribe = null;

/* pagination state */
let currentPage = 1;
let pageSize = 10;

/* map state */
let map = null;
let markersLayer = null;
const markersById = {};

/* TFIDF clusters only */
let tfidfClusters = [];

/* helpers */
function showStatus(msg, cls) {
  if (statusEl) {
    statusEl.innerText = msg;
    statusEl.className = `mt-2 text-center fw-bold ${cls || ""}`;
    setTimeout(()=> { if (statusEl.innerText === msg) statusEl.innerText = ""; }, 3500);
  } else {
    console.log("STATUS:", msg);
  }
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* map init */
function initMap(){
  if (map) return;
  map = L.map("map").setView([20.5937,78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
  markersLayer = L.featureGroup().addTo(map);
  setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} }, 300);
}

/* auth */
auth.onAuthStateChanged(user=>{
  if(!user){
    if(adminLoginSection) adminLoginSection.style.display = "block";
    if(dashboardSection) dashboardSection.style.display = "none";
    if(adminEmailSpan) adminEmailSpan.innerText = "";
    if(signOutBtn) signOutBtn.style.display = "none";
    if(unsubscribe){ try{ unsubscribe(); } catch(e){} }
    return;
  }

  if(!ADMIN_EMAILS.includes(user.email)){
    showStatus("❌ You are signed in but not an admin.", "text-danger");
    auth.signOut();
    return;
  }

  if (adminEmailSpan) adminEmailSpan.innerText = user.email;
  if (adminLoginSection) adminLoginSection.style.display = "none";
  if (dashboardSection) dashboardSection.style.display = "block";
  if (signOutBtn) signOutBtn.style.display = "inline-block";
  showStatus("✅ Signed in as admin", "text-success");

  initMap();

  if(unsubscribe) { try{ unsubscribe(); } catch(e){} }
  // keep server ordering, but client may re-sort after filtering — that's expected
  unsubscribe = db.collection("grievances").orderBy("createdAt", "desc").onSnapshot(snap=>{
    grievances = [];
    snap.forEach(doc => grievances.push({ id: doc.id, ...doc.data() }));
    currentPage = 1;
    renderStats();
    runClientClustering();
    renderGrievances();
  }, err=>{
    console.error("snapshot error", err);
    showStatus("❌ Failed loading grievances", "text-danger");
  });
});

/* debug login */
async function login(){
  const email = (document.getElementById("adminEmailInput") || {}).value?.trim() || "";
  const password = (document.getElementById("adminPasswordInput") || {}).value?.trim() || "";
  if(!email || !password){ showStatus("⚠️ Enter email & password","text-warning"); return; }
  try{
    const res = await auth.signInWithEmailAndPassword(email, password);
    console.info("signIn result", res);
    showStatus("✅ Signed in — waiting for auth state...", "text-success");
  }catch(err){
    console.error("login err", err);
    const msg = err?.code ? `${err.code} — ${err.message}` : (err?.message || String(err));
    showStatus("❌ Login failed: "+msg, "text-danger");
  }
}
function signOut(){ auth.signOut(); }

/* stats */
function renderStats(){
  const total = grievances.length;
  let highOpen=0, medOpen=0, resolved=0;
  grievances.forEach(g=>{
    const status = (g.status || "open").toLowerCase();
    const p = (g.hfEngine?.priority || "low").toLowerCase();
    if(status === "resolved") resolved++; else { if(p==="high") highOpen++; if(p==="medium") medOpen++; }
  });
  document.getElementById("statTotal").innerText = total;
  document.getElementById("statHighOpen").innerText = highOpen;
  document.getElementById("statMediumOpen").innerText = medOpen;
  document.getElementById("statResolved").innerText = resolved;
}

/* filters + render list */
function onFilterChange(){ currentPage = 1; renderGrievances(); }
function onPageSizeChange(){ pageSize = Number(document.getElementById("pageSizeSelect").value) || 10; currentPage = 1; renderGrievances(); }
function priorityWeight(p){ if(p==="high") return 3; if(p==="medium") return 2; return 1; }

/* normalize various createdAt shapes into ms epoch */
function asEpoch(x){
  if(!x) return 0;
  // Firestore Timestamp
  if(typeof x.toDate === "function") {
    try { return x.toDate().getTime(); } catch(e) {}
  }
  // Date object
  if(x instanceof Date) return x.getTime();
  // number: seconds or ms
  if(typeof x === "number") {
    return x > 1e12 ? x : x * 1000;
  }
  // string (ISO)
  if(typeof x === "string") {
    const t = Date.parse(x);
    if(!Number.isNaN(t)) return t;
  }
  return 0;
}

function renderGrievances(){
  const listEl = document.getElementById("grievanceList");
  if(!listEl) return;
  if(!grievances.length){ listEl.innerHTML = `<div class="text-center text-muted py-5">No grievances yet</div>`; updateMapMarkers([]); return; }

  const priorityFilter = document.getElementById("priorityFilter").value;
  const categoryFilter = document.getElementById("categoryFilter").value;
  const statusFilter = document.getElementById("statusFilter").value;
  const searchText = (document.getElementById("searchInput").value || "").trim().toLowerCase();
  const rawSortVal = (document.getElementById("sortOrder") || {}).value || "newest";
  const sortLower = String(rawSortVal).toLowerCase();
  const wantOldest = sortLower.includes("old") || sortLower.includes("oldest");

  let filtered = grievances.filter(g=>{
    const hf = g.hfEngine || {};
    const pr = (hf.priority || "low").toLowerCase();
    const cat = (hf.category || "other").toLowerCase();
    const st = (g.status || "open").toLowerCase();
    if(priorityFilter !== "all" && pr !== priorityFilter) return false;
    if(categoryFilter !== "all" && cat !== categoryFilter) return false;
    if(statusFilter !== "all" && st !== statusFilter) return false;
    if(searchText){
      const blob = `${g.title || ""} ${g.description || ""}`.toLowerCase();
      if(!blob.includes(searchText)) return false;
    }
    return true;
  });

  // cluster filter:
  if(window._selectedClusterIds && window._selectedClusterIds.size){
    filtered = filtered.filter(g => window._selectedClusterIds.has(g.id));
  }

  // SORT: date PRIMARY (newest/oldest), priority SECONDARY (high->low), then createdAt fallback to 0
  filtered.sort((a,b)=>{
    const ta = asEpoch(a.createdAt);
    const tb = asEpoch(b.createdAt);
    if(ta !== tb){
      // if user wants oldest first, smaller epoch should come first
      return wantOldest ? ta - tb : tb - ta;
    }
    // tie-breaker: priority (high -> low)
    const pa = priorityWeight(a.hfEngine?.priority || "low");
    const pb = priorityWeight(b.hfEngine?.priority || "low");
    if(pa !== pb) return pb - pa;
    // final tiebreaker: createdAt string compare (stable)
    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if(currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  document.getElementById("listMeta").innerText = `${totalItems} items • page ${currentPage} of ${totalPages}`;

  let html = "";
  pageItems.forEach(g=>{
    const hf = g.hfEngine || {};
    const priority = hf.priority || "low";
    const category = hf.category || "other";
    const urgent = !!hf.isUrgent;
    const status = g.status || "open";
    // try to format createdAt nicely: prefer createdAt.toDate if present
    let createdDate = null;
    try { createdDate = (g.createdAt && typeof g.createdAt.toDate === 'function') ? g.createdAt.toDate() : (g.createdAt instanceof Date ? g.createdAt : (typeof g.createdAt === 'number' ? new Date(asEpoch(g.createdAt)) : (typeof g.createdAt === 'string' ? new Date(asEpoch(g.createdAt)) : null))); } catch(e) { createdDate = null; }
    const created = createdDate || new Date();
    const createdStr = created.toLocaleDateString() + " " + created.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
    const badgeClass = priority==="high" ? "badge-priority-high" : (priority==="medium" ? "badge-priority-medium" : "badge-priority-low");

    html += `
      <div class="grievance-row" onclick="onRowClick('${g.id}')">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="d-flex align-items-center mb-1">
              <strong>${escapeHtml(g.title || "Untitled")}</strong>
              <span class="badge ms-2 ${badgeClass}">${escapeHtml(priority)}</span>
              ${urgent ? `<span class="badge ms-2 badge-urgent">URGENT</span>` : ""}
              <span class="badge ms-2 bg-secondary">${escapeHtml(category)}</span>
            </div>
            <div class="mb-1 small text-muted">
              ${escapeHtml((g.description || "").slice(0,140))}
              ${(g.description || "").length > 140 ? "..." : ""}
            </div>
            <div class="small text-muted">
              <span class="me-3"><span class="small-label">Created:</span> ${escapeHtml(createdStr)}</span>
              <span class="me-3"><span class="small-label">User:</span> ${escapeHtml(g.userId || "-")}</span>
            </div>
          </div>

          <div class="text-end">
            <button class="btn btn-sm btn-outline-light mb-2" onclick="event.stopPropagation(); onRowClick('${g.id}')">Open</button>
            ${status === "open"
              ? `<button id="resolve-btn-${g.id}" class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); markResolved('${g.id}', this)">Resolve</button>`
              : `<button class="btn btn-sm btn-secondary" disabled>Resolved</button>`
            }
          </div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
  renderPaginationControls(totalItems);
  updateMapMarkers(filtered);
}

/* pagination */
function renderPaginationControls(totalItems){
  const el = document.getElementById("paginationButtons");
  if(!el) return;
  el.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const prev = document.createElement("button"); prev.className = "btn btn-sm btn-outline-light page-btn"; prev.innerText = "Prev"; prev.disabled = currentPage <= 1;
  prev.onclick = ()=>{ if(currentPage>1){ currentPage--; renderGrievances(); } }; el.appendChild(prev);

  const maxButtons = Math.min(7, totalPages);
  let start = Math.max(1, currentPage - 3);
  let end = Math.min(totalPages, start + maxButtons - 1);
  for(let i=start;i<=end;i++){
    const b = document.createElement("button");
    b.className = `btn btn-sm ${i===currentPage ? "btn-primary" : "btn-outline-light"} page-btn`;
    b.innerText = i;
    b.onclick = ()=>{ currentPage = i; renderGrievances(); };
    el.appendChild(b);
  }

  const next = document.createElement("button"); next.className = "btn btn-sm btn-outline-light page-btn"; next.innerText = "Next"; next.disabled = currentPage >= totalPages;
  next.onclick = ()=>{ if(currentPage<totalPages){ currentPage++; renderGrievances(); } }; el.appendChild(next);

  setTimeout(()=>{ try{ map?.invalidateSize(); }catch(e){} }, 150);
}

/* mark resolved */
async function markResolved(id, btnEl){
  try{
    if(btnEl){ btnEl.disabled = true; btnEl.innerText = "Resolving..."; }
    await db.collection("grievances").doc(id).update({ status: "resolved" });
    const idx = grievances.findIndex(x => x.id === id);
    if(idx !== -1) grievances[idx].status = "resolved";
    renderStats();
    renderGrievances();
    runClientClustering();
    showStatus("✅ Marked resolved", "text-success");
  }catch(e){
    console.error("markResolved error", e);
    if(btnEl){ btnEl.disabled = false; btnEl.innerText = "Resolve"; }
    showStatus("❌ Failed to update status", "text-danger");
  }
}

/* map markers */
function updateMapMarkers(list){
  if(!map || !markersLayer) return;
  markersLayer.clearLayers();
  for(const k in markersById) delete markersById[k];
  const pts = [];
  list.forEach(g=>{
    const lat = Number(g.latitude);
    const lon = Number(g.longitude);
    if(Number.isNaN(lat) || Number.isNaN(lon)) return;
    const marker = L.marker([lat, lon]).addTo(markersLayer);
    markersById[g.id] = marker;
    marker.bindPopup(`<strong>${escapeHtml(g.title || "Untitled")}</strong><br/>${escapeHtml(g.userId || "-")}`);
    pts.push([lat, lon]);
  });
  if(pts.length) try{ map.fitBounds(pts, { padding: [40,40] }); }catch(e){}
}

/* focus marker */
function focusOnMarker(id){ const m = markersById[id]; if(m){ try{ map.setView(m.getLatLng(),15); m.openPopup(); }catch(e){} } else showStatus("ℹ️ No location for this grievance","text-info"); }

/* detail modal */
function onRowClick(id){
  const g = grievances.find(x => x.id === id);
  if(!g) return;
  showDetailModal(g);
  if(g.latitude != null && g.longitude != null) focusOnMarker(id);
}

function showDetailModal(g){
  const m = document.getElementById("grievance-detail-modal");
  if(!m) return;
  m.style.display = "block";
  m.classList.add("center");

  const hf = g.hfEngine || {};
  const priority = (hf.priority || "low").toUpperCase();
  const cat = (hf.category || "other").toUpperCase();

  document.getElementById("gd-title").innerText = g.title || "Untitled";
  document.getElementById("gd-desc").innerText = g.description || "";

  const priorityColor = priority === "HIGH" ? "#ff5252" : (priority === "MEDIUM" ? "#ffb300" : "#66bb6a");
  document.getElementById("gd-badges").innerHTML = `
    <span style="background:${priorityColor};padding:4px 8px;border-radius:999px;color:white">${priority}</span>
    ${hf.isUrgent ? `<span style="background:#ff1744;padding:4px 8px;border-radius:999px;color:white;margin-left:6px">URGENT</span>` : ""}
    <span style="background:#6c757d;padding:4px 8px;border-radius:999px;color:white;margin-left:6px">${cat}</span>
  `;

  const created = g.createdAt?.toDate?.() || new Date();
  document.getElementById("gd-meta").innerHTML = `
    <div><strong>Created:</strong> ${created.toLocaleString()}</div>
    <div><strong>User:</strong> ${escapeHtml(g.userId || "-")}</div>
    <div><strong>Keywords:</strong> ${(hf.keywords || []).slice(0,6).join(", ")}</div>
  `;

  document.getElementById("gd-latlon").innerHTML = (g.latitude != null && g.longitude != null)
    ? `<strong>Lat/Lon:</strong> ${Number(g.latitude).toFixed(6)}, ${Number(g.longitude).toFixed(6)}`
    : `<strong>Lat/Lon:</strong> Not provided`;

  const mapBtn = document.getElementById("gd-map-btn"); if(mapBtn) mapBtn.onclick = ()=> focusOnMarker(g.id);
  const resolveBtn = document.getElementById("gd-resolve-btn"); if(resolveBtn) resolveBtn.onclick = async (e)=>{ e.stopPropagation(); await markResolved(g.id); hideDetailModal(); };
}

function hideDetailModal(){ const m = document.getElementById("grievance-detail-modal"); if(!m) return; m.style.display = "none"; m.classList.remove("center"); }

/* robust close wiring */
(function wireModalClose(){
  const old = document.getElementById("gd-close");
  if(old && old.parentNode){ const clone = old.cloneNode(true); old.parentNode.replaceChild(clone, old); }
  const btn = document.getElementById("gd-close");
  if(btn) btn.addEventListener("click", e=>{ e.preventDefault(); e.stopPropagation(); hideDetailModal(); });
  document.addEventListener("click", e=>{
    const modal = document.getElementById("grievance-detail-modal");
    if(!modal || modal.style.display !== "block") return;
    if(!modal.contains(e.target)) hideDetailModal();
  });
  document.addEventListener("keydown", e=>{
    if(e.key === "Escape"){ const modal = document.getElementById("grievance-detail-modal"); if(modal && modal.style.display === "block") hideDetailModal(); }
  });
})();

/* TF-IDF clustering (only) */
/* run client clustering: TF-IDF only */
function runClientClustering(){
  tfidfClusters = [];
  if(window.TFIDF && TFIDF.run){
    try{
      tfidfClusters = TFIDF.run(grievances || []);
      renderTfidfClustersUI();
    }catch(e){
      console.warn("tfidf failed", e);
      tfidfClusters = [];
      const tfDiv = document.getElementById("tfidfClusters");
      if(tfDiv) tfDiv.innerHTML = "<div class='text-muted'>TFIDF clustering failed</div>";
    }
  } else {
    const tfDiv = document.getElementById("tfidfClusters");
    if(tfDiv) tfDiv.innerHTML = "<div class='text-muted'>TFIDF not available</div>";
  }
}

/* render TF-IDF clusters in the same style as your screenshot */
function renderTfidfClustersUI(){
  if(!clustersList) return;
  // create top header
  clustersList.innerHTML = `<div style="font-weight:700;margin-bottom:8px;">TF-IDF clusters</div>`;
  const tfDiv = document.createElement("div"); tfDiv.id = "tfidfClusters"; tfDiv.style.marginTop = "8px";
  clustersList.appendChild(tfDiv);

  if(!tfidfClusters || !tfidfClusters.length){
    tfDiv.innerHTML = "<div class='text-muted'>No TF-IDF clusters</div>";
    return;
  }

  // render clusters as cards like screenshot
  tfDiv.innerHTML = "";
  tfidfClusters.forEach(c=>{
    // area in TFIDF output may be absent; show 'Unknown' to match screenshot
    const title = c.area || "Unknown";
    const keywords = Array.isArray(c.keywords) ? c.keywords.slice(0,6).join(", ") : "";
    const sample = (c.sample || "").slice(0,120);
    const size = c.size || (Array.isArray(c.ids) ? c.ids.length : 1);
    // single cluster block
    const block = document.createElement("div");
    block.className = "summary-cluster";
    block.style.display = "flex";
    block.style.justifyContent = "space-between";
    block.style.alignItems = "center";
    block.style.padding = "10px";
    block.style.marginBottom = "8px";
    block.innerHTML = `
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</div>
        <div class="small text-muted" style="margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(keywords)}</div>
        <div class="small text-muted mt-1" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(sample)}</div>
      </div>
      <div style="flex:0 0 auto;margin-left:8px;text-align:right">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div class="badge bg-light text-dark" style="font-size:0.9rem;padding:6px 8px;border-radius:10px">${size}</div>
          <button class="btn btn-sm btn-outline-light btn-tview" data-id="${escapeHtml(c.clusterId || "")}" style="padding:6px 10px">View</button>
        </div>
      </div>
    `;
    tfDiv.appendChild(block);
  });

  // wire view buttons
  document.querySelectorAll(".btn-tview").forEach(b=>b.addEventListener("click", e=>{ const id = e.currentTarget.dataset.id; applyClusterFilter(id); }));
}

/* apply TFIDF cluster filter */
function applyClusterFilter(clusterId){
  if(!clusterId) { window._selectedClusterIds = null; renderGrievances(); return; }
  const c = tfidfClusters.find(x => String(x.clusterId) === String(clusterId));
  if(!c) return;
  const ids = new Set((c.ids || []).slice(0).map(i => {
    // TFIDF might store direct doc ids or indices — handle both
    const maybeId = typeof i === "string" ? i : (grievances[i]?.id || null);
    return maybeId;
  }).filter(Boolean));
  window._selectedClusterIds = ids;
  renderGrievances();
}

/* expose admin API safely */
window._admin = window._admin || {};
window._admin.login = login;
window._admin.signOut = signOut;
window._admin.openDetail = onRowClick;
window._admin.applyClusterFilter = applyClusterFilter;

/* summary toggle */
if(summaryBtn) summaryBtn.onclick = ()=>{ if(!summaryPanel || !dashboardWrap) return; summaryPanel.classList.toggle("open"); dashboardWrap.classList.toggle("shifted"); runClientClustering(); };

/* initial run if data present */
setTimeout(()=>{ if(grievances && grievances.length) runClientClustering(); }, 350);
