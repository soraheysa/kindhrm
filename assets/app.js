(() => {
  'use strict';

  const CONF = window.KINDHRM_CONFIG || {};
  const DEMO = !CONF.API_URL;
  const LS_KEY = 'kindhrm26_last_code';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const state = { event: null, person: null, checkin: null, canChange: false, phase: 'open', pick: null, changePick: null };

  /* ------------------------------------------------------------------ API */
  async function request(params, body) {
    if (DEMO) return Demo.handle(params, body);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      let res;
      if (body) {
        res = await fetch(CONF.API_URL, {
          method: 'POST', body: JSON.stringify(body), signal: ctrl.signal, redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
        });
      } else {
        const u = new URL(CONF.API_URL);
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
        u.searchParams.set('_', Date.now());
        res = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'follow' });
      }
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }
  const api = {
    event: () => request({ action: 'event' }),
    lookup: id => request({ action: 'lookup', id }),
    ack: id => request({ action: 'ack', id }),
    checkin: (id, meal) => request(null, { action: 'checkin', id, meal }),
  };

  /* -------------------------------------------------------------- helpers */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // hide unfilled "[Cập nhật ...]" placeholders from guests
  const clean = v => (typeof v === 'string' && /^\[.*\]$/.test(v.trim()) ? '' : (v || ''));
  const fill = (s, p) => clean(s).replace(/\{\{\s*xung_ho\s*\}\}/g, (p && p.xungHo) || 'Anh/Chị')
    .replace(/\{\{\s*ho_ten\s*\}\}/g, (p && p.name) || '').replace(/\{\{\s*ten\s*\}\}/g, (p && p.first) || '')
    .replace(/\{\{\s*ma_checkin\s*\}\}/g, (p && p.id) || '');

  const ICON = {
    date: '<svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    time: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4.3l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 20 20"><path d="M10 17.5s5.5-5 5.5-9.3A5.5 5.5 0 0010 2.7a5.5 5.5 0 00-5.5 5.5c0 4.3 5.5 9.3 5.5 9.3z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="8.2" r="2" fill="currentColor"/></svg>',
  };
  const MEAL_ICO = { meal_1: '🍗', meal_2: '🍔', none: '🙅' };

  function show(view) {
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    document.body.classList.toggle('on-pass', view === 'pass');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function loading(on) { $('#loader').hidden = !on; }
  function btnBusy(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }
  function setError(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function remember(code) { try { localStorage.setItem(LS_KEY, code); } catch (e) { /* storage unavailable */ } }
  function recall() { try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; } }

  function hotlineText() {
    const h = state.event && clean(state.event.hotline);
    return h ? ` (${h})` : '';
  }
  function errorText(code) {
    const ev = state.event || {};
    switch (code) {
      case 'not_found': return 'Không tìm thấy mã này. Vui lòng kiểm tra lại mã trong email xác nhận (phân biệt chữ hoa, chữ thường).';
      case 'not_open': return `Check-in sẽ mở lúc ${ev.checkinOpenText || 'ngày diễn ra sự kiện'}.`;
      case 'closed': return 'Cổng check-in đã đóng. Vui lòng liên hệ Ban tổ chức' + hotlineText() + '.';
      case 'sold_out': return 'Rất tiếc, món này vừa hết suất. Vui lòng chọn món khác.';
      case 'deadline_passed': return `Đã quá hạn đổi món (${ev.mealDeadlineText || ''}).`;
      case 'bad_meal': return 'Vui lòng chọn một suất ăn.';
      case 'network': return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
      default: return 'Đã có lỗi xảy ra. Vui lòng thử lại sau giây lát.';
    }
  }

  /* -------------------------------------------------------- event header */
  function renderEvent(ev) {
    if (!ev) return;
    state.event = ev;
    $$('[data-ev]').forEach(el => {
      const v = clean(ev[el.dataset.ev]);
      el.textContent = v;
      if (el.classList.contains('eyebrow') || el.classList.contains('theme') || el.classList.contains('muted')) el.hidden = !v;
    });
    if (clean(ev.name)) document.title = `Check-in · ${clean(ev.name)}`;

    const chips = [];
    if (clean(ev.date)) chips.push(`<li>${ICON.date}${esc(clean(ev.date))}</li>`);
    if (clean(ev.time)) chips.push(`<li>${ICON.time}${esc(clean(ev.time))}</li>`);
    const venue = clean(ev.venueName);
    if (venue) {
      const v = esc(venue);
      chips.push(`<li>${ICON.pin}${clean(ev.mapUrl) ? `<a href="${esc(ev.mapUrl)}" target="_blank" rel="noopener">${v}</a>` : v}</li>`);
    }
    $('#event-chips').innerHTML = chips.join('');

    const hl = clean(ev.hotline);
    $('#foot-hotline').textContent = hl ? `Hỗ trợ: ${hl}` : '';

    const note = $('#phase-note');
    if (ev.phase === 'before') note.textContent = `Check-in mở lúc ${ev.checkinOpenText}. Anh/Chị vẫn có thể nhập mã để kiểm tra thông tin.`;
    else if (ev.phase === 'closed') note.textContent = 'Cổng check-in đã đóng. Anh/Chị đã check-in vẫn xem lại được thẻ.';
    else note.textContent = 'Nhập mã check-in để xác nhận tham dự và chọn suất ăn trưa.';

    // program details
    const speakers = (ev.speakers || []).map(clean).filter(Boolean);
    const agenda = (ev.agenda || []).filter(a => clean(a.item));
    const parts = [];
    if (clean(ev.checkinTime)) parts.push(`<h4>Giờ đón khách</h4><ul><li>${esc(clean(ev.checkinTime))}</li></ul>`);
    if (speakers.length) parts.push(`<h4>Diễn giả</h4><ul>${speakers.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`);
    if (agenda.length) parts.push(`<h4>Chương trình</h4><ul>${agenda.map(a => `<li><span class="t">${esc(a.time)}</span><span>${esc(a.item)}</span></li>`).join('')}</ul>`);
    if (clean(ev.venueAddress)) parts.push(`<h4>Địa điểm</h4><ul><li>${esc([clean(ev.venueName), clean(ev.venueAddress)].filter(Boolean).join(', '))}</li></ul>`);
    $('#program-body').innerHTML = parts.join('');
    $('#program').hidden = !parts.length;
  }

  /* --------------------------------------------------------------- meals */
  function mealOptions(ev, currentId) {
    const opts = ev.meals.map(m => {
      const mine = currentId === m.id;
      const left = m.remaining;
      const out = left <= 0 && !mine;
      let sub, cls = '';
      if (out) { sub = 'Hết suất'; cls = 'out'; }
      else if (mine) sub = 'Món hiện tại của Anh/Chị';
      else if (left <= 10) { sub = `Sắp hết · còn ${left} suất`; cls = 'low'; }
      else sub = `Còn ${left} suất`;
      return { id: m.id, name: m.name, sub, cls, disabled: out, mine };
    });
    opts.push({ id: 'none', name: ev.noneLabel || 'Tôi không dùng bữa trưa', sub: 'Nhường suất cho khách khác', cls: '', disabled: false, mine: currentId === 'none' });
    return opts;
  }

  function renderMeals(container, currentId, selected, onPick) {
    const opts = mealOptions(state.event, currentId);
    container.innerHTML = opts.map(o => `
      <button type="button" class="meal" role="radio" data-id="${o.id}" aria-checked="${o.id === selected}" ${o.disabled ? 'disabled' : ''}>
        ${o.mine ? '<span class="tag">ĐANG CHỌN</span>' : ''}
        <span class="meal-ico ${o.id === 'none' ? 'none' : ''}" aria-hidden="true">${MEAL_ICO[o.id] || '🍽️'}</span>
        <span class="meal-main"><span class="meal-name">${esc(o.name)}</span><span class="meal-sub ${o.cls}">${esc(o.sub)}</span></span>
        <span class="radio" aria-hidden="true"></span>
      </button>`).join('');
    $$('.meal', container).forEach(b => b.addEventListener('click', () => {
      $$('.meal', container).forEach(x => x.setAttribute('aria-checked', String(x === b)));
      onPick(b.dataset.id);
    }));
  }

  /* -------------------------------------------------------------- lookup */
  async function lookup(code) {
    const id = code.replace(/\s+/g, '');
    const err = $('#lookup-error');
    setError(err, '');
    if (!id) { setError(err, 'Vui lòng nhập mã check-in.'); $('#code-input').focus(); return; }
    const btn = $('#lookup-btn');
    btnBusy(btn, true);
    const r = await api.lookup(id);
    btnBusy(btn, false);
    if (r.event) renderEvent(r.event);
    if (!r.ok) {
      if (r.error === 'not_qualified') return showMessage('🗂️', 'Mã chưa được xác nhận tham dự',
        `Đăng ký của Anh/Chị chưa nằm trong danh sách tham dự đã xác nhận. Vui lòng liên hệ Ban tổ chức${hotlineText()} để được hỗ trợ.`);
      setError(err, errorText(r.error));
      return;
    }
    state.person = r.person;
    state.checkin = r.checkin;
    state.canChange = r.canChangeMeal;
    state.phase = r.phase;
    remember(r.person.id);
    if (r.checkin) showPass(false);
    else showConfirm();
  }

  function showConfirm() {
    const p = state.person;
    state.pick = null;
    $('#c-greet').textContent = `${p.xungHo} ${p.first || p.name}`;
    const rows = [
      ['Họ tên', p.name], ['Đơn vị', p.company], ['Chức danh', p.title],
      ['Điện thoại', p.phoneMasked], ['Email', p.emailMasked], ['Mã check-in', p.id, 'mono'],
    ].filter(r => r[1]);
    $('#c-info').innerHTML = rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c || ''}">${esc(v)}</dd>`).join('');

    const open = state.phase === 'open';
    $('#meal-card').hidden = !open;
    const nc = $('#not-open-card');
    nc.hidden = open;
    if (!open) {
      nc.innerHTML = state.phase === 'before'
        ? `<h3>Check-in chưa mở</h3><p>${esc(errorText('not_open'))} Khi đến sự kiện, Anh/Chị nhập lại mã để check-in và chọn suất ăn trưa.</p>`
        : `<h3>Cổng check-in đã đóng</h3><p>${esc(errorText('closed'))}</p>`;
    }
    setError($('#confirm-error'), '');
    $('#confirm-btn').disabled = true;
    renderMeals($('#meal-list'), null, null, id => { state.pick = id; $('#confirm-btn').disabled = false; });
    show('confirm');
  }

  async function confirmCheckin() {
    if (!state.pick) return;
    const btn = $('#confirm-btn');
    btnBusy(btn, true);
    const r = await api.checkin(state.person.id, state.pick);
    btnBusy(btn, false);
    if (r.event) renderEvent(r.event);
    if (!r.ok) {
      setError($('#confirm-error'), errorText(r.error));
      if (r.event) { state.pick = null; btn.disabled = true; renderMeals($('#meal-list'), null, null, id => { state.pick = id; btn.disabled = false; }); }
      return;
    }
    state.checkin = r.checkin;
    state.canChange = r.canChangeMeal;
    showPass(true);
  }

  /* ---------------------------------------------------------------- pass */
  function showPass(fresh) {
    const p = state.person, c = state.checkin, ev = state.event || {};
    $('#pass-name').textContent = p.name;
    $('#pass-org').textContent = [p.title, p.company].filter(Boolean).join(' · ');
    $('#pass-code').textContent = p.id;
    $('#pass-meal').textContent = c.mealName;
    $('#pass-time').textContent = c.atText || '';
    const vName = clean(ev.venueName), vAddr = clean(ev.venueAddress);
    $('#pass-venue').innerHTML = vName || vAddr
      ? `<b>${esc(vName)}</b>${esc(vAddr)}${clean(ev.mapUrl) ? ` · <a href="${esc(ev.mapUrl)}" target="_blank" rel="noopener">Chỉ đường</a>` : ''}`
      : '';
    const gift = fill(ev.giftReminder, p);
    $('#pass-gift').innerHTML = gift ? `<span class="ico" aria-hidden="true">🎁</span><span><b>Đừng về sớm nhé!</b>${esc(gift)}</span>` : '';

    $('#change-panel').hidden = true;
    $('#change-btn').hidden = !state.canChange;
    $('#change-note').textContent = state.canChange
      ? `Anh/Chị có thể đổi món trước ${ev.mealDeadlineText || 'hạn chót'} nếu món đó vẫn còn suất.`
      : 'Đã hết thời gian đổi món. Lựa chọn của Anh/Chị đã được ghi nhận.';

    const pass = $('#pass');
    pass.style.animation = 'none'; void pass.offsetWidth; pass.style.animation = '';
    show('pass');
    if (fresh) toast('Check-in thành công!');
  }

  function openChange() {
    state.changePick = null;
    $('#change-save').disabled = true;
    setError($('#change-error'), '');
    renderMeals($('#change-list'), state.checkin.mealId, state.checkin.mealId, id => {
      state.changePick = id;
      $('#change-save').disabled = id === state.checkin.mealId;
    });
    $('#change-btn').hidden = true;
    $('#change-panel').hidden = false;
  }

  async function saveChange() {
    if (!state.changePick) return;
    const btn = $('#change-save');
    btnBusy(btn, true);
    const r = await api.checkin(state.person.id, state.changePick);
    btnBusy(btn, false);
    if (r.event) renderEvent(r.event);
    if (!r.ok) {
      setError($('#change-error'), errorText(r.error));
      if (r.error === 'deadline_passed') { state.canChange = false; setTimeout(() => showPass(false), 1800); }
      else if (r.event) openChange();
      return;
    }
    state.checkin = r.checkin;
    state.canChange = r.canChangeMeal;
    showPass(false);
    toast('Đã đổi món: ' + r.checkin.mealName);
  }

  async function copyCode() {
    const code = state.person && state.person.id;
    if (!code) return;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = code; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    const b = $('#copy-btn');
    if (ok) {
      b.classList.add('done'); $('span', b).textContent = 'Đã chép';
      setTimeout(() => { b.classList.remove('done'); $('span', b).textContent = 'Sao chép'; }, 1600);
    } else toast('Nhấn giữ vào mã để sao chép');
  }

  /* ----------------------------------------------------------------- ack */
  async function ackFlow(id) {
    show('ack');
    const card = $('#ack-card');
    card.innerHTML = '<div class="big-ico">⏳</div><h2>Đang ghi nhận…</h2>';
    const r = await api.ack(id);
    if (r.event) renderEvent(r.event);
    if (!r.ok) {
      card.innerHTML = `<div class="big-ico">⚠️</div><h2>Chưa ghi nhận được</h2><p>${esc(errorText(r.error))}</p>
        <button class="btn btn-primary" data-action="home"><span>Đến trang check-in</span></button>`;
      return;
    }
    const p = r.person;
    remember(p.id);
    const ev = state.event || {};
    const when = [clean(ev.date), clean(ev.time)].filter(Boolean).join(' · ');
    card.innerHTML = `<div class="big-ico">💌</div>
      <h2>Cảm ơn ${esc(p.xungHo)} ${esc(p.first || p.name)}!</h2>
      <p>${r.already ? 'Ban tổ chức đã ghi nhận xác nhận của' : 'Ban tổ chức đã ghi nhận'} ${esc(p.xungHo)} đã nhận được email. Hẹn gặp ${esc(p.xungHo)} tại sự kiện${when ? ' vào ' + esc(when) : ''}.</p>
      <p style="margin-top:12px;color:var(--muted);font-size:13.5px">Khi đến nơi, mở lại email hoặc trang này và nhập mã <b style="font-family:var(--mono)">${esc(p.id)}</b> để check-in.</p>
      <button class="btn btn-primary" data-action="home"><span>Đến trang check-in</span></button>`;
  }

  function showMessage(ico, title, body) {
    $('#msg-card').innerHTML = `<div class="big-ico">${ico}</div><h2>${esc(title)}</h2><p>${esc(body)}</p>
      <button class="btn btn-primary" data-action="home"><span>Nhập mã khác</span></button>`;
    show('msg');
  }

  function goHome() {
    const last = recall();
    const lp = $('#last-pass');
    lp.hidden = !last;
    if (last) lp.textContent = `Xem lại thẻ check-in của mã ${last}`;
    $('#code-input').value = '';
    setError($('#lookup-error'), '');
    show('home');
    try { if (location.search) history.replaceState(null, '', location.pathname); } catch (e) { /* sandboxed */ }
  }

  /* ---------------------------------------------------------------- init */
  async function init() {
    if (DEMO) $('#demo-banner').hidden = false;
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action="home"]');
      if (a) { e.preventDefault(); goHome(); }
    });
    $('#lookup-form').addEventListener('submit', e => { e.preventDefault(); lookup($('#code-input').value); });
    $('#confirm-btn').addEventListener('click', confirmCheckin);
    $('#copy-btn').addEventListener('click', copyCode);
    $('#change-btn').addEventListener('click', openChange);
    $('#change-cancel').addEventListener('click', () => showPass(false));
    $('#change-save').addEventListener('click', saveChange);
    $('#last-pass').addEventListener('click', () => { $('#code-input').value = recall(); lookup(recall()); });

    const q = new URLSearchParams(location.search);
    const ack = q.get('ack'), code = q.get('code');
    if (ack) { ackFlow(ack); return; }

    goHome();
    if (code) {
      $('#code-input').value = code;
      loading(true);
      await api.event().then(r => r.ok && renderEvent(r.event));
      loading(false);
      lookup(code);
    } else {
      const r = await api.event();
      if (r.ok) renderEvent(r.event);
    }
  }

  /* ---------------------------------------------------------------- demo */
  const Demo = (() => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ev = {
      name: 'Trao gửi tri thức nghề nhân sự', season: 'KindHRM 2026', theme: 'Chủ đề sẽ được cập nhật',
      date: 'Thứ Bảy, 28/11/2026', time: '08:00 - 16:30', checkinTime: '07:30 - 08:00',
      venueName: 'Hội trường mẫu', venueAddress: '123 Đường Mẫu, Quận 1, TP.HCM', mapUrl: 'https://maps.google.com',
      speakers: ['Diễn giả sẽ được cập nhật'], agenda: [{ time: '07:30', item: 'Đón khách, check-in' }, { time: '08:30', item: 'Khai mạc' }, { time: '11:30', item: 'Ăn trưa' }, { time: '16:00', item: 'Bế mạc, nhận quà check-out' }],
      hotline: '0900 000 000', organizer: 'KindHRM - Nghề nhân sự tử tế', lunchNote: 'Mỗi suất ăn kèm 1 ly nước ngọt.',
      giftReminder: 'Ban tổ chức có quà check-out dành tặng {{xung_ho}} khi chương trình kết thúc. Hãy ở lại đến cuối chương trình để nhận quà nhé!',
      meals: [{ id: 'meal_1', name: 'Cơm Gà rán', quota: 100, taken: 63 }, { id: 'meal_2', name: 'Burger Tôm', quota: 50, taken: 47 }],
      noneLabel: 'Tôi không dùng bữa trưa', checkinOpenText: '06:00, 28/11/2026', mealDeadlineText: '11:00, 28/11/2026', phase: 'open',
    };
    const people = {
      DEMO001: { id: 'DEMO001', name: 'Nguyễn Thị Minh An', first: 'An', xungHo: 'Chị', company: 'Công ty TNHH Mẫu', title: 'HR Manager', phoneMasked: '0909•••123', emailMasked: 'mi•••@gmail.com', q: true },
      DEMO002: { id: 'DEMO002', name: 'Trần Văn Bình', first: 'Bình', xungHo: 'Anh/Chị', company: 'Công ty Mẫu 2', title: 'HRBP', phoneMasked: '0912•••456', emailMasked: 'bi•••@gmail.com', q: false },
    };
    const checkins = {};
    const names = { meal_1: 'Cơm Gà rán', meal_2: 'Burger Tôm', none: 'Tôi không dùng bữa trưa' };
    const pub = () => ({ ...ev, meals: ev.meals.map(m => ({ ...m, remaining: Math.max(0, m.quota - m.taken) })) });
    const find = id => people[String(id).trim()] || Object.values(people).find(p => p.id.toLowerCase() === String(id).trim().toLowerCase());
    const now = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
    async function handle(params, body) {
      await wait(450);
      const a = body ? body.action : params.action;
      const id = body ? body.id : params.id;
      if (a === 'event') return { ok: true, event: pub() };
      const p = find(id);
      if (!p) return { ok: false, error: 'not_found', event: pub() };
      if (a === 'ack') return { ok: true, already: false, person: p, event: pub() };
      if (!p.q) return { ok: false, error: 'not_qualified', event: pub() };
      if (a === 'lookup') return { ok: true, person: p, checkin: checkins[p.id] || null, phase: 'open', canChangeMeal: true, event: pub() };
      if (a === 'checkin') {
        const cur = checkins[p.id];
        const meal = body.meal;
        const m = ev.meals.find(x => x.id === meal);
        if (cur && cur.mealId === meal) return { ok: true, person: p, checkin: cur, canChangeMeal: true, event: pub() };
        if (m && m.taken >= m.quota) return { ok: false, error: 'sold_out', event: pub() };
        if (cur) { const old = ev.meals.find(x => x.id === cur.mealId); if (old) old.taken--; }
        if (m) m.taken++;
        checkins[p.id] = { mealId: meal, mealName: names[meal], atText: cur ? cur.atText : now(), changes: cur ? cur.changes + 1 : 0 };
        return { ok: true, person: p, checkin: checkins[p.id], canChangeMeal: true, event: pub() };
      }
      return { ok: false, error: 'bad_request' };
    }
    return { handle };
  })();

  init();
})();
