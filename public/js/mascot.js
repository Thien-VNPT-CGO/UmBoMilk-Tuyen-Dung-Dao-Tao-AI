(function(){
  if(window.__umbMascotLoaded) return;
  window.__umbMascotLoaded = true;

  var mascotVoice = localStorage.getItem('mascot_voice') || 'Nữ';
  var idleTimer = null;
  var JINGLE_INTERVAL = 15 * 60 * 1000;
  var speechQueue = Array.isArray(window._umbSpeechQ) ? window._umbSpeechQ : [];
  window._umbSpeechQ = speechQueue;
  var isSpeaking = false;

  function getVoiceConfig(voiceName){
    var pitch = 1.15;
    var rate = 0.85;
    if(voiceName === 'Nam'){ pitch = 0.8; rate = 0.85; }
    else if(voiceName === 'Nữ'){ pitch = 1.2; rate = 0.85; }
    else if(voiceName === 'Adam'){ pitch = 0.7; rate = 0.8; }
    else if(voiceName === 'Eva'){ pitch = 1.3; rate = 0.9; }
    else if(voiceName === 'Google'){ pitch = 1.0; rate = 0.85; }
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
      '<div id="umb-mascot-menu" style="display:none;background:#ffffff;border:2px solid #f43f5e;border-radius:16px;padding:10px;margin-bottom:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);width:180px;font-size:12px;animation:umbMascotPop 0.2s ease;">' +
        '<div style="font-weight:900;color:#be185d;margin-bottom:6px;text-align:center;">🐮 GIỌNG BÒ SỮA</div>' +
        '<div id="umb-mascot-options"></div>' +
      '</div>' +
      '<div id="umb-mascot-avatar" title="Nhấp đúp chọn giọng nói Bò Sữa" style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,#fff0f8,#fce7f3);border:3px solid #ec4899;box-shadow:0 6px 20px rgba(236,72,153,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 0.2s;animation:umbMascotFloat 3s ease-in-out infinite;">' +
        '<svg width="52" height="52" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M25 28C22 18 10 22 15 32C18 38 27 34 25 28Z" fill="#be185d"/>' +
          '<path d="M75 28C78 18 90 22 85 32C82 38 73 34 75 28Z" fill="#be185d"/>' +
          '<path d="M35 22C33 12 42 10 44 20C44 22 36 24 35 22Z" fill="#f59e0b"/>' +
          '<path d="M65 22C67 12 58 10 56 20C56 22 64 24 65 22Z" fill="#f59e0b"/>' +
          '<ellipse cx="50" cy="48" rx="34" ry="30" fill="#ffffff" stroke="#334155" stroke-width="3"/>' +
          '<path d="M22 42C26 36 34 38 32 46C30 52 20 48 22 42Z" fill="#334155"/>' +
          '<path d="M72 40C78 42 76 52 70 50C66 48 68 38 72 40Z" fill="#334155"/>' +
          '<circle cx="38" cy="42" r="4" fill="#0f172a"/>' +
          '<circle cx="62" cy="42" r="4" fill="#0f172a"/>' +
          '<circle cx="40" cy="40" r="1.5" fill="#ffffff"/>' +
          '<circle cx="64" cy="40" r="1.5" fill="#ffffff"/>' +
          '<ellipse cx="50" cy="62" rx="22" ry="14" fill="#fda4af" stroke="#e11d48" stroke-width="2"/>' +
          '<circle cx="43" cy="60" r="2.5" fill="#9f1239"/>' +
          '<circle cx="57" cy="60" r="2.5" fill="#9f1239"/>' +
          '<path d="M46 66Q50 70 54 66" stroke="#9f1239" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M50 76L46 84H54L50 76Z" fill="#f43f5e"/>' +
        '</svg>' +
      '</div>';

    document.body.appendChild(container);

    var style = document.createElement('style');
    style.textContent = 
      '@keyframes umbMascotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
      '@keyframes umbMascotPop{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}' +
      '@keyframes umbMascotSing{0%,100%{transform:scale(1) rotate(0deg)}25%{transform:scale(1.1) rotate(-6deg)}75%{transform:scale(1.1) rotate(6deg)}}';
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

    document.addEventListener('click', function(e){
      var menu = document.getElementById('umb-mascot-menu');
      if(menu && !menu.contains(e.target) && e.target !== avatar){
        menu.style.display = 'none';
      }
    });

    resetIdleTimer();
  }

  function renderVoiceOptions(){
    var container = document.getElementById('umb-mascot-options');
    if(!container) return;
    var list = ['Nam', 'Nữ', 'Adam', 'Eva', 'Google'];
    var html = '';
    list.forEach(function(v){
      var active = (v === mascotVoice);
      html += '<div class="umb-mascot-voice-item" data-v="' + v + '" style="padding:6px 10px;margin:3px 0;border-radius:10px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:space-between;background:' + (active ? '#fdf2f8' : '#f8fafc') + ';color:' + (active ? '#be185d' : '#475569') + ';border:1px solid ' + (active ? '#fce7f3' : '#e2e8f0') + ';">' +
        '<span>' + v + '</span>' + (active ? '<span style="color:#ec4899;">✓</span>' : '') +
      '</div>';
    });
    container.innerHTML = html;
    var items = container.querySelectorAll('.umb-mascot-voice-item');
    items.forEach(function(el){
      el.addEventListener('click', function(){
        var sel = this.getAttribute('data-v');
        mascotVoice = sel;
        localStorage.setItem('mascot_voice', sel);
        renderVoiceOptions();
        var menu = document.getElementById('umb-mascot-menu');
        if(menu) menu.style.display = 'none';
        speakText('Đã đổi giọng Bò Sữa sang ' + sel);
      });
    });
  }

  function resetIdleTimer(){
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function(){
      singJingle();
    }, JINGLE_INTERVAL);
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

  function playWebAudioFallback(text){
    showBubble(text, 6000);
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return;
      var ctx = new AudioCtx();
      var now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach(function(freq, i){
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.08, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.25);
      });
    } catch(e){}
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

    showBubble(text, 8000);
    var avatar = document.getElementById('umb-mascot-avatar');
    if(avatar) avatar.style.animation = 'umbMascotSing 0.8s ease-in-out infinite';

    if(!('speechSynthesis' in window)){
      playWebAudioFallback(text);
      if(avatar) avatar.style.animation = 'umbMascotFloat 3s ease-in-out infinite';
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

      var onEndOrErr = function(){
        isSpeaking = false;
        if(avatar) avatar.style.animation = 'umbMascotFloat 3s ease-in-out infinite';
        var bubble = document.getElementById('umb-mascot-bubble');
        if(bubble) bubble.style.display = 'none';
        setTimeout(processQueue, 250);
      };

      u.onend = onEndOrErr;
      u.onerror = onEndOrErr;

      window.speechSynthesis.speak(u);
    } catch(e){
      isSpeaking = false;
      if(avatar) avatar.style.animation = 'umbMascotFloat 3s ease-in-out infinite';
      setTimeout(processQueue, 250);
    }
  }

  function singJingle(){
    var avatar = document.getElementById('umb-mascot-avatar');
    if(avatar) avatar.style.animation = 'umbMascotSing 1s ease-in-out infinite';
    var lyrics = "Ụm Bò Milk tươi ngon mỗi ngày! Trà sữa thơm lừng ngất ngây. Chúc bạn một ngày làm việc tràn đầy năng lượng và hiệu quả cùng Ụm Bò Milk!";
    speakText(lyrics);
    setTimeout(function(){
      if(avatar) avatar.style.animation = 'umbMascotFloat 3s ease-in-out infinite';
      resetIdleTimer();
    }, 20000);
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
