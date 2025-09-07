// ======== CONFIG ========
// Apps Script Web App URL (배포 후 교체)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzC17xT4K-7FS1GkU7-D2J-jWPZ0rEIjQQXcWuQ58eMUGxgCBSUIKtP4mAHOtM2M1iSqw/exec';

// ======== Debug Logger ========
const dbgLogEl = () => document.getElementById('debugLog');
const dbgStatusEl = () => document.getElementById('dbgStatus');
function timestamp(){ const d=new Date(); return d.toLocaleTimeString(); }
function dbg(...args){
  try {
    const line = `[${timestamp()}] ` + args.map(a=> typeof a==='string'? a : (a&&a.stack? a.stack: JSON.stringify(a))).join(' ');
    console.log(...args);
    const el = dbgLogEl(); if (el){ el.append(line+'\n'); el.scrollTop = el.scrollHeight; }
  } catch(e){ console.log(args); }
}
function setStatus(s){ const el = dbgStatusEl(); if (el) el.textContent = s; }

window.addEventListener('error', (e)=>{ dbg('ERROR:', e.message); });
window.addEventListener('unhandledrejection', (e)=>{ dbg('UNHANDLED REJECTION:', e.reason||e); });

// ======== Loading Overlay ========
let BUSY = 0;
function ensureOverlay(){
  let ov = document.getElementById('loadingOverlay');
  if (!ov){
    ov = document.createElement('div');
    ov.id = 'loadingOverlay';
    ov.className = 'loading-overlay';
    ov.innerHTML = '<div class="loading-box"><div class="spinner"></div><div id="loadingMessage">데이터 통신 중…</div></div>';
    document.body.appendChild(ov);
  }
  return ov;
}
function setBusy(on, message){
  const ov = ensureOverlay();
  if (on){
    BUSY++;
    const msgEl = document.getElementById('loadingMessage'); if (msgEl) msgEl.textContent = message || '데이터 통신 중…';
    ov.classList.add('show');
    setStatus('busy');
  } else {
    BUSY = Math.max(0, BUSY-1);
    if (BUSY === 0){
      ov.classList.remove('show');
      setStatus('ready');
    }
  }
}

// ======== Helpers ========
const qs = (sel, el=document) => el.querySelector(sel);
const qsa = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const fmtDate = s => s || '';
const todayStr = () => new Date().toISOString().slice(0,10);

async function apiFetch() {
  const url = new URL(GAS_URL);
  url.searchParams.set('action','fetch');
  setBusy(true, '데이터 불러오는 중…');
  dbg('GET', url.toString());
  try{
    const res = await fetch(url.toString(), { method:'GET' });
    const json = await res.json();
    dbg('GET done:', json);
    return json;
  } finally {
    setBusy(false);
  }
}

