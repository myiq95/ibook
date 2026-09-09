
// V15 Bridge - Thermal Optimized
(function(){
  const isNative = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tts);
  if(!isNative) return;
  window.NativeTTS = {
    speak(t){ let txt=(t||"").trim(); if(!txt) return; txt=txt.replace(/\./g,' ').replace(/\?/g,' ').replace(/=/g,' ').replace(/'/g,' ').replace(/"/g,' ').replace(/\s+/g,' ').trim(); if(!txt) return; try{ window.webkit.messageHandlers.tts.postMessage({action:'speak', text:txt, rate:0.5, lang:'ko-KR'}); }catch(e){} },
    pause(){ try{ window.webkit.messageHandlers.tts.postMessage({action:'pause'}) }catch(e){} },
    resume(){ try{ window.webkit.messageHandlers.tts.postMessage({action:'resume'}) }catch(e){} },
    stop(){ try{ window.webkit.messageHandlers.tts.postMessage({action:'stop'}) }catch(e){} }
  };
  const nativeSynth = {
    _speaking:false, _paused:false, _currentUtter:null,
    get speaking(){return this._speaking;}, get pending(){return false;}, get paused(){return this._paused;},
    speak(u){
      const txt=(u.text||"").trim(); if(!txt){ try{ u.onend&&u.onend(); }catch(e){} return; }
      this._speaking=true; this._paused=false; this._currentUtter=u;
      window.NativeTTS.speak(txt);
      // onstart는 50ms 후 한 번만
      setTimeout(()=>{ try{ u.onstart&&u.onstart(); }catch(e){} }, 50);
    },
    cancel(){ this._speaking=false; this._paused=false; try{ window.NativeTTS.stop(); }catch(e){} },
    pause(){ this._paused=true; window.NativeTTS.pause(); },
    resume(){ this._paused=false; window.NativeTTS.resume(); },
    getVoices(){return [];}
  };
  try{ Object.defineProperty(window,'speechSynthesis',{value:nativeSynth, configurable:true}); }catch(e){ window.speechSynthesis=nativeSynth; }
  window.onNativeTTSState=function(state){
    const s=window.speechSynthesis; const u=s._currentUtter;
    if(state==='playing'){ s._speaking=true; }
    else if(state==='paused'){ s._paused=true; }
    else if(state==='finished'){ s._speaking=false; s._paused=false; if(u){ try{ u.onend&&u.onend(); }catch(e){} } }
    else if(state==='stopped'){ s._speaking=false; }
  };
})();

/* =================================================================
   서재 — 프리미엄 독서 앱  |  app.js
   TXT · MD · DOCX · PDF · EPUB  →  통합 리더
   ================================================================= */
'use strict';

/* ---------- 설정 ---------- */
// CDN(jsdelivr)이 느리거나 차단된 환경에서도 TXT/MD/DOCX 읽기 등
// 나머지 기능은 살아있도록, pdfjsLib 로드 실패가 앱 전체를 멈추지 않게 방어한다.
if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/';
}
const COVER_COLORS = ['#9c5a2c','#6b4e8a','#3a6b5e','#a14a2e','#4a5a8a','#8a5a3a','#5a7a4a','#7a3a5a'];

/* ---------- 상태 ---------- */
const State = {
  books: [],            // 라이브러리
  current: null,        // { book, chapter, spread }
  perChapter: new Map(),// chapterKey -> { pages, spreads }
  bookmarks: loadBookmarks(),
  settings: loadSettings(),
  tts: { synth: window.speechSynthesis, voices: [], queue: [], idx: 0, speaking: false, paused: false, utter: null, rate: 1, keepAliveTimer: null, watchdogTimer: null },
  hideTimer: null,
};

/* ---------- DOM ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const el = {
  library: $('#libraryView'), reader: $('#readerView'),
  shelf: $('#shelf'), dropzone: $('#dropzone'), fileInput: $('#fileInput'),
  topbar: $('#topbar'), topTitle: $('#topTitle'), topAuthor: $('#topAuthor'),
  pages: $('#pages'), flow: $('#bookFlow'), readerBar: $('#readerBar'),
  flip: $('#flipOverlay'), flipFront: $('#flipFront'), flipBack: $('#flipBack'),
  progressFill: $('#progressFill'), progressKnob: $('#progressKnob'), progressTrack: $('#progressTrack'),
  pageLabel: $('#pageLabel'), chapterLabel: $('#chapterLabel'),
  tocList: $('#tocList'), bookmarkList: $('#bookmarkList'),
  searchInput: $('#searchInput'), searchResults: $('#searchResults'),
  tocPanel: $('#tocPanel'), bookmarkPanel: $('#bookmarkPanel'), searchPanel: $('#searchPanel'), settingsPanel: $('#settingsPanel'),
  scrim: $('#scrim'), toast: $('#toast'),
  ttsBar: $('#ttsBar'), ttsStatus: $('#ttsStatus'), ttsKeepAlive: $('#ttsKeepAlive'),
};

/* =================================================================
   저장소 (localStorage, 폴백 in-memory)
   ================================================================= */
function lsGet(k, def){ try { const v = localStorage.getItem(k); return v? JSON.parse(v): def; } catch { return def; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function loadBookmarks(){ const d = lsGet('seojae.bookmarks', []); return Array.isArray(d)? d: []; }
function saveBookmarks(){ lsSet('seojae.bookmarks', State.bookmarks); }
function loadSettings(){ const d = lsGet('seojae.settings', null); return Object.assign({ theme:'light', fontSize:19, lineHeight:1.8, font:'serif', ttsRate:1 }, d||{}); }
function saveSettings(){ lsSet('seojae.settings', State.settings); }
function posKey(bookId, ch){ return `${bookId}:${ch}`; }
function loadPosition(bookId){ const m = lsGet('seojae.positions', {}); return m[bookId] || { chapter:0, spread:0 }; }
function savePosition(bookId, chapter, spread){ const m = lsGet('seojae.positions', {}); m[bookId] = { chapter, spread }; lsSet('seojae.positions', m); }

/* =================================================================
   토스트 / 스크림 / 패널
   ================================================================= */
let toastTimer;
function toast(msg){ el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.toast.classList.remove('show'), 2200); }
function openPanel(panel){ closeAllPanels(); panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); el.scrim.hidden = false; requestAnimationFrame(()=>el.scrim.classList.add('show')); }
function closeAllPanels(){ $$('.panel.open').forEach(p=>{ p.classList.remove('open'); p.setAttribute('aria-hidden','true'); }); el.scrim.classList.remove('show'); setTimeout(()=>{ if(!$$('.panel.open').length) el.scrim.hidden = true; }, 200); }

/* =================================================================
   설정 적용
   ================================================================= */
