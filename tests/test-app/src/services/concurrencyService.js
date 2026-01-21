let sharedCounter = 0;
let userBalances = new Map();
let cache = new Map();
let locks = new Map();

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function raceDemo(req, res) {
  const a = delay(100).then(() => "A");
  const b = delay(50).then(() => "B");
  const winner = await Promise.race([a, b]);
  res.json({ winner });
}

async function sharedStateDemo(req, res) {
  const before = sharedCounter;
  await delay(Math.random() * 100);
  sharedCounter = before + 1;
  res.json({ before, after: sharedCounter });
}

async function parallelAll(req, res) {
  try {
    const results = await Promise.all([
      delay(20).then(() => "ok1"),
      delay(30).then(() => "ok2"),
      delay(10).then(() => "ok3"),
    ]);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function unawaitedAsync(req, res) {
  const { userId = "user1", amount = -50, price = 40 } = req.body || {};
  const before = userBalances.get(userId) || 100;
  userBalances.set(userId, before);

  const newBalance = updateUserBalance(userId, amount);

  if (typeof newBalance !== "number") {
    throw new Error(
      "async dependency not resolved: expected numeric balance, got Promise"
    );
  }

  const willOverdraft = newBalance < 0;
  const confirmOrder = !willOverdraft && price <= 50;

  await delay(20);
  const observedBalance = userBalances.get(userId) || 0;

  res.json({
    userId,
    before,
    debit: amount,
    willOverdraft,
    confirmOrder,
    observedBalance,
  });
}

async function updateUserBalance(userId, amount) {
  await delay(100);
  const current = userBalances.get(userId) || 0;
  const next = current + amount;
  userBalances.set(userId, next);
  return next;
}

async function deadlockDemo(req, res) {
  const { userId1, userId2 } = req.body || {
    userId1: "user1",
    userId2: "user2",
  };

  await Promise.all([
    (async () => {
      const release1 = await acquireLock(userId1);
      await delay(50);
      try {
        await acquireLock(userId2);
      } finally {
        release1();
      }
    })(),
    (async () => {
      const release2 = await acquireLock(userId2);
      await delay(50);
      try {
        await acquireLock(userId1);
      } finally {
        release2();
      }
    })(),
  ]);

  res.json({
    message: "Locks acquired without contention (unexpected in demo)",
  });
}

async function acquireLock(resource) {
  if (locks.get(resource)) {
    throw new Error(`Resource ${resource} is locked`);
  }
  locks.set(resource, true);
  return () => {
    locks.set(resource, false);
  };
}

async function sharedMutableState(req, res) {
  const { userId } = req.body || { userId: "user1" };

  const user = { id: userId, balance: 100, transactions: [] };

  const promises = [
    addTransaction(user, 50),
    addTransaction(user, -30),
    addTransaction(user, 20),
  ];

  await Promise.all(promises);

  res.json({ user });
}

async function addTransaction(user, amount) {
  await delay(Math.random() * 20);
  user.balance += amount;
  user.transactions.push({ amount, timestamp: Date.now() });
}

async function promiseRejectionHandling(req, res) {
  const {
    useAllSettled = false,
    unhandled = false,
    strict = false,
  } = req.query;

  if (unhandled === "true") {
    setTimeout(() => {
      Promise.reject(new Error("unhandled async rejection"));
    }, 10);
  }

  const promises = [
    delay(10).then(() => "success1"),
    delay(20).then(() => {
      throw new Error("failure");
    }),
    delay(15).then(() => "success2"),
  ];

  if (useAllSettled === "true") {
    const results = await Promise.allSettled(promises);
    return res.json({ results, mode: "allSettled" });
  }

  if (strict === "true") {
    await Promise.all(promises);
    return res.json({ results: "unexpected success", mode: "all-strict" });
  }

  try {
    const results = await Promise.all(promises);
    return res.json({ results, mode: "all" });
  } catch (e) {
    return res.json({ error: e.message, mode: "all-swallowed" });
  }
}

module.exports = {
  raceDemo,
  sharedStateDemo,
  parallelAll,
  unawaitedAsync,
  deadlockDemo,
  sharedMutableState,
  promiseRejectionHandling,
};
