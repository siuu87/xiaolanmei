import { useTodoStore, isTodoDone, type Todo } from '@/features/home/todoStore';
import { usePeriodStore, todayISODate, careMessage } from '@/features/home/periodStore';
import { useDiaryStore } from '@/features/diary/diaryStore';
import { useTimetableStore, WEEKDAY_LABELS, DEFAULT_TOTAL_WEEKS, COURSE_COLORS, type Course, type Parity } from '@/features/schedule/timetableStore';

/** 按文本模糊匹配一条待办（双向包含即可） */
function findTodo(todos: Todo[], q: string): Todo | undefined {
  if (!q) return undefined;
  return todos.find((x) => x.text.includes(q) || q.includes(x.text));
}

/** 去掉结尾的句号/感叹号等语气词 */
function clean(s: string): string {
  return s.replace(/[。！!？?…]+$/, '').trim();
}

/** 解析「周几 第X-Y节 课程名 [@/教室 地点] [周次]」→ 课程字段；解析不出返回 null */
function parseCourseSpec(s: string): Omit<Course, 'id' | 'color'> | null {
  const dayMap: Record<string, number> = {
    周一: 1, 星期一: 1, 礼拜一: 1,
    周二: 2, 星期二: 2, 礼拜二: 2,
    周三: 3, 星期三: 3, 礼拜三: 3,
    周四: 4, 星期四: 4, 礼拜四: 4,
    周五: 5, 星期五: 5, 礼拜五: 5,
    周六: 6, 星期六: 6, 礼拜六: 6,
    周日: 7, 周天: 7, 星期日: 7, 星期天: 7, 礼拜日: 7, 礼拜天: 7,
  };
  const dayKey = Object.keys(dayMap).find((k) => s.includes(k));
  if (!dayKey) return null;

  // 节次：第X-Y节 / 第X节
  const period = s.match(/第(\d{1,2})(?:[-~—到至](\d{1,2}))?节/);
  if (!period) return null;
  const startPeriod = Number(period[1]);
  const endPeriod = Number(period[2] || period[1]);

  // 周次：X-Y周 / 单周 / 双周
  const weeks = s.match(/(\d{1,2})\s*[-~—到至]\s*(\d{1,2})\s*周/);
  let startWeek = 1;
  let endWeek = DEFAULT_TOTAL_WEEKS;
  let parity: Parity = 'all';
  if (weeks) {
    startWeek = Number(weeks[1]);
    endWeek = Number(weeks[2]);
  } else if (/单周/.test(s)) {
    parity = 'odd';
  } else if (/双周/.test(s)) {
    parity = 'even';
  }

  let rest = s.replace(dayKey, ' ').replace(period[0], ' ');
  if (weeks) rest = rest.replace(weeks[0], ' ');
  let location: string | undefined;
  const loc = rest.match(/[@在](\S+)/) || rest.match(/教室([^\s，,。]+)/);
  if (loc) {
    location = loc[1];
    rest = rest.replace(loc[0], ' ');
  }
  const name = rest.replace(/[^一-龥A-Za-z0-9]+/g, ' ').trim();
  if (!name) return null;
  return { name, location, day: dayMap[dayKey], startPeriod, endPeriod, startWeek, endWeek, parity };
}

/**
 * 本地意图：经期 / 待办的确定性指令，秒回且直接改 store。
 * 命中返回回复文案；未命中返回 null（聊天页再走模型流式 /api/chat/stream）。
 */
