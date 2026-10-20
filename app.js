import { MockAPI } from './mock.js';

const MOCK = new MockAPI();
let TOKEN = localStorage.getItem('token') || '';
let ME = null;

async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  let body = null;
  if (opts.body) { try { body = JSON.parse(opts.body); } catch { body = null; } }
  const res = await MOCK.handle(method, path, body, TOKEN);
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  if (res.status >= 400) throw new Error(res.body?.error || 'HTTP ' + res.status);
  return res.body;
}

const state = {
  route: location.hash.slice(1) || '/',
  scheduleClassId: null,
  chatId: null,
  chats: [],
  messages: [],
  wsListeners: [],
  chatCleanup: [],
};

function onWS(fn) {
  state.wsListeners.push(fn);
  return () => { state.wsListeners = state.wsListeners.filter(f => f !== fn); };
}

function connectWS() {
  MOCK.setListener((event, data) => state.wsListeners.forEach(fn => fn(event, data)));
}

function nav(path) { location.hash = path; }
window.addEventListener('hashchange', () => {
  state.wsListeners = [];
  state.chatCleanup.forEach(f => f());
  state.chatCleanup = [];
  state._chatHandler = null;
  state.route = location.hash.slice(1) || '/';
  render();
});

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el[k.toLowerCase()] = v;
    else if (k === 'class') el.className = v;
    else if (k === 'value') {
      if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = v;
      else el.setAttribute('value', v);
    } else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return el;
}
const $ = s => document.querySelector(s);

function logout() {
  TOKEN = ''; localStorage.removeItem('token'); ME = null;
  location.reload();
}

function showModal(content) {
  const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) bg.remove(); } });
  const m = h('div', { class: 'modal' }, content);
  bg.append(m);
  document.body.append(bg);
  return { bg, close: () => bg.remove() };
}

function toast(msg) {
  const t = h('div', { style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#3b82f6;color:#fff;padding:10px 20px;border-radius:8px;z-index:999' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

const DEMO_ACCOUNTS = [
  { login: 'admin',    password: 'admin',  label: 'Администратор' },
  { login: 'teacher1', password: '123456', label: 'Учитель (матем.) — Иванова' },
  { login: 'teacher2', password: '123456', label: 'Учитель (рус.) — Петров' },
  { login: 'student1', password: '123456', label: 'Ученик 7А — Александров' },
  { login: 'parent1',  password: '123456', label: 'Родитель ученика' },
];

function renderLogin() {
  const app = $('#app');
  app.innerHTML = '';
  const err = h('div', { class: 'err' });
  const login = h('input', { placeholder: 'Логин', autofocus: 'true' });
  const pass = h('input', { type: 'password', placeholder: 'Пароль' });
  const btn = h('button', {}, 'Войти');

  const demoSelect = h('select');
  demoSelect.append(h('option', { value: '' }, '— выбрать демо-аккаунт —'));
  DEMO_ACCOUNTS.forEach(a => demoSelect.append(h('option', { value: a.login }, a.label + ' (' + a.login + ')')));
  demoSelect.onchange = () => {
    const acc = DEMO_ACCOUNTS.find(x => x.login === demoSelect.value);
    if (acc) { login.value = acc.login; pass.value = acc.password; }
  };

  const doLogin = async () => {
    err.textContent = '';
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ login: login.value, password: pass.value }) });
      TOKEN = r.token;
      localStorage.setItem('token', TOKEN);
      ME = r.user;
      connectWS();
      render();
    } catch (e) { err.textContent = e.message || 'Ошибка входа'; }
  };
  btn.onclick = doLogin;
  pass.onkeydown = e => { if (e.key === 'Enter') doLogin(); };

  const resetBtn = h('button', { class: 'ghost', style: 'width:100%;margin-top:12px',
    onclick: () => {
      if (!confirm('Сбросить демо-данные?')) return;
      MOCK.reset(); toast('Данные сброшены'); location.reload();
    }}, 'Сбросить демо-данные');

  app.append(h('div', { id: 'login' },
    h('h1', {}, '📓 Электронный дневник'),
    h('p', { style: 'text-align:center;color:#94a3b8;font-size:13px;margin-bottom:16px' }, 'Демо · данные в браузере'),
    demoSelect, login, pass, btn, err, resetBtn,
    h('a', { href: 'index.html', style: 'display:block;text-align:center;margin-top:16px;color:#94a3b8;font-size:13px' }, '← Вернуться на портал')
  ));
}

