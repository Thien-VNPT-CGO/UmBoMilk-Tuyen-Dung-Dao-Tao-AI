(function(){
  var SHIFT_ROWS = { sang: 'CA_SANG', trua: 'CA_CHIEU', chieu: 'CA_TOI' };
  var SHIFT_HINTS = [
    { re: /7\s*h?\s*[-–]\s*12\s*h/i, shift: 'CA_SANG' },
    { re: /12\s*h?\s*[-–]\s*18\s*h/i, shift: 'CA_CHIEU' },
    { re: /18\s*h?\s*[-–]\s*23\s*h/i, shift: 'CA_TOI' }
  ];
  var SKIP_RES = [/^c[oô]t\s*1$/, /q\s*\.?\s*l[yý]/, /kiem tra/, /^cn\s*\d+$/, /^(thu|chu)/];

  function norm(s){
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function levenshtein(a, b){
    var m = a.length, n = b.length;
    if(!m) return n;
    if(!n) return m;
    var d = [];
    for(var i = 0; i <= m; i++) d[i] = [i];
    for(var j = 0; j <= n; j++) d[0][j] = j;
    for(i = 1; i <= m; i++){
      for(j = 1; j <= n; j++){
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      }
    }
    return d[m][n];
  }
  function similarity(a, b){
    a = norm(a); b = norm(b);
    if(!a || !b) return 0;
    if(a === b) return 1;
    var ml = Math.max(a.length, b.length);
    return 1 - levenshtein(a, b) / ml;
  }
  function matchName(text, roster, branchId){
    var nt = norm(text).split(' ').filter(Boolean);
    if(!nt.length) return null;
    var best = null;
    (roster || []).forEach(function(r){
      var nr = norm(r.name).split(' ').filter(Boolean);
      var s = similarity(text, r.name);
      if(nt.length && nr.length && (nt.every(function(t){ return nr.indexOf(t) >= 0; }) || nr.every(function(t){ return nt.indexOf(t) >= 0; }))){
        s = Math.max(s, 0.9);
      }
      if(branchId && r.branchId && r.branchId !== branchId) s -= 0.15;
      if(!best || s > best.score) best = { employeeId: r.employeeId, name: r.name, score: s };
    });
    if(!best || best.score < 0.55) return null;
    return best;
  }
  function isoFromDMY(text){
    var m = String(text).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(!m) return null;
    return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  function mondayOf(iso){
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var IMAGE_BRANCH_MAP = { '111': 'CN4', '120': 'CN3', '130': 'CN1', '261': 'CN2' };
  function detectImageBranch(words){
    for(var i = 0; i < words.length; i++){
      var m = norm(words[i].text).match(/\bcn\s*(\d{3})\b/);
      if(m && IMAGE_BRANCH_MAP[m[1]]) return { label: m[1], branchId: IMAGE_BRANCH_MAP[m[1]] };
    }
    return null;
  }
  function shiftHintOf(text){
    for(var i = 0; i < SHIFT_HINTS.length; i++){
      if(SHIFT_HINTS[i].re.test(text)) return SHIFT_HINTS[i].shift;
    }
    return null;
  }
  function parseTsv(tsv){
    var words = [];
    String(tsv || '').split('\n').forEach(function(line, idx){
      if(idx === 0) return;
      var c = line.split('\t');
      if(c[0] !== '5') return;
      var text = (c[11] || '').trim();
      var conf = parseFloat(c[10]);
      if(!text || !(conf >= 30)) return;
      var x0 = +c[6], y0 = +c[7], w = +c[8], h = +c[9];
      words.push({ text: text, x0: x0, y0: y0, x1: x0 + w, y1: y0 + h, bk: c[1] + '/' + c[2] + '/' + c[3] + '/' + c[4] });
    });
    return words;
  }
  function median(arr){
    if(!arr.length) return 0;
    var s = arr.slice().sort(function(a, b){ return a - b; });
    return s[Math.floor(s.length / 2)];
  }
  function mapGrid(words, roster, opts){
    opts = opts || {};
    var dates = [];
    var dateSeen = {};
    words.forEach(function(w){
      var iso = isoFromDMY(w.text);
      if(iso && !dateSeen[iso]){
        dateSeen[iso] = true;
        dates.push({ date: iso, x: (w.x0 + w.x1) / 2 });
      }
    });
    dates.sort(function(a, b){ return a.x - b.x; });
    if(!dates.length) return { error: 'NO_DATES' };
    var minDateX = Math.min.apply(null, dates.map(function(d){ return d.x; }));
    var gaps = [];
    for(var i = 1; i < dates.length; i++) gaps.push(dates[i].x - dates[i - 1].x);
    var colTol = (gaps.length ? Math.min.apply(null, gaps) : 240) * 0.6;
    var rows = [];
    words.forEach(function(w){
      var n = norm(w.text).split(' ')[0];
      if(SHIFT_ROWS[n] && w.x0 < minDateX && !rows.some(function(r){ return r.shift === SHIFT_ROWS[n]; })){
        rows.push({ shift: SHIFT_ROWS[n], y: (w.y0 + w.y1) / 2 });
      }
    });
    rows.sort(function(a, b){ return a.y - b.y; });
    if(!rows.length) return { error: 'NO_SHIFT_ROWS' };
    var rowGaps = [];
    for(var j = 1; j < rows.length; j++) rowGaps.push(rows[j].y - rows[j - 1].y);
    var rowTol = Math.max(60, (rowGaps.length ? Math.min.apply(null, rowGaps) : 160) * 0.5);
    var actionable = words.filter(function(w){
      if(isoFromDMY(w.text)) return false;
      var n = norm(w.text);
      if(SHIFT_ROWS[n.split(' ')[0]]) return false;
      return true;
    });
    var heights = actionable.map(function(w){ return w.y1 - w.y0; });
    var lineTol = Math.max(10, median(heights) * 0.8);
    var sorted = actionable.slice().sort(function(a, b){ return ((a.y0 + a.y1) / 2) - ((b.y0 + b.y1) / 2); });
    var useKeys = sorted.length > 0 && sorted.every(function(w){ return !!w.bk; });
    var lines = [];
    if(useKeys){
      var byKey = {};
      sorted.forEach(function(w){
        if(!byKey[w.bk]) byKey[w.bk] = [];
        byKey[w.bk].push(w);
      });
      Object.keys(byKey).forEach(function(k){
        var ws = byKey[k];
        var yc = ws.reduce(function(s, w){ return s + (w.y0 + w.y1) / 2; }, 0) / ws.length;
        lines.push({ yc: yc, words: ws });
      });
      lines.sort(function(a, b){ return a.yc - b.yc || Math.min.apply(null, a.words.map(function(w){ return w.x0; })) - Math.min.apply(null, b.words.map(function(w){ return w.x0; })); });
    } else {
      sorted.forEach(function(w){
        var yc = (w.y0 + w.y1) / 2;
        var last = lines[lines.length - 1];
        if(last && Math.abs(yc - last.yc) <= lineTol) last.words.push(w);
        else lines.push({ yc: yc, words: [w] });
      });
    }
    var entries = [], unmatched = [], skipped = 0;
    lines.forEach(function(line){
      var ordered = line.words.slice().sort(function(a, b){ return a.x0 - b.x0; });
      var text = ordered.map(function(w){ return w.text; }).join(' ');
      var xc = ordered.reduce(function(s, w){ return s + (w.x0 + w.x1) / 2; }, 0) / ordered.length;
      var n = norm(text);
      if(!n || SKIP_RES.some(function(re){ return re.test(n); })){ skipped++; return; }
      var col = null, bd = Infinity;
      dates.forEach(function(d){ var dd = Math.abs(xc - d.x); if(dd < bd){ bd = dd; col = d; } });
      if(!col || bd > colTol){ skipped++; return; }
      var row = null, rd = Infinity;
      rows.forEach(function(r){ var dd2 = Math.abs(line.yc - r.y); if(dd2 < rd){ rd = dd2; row = r; } });
      if(!row || rd > rowTol){ skipped++; return; }
      var hint = shiftHintOf(text);
      var clean = text.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
      if(!norm(clean)){ skipped++; return; }
      var m = matchName(clean, roster, opts.branchId);
      var conf = m ? m.score : 0;
      if(hint && hint !== row.shift) conf = Math.max(0, conf - 0.2);
      else if(hint) conf = Math.min(1, conf + 0.05);
      if(!m){ unmatched.push({ text: clean, date: col.date, shift: row.shift }); return; }
      entries.push({ employeeId: m.employeeId, name: m.name, date: col.date, shift: row.shift, confidence: Math.round(conf * 100) / 100, text: clean });
    });
    var minDate = dates.map(function(d){ return d.date; }).sort()[0];
    var sum = 0, cnt = 0;
    entries.forEach(function(e){ sum += e.confidence; cnt++; });
    return { weekStart: mondayOf(minDate), dates: dates.map(function(d){ return d.date; }), imageBranch: detectImageBranch(words), entries: entries, unmatched: unmatched, skipped: skipped, avgConfidence: cnt ? Math.round(sum / cnt * 100) / 100 : 0 };
  }
  function loadTesseract(){
    return new Promise(function(res, rej){
      if(window.Tesseract) return res();
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      sc.onload = function(){ res(); };
      sc.onerror = function(){ rej(new Error('LOAD_TESSERACT')); };
      document.head.appendChild(sc);
    });
  }
  async function extractFromImage(imageSrc, roster, opts, onProgress){
    opts = opts || {};
    await loadTesseract();
    var worker = await window.Tesseract.createWorker('vie', undefined, { logger: function(m){ if(onProgress) onProgress(m); } });
    try{
      var out = await worker.recognize(imageSrc);
      var data = out && out.data ? out.data : {};
      if(!data.tsv) return { error: 'OCR_NO_GEOMETRY' };
      return mapGrid(parseTsv(data.tsv), roster, opts);
    } finally {
      try{ await worker.terminate(); }catch(e){}
    }
  }
  var api = { norm: norm, similarity: similarity, matchName: matchName, isoFromDMY: isoFromDMY, mondayOf: mondayOf, shiftHintOf: shiftHintOf, parseTsv: parseTsv, mapGrid: mapGrid, extractFromImage: extractFromImage, detectImageBranch: detectImageBranch, IMAGE_BRANCH_MAP: IMAGE_BRANCH_MAP };
  if(typeof window !== 'undefined') window.ScheduleOCR = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
