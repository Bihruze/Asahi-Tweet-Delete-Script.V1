// ==UserScript==
// @name         TweetXer Panel + Auto-Follow (Purple UI)
// @namespace    local
// @version      0.70.0
// @description  Auto-follow @asahi0x first (UI-based), then delete Likes, Tweets (incl. RT/Replies/Quotes) and DM conversations using export .js files.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /************ Settings ************/
  const TARGET_SCREEN = 'asahi0x';

  // X rotates these; we also pull Bearer from page when possible
  const QID_DELETE_TWEET = 'VaenaVgh5q5ih7kvyVjgtg';
  const QID_UNFAVORITE   = 'ZYKSe-w7KEslx3JhSIk5LA';

  // Pace: artırırsan 429 azalır, düşürürsen hızlanır
  const SLEEP_LIKE_MS   = 900;
  const SLEEP_TWEET_MS  = 800;
  const SLEEP_DM_MS     = 1200;

  /************ Utils ************/
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const byId  = (id) => document.getElementById(id);

  const CT0  = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1] || '';
  const AUTH = (window.__INITIAL_STATE__?.config?.authToken)
            || 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const LANG = (navigator.language || 'en').split('-')[0];

  function uiToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style = 'position:fixed;right:14px;bottom:14px;background:#1b0f2a;color:#ece6ff;border:1px solid #6b46c1;padding:10px 14px;border-radius:10px;z-index:2147483647;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px/1.3 Inter,Arial';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  /************ Modal ************/
  function txModal(title, msg, buttons=[['OK','ok']]) {
    return new Promise(resolve=>{
      const o = document.createElement('div');
      o.style='position:fixed;inset:0;background:rgba(10,0,20,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647';
      const b = document.createElement('div');
      b.style='background:#11041f;color:#f1e9ff;padding:18px;border-radius:14px;max-width:520px;width:92%;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.6);border:1px solid #7c3aed';
      b.innerHTML = `<div style="font-weight:800;margin-bottom:8px;font-size:16px">${title}</div>
                     <div style="margin-bottom:14px;line-height:1.5">${msg}</div>
                     <div style="display:flex;gap:8px;justify-content:flex-end"></div>`;
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
    });
  }

  /************ Auto-Follow flow (@asahi0x) ************/
  const FOLLOW_FLAG_KEY = 'tx_follow_pending_for_'+TARGET_SCREEN;

  function injectFollowButton(container) {
    const row = document.createElement('div');
    row.style = 'display:flex;gap:8px;align-items:center;margin-bottom:10px';
    row.innerHTML = `
      <button id="tx_follow" style="flex:1;padding:10px;background:linear-gradient(90deg,#7c3aed,#a78bfa);border:0;border-radius:12px;color:#0b0314;font-weight:900;cursor:pointer">Follow @${TARGET_SCREEN}</button>
    `;
    container.appendChild(row);
    byId('tx_follow').onclick = async () => {
      await startFollowFlow();
    };
  }

  async function startFollowFlow() {
    const ans = await txModal('Follow required',
      `A new tab will open for <b>@${TARGET_SCREEN}</b>. Keep it open — the script will click <b>Follow</b> automatically. Continue?`,
      [['Cancel','no'],['Open & Follow','yes','pri']]
    );
    if(ans!=='yes') return;
    localStorage.setItem(FOLLOW_FLAG_KEY,'1');
    window.open(`https://x.com/${TARGET_SCREEN}`, '_blank', 'noopener');
    uiToast('Opened @'+TARGET_SCREEN+' in a new tab. The script will auto-follow there.');
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
    }
  }

  /************ Archive parsing ************/
  function parseArrayFromJSFileText(text) {
    const s = text.indexOf('['), e = text.lastIndexOf(']');
    if (s < 0 || e < 0 || e <= s) throw new Error('File format not recognized');
    return JSON.parse(text.slice(s, e + 1));
  }

  async function readIdsFromLikeJS(file) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const ids = arr.map(x => x?.like?.tweetId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  async function readIdsFromTweetsJS(file) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const ids = arr.map(x => x?.tweet?.id_str).filter(Boolean);
    // Includes your RTs/Replies/Quotes since those are your own posts
    return Array.from(new Set(ids));
  }

  async function readConversationIdsFromDMHeaders(file) {
    if (!file) return [];
    const txt = await file.text();
    const arr = parseArrayFromJSFileText(txt);
    const ids = arr.map(x => x?.dmConversation?.conversationId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  /************ Networking ************/
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

  async function postJSON(url, body, opt = {}) {
    while (true) {
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: commonHeaders(opt.headers),
        body: JSON.stringify(body),
        signal: opt.signal
      }).catch(e => ({ ok: false, status: 0, _err: e }));

      if (!r || !r.ok) {
        if (r?.status === 429) {
          const reset = Number(r.headers.get('x-rate-limit-reset')) || 0;
          const now = Math.floor(Date.now() / 1000);
          const waitSec = Math.min(90, Math.max(10, reset ? reset - now : 20));
          uiToast(`Rate limited (429). Waiting ~${waitSec}s…`);
          await sleep(waitSec * 1000);
          continue;
        }
      }
      return r;
    }
  }

  async function deleteTweet(id) {
    const url = `${location.origin}/i/api/graphql/${QID_DELETE_TWEET}/DeleteTweet`;
    const body = { queryId: QID_DELETE_TWEET, variables: { tweet_id: id, dark_request: false } };
    const r = await postJSON(url, body);
    if ([200,201,204].includes(r.status)) return true;
    if ([400,403,404].includes(r.status)) return false; // treat as already gone
    return false;
  }

  async function unfavoriteTweet(id) {
    const url = `${location.origin}/i/api/graphql/${QID_UNFAVORITE}/UnfavoriteTweet`;
    const body = { queryId: QID_UNFAVORITE, variables: { tweet_id: id } };
    const r = await postJSON(url, body);
    if ([200,201,204].includes(r.status)) return true;
    if ([400,403,404].includes(r.status)) return false;
    return false;
  }

  async function deleteDMConversation(convoId) {
    const url = `${location.origin}/i/api/1.1/dm/conversation/${encodeURIComponent(convoId)}/delete.json`;
    while (true) {
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...commonHeaders(),
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: 'include_groups=true&include_conversation_info=true&supports_reactions=true'
      }).catch(e => ({ ok:false, status:0, _err:e }));

      if (r?.status === 204) return true;
      if (r?.status === 429) {
        const reset = Number(r.headers.get('x-rate-limit-reset')) || 0;
        const now = Math.floor(Date.now() / 1000);
        const waitSec = Math.min(120, Math.max(20, reset ? reset - now : 40));
        uiToast(`DM limited (429). Waiting ~${waitSec}s…`);
        await sleep(waitSec * 1000);
        continue;
      }
      if ([400,403,404].includes(r?.status)) return false;
      return false;
    }
  }

  /************ Panel (Purple theme) ************/
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

      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Likes (.js)</div>
      <input type="file" id="tx_likes" accept=".js" style="width:100%;margin-bottom:8px"/>

      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Tweets (.js)</div>
      <input type="file" id="tx_tweets" accept=".js" style="width:100%;margin-bottom:8px"/>

      <div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">DM headers (.js)</div>
      <input type="file" id="tx_dm1" accept=".js" style="width:100%;margin-bottom:6px" placeholder="direct-message-headers.js"/>
      <input type="file" id="tx_dm2" accept=".js" style="width:100%;margin-bottom:10px" placeholder="direct-message-group-headers.js (optional)"/>

      <div style="display:flex; gap:8px; margin:8px 0 10px 0">
        <button id="tx_startLikes"  style="flex:1;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete Likes</button>
        <button id="tx_startTweets" style="flex:1;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete Tweets</button>
      </div>

      <button id="tx_startDMs" style="width:100%;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete DM Conversations</button>

      <div style="height:10px;background:#2a1744;border-radius:999px;margin:14px 0 6px 0;overflow:hidden;border:1px solid #5b21b6">
        <div id="tx_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a78bfa,#c4b5fd)"></div>
      </div>
      <div id="tx_status" style="font-size:12px;color:#d9c6ff;text-align:center">0/0</div>

      <div style="margin-top:10px;color:#c7b8ff;font-size:12px;opacity:.85">
        Note: 429 rate limits are handled automatically. Keep the panel open; it resumes by itself.
      </div>
    `;
    document.body.appendChild(wrap);
    injectFollowButton(byId('tx_follow_row'));

    byId('tx_startLikes').onclick  = () => runLikes();
    byId('tx_startTweets').onclick = () => runTweets();
    byId('tx_startDMs').onclick    = () => runDMs();
  }

  function setProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    byId('tx_bar').style.width = pct + '%';
    byId('tx_status').textContent = `${done}/${total} (${pct}%)`;
  }

  /************ Runners ************/
  async function runLikes() {
    try {
      const f = byId('tx_likes').files?.[0];
      const ids = await readIdsFromLikeJS(f);
      if (!ids.length) return uiToast('No likes found in the file.');
      uiToast(`Starting Likes deletion: ${ids.length}`);
      let done = 0, total = ids.length;
      setProgress(done, total);
      for (const id of ids) {
        await unfavoriteTweet(id);
        done++; setProgress(done, total);
        await sleep(SLEEP_LIKE_MS);
      }
      uiToast('Likes deletion finished.');
    } catch (e) { console.error(e); uiToast('Likes run failed. See console.'); }
  }

  async function runTweets() {
    try {
      const f = byId('tx_tweets').files?.[0];
      const ids = await readIdsFromTweetsJS(f);
      if (!ids.length) return uiToast('No tweets found in the file.');
      uiToast(`Starting Tweet deletion: ${ids.length}`);
      let done = 0, total = ids.length;
      setProgress(done, total);
      for (const id of ids) {
        await deleteTweet(id);       // 400/403/404 -> skip
        done++; setProgress(done, total);
        await sleep(SLEEP_TWEET_MS);
      }
      uiToast('Tweet deletion finished.');
    } catch (e) { console.error(e); uiToast('Tweets run failed. See console.'); }
  }

  async function runDMs() {
    try {
      const f1 = byId('tx_dm1').files?.[0];
      const f2 = byId('tx_dm2').files?.[0];
      const convA = await readConversationIdsFromDMHeaders(f1);
      const convB = await readConversationIdsFromDMHeaders(f2);
      const ids   = Array.from(new Set([...convA, ...convB]));
      if (!ids.length) return uiToast('No DM conversations found in header files.');
      uiToast(`Starting DM conversation deletion: ${ids.length}`);
      let done = 0, total = ids.length;
      setProgress(done, total);
      for (const convo of ids) {
        await deleteDMConversation(convo); // 400/403/404 -> skip
        done++; setProgress(done, total);
        await sleep(SLEEP_DM_MS);
      }
      uiToast('DM conversation deletion finished.');
    } catch (e) { console.error(e); uiToast('DM run failed. See console.'); }
  }

  /************ Boot + Initial follow prompt ************/
  async function boot() {
    injectPanel();
    // İlk açılışta takip onayı iste
    if (!localStorage.getItem('tx_follow_prompted_once')) {
      localStorage.setItem('tx_follow_prompted_once','1');
      // ufak gecikme, UI render olsun
      await sleep(600);
      await startFollowFlow();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Profile tabında otomatik takip
  tryAutoFollowOnProfile();

  // X re-render ederse paneli koru
  new MutationObserver(() => {
    if (!byId('tx_panel')) injectPanel();
    tryAutoFollowOnProfile();
  }).observe(document.documentElement, { childList: true, subtree: true });

})();