function navItems() {
  const items = [
    { path: '/', label: '📅 Расписание' },
    { path: '/grades', label: '📊 Оценки' },
    { path: '/homework', label: '📚 Домашние задания' },
    { path: '/chat', label: '💬 Мессенджер' },
    { path: '/announcements', label: '📢 Объявления' },
  ];
  if (ME.role === 'teacher' || ME.role === 'admin') {
    items.push({ path: '/journal', label: '📝 Журнал' });
    items.push({ path: '/attendance', label: '✅ Посещаемость' });
  }
  if (ME.role === 'admin') {
    items.push({ path: '/admin', label: '⚙️ Админ-панель' });
    items.push({ path: '/audit', label: '🔍 Аудит' });
  }
  return items;
}

function renderLayout(viewFn) {
  const app = $('#app');
  app.innerHTML = '';
  app.append(h('div', { class: 'demo-banner' },
    'ДЕМО: данные хранятся в браузере · ',
    h('a', { href: '#', onclick: e => { e.preventDefault(); if (confirm('Сбросить данные?')) { MOCK.reset(); location.reload(); } } }, 'сбросить')
  ));

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' });
  sidebar.append(h('h2', {}, '🏫 Дневник'));
  navItems().forEach(it => {
    const a = h('a', {
      class: 'nav-item' + (state.route === it.path ? ' active' : ''),
      onclick: e => { e.preventDefault(); nav(it.path); sidebar.classList.remove('open'); }
    }, it.label);
    sidebar.append(a);
  });

  sidebar.append(h('div', { class: 'user' },
    h('b', {}, ME.full_name),
    ME.role,
    h('a', { href: 'index.html', class: 'back-link' }, '← На портал'),
    h('button', { class: 'ghost small', style: 'margin-top:6px;width:100%', onclick: changePasswordModal }, 'Сменить пароль'),
    h('button', { class: 'ghost small', style: 'margin-top:6px;width:100%', onclick: logout }, 'Выйти')
  ));

  const content = h('main', { class: 'content' });
  const burger = h('button', { class: 'burger', onclick: () => sidebar.classList.toggle('open') }, '☰');
  app.append(h('div', { class: 'layout' }, sidebar, content));
  app.append(burger);
  viewFn(content);
}

function changePasswordModal() {
  const oldP = h('input', { type: 'password', placeholder: 'Старый пароль' });
  const newP = h('input', { type: 'password', placeholder: 'Новый пароль (мин. 6)' });
  const err = h('div', { class: 'err' });
  const content = h('div', {},
    h('h3', {}, 'Смена пароля'),
    oldP, newP, err,
    h('div', { class: 'actions' },
      h('button', { class: 'ghost', onclick: () => m.close() }, 'Отмена'),
      h('button', { onclick: async () => {
        try {
          await api('/api/me/password', { method: 'POST', body: JSON.stringify({ old: oldP.value, new: newP.value }) });
          m.close(); toast('Пароль изменён');
        } catch (e) { err.textContent = e.message; }
      }}, 'Сохранить')
    )
  );
  const m = showModal(content);
}

async function viewSchedule(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '📅 Расписание')));
  if (ME.role === 'parent' && !ME.child_class_id) {
    c.append(h('p', { style: 'color:#f59e0b' }, 'Обратитесь к администратору: не привязан ребёнок'));
    return;
  }
  const classes = await api('/api/classes');
  const filterRow = h('div', { class: 'card' });
  const classSel = h('select');
  classSel.append(h('option', { value: '' }, '— класс —'));
  classes.forEach(cl => classSel.append(h('option', { value: cl.id }, cl.name)));
  if (ME.role === 'student') classSel.value = ME.class_id || '';
  if (ME.role === 'parent') classSel.value = ME.child_class_id || '';
  if (state.scheduleClassId) classSel.value = state.scheduleClassId;
  if (!classSel.value && (ME.role === 'teacher' || ME.role === 'admin') && classes.length) classSel.value = classes[0].id;

  const daySel = h('select');
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach((d, i) => daySel.append(h('option', { value: i + 1 }, d)));
  const dateInput = h('input', { type: 'date' });
  filterRow.append(h('div', { class: 'row' }, classSel, daySel, dateInput));
  c.append(filterRow);
  const out = h('div'); c.append(out);

  async function load() {
    out.innerHTML = '';
    const cid = classSel.value; if (!cid) return;
    state.scheduleClassId = cid;
    let url = `/api/schedule/class/${cid}`;
    if (dateInput.value) url += `?date=${dateInput.value}`;
    else url += `?weekday=${daySel.value}`;
    const slots = await api(url);
    const bells = await api('/api/bell-times');
    const bt = Object.fromEntries(bells.map(b => [b.slot, b]));
    const table = h('table', { class: 'schedule-table' });
    const thead = h('thead');
    thead.append(h('tr', {}, h('th', {}, '№'), h('th', {}, 'Время'),
      h('th', {}, 'Предмет'), h('th', {}, 'Учитель'), h('th', {}, 'Каб.')));
    table.append(thead);
    const tbody = h('tbody');
    for (let s = 1; s <= 7; s++) {
      const slot = slots.find(x => x.slot === s);
      const tr = h('tr');
      tr.append(h('td', { class: 'slot-num' }, String(s),
        bt[s] ? h('div', { class: 'slot-time' }, `${bt[s].start}-${bt[s].end}`) : ''));
      if (slot) tr.append(h('td', {}, slot.subject||''), h('td', {}, slot.teacher||''), h('td', {}, slot.room||''));
      else tr.append(h('td', { colspan: 3, style: 'color:#64748b' }, '—'));
      tbody.append(tr);
    }
    table.append(tbody); out.append(table);
    if (ME.role === 'admin' && dateInput.value) {
      out.append(h('button', { style: 'margin-top:12px', onclick: () => showOverrideModal(load, cid, dateInput.value) }, '+ Замена на эту дату'));
    }
  }
  classSel.onchange = load;
  daySel.onchange = () => { dateInput.value = ''; load(); };
  dateInput.onchange = load;
  if (classSel.value) load();
}

