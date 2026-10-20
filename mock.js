import { seedData } from './seed.js';

const DB_KEY = 'diary_db_v2';

export class MockAPI {
  constructor() { this.listener = null; this.load(); }

  load() {
    const raw = localStorage.getItem(DB_KEY);
    try { this.db = raw ? JSON.parse(raw) : seedData(); }
    catch { this.db = seedData(); }
    if (!this.db.next_id) this.db.next_id = {};
    this.save();
  }

  save() { localStorage.setItem(DB_KEY, JSON.stringify(this.db)); }
  reset() { this.db = seedData(); this.save(); this.emit('reset', {}); }
  setListener(fn) { this.listener = fn; }
  emit(event, data) { if (this.listener) this.listener(event, data); }
  nid(t) { this.db.next_id[t] = (this.db.next_id[t]||0)+1; return this.db.next_id[t]; }
  findById(t, id) { return this.db[t].find(x => x.id === id); }
  user(id) { return this.findById('users', +id); }
  userName(id) { const u = this.user(id); return u ? u.full_name : ''; }
  subjectName(id) { const s = this.findById('subjects', +id); return s ? s.name : ''; }

  auth(token) {
    if (!token || !token.startsWith('demo-')) return null;
    const u = this.user(+token.slice(5));
    if (!u || !u.is_active) return null;
    return u;
  }

