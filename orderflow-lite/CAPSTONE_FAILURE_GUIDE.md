# Capstone Failure Guide — ConfigMap Key Mismatch (TRAINER-ONLY)

**Do not share this file with trainees before the lab.** It documents the
exact seeded bug on the `capstone-seeded-failure` branch, how to diagnose
it, and the fix — reading it in advance defeats the exercise.

## What was changed

Single commit, single line, on branch `capstone-seeded-failure`:

```diff
- WORKER_POLL_INTERVAL_MS: "5000"
+ WORKER_POLLING_INTERVAL_MS: "5000"
```

in [`k8s/configmap.yaml`](k8s/configmap.yaml). Nothing else on the branch
was touched.

`src/index.js` reads the poll interval like this:

```js
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 5000;
```

Because the ConfigMap key is now `WORKER_POLLING_INTERVAL_MS`, the process
never sees a `WORKER_POLL_INTERVAL_MS` environment variable at all.
`Number(undefined)` is `NaN`, which is falsy, so the `|| 5000` fallback
silently kicks in every time — regardless of what value is set under the
misspelled key.

## Important: read this before running the lab

**With the value currently committed (`"5000"`), this bug produces zero
observable difference in behavior.** The code's fallback default is also
`5000`, so the worker polls every 5 seconds whether the key is spelled
correctly or not. I verified this directly (`node -e` reproduction, see
below) — the effective interval is `5000` regardless of the ConfigMap
value, because the env var the app is looking for simply never arrives.

This means: **orders do not get stuck, and `order_events` does not stop
after `"created"`.** The worker keeps running normally, picks up pending
orders every 5 seconds, and writes the full `processing_started` →
`completed`/`failed` event trail exactly as it would with the key spelled
correctly. If your lab plan assumes trainees will see orders stuck in
`pending` forever, that symptom belongs to the *other* seed variant
discussed for this lab (pointing `DB_NAME` at a nonexistent database,
which breaks DB connectivity entirely and is a much louder, more obvious
failure) — not this one. This branch intentionally implements the subtler
variant instead, per instruction.

**To make the drift observable for a lab exercise**, have trainees do the
following themselves (this is the actual diagnostic exercise, not
something to pre-apply):

1. Edit `k8s/configmap.yaml` and change the (misspelled) key's value to
   something obviously different from 5 seconds, e.g. `"60000"` (intent:
   "poll once a minute").
2. `kubectl apply -f k8s/configmap.yaml`
3. `kubectl rollout restart deployment/orderflow-lite` (ConfigMap changes
   don't propagate to already-running pods without a restart)
4. Observe: orders **still** get picked up every ~5 seconds, not every 60.
   The configured value never took effect. That non-effect — a config
   change that is accepted (`kubectl apply` succeeds, no error anywhere)
   but silently ignored by the running app — is the actual lesson.

Reproduction used to confirm this, run from `orderflow-lite/`:

```bash
WORKER_POLLING_INTERVAL_MS=60000 node -e "
  const v = Number(process.env.WORKER_POLL_INTERVAL_MS) || 5000;
  console.log('effective interval:', v, 'ms');
"
# effective interval: 5000 ms  — the 60000 is never read
```

## Diagnostic path

### 1. `kubectl logs deployment/orderflow-lite`

**What will *not* be obvious**: the worker's own startup log line —

```
[worker] starting order processing worker, polling every 5000ms
```

— looks completely normal. There's no error, no warning, nothing to
distinguish "5000 because the ConfigMap correctly said so" from "5000
because the ConfigMap key was wrong and this is the hardcoded fallback."
This is the crux of why the bug is silent: the one place a trainee would
naturally look first (application logs) actively looks healthy.

**What *is* visible in logs, if you know to look**: nothing pointing at
this specific bug. Order processing logs (`processing_started`, outcome
lines) will appear on the normal healthy cadence — again, indistinguishable
from correct behavior, because in this variant, processing genuinely *is*
happening correctly. Logs alone will not surface this bug — that's the
point of picking this seed over a crash-on-boot variant.

### 2. `kubectl describe configmap orderflow-config`

This is where the mismatch becomes visible, if you're comparing the right
things:

```
Data
====
DB_HOST:
----
mysql
DB_NAME:
----
orderflow
...
WORKER_POLLING_INTERVAL_MS:
----
5000
```

Note the key is `WORKER_POLLING_INTERVAL_MS` — a trainee has to actually
notice "polling" vs. "poll" here; nothing highlights it.

### 3. Compare the ConfigMap against the source of truth

Two places name the *correct* key:

- [`.env.example`](.env.example) — documents `WORKER_POLL_INTERVAL_MS` as
  the env var the app expects.
- [`src/index.js`](src/index.js) — line 5, `process.env.WORKER_POLL_INTERVAL_MS`.
  (Note: `src/worker/processOrders.js` does *not* read this env var itself
  — it receives the already-resolved interval as a parameter from
  `startOrderProcessingWorker(pollIntervalMs)`, called once from
  `src/index.js`. A trainee grepping only `processOrders.js` for
  `WORKER_POLL` will find nothing at all, which is a useful dead-end to
  let them hit before pointing them at `index.js`.)

Diffing `k8s/configmap.yaml`'s key name against either of those two files
is the fastest way to spot the typo — `grep -n WORKER_POLL` across the repo
surfaces every correct usage and the one ConfigMap that doesn't match:

```bash
grep -rn "WORKER_POLL" --include="*.js" --include="*.yaml" --include=".env.example" .
```

## Expected symptom (as actually seeded on this branch)

- No crash, no CrashLoopBackOff, no failed readiness/liveness probes.
- `kubectl logs` looks entirely healthy.
- Orders **do** progress normally through `pending` → `completed`/`failed`,
  with a full `order_events` trail, on the default 5-second cadence.
- The *only* symptom is: **changing `WORKER_POLLING_INTERVAL_MS` in the
  ConfigMap and reapplying has no effect on the app's actual polling
  cadence.** A trainee who tries to tune the poll interval for a demo (see
  the "make the drift observable" steps above) will find their change is
  silently ignored, with no error anywhere to explain why.

## One-line fix

In `k8s/configmap.yaml`:

```diff
- WORKER_POLLING_INTERVAL_MS: "5000"
+ WORKER_POLL_INTERVAL_MS: "5000"
```

Then `kubectl apply -f k8s/configmap.yaml` and `kubectl rollout restart
deployment/orderflow-lite` to pick up the corrected key.