async function showOverrideModal(reload, classId, date) {
  const [subjects, teachers] = await Promise.all([
    api('/api/subjects'),
    api('/api/admin/users?role=teacher').catch(() => []),
  ]);
  const slot = h('input', { type: 'number', min: 1, max: 7, value: 1 });
  const subjSel = h('select'); subjects.forEach(s => subjSel.append(h('option', { value: s.id }, s.name)));
  const teachSel = h('select'); teachers.forEach(t => teachSel.append(h('option', { value: t.id }, t.full_name)));
  const room = h('input', { placeholder: 'Кабинет' });
  const note = h('input', { placeholder: 'Примечание' });
  const canceled = h('input', { type: 'checkbox', style: 'width:auto;flex:0 0 auto' });
  const err = h('div', { class: 'err' });
  const content = h('div', {},
    h('h3', {}, 'Замена на ' + date),
    h('div', { class: 'row' }, slot, subjSel),
    h('div', { class: 'row' }, teachSel, room),
    note,
    h('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px' }, canceled, 'Отменить урок'),
    err,
    h('div', { class: 'actions' },
      h('button', { class: 'ghost', onclick: () => m.close() }, 'Отмена'),
      h('button', { onclick: async () => {
        try {
          await api('/api/schedule/override', { method:'POST', body: JSON.stringify({
            class_id:+classId, date, slot:+slot.value,
            subject_id:+subjSel.value, teacher_id:+teachSel.value,
            room: room.value, note: note.value, canceled: canceled.checked
          })});
          m.close(); reload();
        } catch (e) { err.textContent = e.message; }
      }}, 'Сохранить')
    )
  );
  const m = showModal(content);
}

async function viewGrades(c) {
  const title = (ME.role === 'teacher' || ME.role === 'admin') ? '📊 Оценки' : '📊 Мои оценки';
  c.append(h('div', { class: 'page-title' }, h('span', {}, title)));
  const params = new URLSearchParams();
  if (ME.role === 'student') params.set('student_id', ME.id);
  if (ME.role === 'parent') params.set('student_id', ME.child_id || '');
  const grades = await api('/api/grades?' + params);
  const card = h('div', { class: 'card' });
  if (!grades.length) card.append(h('p', { style: 'color:#94a3b8' }, 'Оценок пока нет'));
  else {
    const table = h('table');
    table.append(h('thead', {}, h('tr', {},
      h('th', {}, 'Дата'), h('th', {}, 'Предмет'), h('th', {}, 'Оценка'), h('th', {}, 'Комментарий'))));
    const tb = h('tbody');
    grades.forEach(g => tb.append(h('tr', {},
      h('td', {}, g.date), h('td', {}, g.subject),
      h('td', {}, h('span', { class: 'badge g' + g.value }, g.value)),
      h('td', {}, g.comment || ''))));
    table.append(tb); card.append(table);
  }
  c.append(card);
  const numeric = grades.filter(g => /^[1-5]$/.test(g.value)).map(g => +g.value);
  if (numeric.length) {
    const avg = (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(2);
    c.append(h('div', { class: 'card' }, h('h3', {}, 'Средний балл: ' + avg)));
  }
}

async function viewHomework(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '📚 Домашние задания')));
  let classId = ME.class_id;
  if (ME.role === 'parent') classId = ME.child_class_id;
  if (!classId && ME.role !== 'teacher' && ME.role !== 'admin') {
    c.append(h('p', { style: 'color:#f59e0b' }, 'Нет привязки к классу'));
    return;
  }
  const out = h('div');
  if (ME.role === 'teacher' || ME.role === 'admin') {
    const classes = await api('/api/classes');
    const sel = h('select');
    classes.forEach(cl => sel.append(h('option', { value: cl.id }, cl.name)));
    classId = classes[0]?.id;
    sel.onchange = async () => { classId = sel.value; await load(); };
    c.append(h('div', { class: 'card' }, sel));
  }
  c.append(out);
  async function load() {
    out.innerHTML = '';
    if (!classId) return;
    const hw = await api(`/api/homework?class_id=${classId}`);
    if (!hw.length) out.append(h('p', { style: 'color:#94a3b8' }, 'Нет заданий'));
    hw.forEach(item => {
      out.append(h('div', { class: 'card' },
        h('div', { style: 'display:flex;justify-content:space-between;margin-bottom:8px' },
          h('b', {}, item.subject + ' — ' + item.date),
          h('small', { style: 'color:#94a3b8' }, item.teacher)),
        h('div', {}, item.text),
        item.attachment_url ? h('img', { src: item.attachment_url, style: 'max-width:100%;border-radius:8px;margin-top:8px' }) : null));
    });
  }
  if (ME.role === 'teacher' || ME.role === 'admin') {
    const subjSel = h('select');
    const subjects = await api('/api/subjects');
    subjects.forEach(s => subjSel.append(h('option', { value: s.id }, s.name)));
    const date = h('input', { type: 'date' });
    date.value = new Date().toISOString().slice(0, 10);
    const text = h('textarea', { placeholder: 'Текст задания' });
    const url = h('input', { placeholder: 'URL картинки (опц.)' });
    c.append(h('div', { class: 'card' },
      h('h3', {}, '+ Новое ДЗ'),
      h('div', { class: 'row' }, subjSel, date), text, url,
      h('button', { style: 'margin-top:10px', onclick: async () => {
        try {
          await api('/api/homework', { method:'POST', body: JSON.stringify({
            class_id:+classId, subject_id:+subjSel.value, date: date.value,
            text: text.value, attachment_url: url.value
          })});
          toast('ДЗ добавлено'); load();
        } catch (e) { toast('Ошибка: ' + e.message); }
      }}, 'Опубликовать')));
  }
  await load();
}

