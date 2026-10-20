export function seedData() {
  const d = {
    users: [], classes: [], subjects: [], bell_times: [],
    schedule: [], schedule_overrides: [], grades: [], attendance: [],
    homework: [], chats: [], chat_members: [], messages: [],
    announcements: [], audit_log: [],
    next_id: {}
  };
  const nid = t => { d.next_id[t] = (d.next_id[t]||0)+1; return d.next_id[t]; };
  const iso = () => new Date().toISOString();

  [[1,'08:00','08:45'],[2,'08:55','09:40'],[3,'09:55','10:40'],
   [4,'10:55','11:40'],[5,'11:55','12:40'],[6,'12:55','13:40'],[7,'13:50','14:35']]
    .forEach(([slot,start,end]) => d.bell_times.push({slot,start,end}));

  ['Математика','Русский язык','Литература','Физика','История',
   'Английский язык','Информатика','Биология','Химия','География','Физкультура']
    .forEach(name => d.subjects.push({ id: nid('subjects'), name }));

  const c7a = nid('classes'); d.classes.push({id:c7a, name:'7А', year:2025, head_teacher_id:null});
  const c7b = nid('classes'); d.classes.push({id:c7b, name:'7Б', year:2025, head_teacher_id:null});
  const c8a = nid('classes'); d.classes.push({id:c8a, name:'8А', year:2025, head_teacher_id:null});

  d.users.push({id:nid('users'), login:'admin', password:'admin', full_name:'Администратор',
    role:'admin', class_id:null, child_id:null, is_active:true, created_at:iso()});

  const teacherDefs = [
    {login:'teacher1', name:'Иванова Мария Петровна'},
    {login:'teacher2', name:'Петров Сергей Николаевич'},
    {login:'teacher3', name:'Сидорова Елена Викторовна'},
    {login:'teacher4', name:'Кузнецов Андрей Павлович'},
    {login:'teacher5', name:'Смирнова Ольга Игоревна'},
  ];
  const teacherIds = [];
  teacherDefs.forEach(t => {
    const id = nid('users');
    teacherIds.push(id);
    d.users.push({id, login:t.login, password:'123456', full_name:t.name,
      role:'teacher', class_id:null, child_id:null, is_active:true, created_at:iso()});
  });

  d.classes[0].head_teacher_id = teacherIds[0];
  d.classes[1].head_teacher_id = teacherIds[1];
  d.classes[2].head_teacher_id = teacherIds[3];

  const studentNames = {
    [c7a]: ['Александров Артём','Белова Дарья','Волков Максим','Гусева София','Дмитриев Кирилл'],
    [c7b]: ['Егорова Милана','Жуков Никита','Зайцева Алиса','Иванов Роман'],
    [c8a]: ['Козлов Даниил','Лебедева Виктория','Морозов Лев','Новикова Полина'],
  };
  const studentIds = {};
  let counter = 1;
  for (const [cid, names] of Object.entries(studentNames)) {
    studentIds[cid] = [];
    names.forEach(nm => {
      const id = nid('users');
      studentIds[cid].push(id);
      d.users.push({id, login:`student${counter}`, password:'123456', full_name:nm,
        role:'student', class_id:+cid, child_id:null, is_active:true, created_at:iso()});
      counter++;
    });
  }

  let pCounter = 1;
  for (const cid of Object.keys(studentIds)) {
    studentIds[cid].slice(0,2).forEach(childId => {
      const id = nid('users');
      d.users.push({id, login:`parent${pCounter}`, password:'123456',
        full_name:'Родитель ребёнка #'+childId, role:'parent',
        class_id:null, child_id:childId, is_active:true, created_at:iso()});
      pCounter++;
    });
  }

  const sched7a = {
    1: [[1,1,2,'101'],[2,2,3,'205'],[3,3,4,'101'],[4,5,5,'312'],[5,6,6,'108']],
    2: [[1,1,2,'101'],[2,4,4,'210'],[3,2,3,'205'],[4,11,4,'Спорт'],[5,3,3,'205']],
    3: [[1,7,2,'Комп'],[2,1,2,'101'],[3,6,6,'108'],[4,5,5,'312'],[5,2,3,'205']],
    4: [[1,1,2,'101'],[2,9,4,'210'],[3,3,3,'205'],[4,6,6,'108'],[5,10,5,'312']],
    5: [[1,1,2,'101'],[2,2,3,'205'],[3,7,2,'Комп'],[4,11,4,'Спорт'],[5,4,4,'210']],
  };
  for (const [wd, slots] of Object.entries(sched7a)) {
    slots.forEach(([slot, subj, teach, room]) => {
      d.schedule.push({id:nid('schedule'), class_id:c7a, weekday:+wd,
        slot, subject_id:subj, teacher_id:teacherIds[teach-2], room});
    });
  }
  [c7b, c8a].forEach(cid => {
    [1,2,3].forEach(wd => {
      [1,2,3].forEach((slot, i) => {
        d.schedule.push({id:nid('schedule'), class_id:cid, weekday:wd, slot,
          subject_id: i+1, teacher_id: teacherIds[i], room: '10'+i});
      });
    });
  });

  const subjectsForGrades = [1,2,3,4,5];
  const gradeVals = ['5','4','3','5','4','5','Б','Н','4','5','3','4'];
  const today = new Date();
  for (let i = 0; i < 15; i++) {
    const studentId = studentIds[c7a][i % 5];
    const subjId = subjectsForGrades[i % 5];
    const date = new Date(today.getTime() - i * 86400000).toISOString().slice(0,10);
    d.grades.push({
      id: nid('grades'), student_id: studentId, subject_id: subjId,
      teacher_id: teacherIds[i % 5], date, value: gradeVals[i % gradeVals.length],
      comment: i % 3 === 0 ? 'Молодец!' : ''
    });
  }

  [
    {class_id:c7a, subject_id:1, teacher_id:teacherIds[0], text:'§12, задачи 5-8 на стр. 45'},
    {class_id:c7a, subject_id:2, teacher_id:teacherIds[1], text:'Упражнение 128, выучить словарные слова'},
    {class_id:c7a, subject_id:5, teacher_id:teacherIds[3], text:'Параграф 7, ответить на вопросы'},
    {class_id:c7b, subject_id:1, teacher_id:teacherIds[0], text:'§10, стр. 30'},
  ].forEach(h => d.homework.push({
    id: nid('homework'), ...h, date: today.toISOString().slice(0,10), attachment_url:''
  }));

  const schoolChat = nid('chats');
  d.chats.push({id:schoolChat, type:'school', name:'Общий канал школы', class_id:null});
  const classChats = {};
  [c7a, c7b, c8a].forEach(cid => {
    const id = nid('chats');
    classChats[cid] = id;
    d.chats.push({id, type:'class',
      name:'Класс '+d.classes.find(x => x.id===cid).name, class_id:cid});
  });

  d.users.forEach(u => {
    if (u.role === 'admin' || u.role === 'teacher') {
      d.chat_members.push({chat_id:schoolChat, user_id:u.id});
    }
    if (u.class_id && classChats[u.class_id]) {
      d.chat_members.push({chat_id:classChats[u.class_id], user_id:u.id});
    }
    if (u.role === 'parent' && u.child_id) {
      const child = d.users.find(x => x.id===u.child_id);
      if (child && classChats[child.class_id]) {
        d.chat_members.push({chat_id:classChats[child.class_id], user_id:u.id});
      }
    }
  });
  teacherIds.forEach(tid => {
    Object.values(classChats).forEach(cid => {
      d.chat_members.push({chat_id:cid, user_id:tid});
    });
  });

  d.messages.push({
    id: nid('messages'), chat_id: schoolChat, sender_id: 1,
    text: 'Добро пожаловать в электронный дневник! Это демо-версия.',
    attachment_url: '', edited_at: null, deleted_at: null, created_at: iso()
  });
  d.messages.push({
    id: nid('messages'), chat_id: classChats[c7a], sender_id: teacherIds[0],
    text: 'Добрый день! Завтра контрольная по математике.',
    attachment_url: '', edited_at: null, deleted_at: null, created_at: iso()
  });

  d.announcements.push({
    id: nid('announcements'), author_id: 1,
    title: 'Родительское собрание',
    body: 'В пятницу в 18:00 состоится общешкольное родительское собрание.',
    target_role: null, created_at: iso()
  });

  return d;
}