  async handle(method, path, body, token) {
    const u = new URL('http://x' + path);
    const p = u.pathname.replace(/^\/api/, '');
    const q = Object.fromEntries(u.searchParams);
    const me = this.auth(token);
    if (p !== '/login' && !me) return { status: 401, body: { error: 'unauthorized' } };

    try {
      if (p === '/login' && method === 'POST') {
        const user = this.db.users.find(x => x.login === body.login && x.password === body.password);
        if (!user || !user.is_active) return { status: 401, body: { error: 'Неверный логин или пароль' } };
        let childClass = null;
        if (user.role === 'parent' && user.child_id) {
          const child = this.user(user.child_id);
          if (child) childClass = child.class_id;
        }
        this.db.audit_log.push({ id: this.nid('audit_log'), user_id: user.id,
          action: 'login', entity: 'user', entity_id: user.id, created_at: new Date().toISOString() });
        this.save();
        const { password: _, ...safeUser } = user;
        return { status: 200, body: { token: 'demo-' + user.id, user: { ...safeUser, child_class_id: childClass } } };
      }

      if (p === '/me' && method === 'GET') {
        let childClass = null;
        if (me.role === 'parent' && me.child_id) {
          const child = this.user(me.child_id);
          if (child) childClass = child.class_id;
        }
        const { password: _, ...safeUser } = me;
        return { status: 200, body: { ...safeUser, child_class_id: childClass } };
      }

      if (p === '/me/password' && method === 'POST') {
        if (!body.new || body.new.length < 6) return { status: 400, body: { error: 'пароль минимум 6 символов' } };
        if (me.password !== body.old) return { status: 400, body: { error: 'неверный старый пароль' } };
        this.user(me.id).password = body.new; this.save();
        return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/classes' && method === 'GET') return { status: 200, body: this.db.classes };
      if (p === '/subjects' && method === 'GET') return { status: 200, body: this.db.subjects };
      if (p === '/bell-times' && method === 'GET') return { status: 200, body: this.db.bell_times };
      if (p === '/bell-times' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        body.forEach(b => {
          const e = this.db.bell_times.find(x => x.slot === +b.slot);
          if (e) { e.start = b.start; e.end = b.end; }
          else this.db.bell_times.push({ slot:+b.slot, start:b.start, end:b.end });
        });
        this.save(); return { status: 200, body: { status: 'ok' } };
      }

      if (p.match(/^\/schedule\/class\/\d+$/) && method === 'GET') {
        const classId = +p.split('/')[3];
        if (q.date) {
          const d = new Date(q.date + 'T00:00:00');
          let wd = d.getDay(); if (wd === 0) wd = 7;
          const base = this.db.schedule.filter(s => s.class_id === classId && s.weekday === wd)
            .map(s => ({ id:s.id, class_id:classId, slot:s.slot, subject_id:s.subject_id,
              teacher_id:s.teacher_id, room:s.room||'', subject:this.subjectName(s.subject_id),
              teacher:this.userName(s.teacher_id) }));
          const ov = this.db.schedule_overrides.filter(o => o.class_id === classId && o.date === q.date)
            .map(o => ({ id:o.id, class_id:classId, slot:o.slot, date:q.date,
              subject_id:o.subject_id, teacher_id:o.teacher_id, room:o.room||'',
              note:o.note||'', canceled:o.canceled,
              subject: o.canceled ? '— отменено —' : this.subjectName(o.subject_id),
              teacher: o.canceled ? '' : this.userName(o.teacher_id) }));
          ov.forEach(o => {
            const i = base.findIndex(x => x.slot === o.slot);
            if (i >= 0) base[i] = o; else base.push(o);
          });
          return { status: 200, body: base };
        }
        const wd = +q.weekday || 1;
        return { status: 200, body: this.db.schedule
          .filter(s => s.class_id === classId && s.weekday === wd)
          .map(s => ({ id:s.id, class_id:classId, weekday:wd, slot:s.slot,
            subject_id:s.subject_id, teacher_id:s.teacher_id, room:s.room||'',
            subject:this.subjectName(s.subject_id), teacher:this.userName(s.teacher_id) })) };
      }
      if (p === '/schedule' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const { class_id, weekday, slot, subject_id, teacher_id, room } = body;
        if (!class_id || !subject_id || !teacher_id) return { status: 400, body: { error: 'нужны класс, предмет, учитель' } };
        const e = this.db.schedule.find(s => s.class_id === class_id && s.weekday === weekday && s.slot === slot);
        if (e) Object.assign(e, { subject_id, teacher_id, room });
        else this.db.schedule.push({ id:this.nid('schedule'), class_id, weekday, slot, subject_id, teacher_id, room:room||'' });
        this.save(); return { status: 200, body: { status: 'ok' } };
      }
      if (p === '/schedule/override' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const { class_id, date, slot, subject_id, teacher_id, room, note, canceled } = body;
        if (!class_id || !date) return { status: 400, body: { error: 'нужны класс и дата' } };
        const e = this.db.schedule_overrides.find(o => o.class_id === class_id && o.date === date && o.slot === slot);
        if (e) Object.assign(e, { subject_id, teacher_id, room, note, canceled });
        else this.db.schedule_overrides.push({ id:this.nid('schedule_overrides'),
          class_id, date, slot, subject_id, teacher_id, room:room||'', note:note||'', canceled:!!canceled });
        this.save();
        this.emit('schedule_changed', { class_id, date, slot });
        return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/admin/users' && method === 'GET') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        let list = this.db.users;
        if (q.role) list = list.filter(u => u.role === q.role);
        if (q.class_id) list = list.filter(u => u.class_id === +q.class_id);
        return { status: 200, body: list.map(({ password, ...u }) => u) };
      }
      if (p === '/admin/users' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const { login, password, full_name, role, class_id, child_id } = body;
        if (!login || !password || password.length < 6) return { status: 400, body: { error: 'логин и пароль>=6 обязательны' } };
        if (this.db.users.find(u => u.login === login)) return { status: 400, body: { error: 'логин занят' } };
        const id = this.nid('users');
        this.db.users.push({ id, login, password, full_name, role,
          class_id: class_id || null, child_id: child_id || null,
          is_active: true, created_at: new Date().toISOString() });
        const sc = this.db.chats.find(c => c.type === 'school');
        if (sc) this.db.chat_members.push({ chat_id: sc.id, user_id: id });
        if (class_id) {
          const cc = this.db.chats.find(c => c.type === 'class' && c.class_id === class_id);
          if (cc) this.db.chat_members.push({ chat_id: cc.id, user_id: id });
        }
        this.save(); return { status: 201, body: { id } };
      }
      if (p.match(/^\/admin\/users\/\d+$/) && method === 'PUT') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const id = +p.split('/')[3];
        if (id === me.id && body.is_active === false) return { status: 400, body: { error: 'нельзя деактивировать себя' } };
        const u2 = this.user(id); if (!u2) return { status: 404, body: { error: 'not found' } };
        if (body.full_name !== undefined) u2.full_name = body.full_name;
        if (body.role !== undefined) u2.role = body.role;
        if (body.password) u2.password = body.password;
        if (body.class_id !== undefined) {
          const oldC = u2.class_id; u2.class_id = body.class_id;
          if (oldC !== body.class_id) {
            const oldCC = this.db.chats.find(c => c.type === 'class' && c.class_id === oldC);
            if (oldCC) this.db.chat_members = this.db.chat_members.filter(m => !(m.chat_id === oldCC.id && m.user_id === id));
            const newCC = this.db.chats.find(c => c.type === 'class' && c.class_id === body.class_id);
            if (newCC && !this.db.chat_members.find(m => m.chat_id === newCC.id && m.user_id === id)) {
              this.db.chat_members.push({ chat_id: newCC.id, user_id: id });
            }
          }
        }
        if (body.child_id !== undefined) u2.child_id = body.child_id;
        if (body.is_active !== undefined) u2.is_active = body.is_active;
        this.save(); return { status: 200, body: { status: 'ok' } };
      }
      if (p.match(/^\/admin\/users\/\d+$/) && method === 'DELETE') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const id = +p.split('/')[3];
        if (id === me.id) return { status: 400, body: { error: 'нельзя удалить себя' } };
        const u2 = this.user(id); if (u2) { u2.is_active = false; this.save(); }
        return { status: 200, body: { status: 'ok' } };
      }
      if (p === '/classes' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        if (!body.name) return { status: 400, body: { error: 'нужно название' } };
        const id = this.nid('classes');
        this.db.classes.push({ id, name: body.name, year: body.year || new Date().getFullYear(), head_teacher_id: body.head_teacher_id || null });
        const chatId = this.nid('chats');
        this.db.chats.push({ id: chatId, type: 'class', name: 'Класс ' + body.name, class_id: id });
        this.save(); return { status: 201, body: { id } };
      }
      if (p === '/subjects' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        if (!body.name) return { status: 400, body: { error: 'нужно название' } };
        const id = this.nid('subjects');
        this.db.subjects.push({ id, name: body.name });
        this.save(); return { status: 201, body: { id } };
      }
      if (p.match(/^\/class\/\d+\/students$/) && method === 'GET') {
        if (me.role !== 'teacher' && me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const classId = +p.split('/')[2];
        return { status: 200, body: this.db.users
          .filter(u => u.role === 'student' && u.class_id === classId && u.is_active)
          .map(u => ({ id: u.id, full_name: u.full_name })) };
      }

      if (p === '/grades' && method === 'GET') {
        let sid = q.student_id ? +q.student_id : null;
        if (me.role === 'student') sid = me.id;
        if (me.role === 'parent') {
          if (!me.child_id) return { status: 200, body: [] };
          sid = me.child_id;
        }
        let list = this.db.grades;
        if (sid) list = list.filter(g => g.student_id === sid);
        if (q.subject_id) list = list.filter(g => g.subject_id === +q.subject_id);
        if (q.from) list = list.filter(g => g.date >= q.from);
        if (q.to) list = list.filter(g => g.date <= q.to);
        list = list.map(g => ({ ...g, subject: this.subjectName(g.subject_id), student: this.userName(g.student_id) }))
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 500);
        return { status: 200, body: list };
      }
      if (p === '/journal' && method === 'GET') {
        if (me.role !== 'teacher' && me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const classId = +q.class_id;
        const students = this.db.users
          .filter(u => u.class_id === classId && u.role === 'student' && u.is_active)
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
          .map(u => ({ id: u.id, name: u.full_name }));
        const sids = students.map(s => s.id);
        let grades = this.db.grades.filter(g => sids.includes(g.student_id));
        if (q.subject_id) grades = grades.filter(g => g.subject_id === +q.subject_id);
        if (q.from) grades = grades.filter(g => g.date >= q.from);
        if (q.to) grades = grades.filter(g => g.date <= q.to);
        return { status: 200, body: { students, grades } };
      }
      if (p === '/grades' && method === 'POST') {
        if (me.role !== 'teacher' && me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        const allowed = ['1','2','3','4','5','Б','У','Н','О'];
        if (!allowed.includes(body.value)) return { status: 400, body: { error: 'недопустимая оценка' } };
        const id = this.nid('grades');
        this.db.grades.push({ id, student_id:+body.student_id, subject_id:+body.subject_id,
          teacher_id: me.id, date: body.date, value: body.value, comment: body.comment || '' });
        this.save();
        this.emit('grade_added', { grade_id: id, student_id: body.student_id, value: body.value, subject_id: body.subject_id });
        return { status: 201, body: { id } };
      }
      if (p.match(/^\/grades\/\d+$/) && method === 'DELETE') {
        const id = +p.split('/')[2];
        const g = this.db.grades.find(x => x.id === id);
        if (!g) return { status: 404, body: { error: 'not found' } };
        if (me.role !== 'admin' && g.teacher_id !== me.id) return { status: 403, body: { error: 'forbidden' } };
        this.db.grades = this.db.grades.filter(x => x.id !== id);
        this.save(); return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/attendance' && method === 'GET') {
        const classId = +q.class_id, date = q.date;
        const ids = this.db.users.filter(u => u.class_id === classId && u.role === 'student').map(s => s.id);
        return { status: 200, body: this.db.attendance.filter(a => ids.includes(a.student_id) && a.date === date) };
      }
      if (p === '/attendance' && method === 'POST') {
        if (me.role !== 'teacher' && me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        body.forEach(a => {
          const e = this.db.attendance.find(x => x.student_id === a.student_id && x.date === a.date && x.slot === a.slot);
          if (e) e.status = a.status;
          else this.db.attendance.push({ student_id:a.student_id, date:a.date, slot:a.slot, status:a.status });
        });
        this.save(); return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/homework' && method === 'GET') {
        let list = this.db.homework;
        if (q.class_id) list = list.filter(h => h.class_id === +q.class_id);
        if (q.date) list = list.filter(h => h.date === q.date);
        list = list.map(h => ({ ...h, subject: this.subjectName(h.subject_id), teacher: this.userName(h.teacher_id) }))
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 200);
        return { status: 200, body: list };
      }
      if (p === '/homework' && method === 'POST') {
        if (me.role !== 'teacher' && me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        if (!body.class_id || !body.subject_id || !body.text) return { status: 400, body: { error: 'класс, предмет, текст обязательны' } };
        const id = this.nid('homework');
        this.db.homework.push({ id, class_id:+body.class_id, subject_id:+body.subject_id,
          teacher_id: me.id, date: body.date, text: body.text, attachment_url: body.attachment_url || '' });
        this.save();
        this.emit('homework_added', { class_id: body.class_id, date: body.date });
        return { status: 201, body: { id } };
      }
      if (p.match(/^\/homework\/\d+$/) && method === 'DELETE') {
        const id = +p.split('/')[2];
        const h = this.db.homework.find(x => x.id === id);
        if (!h) return { status: 404, body: { error: 'not found' } };
        if (me.role !== 'admin' && h.teacher_id !== me.id) return { status: 403, body: { error: 'forbidden' } };
        this.db.homework = this.db.homework.filter(x => x.id !== id);
        this.save(); return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/chats' && method === 'GET') {
        const myChats = this.db.chat_members.filter(m => m.user_id === me.id).map(m => m.chat_id);
        const order = { school:0, class:1, group:2, direct:3 };
        return { status: 200, body: this.db.chats
          .filter(c => myChats.includes(c.id))
          .map(c => {
            const msgs = this.db.messages.filter(m => m.chat_id === c.id && !m.deleted_at).sort((a,b) => b.id - a.id);
            return { ...c, last_msg: msgs[0] ? msgs[0].text : '' };
          })
          .sort((a,b) => (order[a.type]??9) - (order[b.type]??9)) };
      }
      if (p === '/chats' && method === 'POST') {
        const t = body.type || 'group';
        if (t !== 'group' && t !== 'direct') return { status: 400, body: { error: 'неверный тип' } };
        const id = this.nid('chats');
        this.db.chats.push({ id, type: t, name: body.name || '', class_id: null });
        const members = new Set([me.id, ...(body.user_ids||[]).filter(uid => this.user(uid))]);
        members.forEach(uid => this.db.chat_members.push({ chat_id: id, user_id: uid }));
        this.save(); return { status: 201, body: { id } };
      }
      if (p === '/chats/direct' && method === 'POST') {
        const other = body.user_id;
        if (!other || other === me.id) return { status: 400, body: { error: 'неверный пользователь' } };
        if (!this.user(other)) return { status: 404, body: { error: 'пользователь не найден' } };
        const myDirects = this.db.chats.filter(c => c.type === 'direct');
        for (const c of myDirects) {
          const mems = this.db.chat_members.filter(m => m.chat_id === c.id).map(m => m.user_id);
          if (mems.length === 2 && mems.includes(me.id) && mems.includes(other)) {
            return { status: 200, body: { id: c.id } };
          }
        }
        const id = this.nid('chats');
        this.db.chats.push({ id, type: 'direct', name: '', class_id: null });
        this.db.chat_members.push({ chat_id: id, user_id: me.id });
        this.db.chat_members.push({ chat_id: id, user_id: other });
        this.save(); return { status: 201, body: { id } };
      }
      if (p.match(/^\/chats\/\d+\/messages$/) && method === 'GET') {
        const chatId = +p.split('/')[2];
        const ok = this.db.chat_members.find(m => m.chat_id === chatId && m.user_id === me.id);
        if (!ok) return { status: 403, body: { error: 'forbidden' } };
        const list = this.db.messages.filter(m => m.chat_id === chatId)
          .sort((a,b) => b.id - a.id).slice(0, 100)
          .map(m => ({ ...m, sender_name: this.userName(m.sender_id) }));
        return { status: 200, body: list };
      }
      if (p.match(/^\/chats\/\d+\/messages$/) && method === 'POST') {
        const chatId = +p.split('/')[2];
        const ok = this.db.chat_members.find(m => m.chat_id === chatId && m.user_id === me.id);
        if (!ok) return { status: 403, body: { error: 'forbidden' } };
        if (!body.text && !body.attachment_url) return { status: 400, body: { error: 'пустое сообщение' } };
        const id = this.nid('messages');
        const msg = { id, chat_id: chatId, sender_id: me.id, text: body.text || '',
          attachment_url: body.attachment_url || '', edited_at: null, deleted_at: null,
          created_at: new Date().toISOString() };
        this.db.messages.push(msg);
        this.save();
        this.emit('message', { ...msg, sender_name: me.full_name });
        return { status: 201, body: msg };
      }
      if (p.match(/^\/messages\/\d+$/) && method === 'PUT') {
        const id = +p.split('/')[2];
        const m = this.db.messages.find(x => x.id === id);
        if (!m || m.sender_id !== me.id || m.deleted_at) return { status: 403, body: { error: 'нельзя редактировать' } };
        m.text = body.text || '';
        m.edited_at = new Date().toISOString();
        this.save();
        this.emit('message_edited', { id, text: m.text, chat_id: m.chat_id });
        return { status: 200, body: { status: 'ok' } };
      }
      if (p.match(/^\/messages\/\d+$/) && method === 'DELETE') {
        const id = +p.split('/')[2];
        const m = this.db.messages.find(x => x.id === id);
        if (!m) return { status: 404, body: { error: 'not found' } };
        if (me.role !== 'admin' && m.sender_id !== me.id) return { status: 403, body: { error: 'нельзя удалить' } };
        m.deleted_at = new Date().toISOString();
        this.save();
        this.emit('message_deleted', { id, chat_id: m.chat_id });
        return { status: 200, body: { status: 'ok' } };
      }

      if (p === '/announcements' && method === 'GET') {
        return { status: 200, body: this.db.announcements
          .filter(a => !a.target_role || a.target_role === me.role)
          .sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 100) };
      }
      if (p === '/announcements' && method === 'POST') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        if (!body.title || !body.body) return { status: 400, body: { error: 'нужны заголовок и текст' } };
        const id = this.nid('announcements');
        this.db.announcements.push({ id, author_id: me.id, title: body.title, body: body.body,
          target_role: body.target_role || null, created_at: new Date().toISOString() });
        this.save();
        this.emit('announcement', { id, title: body.title });
        return { status: 201, body: { id } };
      }

      if (p === '/admin/audit' && method === 'GET') {
        if (me.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
        return { status: 200, body: this.db.audit_log.slice().reverse().slice(0, 500)
          .map(a => ({ ...a, user: this.userName(a.user_id) })) };
      }

      return { status: 404, body: { error: 'not found: ' + method + ' ' + p } };
    } catch (e) {
      console.error('MockAPI error:', e);
      return { status: 500, body: { error: e.message || 'internal error' } };
    }
  }
}