async function viewChat(c) {
  const layout = h('div', { class: 'chat-layout' });
  const list = h('div', { class: 'chat-list' });
  const box = h('div', { class: 'chat-box' });
  layout.append(list, box);
  c.append(h('div', { class: 'page-title' },
    h('span', {}, '💬 Мессенджер'),
    h('div', { class: 'row', style: 'max-width:400px' },
      h('button', { class: 'small', onclick: async () => {
        const uid = prompt('ID пользователя для диалога (2-6 учителя, 7+ ученики):');
        if (!uid) return;
        try {
          const r = await api('/api/chats/direct', { method:'POST', body: JSON.stringify({ user_id:+uid }) });
          await loadChats(); await openChat(r.id, 'Диалог');
        } catch (e) { toast('Ошибка: ' + e.message); }
      }}, '+ Диалог'),
      h('button', { class: 'small', onclick: async () => {
        const name = prompt('Название группы:');
        if (!name) return;
        const ids = prompt('ID участников через запятую:');
        const arr = (ids||'').split(',').map(s => +s.trim()).filter(Boolean);
        try {
          const r = await api('/api/chats', { method:'POST', body: JSON.stringify({ type:'group', name, user_ids:arr }) });
          await loadChats(); await openChat(r.id, name);
        } catch (e) { toast('Ошибка: ' + e.message); }
      }}, '+ Группа'))));
  c.append(layout);

  async function loadChats() {
    state.chats = await api('/api/chats');
    list.innerHTML = '';
    state.chats.forEach(ch => {
      list.append(h('div', {
        class: 'chat-item' + (state.chatId === ch.id ? ' active' : ''),
        onclick: () => openChat(ch.id, ch.name || 'Чат')
      }, h('b', {}, ch.name || (ch.type === 'direct' ? 'Диалог' : 'Чат')),
         h('small', {}, ch.last_msg || '')));
    });
  }

  async function openChat(id, name) {
    state.chatId = id;
    await loadChats();
    box.innerHTML = '';
    box.append(h('div', { class: 'chat-header' }, name));
    const msgs = h('div', { class: 'messages' });
    box.append(msgs);
    const input = h('input', { placeholder: 'Сообщение...' });
    const sendBtn = h('button', {}, '➤');
    box.append(h('div', { class: 'chat-input' }, input, sendBtn));

    async function loadMessages() {
      state.messages = await api(`/api/chats/${id}/messages`);
      msgs.innerHTML = '';
      state.messages.slice().reverse().forEach(m => msgs.append(renderMsg(m)));
      msgs.scrollTop = msgs.scrollHeight;
    }
    function renderMsg(m) {
      const isMine = m.sender_id === ME.id;
      const el = h('div', { class: 'msg' + (isMine ? ' mine' : '') + (m.deleted_at ? ' deleted' : '') });
      el.append(h('div', { class: 'meta' },
        (m.sender_name || '?') + ' · ' + new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})));
      el.append(h('div', {}, m.deleted_at ? 'удалено' : m.text));
      if (m.attachment_url) el.append(h('img', { src: m.attachment_url, style: 'max-width:100%;border-radius:6px;margin-top:4px' }));
      if (!m.deleted_at && isMine) {
        el.append(h('div', { class: 'actions' },
          h('button', { onclick: async () => {
            const t = prompt('Новый текст:', m.text);
            if (t == null) return;
            try { await api(`/api/messages/${m.id}`, { method:'PUT', body: JSON.stringify({ text:t }) }); loadMessages(); }
            catch (e) { toast('Ошибка: ' + e.message); }
          }}, 'ред.'),
          h('button', { onclick: async () => {
            if (!confirm('Удалить?')) return;
            try { await api(`/api/messages/${m.id}`, { method:'DELETE' }); loadMessages(); }
            catch (e) { toast('Ошибка: ' + e.message); }
          }}, 'удл.')));
      }
      return el;
    }
    const doSend = async () => {
      if (!input.value.trim()) return;
      const text = input.value; input.value = '';
      try { await api(`/api/chats/${id}/messages`, { method:'POST', body: JSON.stringify({ text }) }); }
      catch (e) { toast('Ошибка: ' + e.message); }
    };
    sendBtn.onclick = doSend;
    input.onkeydown = e => { if (e.key === 'Enter') doSend(); };
    await loadMessages();
    state._chatHandler = async (event, data) => {
      if (event === 'message' && data.chat_id === id) {
        msgs.append(renderMsg(data));
        msgs.scrollTop = msgs.scrollHeight;
      }
      if (event === 'message_edited' && data.chat_id === id) await loadMessages();
      if (event === 'message_deleted' && data.chat_id === id) await loadMessages();
    };
  }
  const off = onWS((event, data) => {
    if (state._chatHandler) state._chatHandler(event, data);
    if (event === 'message') loadChats();
  });
  state.chatCleanup.push(off);
  await loadChats();
  if (state.chats[0]) await openChat(state.chats[0].id, state.chats[0].name || 'Чат');
}

