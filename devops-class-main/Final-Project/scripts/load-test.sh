#!/usr/bin/env bash
# Generates CPU load on the CareSlot backend so the HPA scales it out.
#
#   ./scripts/load-test.sh            # 3 minutes, 20 parallel workers
#   ./scripts/load-test.sh 300 40     # 5 minutes, 40 workers
#
# Watch in a second terminal:
#   kubectl get hpa -n careslot -w
#   kubectl get pods -n careslot -l app.kubernetes.io/name=backend -w
#
# The load runs INSIDE the cluster (a temporary busybox Pod hitting the backend
# Service), so it works the same on minikube and EKS and needs no Ingress.
set -euo pipefail

DURATION="${1:-180}"
WORKERS="${2:-20}"
NAMESPACE="${NAMESPACE:-careslot}"
TARGET="http://careslot-backend.${NAMESPACE}.svc.cluster.local:8000/api/stats"

cleanup() { kubectl delete pod careslot-load -n "$NAMESPACE" --ignore-not-found --wait=false >/dev/null; }
trap cleanup EXIT

echo "Load test: ${WORKERS} workers for ${DURATION}s against ${TARGET}"
# The Pod spec satisfies the namespace's "restricted" Pod Security level.
kubectl apply -n "$NAMESPACE" -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: careslot-load
  labels: {app.kubernetes.io/name: load-generator}
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: load
      image: busybox:1.37
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: {drop: ["ALL"]}
      resources:
        requests: {cpu: 100m, memory: 32Mi}
      command:
        - sh
        - -c
        - |
          end=\$((\$(date +%s) + ${DURATION}))
          for i in \$(seq 1 ${WORKERS}); do
            ( while [ \$(date +%s) -lt \$end ]; do wget -q -O /dev/null ${TARGET}; done ) &
          done
          wait
          echo "load finished"
EOF

kubectl wait --for=condition=Ready pod/careslot-load -n "$NAMESPACE" --timeout=120s >/dev/null
kubectl logs -f careslot-load -n "$NAMESPACE"
echo "Done. The HPA scales back down to the minimum after its stabilization window."