export function matchLocalIntent(raw: string): string | null {
  const store = useTodoStore.getState();
  const todos = store.todos;
  const t = raw.trim();

  // 经期：口头确认「来了」（记入第 1 天）
  if (/^(来了|今天来了|今天开始|来例假了|大姨妈来了|月经来了)/.test(t)) {
    usePeriodStore.getState().confirmStart(todayISODate());
    return `已记入今天为经期第 1 天。${careMessage(usePeriodStore.getState())}`;
  }

  // 经期：痛经 / 不适（记录症状）
  if (/^(痛经|肚子疼|肚子痛|好痛|很难受|不舒服|难受)/.test(t)) {
    const severe = /严重|好痛|很痛/.test(t);
    usePeriodStore.getState().setSymptom(todayISODate(), { cramps: severe ? 3 : 2 });
    return severe
      ? '听起来很痛，先别硬撑，喝点热的躺一躺，我一直都在 🫐'
      : '记下了，注意保暖、多喝热水，我陪着你 🫐';
  }

  // 经期：还没来（关怀回应）
  if (/^(今天)?(还没来|没来|推迟|延后)/.test(t)) {
    return careMessage(usePeriodStore.getState());
  }

  // 查看待办
  if (/^(待办|todo|有哪些|还有哪些|列表)/i.test(t) || t === '待办') {
    const lines = todos.length
      ? todos.map((x) => `- ${x.text}${isTodoDone(x) ? '（已完成）' : ''}`).join('\n')
      : '还没有待办。';
    return `当前待办：\n${lines}`;
  }

  // 查看课程表
  if (/^(课表|课程表|我的课|这学期课)/.test(t)) {
    const courses = useTimetableStore.getState().courses;
    const groups = WEEKDAY_LABELS.map((w, i) => ({
      label: w,
      items: courses.filter((c) => c.day === i + 1).sort((a, b) => a.startPeriod - b.startPeriod),
    })).filter((g) => g.items.length > 0);
    if (groups.length === 0) {
      return '课表还是空的。说「记课程：周三 第3-4节 高数 @A102 1-16周」，或直接发张课表截图我帮你识别 📚';
    }
    const fmt = (c: Course) =>
      `- 第${c.startPeriod}${c.endPeriod !== c.startPeriod ? `-${c.endPeriod}` : ''}节 ${c.name}${c.location ? `（${c.location}）` : ''} · ${c.startWeek}-${c.endWeek}周${c.parity !== 'all' ? (c.parity === 'odd' ? '单周' : '双周') : ''}`;
    const lines = groups.map((g) => `${g.label}\n${g.items.map(fmt).join('\n')}`).join('\n');
    return `这学期的课表：\n${lines}`;
  }

  // 记课程（聊天抓取 → 写进课程表）
  const addCourse = t.match(/(?:帮我)?(?:记|加|添加|记录|记一下)(?:一节|一门|一个)?(?:课程|课)[：:，,]?\s*(.+)/);
  if (addCourse) {
    const spec = parseCourseSpec(clean(addCourse[1]));
    if (spec) {
      const store = useTimetableStore.getState();
      const color = COURSE_COLORS[store.courses.length % COURSE_COLORS.length];
      store.addCourse({ ...spec, color });
      const period = spec.endPeriod !== spec.startPeriod ? `${spec.startPeriod}-${spec.endPeriod}` : `${spec.startPeriod}`;
      return `已记入课程：${WEEKDAY_LABELS[spec.day - 1]} 第${period}节 ${spec.name}${spec.location ? `（${spec.location}）` : ''} ${spec.startWeek}-${spec.endWeek}周${spec.parity !== 'all' ? (spec.parity === 'odd' ? '单周' : '双周') : ''} ✅`;
    }
    return '我没太看懂，试试这样：「记课程：周三 第3-4节 高数 @A102 1-16周」';
  }

  // 删课程
  const delCourse = t.match(/(?:删|删除|去掉|移除)(?:掉)?(?:一节|一门)?(?:课程|课)[：:，,]?\s*(.+)/);
  if (delCourse) {
    const q = clean(delCourse[1]);
    const store = useTimetableStore.getState();
    const target = store.courses.find((c) => c.name.includes(q) || q.includes(c.name));
    if (target) {
      store.removeCourse(target.id);
      return `已删除课程「${target.name}」🗑️`;
    }
    return `没找到「${q}」这门课。`;
  }

  // 写日记（AI 代 TA 写，直接存进日记本）
  const diary = t.match(/(?:帮我)?(?:记|写|记录)(?:一下)?(?:篇)?日记[：:，,]?\s*(.+)/);
  if (diary) {
    const content = clean(diary[1]);
    if (content) {
      useDiaryStore.getState().addEntry({ date: todayISODate(), author: 'partner', content });
      return '已记进今天的日记 📔';
    }
    return '想记什么呀？说「记日记：今天……」我就帮你写进去。';
  }

  // 添加待办
  const add = t.match(/(?:帮我)?(?:添加|加|新增|记|写)(?:一个|一条|一下)?(?:待办|任务|提醒)?[：:，,]?\s*(.+)/);
  if (add) {
    const text = clean(add[1]);
    if (text) {
      store.addTodo({ text });
      return `已添加待办「${text}」✅`;
    }
  }

  // 完成待办
  const done = t.match(/(?:完成|做完|搞定|标记完成)(?:了)?(?:待办|任务)?[：:，,]?\s*(.+)/);
  if (done) {
    const q = clean(done[1]);
    const target = findTodo(todos, q);
    if (target) {
      store.setTodoDone(target.id, true);
      return `已把「${target.text}」标记为完成 ✅`;
    }
    return `没找到「${q}」这条待办。`;
  }

  // 删除待办
  const del = t.match(/(?:删除|删掉|去掉|移除|取消)(?:了)?(?:待办|任务)?[：:，,]?\s*(.+)/);
  if (del) {
    const q = clean(del[1]);
    const target = findTodo(todos, q);
    if (target) {
      store.removeTodo(target.id);
      return `已删除待办「${target.text}」🗑️`;
    }
    return `没找到「${q}」这条待办。`;
  }

  // 未命中本地意图 → 交给模型
  return null;
}
