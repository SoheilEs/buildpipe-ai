# Use Cases

> Describes the inherited BuildPipe AI base (incidents, AI analysis, MCP). Those features are legacy; the Infralark workflow is in [product/infralark-mvp.md](product/infralark-mvp.md).

This document describes who uses Infralark, what problems it solves, and detailed workflows for common operational scenarios.

---

## Target Users and Personas

### Platform Engineer / SRE (Operator)

**Goals:** Respond to production incidents quickly, gather K8s context, get AI-assisted root-cause hypotheses.

**Uses Infralark to:**

- Register and test cluster connections
- Create incidents when alerts fire
- Trigger AI analysis with enriched pod/event/log context
- Restart deployments after verification (with OTP approval)
- Track incident resolution and recurring patterns

### Engineering Manager / Admin

**Goals:** Oversight, access control, compliance.

**Uses Infralark to:**

- Manage user accounts and roles
- Review audit logs for sensitive operations
- Monitor platform health via metrics and readiness endpoints

### Viewer / On-Call Read-Only

**Goals:** Visibility without making changes.

**Uses Infralark to:**

- List clusters and incidents
- Browse Kubernetes resources (pods, logs, events)
- Follow real-time updates via WebSocket

### AI Agent / Automation (MCP)

**Goals:** Programmatic cluster inspection and incident analysis.

**Uses Infralark via MCP tools to:**

- Fetch pod status and logs during automated triage
- Trigger analysis from external runbooks
- Restart deployments with OTP (human-in-the-loop)

---

## Use Case 1: Onboarding a Kubernetes Cluster

### Scenario

A platform team wants to connect their production EKS cluster to Infralark for incident tracking.

### Preconditions

- Operator account (or admin)
- Valid kubeconfig with sufficient RBAC
- OTP flow available (dev mode returns code in API response)

### Steps

1. Request OTP: POST /auth/otp/request with purpose cluster_register
2. Register cluster: POST /clusters with name, kubeconfig, context, and otp
3. Verify connectivity: POST /clusters/{id}/test

### Outcome

- Kubeconfig encrypted and stored
- cluster.connected.v1 NATS event published
- Audit log: CLUSTER_CREATED

### Business Value

Centralized, encrypted credential storage with audit trail.

---

## Use Case 2: Responding to a Pod Crash Loop

### Scenario

Alertmanager fires on CrashLoopBackOff for payment-service in production namespace.

### Workflow

1. Operator creates incident via POST /incidents
2. System enqueues enrichment job
3. Worker/API gathers pod status, events, and logs
4. AI analysis produces root cause, evidence, and recommendations
5. Operator fixes issue and resolves incident
6. Pattern signature updated for future similar incidents

### Business Value

Structured incident record with AI-assisted triage, reducing mean-time-to-diagnosis.

---

## Use Case 3: OOMKilled Investigation

### Scenario

A Java service is killed by the OOM killer.

### Why Infralark Helps

The event scorer assigns 0.95 confidence to OOMKilled events, prioritizing them in the AI context bundle.

### Workflow

1. Create incident with resource metadata
2. System collects termination reason, memory limits, and logs
3. AI recommends limit changes, heap dumps, or deploy checks
4. Operator resolves; pattern stored for recurrence tracking

---

## Use Case 4: Controlled Deployment Restart

### Scenario

Operator needs to restart a deployment after deploying a fix.

### Security Controls

- Requires operator role
- Requires OTP with purpose deployment_restart
- Logged in audit trail

### Steps

1. POST /auth/otp/request with purpose deployment_restart
2. POST /clusters/{id}/kubernetes/deployments/restart with namespace, name, otp
3. System performs rollout restart and publishes deployment.restarted.v1

---

## Use Case 5: Recurring Incident Pattern Detection

On resolve, the API upserts IncidentPattern records (frequency, avgConfidence, lastSeenAt). Future analyses include historical pattern context in the AI prompt.

---

## Use Case 6: AI Agent Triage via MCP

MCP tools: get_pods, get_logs, get_events, analyze_incident, cluster_health, restart_deployment.

Run MCP server with MCP_JWT_TOKEN and API_INTERNAL_URL, then connect your MCP client.

---

## Use Case 7: OAuth-Based Team Access

GitHub or Google OAuth creates viewer-role users by default. Admins promote to operator as needed.

---

## Use Case 8: Real-Time Incident Dashboard

External frontends connect to WebSocket /ws with JWT and listen for incident.created, incident.updated, incident.analyzed events.

---

## Use Case 9: Periodic Cluster Health Monitoring

Worker runs cluster-health-scan every 5 minutes across registered clusters.

---

## Use Case 10: Compliance Audit Review

Admins use GET /audit/logs to review DEPLOYMENT_RESTARTED, CLUSTER_CREATED, OTP_VERIFIED, and other sensitive actions.

---

## Incident Status Reference

| Status | Meaning |
|--------|---------|
| CREATED | Incident filed |
| ENRICHING | Gathering K8s context |
| ANALYZING | AI analysis in progress |
| ANALYZED | Analysis complete |
| RESOLVED | Incident closed |

---

## When Not to Use Infralark

- Simple one-off kubectl debugging
- Full ITSM replacement
- Multi-tenant SaaS without customization
- GitOps-driven deployments

Integrate Infralark as one component in a broader toolchain.