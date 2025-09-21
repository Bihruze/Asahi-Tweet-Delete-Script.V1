// ==UserScript==
// @name         TweetXer Panel + Anti-Spam + Progress + Date Range [EN UI + Lilac Start | No Delete Buttons]
// @namespace    local
// @version      0.75.2
// @description  Bulk delete Likes/Tweets/DMs from X archive .js files. EN UI, date range filters, progress save/resume, lilac Start, single confirm, anti-spam pacing. Delete buttons removed.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /************ Settings ************/
  const TARGET_SCREEN = 'asahi0x';
  const QID_DELETE_TWEET = 'VaenaVgh5q5ih7kvyVjgtg';
  const QID_UNFAVORITE   = 'ZYKSe-w7KEslx3JhSIk5LA';

  // Base pacing ranges (min-max in ms, jitter +/-30% will be applied)
  const SLEEP_LIKE_RANGE   = [1800, 3000];  // 1.8-3 saniye
  const SLEEP_TWEET_RANGE  = [2500, 5000];  // 2.5-5 saniye
  const SLEEP_DM_RANGE     = [4000, 8000];  // 4-8 saniye

  // Extra anti-spam
  const GLOBAL_MIN_GAP_MS = 400;
  const JITTER_RATIO = 0.30; // +/-30%

  /************ Utils ************/
  const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
  const jitter = (ms) => {
    const d = Math.floor(ms * JITTER_RATIO);
    return ms + Math.floor((Math.random() * 2 - 1) * d);
  };
  const byId   = (id) => document.getElementById(id);

  const CT0  = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || '';
  const AUTH = (window.__INITIAL_STATE__?.config?.authToken) || ''; // Removed hardcoded fallback for security
  const LANG = (navigator.language || 'en').split('-')[0];

  // ---- Hash helpers (safe UI id)
  async function sha256Hex(buf){
    if (crypto?.subtle?.digest) {
      const h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    // Improved fallback: Adler-32 like
    const v = new Uint8Array(buf);
    let a = 1, b = 0;
    for (let i = 0; i < v.length; i++) {
      a = (a + v[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a).toString(16).padStart(8, '0');
  }
  async function fileHash(file){
    if(!file) return '';
    const buf = await file.arrayBuffer();
    const hex = await sha256Hex(buf);
    return `${file.name}:${file.size}:${hex}`;
  }
  function maskFh(fh){
    if(!fh) return '';
    const [name,,hex=''] = fh.split(':');
    return `${name} • ${hex.slice(0,10)}…`;
  }

  function uiToast(msg, duration=3000) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style = 'position:fixed;right:14px;bottom:14px;background:#1b0f2a;color:#ece6ff;border:1px solid #6b46c1;padding:10px 14px;border-radius:10px;z-index:2147483647;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px/1.3 Inter,Arial';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  /************ Modal ************/
  function txModal(title, msg, buttons=[['OK','ok']]) {
    return new Promise(resolve=>{
      const o = document.createElement('div');
      o.style='position:fixed;inset:0;background:rgba(10,0,20,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647';
      const b = document.createElement('div');
      b.style='background:#11041f;color:#f1e9ff;padding:18px;border-radius:14px;max-width:520px;width:92%;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.6);border:1px solid #7c3aed';
      b.innerHTML = `<div style="font-weight:800;margin-bottom:8px;font-size:16px">${title}</div>
                     <div style="margin-bottom:14px;line-height:1.5;word-break:break-word">${msg}</div>
                     <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"></div>`;
      const btnWrap = b.lastElementChild;
      buttons.forEach(([label,val,kind])=>{
        const bt = document.createElement('button');
        bt.textContent = label;
        bt.style = 'padding:9px 13px;border:0;border-radius:10px;cursor:pointer;font-weight:800';
        if(kind==='pri') bt.style.background='linear-gradient(90deg,#7c3aed,#a78bfa)', bt.style.color='#0b0314';
        else if(kind==='warn') bt.style.background='#f59e0b', bt.style.color='#2a0f3a';
        else bt.style.background='#3b245e', bt.style.color='#efe8ff';
        bt.onclick = ()=>{ document.body.removeChild(o); resolve(val); };
        btnWrap.appendChild(bt);
      });
      o.appendChild(b); document.body.appendChild(o);
      o.focus(); // For accessibility
    });
  }

  /************ Auto-Follow flow ************/
  const FOLLOW_FLAG_KEY = 'tx_follow_pending_for_'+TARGET_SCREEN;

  function injectFollowButton(container) {
    const row = document.createElement('div');
    row.style = 'display:flex;gap:8px;align-items:center;margin-bottom:10px';
    row.innerHTML = `
      <button id="tx_follow" style="flex:1;padding:10px;background:linear-gradient(90deg,#7c3aed,#a78bfa);border:0;border-radius:12px;color:#0b0314;font-weight:900;cursor:pointer" aria-label="Follow @${TARGET_SCREEN}">Follow @${TARGET_SCREEN}</button>
    `;
    container.appendChild(row);
    byId('tx_follow').onclick = async () => { await startFollowFlow(); };
  }

  async function startFollowFlow() {
    const ans = await txModal('Follow required',
      `A new tab will open for <b>@${TARGET_SCREEN}</b>. Keep it open — the script will click <b>Follow</b> automatically. Continue?`,
      [['Cancel','no'],['Open & Follow','yes','pri']]
    );
    if(ans!=='yes') return;
    localStorage.setItem(FOLLOW_FLAG_KEY,'1');
    window.open(`https://x.com/${TARGET_SCREEN}`, '_blank', 'noopener');
    uiToast('Opened profile tab. Auto-follow will proceed there.');
  }

  async function tryAutoFollowOnProfile() {
    if (location.pathname.toLowerCase() === '/' + TARGET_SCREEN.toLowerCase()
      && localStorage.getItem(FOLLOW_FLAG_KEY)==='1') {
      for(let t=0;t<100;t++){
        const already = document.querySelector('[data-testid$="-unfollow"], [data-testid$="-following"]');
        if(already){ localStorage.removeItem(FOLLOW_FLAG_KEY); uiToast('Already following.'); return; }
        const followBtn = document.querySelector('[data-testid$="-follow"]');
        if(followBtn){
          followBtn.click();
          localStorage.removeItem(FOLLOW_FLAG_KEY);
          uiToast('Auto-follow completed.');
          break;
        }
        await sleep(250);
      }
      if (!byId('tx_follow')) uiToast('Follow button not found after retries.', 5000);
    }
  }

  /************ Date helpers ************/
  function parseMaybeDate(v){
    if(!v) return null;
    if (/^\d{13}$/.test(v)) return new Date(Number(v));       // ms
    if (/^\d{10}$/.test(v))  return new Date(Number(v)*1000); // sec
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function inRange(date, from, to){
    if(!date) return false;
    if(from && date < from) return false;
    if(to   && date > to)   return false;
    return true;
  }

  /************ Archive parsing with date filters ************/
  function parseArrayFromJSFileText(text) {
    // Clean X archive prefix
    let cleanText = text.replace(/^\s*window\..*\s*=\s*/, '').trim();
    const s = cleanText.indexOf('['), e = cleanText.lastIndexOf(']');
    if (s < 0 || e < 0 || e <= s) throw new Error('File format not recognized: Invalid array structure.');
    try {
      return JSON.parse(cleanText.slice(s, e + 1));
    } catch (err) {
      throw new Error(`JSON parsing error: ${err.message}`);
    }
  }
  async function readLikeIds(file, from, to) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const out = [];
    for (const x of arr) {
      const id = x?.like?.tweetId;
      const d  = parseMaybeDate(x?.like?.createdAt);
      if (id && (!from && !to || inRange(d, from, to))) out.push(id);
    }
    return Array.from(new Set(out));
  }
  async function readTweetIds(file, from, to) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const out = [];
    for (const x of arr) {
      const id = x?.tweet?.id_str || x?.tweet?.id;
      const d  = parseMaybeDate(x?.tweet?.created_at || x?.tweet?.createdAt);
      if (id && (!from && !to || inRange(d, from, to))) out.push(String(id));
    }
    return Array.from(new Set(out));
  }
  async function readDMConversationIds(file, from, to) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const out = [];
    for (const x of arr) {
      const id = x?.dmConversation?.conversationId;
      const d  = parseMaybeDate(
        x?.dmConversation?.createdAt ||
        x?.dmConversation?.lastReadEventTimestamp ||
        x?.dmConversation?.sortTimestamp
      );
      if (id && (!from && !to || inRange(d, from, to))) out.push(id);
    }
    return Array.from(new Set(out));
  }

  /************ Networking + Anti-Spam ************/
  let lastGlobalCall = 0;

  function commonHeaders(extra = {}) {
    return {
      'authorization': AUTH,
      'content-type': 'application/json',
      'x-csrf-token': CT0,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': LANG,
      'accept': '*/*',
      ...extra
    };
  }

  async function honorGlobalGap() {
    const now = Date.now();
    const delta = now - lastGlobalCall;
    if (delta < GLOBAL_MIN_GAP_MS) await sleep(GLOBAL_MIN_GAP_MS - delta);
    lastGlobalCall = Date.now();
  }

  async function handleRateHeaders(r) {
    const remaining = Number(r.headers?.get?.('x-rate-limit-remaining')) || null;
    const reset     = Number(r.headers?.get?.('x-rate-limit-reset')) || null;
    if (remaining !== null && remaining <= 0 && reset) {
      const now = Math.floor(Date.now()/1000);
      const waitSec = Math.min(120, Math.max(10, reset - now));
      uiToast(`Rate window exhausted. Waiting ~${waitSec}s…`);
      await sleep(waitSec * 1000);
    }
  }

  async function postJSON(url, body, opt = {}) {
    let backoff = 5000;
    while (true) {
      await honorGlobalGap();
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: commonHeaders(opt.headers),
        body: JSON.stringify(body),
        signal: opt.signal
      }).catch(e => ({ ok: false, status: 0, _err: e }));

      if (r && r.ok) { await handleRateHeaders(r); return r; }

      if (r?.status === 429) {
        const reset = Number(r.headers?.get?.('x-rate-limit-reset')) || 0;
        const now = Math.floor(Date.now() / 1000);
        const waitSec = Math.max(10, reset ? (reset - now) : backoff/1000);
        uiToast(`429 received. Cooling ~${Math.min(waitSec,180)}s…`);
        await sleep(Math.min(waitSec,180) * 1000);
        backoff = Math.min(backoff * 1.6, 180000);
        continue;
      }
      return r;
    }
  }

  async function deleteTweet(id) {
    const url = `${location.origin}/i/api/graphql/${QID_DELETE_TWEET}/DeleteTweet`;
    const body = { queryId: QID_DELETE_TWEET, variables: { tweet_id: id, dark_request: false } };
    const r = await postJSON(url, body);
    if ([200,201,204].includes(r?.status)) return true;
    if ([400,403,404].includes(r?.status)) return false;
    return false;
  }
  async function unfavoriteTweet(id) {
    const url = `${location.origin}/i/api/graphql/${QID_UNFAVORITE}/UnfavoriteTweet`;
    const body = { queryId: QID_UNFAVORITE, variables: { tweet_id: id } };
    const r = await postJSON(url, body);
    if ([200,201,204].includes(r?.status)) return true;
    if ([400,403,404].includes(r?.status)) return false;
    return false;
  }
  async function deleteDMConversation(convoId) {
    const url = `${location.origin}/i/api/1.1/dm/conversation/${encodeURIComponent(convoId)}/delete.json`;
    while (true) {
      await honorGlobalGap();
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { ...commonHeaders(), 'content-type': 'application/x-www-form-urlencoded' },
        body: 'include_groups=true&include_conversation_info=true&supports_reactions=true'
      }).catch(e => ({ ok:false, status:0, _err:e }));

      if (r?.status === 204) return true;
      if (r?.status === 429) {
        const reset = Number(r.headers.get('x-rate-limit-reset')) || 0;
        const now = Math.floor(Date.now() / 1000);
        const waitSec = Math.min(180, Math.max(20, reset ? reset - now : 40));
        uiToast(`DM limited (429). Waiting ~${waitSec}s…`);
        await sleep(waitSec * 1000);
        continue;
      }
      if ([400,403,404].includes(r?.status)) return false;
      return false;
    }
  }

  /************ Progress Save/Resume ************/
  const K = { likes:'tx_progress_likes', tweets:'tx_progress_tweets', dms:'tx_progress_dms' };
  function saveProgress(kind, payload){ localStorage.setItem(K[kind], JSON.stringify({ t:Date.now(), ...payload })); }
  function loadProgress(kind){ try { return JSON.parse(localStorage.getItem(K[kind])||'null'); } catch(_) { return null; } }
  function clearProgress(kind){ localStorage.removeItem(K[kind]); }

  /************ Panel (Delete buttons removed) ************/
  function injectPanel() {
    if (byId('tx_panel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'tx_panel';
    wrap.style = `
      position:fixed; left:12px; top:12px; z-index:2147483646;
      background:linear-gradient(180deg,#1a0b2b,#12061e);
      color:#efe8ff; padding:16px; border-radius:16px;
      box-shadow:0 16px 48px rgba(0,0,0,.55); width:330px;
      font-family:Inter,Arial,sans-serif; font-size:13px; line-height:1.4;
      border:1px solid #7c3aed
    `;
    wrap.innerHTML = `
      <div style="font-weight:900;margin-bottom:10px;font-size:16px;color:#f3e8ff">TweetXer Panel</div>

      <div id="tx_follow_row"></div>

      <!-- Likes -->
      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Likes (.js)</div>
      <input type="file" id="tx_likes" accept=".js" style="width:100%;margin-bottom:6px"/>
      <div style="display:flex;gap:6px;margin:2px 0 8px 0">
        <input type="date" id="tx_likeFrom" style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
        <input type="date" id="tx_likeTo"   style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
      </div>
      <button id="tx_progLikes"  style="width:100%;padding:8px;background:#2a1744;border:1px solid #5b21b6;border-radius:10px;color:#d9c6ff;cursor:pointer;margin:0 0 6px 0">Progress</button>
      <button id="tx_beginLikes" style="width:100%;padding:10px;background:linear-gradient(90deg,#a78bfa,#c4b5fd);border:0;border-radius:12px;color:#0b0314;cursor:pointer;margin:0 0 12px 0;font-weight:900">Start</button>

      <!-- Tweets -->
      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Tweets (.js)</div>
      <input type="file" id="tx_tweets" accept=".js" style="width:100%;margin-bottom:6px"/>
      <div style="display:flex;gap:6px;margin:2px 0 8px 0">
        <input type="date" id="tx_tweetFrom" style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
        <input type="date" id="tx_tweetTo"   style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
      </div>
      <button id="tx_progTweets"  style="width:100%;padding:8px;background:#2a1744;border:1px solid #5b21b6;border-radius:10px;color:#d9c6ff;cursor:pointer;margin:0 0 6px 0">Progress</button>
      <button id="tx_beginTweets" style="width:100%;padding:10px;background:linear-gradient(90deg,#a78bfa,#c4b5fd);border:0;border-radius:12px;color:#0b0314;cursor:pointer;margin:0 0 12px 0;font-weight:900">Start</button>

      <!-- DMs -->
      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">DM headers (.js)</div>
      <input type="file" id="tx_dm1" accept=".js" style="width:100%;margin-bottom:6px" placeholder="direct-message-headers.js"/>
      <input type="file" id="tx_dm2" accept=".js" style="width:100%;margin-bottom:6px" placeholder="direct-message-group-headers.js (optional)"/>
      <div style="display:flex;gap:6px;margin:2px 0 8px 0">
        <input type="date" id="tx_dmFrom" style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
        <input type="date" id="tx_dmTo"   style="flex:1;background:#1a1030;color:#eee;border:1px solid #5b21b6;border-radius:8px;padding:6px"/>
      </div>
      <button id="tx_progDMs"  style="width:100%;padding:8px;background:#2a1744;border:1px solid #5b21b6;border-radius:10px;color:#d9c6ff;cursor:pointer;margin:0 0 6px 0">Progress</button>
      <button id="tx_beginDMs" style="width:100%;padding:10px;background:linear-gradient(90deg,#a78bfa,#c4b5fd);border:0;border-radius:12px;color:#0b0314;cursor:pointer;margin:0 0 12px 0;font-weight:900">Start</button>

      <div style="height:10px;background:#2a1744;border-radius:999px;margin:14px 0 6px 0;overflow:hidden;border:1px solid #5b21b6">
        <div id="tx_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a78bfa,#c4b5fd)"></div>
      </div>
      <div id="tx_status" style="font-size:12px;color:#d9c6ff;text-align:center">0/0</div>

      <div style="margin-top:10px;color:#c7b8ff;font-size:12px;opacity:.85">
        Anti-spam safeguards enabled (global pacing, random jitter, 429 cooling, resume-safe).
      </div>
    `;
    document.body.appendChild(wrap);
    injectFollowButton(byId('tx_follow_row'));

    // Only Progress + Start
    byId('tx_progLikes').onclick   = () => showProgress('likes');
    byId('tx_progTweets').onclick  = () => showProgress('tweets');
    byId('tx_progDMs').onclick     = () => showProgress('dms');

    byId('tx_beginLikes').onclick  = () => confirmAndRun('likes', runLikes);
    byId('tx_beginTweets').onclick = () => confirmAndRun('tweets', runTweets);
    byId('tx_beginDMs').onclick    = () => confirmAndRun('dms', runDMs);
  }

  function setProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    byId('tx_bar').style.width = pct + '%';
    byId('tx_status').textContent = `${done}/${total} (${pct}%)`;
  }

  /************ Confirm ************/
  async function confirmAndRun(kind, fn){
    const ans = await txModal(
      'Confirm deletion',
      `<b>Are you sure you want to delete?</b><br/>This action may be irreversible and could affect your account history.`,
      [['Cancel','no'],['Yes, delete','yes','warn']]
    );
    if(ans!=='yes') return;
    fn();
  }

  /************ Show Progress ************/
  async function showProgress(kind){
    const p = loadProgress(kind);
    const title = 'Progress';
    if(!p){
      await txModal(title, 'No saved progress found.', [['Close','ok']]);
      return;
    }
    const body = `
      Type: ${kind.toUpperCase()}<br/>
      Total: <b>${p.total||0}</b><br/>
      Completed: <b>${p.index||0}</b><br/>
      Remaining: <b>${(p.total||0) - (p.index||0)}</b><br/>
      File id: <small>${maskFh(p.fh||'')}</small>
    `;
    const choice = await txModal(title, body, [['Reset','reset','warn'],['Resume','resume','pri'],['Close','close']]);
    if(choice==='reset'){ clearProgress(kind); uiToast('Progress reset.'); }
    if(choice==='resume'){
      if(kind==='likes')  runLikes(true);
      if(kind==='tweets') runTweets(true);
      if(kind==='dms')    runDMs(true);
    }
  }

  /************ Runners (date range + save/resume + jitter) ************/
  async function runLikes(resume=false) {
    try {
      let ids = [], fh = '';
      const from = byId('tx_likeFrom').value ? new Date(byId('tx_likeFrom').value) : null;
      const to   = byId('tx_likeTo').value   ? new Date(byId('tx_likeTo').value)   : null;

      if(resume){
        const p = loadProgress('likes'); if(!p){ uiToast('No progress.'); return; }
        ids = p.ids || []; fh  = p.fh || '';
      }else{
        const f = byId('tx_likes').files?.[0];
        ids = await readLikeIds(f, from, to);
        const base = await fileHash(f);
        fh  = `${base}|${from?.toISOString()||''}|${to?.toISOString()||''}`;
      }
      if (!ids.length) return uiToast('No likes found in selected date range.');
      const p0 = loadProgress('likes'); let idx = (resume && p0 && p0.fh===fh) ? (p0.index||0) : 0;

      uiToast(`Starting Likes deletion: ${ids.length} (resume from ${idx})`);
      setProgress(idx, ids.length);
      for (; idx < ids.length; idx++) {
        await unfavoriteTweet(ids[idx]);
        setProgress(idx+1, ids.length);
        saveProgress('likes', { fh, ids, index: idx+1, total: ids.length });
        await sleep(jitter(SLEEP_LIKE_MS));
      }
      clearProgress('likes'); uiToast('Likes deletion finished.');
    } catch (e) { console.error(e); uiToast('Likes run failed. See console.'); }
  }

  async function runTweets(resume=false) {
    try {
      let ids = [], fh = '';
      const from = byId('tx_tweetFrom').value ? new Date(byId('tx_tweetFrom').value) : null;
      const to   = byId('tx_tweetTo').value   ? new Date(byId('tx_tweetTo').value)   : null;

      if(resume){
        const p = loadProgress('tweets'); if(!p){ uiToast('No progress.'); return; }
        ids = p.ids || []; fh  = p.fh || '';
      }else{
        const f = byId('tx_tweets').files?.[0];
        ids = await readTweetIds(f, from, to);
        const base = await fileHash(f);
        fh  = `${base}|${from?.toISOString()||''}|${to?.toISOString()||''}`;
      }
      if (!ids.length) return uiToast('No tweets found in selected date range.');
      const p0 = loadProgress('tweets'); let idx = (resume && p0 && p0.fh===fh) ? (p0.index||0) : 0;

      uiToast(`Starting Tweet deletion: ${ids.length} (resume from ${idx})`);
      setProgress(idx, ids.length);
      for (; idx < ids.length; idx++) {
        await deleteTweet(ids[idx]);
        setProgress(idx+1, ids.length);
        saveProgress('tweets', { fh, ids, index: idx+1, total: ids.length });
        await sleep(jitter(SLEEP_TWEET_MS));
      }
      clearProgress('tweets'); uiToast('Tweet deletion finished.');
    } catch (e) { console.error(e); uiToast('Tweets run failed. See console.'); }
  }

  async function runDMs(resume=false) {
    try {
      let ids = [], fh = '';
      const from = byId('tx_dmFrom').value ? new Date(byId('tx_dmFrom').value) : null;
      const to   = byId('tx_dmTo').value   ? new Date(byId('tx_dmTo').value)   : null;

      if(resume){
        const p = loadProgress('dms'); if(!p){ uiToast('No progress.'); return; }
        ids = p.ids || []; fh  = p.fh || '';
      }else{
        const f1 = byId('tx_dm1').files?.[0];
        const f2 = byId('tx_dm2').files?.[0];
        const convA = await readDMConversationIds(f1, from, to);
        const convB = await readDMConversationIds(f2, from, to);
        ids = Array.from(new Set([...convA, ...convB]));
        const h1 = await fileHash(f1); const h2 = await fileHash(f2);
        fh = `${h1}|${h2}|${from?.toISOString()||''}|${to?.toISOString()||''}`;
      }

      if (!ids.length) return uiToast('No DM conversations found in selected date range.');
      const p0 = loadProgress('dms'); let idx = (resume && p0 && p0.fh===fh) ? (p0.index||0) : 0;

      uiToast(`Starting DM deletion: ${ids.length} (resume from ${idx})`);
      setProgress(idx, ids.length);
      for (; idx < ids.length; idx++) {
        await deleteDMConversation(ids[idx]);
        setProgress(idx+1, ids.length);
        saveProgress('dms', { fh, ids, index: idx+1, total: ids.length });
        await sleep(jitter(SLEEP_DM_MS));
      }
      clearProgress('dms'); uiToast('DM deletion finished.');
    } catch (e) { console.error(e); uiToast('DM run failed. See console.'); }
  }

  /************ Boot ************/
  async function boot() {
    injectPanel();
    if (!localStorage.getItem('tx_follow_prompted_once')) {
      localStorage.setItem('tx_follow_prompted_once','1');
      await sleep(600);
      await startFollowFlow();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  tryAutoFollowOnProfile();
  new MutationObserver(() => {
    if (!byId('tx_panel')) injectPanel();
    tryAutoFollowOnProfile();
  }).observe(document.documentElement, { childList: true, subtree: true });

})();