async function viewAnnouncements(c) {
  c.innerHTML = '';
  c.append(h('div', { class: 'page-title' }, h('span', {}, '📢 Объявления')));
  const list = await api('/api/announcements');
  if (!list.length) c.append(h('p', { style: 'color:#94a3b8' }, 'Пока нет объявлений'));
  list.forEach(a => c.append(h('div', { class: 'card' },
    h('h3', { style:'color:#e2e8f0;font-size:16px' }, a.title),
    h('div', {}, a.body),
    h('small', { style:'color:#94a3b8' }, new Date(a.created_at).toLocaleString('ru')))));
  if (ME.role === 'admin') {
    const title = h('input', { placeholder: 'Заголовок' });
    const body = h('textarea', { placeholder: 'Текст' });
    const role = h('select');
    ['', 'teacher', 'student', 'parent'].forEach(r => role.append(h('option', { value: r }, r || 'все')));
    c.append(h('div', { class: 'card' },
      h('h3', {}, '+ Новое объявление'), title, body, role,
      h('button', { style: 'margin-top:10px', onclick: async () => {
        try {
          await api('/api/announcements', { method:'POST', body: JSON.stringify({
            title: title.value, body: body.value, target_role: role.value
          })});
          viewAnnouncements(c);
        } catch (e) { toast('Ошибка: ' + e.message); }
      }}, 'Опубликовать')));
  }
}

