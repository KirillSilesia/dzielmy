'use strict';

// ---------- stan i pomocnicze ----------
const state = { token: null, user: null, groups: [], group: null, editingId: null };
const $ = (sel) => document.querySelector(sel);

function save() {
  try { localStorage.setItem('dzielmy', JSON.stringify({ token: state.token, user: state.user })); } catch { /* brak pamięci */ }
}
function load() {
  try { Object.assign(state, JSON.parse(localStorage.getItem('dzielmy')) || {}); } catch { /* brak pamięci */ }
}

function showMessage(text, ok = false) {
  const el = $('#message');
  el.textContent = text;
  el.className = ok ? 'message ok' : 'message';
  el.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { el.hidden = true; }, 5000);
}

const formatPln = (cents) => (cents / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });

function parseAmount(text) {
  const normalized = String(text).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && state.token) {
    logout();
    throw new Error('Sesja wygasła – zaloguj się ponownie');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Błąd ${res.status}`);
  return data;
}

// Tworzy element z tekstem (textContent chroni przed wstrzyknięciem HTML).
function el(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

// ---------- widoki ----------
function render() {
  const loggedIn = Boolean(state.token);
  $('#auth-view').hidden = loggedIn;
  $('#app-view').hidden = !loggedIn;
  $('#whoami').hidden = !loggedIn;
  if (loggedIn) $('[data-testid="current-user"]').textContent = `${state.user.name} (${state.user.email})`;
}

function renderGroups() {
  const list = $('#group-list');
  list.replaceChildren();
  if (state.groups.length === 0) list.append(el('li', 'Brak grup – utwórz pierwszą.', { class: 'muted' }));
  for (const g of state.groups) {
    const li = el('li', g.name);
    if (state.group?.id === g.id) li.classList.add('active');
    li.addEventListener('click', () => openGroup(g.id));
    list.append(li);
  }
}

function memberName(id) {
  return state.group.members.find((m) => m.userId === id)?.name ?? `#${id}`;
}

async function renderGroup() {
  const g = state.group;
  $('#group-view').hidden = !g;
  if (!g) return;
  const isOwner = g.ownerId === state.user.id;
  $('#group-name').textContent = g.name;
  $('#owner-actions').hidden = !isOwner;
  $('#member-form').hidden = !isOwner;

  $('#member-list').replaceChildren(...g.members.map((m) => el('li', m.name)));

  const select = $('#expense-form select[name="paidBy"]');
  const previous = select.value;
  select.replaceChildren(...g.members.map((m) => el('option', m.name, { value: m.userId })));
  select.value = previous && g.members.some((m) => String(m.userId) === previous) ? previous : state.user.id;

  const [expenses, settlement] = await Promise.all([
    api(`/groups/${g.id}/expenses`),
    api(`/groups/${g.id}/balances`),
  ]);

  const rows = expenses.map((e) => {
    const tr = el('tr', undefined, { 'data-testid': 'expense-row' });
    tr.append(el('td', e.description), el('td', formatPln(e.amountCents)), el('td', memberName(e.paidBy)));
    const actions = el('td');
    const edit = el('button', 'Edytuj', { type: 'button', class: 'link' });
    edit.addEventListener('click', () => startEdit(e));
    const del = el('button', 'Usuń', { type: 'button', class: 'link danger' });
    del.addEventListener('click', () => deleteExpense(e.id));
    actions.append(edit, del);
    tr.append(actions);
    return tr;
  });
  if (rows.length === 0) {
    const tr = el('tr');
    tr.append(el('td', 'Brak wydatków.', { colspan: 4, class: 'muted' }));
    rows.push(tr);
  }
  $('#expense-list').replaceChildren(...rows);

  const transfers = settlement.transfers.map((t) =>
    el('li', `${memberName(t.from)} → ${memberName(t.to)}: ${formatPln(t.amountCents)}`));
  if (transfers.length === 0) transfers.push(el('li', 'Wszyscy są rozliczeni.', { class: 'muted' }));
  $('#transfer-list').replaceChildren(...transfers);
}

