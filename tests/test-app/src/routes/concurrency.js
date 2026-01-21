const router = require("express").Router();
const {
  raceDemo,
  sharedStateDemo,
  parallelAll,
  unawaitedAsync,
  deadlockDemo,
  sharedMutableState,
  promiseRejectionHandling,
} = require("../services/concurrencyService");

// Original demos
router.get("/race", raceDemo);
router.get("/shared", sharedStateDemo);
router.get("/parallel", parallelAll);

// Real concurrency bug scenarios
router.post("/unawaited-async", unawaitedAsync);
router.post("/deadlock", deadlockDemo);
router.post("/shared-mutable", sharedMutableState);
router.get("/promise-rejection", promiseRejectionHandling);

module.exports = router;