async function viewJournal(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '📝 Журнал')));
  const classes = await api('/api/classes');
  const subjects = await api('/api/subjects');
  const classSel = h('select'); classes.forEach(cl => classSel.append(h('option', { value: cl.id }, cl.name)));
  const subjSel = h('select'); subjects.forEach(s => subjSel.append(h('option', { value: s.id }, s.name)));
  const from = h('input', { type: 'date' }), to = h('input', { type: 'date' });
  const today = new Date();
  from.value = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  to.value = today.toISOString().slice(0, 10);
  c.append(h('div', { class: 'card' }, h('div', { class: 'row' }, classSel, subjSel, from, to)));
  const out = h('div'); c.append(out);
  async function load() {
    out.innerHTML = '';
    const data = await api(`/api/journal?class_id=${classSel.value}&subject_id=${subjSel.value}&from=${from.value}&to=${to.value}`);
    const dates = [...new Set(data.grades.map(g => g.date))].sort();
    if (!dates.length) out.append(h('p', { style:'color:#94a3b8' }, 'За период оценок нет'));
    const table = h('table');
    const head = h('tr', {}, h('th', {}, 'Ученик'));
    dates.forEach(d => head.append(h('th', {}, d.slice(5))));
    head.append(h('th', {}, '+Оценка'));
    table.append(h('thead', {}, head));
    const tb = h('tbody');
    data.students.forEach(st => {
      const tr = h('tr');
      tr.append(h('td', {}, st.name));
      dates.forEach(d => {
        const gs = data.grades.filter(g => g.student_id === st.id && g.date === d);
        const td = h('td');
        gs.forEach(g => td.append(h('span', {
          class: 'badge g' + g.value, style: 'margin-right:2px;cursor:pointer', title: g.comment || '',
          onclick: async () => {
            if (!confirm(`Удалить оценку ${g.value}?`)) return;
            try { await api(`/api/grades/${g.id}`, { method:'DELETE' }); load(); }
            catch (e) { toast('Ошибка: ' + e.message); }
          }
        }, g.value)));
        tr.append(td);
      });
      tr.append(h('td', {}, h('button', { class: 'small',
        onclick: async () => {
          const v = prompt('Оценка (1-5, Б, У, Н, О):');
          if (!v) return;
          const d = prompt('Дата (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
          if (!d) return;
          const comment = prompt('Комментарий (опц.):') || '';
          try { await api('/api/grades', { method:'POST', body: JSON.stringify({
            student_id: st.id, subject_id:+subjSel.value, date: d, value: v, comment
          })}); load(); } catch (e) { toast('Ошибка: ' + e.message); }
        }
      }, '+Оценка')));
      tb.append(tr);
    });
    table.append(tb); out.append(table);
  }
  classSel.onchange = load; subjSel.onchange = load;
  from.onchange = load; to.onchange = load;
  await load();
}

async function viewAttendance(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '✅ Посещаемость')));
  const classes = await api('/api/classes');
  const classSel = h('select'); classes.forEach(cl => classSel.append(h('option', { value: cl.id }, cl.name)));
  const date = h('input', { type: 'date' });
  date.value = new Date().toISOString().slice(0, 10);
  c.append(h('div', { class: 'card' }, h('div', { class: 'row' }, classSel, date)));
  const out = h('div'); c.append(out);
  async function load() {
    out.innerHTML = '';
    const [students, att] = await Promise.all([
      api(`/api/class/${classSel.value}/students`),
      api(`/api/attendance?class_id=${classSel.value}&date=${date.value}`)
    ]);
    if (!students.length) { out.append(h('p', { style:'color:#94a3b8' }, 'Нет учеников')); return; }
    const statuses = ['+', 'Н', 'Б', 'У', 'О'];
    const card = h('div', { class: 'card' });
    const table = h('table');
    table.append(h('thead', {}, h('tr', {}, h('th', {}, 'Ученик'), h('th', {}, 'Уроки 1-7'))));
    const tb = h('tbody');
    const local = {}; att.forEach(a => { (local[a.student_id] ||= {})[a.slot] = a.status; });
    students.forEach(st => {
      const tr = h('tr', {}, h('td', {}, st.full_name));
      const td = h('td');
      for (let s = 1; s <= 7; s++) {
        const sel = h('select', { style:'width:60px;display:inline-block;margin-right:4px;min-width:0;flex:0 0 auto' });
        statuses.forEach(v => {
          const opt = h('option', { value: v }, v);
          if (local[st.id]?.[s] === v) opt.selected = true;
          sel.append(opt);
        });
        sel.onchange = async () => {
          try { await api('/api/attendance', { method:'POST', body: JSON.stringify([{
            student_id: st.id, date: date.value, slot: s, status: sel.value
          }])}); } catch (e) { toast('Ошибка: ' + e.message); }
        };
        td.append(sel);
      }
      tr.append(td); tb.append(tr);
    });
    table.append(tb); card.append(table); out.append(card);
  }
  classSel.onchange = load; date.onchange = load;
  await load();
}

async function viewAdmin(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '⚙️ Админ-панель')));
  const tabs = h('div', { class: 'row', style: 'margin-bottom:16px' });
  const out = h('div');
  const names = ['Пользователи', 'Классы', 'Предметы', 'Звонки', 'Расписание'];
  let active = 0;
  names.forEach((n, i) => tabs.append(h('button', {
    class: i === active ? '' : 'ghost',
    onclick: () => { active = i; renderTab(); }
  }, n)));
  c.append(tabs, out);
  async function renderTab() {
    tabs.querySelectorAll('button').forEach((b, i) => b.className = i === active ? '' : 'ghost');
    out.innerHTML = '';
    if (active === 0) await tabUsers(out);
    if (active === 1) await tabClasses(out);
    if (active === 2) await tabSubjects(out);
    if (active === 3) await tabBells(out);
    if (active === 4) await tabScheduleAdmin(out);
  }
  await renderTab();
}

