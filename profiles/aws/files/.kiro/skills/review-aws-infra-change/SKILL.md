---
name: review-aws-infra-change
description: Review an AWS infrastructure change (CDK, CloudFormation, Terraform) for replacement and data-loss risk, IAM scope, network exposure, encryption, logging, cost, and rollback, working from repository files without AWS credentials. Use before merging infrastructure changes.
---

# Review an AWS infrastructure change

Use this on a diff that touches infrastructure code. It works from files in the repository. It does not need AWS access, and it does not call any AWS API.

## Evidence to inspect

1. The diff of infrastructure code, plus any synthesized template or plan output that is committed or that the developer supplies.
2. Resources that are added, removed, or whose logical ID, name, or immutable property changed. These can mean replacement.
3. IAM policies, trust policies, and resource policies: actions, resources, conditions, principals.
4. Network: security groups, subnets, route tables, public endpoints, load balancer listeners, VPC endpoints.
5. Data stores and queues: encryption settings, retention, removal policy, backups, deletion protection.
6. Logging, metrics, and alarms for the changed resources.
7. Parameters, context values, and environment configuration the change reads.
8. Anything that scales with usage: NAT gateways, provisioned capacity, data transfer, log volume.

## Verify

- Replacement and data loss: any stateful resource that is replaced or deleted, and whether its removal policy keeps the data.
- IAM: no wildcard actions or resources without a stated reason, no principal wider than needed, conditions where they apply.
- Exposure: nothing becomes reachable from the internet unless the task asks for it.
- Encryption and logging are on for new resources, or the omission is justified.
- No account IDs, Regions, ARNs, or secrets are hard-coded.
- Rollback: describe how to undo the change and what cannot be undone.
- If synth, lint, or diff output was not available, say so and mark conclusions that depend on it as unverified.

## Report

- Summary of what the change does to the deployed environment.
- Findings grouped as blocking, should fix, and note. Each with file and line.
- Replacement and data-loss risks.
- IAM and exposure changes.
- Cost drivers added or changed.
- Rollback plan.
- Checks run and checks not run, with reasons.