function applySettings(){
  const s = State.settings;
  document.documentElement.setAttribute('data-theme', s.theme);
  document.documentElement.style.setProperty('--reader-font-size', s.fontSize + 'px');
  document.documentElement.style.setProperty('--reader-line-height', s.lineHeight);
  document.documentElement.style.setProperty('--reader-font',
    s.font === 'serif' ? "'Noto Serif KR', Georgia, 'Songti SC', serif"
                       : "'Pretendard', -apple-system, 'Segoe UI', sans-serif");
  // 세그먼트 active
  $$('#themeSeg .seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme === s.theme));
  $$('#lineHeightSeg .seg-btn').forEach(b=>b.classList.toggle('active', parseFloat(b.dataset.lh) === s.lineHeight));
  $$('#fontFamilySeg .seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.ff === s.font));
  $('#fontSize').value = s.fontSize;
  $('#ttsRate').value = s.ttsRate;
  State.tts.rate = s.ttsRate;
}
function bindSettings(){
  $$('#themeSeg .seg-btn').forEach(b=>b.addEventListener('click', ()=>{ State.settings.theme = b.dataset.theme; applySettings(); saveSettings(); if(State.current) repaginate(); }));
  $('#fontSize').addEventListener('input', e=>{ State.settings.fontSize = +e.target.value; applySettings(); saveSettings(); if(State.current) repaginate(); });
  $$('#lineHeightSeg .seg-btn').forEach(b=>b.addEventListener('click', ()=>{ State.settings.lineHeight = parseFloat(b.dataset.lh); applySettings(); saveSettings(); if(State.current) repaginate(); }));
  $$('#fontFamilySeg .seg-btn').forEach(b=>b.addEventListener('click', ()=>{ State.settings.font = b.dataset.ff; applySettings(); saveSettings(); if(State.current) repaginate(); }));
  $('#ttsRate').addEventListener('input', e=>{ State.settings.ttsRate = +e.target.value; State.tts.rate = +e.target.value; saveSettings(); });
}

/* =================================================================
   라이브러리 렌더링
   ================================================================= */
function renderShelf(){
  const wrap = document.createElement('div');
  wrap.className = 'shelf-grid';
  if(!State.books.length){ el.shelf.innerHTML = '<p class="shelf-empty">아직 불러온 책이 없습니다.<br/>위 영역에 파일을 드롭해 주세요.</p>'; return; }
  State.books.forEach(b=>{
    const card = document.createElement('button');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="bc-cover" style="background:linear-gradient(135deg, ${b.color}, ${shade(b.color,-20)})">
        <span class="bc-title">${escapeHtml(b.title)}</span>
      </div>
      <div class="bc-meta">
        <div class="bc-name">${escapeHtml(b.title)}</div>
        <div class="bc-sub">${labelForFormat(b.format)}${b.author? ' · '+escapeHtml(b.author):''}</div>
      </div>`;
    card.addEventListener('click', ()=>openBook(b.id));
    wrap.appendChild(card);
  });
  el.shelf.innerHTML = '<p class="shelf-title">내 서재</p>';
  el.shelf.appendChild(wrap);
}
function labelForFormat(f){ return ({txt:'텍스트',md:'마크다운',docx:'문서',pdf:'PDF',epub:'EPUB'})[f] || f; }

/* =================================================================
   파일 불러오기
   ================================================================= */
function handleFiles(fileList){
  const files = [...fileList];
  let done = 0;
  files.forEach(async (file)=>{
    try { const book = await parseFile(file); State.books.unshift(book); renderShelf(); toast(`「${book.title}」 불러오기 완료`); if(files.length===1) openBook(book.id); }
    catch(err){ console.error(err); toast(`불러오기 실패: ${file.name}`); }
  });
}
async function parseFile(file){
  const ext = (file.name.split('.').pop()||'').toLowerCase();
  const id = 'b'+Date.now()+Math.random().toString(36).slice(2,6);
  let result;
  if(ext==='txt'||ext==='text') result = await parseTxt(file);
  else if(ext==='md'||ext==='markdown') result = await parseMd(file);
  else if(ext==='docx') result = await parseDocx(file);
  else if(ext==='pdf') result = await parsePdf(file);
  else if(ext==='epub') result = await parseEpub(file);
  else throw new Error('지원하지 않는 형식: '+ext);
  return Object.assign({ id, format:ext, color: COVER_COLORS[State.books.length % COVER_COLORS.length], fileMod: file.lastModified }, result);
}

/* ---------- TXT ---------- */
async function parseTxt(file){
  const text = await file.text();
  const title = guessTitle(file.name);
  const chapters = splitTxtChapters(text);
  return { title, author:'', chapters };
}
function isTxtHeading(t){
  if(!t) return false;
  // 마크다운 헤더 # ~ ###### (명시적 마크업은 넉넉히 허용)
  if(/^#{1,6}\s+\S/.test(t) && t.length < 120) return true;
  // 자동 감지는 짧은 줄(챕터 제목)만 대상
  if(t.length >= 80) return false;
  // 제N장, 장N, Chapter N, 한자숫자 장 (줄 시작 기준)
  if(/^(제\s*\d+\s*[장절회편화부권]|장\s*\d+|chapter\s+\d+|제\s*[일이삼사오육칠팔구십]+\s*[장절회편부])/i.test(t)) return true;
  // 영문/숫자만으로 된 짧은 줄 (ALL-CAPS 챕터명)
  if(/^[A-Z0-9\s]{3,}$/.test(t)) return true;
  // 번호 챕터 "1. 제목", "10. 제목"
  if(/^\d+\.\s+\S/.test(t)) return true;
  return false;
}
function splitTxtChapters(text){
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const chapters = [];
  let cur = { title: '시작', lines: [], hasHeading: false };
  chapters.push(cur);
  for(const ln of lines){
    const t = ln.trim();
    if(t && isTxtHeading(t)){
      const title = t.replace(/^#{1,6}\s*/, '').trim() || t;
      const hasContent = cur.lines.some(l=>l.trim());
      if(hasContent){
        // 본문이 있으면 새 챕터 시작
        cur = { title, lines: [], hasHeading: true };
        chapters.push(cur);
      } else {
        // 현재 챕터가 비어있으면 제목만 갱신
        cur.title = title;
        cur.hasHeading = true;
      }
      continue;
    }
    cur.lines.push(ln);
  }
  return chapters.filter(c=>c.lines.some(l=>l.trim())).map(c=>{
    const body = txtLinesToHtml(c.lines);
    // 목차 표시용으로만 뽑아내고 본문에서는 사라지던 챕터 제목을,
    // 실제 헤딩 줄에서 뽑아낸 경우에 한해 챕터 첫머리에도 되살린다.
    const html = c.hasHeading ? `<h2>${escapeHtml(c.title)}</h2>${body}` : body;
    return { title: c.title, html };
  });
}
function txtLinesToHtml(lines){
  // 빈 줄 기준 단락, 단락 내 줄바꿈은 <br>
  const paras = []; let buf = [];
  for(const ln of lines){
    if(ln.trim()===''){ if(buf.length){ paras.push(buf); buf=[]; } }
    else buf.push(ln);
  }
  if(buf.length) paras.push(buf);
  if(!paras.length) paras.push(['']);
  return paras.map(p=>`<p>${p.map(escapeHtml).join('<br>')}</p>`).join('');
}

/* ---------- Markdown ---------- */
async function parseMd(file){
  const text = await file.text();
  const html = DOMPurify.sanitize(marked.parse(text, { breaks:true, gfm:true }), { ADD_ATTR:['id'] });
  const title = guessTitle(file.name);
  return { title, author:'', chapters: splitHtmlByHeadings(html) };
}

/* ---------- DOCX ---------- */
async function parseDocx(file){
  const ab = await file.arrayBuffer();
  const res = await mammoth.convertToHtml({ arrayBuffer: ab });
  let html = DOMPurify.sanitize(res.value, { ADD_ATTR:['id'] });
  const chapters = splitHtmlByHeadings(html);
  const meta = await mammoth.extractRawText({ arrayBuffer: ab }).catch(()=>({value:''}));
  return { title: guessTitle(file.name), author:'', chapters };
}
function splitHtmlByHeadings(html){
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const root = tpl.content;
  const chapters = [];
  let cur = { title: '시작', nodes: [] };
  chapters.push(cur);
  const isHeading = (n)=> n.nodeType===1 && /^H[1-3]$/.test(n.tagName);
  // 챕터를 유지할지 판단할 때 헤딩 자신은 "내용"으로 치지 않는다.
  // 헤딩을 본문에도 남기면서 이 기준까지 텍스트 유무로만 판단하면,
  // 문단 없이 제목만 있는 챕터(문서 맨 위 H1 등)가 목차에 빈 항목으로
  // 남아버린다.
  const hasBody = (nodes)=> nodes.some(n => !isHeading(n) && (n.textContent||'').trim().length > 0);
  root.childNodes.forEach(node=>{
    if(isHeading(node)){
      const title = node.textContent.trim()||'장';
      if(hasBody(cur.nodes)){
        // 헤딩 노드 자체를 새 챕터의 본문에도 그대로 들고 간다.
        // (목차용 제목만 뽑고 헤딩을 버리면 정작 챕터를 펼쳤을 때
        // 본문 첫머리에 제목이 보이지 않게 된다.)
        cur = { title, nodes: [node] };
        chapters.push(cur);
      } else {
        cur.title = title;
        cur.nodes.push(node);
      }
    } else cur.nodes.push(node);
  });
  return chapters.filter(c=>hasBody(c.nodes)).map(c=>{
    const div = document.createElement('div'); c.nodes.forEach(n=>div.appendChild(n.cloneNode(true)));
    return { title: c.title, html: div.innerHTML };
  });
}

/* ---------- PDF ---------- */
async function parsePdf(file){
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let title = file.name.replace(/\.pdf$/i,'');
  try { const m = await pdf.getMetadata(); if(m.info && m.info.Title) title = m.info.Title; } catch {}
  const chapters = [];
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // 줄 단위 그룹화 (y 좌표 기준)
    const lines = [];
    let curLine = null, lastY = null;
    for(const it of tc.items){
      if(!it.str) continue;
      const y = Math.round(it.transform[5]);
      if(lastY===null || Math.abs(y-lastY) > 3){ curLine = { y, texts: [] }; lines.push(curLine); }
      curLine.texts.push(it.str);
      lastY = y;
    }
    // 줄 간격으로 문단 병합: 이전 줄과의 간격이 줄높이의 1.6배 이상이면 문단 구분
    const heights = lines.map((l,i)=> i>0 ? Math.abs(l.y - lines[i-1].y) : 0).filter(v=>v>0);
    const medianGap = heights.length ? heights.sort((a,b)=>a-b)[Math.floor(heights.length/2)] : 12;
    const paraBreak = Math.max(medianGap * 1.6, 16);
    const paragraphs = [];
    let curPara = [];
    for(let i=0;i<lines.length;i++){
      const lineText = lines[i].texts.join('').trim();
      if(!lineText){ continue; }
      const gap = i>0 ? Math.abs(lines[i].y - lines[i-1].y) : 0;
      if(curPara.length && gap > paraBreak){ paragraphs.push(curPara.join(' ')); curPara = []; }
      curPara.push(lineText);
    }
    if(curPara.length) paragraphs.push(curPara.join(' '));
    const html = paragraphs.filter(t=>t.trim()).map(t=>`<p>${escapeHtml(t.trim())}</p>`).join('');
    if(html) chapters.push({ title: `${p}페이지`, html });
  }
  if(!chapters.length){
    chapters.push({ title: '본문 없음', html: '<p>이 PDF에서 추출할 수 있는 텍스트가 없습니다. 이미지/스캔 PDF는 텍스트 리더 모드를 지원하지 않습니다.</p>' });
  }
  // 목차(outline)
  let toc = [];
  try {
    const outline = await pdf.getOutline();
    if(outline && outline.length){
      toc = await Promise.all(outline.map(async o=>{
        let dest = o.dest;
        if(Array.isArray(dest)) dest = dest[0];
        let pageIdx = 0;
        try { const r = await pdf.getPageIndex(dest); pageIdx = r; } catch {}
        return { label: o.title, chapter: pageIdx };
      }));
    }
  } catch {}
  return { title, author:'', chapters, toc, isPdf:true };
}

/* ---------- EPUB ---------- */
async function parseEpub(file){
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  // container.xml → opf 경로
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const cdoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfileEl = cdoc.querySelector('rootfile'); 
  let opfPath = rootfileEl.getAttribute('full-path');
  const baseDir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/,'') : '';
  const opfXml = await zip.file(opfPath).async('string');
  const odoc = new DOMParser().parseFromString(opfXml, 'application/xml');
  // 메타
  const titleEl = odoc.querySelector('metadata title, metadata *|title') || odoc.getElementsByTagNameNS('*','title')[0];
  const title = titleEl ? titleEl.textContent.trim() : guessTitle(file.name);
  const authorEl = odoc.querySelector('metadata creator, metadata *|creator') || odoc.getElementsByTagNameNS('*','creator')[0];
  const author = authorEl ? authorEl.textContent.trim() : '';
  // manifest
  const manifest = {};
  odoc.querySelectorAll('manifest item').forEach(it=>{ manifest[it.getAttribute('id')] = it.getAttribute('href'); });
  // spine
  const spineIds = [...odoc.querySelectorAll('spine itemref')].map(r=>r.getAttribute('idref'));
  // 이미지 blob URL 맵
  const imgCache = {};
  async function resolveImage(href){
    const path = resolvePath(baseDir, href);
    if(imgCache[path]) return imgCache[path];
    try {
      const f = zip.file(path) || findFile(zip, path);
      if(!f) return null;
      const blob = await f.async('blob');
      const url = URL.createObjectURL(blob);
      imgCache[path] = url; return url;
    } catch { return null; }
  }
  // 챕터 로드
  const chapters = [];
  for(const id of spineIds){
    const href = manifest[id]; if(!href) continue;
    const path = resolvePath(baseDir, href);
    let f = zip.file(path) || findFile(zip, path);
    if(!f) continue;
    let xhtml = await f.async('string');
    const doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
    // 오류 정정: 네임스페이스 처리
    const body = doc.querySelector('body') || doc.getElementsByTagName('body')[0];
    if(!body) continue;
    // 이미지 처리
    const imgs = [...body.querySelectorAll('img, image')];
    for(const img of imgs){
      const src = img.getAttribute('src') || img.getAttribute('href') || img.getAttributeNS('*','href');
      if(src){ const u = await resolveImage(src); if(u) img.setAttribute(src.startsWith('data:')?'':'src', u); }
    }
    const html = DOMPurify.sanitize(body.innerHTML, { ADD_ATTR:['id','src','href'] });
    const heading = body.querySelector('h1,h2,h3');
    chapters.push({ title: heading ? heading.textContent.trim() : `${chapters.length+1}장`, html, href });
  }
  // 목차 (EPUB3 nav 우선, 아니면 NCX)
  let toc = [];
  try {
    const navItem = [...odoc.querySelectorAll('manifest item')].find(it=> (it.getAttribute('properties')||'').includes('nav'));
    if(navItem){
      const navPath = resolvePath(baseDir, navItem.getAttribute('href'));
      const nf = zip.file(navPath) || findFile(zip, navPath);
      if(nf){
        const navDoc = new DOMParser().parseFromString(await nf.async('string'), 'application/xhtml+xml');
        const nav = navDoc.querySelector('nav[*|type="toc"] nav, nav[epub\\:type="toc"], nav[type="toc"], nav');
        const ol = nav ? nav.querySelector('ol') : null;
        if(ol) toc = parseNavList(ol);
      }
    }
    if(!toc.length){
      const ncxId = [...odoc.querySelectorAll('spine')][0]?.getAttribute('toc');
      if(ncxId && manifest[ncxId]){
        const ncxPath = resolvePath(baseDir, manifest[ncxId]);
        const nf = zip.file(ncxPath) || findFile(zip, ncxPath);
        if(nf){ const ncx = new DOMParser().parseFromString(await nf.async('string'),'application/xml'); toc = parseNcx(ncx, manifest, baseDir, zip); }
      }
    }
  } catch(e){ console.warn('TOC parse failed', e); }
  return { title, author, chapters, toc, isEpub:true };
}
function parseNavList(ol, depth=0){
  const items = [];
  ol.querySelectorAll(':scope > li').forEach(li=>{
    const a = li.querySelector(':scope > a, :scope > span > a');
    if(a){ items.push({ label: a.textContent.trim(), href: a.getAttribute('href'), depth }); }
    const sub = li.querySelector(':scope > ol');
    if(sub) items.push(...parseNavList(sub, depth+1));
  });
  return items;
}
async function parseNcx(ncx, manifest, baseDir, zip){
  const out = [];
  for(const pt of ncx.querySelectorAll('navPoint')){
    const label = pt.querySelector('navLabel text')?.textContent.trim() || '장';
    const src = pt.querySelector('content')?.getAttribute('src');
    out.push({ label, href: src, depth: 0 });
  }
  return out;
}
function resolvePath(base, href){
  if(/^https?:\/\//.test(href)) return href;
  const clean = href.split('#')[0];
  if(base) return (base + clean).replace(/\/+/g,'/');
  return clean;
}
function findFile(zip, path){
  // 대소문자/경로 유연 매칭
  const norm = p=>p.toLowerCase().replace(/^\/+/,'');
  const target = norm(path);
  for(const name of Object.keys(zip.files)){ if(norm(name)===target) return zip.file(name); }
  return null;
}

/* ---------- 유틸 ---------- */
function guessTitle(name){ return name.replace(/\.[^.]+$/,'').replace(/[_]/g,' ').trim() || '제목 없는 책'; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function shade(hex, percent){
  const n = parseInt(hex.slice(1),16); const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const f=(v)=>Math.max(0,Math.min(255,Math.round(v*(100+percent)/100)));
  return '#' + ((1<<24)+(f(r)<<16)+(f(g)<<8)+f(b)).toString(16).slice(1);
}

/* =================================================================
   책 열기 & 렌더링
   ================================================================= */
function openBook(bookId){
  const book = State.books.find(b=>b.id===bookId);
  if(!book) return;
  stopTTS();
  const pos = loadPosition(bookId);
  State.current = { book, chapter: Math.min(pos.chapter, book.chapters.length-1), spread: pos.spread };
  el.library.hidden = true; el.reader.hidden = false;
  el.topTitle.textContent = book.title;
  el.topAuthor.textContent = book.author || labelForFormat(book.format);
  renderToc(book);
  renderBookmarks(book);
  applySettings();
  el.readerBar.classList.remove('hidden');
  scheduleHideBottomBar();
  // 폰트 로딩 대기 후 페이지네이션
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(()=>{ renderChapter(); }); }
  else renderChapter();
  closeAllPanels();
}
function renderChapter(){
  const { book, chapter } = State.current;
  const ch = book.chapters[chapter]; if(!ch) return;
  el.flow.innerHTML = ch.html;
  // 목차 활성
  $$('#tocList .toc-item').forEach((it,i)=>it.classList.toggle('active', i===chapter));
  el.chapterLabel.textContent = ch.title;
  // 챕터에 이미지가 있으면 로딩(치수 확정) 전에 페이지 수를 재면
  // 이미지가 뒤늦게 자리를 차지하면서 마지막 줄이 다음 컬럼으로
  // 밀려나 페이지 수·오프셋이 어긋나므로, 이미지 로드를 기다린 뒤 계산한다.
  waitForImages(el.flow).then(repaginate);
}
function waitForImages(container){
  const imgs = [...container.querySelectorAll('img')];
  if(!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(img=>{
    if(img.complete) return Promise.resolve();
    return new Promise(resolve=>{
      img.addEventListener('load', resolve, { once:true });
      img.addEventListener('error', resolve, { once:true });
      setTimeout(resolve, 1500); // 안전장치: 과도하게 느린 이미지는 포기하고 진행
    });
  }));
}
function repaginate(){
  const single = el.pages.clientWidth < 720;
  el.pages.classList.toggle('single', single);
  // 이전 호출에서 슬랙 흡수용으로 늘려둔 padding-right를
  // CSS 원래 값으로 되돌린 뒤 다시 측정한다 (누적 오차 방지).
  el.flow.style.paddingRight = '';
  const vpWidth = Math.floor(el.pages.clientWidth);
  const vpHeight = Math.floor(el.pages.clientHeight);
  const cs = getComputedStyle(el.flow);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  // 인접 컬럼이 뷰포트 여백 영역으로 삐져나가지 않도록
  // 컬럼 간 간격(gutter)을 읽기 여백(pageMargin) 이상으로 넓혀
  // 이전/다음 페이지 컬럼을 화면 밖으로 완전히 밀어낸다.
  const pageMargin = Math.max(padL, padR);
  const colsPerScreen = single ? 1 : 2;
  const gap = Math.round(single ? (2 * pageMargin) : Math.max(48, pageMargin + 2));
  const innerW = vpWidth - padL - padR;
  const totalGap = gap * (colsPerScreen - 1);
  // column-width는 CSS 스펙상 "최소값"이라, 컨테이너 폭에 남는
  // 자투리 공간이 있으면 브라우저가 이를 컬럼에 임의로 재분배해
  // 실제 렌더링 폭이 계산값과 미세하게 달라질 수 있다(스프레드를
  // 넘길수록 오차가 누적되어 "점차 밀리는" 현상의 원인이 된다).
  // 정수 픽셀로 고정하고 나머지(slack)는 여백으로 흡수시켜
  // 자투리 공간 자체를 없애 브라우저가 재분배할 여지를 차단한다.
  const colW = Math.max(1, Math.floor((innerW - totalGap) / colsPerScreen));
  const usedW = colW * colsPerScreen + totalGap;
  const slack = Math.max(0, innerW - usedW);
  el.flow.style.paddingRight = (padR + slack) + 'px';
  el.flow.style.columnWidth = colW + 'px';
  el.flow.style.columnGap = gap + 'px';
  el.flow.style.height = vpHeight + 'px';
  // 스프레드(두 페이지 묶음)를 한 번 넘길 때는 컬럼 2개와 그 사이의
  // 간격뿐 아니라, 다음 스프레드로 넘어가는 지점의 간격까지 함께
  // 지나가야 다음 스프레드의 첫 컬럼이 여백(padL) 위치에 정확히
  // 들어온다. gap을 한 번만 더해서는 매 스프레드마다 gap 하나만큼씩
  // 덜 이동하게 되어, 페이지를 넘길수록 화면이 실제 컬럼 경계보다
  // 점점 뒤처지며 인접 컬럼의 잘린 글자가 좌우로 비쳐 보이는("창에
  // 맞지 않고 점차 밀리는") 현상이 누적된다.
  const pageAdvance = single ? (colW + gap) : (2 * (colW + gap));
  requestAnimationFrame(()=>{
    const pages = measurePageCount(colW, gap, padL);
    State.perChapter.set(chapterKey(), { pages, colW, gutter: gap, padL, pageAdvance, single });
    const spreads = Math.ceil(pages/(single?1:2));
    if(State.current.spread > spreads-1) State.current.spread = 0;
    applySpread();
  });
}
// scrollWidth 기반 계산 대신, 실제로 내용이 채워진 마지막 지점을
// 직접 측정해서 페이지 수를 구한다.
//
// column-width만 지정하고 column-count를 지정하지 않으면, 브라우저는
// 뷰포트 폭에 맞는 컬럼 "틀"을 내용 분량과 무관하게 먼저 확보한다.
// 즉 컨테이너의 scrollWidth는 항상 "뷰포트 폭에 맞는 컬럼 수" 이상으로
// 보고되고, 글이 짧아서 그 틀을 다 채우지 못한 챕터에서도 마치 뒤쪽
// 컬럼(=페이지)에 내용이 있는 것처럼 나온다. 그 결과 마지막 챕터/장에서
// 실제로는 존재하지 않는 빈 "유령 페이지"가 생기거나(하단이 채워지지
// 않고 잘려 보임), 반대로 내림 오차가 겹치면 실제 마지막 컬럼이
// 페이지 수 계산에서 누락되어 넘겨봐도 나오지 않는(내용이 숨겨지는)
// 문제로 이어진다. 목차의 장(chapter) 단위로 새로 페이지를 매길 때마다
// 매번 발생할 수 있어 "목차 자동생성과 연계된" 것처럼 보인 것이다.
function measurePageCount(colW, gap, padL){
  const kids = el.flow.children;
  if(!kids.length) return 1;
  const startX = el.flow.getBoundingClientRect().left + padL;
  // 문서 순서 = 컬럼 배치 순서이므로, 끝에서부터 실제 크기가 있는
  // 마지막 요소 하나만 확인하면 내용이 도달한 최대 지점을 알 수 있다.
  let maxRight = 0;
  for(let i = kids.length - 1; i >= 0; i--){
    const r = kids[i].getBoundingClientRect();
    if(r.width > 0 && r.height > 0){ maxRight = r.right; break; }
  }
  if(maxRight === 0){
    for(const k of kids){ const r = k.getBoundingClientRect(); if(r.right > maxRight) maxRight = r.right; }
  }
  const contentSpan = Math.max(0, maxRight - startX);
  return Math.max(1, Math.ceil(contentSpan / (colW + gap)));
}
function chapterKey(){ return State.current.book.id + ':' + State.current.chapter; }
function pageOfNode(node){
  const info = State.perChapter.get(chapterKey()); if(!info||!node) return 0;
  const parent = node.parentElement || node;
  const left = parent.offsetLeft;
  const colPlusGap = info.colW + info.gutter;
  return Math.max(0, Math.round((left - info.padL) / colPlusGap));
}

/* =================================================================
   하단 바 자동 숨김
   바를 숨기고/보일 때 실제 높이(height)를 0으로 접었다 펼치므로
   flex:1인 .book이 그 공간을 그대로 흡수해 본문이 넓어진다. 단,
   본문 가용 높이가 바뀌면 페이지 높이(vpHeight) 자체가 바뀌므로,
   전환 애니메이션이 끝난 뒤 지금 읽던 위치를 찾아 유지한 채
   다시 페이지를 매긴다.
   ================================================================= */
function isBottomBarVisible(){ return !el.readerBar.classList.contains('hidden'); }
function findAnchorNode(){
  if(!el.pages || !el.flow) return null;
  const r = el.pages.getBoundingClientRect();
  const nodes = el.flow.querySelectorAll('p, li, h1, h2, h3, blockquote, figure');
  for(const n of nodes){
    const nr = n.getBoundingClientRect();
    if(nr.right > r.left && nr.left < r.right && nr.bottom > r.top && nr.top < r.bottom) return n;
  }
  return null;
}
function repaginateKeepingPosition(anchor){
  clearTimeout(State.barRepagTimer);
  State.barRepagTimer = setTimeout(()=>{
    repaginate();
    if(!anchor) return;
    requestAnimationFrame(()=>{
      const info = State.perChapter.get(chapterKey()); if(!info) return;
      // pageOfNode()는 텍스트 노드(부모 블록의 offsetLeft로 컬럼을
      // 판별)를 받도록 만들어진 함수라, findAnchorNode()가 돌려주는
      // 블록 요소(<p> 등) 자체를 넣으면 그 부모인 .book-flow의
      // offsetLeft(=0)를 읽어 항상 0페이지로 튀어버린다. 블록 요소는
      // 자기 자신의 offsetLeft를 써야 한다.
      const colPlusGap = info.colW + info.gutter;
      const pageIdx = Math.max(0, Math.round((anchor.offsetLeft - info.padL) / colPlusGap));
      const perView = info.single ? 1 : 2;
      State.current.spread = Math.max(0, Math.floor(pageIdx/perView));
      applySpread();
    });
  }, 230); // styles.css의 --transition(220ms) 전환이 끝난 뒤 재계산
}
function showBottomBar(){
  const wasHidden = el.readerBar.classList.contains('hidden');
  // 클래스를 바꾸기 전, 전환이 시작되지 않은 "현재" 레이아웃 기준으로
  // 앵커를 먼저 잡아야 한다. 바뀐 뒤에 재면 전환 애니메이션 시작
  // 시점과 겹쳐 잘못된 위치를 잡을 수 있다.
  const anchor = wasHidden ? findAnchorNode() : null;
  el.readerBar.classList.remove('hidden');
  scheduleHideBottomBar();
  if(wasHidden) repaginateKeepingPosition(anchor);
}
function hideBottomBar(){
  if(!isBottomBarVisible()) return;
  const anchor = findAnchorNode();
  el.readerBar.classList.add('hidden');
  clearTimeout(State.hideBottomTimer);
  repaginateKeepingPosition(anchor);
}
function scheduleHideBottomBar(){
  clearTimeout(State.hideBottomTimer);
  State.hideBottomTimer = setTimeout(hideBottomBar, 8000);
}

function applySpread(){
  const info = State.perChapter.get(chapterKey()) || { pages:1, colW:el.pages.clientWidth, gutter:0, padL:0, pageAdvance:el.pages.clientWidth, single:true };
  const perView = info.single ? 1 : 2;
  const spreads = Math.max(1, Math.ceil(info.pages/perView));
  let s = Math.max(0, Math.min(State.current.spread, spreads-1));
  State.current.spread = s;
  const offset = -(s * info.pageAdvance);
  el.flow.style.transform = `translateX(${offset}px)`;
  const currentPage = s * perView;
  const progress = (currentPage + 1) / info.pages;
  el.progressFill.style.width = (progress*100)+'%';
  el.progressKnob.style.left = (progress*100)+'%';
  el.pageLabel.textContent = `${currentPage+1} / ${info.pages}`;
  savePosition(State.current.book.id, State.current.chapter, s);
  updateBookmarkIcon();
  if(State.tts.speaking) highlightTtsSentence();
}

/* =================================================================
   페이지 넘김 (3D 플립)
   ================================================================= */
function next(){
  const info = State.perChapter.get(chapterKey()); if(!info) return;
  const perView = info.single?1:2;
  if(State.current.spread + 1 >= Math.ceil(info.pages/perView)){
    if(State.current.chapter < State.current.book.chapters.length-1){ State.current.chapter++; State.current.spread = 0; renderChapter(); flipAnim('next'); return; }
    else { toast('마지막 페이지입니다'); return; }
  }
  State.current.spread++;
  flipAnim('next'); applySpread();
}
function prev(){
  const info = State.perChapter.get(chapterKey()); if(!info) return;
  if(State.current.spread <= 0){
    if(State.current.chapter > 0){ State.current.chapter--; State.current.spread = Infinity; renderChapter(); flipAnim('prev'); return; }
    else { toast('첫 페이지입니다'); return; }
  }
  State.current.spread--;
  flipAnim('prev'); applySpread();
}
function flipAnim(dir){
  if(!State.current) return;
  // 3D 페이지 넘김 오버레이 (오른쪽 페이지가 넘어가는 효과)
  const single = el.pages.clientWidth < 720;
  el.flip.style.width = single ? '100%' : '50%';
  el.flip.style.left = single ? '0' : '50%';
  el.flip.style.transformOrigin = single ? (dir==='next'?'left center':'right center') : 'left center';
  el.flip.classList.add('flipping');
  const from = dir==='next' ? 0 : -180;
  const to = dir==='next' ? -180 : 0;
  el.flip.style.transition = 'none';
  el.flip.style.transform = `perspective(2400px) rotateY(${from}deg)`;
  // 배경에 다음 페이지 느낌의 그라디언트
  el.flipFront.style.background = 'var(--paper)';
  el.flipBack.style.background = 'var(--paper)';
  requestAnimationFrame(()=>{
    el.flip.style.transition = 'transform .42s cubic-bezier(.16,1,.3,1)';
    el.flip.style.transform = `perspective(2400px) rotateY(${to}deg)`;
  });
  setTimeout(()=>{ el.flip.classList.remove('flipping'); el.flip.style.transform = ''; }, 440);
}

/* =================================================================
   목차
   ================================================================= */
function renderToc(book){
  const list = el.tocList; list.innerHTML = '';
  // EPUB toc 또는 PDF outline 우선
  if(book.toc && book.toc.length){
    book.toc.forEach(t=>{
      let idx;
      if(t.chapter !== undefined) idx = t.chapter;            // PDF outline
      else idx = chapterIndexForHref(book, t.href);            // EPUB nav
      if(idx < 0 || idx >= book.chapters.length) return;
      const btn = document.createElement('button');
      btn.className = 'toc-item';
      btn.style.paddingLeft = (8 + (t.depth||0)*16) + 'px';
      btn.innerHTML = `<span class="ti-label">${escapeHtml(t.label)}</span><span class="ti-page">${book.chapters[idx]?.title||''}</span>`;
      btn.addEventListener('click', ()=>{ State.current.chapter = idx; State.current.spread = 0; renderChapter(); closeAllPanels(); });
      list.appendChild(btn);
    });
    return;
  }
  // 챕터 기반 목차
  book.chapters.forEach((c,i)=>{
    const btn = document.createElement('button');
    btn.className = 'toc-item';
    btn.innerHTML = `<span class="ti-label">${escapeHtml(c.title)}</span>`;
    btn.addEventListener('click', ()=>{ State.current.chapter = i; State.current.spread = 0; renderChapter(); closeAllPanels(); });
    list.appendChild(btn);
  });
}
function chapterIndexForHref(book, href){
  if(!href) return -1;
  const target = href.split('#')[0].split('/').pop().toLowerCase();
  // book.chapters에 href 정보가 없으므로, epub 로딩 시 매핑 저장 필요 -> chapters에 href 저장
  const idx = book.chapters.findIndex(c=> c.href && c.href.split('/').pop().toLowerCase()===target);
  if(idx>=0) return idx;
  // fallback: 순서 추정
  return -1;
}

/* =================================================================
   책갈피
   ================================================================= */
function toggleBookmark(){
  if(!State.current) return;
  const { book, chapter, spread } = State.current;
  const key = `${book.id}:${chapter}:${spread}`;
  const existing = State.bookmarks.find(b=>b.key===key);
  if(existing){ State.bookmarks = State.bookmarks.filter(b=>b.key!==key); toast('책갈피 제거'); }
  else {
    const snippet = currentSnippet();
    State.bookmarks.unshift({ key, bookId:book.id, bookTitle:book.title, chapter, spread, chapterTitle: book.chapters[chapter]?.title, snippet });
    toast('책갈피 추가');
  }
  saveBookmarks(); renderBookmarks(book);
  updateBookmarkIcon();
}
function currentSnippet(){
  const info = State.perChapter.get(chapterKey()); if(!info) return '';
  const perView = info.single?1:2;
  const start = State.current.spread * perView;
  const text = el.flow.textContent || '';
  // 대략 현재 페이지 텍스트 (위치 기반 추출은 복잡하므로 앞부분 발췌)
  const charsPerPage = Math.round(text.length / info.pages);
  const s = Math.min(text.length, start * charsPerPage);
  return text.slice(s, s+80).trim();
}
function renderBookmarks(book){
  const list = el.bookmarkList; list.innerHTML = '';
  const items = State.bookmarks.filter(b=>b.bookId===book.id);
  if(!items.length){ list.innerHTML = '<p class="empty-hint">이 책에 책갈피가 없습니다.<br/>상단의 책갈피 아이콘으로 현재 페이지를 저장하세요.</p>'; return; }
  items.forEach(b=>{
    const li = document.createElement('li'); li.className='bm-item';
    li.innerHTML = `<div class="bm-text"><strong>${escapeHtml(b.chapterTitle||'')}</strong><p>${escapeHtml(b.snippet||'')}…</p></div>`;
    const del = document.createElement('button'); del.className='bm-del'; del.setAttribute('aria-label','삭제');
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
    del.addEventListener('click', ()=>{ State.bookmarks = State.bookmarks.filter(x=>x.key!==b.key); saveBookmarks(); renderBookmarks(book); updateBookmarkIcon(); });
    li.appendChild(del);
    li.addEventListener('click', e=>{ if(e.target.closest('.bm-del')) return; State.current.chapter = b.chapter; State.current.spread = b.spread; renderChapter(); closeAllPanels(); });
    list.appendChild(li);
  });
}
function updateBookmarkIcon(){
  const btn = $('#btnBookmark'); if(!btn) return;
  if(!State.current){ btn.classList.remove('active'); return; }
  const { book, chapter, spread } = State.current;
  const exists = State.bookmarks.some(b=>b.key===`${book.id}:${chapter}:${spread}`);
  btn.classList.toggle('active', exists);
}

/* =================================================================
   검색
   ================================================================= */
let searchTimer;
function bindSearch(){
  el.searchInput.addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); });
}
function runSearch(){
  const q = el.searchInput.value.trim();
  el.searchResults.innerHTML = '';
  if(!q || !State.current) return;
  const book = State.current.book;
  const lower = q.toLowerCase();
  let results = [];
  book.chapters.forEach((ch,ci)=>{
    const tpl = document.createElement('template'); tpl.innerHTML = ch.html;
    tpl.content.querySelectorAll('p, li, h1, h2, h3').forEach(node=>{
      const t = node.textContent;
      const i = t.toLowerCase().indexOf(lower);
      if(i>=0){
        const start = Math.max(0, i-25);
        const snip = (start>0?'…':'') + t.slice(start, i+q.length+25) + (i+q.length+25<t.length?'…':'');
        results.push({ ch:ci, nodeText:t, snip, node });
      }
    });
  });
  results = results.slice(0, 30);
  if(!results.length){ el.searchResults.innerHTML = '<p class="empty-hint">검색 결과가 없습니다.</p>'; return; }
  results.forEach(r=>{
    const btn = document.createElement('button'); btn.className='sr-item';
    btn.innerHTML = `<span class="sr-snippet">${highlightSnippet(r.snip, q)}</span><span class="sr-page">${book.chapters[r.ch].title}</span>`;
    btn.addEventListener('click', ()=>{ goToSearchResult(r); });
    el.searchResults.appendChild(btn);
  });
}
function highlightSnippet(text, q){ return escapeHtml(text).replace(new RegExp(escapeReg(q),'gi'), m=>`<mark class="search-hit">${m}</mark>`); }
function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function goToSearchResult(r){
  // 챕터 이동 후 해당 노드의 페이지로 이동
  State.current.chapter = r.ch; State.current.spread = 0;
  el.flow.innerHTML = State.current.book.chapters[r.ch].html;
  waitForImages(el.flow).then(()=>{
    repaginate();
    requestAnimationFrame(()=>{
      const info = State.perChapter.get(chapterKey()); if(!info) return;
      const nodes = [...el.flow.querySelectorAll('p, li, h1, h2, h3')];
      const target = nodes.find(n=>n.textContent===r.nodeText) || nodes.find(n=>n.textContent.includes(r.nodeText));
      if(target){
        const pageIdx = pageOfNode(target);
        const perView = info.single?1:2;
        State.current.spread = Math.floor(pageIdx/perView);
        applySpread();
        [...el.flow.querySelectorAll('mark.search-hit')].forEach(m=>m.classList.remove('search-hit'));
        target.innerHTML = target.innerHTML.replace(new RegExp(escapeReg(el.searchInput.value.trim()),'gi'), m=>`<mark class="search-hit">${m}</mark>`);
        setTimeout(()=>{ /* 복구는 다음 검색/렌더 시 자연스럽게 */ }, 4000);
      }
      closeAllPanels();
    });
  });
}

/* =================================================================
   TTS (읽어주기)
   ================================================================= */
function cleanForSpeech(text){
  // 기호 이름(샵·별표·물결표·가운데점·낫표 등)으로 읽히는 불필요한 기호를 제거해
  // 본문 내용만 자연스럽게 읽도록 정제한다. 문장 리듬을 위한 . , ! ? 는 유지.
  return text
    .replace(/[#*※◇◆■□★☆○●▶▷▸→←↑↓·•◦・♪♫♬†‡§¶°]/g, ' ')   // 장식·서식 기호
    .replace(/[~〜∼]/g, ' ')                                 // 물결표
    .replace(/`+/g, ' ')                                      // 마크다운 코드
    .replace(/["“”'']/g, '')                                  // 따옴표(내용만 읽도록)
    .replace(/[「」『』《》【】〈〉]/g, ' ')                      // 낫표·특수괄호
    .replace(/…/g, ', ')                                      // 줄임표 → 쉼
    .replace(/[—–]/g, ', ')                                   // 대시 → 쉼
    .replace(/\s+/g, ' ')                                     // 연속 공백 압축
    .trim();
}
/* =================================================================
   TTS 백그라운드 재생 보조
   ------------------------------------------------------------------
   iOS/Safari는 화면이 꺼지거나 다른 앱으로 전환되면 몇 초~십수 초
   안에 페이지의 타이머와 speechSynthesis를 멈춰버리는 오래된 동작이
   있다(웹 기술만으로 100% 우회는 불가능한 플랫폼 제약이며, 특히
   화면 잠금 자체는 이 조치들로도 넘을 수 없다). 다른 앱으로 잠깐
   전환하는 정도에서 도움이 되는, 실제로 효과가 검증된 완화 조치만
   적용한다:
   1) 실제로 재생 중인(진폭이 거의 0인 사실상 무음) <audio> 루프를
      함께 틀어 "정상적인 오디오 재생 세션"으로 인식시킨다 — 이게
      있어야 백그라운드에서도 JS 타이머가 크게 죽지 않는다.
   2) speechSynthesis가 일정 시간 뒤 스스로 끊기는 브라우저 버그를
      피하기 위해 주기적으로 pause()→resume()을 넣어준다.
   3) 그래도 끊긴 경우를 대비해, 주기적으로 상태를 점검해 다시
      이어 읽는 워치독을 둔다.
   ================================================================= */
function startBackgroundKeepAlive(){
  if(el.ttsKeepAlive){ el.ttsKeepAlive.play().catch(()=>{}); }
  clearInterval(State.tts.keepAliveTimer);
  State.tts.keepAliveTimer = setInterval(()=>{
    if(!State.tts.speaking || State.tts.paused || !State.tts.synth) return;
    try { State.tts.synth.pause(); State.tts.synth.resume(); } catch(e){}
  }, 12000);
  clearInterval(State.tts.watchdogTimer);
  State.tts.watchdogTimer = setInterval(()=>{
    if(!State.tts.speaking || State.tts.paused || !State.tts.synth) return;
    // speak() 호출 직후에는 브라우저가 speaking 플래그를 아직 못
    // 갱신했을 수 있어 약간의 유예 시간을 둔다.
    if(Date.now() - (State.tts.lastSpeakAt||0) < 2000) return;
    // speechSynthesis가 조용히 멈췄는데 상태만 "재생 중"으로 남아있는
    // 경우(백그라운드에서 끊긴 경우) 같은 문장부터 다시 이어 읽는다.
    if(!State.tts.synth.speaking && !State.tts.synth.pending) speakNext();
  }, 4000);
}
function stopBackgroundKeepAlive(){
  if(el.ttsKeepAlive){ el.ttsKeepAlive.pause(); }
  clearInterval(State.tts.keepAliveTimer); State.tts.keepAliveTimer = null;
  clearInterval(State.tts.watchdogTimer); State.tts.watchdogTimer = null;
}

function buildTtsQueue(){
  // 현재 챕터의 문장들을 순서대로 수집 (텍스트 노드 단위)
  const sentences = [];
  const walker = document.createTreeWalker(el.flow, NodeFilter.SHOW_TEXT, {
    acceptNode(n){ if(!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT; const p = n.parentElement; if(p && /^(SCRIPT|STYLE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; }
  });
  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes){
    const parts = node.nodeValue.split(/(?<=[.!?。！？\n])\s*/).filter(s=>s.trim());
    parts.forEach(s=>sentences.push({ text:s.trim(), node }));
  }
  return sentences;
}
function startTts(){
  if(!State.current) return;
  el.ttsBar.hidden = false; requestAnimationFrame(()=>el.ttsBar.classList.add('show'));
  if(!State.tts.synth || typeof State.tts.synth.speak !== 'function'){
    State.tts.speaking = true; State.tts.paused = false; setTtsPlayIcon('pause');
    el.ttsStatus.textContent = '이 브라우저는 읽어주기를 지원하지 않습니다';
    return;
  }
  State.tts.synth.cancel();
  State.tts.queue = buildTtsQueue();
  const info = State.perChapter.get(chapterKey());
  let startIdx = 0;
  if(info){
    const perView = info.single?1:2;
    const firstPage = State.current.spread * perView;
    const idx = State.tts.queue.findIndex(s => pageOfNode(s.node) >= firstPage);
    if(idx>=0) startIdx = idx;
  }
  State.tts.idx = startIdx;
  State.tts.speaking = true; State.tts.paused = false;
  setTtsPlayIcon('pause');
  startBackgroundKeepAlive();
  speakNext();
}
function speakNext(){
  if(!State.tts.speaking) return;
  if(!State.tts.synth){ stopTTS(); return; }
  if(State.tts.idx >= State.tts.queue.length){
    // 다음 챕터로
    if(State.current.chapter < State.current.book.chapters.length-1){
      State.current.chapter++; State.current.spread = 0; renderChapter();
      requestAnimationFrame(()=>{ State.tts.queue = buildTtsQueue(); State.tts.idx = 0; speakNext(); });
      return;
    }
    stopTTS(); toast('읽기 완료'); return;
  }
  const item = State.tts.queue[State.tts.idx];
  // 해당 문장이 보이는 페이지로 이동
  navigateToNode(item.node);
  // 기호 제거 정제: 기호만 남은 문장(구분선 등)은 건너뜀
  const spoken = cleanForSpeech(item.text);
  if(!spoken){ State.tts.idx++; speakNext(); return; }
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = 'ko-KR'; u.rate = State.tts.rate;
  const v = pickVoice(); if(v) u.voice = v;
  u.onend = ()=>{ if(State.tts.speaking && !State.tts.paused){ State.tts.idx++; speakNext(); } };
  u.onerror = ()=>{ if(State.tts.speaking){ State.tts.idx++; speakNext(); } };
  State.tts.utter = u;
  highlightTtsSentence();
  el.ttsStatus.textContent = spoken.slice(0,30) + (spoken.length>30?'…':'');
  State.tts.lastSpeakAt = Date.now();
  try { State.tts.synth.speak(u); } catch(e){ stopTTS(); }
}
function navigateToNode(node){
  const info = State.perChapter.get(chapterKey()); if(!info) return;
  const pageIdx = pageOfNode(node);
  const perView = info.single?1:2;
  const targetSpread = Math.floor(pageIdx/perView);
  if(targetSpread !== State.current.spread){ State.current.spread = targetSpread; applySpread(); }
}
let lastTtsNode = null;
function highlightTtsSentence(){
  if(lastTtsNode){ lastTtsNode.classList.remove('tts-active'); lastTtsNode = null; }
  const item = State.tts.queue[State.tts.idx]; if(!item) return;
  const node = item.node.parentElement; if(node){ node.classList.add('tts-active'); lastTtsNode = node; }
}
function pauseTTS(){ if(State.tts.speaking && !State.tts.paused && State.tts.synth){ State.tts.paused = true; State.tts.synth.pause(); setTtsPlayIcon('play'); el.ttsStatus.textContent='일시정지'; stopBackgroundKeepAlive(); } }
function resumeTTS(){ if(State.tts.speaking && State.tts.paused && State.tts.synth){ State.tts.paused = false; State.tts.synth.resume(); setTtsPlayIcon('pause'); el.ttsStatus.textContent='읽는 중…'; startBackgroundKeepAlive(); } }
function stopTTS(){ State.tts.speaking = false; State.tts.paused = false; if(State.tts.synth) State.tts.synth.cancel(); if(lastTtsNode){ lastTtsNode.classList.remove('tts-active'); lastTtsNode = null; } el.ttsBar.classList.remove('show'); setTimeout(()=>el.ttsBar.hidden=true, 200); setTtsPlayIcon('play'); stopBackgroundKeepAlive(); }
function toggleTTS(){ if(!State.tts.speaking) startTts(); else if(State.tts.paused) resumeTTS(); else pauseTTS(); }
function setTtsPlayIcon(mode){ const b = $('#ttsPlay'); b.innerHTML = mode==='play' ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'; }
function ttsJump(dir){ if(!State.tts.speaking) return; if(State.tts.synth) State.tts.synth.cancel(); State.tts.idx = Math.max(0, State.tts.idx + dir); speakNext(); }
function loadVoices(){ if(!State.tts.synth || typeof State.tts.synth.getVoices !== 'function') return; State.tts.voices = State.tts.synth.getVoices(); }
function pickVoice(){ const v = State.tts.voices.find(x=>/ko|korean/i.test(x.lang)); return v || null; }

/* =================================================================
   이벤트 바인딩
   ================================================================= */
function bindEvents(){
  // 파일 입력
  el.dropzone.addEventListener('click', ()=>el.fileInput.click());
  el.dropzone.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.fileInput.click(); } });
  el.fileInput.addEventListener('change', ()=>{ if(el.fileInput.files.length) handleFiles(el.fileInput.files); el.fileInput.value=''; });
  ['dragenter','dragover'].forEach(ev=>el.dropzone.addEventListener(ev, e=>{ e.preventDefault(); el.dropzone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev=>el.dropzone.addEventListener(ev, e=>{ e.preventDefault(); el.dropzone.classList.remove('drag'); }));
  el.dropzone.addEventListener('drop', e=>{ if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  // 전체 드롭 지원
  document.addEventListener('dragover', e=>e.preventDefault());
  document.addEventListener('drop', e=>{ e.preventDefault(); if(e.dataTransfer.files.length && State.current){ handleFiles(e.dataTransfer.files); } });

  // 상단 버튼
  $('#btnLibrary').addEventListener('click', ()=>{ stopTTS(); el.reader.hidden=true; el.library.hidden=false; });
  $('#btnToc').addEventListener('click', ()=>openPanel(el.tocPanel));
  $('#btnBookmark').addEventListener('click', ()=>{ openPanel(el.bookmarkPanel); renderBookmarks(State.current? State.current.book : null); });
  $('#btnAddBookmark').addEventListener('click', toggleBookmark);
  $('#btnTts').addEventListener('click', toggleTTS);
  $('#btnSearch').addEventListener('click', ()=>{ openPanel(el.searchPanel); setTimeout(()=>el.searchInput.focus(), 200); });
  $('#btnSettings').addEventListener('click', ()=>openPanel(el.settingsPanel));
  $$('.panel-close').forEach(b=>b.addEventListener('click', closeAllPanels));
  el.scrim.addEventListener('click', closeAllPanels);

  // 페이지 넘김
  $('#btnNext').addEventListener('click', next);
  $('#btnPrev').addEventListener('click', prev);
  // 책 영역 클릭/스와이프
  let startX=0, startY=0, dragging=false;
  el.pages.addEventListener('pointerdown', e=>{ dragging=true; startX=e.clientX; startY=e.clientY; });
  el.pages.addEventListener('pointerup', e=>{
    if(!dragging) return; dragging=false;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)){ dx<0 ? next() : prev(); }
  });
  // 더블클릭으로 재생/정지 (단일 탭 토글과 충돌 회피: 더블클릭 시 단일 탭 타이머 취소)
  el.pages.addEventListener('dblclick', ()=>{ clearTimeout(clickTimer); toggleTTS(); });

  // 진행률 시크
  el.progressTrack.addEventListener('click', e=>{
    const info = State.perChapter.get(chapterKey()); if(!info) return;
    const rect = el.progressTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    const perView = info.single?1:2;
    State.current.spread = Math.floor(ratio * Math.ceil(info.pages/perView));
    applySpread();
  });

  // 키보드
  document.addEventListener('keydown', e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if(e.key==='ArrowRight' || e.key===' '){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
    else if(e.key==='Escape'){ closeAllPanels(); }
    else if(e.key.toLowerCase()==='b' && !e.metaKey && !e.ctrlKey){ if(State.current) toggleBookmark(); }
    else if(e.key.toLowerCase()==='t' && !e.metaKey && !e.ctrlKey){ toggleTTS(); }
  });

  // 상단바 탭 토글: 상단을 탭하면 표시, topbar 빈 영역/본문을 탭하면 숨김
  const TOP_ZONE = ()=> (el.topbar.offsetHeight || 72);
  const isTopVisible = ()=> !el.topbar.classList.contains('hidden');
  function showTopbar(){ el.topbar.classList.remove('hidden'); scheduleHideTopbar(); }
  function hideTopbar(){ el.topbar.classList.add('hidden'); clearTimeout(State.hideTimer); }
  function scheduleHideTopbar(){ clearTimeout(State.hideTimer); State.hideTimer=setTimeout(hideTopbar, 8000); }
  // 하단바 탭 영역: 화면 맨 아래를 탭하면 표시/숨김 토글(바 자체가 숨어
  // 있을 때는 높이가 0이라 대신 여백만큼의 고정 히트 영역을 사용한다)
  const BOTTOM_ZONE = ()=> isBottomBarVisible() ? (el.readerBar.offsetHeight || 80) : 56;
  let tapDownX=0, tapDownY=0;
  document.addEventListener('pointerdown', e=>{ tapDownX=e.clientX; tapDownY=e.clientY; }, true);
  let clickTimer=null;
  document.addEventListener('click', e=>{
    if(el.reader.hidden || !State.current) return;
    if(e.target.closest('button, input, .panel, .scrim, .toast, .tts-bar, .reader-bar, .progress-track, .topbar')) return;
    const moved = Math.abs(e.clientX-tapDownX)>12 || Math.abs(e.clientY-tapDownY)>12;
    if(moved) return;  // 스와이프/드래그는 무시
    clearTimeout(clickTimer);
    clickTimer = setTimeout(()=>{
      if(e.clientY < TOP_ZONE()){ isTopVisible() ? hideTopbar() : showTopbar(); }
      else if(e.clientY > window.innerHeight - BOTTOM_ZONE()){ isBottomBarVisible() ? hideBottomBar() : showBottomBar(); }
      else { if(isTopVisible()) hideTopbar(); if(isBottomBarVisible()) hideBottomBar(); }
    }, 230);
  });
  // topbar 빈 영역 탭 → 숨김 (버튼 클릭은 동작 유지하며 자동숨김 타이머 리셋)
  el.topbar.addEventListener('click', e=>{
    if(e.target.closest('button, input')){ scheduleHideTopbar(); return; }
    hideTopbar();
  });
  // 하단바도 동일하게: 빈 영역 탭은 숨김, 버튼/진행바 조작은 타이머만 리셋
  el.readerBar.addEventListener('click', e=>{
    if(e.target.closest('button, input, .progress-track')){ scheduleHideBottomBar(); return; }
    hideBottomBar();
  });

  // TTS 버튼
  $('#ttsPlay').addEventListener('click', toggleTTS);
  $('#ttsStop').addEventListener('click', stopTTS);
  $('#ttsNext').addEventListener('click', ()=>ttsJump(1));
  $('#ttsPrev').addEventListener('click', ()=>ttsJump(-1));
  if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged = loadVoices; loadVoices(); }
  // 백그라운드에서 돌아왔을 때 speechSynthesis가 끊겨 있으면
  // 워치독(최대 4초)을 기다리지 않고 바로 이어서 읽는다.
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState !== 'visible') return;
    if(State.tts.speaking && !State.tts.paused && State.tts.synth && !State.tts.synth.speaking && !State.tts.synth.pending){
      speakNext();
    }
  });

  // 리사이즈 → 리페이지
  let rT;
  window.addEventListener('resize', ()=>{ clearTimeout(rT); rT=setTimeout(()=>{ if(State.current) repaginate(); }, 200); });
}

/* =================================================================
   부트
   ================================================================= */
function boot(){
  applySettings();
  bindSettings();
  bindSearch();
  bindEvents();
  renderShelf();
}
document.addEventListener('DOMContentLoaded', boot);


// V15 Wrapper - thermal fix: queue caching, no repeated build
(function(){
  if(window.__v15Patched) return; window.__v15Patched=true;
  let cachedQueue=null;
  let cachedKey=null;
  function getQueue(){
    const key = State.current ? State.current.chapter + ':' + State.current.spread : 'no';
    if(cachedQueue && cachedKey===key) return cachedQueue;
    const q = buildTtsQueue();
    cachedQueue=q; cachedKey=key;
    return q;
  }
  // 파일 열리면 캐시 무효화
  const origOpen = window.openChapter;
  if(origOpen){
    window.openChapter = function(){ cachedQueue=null; cachedKey=null; return origOpen.apply(this, arguments); }
  }

  window.startTts = function(){
    try{
      let q=getQueue();
      if(!q||q.length===0){
        setTimeout(()=>{
          cachedQueue=null;
          const q2=getQueue();
          if(!q2||q2.length===0){ if(typeof toast==='function') toast('읽을 텍스트가 없습니다'); return; }
          State.tts.queue=q2;
          doStart(q2);
        }, 300);
        return;
      }
      State.tts.queue=q;
      doStart(q);
    }catch(e){ console.error(e); }
  };
  function doStart(queue){
    try{
      if(State.tts.synth) State.tts.synth.cancel();
      const info = State.perChapter ? State.perChapter.get(chapterKey()) : null;
      let startIdx=0;
      if(info){
        const perView=info.single?1:2;
        const firstPage=State.current.spread * perView;
        const idx=queue.findIndex(s=>{ try{ return pageOfNode(s.node)>=firstPage; }catch(e){ return true; } });
        if(idx>=0) startIdx=idx;
      }
      State.tts.idx=startIdx;
      State.tts.speaking=true; State.tts.paused=false;
      if(typeof setTtsPlayIcon==='function') setTtsPlayIcon('pause');
      if(el.ttsBar){ el.ttsBar.hidden=false; requestAnimationFrame(()=>el.ttsBar.classList.add('show')); }
      speakNext();
    }catch(e){ console.error(e); }
  }
  // 하이라이트 최적화 - requestAnimationFrame으로 묶음
  if(typeof highlightTtsSentence==='function'){
    const origHighlight = highlightTtsSentence;
    let rafId=null;
    window.highlightTtsSentence = function(){
      if(rafId) return;
      rafId = requestAnimationFrame(()=>{
        rafId=null;
        origHighlight.apply(this, arguments);
      });
    };
  }
})();


// V17 - User requested: do NOT read . = ? ' "
(function(){
  const punctRE = /[.=?'"\uFF1D\uFF1F]/g;
  const origClean = window.cleanForSpeech;
  window.cleanForSpeech = function(text){
    let t = text;
    if(origClean){
      try{ t = origClean(text); }catch(e){ t=text; }
    }
    return t.replace(/\./g,' ').replace(/\?/g,' ').replace(/=/g,' ').replace(/'/g,' ').replace(/"/g,' ').replace(/\s+/g,' ').trim();
  };
  // Also patch bridge clean
  if(window.NativeTTS && window.NativeTTS.speak){
    const origSpeak = window.NativeTTS.speak;
    // already patched above
  }
})();