async function tabUsers(out) {
  out.innerHTML = '';
  const users = await api('/api/admin/users');
  const card = h('div', { class: 'card' });
  card.append(h('h3', {}, `Пользователи (${users.length})`));
  const table = h('table');
  table.append(h('thead', {}, h('tr', {},
    h('th', {}, 'ID'), h('th', {}, 'Логин'), h('th', {}, 'ФИО'),
    h('th', {}, 'Роль'), h('th', {}, 'Класс'), h('th', {}, 'Активен'), h('th', {}, ''))));
  const tb = h('tbody');
  users.forEach(u => {
    tb.append(h('tr', {},
      h('td', {}, u.id), h('td', {}, u.login), h('td', {}, u.full_name),
      h('td', {}, u.role), h('td', {}, u.class_id || '—'),
      h('td', {}, u.is_active ? '✓' : '✗'),
      h('td', {},
        h('button', { class: 'small ghost', onclick: () => editUser(u, out) }, 'ред.'),
        h('button', { class: 'small danger', style: 'margin-left:4px', onclick: async () => {
          if (!confirm('Деактивировать?')) return;
          try { await api(`/api/admin/users/${u.id}`, { method:'DELETE' }); tabUsers(out); }
          catch (e) { toast('Ошибка: ' + e.message); }
        }}, '×'))));
  });
  table.append(tb); card.append(table);
  card.append(h('button', { style: 'margin-top:12px', onclick: () => editUser(null, out) }, '+ Пользователь'));
  out.append(card);
}

function editUser(u, out) {
  const isNew = !u;
  u = u || { login: '', full_name: '', role: 'student', class_id: null, child_id: null };
  const login = h('input', { value: u.login, placeholder: 'Логин' });
  const pass = h('input', { type: 'password', placeholder: isNew ? 'Пароль' : 'Новый (пусто=без изм.)' });
  const name = h('input', { value: u.full_name, placeholder: 'ФИО' });
  const role = h('select');
  ['admin','teacher','student','parent'].forEach(r => {
    const opt = h('option', { value: r }, r);
    if (u.role === r) opt.selected = true;
    role.append(opt);
  });
  const classId = h('input', { type: 'number', value: u.class_id || '', placeholder: 'ID класса' });
  const childId = h('input', { type: 'number', value: u.child_id || '', placeholder: 'ID ребёнка (parent)' });
  const err = h('div', { class: 'err' });
  const content = h('div', {},
    h('h3', {}, isNew ? 'Новый пользователь' : 'Редактировать'),
    login, pass, name, role, classId, childId, err,
    h('div', { class: 'actions' },
      h('button', { class: 'ghost', onclick: () => m.close() }, 'Отмена'),
      h('button', { onclick: async () => {
        try {
          const body = { full_name: name.value, role: role.value };
          if (pass.value) body.password = pass.value;
          if (classId.value !== '') body.class_id = +classId.value;
          if (childId.value !== '') body.child_id = +childId.value;
          if (isNew) {
            body.login = login.value;
            body.password = pass.value || '123456';
            await api('/api/admin/users', { method:'POST', body: JSON.stringify(body) });
          } else {
            await api(`/api/admin/users/${u.id}`, { method:'PUT', body: JSON.stringify(body) });
          }
          m.close(); tabUsers(out);
        } catch (e) { err.textContent = e.message; }
      }}, 'Сохранить')));
  const m = showModal(content);
}

async function tabClasses(out) {
  out.innerHTML = '';
  const list = await api('/api/classes');
  const card = h('div', { class: 'card' });
  card.append(h('h3', {}, 'Классы'));
  list.forEach(cl => card.append(h('div', { style: 'padding:8px 0;border-bottom:1px solid var(--border)' },
    h('b', {}, cl.name), ' · ' + cl.year + ' · классрук ID: ' + (cl.head_teacher_id || '—'))));
  const name = h('input', { placeholder: 'Название (7А)' });
  const year = h('input', { type: 'number', value: new Date().getFullYear() });
  card.append(h('div', { class: 'row', style: 'margin-top:12px' }, name, year));
  card.append(h('button', { style: 'margin-top:10px', onclick: async () => {
    try { await api('/api/classes', { method:'POST', body: JSON.stringify({ name: name.value, year: +year.value }) }); tabClasses(out); }
    catch (e) { toast('Ошибка: ' + e.message); }
  }}, '+ Класс'));
  out.append(card);
}

async function tabSubjects(out) {
  out.innerHTML = '';
  const list = await api('/api/subjects');
  const card = h('div', { class: 'card' });
  card.append(h('h3', {}, 'Предметы'));
  list.forEach(s => card.append(h('div', { style: 'padding:4px 0' }, `#${s.id} — ${s.name}`)));
  const name = h('input', { placeholder: 'Название' });
  card.append(h('div', { class: 'row', style: 'margin-top:12px' }, name));
  card.append(h('button', { style: 'margin-top:10px', onclick: async () => {
    try { await api('/api/subjects', { method:'POST', body: JSON.stringify({ name: name.value }) }); tabSubjects(out); }
    catch (e) { toast('Ошибка: ' + e.message); }
  }}, '+ Предмет'));
  out.append(card);
}

