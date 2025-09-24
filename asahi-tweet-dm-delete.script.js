// ==UserScript==
// @name         TweetXer Panel + Auto-Follow (Purple UI) [Clean UTF-8, no BOM]
// @namespace    local
// @version      0.70.1
// @description  Auto-follow @asahi0x first (UI-based), then delete Likes, Tweets (incl. RT/Replies/Quotes) and DM conversations using export .js files.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  /************ Settings ************/
  const TARGET_SCREEN = "asahi0x";

  // X rotates these; we also pull Bearer from page when possible
  const QID_DELETE_TWEET = "VaenaVgh5q5ih7kvyVjgtg";
  const QID_UNFAVORITE   = "ZYKSe-w7KEslx3JhSIk5LA";

  // Pace: artırırsan 429 azalır, düşürürsen hızlanır
  const SLEEP_LIKE_MS   = 900;
  const SLEEP_TWEET_MS  = 800;
  const SLEEP_DM_MS     = 1200;

  /************ Utils ************/
  const sleep = (ms) => new Promise(function (r) { setTimeout(r, ms); });
  const byId  = (id) => document.getElementById(id);

  // Cookies / tokens
  var CT0 = "";
  try {
    var m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    CT0 = (m && m[1]) || "";
  } catch (e) { CT0 = ""; }

  // Try to read runtime bearer; fallback to public token
  function getAuthToken() {
    try {
      var st = window.__INITIAL_STATE__;
      if (st && st.config && st.config.authToken) return st.config.authToken;
    } catch (e) {}
    return "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  }
  var AUTH = getAuthToken();

  var LANG = (navigator.language || "en").split("-")[0];

  function uiToast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style = "position:fixed;right:14px;bottom:14px;background:#1b0f2a;color:#ece6ff;border:1px solid #6b46c1;padding:10px 14px;border-radius:10px;z-index:2147483647;box-shadow:0 10px 30px rgba(0,0,0,.4);font:13px/1.3 Inter,Arial";
    document.body.appendChild(t);
    setTimeout(function(){ try { document.body.removeChild(t); } catch(e){} }, 3000);
  }

  /************ Modal ************/
  function txModal(title, msg, buttons) {
    buttons = buttons || [["OK","ok"]];
    return new Promise(function(resolve){
      var o = document.createElement("div");
      o.style = "position:fixed;inset:0;background:rgba(10,0,20,.55);display:flex;align-items:center;justify-content:center;z-index:2147483647";
      var b = document.createElement("div");
      b.style = "background:#11041f;color:#f1e9ff;padding:18px;border-radius:14px;max-width:520px;width:92%;font-family:Inter,Arial,sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.6);border:1px solid #7c3aed";
      b.innerHTML = '<div style="font-weight:800;margin-bottom:8px;font-size:16px">'+title+'</div>'
                  + '<div style="margin-bottom:14px;line-height:1.5">'+msg+'</div>'
                  + '<div style="display:flex;gap:8px;justify-content:flex-end"></div>';
      var btnWrap = b.lastElementChild;
      buttons.forEach(function (tuple){
        var label = tuple[0], val = tuple[1], kind = tuple[2];
        var bt = document.createElement("button");
        bt.textContent = label;
        bt.style = "padding:9px 13px;border:0;border-radius:10px;cursor:pointer;font-weight:800";
        if (kind === "pri") { bt.style.background = "linear-gradient(90deg,#7c3aed,#a78bfa)"; bt.style.color = "#0b0314"; }
        else if (kind === "warn") { bt.style.background = "#f59e0b"; bt.style.color = "#2a0f3a"; }
        else { bt.style.background = "#3b245e"; bt.style.color = "#efe8ff"; }
        bt.onclick = function(){ try { document.body.removeChild(o); } catch(e){} resolve(val); };
        btnWrap.appendChild(bt);
      });
      o.appendChild(b); document.body.appendChild(o);
    });
  }

  /************ Auto-Follow flow (@asahi0x) ************/
  var FOLLOW_FLAG_KEY = "tx_follow_pending_for_"+TARGET_SCREEN;

  function injectFollowButton(container) {
    var row = document.createElement("div");
    row.style = "display:flex;gap:8px;align-items:center;margin-bottom:10px";
    row.innerHTML = '<button id="tx_follow" style="flex:1;padding:10px;background:linear-gradient(90deg,#7c3aed,#a78bfa);border:0;border-radius:12px;color:#0b0314;font-weight:900;cursor:pointer">Follow @'+TARGET_SCREEN+"</button>";
    container.appendChild(row);
    byId("tx_follow").onclick = function(){ startFollowFlow(); };
  }

  function startFollowFlow() {
    return txModal("Follow required",
      "A new tab will open for <b>@"+TARGET_SCREEN+"</b>. Keep it open — the script will click <b>Follow</b> automatically. Continue?",
      [["Cancel","no"],["Open & Follow","yes","pri"]]
    ).then(function(ans){
      if (ans !== "yes") return;
      try { localStorage.setItem(FOLLOW_FLAG_KEY,"1"); } catch(e){}
      window.open("https://x.com/"+TARGET_SCREEN, "_blank", "noopener");
      uiToast("Opened @"+TARGET_SCREEN+" in a new tab. The script will auto-follow there.");
    });
  }

  function tryAutoFollowOnProfile() {
    try {
      if (location.pathname.toLowerCase() === "/" + TARGET_SCREEN.toLowerCase()
          && localStorage.getItem(FOLLOW_FLAG_KEY) === "1") {
        (function poll(t){
          if (t > 100) return;
          var already = document.querySelector('[data-testid$="-unfollow"], [data-testid$="-following"]');
          if (already) { localStorage.removeItem(FOLLOW_FLAG_KEY); uiToast("Already following."); return; }
          var followBtn = document.querySelector('[data-testid$="-follow"]');
          if (followBtn) {
            followBtn.click();
            localStorage.removeItem(FOLLOW_FLAG_KEY);
            uiToast("Auto-follow completed.");
            return;
          }
          setTimeout(function(){ poll(t+1); }, 250);
        })(0);
      }
    } catch(e){}
  }

  /************ Archive parsing ************/
  function parseArrayFromJSFileText(text) {
    var s = text.indexOf("["),
        e = text.lastIndexOf("]");
    if (s < 0 || e < 0 || e <= s) throw new Error("File format not recognized");
    return JSON.parse(text.slice(s, e + 1));
  }

  function readIdsFromLikeJS(file) {
    if (!file) return Promise.resolve([]);
    return file.text().then(function(txt){
      var arr = parseArrayFromJSFileText(txt);
      var ids = [];
      for (var i=0;i<arr.length;i++){
        var x = arr[i];
        var id = x && x.like && x.like.tweetId;
        if (id) ids.push(id);
      }
      return Array.from(new Set(ids));
    });
  }

  function readIdsFromTweetsJS(file) {
    if (!file) return Promise.resolve([]);
    return file.text().then(function(txt){
      var arr = parseArrayFromJSFileText(txt);
      var ids = [];
      for (var i=0;i<arr.length;i++){
        var x = arr[i];
        var id = x && x.tweet && x.tweet.id_str;
        if (id) ids.push(id);
      }
      return Array.from(new Set(ids));
    });
  }

  function readConversationIdsFromDMHeaders(file) {
    if (!file) return Promise.resolve([]);
    return file.text().then(function(txt){
      var arr = parseArrayFromJSFileText(txt);
      var ids = [];
      for (var i=0;i<arr.length;i++){
        var x = arr[i];
        var id = x && x.dmConversation && x.dmConversation.conversationId;
        if (id) ids.push(id);
      }
      return Array.from(new Set(ids));
    });
  }

  /************ Networking ************/
  function commonHeaders(extra) {
    var base = {
      "authorization": AUTH,
      "content-type": "application/json",
      "x-csrf-token": CT0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": LANG,
      "accept": "*/*"
    };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra,k)) base[k] = extra[k]; } }
    return base;
  }

  function postJSON(url, body, opt) {
    opt = opt || {};
    return (function loop() {
      return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: commonHeaders(opt.headers),
        body: JSON.stringify(body),
        signal: opt.signal
      }).catch(function(e){ return { ok:false, status:0, _err:e }; })
      .then(function(r){
        if (!r || !r.ok) {
          if (r && r.status === 429) {
            var reset = Number(r.headers.get("x-rate-limit-reset")) || 0;
            var now = Math.floor(Date.now() / 1000);
            var waitSec = Math.min(90, Math.max(10, reset ? (reset - now) : 20));
            uiToast("Rate limited (429). Waiting ~"+waitSec+"s…");
            return sleep(waitSec * 1000).then(loop);
          }
        }
        return r;
      });
    })();
  }

  function deleteTweet(id) {
    var url = location.origin + "/i/api/graphql/" + QID_DELETE_TWEET + "/DeleteTweet";
    var body = { queryId: QID_DELETE_TWEET, variables: { tweet_id: id, dark_request: false } };
    return postJSON(url, body).then(function(r){
      if (!r) return false;
      if ([200,201,204].indexOf(r.status) >= 0) return true;
      if ([400,403,404].indexOf(r.status) >= 0) return false;
      return false;
    });
  }

  function unfavoriteTweet(id) {
    var url = location.origin + "/i/api/graphql/" + QID_UNFAVORITE + "/UnfavoriteTweet";
    var body = { queryId: QID_UNFAVORITE, variables: { tweet_id: id } };
    return postJSON(url, body).then(function(r){
      if (!r) return false;
      if ([200,201,204].indexOf(r.status) >= 0) return true;
      if ([400,403,404].indexOf(r.status) >= 0) return false;
      return false;
    });
  }

  function deleteDMConversation(convoId) {
    var url = location.origin + "/i/api/1.1/dm/conversation/" + encodeURIComponent(convoId) + "/delete.json";
    function loop() {
      return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: (function(){
          var h = commonHeaders();
          h["content-type"] = "application/x-www-form-urlencoded";
          return h;
        })(),
        body: "include_groups=true&include_conversation_info=true&supports_reactions=true"
      }).catch(function(e){ return { ok:false, status:0, _err:e }; })
      .then(function(r){
        if (r && r.status === 204) return true;
        if (r && r.status === 429) {
          var reset = Number(r.headers.get("x-rate-limit-reset")) || 0;
          var now = Math.floor(Date.now() / 1000);
          var waitSec = Math.min(120, Math.max(20, reset ? (reset - now) : 40));
          uiToast("DM limited (429). Waiting ~"+waitSec+"s…");
          return sleep(waitSec * 1000).then(loop);
        }
        if (r && [400,403,404].indexOf(r.status) >= 0) return false;
        return false;
      });
    }
    return loop();
  }

  /************ Panel (Purple theme) ************/
  function injectPanel() {
    if (byId("tx_panel")) return;
    var wrap = document.createElement("div");
    wrap.id = "tx_panel";
    wrap.style = "position:fixed; left:12px; top:12px; z-index:2147483646; background:linear-gradient(180deg,#1a0b2b,#12061e); color:#efe8ff; padding:16px; border-radius:16px; box-shadow:0 16px 48px rgba(0,0,0,.55); width:330px; font-family:Inter,Arial,sans-serif; font-size:13px; line-height:1.4; border:1px solid #7c3aed";
    wrap.innerHTML =
      '<div style="font-weight:900;margin-bottom:10px;font-size:16px;color:#f3e8ff">TweetXer Panel</div>' +
      '<div id="tx_follow_row"></div>' +
      '<div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Likes (.js)</div>' +
      '<input type="file" id="tx_likes" accept=".js" style="width:100%;margin-bottom:8px"/>' +
      '<div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">Tweets (.js)</div>' +
      '<input type="file" id="tx_tweets" accept=".js" style="width:100%;margin-bottom:8px"/>' +
      '<div style="margin:6px 0 4px 0; font-weight:800;color:#d9c6ff">DM headers (.js)</div>' +
      '<input type="file" id="tx_dm1" accept=".js" style="width:100%;margin-bottom:6px" placeholder="direct-message-headers.js"/>' +
      '<input type="file" id="tx_dm2" accept=".js" style="width:100%;margin-bottom:10px" placeholder="direct-message-group-headers.js (optional)"/>' +
      '<div style="display:flex; gap:8px; margin:8px 0 10px 0">' +
      '<button id="tx_startLikes"  style="flex:1;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete Likes</button>' +
      '<button id="tx_startTweets" style="flex:1;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete Tweets</button>' +
      "</div>" +
      '<button id="tx_startDMs" style="width:100%;padding:10px;background:#3b245e;border:0;border-radius:12px;color:#efe8ff;font-weight:900;cursor:pointer">Delete DM Conversations</button>' +
      '<div style="height:10px;background:#2a1744;border-radius:999px;margin:14px 0 6px 0;overflow:hidden;border:1px solid #5b21b6">' +
      '<div id="tx_bar" style="height:100%;width:0%;background:linear-gradient(90deg,#7c3aed,#a78bfa,#c4b5fd)"></div>' +
      "</div>" +
      '<div id="tx_status" style="font-size:12px;color:#d9c6ff;text-align:center">0/0</div>' +
      '<div style="margin-top:10px;color:#c7b8ff;font-size:12px;opacity:.85">Note: 429 rate limits are handled automatically. Keep the panel open; it resumes by itself.</div>';
    document.body.appendChild(wrap);
    injectFollowButton(byId("tx_follow_row"));

    byId("tx_startLikes").onclick  = function(){ runLikes(); };
    byId("tx_startTweets").onclick = function(){ runTweets(); };
    byId("tx_startDMs").onclick    = function(){ runDMs(); };
  }

  function setProgress(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    byId("tx_bar").style.width = pct + "%";
    byId("tx_status").textContent = done + "/" + total + " (" + pct + "%)";
  }

  /************ Runners ************/
  function runLikes() {
    try {
      var f = byId("tx_likes").files && byId("tx_likes").files[0];
      return readIdsFromLikeJS(f).then(function(ids){
        if (!ids.length) { uiToast("No likes found in the file."); return; }
        uiToast("Starting Likes deletion: " + ids.length);
        var done = 0, total = ids.length;
        setProgress(done, total);
        (function next(i){
          if (i >= ids.length) { uiToast("Likes deletion finished."); return; }
          unfavoriteTweet(ids[i]).then(function(){
            done++; setProgress(done, total);
            sleep(SLEEP_LIKE_MS).then(function(){ next(i+1); });
          });
        })(0);
      });
    } catch (e) { console.error(e); uiToast("Likes run failed. See console."); }
  }

  function runTweets() {
    try {
      var f = byId("tx_tweets").files && byId("tx_tweets").files[0];
      return readIdsFromTweetsJS(f).then(function(ids){
        if (!ids.length) { uiToast("No tweets found in the file."); return; }
        uiToast("Starting Tweet deletion: " + ids.length);
        var done = 0, total = ids.length;
        setProgress(done, total);
        (function next(i){
          if (i >= ids.length) { uiToast("Tweet deletion finished."); return; }
          deleteTweet(ids[i]).then(function(){
            done++; setProgress(done, total);
            sleep(SLEEP_TWEET_MS).then(function(){ next(i+1); });
          });
        })(0);
      });
    } catch (e) { console.error(e); uiToast("Tweets run failed. See console."); }
  }

  function runDMs() {
    try {
      var f1 = byId("tx_dm1").files && byId("tx_dm1").files[0];
      var f2 = byId("tx_dm2").files && byId("tx_dm2").files[0];
      return Promise.all([readConversationIdsFromDMHeaders(f1), readConversationIdsFromDMHeaders(f2)]).then(function(res){
        var convA = res[0] || [], convB = res[1] || [];
        var ids = Array.from(new Set([].concat(convA, convB)));
        if (!ids.length) { uiToast("No DM conversations found in header files."); return; }
        uiToast("Starting DM conversation deletion: " + ids.length);
        var done = 0, total = ids.length;
        setProgress(done, total);
        (function next(i){
          if (i >= ids.length) { uiToast("DM conversation deletion finished."); return; }
          deleteDMConversation(ids[i]).then(function(){
            done++; setProgress(done, total);
            sleep(SLEEP_DM_MS).then(function(){ next(i+1); });
          });
        })(0);
      });
    } catch (e) { console.error(e); uiToast("DM run failed. See console."); }
  }

  /************ Boot + Initial follow prompt ************/
  function boot() {
    injectPanel();
    try {
      if (!localStorage.getItem("tx_follow_prompted_once")) {
        localStorage.setItem("tx_follow_prompted_once","1");
        sleep(600).then(function(){ startFollowFlow(); });
      }
    } catch(e){}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Profile tabında otomatik takip
  try { tryAutoFollowOnProfile(); } catch(e){}

  // X re-render ederse paneli koru
  try {
    new MutationObserver(function () {
      if (!byId("tx_panel")) injectPanel();
      tryAutoFollowOnProfile();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch(e){}

})();
