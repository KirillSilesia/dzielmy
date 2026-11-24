// Dwie implementacje tego samego interfejsu: pamięciowa (testy) i PostgreSQL (produkcja).

function createMemoryStore() {
  let groups = [];
  let expenses = [];
  let nextGroupId = 1;
  let nextExpenseId = 1;
  const copy = (g) => g && { ...g, members: g.members.map((m) => ({ ...m })) };
  return {
    async init() {},
    async createGroup({ name, owner }) {
      const group = { id: nextGroupId++, name, ownerId: owner.id, members: [{ userId: owner.id, name: owner.name }] };
      groups.push(group);
      return copy(group);
    },
    async listGroupsForUser(userId) {
      return groups.filter((g) => g.members.some((m) => m.userId === userId)).map(copy);
    },
    async getGroup(id) {
      return copy(groups.find((g) => g.id === id)) || null;
    },
    async updateGroup(id, { name }) {
      const group = groups.find((g) => g.id === id);
      group.name = name;
      return copy(group);
    },
    async deleteGroup(id) {
      groups = groups.filter((g) => g.id !== id);
      expenses = expenses.filter((e) => e.groupId !== id);
    },
    async addMember(groupId, member) {
      const group = groups.find((g) => g.id === groupId);
      if (!group.members.some((m) => m.userId === member.userId)) group.members.push({ ...member });
      return copy(group);
    },
    async createExpense(data) {
      const expense = { id: nextExpenseId++, ...data };
      expenses.push(expense);
      return { ...expense };
    },
    async listExpenses(groupId) {
      return expenses.filter((e) => e.groupId === groupId).map((e) => ({ ...e }));
    },
    async getExpense(id) {
      const e = expenses.find((x) => x.id === id);
      return e ? { ...e } : null;
    },
    async updateExpense(id, data) {
      const e = expenses.find((x) => x.id === id);
      Object.assign(e, data);
      return { ...e };
    },
    async deleteExpense(id) {
      expenses = expenses.filter((e) => e.id !== id);
    },
  };
}

function createPgStore(pool) {
  const mapExpense = (r) => r && {
    id: r.id, groupId: r.group_id, description: r.description, amountCents: r.amount_cents, paidBy: r.paid_by,
  };
  async function getGroup(id) {
    const { rows } = await pool.query('SELECT * FROM expenses.groups WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const members = await pool.query(
      'SELECT user_id, name FROM expenses.group_members WHERE group_id = $1 ORDER BY user_id', [id]
    );
    return {
      id: rows[0].id,
      name: rows[0].name,
      ownerId: rows[0].owner_id,
      members: members.rows.map((m) => ({ userId: m.user_id, name: m.name })),
    };
  }
  return {
    async init() {
      await pool.query(`
        CREATE SCHEMA IF NOT EXISTS expenses;
        CREATE TABLE IF NOT EXISTS expenses.groups (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          owner_id INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS expenses.group_members (
          group_id INTEGER NOT NULL REFERENCES expenses.groups(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          PRIMARY KEY (group_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS expenses.expenses (
          id SERIAL PRIMARY KEY,
          group_id INTEGER NOT NULL REFERENCES expenses.groups(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          paid_by INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );`);
    },
    async createGroup({ name, owner }) {
      const { rows } = await pool.query(
        'INSERT INTO expenses.groups (name, owner_id) VALUES ($1, $2) RETURNING id', [name, owner.id]
      );
      await pool.query(
        'INSERT INTO expenses.group_members (group_id, user_id, name) VALUES ($1, $2, $3)',
        [rows[0].id, owner.id, owner.name]
      );
      return getGroup(rows[0].id);
    },
    async listGroupsForUser(userId) {
      const { rows } = await pool.query(
        'SELECT group_id FROM expenses.group_members WHERE user_id = $1 ORDER BY group_id', [userId]
      );
      return Promise.all(rows.map((r) => getGroup(r.group_id)));
    },
    getGroup,
    async updateGroup(id, { name }) {
      await pool.query('UPDATE expenses.groups SET name = $1 WHERE id = $2', [name, id]);
      return getGroup(id);
    },
    async deleteGroup(id) {
      await pool.query('DELETE FROM expenses.groups WHERE id = $1', [id]);
    },
    async addMember(groupId, { userId, name }) {
      await pool.query(
        `INSERT INTO expenses.group_members (group_id, user_id, name) VALUES ($1, $2, $3)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, userId, name]
      );
      return getGroup(groupId);
    },
    async createExpense({ groupId, description, amountCents, paidBy }) {
      const { rows } = await pool.query(
        `INSERT INTO expenses.expenses (group_id, description, amount_cents, paid_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [groupId, description, amountCents, paidBy]
      );
      return mapExpense(rows[0]);
    },
    async listExpenses(groupId) {
      const { rows } = await pool.query(
        'SELECT * FROM expenses.expenses WHERE group_id = $1 ORDER BY id', [groupId]
      );
      return rows.map(mapExpense);
    },
    async getExpense(id) {
      const { rows } = await pool.query('SELECT * FROM expenses.expenses WHERE id = $1', [id]);
      return mapExpense(rows[0]) || null;
    },
    async updateExpense(id, { description, amountCents, paidBy }) {
      const { rows } = await pool.query(
        `UPDATE expenses.expenses SET description = $1, amount_cents = $2, paid_by = $3
         WHERE id = $4 RETURNING *`,
        [description, amountCents, paidBy, id]
      );
      return mapExpense(rows[0]);
    },
    async deleteExpense(id) {
      await pool.query('DELETE FROM expenses.expenses WHERE id = $1', [id]);
    },
  };
}

module.exports = { createMemoryStore, createPgStore };