async function tabBells(out) {
  out.innerHTML = '';
  const list = await api('/api/bell-times');
  const card = h('div', { class: 'card' });
  card.append(h('h3', {}, 'Звонки'));
  const rows = list.map(b => {
    const slot = h('input', { type: 'number', value: b.slot, style: 'width:60px' });
    const start = h('input', { value: b.start });
    const end = h('input', { value: b.end });
    const row = h('div', { class: 'row', style: 'margin-bottom:6px' }, slot, start, end);
    row._vals = () => ({ slot:+slot.value, start: start.value, end: end.value });
    return row;
  });
  rows.forEach(r => card.append(r));
  card.append(h('button', { style: 'margin-top:10px', onclick: async () => {
    try { await api('/api/bell-times', { method:'POST', body: JSON.stringify(rows.map(r => r._vals())) }); toast('Сохранено'); }
    catch (e) { toast('Ошибка: ' + e.message); }
  }}, 'Сохранить'));
  out.append(card);
}

async function tabScheduleAdmin(out) {
  out.innerHTML = '';
  const classes = await api('/api/classes');
  const subjects = await api('/api/subjects');
  const teachers = await api('/api/admin/users?role=teacher').catch(() => []);
  const classSel = h('select'); classes.forEach(cl => classSel.append(h('option', { value: cl.id }, cl.name)));
  const wd = h('select');
  ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach((d, i) => wd.append(h('option', { value: i+1 }, d)));
  const slot = h('input', { type: 'number', min: 1, max: 7, value: 1 });
  const subj = h('select'); subjects.forEach(s => subj.append(h('option', { value: s.id }, s.name)));
  const teach = h('select'); teachers.forEach(t => teach.append(h('option', { value: t.id }, t.full_name)));
  const room = h('input', { placeholder: 'Каб.' });
  const card = h('div', { class: 'card' });
  card.append(h('h3', {}, 'Урок в базовом расписании'));
  card.append(h('div', { class: 'row' }, classSel, wd, slot, subj, teach, room));
  card.append(h('button', { style: 'margin-top:10px', onclick: async () => {
    try {
      await api('/api/schedule', { method:'POST', body: JSON.stringify({
        class_id:+classSel.value, weekday:+wd.value, slot:+slot.value,
        subject_id:+subj.value, teacher_id:+teach.value, room: room.value
      })});
      toast('Сохранено');
    } catch (e) { toast('Ошибка: ' + e.message); }
  }}, 'Сохранить'));
  out.append(card);
}

async function viewAudit(c) {
  c.append(h('div', { class: 'page-title' }, h('span', {}, '🔍 Журнал действий')));
  const list = await api('/api/admin/audit');
  const table = h('table');
  table.append(h('thead', {}, h('tr', {},
    h('th', {}, 'Время'), h('th', {}, 'Кто'), h('th', {}, 'Действие'),
    h('th', {}, 'Объект'), h('th', {}, 'ID'))));
  const tb = h('tbody');
  list.forEach(a => tb.append(h('tr', {},
    h('td', {}, new Date(a.created_at).toLocaleString('ru')),
    h('td', {}, a.user || '?'), h('td', {}, a.action),
    h('td', {}, a.entity || ''), h('td', {}, a.entity_id || ''))));
  table.append(tb);
  c.append(h('div', { class: 'card' }, table));
}

function renderError(c) {
  return e => c.append(h('div', { class: 'card', style: 'color:#ef4444' }, 'Ошибка: ' + e.message));
}

async function render() {
  if (!TOKEN) return renderLogin();
  if (!ME) {
    try { ME = await api('/api/me'); }
    catch { return logout(); }
  }
  const route = state.route;
  renderLayout(c => {
    if (route === '/' || route === '') viewSchedule(c).catch(renderError(c));
    else if (route === '/grades') viewGrades(c).catch(renderError(c));
    else if (route === '/homework') viewHomework(c).catch(renderError(c));
    else if (route === '/chat') viewChat(c).catch(renderError(c));
    else if (route === '/announcements') viewAnnouncements(c).catch(renderError(c));
    else if (route === '/journal') viewJournal(c).catch(renderError(c));
    else if (route === '/attendance') viewAttendance(c).catch(renderError(c));
    else if (route === '/admin') viewAdmin(c).catch(renderError(c));
    else if (route === '/audit') viewAudit(c).catch(renderError(c));
    else c.append(h('p', {}, 'Страница не найдена'));
  });
}

(async () => {
  if (TOKEN) connectWS();
  render();
})();