# OrderFlow-Lite on Kubernetes (kind / Minikube)

Manifests for running OrderFlow-Lite on a local single-node kind or
Minikube cluster. Not production-hardened — see the tradeoff notes in
`mysql.yaml` and `service.yaml` for what's deliberately simplified and why.

## Files

| File | Purpose |
|---|---|
| `configmap.yaml` | Non-secret app/DB config (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `PORT`, `WORKER_POLL_INTERVAL_MS`) |
| `secret.yaml` | Placeholder credentials (`DB_PASSWORD`, `API_KEY`, `MYSQL_ROOT_PASSWORD`) — **replace before using outside this training course** |
| `mysql.yaml` | MySQL Deployment + PVC + ClusterIP Service, with `sql/init.sql` mounted as an init script |
| `deployment.yaml` | OrderFlow-Lite Deployment, 2 replicas |
| `service.yaml` | NodePort Service exposing the app |

## Build and load the image

The app image is built locally, not pulled from a registry, so the cluster
needs it loaded before the Deployment can start.

```bash
# from the orderflow-lite/ repo root
docker build -t orderflow-lite:local .

# kind:
kind load docker-image orderflow-lite:local

# Minikube (either approach):
minikube image load orderflow-lite:local
# — or, build directly into Minikube's Docker daemon instead of loading after:
# eval $(minikube docker-env)
# docker build -t orderflow-lite:local .
```

## Apply order

MySQL must be up and have run its init script **before** the app's
readiness probe (`/ready`, which checks DB connectivity) will pass. Apply
config and MySQL first, wait for it to be ready, then apply the app:

```bash
kubectl apply -f k8s/configmap.yaml -f k8s/secret.yaml
kubectl apply -f k8s/mysql.yaml

# wait for the MySQL pod to be Ready (readiness probe = mysqladmin ping)
kubectl rollout status deployment/mysql

kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl rollout status deployment/orderflow-lite
```

Applying everything at once (`kubectl apply -f k8s/`) also works — the
app's `readinessProbe` on `/ready` will just keep failing and Kubernetes
will hold it out of the Service's endpoints until MySQL and the schema
init script have finished. It just takes a bit longer to become reachable
and produces more transient "not ready" noise while you wait, so applying
MySQL first is the cleaner path for a live demo.

## Reaching the service

**kind**: kind's default network setup does not expose NodePorts on
`localhost` automatically unless the cluster was created with `extraPortMappings`. The simplest path on kind is `port-forward`:

```bash
kubectl port-forward svc/orderflow-lite 3000:3000
curl -H "x-api-key: changeme-api-key" http://localhost:3000/orders
```

**Minikube**: Minikube can resolve the NodePort directly via its own IP, or
open a local tunnel for you:

```bash
minikube service orderflow-lite --url
# then curl the printed URL, e.g.:
curl -H "x-api-key: changeme-api-key" http://192.168.49.2:30080/orders
```

## Verifying the Service selector matches

`service.yaml`'s selector (`app: orderflow-lite`) must match
`deployment.yaml`'s pod template labels (also `app: orderflow-lite`) — this
version of the manifests does match. Confirm at any time with:

```bash
kubectl get endpoints orderflow-lite
# should list 2 pod IPs:3000 once the Deployment's pods are Ready — an
# empty ENDPOINTS column with a healthy Deployment is the classic symptom
# of a selector/label mismatch.
```

## Discussion point: one worker loop per replica

`deployment.yaml` runs **2 replicas** of OrderFlow-Lite, and each replica
independently starts its own `setInterval` background worker loop
(`src/worker/processOrders.js`) on boot — there is no leader election or
locking between replicas. With 2 replicas polling the same `orders` table
on the same interval, both pods will regularly race to pick up the same
batch of pending orders.

This isn't something to fix as part of standing up these manifests — it's
flagged here deliberately as a discussion point for the architecture-review
module: what actually happens when two workers grab the same pending order
(hint: there's no row locking in the current `SELECT ... WHERE status =
'pending'` query), what a fix might look like (e.g. `SELECT ... FOR UPDATE
SKIP LOCKED`, a dedicated worker Deployment separate from the API replicas,
a leader-election sidecar, or an external queue), and what tradeoffs each
option brings for a service that's meant to also demonstrate horizontal
scaling of the API itself.
