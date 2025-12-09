/* tfidf.js — client side TF-IDF + clustering */

// tokenize
function tf_tokenize(text){
  if(!text) return [];
  return text.toLowerCase().replace(/[’‘“”]/g,"'").replace(/[^a-z0-9\s\-]/g,' ')
    .split(/\s+/).filter(t=>t.length>2 && !/^\d+$/.test(t));
}

// detect area heuristic
function tf_detectArea(text){
  if(!text) return null;
  const pats = ['peth','nagar','colony','vihar','bagh','gaon','chowk','market','ward','block','sector','layout'];
  const regex = new RegExp('\\b([A-Za-z]+(?:\\s+[A-Za-z]+){0,2})\\s+(?:' + pats.join('|') + ')\\b','i');
  const m = text.match(regex); if(m) return m[0].trim();
  return null;
}

// build tf-idf
function tf_buildTfIdf(corpus){
  const docsTokens = corpus.map(t=>tf_tokenize(t));
  const vocab = new Map(); let idx=0;
  docsTokens.forEach(tokens=>{ tokens.forEach(tok=>{ if(!vocab.has(tok)) vocab.set(tok, idx++); }); });
  const N = docsTokens.length;
  const df = new Float32Array(vocab.size);
  docsTokens.forEach(tokens=>{ const set = new Set(tokens); set.forEach(tok=>{ const i=vocab.get(tok); if(i!==undefined) df[i] += 1; }); });
  const idf = new Float32Array(vocab.size);
  for(const [tok,i] of vocab.entries()) idf[i] = Math.log((N+1)/(df[i]+1)) + 1;
  const vectors = docsTokens.map(tokens=>{
    const tf = new Map();
    tokens.forEach(tok=>{ const i=vocab.get(tok); if(i!==undefined) tf.set(i,(tf.get(i)||0)+1); });
    const vec = new Map(); let norm=0;
    for(const [i,cnt] of tf.entries()){ const val = (cnt/tokens.length) * idf[i]; vec.set(i,val); norm += val*val; }
    norm = Math.sqrt(norm) || 1;
    for(const [i,v] of vec.entries()) vec.set(i, v/norm);
    return vec;
  });
  return {vocab, idf, vectors, docsTokens};
}

// cosine
function tf_cosine(a,b){
  if(!a||!b) return 0;
  const [small,big] = a.size < b.size ? [a,b] : [b,a];
  let s=0;
  for(const [k,v] of small.entries()){ const bv = big.get(k); if(bv) s += v*bv; }
  return s;
}

// greedy clusters
function tf_greedy(vectors, threshold=0.33){
  const clusters=[];
  for(let i=0;i<vectors.length;i++){
    const vec = vectors[i];
    let best = {idx:-1,sim:-1};
    for(let c=0;c<clusters.length;c++){
      const sim = tf_cosine(vec, clusters[c].centroid);
      if(sim>best.sim) best={idx:c,sim};
    }
    if(best.idx !== -1 && best.sim >= threshold){
      clusters[best.idx].ids.push(i);
      const centroid = new Map(clusters[best.idx].centroid);
      for(const [k,v] of vec.entries()) centroid.set(k, (centroid.get(k)||0)+v);
      let norm=0; for(const v of centroid.values()) norm+=v*v; norm=Math.sqrt(norm)||1;
      for(const [k,v] of centroid.entries()) centroid.set(k, v/norm);
      clusters[best.idx].centroid = centroid;
    } else {
      clusters.push({ids:[i], centroid:new Map(vec)});
    }
  }
  return clusters;
}

function tf_topKeywords(centroid, vocabMap, k=4){
  const inv = []; for(const [tok,i] of vocabMap.entries()) inv[i]=tok;
  const arr = []; centroid.forEach((v,i)=>arr.push([i,v])); arr.sort((a,b)=>b[1]-a[1]);
  return arr.slice(0,k).map(x=>inv[x[0]]).filter(Boolean);
}

function TFIDF_run(grievances){
  if(!grievances || grievances.length===0) return [];
  const corpus = grievances.map(g=>`${g.title||''} ${g.description||''}`.trim());
  const tf = tf_buildTfIdf(corpus);
  const raw = tf_greedy(tf.vectors, 0.33);
  const clusters = raw.map((c, idx)=>{
    const ids = c.ids;
    const sample = corpus[ids[0]] || '';
    const areaCounts = {}; ids.forEach(i=>{ const a = grievances[i].area || tf_detectArea(corpus[i]); if(a) areaCounts[a] = (areaCounts[a]||0)+1; });
    const area = Object.keys(areaCounts).length ? Object.entries(areaCounts).sort((a,b)=>b[1]-a[1])[0][0] : (grievances[ids[0]]?.area || tf_detectArea(sample) || 'Unknown');
    const keywords = tf_topKeywords(c.centroid, tf.vocab, 4);
    return { clusterId:'cluster_'+idx, size: ids.length, ids, sample, area, keywords };
  });
  clusters.sort((a,b)=>b.size - a.size);
  return clusters;
}

// expose
window.TFIDF = { run: TFIDF_run };
