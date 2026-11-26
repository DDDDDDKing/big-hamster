const profile = 'https://qjnqnchqqbuzjvlkytjl.supabase.co';
const publishableKey = 'sb_publishable_aIMDQatzimHuYaBz9v9E0Q_0ILIq4k4';

export async function loadBank(id, credential) {
  const response = await fetch(profile+'/rest/v1/rpc/hamster_course_bank',{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:publishableKey,Authorization:'Bearer '+await credential()},
    body:JSON.stringify({p_bank:id}), cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(15000)
  });
  if (response.status === 403 || response.status === 401) throw new Error('请重新登录后打开题库。');
  if (!response.ok) throw new Error('题库暂时无法加载，请稍后重试。');
  const bank = await response.json();
  if (!bank || !Array.isArray(bank.questions) || !bank.questions.length) throw new Error('这套题库暂未开放。');
  return bank;
}

export function mountPractice(panel, bank, accountKey, returnLink, element) {
  const storageKey = 'big-hamster:practice:v1:'+accountKey+':'+bank.id;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {}
  const entries = (key) => new Set(Array.isArray(saved[key]) ? saved[key] : []);
  const completed = entries('completed');
  const favorites = entries('favorites');
  const wrong = entries('wrong');
  let view = 'all';
  let index = 0;

  const store = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({completed:[...completed],favorites:[...favorites],wrong:[...wrong]}));
    } catch {}
  };
  const button = (text, action, appearance='ghost') => {
    const control = element('button',text,'btn '+appearance);
    control.type = 'button';
    control.addEventListener('click',action);
    return control;
  };
  const bankTitle = element('h2',bank.sourceName);
  const summary = element('p',null,'practice-summary');
  const modes = element('div',null,'practice-actions');
  const content = element('div',null,'bank-question');
  const back = element('a','返回'+bank.subject);
  back.href = returnLink;
  panel.replaceChildren(back,bankTitle,summary,modes,content);

  function render() {
    summary.textContent = bank.subject+' · 已练 '+completed.size+'/'+bank.questions.length+' 题';
    modes.replaceChildren();
    for (const [key,label] of [['all','全部题目'],['wrong','错题'],['favorites','收藏']]) {
      const filter = button(label,() => { view=key; index=0; render(); },view===key?'primary':'ghost');
      filter.setAttribute('aria-pressed',String(view===key));
      modes.append(filter);
    }
    const questions = view === 'all' ? bank.questions :
      bank.questions.filter(q => (view === 'wrong' ? wrong : favorites).has(q.id));
    content.replaceChildren();
    if (!questions.length) {
      content.append(element('p',view==='wrong'?'这套题库暂无错题。':'这套题库暂无收藏。'));
      return;
    }
    index = Math.min(index,questions.length-1);
    const q = questions[index];
    const position = element('p',(index+1)+' / '+questions.length+(q.sourceNumber?' · 原题号 '+q.sourceNumber:''),'practice-summary');
    const stem = element('h3',q.stem);
    const form = element('form');
    const explanation = element('section',null,'bank-answer');
    explanation.setAttribute('aria-live','polite');
    explanation.hidden=true;
    content.append(position,stem,form,explanation);
    q.options.forEach(option => {
      const label = element('label',null,'answer-option');
      const choice = element('input');
      choice.type = q.type==='multiple'?'checkbox':'radio';
      choice.name = 'option';
      choice.value = option.key;
      label.append(choice,element('span',option.key+'　'+option.text));
      form.append(label);
    });
    const reveal = element('button',q.type==='short'?'查看答题要点':'提交答案','btn primary');
    reveal.type = 'submit';
    form.append(reveal);
    form.addEventListener('submit',event => {
      event.preventDefault();
      const chosen = new Set(new FormData(form).getAll('option'));
      if (q.type !== 'short' && !chosen.size) return;
      const correct = q.answer.length===chosen.size && q.answer.every(key=>chosen.has(key));
      completed.add(q.id);
      if (q.type !== 'short') {
        if (correct) wrong.delete(q.id);
        else wrong.add(q.id);
      }
      explanation.replaceChildren(
        element('h4',q.type==='short'?'参考答案':(correct?'回答正确':'参考答案')+' · '+q.answer.join('、')),
        ...(q.modelAnswer?[element('p',q.modelAnswer)]:[]),
        ...q.options.map(option=>element('p',option.key+' · '+(option.correct?'正确':'错误')+' · '+option.explanation)),
        element('p',q.explanation)
      );
      explanation.hidden=false;
      for (const control of form.elements) control.disabled = true;
      summary.textContent = bank.subject+' · 已练 '+completed.size+'/'+bank.questions.length+' 题';
      store();
    });
    const actions = element('div',null,'practice-actions');
    const star = button(favorites.has(q.id)?'已收藏':'收藏',() => {
      if(favorites.has(q.id)) favorites.delete(q.id);
      else favorites.add(q.id);
      star.textContent = favorites.has(q.id)?'已收藏':'收藏';
      star.setAttribute('aria-pressed',String(favorites.has(q.id)));
      store();
    });
    star.setAttribute('aria-pressed',String(favorites.has(q.id)));
    const prev = button('上一题',() => { index--; render(); });
    const next = button('下一题',() => { index++; render(); });
    prev.disabled = index === 0;
    next.disabled = index === questions.length-1;
    actions.append(star,prev,next);
    content.append(actions);
  }

  render();
}
