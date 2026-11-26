import {request} from '../pharm-quiz/api.js?v=10';
import {setupStudentAuth} from '../pharm-quiz/student-auth.js?v=10';
import {loadBank,mountPractice} from './practice.js';

const byId = id => document.getElementById(id);
const panel = byId('catalog');
const dialog = byId('login');
const search = byId('course-search');
let session;
let routeRevision = 0;
const auth = setupStudentAuth(async credential => {
  const student = await request('student', credential, 'login');
  session = {credential, accountKey:student.progressKey};
  byId('account').textContent = student.nickname || '已登录';
  byId('account').hidden = false;
  byId('sign-out').hidden = false;
  byId('sign-in').hidden = true;
  byId('sign-up').hidden = true;
  dialog.close();
  render();
});

byId('sign-in').addEventListener('click', () => {
  dialog.showModal();
  auth.showLogin();
});
byId('sign-up').addEventListener('click', () => {
  dialog.showModal();
  dialog.querySelector('[data-auth-view=register]').click();
});
byId('close-auth').addEventListener('click', () => dialog.close());
byId('sign-out').addEventListener('click', () => {
  session = undefined;
  render();
  byId('account').hidden = true;
  byId('sign-out').hidden = true;
  byId('sign-in').hidden = false;
  byId('sign-up').hidden = false;
  auth.showLogin();
});

function element(tag,text,className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

let courses = [];

function renderBank(bank) {
  const entry = element('article',null,'bank');
  const name = element('div');
  name.append(element('h3',bank.name));
  if (bank.sourceName) name.append(element('p','原文件 · '+bank.sourceName));
  entry.append(name);
  if (bank.status === 'live' || bank.status === 'ready') {
    const link = element('a','进入刷题','btn primary');
    link.href = bank.href || '#bank-'+bank.id;
    entry.append(link);
  } else {
    entry.append(element('aside',bank.status === 'review'
      ? '逐项解析待核对'
      : '正在整理'));
  }
  return entry;
}

async function startBank(course, bank) {
  const revision = routeRevision;
  if (!session) {
    const notice = element('p','登录大仓鼠账号后开始练习。');
    const signIn = element('button','登录','btn primary');
    signIn.addEventListener('click',() => byId('sign-in').click());
    panel.append(element('h2',bank.name),notice,signIn);
    return;
  }
  panel.append(element('p','正在加载题库…'));
  try {
    const data = await loadBank(bank.id,session.credential);
    if (revision === routeRevision) mountPractice(panel,data,session.accountKey,'#course-'+course.id,element);
  } catch (error) {
    if (revision === routeRevision) panel.replaceChildren(element('p',error.message));
  }
}

function render() {
  routeRevision++;
  panel.replaceChildren();
  if (location.hash.startsWith('#bank-')) {
    const name = location.hash.slice('#bank-'.length);
    for (const course of courses) {
      const bank = course.banks.find(item => item.id===name && item.status==='ready');
      if (bank) { void startBank(course,bank); return; }
    }
  }
  const chosen = courses.find(course => location.hash === '#course-'+course.id);
  if (chosen) {
    const detail = element('div',null,'course-detail');
    const home = element('a','全部科目');
    home.href = '#catalog';
    detail.append(home,element('h2',chosen.name),...chosen.banks.map(renderBank));
    panel.append(detail);
    return;
  }
  const query = search.value.trim().toLocaleLowerCase();
  const grid = element('div',null,'course-grid');
  for (const course of courses) {
    const names = course.banks.map(bank => bank.name).join(' ');
    if (query && !(course.name+' '+names).toLocaleLowerCase().includes(query)) continue;
    const link = byId('course-card').content.firstElementChild.cloneNode(true);
    link.href = '#course-'+course.id;
    link.querySelector('h2').textContent = course.name;
    link.querySelector('p').textContent = course.banks.map(bank => bank.name).slice(0,2).join(' · ');
    link.querySelector('span').textContent = course.banks.length+' 套题库';
    grid.append(link);
  }
  panel.append(grid.childElementCount ? grid : element('p','没有找到匹配的科目或题库。'));
}

search.addEventListener('input', () => {
  if (location.hash.startsWith('#course-') || location.hash.startsWith('#bank-')) history.replaceState(null,'',location.pathname);
  render();
});
window.addEventListener('hashchange',render);

try {
  const response = await fetch('./catalog.json',{cache:'no-cache'});
  if (!response.ok) throw Error('catalog');
  courses = await response.json();
  render();
} catch {
  panel.textContent = '科目目录暂时无法加载，请刷新后重试。';
}
