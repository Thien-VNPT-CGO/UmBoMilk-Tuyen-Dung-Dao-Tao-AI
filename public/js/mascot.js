(function(){
  if(window.__umbMascotLoaded) return;
  window.__umbMascotLoaded = true;

  var mascotVoice = localStorage.getItem('mascot_voice') || 'Nữ';
  var idleTimer = null;
  var JINGLE_INTERVAL = 5 * 60 * 1000;
  var speechQueue = Array.isArray(window._umbSpeechQ) ? window._umbSpeechQ : [];
  window._umbSpeechQ = speechQueue;
  var isSpeaking = false;

  function getVoiceConfig(voiceName){
    var pitch = 1.1;
    var rate = 0.8;
    if(voiceName === 'Nam'){ pitch = 0.8; rate = 0.8; }
    else if(voiceName === 'Nữ'){ pitch = 1.2; rate = 0.8; }
    else if(voiceName === 'Adam'){ pitch = 0.7; rate = 0.75; }
    else if(voiceName === 'Eva'){ pitch = 1.3; rate = 0.8; }
    else if(voiceName === 'Google'){ pitch = 1.0; rate = 0.8; }
    return { pitch: pitch, rate: rate };
  }

  function pickSystemVoice(voiceName){
    if(!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    if(voices.length === 0) return null;
    var vnVoices = voices.filter(function(v){ return v.lang && v.lang.includes('vi'); });
    if(voiceName === 'Google'){
      var gVoice = voices.find(function(v){ return v.name && v.name.includes('Google') && v.lang && v.lang.includes('vi'); });
      if(gVoice) return gVoice;
    }
    if(voiceName === 'Nam' || voiceName === 'Adam'){
      var maleVoice = vnVoices.find(function(v){ return v.name && (v.name.includes('Male') || v.name.includes('Nam') || v.name.includes('HoaiMy') || v.name.includes('An')); });
      if(maleVoice) return maleVoice;
    }
    if(voiceName === 'Nữ' || voiceName === 'Eva'){
      var femaleVoice = vnVoices.find(function(v){ return v.name && (v.name.includes('Female') || v.name.includes('Nu') || v.name.includes('Linh')); });
      if(femaleVoice) return femaleVoice;
    }
    return vnVoices[0] || voices[0] || null;
  }

  function cowSVG(){
    return '<svg width="56" height="56" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="60" cy="112" rx="30" ry="5" fill="rgba(190,24,93,0.15)"/>' +
      '<rect x="38" y="82" width="12" height="22" rx="6" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
      '<rect x="70" y="82" width="12" height="22" rx="6" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
      '<ellipse cx="60" cy="78" rx="30" ry="20" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
      '<ellipse cx="48" cy="76" rx="7" ry="5" fill="#334155"/>' +
      '<ellipse cx="72" cy="80" rx="6" ry="4" fill="#334155"/>' +
      '<circle cx="60" cy="80" r="9" fill="#fbbf24" stroke="#b45309" stroke-width="2.5"/>' +
      '<rect x="57.5" y="66" width="5" height="10" fill="#b45309"/>' +
      '<path d="M28 34C24 22 10 24 14 36C17 43 30 40 28 34Z" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
      '<path d="M92 34C96 22 110 24 106 36C103 43 90 40 92 34Z" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
      '<path d="M40 26C38 14 48 10 51 22" stroke="#f59e0b" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M80 26C82 14 72 10 69 22" stroke="#f59e0b" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="60" cy="52" rx="36" ry="32" fill="#ffffff" stroke="#334155" stroke-width="3.5"/>' +
      '<path d="M28 44C33 37 42 39 40 48C38 55 26 52 28 44Z" fill="#334155"/>' +
      '<path d="M84 38C91 40 89 51 82 49C77 47 79 36 84 38Z" fill="#334155"/>' +
      '<path d="M52 28C56 24 64 24 68 28C64 32 56 32 52 28Z" fill="#fda4af" stroke="#e11d48" stroke-width="2"/>' +
      '<circle cx="47" cy="48" r="6.5" fill="#0f172a"/>' +
      '<circle cx="73" cy="48" r="6.5" fill="#0f172a"/>' +
      '<circle cx="49" cy="46" r="2.2" fill="#ffffff"/>' +
      '<circle cx="75" cy="46" r="2.2" fill="#ffffff"/>' +
      '<rect x="42" y="50" width="10" height="6" rx="3" fill="rgba(244,114,182,0.6)"/>' +
      '<rect x="68" y="50" width="10" height="6" rx="3" fill="rgba(244,114,182,0.6)"/>' +
      '<ellipse cx="60" cy="70" rx="20" ry="13" fill="#fda4af" stroke="#e11d48" stroke-width="2.5"/>' +
      '<circle cx="53" cy="68" r="2.8" fill="#9f1239"/>' +
      '<circle cx="67" cy="68" r="2.8" fill="#9f1239"/>' +
      '<path id="umb-mascot-mouth" d="M54 74Q60 79 66 74" stroke="#9f1239" stroke-width="2.5" stroke-linecap="round" fill="none"/>' +
      '<g>' +
        '<rect x="46" y="86" width="28" height="13" rx="6.5" fill="#ec4899"/>' +
        '<text x="60" y="96" text-anchor="middle" font-size="9" font-weight="900" fill="#ffffff" font-family="Be Vietnam Pro,sans-serif">ỤM BÒ</text>' +
      '</g>' +
    '</svg>';
  }

  function renderMascotDOM(){
    if(document.getElementById('umb-mascot-container')) return;
    var container = document.createElement('div');
    container.id = 'umb-mascot-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;user-select:none;font-family:"Be Vietnam Pro",sans-serif;pointer-events:auto;';

    container.innerHTML =
      '<div id="umb-mascot-bubble" style="display:none;background:#ffffff;border:2px solid #ec4899;border-radius:16px;padding:8px 12px;margin-bottom:8px;max-width:260px;font-size:12px;font-weight:700;color:#831843;box-shadow:0 4px 18px rgba(236,72,153,0.25);position:relative;animation:umbMascotPop 0.25s ease;">' +
        '<span id="umb-mascot-text"></span>' +
        '<div style="position:absolute;bottom:-8px;right:24px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #ec4899;"></div>' +
      '</div>' +
      '<div id="umb-mascot-menu" style="display:none;background:#ffffff;border:2px solid #f43f5e;border-radius:16px;padding:10px;margin-bottom:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);width:190px;font-size:12px;animation:umbMascotPop 0.2s ease;">' +
        '<div style="font-weight:900;color:#be185d;margin-bottom:2px;text-align:center;">🐮 GIỌNG BÒ SỮA</div>' +
        '<div style="font-weight:500;color:#94a3b8;margin-bottom:6px;text-align:center;font-size:11px;">Nhấp đúp để mở • Chạm để chọn</div>' +
        '<div id="umb-mascot-options"></div>' +
      '</div>' +
      '<div id="umb-mascot-avatar" title="Nhấp đúp chọn giọng nói Bò Sữa (Nam/Nữ/Adam/Eva/Google)" style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#ffffff 0%,#fff0f8 60%,#fce7f3 100%);border:3px solid #ec4899;box-shadow:0 8px 24px rgba(236,72,153,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;animation:none;">' +
        cowSVG() +
      '</div>';

    document.body.appendChild(container);

    var style = document.createElement('style');
    style.textContent =
      '@keyframes umbMascotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
      '@keyframes umbMascotPop{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}' +
      '@keyframes umbMascotSing{0%,100%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.08) rotate(-5deg)}75%{transform:scale(1.08) rotate(5deg)}}' +
      '@keyframes umbMascotSpeak{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}' +
      '#umb-mascot-avatar:hover{box-shadow:0 10px 28px rgba(236,72,153,0.5);}';
    document.head.appendChild(style);

    renderVoiceOptions();

    var avatar = document.getElementById('umb-mascot-avatar');
    avatar.addEventListener('dblclick', function(e){
      e.stopPropagation();
      var menu = document.getElementById('umb-mascot-menu');
      if(menu) menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
    });

    avatar.addEventListener('click', function(){
      resetIdleTimer();
    });

    enableMascotDrag(container, avatar);

    document.addEventListener('click', function(e){
      var menu = document.getElementById('umb-mascot-menu');
      if(menu && !menu.contains(e.target) && e.target !== avatar && !avatar.contains(e.target)){
        menu.style.display = 'none';
      }
    });

    if('speechSynthesis' in window){
      try{ window.speechSynthesis.getVoices(); }catch(_){}
      window.speechSynthesis.onvoiceschanged = function(){ try{ window.speechSynthesis.getVoices(); }catch(_){} };
    }
    document.addEventListener('pointerdown', function unlockAudio(){
      try{
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if(AudioCtx){
          var ctx = new AudioCtx();
          if(ctx.state === 'suspended') ctx.resume();
          ctx.close();
        }
      }catch(_){}
      document.removeEventListener('pointerdown', unlockAudio);
    });

    resetIdleTimer();
  }

  function renderVoiceOptions(){
    var container = document.getElementById('umb-mascot-options');
    if(!container) return;
    var list = ['Nam', 'Nữ', 'Adam', 'Eva', 'Google'];
    var hint = { 'Nam': 'Trầm rõ', 'Nữ': 'Nhẹ rõ', 'Adam': 'Trầm chậm', 'Eva': 'Cao rõ', 'Google': 'Chuẩn' };
    var html = '';
    list.forEach(function(v){
      var active = (v === mascotVoice);
      html += '<div class="umb-mascot-voice-item" data-v="' + v + '" style="padding:6px 10px;margin:3px 0;border-radius:10px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:space-between;background:' + (active ? '#fdf2f8' : '#f8fafc') + ';color:' + (active ? '#be185d' : '#475569') + ';border:1px solid ' + (active ? '#fce7f3' : '#e2e8f0') + ';">' +
        '<span>' + v + ' <span style="font-weight:500;font-size:10px;color:#94a3b8;">• ' + hint[v] + '</span></span>' + (active ? '<span style="color:#ec4899;">✓</span>' : '<span style="color:#cbd5e1;">○</span>') +
      '</div>';
    });
    container.innerHTML = html;
    var items = container.querySelectorAll('.umb-mascot-voice-item');
    items.forEach(function(el){
      el.addEventListener('click', function(){
        var sel = this.getAttribute('data-v');
        mascotVoice = sel;
        try{ localStorage.setItem('mascot_voice', sel); }catch(_){}
        renderVoiceOptions();
        var menu = document.getElementById('umb-mascot-menu');
        if(menu) menu.style.display = 'none';
        speakText('Đã đổi giọng Bò Sữa sang ' + sel + ', đọc chậm rõ từng thông báo');
      });
    });
  }

  function resetIdleTimer(){
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function(){
      singJingle();
    }, JINGLE_INTERVAL);
  }

  function mascotDragAllowed(){
    if(window.__umbMascotDraggable === false) return false;
    if(window.__umbMascotDraggable === true) return true;
    try{ return /employee/i.test(window.location.pathname); }catch(_){ return false; }
  }

  function applySavedMascotPos(container){
    try{
      var raw = localStorage.getItem('mascot_pos');
      if(!raw) return;
      var p = JSON.parse(raw);
      if(typeof p.left !== 'number' || typeof p.top !== 'number') return;
      var maxLeft = Math.max(0, window.innerWidth - 90);
      var maxTop = Math.max(0, window.innerHeight - 100);
      var left = Math.min(Math.max(0, p.left), maxLeft);
      var top = Math.min(Math.max(0, p.top), maxTop);
      container.style.left = left + 'px';
      container.style.top = top + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }catch(_){}
  }

  function enableMascotDrag(container, avatar){
    applySavedMascotPos(container);
    if(!mascotDragAllowed()) return;
    var dragging = false;
    var moved = false;
    var startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
    try{ avatar.style.touchAction = 'none'; }catch(_){}

    avatar.addEventListener('pointerdown', function(e){
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      var r = container.getBoundingClientRect();
      baseLeft = r.left;
      baseTop = r.top;
      try{ avatar.setPointerCapture(e.pointerId); }catch(_){}
    });

    avatar.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if(Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if(!moved) return;
      var maxLeft = Math.max(0, window.innerWidth - 90);
      var maxTop = Math.max(0, window.innerHeight - 100);
      var left = Math.min(Math.max(0, baseLeft + dx), maxLeft);
      var top = Math.min(Math.max(0, baseTop + dy), maxTop);
      container.style.left = left + 'px';
      container.style.top = top + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });

    var endDrag = function(e){
      if(!dragging) return;
      dragging = false;
      if(!moved) return;
      try{
        var r = container.getBoundingClientRect();
        localStorage.setItem('mascot_pos', JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
      }catch(_){}
      resetIdleTimer();
    };
    avatar.addEventListener('pointerup', endDrag);
    avatar.addEventListener('pointercancel', endDrag);

    avatar.addEventListener('click', function(e){
      if(moved){
        moved = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }

  function showBubble(text, ms){
    var bubble = document.getElementById('umb-mascot-bubble');
    var txt = document.getElementById('umb-mascot-text');
    if(!bubble || !txt) return;
    txt.textContent = text;
    bubble.style.display = 'block';
    if(ms){
      setTimeout(function(){
        if(txt.textContent === text){
          bubble.style.display = 'none';
        }
      }, ms);
    }
  }

  function setAvatarAnim(name){
    var avatar = document.getElementById('umb-mascot-avatar');
    if(avatar) avatar.style.animation = name || 'none';
  }

  function playJingleMelody(done){
    try{
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx){ if(done) done(); return; }
      var ctx = new AudioCtx();
      var notes = [523.25, 587.33, 659.25, 783.99, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33, 523.25, 0, 523.25, 659.25, 783.99, 1046.50];
      var step = 0.32;
      var t0 = ctx.currentTime + 0.05;
      notes.forEach(function(freq, i){
        if(!freq) return;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0 + i * step);
        gain.gain.setValueAtTime(0.0001, t0 + i * step);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + i * step + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * step + step);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0 + i * step);
        osc.stop(t0 + i * step + step + 0.05);
      });
      var total = notes.length * step * 1000 + 400;
      setTimeout(function(){ try{ ctx.close(); }catch(_){} if(done) done(); }, total);
    }catch(_){ if(done) done(); }
  }

  function playWebAudioFallback(text){
    showBubble(text, 6000);
  }

  function speakText(text){
    resetIdleTimer();
    if(!text) return;
    var clean = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
    if(!clean) return;

    speechQueue.push(clean);
    processQueue();
  }

  function processQueue(){
    if(isSpeaking || speechQueue.length === 0) return;
    isSpeaking = true;
    var text = speechQueue.shift();
    if(typeof text === 'object' && text.clean) text = text.clean;

    showBubble(text, 9000);
    setAvatarAnim('umbMascotSpeak 0.9s ease-in-out infinite');

    if(!('speechSynthesis' in window)){
      playWebAudioFallback(text);
      setAvatarAnim('none');
      isSpeaking = false;
      setTimeout(processQueue, 300);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      var cfg = getVoiceConfig(mascotVoice);
      u.pitch = cfg.pitch;
      u.rate = cfg.rate;
      u.volume = 1.0;

      var sysVoice = pickSystemVoice(mascotVoice);
      if(sysVoice) u.voice = sysVoice;

      var settled = false;
      var onEndOrErr = function(){
        if(settled) return;
        settled = true;
        isSpeaking = false;
        setAvatarAnim('none');
        var bubble = document.getElementById('umb-mascot-bubble');
        if(bubble && speechQueue.length === 0) bubble.style.display = 'none';
        setTimeout(processQueue, 400);
      };

      u.onend = onEndOrErr;
      u.onerror = onEndOrErr;
      setTimeout(function(){
        if(!settled && !window.speechSynthesis.speaking){
          onEndOrErr();
        }
      }, 15000);

      window.speechSynthesis.speak(u);
    } catch(e){
      isSpeaking = false;
      setAvatarAnim('none');
      setTimeout(processQueue, 300);
    }
  }

  function singJingle(){
    setAvatarAnim('umbMascotSing 1s ease-in-out infinite');
    showBubble('🎵 Bò Sữa hát tặng bạn một khúc nhạc vui! Ụm Bò Milk tươi ngon mỗi ngày!', 12000);
    playJingleMelody(function(){
      setAvatarAnim('none');
      resetIdleTimer();
    });
  }

  window.speakUmb = function(text){
    window._ttsEnabled = true;
    speakText(text);
  };

  window.speakMascotNotification = function(text){
    speakText(text);
  };

  window.triggerMascotJingle = function(){
    singJingle();
  };

  window._umbMascotVoice = function(){
    return mascotVoice;
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', renderMascotDOM);
  } else {
    renderMascotDOM();
  }
})();