// ---------- akcje ----------
async function loadGroups() {
  state.groups = await api('/groups');
  renderGroups();
}

async function openGroup(id) {
  try {
    state.group = await api(`/groups/${id}`);
    resetExpenseForm();
    renderGroups();
    await renderGroup();
  } catch (err) { showMessage(err.message); }
}

function logout() {
  Object.assign(state, { token: null, user: null, groups: [], group: null });
  save();
  render();
}

function startEdit(expense) {
  state.editingId = expense.id;
  const form = $('#expense-form');
  form.description.value = expense.description;
  form.amount.value = (expense.amountCents / 100).toFixed(2).replace('.', ',');
  form.paidBy.value = expense.paidBy;
  $('#expense-form-title').textContent = 'Edytuj wydatek';
  $('#cancel-edit').hidden = false;
  form.description.focus();
}

function resetExpenseForm() {
  state.editingId = null;
  $('#expense-form').reset();
  $('#expense-form-title').textContent = 'Dodaj wydatek';
  $('#cancel-edit').hidden = true;
}

async function deleteExpense(id) {
  try {
    await api(`/groups/${state.group.id}/expenses/${id}`, { method: 'DELETE' });
    if (state.editingId === id) resetExpenseForm();
    await renderGroup();
  } catch (err) { showMessage(err.message); }
}

async function afterLogin(data) {
  state.token = data.token;
  state.user = data.user;
  save();
  render();
  await loadGroups();
}

// ---------- obsługa formularzy ----------
function onSubmit(selector, handler) {
  $(selector).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try { await handler(form); } catch (err) { showMessage(err.message); } finally { button.disabled = false; }
  });
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  $('#login-form').hidden = tab.dataset.tab !== 'login';
  $('#register-form').hidden = tab.dataset.tab !== 'register';
}));

onSubmit('#login-form', async (form) => {
  const data = await api('/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
  form.reset();
  await afterLogin(data);
});

onSubmit('#register-form', async (form) => {
  const body = { name: form.name.value, email: form.email.value, password: form.password.value };
  await api('/auth/register', { method: 'POST', body });
  const data = await api('/auth/login', { method: 'POST', body: { email: body.email, password: body.password } });
  form.reset();
  await afterLogin(data);
  showMessage('Konto utworzone. Witaj!', true);
});

onSubmit('#group-form', async (form) => {
  const group = await api('/groups', { method: 'POST', body: { name: form.name.value } });
  form.reset();
  await loadGroups();
  await openGroup(group.id);
});

onSubmit('#member-form', async (form) => {
  state.group = await api(`/groups/${state.group.id}/members`, { method: 'POST', body: { email: form.email.value } });
  form.reset();
  await renderGroup();
});

onSubmit('#expense-form', async (form) => {
  const amountCents = parseAmount(form.amount.value);
  if (!amountCents) throw new Error('Podaj kwotę, np. 49,99');
  const body = { description: form.description.value, amountCents, paidBy: Number(form.paidBy.value) };
  const base = `/groups/${state.group.id}/expenses`;
  if (state.editingId) await api(`${base}/${state.editingId}`, { method: 'PUT', body });
  else await api(base, { method: 'POST', body });
  resetExpenseForm();
  await renderGroup();
});

$('#cancel-edit').addEventListener('click', resetExpenseForm);
$('#logout').addEventListener('click', logout);

$('#rename-group').addEventListener('click', async () => {
  const name = prompt('Nowa nazwa grupy', state.group.name);
  if (!name) return;
  try {
    state.group = await api(`/groups/${state.group.id}`, { method: 'PUT', body: { name } });
    await loadGroups();
    await renderGroup();
  } catch (err) { showMessage(err.message); }
});

$('#delete-group').addEventListener('click', async () => {
  if (!confirm(`Usunąć grupę „${state.group.name}” razem z wydatkami?`)) return;
  try {
    await api(`/groups/${state.group.id}`, { method: 'DELETE' });
    state.group = null;
    await loadGroups();
    await renderGroup();
  } catch (err) { showMessage(err.message); }
});

// ---------- start ----------
load();
render();
if (state.token) loadGroups().catch((err) => showMessage(err.message));