async function apiPost(payload) {
  setBusy(true, '저장 중…');
  dbg('POST', payload);
  try{
    const res = await fetch(GAS_URL, {
      method:'POST',
      headers: { 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    dbg('POST result:', json);
    return json;
  } finally {
    setBusy(false);
  }
}

function el(tag, props={}, ...children){
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.flat().forEach(c=> e.append(c && c.nodeType ? c : document.createTextNode(c)) );
  return e;
}

function openModal(sel){
  const m = typeof sel==='string' ? qs(sel) : sel;
  if (!m){ dbg('openModal target not found:', sel); return; }
  m.classList.add('open');
  dbg('modal open:', m.id||'');
}
function closeModal(sel){
  const m = typeof sel==='string' ? qs(sel) : sel;
  if (!m){ dbg('closeModal target not found:', sel); return; }
  m.classList.remove('open');
  dbg('modal close:', m.id||'');
}

// ======== State ========
let STATE = {
  year: new Date().getFullYear(),
  meetingsThisYear: 0,
  members: [],
  meetings: [],
};
let FILTER = { memberQuery: '' };

let EDIT = {
  memberBefore: null,
  meetingBefore: null,
};

// ======== UI Renderers ========
function render(){
  dbg('render start');
  const view = qs('#view');
  if (!view){ dbg('view not found'); return; }
  view.innerHTML = '';
  const activeTab = qs('.tab.active');
  const active = activeTab ? activeTab.dataset.tab : 'meetings';
  dbg('active tab:', active);
  if (active === 'meetings') renderMeetings(view);
  else if (active === 'members') renderMembers(view);
  else renderStats(view);
}

function renderMeetings(view){
  if (!STATE.meetings.length) {
    view.append(el('div', {class:'card'}, '데이터가 없습니다'));
    return;
  }
  STATE.meetings.forEach((m, idx) => {
    const expanded = idx === 0;
    if (!expanded) {
      const card = el('div',{class:'card'},
        el('div',{class:'row'},
          el('div',{}, el('div', {class:'section-title'}, fmtDate(m.Date)), el('div', {style:'font-weight:700; font-size:16px;'}, m.MeetingName)),
          el('div', {class:'pill'}, `참석 ${m.AttendeeCount}명`)
        ),
        el('div',{class:'row'},
          el('button',{class:'btn small', onclick:()=>{ dbg('자세히 보기 click', m); showMeetingDetail(m); }}, '자세히 보기')
        )
      );
      view.append(card);
    } else {
      const list = el('div',{class:'list'});
      m.Attendees.forEach(a => list.append(memberCell(a.Nickname, findMemberName(a), a.JoinDate, getMemberYearRate(a))));

      const card = el('div',{class:'card'},
        el('div',{class:'row'}, el('div',{class:'section-title'}, '가장 최근 모임')),
        el('div',{class:'row'}, el('div',{}, el('div',{class:'muted'},'모임명'), el('div',{style:'font-weight:700; font-size:18px;'}, m.MeetingName)), el('div',{class:'pill'}, `참석 ${m.AttendeeCount}명`)),
        el('div',{class:'row'}, el('div',{}, el('div',{class:'muted'},'모임장'), el('div',{}, m.LeaderName)), el('div',{}, el('div',{class:'muted'},'날짜'), el('div',{}, fmtDate(m.Date)))),
        el('div',{class:'section-title'}, '출석한 회원'),
        list,
        el('div',{class:'row', style:'margin-top:8px;'}, el('button',{class:'btn small', onclick:()=>{ dbg('모임 수정 click'); openMeetingEditor(m); }}, '수정하기'))
      );
      view.append(card);
    }
  });
}

function renderMembers(view){
  // Search bar (stable DOM node)
  const box = el('div', {class:'card'},
    el('label', {}, '검색 (닉네임/본명)',
      el('input', { type:'text', id:'memberSearch', placeholder:'예) 홍길동 / gil', value: FILTER.memberQuery || '' }),
      el('div', {class:'row'},
        el('span', {class:'muted'}, '입력하면 즉시 필터링됩니다.'),
        el('button', {class:'btn small', onclick: ()=>{ FILTER.memberQuery=''; updateMembersList(); const ip=qs('#memberSearch'); if(ip){ ip.value=''; ip.focus(); } }}, '지우기')
      )
    )
  );
  const resultsWrap = el('div', { id:'memberResults' });
  view.append(box, resultsWrap);

  // bind search input (partial update only)
  const input = qs('#memberSearch');
  if (input){
    input.oninput = (e)=>{
      FILTER.memberQuery = e.target.value;
      updateMembersList(); // no full rerender => input focus preserved
    };
  }
  updateMembersList();
}

function updateMembersList(){
  const wrap = qs('#memberResults');
  if (!wrap) return;
  const q = (FILTER.memberQuery || '').toLowerCase().trim();
  let listData = STATE.members.slice();
  if (q){
    listData = listData.filter(m => (m.Nickname||'').toLowerCase().includes(q) || (m.Name||'').toLowerCase().includes(q));
  }
  const frag = document.createDocumentFragment();
  const resultInfo = el('div', {class:'muted', style:'margin: -4px 0 4px 4px;'}, q ? `검색 결과: ${listData.length}명` : '');
  frag.append(resultInfo);

  const list = el('div',{class:'list'});
  if (!listData.length) list.append(el('div',{class:'card'}, q ? '검색 결과가 없습니다' : '데이터가 없습니다'));
  listData
    .sort((a,b)=> (b.YearAttend - a.YearAttend) || (b.TotalAttend - a.TotalAttend))
    .forEach(m => list.append(memberCell(m.Nickname, m.Name, m.JoinDate, m.YearRate, ()=>{ dbg('회원 셀 click', m); openMemberDetail(m); })));
  frag.append(list);

  // Replace only the results area
  wrap.replaceChildren(frag);
}

function renderStats(view){
  const totalMembers = STATE.members.length;
  const totalMeetings = STATE.meetings.length;
  const top10 = STATE.members.slice().sort((a,b)=> (b.YearAttend - a.YearAttend) || (b.TotalAttend - a.TotalAttend)).slice(0,10);

  view.append(
    el('div',{class:'card'},
      el('div',{class:'row'}, el('div',{class:'section-title'}, '요약')),
      el('div',{class:'row'}, el('div',{}, '올해 모임 수'), el('div',{class:'pill'}, STATE.meetingsThisYear+'회')),
      el('div',{class:'row'}, el('div',{}, '전체 모임 수'), el('div',{class:'pill'}, totalMeetings+'회')),
      el('div',{class:'row'}, el('div',{}, '회원 수'), el('div',{class:'pill'}, totalMembers+'명'))
    )
  );

  const list = el('div',{class:'list'});
  top10.forEach(m => list.append(memberCell(m.Nickname, m.Name, m.JoinDate, m.YearRate)));
  view.append(el('div',{class:'card'}, el('div',{class:'section-title'}, '연간 출석 TOP 10'), list));
}

function memberCell(nickname, name, joinDate, yearRate, onClick){
  const ratePct = Math.round((yearRate||0)*100) + '%';
  const cell = el('div',{class:'member-cell', onclick:onClick},
    el('div',{}, el('div',{style:'font-weight:700;'}, nickname), el('div',{class:'meta'}, name||'-')),
    el('div',{}, el('div',{class:'meta'}, '연간 참석률'), el('div',{class:'pill'}, ratePct))
  );
  return cell;
}

function findMemberName(a){
  const k = keyMember(a.Nickname, a.JoinDate);
  const m = STATE.members.find(x => keyMember(x.Nickname, x.JoinDate) === k);
  return m ? m.Name : '';
}
function getMemberYearRate(a){
  const k = keyMember(a.Nickname, a.JoinDate);
  const m = STATE.members.find(x => keyMember(x.Nickname, x.JoinDate) === k);
  return m ? m.YearRate : 0;
}
function keyMember(nickname, joinDate){ return `${nickname}||${joinDate}`; }

// ======== Member Detail & Editor ========
function openMemberDetail(m){
  EDIT.memberBefore = {...m};
  const body = qs('#memberBody');
  body.innerHTML = '';

  const total = m.TotalAttend || 0; const yCnt = m.YearAttend || 0; const rate = Math.round((m.YearRate||0)*100)+'%';

  body.append(
    el('label',{}, '닉네임', el('input',{type:'text', id:'memNickname', value:m.Nickname})),
    el('label',{}, '본명', el('input',{type:'text', id:'memName', value:m.Name||''})),
    el('label',{}, '의적단 가입일', el('input',{type:'date', id:'memJoinDate', value:m.JoinDate||''})),
    el('div',{class:'card'},
      el('div',{class:'row'}, el('div',{}, '전체 모임 참석 수'), el('div',{class:'pill'}, total+'회')),
      el('div',{class:'row'}, el('div',{}, '연간 모임 참석 수'), el('div',{class:'pill'}, yCnt+'회')),
      el('div',{class:'row'}, el('div',{}, '연간 참석률'), el('div',{class:'pill'}, rate))
    )
  );

  qs('#btnMemberSave').onclick = saveMemberEdit;
  qs('#btnMemberDelete').onclick = deleteMember;
  openModal('#memberModal');
}

function openMemberCreator(){
  EDIT.memberBefore = null;
  const body = qs('#memberBody');
  body.innerHTML = '';
  body.append(
    el('label',{}, '닉네임', el('input',{type:'text', id:'memNickname'})),
    el('label',{}, '본명', el('input',{type:'text', id:'memName'})),
    el('label',{}, '의적단 가입일', el('input',{type:'date', id:'memJoinDate', value:todayStr()}))
  );
  qs('#btnMemberSave').onclick = saveMemberEdit;
  qs('#btnMemberDelete').onclick = async ()=>{ dbg('신규 회원 삭제 클릭 (무시)'); alert('신규 작성 중에는 삭제할 항목이 없습니다.'); };
  openModal('#memberModal');
}

async function saveMemberEdit(){
  const Nickname = qs('#memNickname').value.trim();
  const Name = qs('#memName').value.trim();
  const JoinDate = qs('#memJoinDate').value;
  if (!Nickname || !JoinDate) { alert('닉네임, 가입일은 필수입니다.'); return; }

  let payload;
  if (EDIT.memberBefore) {
    payload = { action:'updateMember', before:{ Nickname:EDIT.memberBefore.Nickname, JoinDate:EDIT.memberBefore.JoinDate }, after:{ Nickname, Name, JoinDate } };
  } else {
    payload = { action:'addMember', new:{ Nickname, Name, JoinDate } };
  }
  const res = await apiPost(payload);
  if (!res.ok) { alert(res.error||'오류'); return; }
  STATE = res.data; closeModal('#memberModal'); render();
}

async function deleteMember(){
  if (!EDIT.memberBefore) return;
  if (!confirm('정말로 이 회원을 삭제하시겠습니까? 관련 출석 기록도 삭제됩니다.')) return;
  const key = { Nickname: EDIT.memberBefore.Nickname, JoinDate: EDIT.memberBefore.JoinDate };
  const res = await apiPost({ action:'deleteMember', key });
  if (!res.ok) { alert(res.error||'오류'); return; }
  STATE = res.data; closeModal('#memberModal'); render();
}

// ======== Meeting Detail & Editor ========
function showMeetingDetail(m){ openMeetingEditor(m); }

function openMeetingEditor(meeting){
  const base = meeting || { MeetingName:'', LeaderName:'', Date: todayStr(), Attendees:[] };
  // include MeetingName in before for robust updates of attendee key
  EDIT.meetingBefore = meeting ? { MeetingName:base.MeetingName, LeaderName:base.LeaderName, Date:base.Date } : null;

  const body = qs('#meetingBody');
  body.innerHTML = '';

  const attendees = base.Attendees ? base.Attendees.slice() : [];

  const attendeesWrap = el('div',{class:'chips', id:'attendeeChips'});
  const redrawChips = () => {
    attendeesWrap.innerHTML = '';
    attendees.forEach((p,i)=>{
      const name = findMemberName(p) || '';
      attendeesWrap.append(
        el('div',{class:'chip'}, `${p.Nickname}${name? ' · '+name:''}`,
          el('span',{class:'x', onclick:()=>{ attendees.splice(i,1); redrawChips(); }}, '✕')
        )
      );
    });
  };

  const searchBox = el('div',{},
    el('label',{}, '출석 회원 추가 (닉네임/본명 검색, 로컬 캐시 사용)',
      el('input',{type:'text', id:'searchNick', placeholder:'예) 닉네임/이름'}),
      el('button',{class:'btn small', style:'margin-top:6px;', onclick:async()=>{
        const q = (qs('#searchNick').value||'').trim().toLowerCase(); 
        const list = STATE.members.filter(m => (m.Nickname||'').toLowerCase().includes(q) || (m.Name||'').toLowerCase().includes(q));
        if (!list.length) { alert('검색 결과가 없습니다.'); return; }
        const pick = await pickDialog(list.map(m => ({ label:`${m.Nickname} · ${m.Name||''}`, value:m })));
        if (pick) {
          const pair = { Nickname: pick.value.Nickname, JoinDate: pick.value.JoinDate };
          if (!attendees.some(a => a.Nickname===pair.Nickname && a.JoinDate===pair.JoinDate)) attendees.push(pair);
          redrawChips();
        }
      }}, '추가')
    )
  );

  redrawChips();

  body.append(
    el('label',{}, '모임 이름', el('input',{type:'text', id:'mtName', value:base.MeetingName})),
    el('label',{}, '모임장 이름', el('input',{type:'text', id:'mtLeader', value:base.LeaderName})),
    el('label',{}, '모임 날짜', el('input',{type:'date', id:'mtDate', value:base.Date})),
    el('div',{}, el('div',{class:'section-title'}, '출석 회원 리스트'), attendeesWrap, searchBox)
  );

  qs('#btnMeetingSave').onclick = async()=>{
    const MeetingName = qs('#mtName').value.trim();
    const LeaderName = qs('#mtLeader').value.trim();
    const DateStr = qs('#mtDate').value;
    const Attendees = attendees.slice();
    if (!LeaderName || !DateStr) { alert('모임장, 날짜는 필수입니다.'); return; }
    let payload;
    if (EDIT.meetingBefore) payload = { action:'updateMeeting', before:EDIT.meetingBefore, after:{ MeetingName, LeaderName, Date:DateStr, Attendees } };
    else payload = { action:'addMeeting', new:{ MeetingName, LeaderName, Date:DateStr, Attendees } };
    const res = await apiPost(payload);
    if (!res.ok) { alert(res.error||'오류'); return; }
    STATE = res.data; closeModal('#meetingModal'); render();
  };

  qs('#btnMeetingDelete').onclick = async()=>{
    if (!EDIT.meetingBefore) { alert('신규 작성 중에는 삭제할 항목이 없습니다.'); return; }
    if (!confirm('정말로 이 모임을 삭제하시겠습니까? 출석 기록도 함께 삭제됩니다.')) return;
    const res = await apiPost({ action:'deleteMeeting', key:EDIT.meetingBefore });
    if (!res.ok) { alert(res.error||'오류'); return; }
    STATE = res.data; closeModal('#meetingModal'); render();
  };

  openModal('#meetingModal');
}

function pickDialog(options){
  return new Promise(resolve => {
    const modal = el('div',{class:'modal open'});
    const list = el('div',{class:'list'});
    options.forEach(opt => list.append(el('button',{class:'btn', onclick:()=>{ document.body.removeChild(modal); resolve(opt); }}, opt.label)));
    const sheet = el('div',{class:'sheet'}, el('header',{class:'row'}, el('strong',{}, '선택'), el('button',{class:'btn ghost small', onclick:()=>{ document.body.removeChild(modal); resolve(null); }}, '닫기')), el('div',{class:'body'}, list));
    modal.append(sheet); document.body.append(modal);
  });
}

// ======== Events & Bootstrap ========
function bindBasics(){
  // 탭 전환
  qsa('.tab').forEach(t => t.addEventListener('click', ()=>{
    qsa('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); render();
  }));

  // 팝업 닫기
  qsa('[data-close]').forEach(b=> b.addEventListener('click', (e)=>{
    const m = e.target.closest('.modal'); if (m) m.classList.remove('open');
  }));

  // 헤더 버튼
  const addMemBtn = qs('#btnAddMember');
  const addMeetBtn = qs('#btnAddMeeting');
  if (addMemBtn) addMemBtn.onclick = ()=>{ dbg('회원 추가 click'); openMemberCreator(); };
  if (addMeetBtn) addMeetBtn.onclick = ()=>{ dbg('모임 추가 click'); openMeetingEditor(null); };

  // Debug dock controls
  const dock = qs('#debugDock');
  const toggle = qs('#dbgToggle');
  const clear = qs('#dbgClear');
  if (toggle) toggle.onclick = ()=>{ dock.classList.toggle('collapsed'); };
  if (clear) clear.onclick = ()=>{ const el=dbgLogEl(); if (el) el.textContent=''; };
}

async function bootstrap(){
  try {
    bindBasics();
    dbg('bootstrap start');
    const res = await apiFetch();
    if (!res || !res.ok) { dbg('fetch failed or not ok', res); render(); return; }
    STATE = res.data; render();
  } catch(err){
    dbg('bootstrap error:', err);
    render(); // 최소 UI는 표시
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
